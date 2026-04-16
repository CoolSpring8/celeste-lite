import Phaser from "phaser";
import { COLORS, PLAYER_CONFIG, VIEWPORT, WORLD } from "./constants";
import { EntityWorld, spikeTriangles } from "./entities/EntityWorld";
import { Grid } from "./entities/core/Grid";
import { Hitbox } from "./entities/core/Hitbox";
import { type RefillPickupEntity } from "./entities/runtime";
import { CameraKillboxSpec, CameraLockMode, RefillType } from "./entities/types";
import { TILE_JUMP_THROUGH, tileAt } from "./grid";
import {
  findAdjacentRoom,
  findRoomAtPoint,
  type LevelRoom,
  parseLevel,
  type RoomDirection,
} from "./level";
import { PlayerControls } from "./input/PlayerControls";
import { loadGameOptions, saveGameOptions, type GameOptions } from "./options";
import {
  currentPauseOptionValue,
  PauseMenuChoice,
  PauseMenuController,
  type PauseActionMenu,
  type PauseMenuOption,
  type PauseOptionsMenu,
} from "./pause/menu";
import { UnpauseRecovery } from "./pause/unpauseRecovery";
import { clampRespawnSource, type PlayerIntroType } from "./player/intro";
import { addFloat, approach, maxFloat, stepTimer, subFloat, toFloat } from "./player/math";
import { Player } from "./player/Player";
import { InputState, PlayerEffect } from "./player/types";
import { PauseOverlay } from "./view/PauseOverlay";
import { PlayerView } from "./view/PlayerView";
import {
  baseTransitionDuration,
  type DeathRespawnSequenceKind,
  shortenedTransitionDuration,
  transitionTimings,
  SPAWN_WIPE_VISUALS,
} from "./view/deathRespawn";
import { LightingSource, LightingSystem } from "./lighting/LightingSystem";

interface RefillView {
  entity: RefillPickupEntity;
  glow: Phaser.GameObjects.Ellipse;
  body: Phaser.GameObjects.Rectangle;
}

interface CameraScrollBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

interface RoomTransitionState {
  from: LevelRoom;
  to: LevelRoom;
  direction: RoomDirection;
  elapsed: number;
  duration: number;
  fromScrollX: number;
  fromScrollY: number;
  toScrollX: number;
  toScrollY: number;
}

interface DeathRespawnSequenceState {
  kind: DeathRespawnSequenceKind;
  elapsed: number;
  totalDuration: number;
  exploded: boolean;
  revealStarted: boolean;
  respawnStarted: boolean;
  respawnSourceX: number;
  respawnSourceY: number;
  knockback:
    | {
      startX: number;
      startY: number;
      endX: number;
      endY: number;
    }
    | null;
}

const CAMERA_SMOOTH_BASE = 0.01;
const CAMERA_SETTLE_EPSILON = 0.75;
const CAMERA_BOOST_UPWARD_MAX_Y_OFFSET = 48;
const CAMERA_FOOT_ANCHOR_Y = Math.round(VIEWPORT.height * 0.46);
const CAMERA_PLAYER_MARGIN_X = 12;
const CAMERA_PLAYER_MARGIN_TOP = 18;
const CAMERA_PLAYER_MARGIN_BOTTOM = 20;
const CAMERA_VERTICAL_VISIBILITY_CATCHUP = 60;
const ROOM_TRANSITION_DURATION = 0.65;
const ROOM_TOP_CLIMB_MARGIN = 8;
const TILE_EDGE_HEIGHT = Math.max(1, Math.round(WORLD.tile * 0.125));
const JUMP_THRU_EDGE_HEIGHT = TILE_EDGE_HEIGHT;
const JUMP_THRU_BODY_HEIGHT = Math.max(1, Math.round(WORLD.tile * 0.1875));
const REFILL_GLOW_SIZE = Math.max(7, Math.round(WORLD.tile * 0.875));
const REFILL_BODY_SIZE = Math.max(4, Math.round(WORLD.tile * 0.5));
const REFILL_CONSUME_FREEZE_TIME = 0.05;
const SPAWN_WIPE_HEIGHT = VIEWPORT.height + SPAWN_WIPE_VISUALS.edgeOverscan * 2;
const DEBUG_HITBOX_COLOR = 0xff0000;
const DEBUG_HURTBOX_COLOR = 0x00ff00;
const EMPTY_INPUT: InputState = {
  x: 0,
  y: 0,
  aimX: 0,
  aimY: 0,
  jump: false,
  jumpPressed: false,
  jumpReleased: false,
  dash: false,
  dashPressed: false,
  grab: false,
};
const ON_OFF_CHOICES: readonly PauseMenuChoice<boolean>[] = [
  { label: "OFF", value: false },
  { label: "ON", value: true },
];

export class GameScene extends Phaser.Scene {
  private player!: Player;
  private playerView!: PlayerView;
  private world!: EntityWorld;
  private rooms: LevelRoom[] = [];
  private currentRoom!: LevelRoom;
  private roomTransition: RoomTransitionState | null = null;
  private spawnX!: number;
  private spawnY!: number;
  private tileDepths!: Int32Array;

  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private controls!: PlayerControls;
  private confirmBufferedFrames = 0;
  private readonly pauseMenu = new PauseMenuController();
  private readonly unpauseRecovery = new UnpauseRecovery();
  private pauseOverlay!: PauseOverlay;
  private gameOptions: GameOptions = loadGameOptions();

  private accumulator = 0;
  private readonly fixedDt = toFloat(1 / 60);
  private readonly maxSteps = 6;
  private freezeTimer = 0;

  private tileGfx!: Phaser.GameObjects.Graphics;
  private debugGfx!: Phaser.GameObjects.Graphics;
  private spawnWipe!: Phaser.GameObjects.Graphics;
  private hudText!: Phaser.GameObjects.Text;
  private refills: RefillView[] = [];
  private refillEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private lighting!: LightingSystem;
  private deathRespawnSequence: DeathRespawnSequenceState | null = null;
  private forceCameraUpdate = false;
  private forceCameraSnapNextFrame = true;
  private debugEnabled = false;

  constructor() {
    super("GameScene");
  }

  create(): void {
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);

    const level = parseLevel();
    this.world = level.world;
    this.rooms = level.rooms;
    this.spawnX = level.spawnX;
    this.spawnY = level.spawnY;
    this.currentRoom = findRoomAtPoint(this.rooms, this.spawnX, this.spawnY) ?? this.rooms[0];

    this.computeTileDepths();
    this.tileGfx = this.add.graphics();
    this.debugGfx = this.add.graphics().setDepth(9);
    this.debugGfx.setVisible(false);
    this.spawnWipe = this.add.graphics().setDepth(20).setScrollFactor(0);
    this.drawTiles();
    this.lighting = new LightingSystem(this, this.world);

    this.player = new Player(this.spawnX, this.spawnY, this.world, PLAYER_CONFIG);
    this.playerView = new PlayerView(this);
    this.playerView.setDynamicHairEnabled(this.gameOptions.dynamicHair);
    this.ensurePixelTexture();
    this.refillEmitter = this.add.particles(0, 0, "pixel", {
      speed: { min: 8, max: 36 },
      angle: { min: 0, max: 360 },
      lifespan: { min: 1200, max: 2400 },
      quantity: 0,
      scale: { start: 0.9, end: 0.05 },
      alpha: { start: 0.45, end: 0 },
      gravityY: 6,
      emitting: false,
      blendMode: "NORMAL",
      tint: COLORS.playerOneDash,
    });
    this.refillEmitter.setDepth(4);
    this.createRefills(this.world.refills);

    const camera = this.cameras.main;
    camera.roundPixels = true;
    camera.setBounds(0, 0, this.world.cols * WORLD.tile, this.world.rows * WORLD.tile);
    this.forceCameraSnap();
    this.updateCamera(this.player.getSnapshot(), 0);

    const kb = this.input.keyboard!;
    this.keys = {
      left: kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      right: kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
      up: kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
      down: kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
      grab: kb.addKey(Phaser.Input.Keyboard.KeyCodes.Z),
      dash: kb.addKey(Phaser.Input.Keyboard.KeyCodes.X),
      jump: kb.addKey(Phaser.Input.Keyboard.KeyCodes.C),
      restart: kb.addKey(Phaser.Input.Keyboard.KeyCodes.R),
    };
    this.controls = new PlayerControls();
    this.keys.jump.on("down", this.onJumpDown, this);
    this.keys.jump.on("up", this.onJumpUp, this);
    this.keys.dash.on("down", this.onDashDown, this);
    this.keys.pause = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.keys.pause.on("down", this.onPauseDown, this);
    this.keys.debug = kb.addKey(Phaser.Input.Keyboard.KeyCodes.BACKTICK);
    this.keys.debug.on("down", this.onDebugToggleDown, this);

    this.hudText = this.add
      .text(8, 8, "", {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#8888bb",
        lineSpacing: -2,
        wordWrap: { width: VIEWPORT.width - 16, useAdvancedWrap: true },
      })
      .setDepth(10)
      .setScrollFactor(0);
    this.hudText.setVisible(false);

    this.pauseOverlay = new PauseOverlay(this);
    this.spawnInitialPlayer();
    const snapshot = this.player.getSnapshot();
    this.playerView.render(snapshot);
    this.renderLighting(snapshot);
    this.updateHUD(snapshot, []);
    this.renderDebugOverlay(snapshot);
    this.renderSpawnWipe();
  }

  update(_time: number, delta: number): void {
    const rawFrameDt = toFloat(Math.min(delta / 1000, 0.1));
    if (this.confirmBufferedFrames > 0) {
      this.confirmBufferedFrames--;
    }

    if (this.pauseMenu.isOpen) {
      this.updatePauseInput();
      const snapshot = this.player.getSnapshot();
      this.playerView.render(snapshot);
      this.renderLighting(snapshot);
      this.updateHUD(snapshot, []);
      this.renderDebugOverlay(snapshot);
      this.renderSpawnWipe();
      const current = this.pauseMenu.current;
      if (current) {
        this.pauseOverlay.render(current);
      } else {
        this.pauseOverlay.hide();
      }
      return;
    }

    this.pauseOverlay.hide();

    let accumulatorPrimed = false;
    if (this.unpauseRecovery.active) {
      accumulatorPrimed = true;
      if (this.advanceUnpauseRecovery(rawFrameDt)) {
        this.renderPassiveFrame();
        return;
      }
    }

    if (this.keys.restart.isDown && this.deathRespawnSequence === null && this.player.canRetry) {
      this.beginNormalRespawn();
    }

    const effects: PlayerEffect[] = [];

    if (this.roomTransition) {
      this.updateRoomTransition(rawFrameDt);
      const snapshot = this.player.getSnapshot();
      this.playerView.render(snapshot);
      this.renderLighting(snapshot);
      this.updateHUD(snapshot, effects);
      this.renderDebugOverlay(snapshot);
      this.clearSpawnWipe();
      return;
    }

    this.playerView.advanceDeathRespawn(rawFrameDt);

    if (this.deathRespawnSequence !== null) {
      this.updateDeathRespawnSequence(rawFrameDt);
      if (this.deathRespawnSequence !== null && this.deathRespawnSequence.respawnStarted) {
        this.advancePlayerOnly(rawFrameDt, effects);
      }
      if (this.deathRespawnSequence !== null) {
        const snapshot = this.player.getSnapshot();
        if (this.forceCameraUpdate || this.deathRespawnSequence.revealStarted) {
          this.updateCamera(snapshot, rawFrameDt);
        }
        this.playerView.render(snapshot);
        this.renderLighting(snapshot);
        this.updateHUD(snapshot, effects);
        this.renderDebugOverlay(snapshot);
        this.renderSpawnWipe();
        return;
      }
    }

    if (this.player.timePaused) {
      this.advancePlayerOnly(rawFrameDt, effects);
      const snapshot = this.player.getSnapshot();
      this.updateCamera(snapshot, rawFrameDt);
      this.playerView.render(snapshot);
      this.renderLighting(snapshot);
      this.updateHUD(snapshot, effects);
      this.renderDebugOverlay(snapshot);
      this.clearSpawnWipe();
      return;
    }

    if (this.freezeTimer > 0) {
      this.freezeTimer = stepTimer(this.freezeTimer, rawFrameDt);
      const snapshot = this.player.getSnapshot();
      if (this.forceCameraUpdate) {
        this.updateCamera(snapshot, rawFrameDt);
      }
      this.playerView.render(snapshot);
      this.renderLighting(snapshot);
      this.updateHUD(snapshot, effects);
      this.renderDebugOverlay(snapshot);
      this.clearSpawnWipe();
      return;
    }

    if (!accumulatorPrimed) {
      this.accumulator = addFloat(this.accumulator, rawFrameDt);
    }
    let steps = 0;

    while (this.accumulator >= this.fixedDt && steps < this.maxSteps) {
      this.world.update(this.fixedDt, this.time.now / 1000);
      this.player.update(this.fixedDt, this.gatherStepInput());
      this.enforceCurrentRoomTopLimit();
      const freeze = this.player.consumeFreezeRequest();
      const refillFreeze = this.updateRefills();

      let stepEffects = this.player.consumeEffects();
      const stepSnapshot = this.player.getSnapshot();
      const spike = this.world.collidesWithSpike(
        this.player.getHurtboxBounds(),
        stepSnapshot.vx,
        stepSnapshot.vy,
      );
      if (spike) {
        this.playerView.tick(stepSnapshot, stepEffects, this.fixedDt);
        effects.push(...stepEffects);
        this.beginSpikeDeathRespawn(stepSnapshot, spike.dir);
        this.accumulator = 0;
        steps++;
        break;
      }

      const snapshot = this.player.getSnapshot();
      this.playerView.tick(snapshot, stepEffects, this.fixedDt);
      effects.push(...stepEffects);

      if (this.tryStartRoomTransition(snapshot)) {
        break;
      }

      this.updateCamera(snapshot, this.fixedDt);
      this.accumulator = subFloat(this.accumulator, this.fixedDt);
      steps++;

      const stepFreeze = maxFloat(freeze, refillFreeze);
      if (stepFreeze > 0) {
        this.freezeTimer = maxFloat(this.freezeTimer, stepFreeze);
        this.accumulator = 0;
        break;
      }
    }

    if (steps === this.maxSteps) {
      this.accumulator = 0;
    }

    const snapshot = this.player.getSnapshot();
    this.playerView.render(snapshot);
    this.renderLighting(snapshot);

    this.updateHUD(snapshot, effects);
    this.renderDebugOverlay(snapshot);
    this.clearSpawnWipe();
  }

  setCameraOffset(x: number, y: number): void {
    this.world.cameraController.offsetX = x;
    this.world.cameraController.offsetY = y;
  }

  setCameraAnchor(
    x: number,
    y: number,
    lerpX: number,
    lerpY: number,
    opts?: { ignoreX?: boolean; ignoreY?: boolean },
  ): void {
    const controller = this.world.cameraController;
    controller.anchorX = x;
    controller.anchorY = y;
    controller.anchorLerpX = Phaser.Math.Clamp(lerpX, 0, 1);
    controller.anchorLerpY = Phaser.Math.Clamp(lerpY, 0, 1);
    controller.anchorIgnoreX = !!opts?.ignoreX;
    controller.anchorIgnoreY = !!opts?.ignoreY;
  }

  clearCameraAnchor(): void {
    const controller = this.world.cameraController;
    controller.anchorLerpX = 0;
    controller.anchorLerpY = 0;
    controller.anchorIgnoreX = false;
    controller.anchorIgnoreY = false;
  }

  setCameraLockMode(mode: CameraLockMode): void {
    this.world.cameraController.lockMode = mode;
    if (mode !== "boostSequence") {
      this.world.cameraController.upwardMaxY = Number.POSITIVE_INFINITY;
    }
  }

  setForceCameraUpdate(force: boolean): void {
    this.forceCameraUpdate = force;
  }

  setCameraKillboxes(killboxes: ReadonlyArray<CameraKillboxSpec>): void {
    this.world.setCameraKillboxes(killboxes);
  }

  clearCameraKillboxes(): void {
    this.world.clearCameraKillboxes();
  }

  forceCameraSnap(): void {
    this.forceCameraSnapNextFrame = true;
    this.world.cameraController.upwardMaxY = Number.POSITIVE_INFINITY;
  }

  addCameraImpulse(x: number, y: number): void {
    if (x === 0 && y === 0) return;
    const intensity = Phaser.Math.Clamp(Math.hypot(x, y) * 0.00045, 0.0006, 0.0018);
    this.requestScreenShake(45, intensity);
  }

  requestScreenShake(durationMs: number, intensity: number): void {
    if (!this.gameOptions.screenShakeEffects) {
      return;
    }

    this.cameras.main.shake(durationMs, intensity);
  }

  shutdown(): void {
    if (this.keys) {
      this.keys.jump.off("down", this.onJumpDown, this);
      this.keys.jump.off("up", this.onJumpUp, this);
      this.keys.dash.off("down", this.onDashDown, this);
      this.keys.pause?.off("down", this.onPauseDown, this);
      this.keys.debug?.off("down", this.onDebugToggleDown, this);
    }
    this.controls?.reset();
    this.unpauseRecovery.clear();
    this.playerView?.destroy();
    this.pauseOverlay?.destroy();
    this.debugGfx?.destroy();
    this.spawnWipe?.destroy();
    this.refillEmitter?.destroy();
    this.lighting?.destroy();
    for (const refill of this.refills) {
      refill.glow.destroy();
      refill.body.destroy();
    }
    this.refills = [];
  }

  private gatherStepInput(): InputState {
    if (!this.player.inControl || this.unpauseRecovery.blocksControl) {
      this.controls.clearTransientState();
      return EMPTY_INPUT;
    }

    this.controls.setCheck("leftArrow", this.keys.left.isDown);
    this.controls.setCheck("rightArrow", this.keys.right.isDown);
    this.controls.setCheck("upArrow", this.keys.up.isDown);
    this.controls.setCheck("downArrow", this.keys.down.isDown);
    this.controls.setCheck("jump", this.keys.jump.isDown);
    this.controls.setCheck("dash", this.keys.dash.isDown);
    this.controls.setCheck("grab", this.keys.grab.isDown);

    return this.controls.update(this.fixedDt);
  }

  private onJumpDown(event: KeyboardEvent): void {
    if (event.repeat) return;
    if (this.pauseMenu.isOpen) {
      this.pauseMenu.confirm();
      this.afterPauseMenuInteraction();
      return;
    }
    if (this.unpauseRecovery.blocksControl) {
      return;
    }
    this.confirmBufferedFrames = 2;
    if (this.deathRespawnSequence !== null) {
      this.requestDeathRespawnSkip();
      return;
    }
    if (!this.player.inControl) {
      return;
    }
    this.controls.queuePress("jump");
  }

  private onJumpUp(): void {
    this.controls.queueRelease("jump");
  }

  private onDashDown(event: KeyboardEvent): void {
    if (event.repeat) return;
    if (this.pauseMenu.isOpen) {
      this.pauseMenu.cancel();
      this.afterPauseMenuInteraction();
      return;
    }
    if (this.unpauseRecovery.blocksControl) {
      return;
    }
    if (!this.player.inControl) {
      return;
    }
    this.controls.queuePress("dash");
  }

  private onPauseDown(event: KeyboardEvent): void {
    if (event.repeat) return;
    if (this.pauseMenu.isOpen) {
      this.pauseMenu.cancel();
      this.afterPauseMenuInteraction();
      return;
    }
    if (this.unpauseRecovery.active) {
      return;
    }

    this.openPauseMenu();
  }

  private onDebugToggleDown(event: KeyboardEvent): void {
    if (event.repeat) return;
    this.debugEnabled = !this.debugEnabled;
  }

  private spawnInitialPlayer(): void {
    this.revivePlayerAtCheckpoint("none");
  }

  private beginNormalRespawn(): void {
    const snapshot = this.player.getSnapshot();
    this.player.die({ x: 0, y: 0 });
    this.controls.clearTransientState();
    this.accumulator = 0;
    this.freezeTimer = 0;
    this.roomTransition = null;
    this.startDeathRespawnSequence({
      kind: "normal",
      exploded: false,
      revealStarted: false,
      respawnStarted: false,
      respawnSourceX: snapshot.centerX,
      respawnSourceY: snapshot.centerY,
      knockback: null,
    });
    this.startTransitionExplosion(snapshot);
  }

  private beginSpikeDeathRespawn(
    snapshot: ReturnType<Player["getSnapshot"]>,
    spikeDir: "up" | "down" | "left" | "right",
  ): void {
    const knockback = this.spikeKnockback(snapshot, spikeDir);
    this.player.die(this.spikeDirectionVector(spikeDir));
    this.freezeTimer = 0;
    this.controls.clearTransientState();
    this.accumulator = 0;
    this.startDeathRespawnSequence({
      kind: "spike",
      exploded: false,
      revealStarted: false,
      respawnStarted: false,
      respawnSourceX: knockback.endX,
      respawnSourceY: knockback.endY,
      knockback,
    });
    this.playerView.startDeathRecoil(snapshot);
  }

  private updateDeathRespawnSequence(dt: number): void {
    const sequence = this.deathRespawnSequence;
    if (sequence === null) {
      return;
    }

    sequence.elapsed = Math.min(sequence.totalDuration, sequence.elapsed + dt);

    const timings = transitionTimings(sequence.kind, sequence.totalDuration);

    if (sequence.kind === "spike" && !sequence.exploded) {
      this.updateSpikeDeathKnockback(sequence, timings.explodeAt);
    }

    if (!sequence.exploded && sequence.elapsed >= timings.explodeAt) {
      this.startTransitionExplosion();
    }

    if (!sequence.respawnStarted && sequence.elapsed >= timings.wipeRevealAt) {
      this.revivePlayerAtCheckpoint("respawn", sequence.respawnSourceX, sequence.respawnSourceY);
      sequence.revealStarted = true;
      sequence.respawnStarted = true;
    }

    if (sequence.elapsed >= sequence.totalDuration) {
      this.finishDeathRespawnSequence();
    }
  }

  private revivePlayerAtCheckpoint(
    introType: PlayerIntroType,
    sourceX = this.spawnX,
    sourceY = this.spawnY,
  ): void {
    this.world.resetTransientState();
    this.syncRefillViews();
    this.controls.clearTransientState();
    this.playerView.resetDeathRespawn();
    this.roomTransition = null;
    this.accumulator = 0;
    this.freezeTimer = 0;
    this.syncCurrentRoomToPoint(this.spawnX, this.spawnY);
    const spawnRoom = findRoomAtPoint(this.rooms, this.spawnX, this.spawnY) ?? this.currentRoom;
    const facingCenterX = spawnRoom.bounds.x + spawnRoom.bounds.w * 0.5;
    if (introType === "respawn") {
      const clampedSource = clampRespawnSource(sourceX, sourceY, {
        left: spawnRoom.bounds.x,
        right: spawnRoom.bounds.x + spawnRoom.bounds.w,
        top: spawnRoom.bounds.y,
        bottom: spawnRoom.bounds.y + spawnRoom.bounds.h,
      });
      this.player.reviveAt(this.spawnX, this.spawnY, {
        type: "respawn",
        sourceX: clampedSource.x,
        sourceY: clampedSource.y,
        facingCenterX,
      });
    } else if (introType === "start") {
      this.player.reviveAt(this.spawnX, this.spawnY, {
        type: "start",
        facingCenterX,
      });
    } else {
      this.player.reviveAt(this.spawnX, this.spawnY, introType);
    }
    this.forceCameraSnap();
  }

  private startDeathRespawnSequence(
    state: Omit<DeathRespawnSequenceState, "elapsed" | "totalDuration">,
  ): void {
    const totalDuration = baseTransitionDuration(state.kind);
    this.deathRespawnSequence = {
      ...state,
      elapsed: 0,
      totalDuration,
    };
    this.tryApplyBufferedSkip();
  }

  private finishDeathRespawnSequence(): void {
    this.deathRespawnSequence = null;
    this.controls.clearTransientState();
    this.clearSpawnWipe();
  }

  private startTransitionExplosion(snapshot = this.player.getSnapshot()): void {
    const transition = this.deathRespawnSequence;
    if (transition === null || transition.exploded) {
      return;
    }

    if (transition.kind === "spike") {
      this.playerView.startDeathAt(
        snapshot,
        transition.respawnSourceX,
        transition.respawnSourceY,
      );
    } else {
      this.playerView.startDeath(snapshot);
    }
    if (transition.kind === "spike") {
      this.requestScreenShake(120, 0.0026);
    }
    transition.exploded = true;
  }

  private updateSpikeDeathKnockback(
    transition: DeathRespawnSequenceState,
    explodeAt: number,
  ): void {
    if (transition.knockback === null || explodeAt <= 0) {
      return;
    }

    const t = Phaser.Math.Clamp(transition.elapsed / explodeAt, 0, 1);
    const eased = Phaser.Math.Easing.Cubic.Out(t);
    const x = Phaser.Math.Linear(transition.knockback.startX, transition.knockback.endX, eased);
    const y = Phaser.Math.Linear(transition.knockback.startY, transition.knockback.endY, eased);
    this.playerView.setDeathRecoilPosition(x, y, t);
  }

  private spikeKnockback(
    snapshot: ReturnType<Player["getSnapshot"]>,
    spikeDir: "up" | "down" | "left" | "right",
  ): NonNullable<DeathRespawnSequenceState["knockback"]> {
    const distance = WORLD.tile * 1.75;
    switch (spikeDir) {
      case "up":
        return {
          startX: snapshot.centerX,
          startY: snapshot.centerY,
          endX: snapshot.centerX,
          endY: snapshot.centerY - distance,
        };
      case "down":
        return {
          startX: snapshot.centerX,
          startY: snapshot.centerY,
          endX: snapshot.centerX,
          endY: snapshot.centerY + distance,
        };
      case "left":
        return {
          startX: snapshot.centerX,
          startY: snapshot.centerY,
          endX: snapshot.centerX - distance,
          endY: snapshot.centerY,
        };
      case "right":
        return {
          startX: snapshot.centerX,
          startY: snapshot.centerY,
          endX: snapshot.centerX + distance,
          endY: snapshot.centerY,
        };
    }
  }

  private spikeDirectionVector(spikeDir: "up" | "down" | "left" | "right"): { x: number; y: number } {
    switch (spikeDir) {
      case "up":
        return { x: 0, y: -1 };
      case "down":
        return { x: 0, y: 1 };
      case "left":
        return { x: -1, y: 0 };
      case "right":
        return { x: 1, y: 0 };
    }
  }

  private requestDeathRespawnSkip(): void {
    const transition = this.deathRespawnSequence;
    if (transition === null) {
      return;
    }

    transition.totalDuration = shortenedTransitionDuration(
      transition.kind,
      transition.totalDuration,
      transition.elapsed,
    );
  }

  private tryApplyBufferedSkip(): void {
    if (this.confirmBufferedFrames > 0) {
      this.requestDeathRespawnSkip();
    }
  }

  private advancePlayerOnly(dt: number, effects: PlayerEffect[]): void {
    this.controls.clearTransientState();
    this.player.update(dt, EMPTY_INPUT);
    const stepSnapshot = this.player.getSnapshot();
    const stepEffects = this.player.consumeEffects();
    this.playerView.tick(stepSnapshot, stepEffects, dt);
    effects.push(...stepEffects);
  }

  private tryStartRoomTransition(snapshot: ReturnType<Player["getSnapshot"]>): boolean {
    if (this.roomTransition !== null) {
      return true;
    }

    const direction = this.roomExitDirection(snapshot);
    if (direction === null) {
      return false;
    }

    const nextRoom = findAdjacentRoom(
      this.rooms,
      this.currentRoom,
      direction,
      this.roomTransitionProbe(snapshot, direction),
    );
    if (nextRoom === null) {
      return false;
    }

    const camera = this.cameras.main;
    const target = this.computeCameraTarget(snapshot, camera, nextRoom);
    this.roomTransition = {
      from: this.currentRoom,
      to: nextRoom,
      direction,
      elapsed: 0,
      duration: ROOM_TRANSITION_DURATION,
      fromScrollX: camera.scrollX,
      fromScrollY: camera.scrollY,
      toScrollX: target.x,
      toScrollY: target.y,
    };
    this.controls.clearTransientState();
    this.accumulator = 0;
    this.freezeTimer = 0;
    return true;
  }

  private enforceCurrentRoomTopLimit(): void {
    const snapshot = this.player.getSnapshot();
    const roomAbove = findAdjacentRoom(this.rooms, this.currentRoom, "up", snapshot.centerX);
    if (roomAbove !== null) {
      return;
    }

    this.player.enforceTopLimit(this.currentRoom.bounds.y - ROOM_TOP_CLIMB_MARGIN);
  }

  private roomExitDirection(
    snapshot: ReturnType<Player["getSnapshot"]>,
  ): RoomDirection | null {
    const bounds = this.currentRoom.bounds;

    if (snapshot.centerX < bounds.x) return "left";
    if (snapshot.centerX >= bounds.x + bounds.w) return "right";
    if (snapshot.centerY < bounds.y) return "up";
    if (snapshot.centerY >= bounds.y + bounds.h) return "down";
    return null;
  }

  private roomTransitionProbe(
    snapshot: ReturnType<Player["getSnapshot"]>,
    direction: RoomDirection,
  ): number {
    if (direction === "left" || direction === "right") {
      return snapshot.centerY;
    }

    return snapshot.centerX;
  }

  private updateRoomTransition(dt: number): void {
    const transition = this.roomTransition;
    if (transition === null) {
      return;
    }

    this.world.update(dt, this.time.now / 1000);
    this.syncRefillViews();

    transition.elapsed = Math.min(transition.duration, transition.elapsed + dt);
    const t = transition.duration <= 0 ? 1 : transition.elapsed / transition.duration;
    const eased = Phaser.Math.Easing.Cubic.Out(t);
    const scrollX = Phaser.Math.Linear(transition.fromScrollX, transition.toScrollX, eased);
    const scrollY = Phaser.Math.Linear(transition.fromScrollY, transition.toScrollY, eased);
    this.cameras.main.setScroll(scrollX, scrollY);

    if (t >= 1) {
      this.currentRoom = transition.to;
      this.roomTransition = null;
      this.setCheckpoint(this.currentRoom);
      this.player.onTransition();
      if (transition.direction === "up") {
        this.player.bounce();
      }
      this.cameras.main.setScroll(transition.toScrollX, transition.toScrollY);
      this.forceCameraSnapNextFrame = false;
    }
  }

  private setCheckpoint(room: LevelRoom): void {
    if (room.checkpoint === null) {
      return;
    }

    this.spawnX = room.checkpoint.x;
    this.spawnY = room.checkpoint.y;
  }

  private syncCurrentRoomToPoint(x: number, y: number): void {
    const room = findRoomAtPoint(this.rooms, x, y);
    if (room !== null) {
      this.currentRoom = room;
    }
  }

  private updateCamera(
    snapshot: ReturnType<Player["getSnapshot"]>,
    dt: number,
    room: LevelRoom = this.currentRoom,
  ): void {
    const camera = this.cameras.main;
    const roomBounds = this.cameraScrollBounds(room);
    const target = this.computeCameraTarget(snapshot, camera, room);

    let nextX = target.x;
    let nextY = target.y;

    if (!this.forceCameraSnapNextFrame) {
      const smooth = 1 - Math.pow(CAMERA_SMOOTH_BASE, dt);
      nextX = camera.scrollX + (target.x - camera.scrollX) * smooth;
      nextY = camera.scrollY + (target.y - camera.scrollY) * smooth;
      if (Math.abs(target.x - nextX) < CAMERA_SETTLE_EPSILON) {
        nextX = target.x;
      }
      if (Math.abs(target.y - nextY) < CAMERA_SETTLE_EPSILON) {
        nextY = target.y;
      }
    }

    nextX = this.keepPlayerHorizontallyVisible(snapshot, nextX, roomBounds);
    nextY = this.keepPlayerVerticallyVisible(snapshot, nextY, roomBounds, dt);

    camera.setScroll(nextX, nextY);
    this.forceCameraSnapNextFrame = false;
  }

  private cameraScrollBounds(room: LevelRoom): CameraScrollBounds {
    return {
      minX: room.bounds.x,
      maxX: Math.max(room.bounds.x, room.bounds.x + room.bounds.w - VIEWPORT.width),
      minY: room.bounds.y,
      maxY: Math.max(room.bounds.y, room.bounds.y + room.bounds.h - VIEWPORT.height),
    };
  }

  private keepPlayerHorizontallyVisible(
    snapshot: ReturnType<Player["getSnapshot"]>,
    scrollX: number,
    bounds: CameraScrollBounds,
  ): number {
    const minScrollX = snapshot.right - (VIEWPORT.width - CAMERA_PLAYER_MARGIN_X);
    const maxScrollX = snapshot.left - CAMERA_PLAYER_MARGIN_X;
    return Phaser.Math.Clamp(
      Phaser.Math.Clamp(scrollX, minScrollX, maxScrollX),
      bounds.minX,
      bounds.maxX,
    );
  }

  private keepPlayerVerticallyVisible(
    snapshot: ReturnType<Player["getSnapshot"]>,
    scrollY: number,
    bounds: CameraScrollBounds,
    dt: number,
  ): number {
    const minScrollY = snapshot.bottom - (VIEWPORT.height - CAMERA_PLAYER_MARGIN_BOTTOM);
    const maxScrollY = snapshot.top - CAMERA_PLAYER_MARGIN_TOP;
    const maxDelta = CAMERA_VERTICAL_VISIBILITY_CATCHUP * dt;

    let nextY = scrollY;
    if (nextY < minScrollY) {
      nextY = approach(nextY, minScrollY, maxDelta);
    } else if (nextY > maxScrollY) {
      nextY = approach(nextY, maxScrollY, maxDelta);
    }

    return Phaser.Math.Clamp(nextY, bounds.minY, bounds.maxY);
  }

  private computeCameraTarget(
    snapshot: ReturnType<Player["getSnapshot"]>,
    camera: Phaser.Cameras.Scene2D.Camera,
    room: LevelRoom,
  ): Phaser.Math.Vector2 {
    const controller = this.world.cameraController;
    const roomBounds = this.cameraScrollBounds(room);
    let targetX = snapshot.centerX - VIEWPORT.width * 0.5;
    let targetY = snapshot.bottom - CAMERA_FOOT_ANCHOR_Y;

    targetX += controller.offsetX;
    targetY += controller.offsetY;

    if (controller.anchorLerpX > 0 || controller.anchorLerpY > 0) {
      if (controller.anchorIgnoreX && !controller.anchorIgnoreY) {
        targetY = Phaser.Math.Linear(targetY, controller.anchorY, controller.anchorLerpY);
      } else if (!controller.anchorIgnoreX && controller.anchorIgnoreY) {
        targetX = Phaser.Math.Linear(targetX, controller.anchorX, controller.anchorLerpX);
      } else {
        targetX = Phaser.Math.Linear(targetX, controller.anchorX, controller.anchorLerpX);
        targetY = Phaser.Math.Linear(targetY, controller.anchorY, controller.anchorLerpY);
      }
    }

    let clampedX = Phaser.Math.Clamp(targetX, roomBounds.minX, roomBounds.maxX);
    let clampedY = Phaser.Math.Clamp(targetY, roomBounds.minY, roomBounds.maxY);

    if (controller.lockMode !== "none") {
      if (controller.lockMode !== "boostSequence") {
        clampedX = Math.max(clampedX, camera.scrollX);
      }

      if (controller.lockMode === "finalBoss") {
        clampedY = Math.max(clampedY, camera.scrollY);
      } else if (controller.lockMode === "boostSequence") {
        controller.upwardMaxY = Math.min(
          camera.scrollY + CAMERA_BOOST_UPWARD_MAX_Y_OFFSET,
          controller.upwardMaxY,
        );
        clampedY = Math.min(clampedY, controller.upwardMaxY);
      }
    }

    clampedX = Phaser.Math.Clamp(clampedX, roomBounds.minX, roomBounds.maxX);
    clampedY = this.applyKillboxSafety(snapshot, clampedY, roomBounds.minY, roomBounds.maxY);
    return new Phaser.Math.Vector2(clampedX, clampedY);
  }

  private applyKillboxSafety(
    snapshot: ReturnType<Player["getSnapshot"]>,
    targetY: number,
    minY: number,
    maxY: number,
  ): number {
    if (this.world.cameraKillboxes.length === 0) return targetY;

    let safeY = targetY;

    for (const box of this.world.cameraKillboxes) {
      if (!box.active || !box.collidable) continue;
      const bounds = box.bounds;

      const overlapsX = snapshot.right > bounds.x && snapshot.left < bounds.x + bounds.w;
      if (!overlapsX) continue;
      if (snapshot.top >= bounds.y + bounds.h) continue;

      safeY = Math.min(safeY, bounds.y - VIEWPORT.height);
    }

    return Phaser.Math.Clamp(safeY, minY, maxY);
  }

  private computeTileDepths(): void {
    const cols = this.world.cols;
    const rows = this.world.rows;

    this.tileDepths = new Int32Array(cols * rows);
    this.tileDepths.fill(9999);
    const queue: number[] = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const t = tileAt(this.world, c, r);
        if (t === 0 || t === TILE_JUMP_THROUGH) {
          const idx = r * cols + c;
          this.tileDepths[idx] = 0;
          queue.push(idx);
        }
      }
    }

    let head = 0;
    const dirs = [-1, 0, 1, 0, 0, -1, 0, 1];
    while (head < queue.length) {
      const idx = queue[head++];
      const r = Math.floor(idx / cols);
      const c = idx % cols;
      const d = this.tileDepths[idx];

      for (let i = 0; i < 4; i++) {
        const nr = r + dirs[i * 2 + 1];
        const nc = c + dirs[i * 2];
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
          const nIdx = nr * cols + nc;
          if (this.tileDepths[nIdx] > d + 1) {
            this.tileDepths[nIdx] = d + 1;
            queue.push(nIdx);
          }
        }
      }
    }
  }

  private drawTiles(): void {
    const g = this.tileGfx;
    const cols = this.world.cols;
    const rows = this.world.rows;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * WORLD.tile;
        const y = r * WORLD.tile;
        const tile = tileAt(this.world, c, r);
        if (tile === 0) continue;

        if (tile === TILE_JUMP_THROUGH) {
          g.fillStyle(COLORS.earth1, 1);
          g.fillRect(x, y + JUMP_THRU_EDGE_HEIGHT, WORLD.tile, JUMP_THRU_BODY_HEIGHT);
          g.fillStyle(COLORS.earthHighlight, 1);
          g.fillRect(x, y, WORLD.tile, JUMP_THRU_EDGE_HEIGHT);
        } else {
          const depth = this.tileDepths[r * cols + c];

          if (depth === 1) {
            g.fillStyle(COLORS.earth0, 1);
            g.fillRect(x, y, WORLD.tile, WORLD.tile);

            g.fillStyle(COLORS.earth1, 1);
            g.fillRect(x, y + 3, WORLD.tile, 2);
            g.fillRect(x + 3, y, 2, WORLD.tile);

            g.fillStyle(COLORS.earthHighlight, 1);
            if (r > 0 && this.tileDepths[(r - 1) * cols + c] === 0) {
              g.fillRect(x, y, WORLD.tile, 1);
            }
            if (r < rows - 1 && this.tileDepths[(r + 1) * cols + c] === 0) {
              g.fillRect(x, y + WORLD.tile - 1, WORLD.tile, 1);
            }
            if (c > 0 && this.tileDepths[r * cols + c - 1] === 0) {
              g.fillRect(x, y, 1, WORLD.tile);
            }
            if (c < cols - 1 && this.tileDepths[r * cols + c + 1] === 0) {
              g.fillRect(x + WORLD.tile - 1, y, 1, WORLD.tile);
            }
          } else {
            g.fillStyle(COLORS.earth1, 1);
            g.fillRect(x, y, WORLD.tile, WORLD.tile);
          }
        }
      }
    }

    for (const spike of this.world.spikes) {
      const triangles = spikeTriangles(spike);
      for (const tri of triangles) {
        const [a, b, c] = tri;
        g.fillStyle(0xd86b6b, 1);
        g.fillTriangle(a.x, a.y, b.x, b.y, c.x, c.y);
        g.lineStyle(1, 0xffffff, 0.28);
        g.strokeTriangle(a.x, a.y, b.x, b.y, c.x, c.y);
      }
    }
  }

  private renderSpawnWipe(): void {
    const transition = this.deathRespawnSequence;
    if (transition === null) {
      this.clearSpawnWipe();
      return;
    }

    const timings = transitionTimings(transition.kind, transition.totalDuration);
    if (transition.elapsed < timings.wipeCoverAt) {
      this.clearSpawnWipe();
      return;
    }

    const overscan = SPAWN_WIPE_VISUALS.edgeOverscan;
    let topY = 0;

    if (transition.elapsed < timings.wipeRevealAt) {
      const duration = Math.max(0.0001, timings.wipeRevealAt - timings.wipeCoverAt);
      const progress = Phaser.Math.Clamp((transition.elapsed - timings.wipeCoverAt) / duration, 0, 1);
      topY = Phaser.Math.Linear(VIEWPORT.height + overscan, -overscan, progress);
    } else {
      const duration = Math.max(0.0001, timings.totalDuration - timings.wipeRevealAt);
      const progress = Phaser.Math.Clamp((transition.elapsed - timings.wipeRevealAt) / duration, 0, 1);
      topY = Phaser.Math.Linear(-overscan, -SPAWN_WIPE_HEIGHT - overscan, progress);
    }

    const bottomY = topY + SPAWN_WIPE_HEIGHT;
    this.spawnWipe.clear();
    this.spawnWipe.fillStyle(SPAWN_WIPE_VISUALS.color, 1);
    this.spawnWipe.beginPath();
    this.traceWipeEdge(topY, "top");
    this.traceWipeEdge(bottomY, "bottom");
    this.spawnWipe.closePath();
    this.spawnWipe.fillPath();
    this.spawnWipe.setVisible(true);
  }

  private clearSpawnWipe(): void {
    this.spawnWipe.clear();
    this.spawnWipe.setVisible(false);
  }

  private traceWipeEdge(baseY: number, edge: "top" | "bottom"): void {
    const overscan = SPAWN_WIPE_VISUALS.edgeOverscan;
    const minX = -overscan;
    const maxX = VIEWPORT.width + overscan;
    const centerX = VIEWPORT.width * 0.5;
    const halfPoint = SPAWN_WIPE_VISUALS.pointWidth * 0.5;

    if (edge === "top") {
      this.spawnWipe.moveTo(minX, baseY);
      this.spawnWipe.lineTo(centerX - halfPoint, baseY);
      this.spawnWipe.lineTo(centerX, baseY - SPAWN_WIPE_VISUALS.pointDepth);
      this.spawnWipe.lineTo(centerX + halfPoint, baseY);
      this.spawnWipe.lineTo(maxX, baseY);
      return;
    }

    this.spawnWipe.lineTo(maxX, baseY);
    this.spawnWipe.lineTo(centerX + halfPoint, baseY);
    this.spawnWipe.lineTo(centerX, baseY - SPAWN_WIPE_VISUALS.pointDepth);
    this.spawnWipe.lineTo(centerX - halfPoint, baseY);
    this.spawnWipe.lineTo(minX, baseY);
  }

  private createRefills(spawns: ReadonlyArray<RefillPickupEntity>): void {
    for (const spawn of spawns) {
      const color = this.refillColor(spawn.type);
      const glow = this.add
        .ellipse(spawn.x, spawn.visualY, REFILL_GLOW_SIZE, REFILL_GLOW_SIZE, color, 0.16)
        .setDepth(2);
      const body = this.add
        .rectangle(spawn.x, spawn.visualY, REFILL_BODY_SIZE, REFILL_BODY_SIZE, color, 0.95)
        .setAngle(45)
        .setStrokeStyle(1, 0xffffff, 0.9)
        .setDepth(4);

      this.refills.push({
        entity: spawn,
        glow,
        body,
      });
    }

    this.syncRefillViews();
  }

  private updateRefills(): number {
    if (this.refills.length === 0) return 0;

    const player = this.player.getHitboxBounds();
    const consumed = this.world.consumeTouchingRefills(player, (target) => this.player.tryRefill(target));
    for (const refill of consumed) {
      this.refillEmitter.setParticleTint(this.refillColor(refill.type));
      this.refillEmitter.emitParticleAt(refill.x, refill.visualY, 7);
      this.requestScreenShake(40, 0.0012);
    }

    this.syncRefillViews();
    return consumed.length > 0 ? REFILL_CONSUME_FREEZE_TIME : 0;
  }

  private syncRefillViews(): void {
    for (const refill of this.refills) {
      refill.glow.setVisible(refill.entity.active);
      refill.body.setVisible(refill.entity.active);
      refill.glow.setPosition(refill.entity.x, refill.entity.visualY);
      refill.body.setPosition(refill.entity.x, refill.entity.visualY);
    }
  }

  private refillColor(type: RefillType): number {
    if (type === "max") return 0x8af6ff;
    if (type <= 1) return COLORS.playerOneDash;
    return COLORS.playerTwoDash;
  }

  private ensurePixelTexture(): void {
    if (this.textures.exists("pixel")) return;

    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 2, 2);
    g.generateTexture("pixel", 2, 2);
    g.destroy();
  }

  private renderLighting(snapshot: ReturnType<Player["getSnapshot"]>): void {
    const lights: LightingSource[] = [
      {
        x: snapshot.centerX,
        y: snapshot.centerY - 2,
        radius: 48,
        color: COLORS.dust,
        intensity: 0.12,
      },
    ];

    this.lighting.render(this.cameras.main, lights);
  }

  private renderDebugOverlay(snapshot: ReturnType<Player["getSnapshot"]>): void {
    if (!this.debugEnabled) {
      this.debugGfx.clear();
      this.debugGfx.setVisible(false);
      return;
    }

    this.debugGfx.clear();
    this.debugGfx.setVisible(true);

    for (const entity of this.world.entities) {
      if (!entity.active || !entity.collidable || entity.collider === null) {
        continue;
      }

      if (entity.collider instanceof Grid) {
        this.drawDebugGrid(entity.collider);
        continue;
      }

      if (entity.collider instanceof Hitbox) {
        this.drawDebugBounds(entity.collider.bounds, DEBUG_HITBOX_COLOR);
      }
    }

    this.drawDebugBounds(
      {
        x: snapshot.left,
        y: snapshot.top,
        w: snapshot.hitboxW,
        h: snapshot.hitboxH,
      },
      DEBUG_HITBOX_COLOR,
    );
    this.drawDebugBounds(this.player.getHurtboxBounds(), DEBUG_HURTBOX_COLOR);
  }

  private drawDebugGrid(grid: Grid): void {
    for (let row = 0; row < grid.cellsY; row++) {
      for (let col = 0; col < grid.cellsX; col++) {
        if (!grid.getCell(col, row)) {
          continue;
        }

        this.drawDebugBounds(
          {
            x: grid.absoluteLeft + col * grid.cellWidth,
            y: grid.absoluteTop + row * grid.cellHeight,
            w: grid.cellWidth,
            h: grid.cellHeight,
          },
          DEBUG_HITBOX_COLOR,
        );
      }
    }
  }

  private drawDebugBounds(
    bounds: { x: number; y: number; w: number; h: number },
    color: number,
    alpha = 1,
  ): void {
    this.debugGfx.lineStyle(1, color, alpha);
    this.debugGfx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
  }

  private updateHUD(snapshot: ReturnType<Player["getSnapshot"]>, effects: PlayerEffect[]): void {
    if (!this.debugEnabled) {
      this.hudText.setVisible(false);
      this.hudText.setText("");
      return;
    }

    const state = snapshot.state.toUpperCase();
    const wallSliding =
      !snapshot.onGround && snapshot.wallDir !== 0 && snapshot.vy > 0 && snapshot.state === "normal"
        ? " WALL"
        : "";
    const events = effects
      .map((e) => {
        let suffix = "";
        if (e.extended) suffix += "+ext";
        if (e.reverse) suffix += "+rev";
        return `${e.type}${suffix}`;
      })
      .join(", ");
    const roomLine = this.roomTransition
      ? `ROOM ${this.roomTransition.from.id} -> ${this.roomTransition.to.id}`
      : `ROOM ${this.currentRoom.id}`;

    const lines = [
      roomLine,
      `POS ${snapshot.x.toFixed(2)}, ${snapshot.y.toFixed(2)}`,
      `${state}${wallSliding}  ${snapshot.onGround ? "GROUND" : "AIR"}  D:${snapshot.dashesLeft}  ST:${snapshot.stamina.toFixed(0)}`,
      `VEL ${snapshot.vx.toFixed(0)}, ${snapshot.vy.toFixed(0)}  CAM ${this.cameras.main.scrollX.toFixed(0)}, ${this.cameras.main.scrollY.toFixed(0)}`,
    ];
    if (events) {
      lines.push(`FX ${events}`);
    }

    this.hudText.setVisible(true);
    this.hudText.setText(lines.join("\n"));
  }

  private openPauseMenu(): void {
    this.unpauseRecovery.clear();
    this.controls.clearTransientState();
    this.stopScreenShake();
    this.refillEmitter.pause();
    this.playerView.pauseEffects();
    this.pauseMenu.open(this.createPauseRootMenu());
  }

  private createPauseRootMenu(): PauseActionMenu {
    return {
      kind: "action",
      title: "PAUSED",
      selectedIndex: 0,
      onCancel: () => {
        this.resumeFromPauseMenu();
      },
      items: [
        {
          label: "Resume",
          activate: () => {
            this.resumeFromPauseMenu();
          },
        },
        {
          label: "Retry",
          activate: () => {
            this.closePauseMenuImmediately();
            this.retryFromPause();
          },
        },
        {
          label: "Options",
          activate: (controller) => {
            controller.push(this.createOptionsMenu());
          },
        },
      ],
    };
  }

  private createOptionsMenu(): PauseOptionsMenu {
    const screenShakeOption: PauseMenuOption<boolean> = {
      label: "Screen Shake Effects",
      values: ON_OFF_CHOICES,
      valueIndex: this.gameOptions.screenShakeEffects ? 1 : 0,
    };
    const dynamicHairOption: PauseMenuOption<boolean> = {
      label: "Dynamic Hair",
      values: ON_OFF_CHOICES,
      valueIndex: this.gameOptions.dynamicHair ? 1 : 0,
    };

    const draft: PauseOptionsMenu = {
      kind: "options",
      title: "OPTIONS",
      selectedIndex: 0,
      onCancel: (controller) => {
        const screenShakeEffects = currentPauseOptionValue(screenShakeOption);
        const dynamicHair = currentPauseOptionValue(dynamicHairOption);
        this.gameOptions = saveGameOptions({
          ...this.gameOptions,
          screenShakeEffects: screenShakeEffects ?? this.gameOptions.screenShakeEffects,
          dynamicHair: dynamicHair ?? this.gameOptions.dynamicHair,
        });
        this.playerView.setDynamicHairEnabled(this.gameOptions.dynamicHair);
        if (!this.gameOptions.screenShakeEffects) {
          this.stopScreenShake();
        }
        controller.pop();
      },
      items: [screenShakeOption, dynamicHairOption],
    };
    return draft;
  }

  private updatePauseInput(): void {
    if (Phaser.Input.Keyboard.JustDown(this.keys.up)) {
      this.pauseMenu.moveVertical(-1);
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.down)) {
      this.pauseMenu.moveVertical(1);
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.left)) {
      this.pauseMenu.moveHorizontal(-1);
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.right)) {
      this.pauseMenu.moveHorizontal(1);
    }
  }

  private afterPauseMenuInteraction(): void {
    this.controls.clearTransientState();
    if (!this.pauseMenu.isOpen) {
      if (!this.unpauseRecovery.active) {
        this.resumePauseManagedEffects();
      }
      this.pauseOverlay.hide();
    }
  }

  private retryFromPause(): void {
    if (this.deathRespawnSequence !== null || !this.player.canRetry) {
      return;
    }

    this.beginNormalRespawn();
  }

  private stopScreenShake(): void {
    this.cameras.main.resetFX();
  }

  private renderPassiveFrame(): void {
    const snapshot = this.player.getSnapshot();
    this.playerView.render(snapshot);
    this.renderLighting(snapshot);
    this.updateHUD(snapshot, []);
    this.renderDebugOverlay(snapshot);
    if (this.deathRespawnSequence !== null) {
      this.renderSpawnWipe();
    } else {
      this.clearSpawnWipe();
    }
  }

  private advanceUnpauseRecovery(rawFrameDt: number): boolean {
    this.accumulator = addFloat(this.accumulator, rawFrameDt);

    while (this.unpauseRecovery.active && this.accumulator >= this.fixedDt) {
      const result = this.unpauseRecovery.step(this.currentUnpauseRecoveryHeldState());

      if (result.openPause) {
        this.accumulator = 0;
        this.openPauseMenu();
        return true;
      }

      if (result.blockGameplay) {
        this.accumulator = subFloat(this.accumulator, this.fixedDt);
        continue;
      }

      if (result.queueJump) {
        this.controls.queuePress("jump");
      }
      if (result.queueDash) {
        this.controls.queuePress("dash");
      }
      this.resumePauseManagedEffects();
      return false;
    }

    return this.unpauseRecovery.active;
  }

  private currentUnpauseRecoveryHeldState(): { pause: boolean; jump: boolean; dash: boolean } {
    return {
      pause: this.keys.pause.isDown,
      jump: this.keys.jump.isDown,
      dash: this.keys.dash.isDown,
    };
  }

  private resumeFromPauseMenu(): void {
    this.pauseMenu.close();
    this.unpauseRecovery.start(this.currentUnpauseRecoveryHeldState());
  }

  private closePauseMenuImmediately(): void {
    this.pauseMenu.close();
    this.unpauseRecovery.clear();
  }

  private resumePauseManagedEffects(): void {
    this.refillEmitter.resume();
    this.playerView.resumeEffects();
  }
}
