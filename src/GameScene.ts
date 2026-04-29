import Phaser from "phaser";
import type { AirDashAssist } from "./assists";
import { COLORS, PLAYER_CONFIG, VIEWPORT, WORLD } from "./constants";
import { DisplacementSystem } from "./displacement/DisplacementSystem";
import { EntityWorld, spikeTriangles } from "./entities/EntityWorld";
import { Grid } from "./entities/core/Grid";
import { Hitbox } from "./entities/core/Hitbox";
import { JumpThruTilesEntity, type RefillPickupEntity } from "./entities/runtime";
import { CameraKillboxSpec, CameraLockMode, RefillType } from "./entities/types";
import { TILE_JUMP_THROUGH, TILE_SOLID, tileAt } from "./grid";
import {
  DEFAULT_KEY_BINDINGS,
  KEY_BINDING_DEFINITIONS,
  normalizeKeyBindings,
  type KeyBindingAction,
  type KeyBindings,
} from "./input/keybindings";
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
  isPauseKeyBindingItem,
  PauseMenuChoice,
  PauseMenuController,
  type PauseMenuKeyBindingItem,
  type PauseMenuOptionItem,
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
import {
  INTRO_IRIS_VISUALS,
  introIrisTotalDuration,
  sampleIntroIrisRadius,
} from "./view/introIris";
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

interface IntroIrisState {
  elapsed: number;
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
const DEATH_SHAKE_DURATION_MS = 120;
const DEATH_SHAKE_INTENSITY = 0.0026;
const PLAYER_LIGHT_OFFSET_Y = {
  normal: -8,
  crouched: -3,
} as const;
const SPAWN_WIPE_HEIGHT = VIEWPORT.height + SPAWN_WIPE_VISUALS.edgeOverscan * 2;
const DEBUG_HITBOX_COLOR = 0xff0000;
const DEBUG_HURTBOX_COLOR = 0x00ff00;
const DEBUG_JUMP_THRU_HEIGHT = JUMP_THRU_EDGE_HEIGHT + JUMP_THRU_BODY_HEIGHT;
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
  crouchDash: false,
  crouchDashPressed: false,
  grab: false,
};
const MENU_UP_CODES: readonly string[] = ["ArrowUp"];
const MENU_DOWN_CODES: readonly string[] = ["ArrowDown"];
const MENU_LEFT_CODES: readonly string[] = ["ArrowLeft"];
const MENU_RIGHT_CODES: readonly string[] = ["ArrowRight"];
const MENU_CONFIRM_CODES: readonly string[] = ["Enter", "NumpadEnter"];
const MENU_CANCEL_CODES: readonly string[] = ["Escape"];
const MENU_CLEAR_CODES: readonly string[] = ["Backspace", "Delete"];
const ON_OFF_CHOICES: readonly PauseMenuChoice<boolean>[] = [
  { label: "OFF", value: false },
  { label: "ON", value: true },
];
const AIR_DASH_CHOICES: readonly PauseMenuChoice<AirDashAssist>[] = [
  { label: "Default", value: "default" },
  { label: "2", value: "two" },
  { label: "Infinite", value: "infinite" },
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

  private debugKey!: Phaser.Input.Keyboard.Key;
  private readonly heldKeyCodes = new Set<string>();
  private readonly pressedKeyCodes = new Set<string>();
  private readonly releasedKeyCodes = new Set<string>();
  private gameplayEdgesConsumed = false;
  private controls!: PlayerControls;
  private captureKeyBindingAction: KeyBindingAction | null = null;
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
  private playerSolidOcclusionMaskGfx!: Phaser.GameObjects.Graphics;
  private playerSolidOcclusionMask!: Phaser.Display.Masks.GeometryMask;
  private debugGfx!: Phaser.GameObjects.Graphics;
  private spawnWipe!: Phaser.GameObjects.Graphics;
  private introIris!: Phaser.GameObjects.Graphics;
  private hudText!: Phaser.GameObjects.Text;
  private refills: RefillView[] = [];
  private refillEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private lighting!: LightingSystem;
  private displacement!: DisplacementSystem;
  private deathRespawnSequence: DeathRespawnSequenceState | null = null;
  private introIrisState: IntroIrisState | null = null;
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
    this.playerSolidOcclusionMaskGfx = this.createPlayerSolidOcclusionMaskGraphics();
    this.playerSolidOcclusionMask = this.playerSolidOcclusionMaskGfx.createGeometryMask();
    this.debugGfx = this.add.graphics().setDepth(9);
    this.debugGfx.setVisible(false);
    this.spawnWipe = this.add.graphics().setDepth(20).setScrollFactor(0);
    this.introIris = this.add.graphics().setDepth(30).setScrollFactor(0);
    this.drawTiles();
    this.lighting = new LightingSystem(this, this.world);
    this.displacement = new DisplacementSystem(this);

    this.player = new Player(this.spawnX, this.spawnY, this.world, PLAYER_CONFIG);
    this.player.setAssistOptions(this.gameOptions);
    this.playerView = new PlayerView(this);
    this.playerView.setSolidOcclusionMask(this.playerSolidOcclusionMask);
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
    kb.on("keydown", this.onKeyDown, this);
    kb.on("keyup", this.onKeyUp, this);
    this.controls = new PlayerControls();
    this.debugKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.BACKTICK);
    this.debugKey.on("down", this.onDebugToggleDown, this);

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
    this.renderIntroIris(snapshot);
  }

  update(_time: number, delta: number): void {
    const rawFrameDt = toFloat(Math.min(delta / 1000, 0.1));
    this.displacement.update(rawFrameDt);
    this.gameplayEdgesConsumed = false;
    if (this.confirmBufferedFrames > 0) {
      this.confirmBufferedFrames--;
    }

    if (!this.pauseMenu.isOpen && !this.unpauseRecovery.active && this.actionPressed("pause")) {
      if (this.canOpenPauseMenu()) {
        this.openPauseMenu();
        this.clearTransientKeyEdges();
      } else {
        this.clearActionTransientKeyEdges("pause");
      }
    }

    if (this.pauseMenu.isOpen) {
      this.updatePauseInput();
      let snapshot = this.player.getSnapshot();
      this.playerView.render(snapshot);
      this.renderLighting(snapshot);
      this.updateHUD(snapshot, []);
      this.renderDebugOverlay(snapshot);
      this.renderSpawnWipe();
      this.renderIntroIris(snapshot);
      const current = this.pauseMenu.current;
      if (current) {
        this.pauseOverlay.render(current, this.captureKeyBindingAction);
      } else {
        this.pauseOverlay.hide();
      }
      this.clearTransientKeyEdges();
      return;
    }

    this.pauseOverlay.hide();
    this.advanceIntroIris(rawFrameDt);

    if (this.actionPressed("confirm")) {
      this.confirmBufferedFrames = 2;
      if (this.deathRespawnSequence !== null) {
        this.requestDeathRespawnSkip();
      }
    }

    let accumulatorPrimed = false;
    if (this.unpauseRecovery.active) {
      accumulatorPrimed = true;
      if (this.advanceUnpauseRecovery(rawFrameDt)) {
        this.renderPassiveFrame();
        this.clearTransientKeyEdges();
        return;
      }
    }

    const effects: PlayerEffect[] = [];

    if (this.roomTransition) {
      this.updateRoomTransition(rawFrameDt);
      let snapshot = this.player.getSnapshot();
      this.playerView.render(snapshot);
      this.renderLighting(snapshot);
      this.updateHUD(snapshot, effects);
      this.renderDebugOverlay(snapshot);
      this.clearSpawnWipe();
      this.renderIntroIris(snapshot);
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
        this.renderIntroIris(snapshot);
        this.clearTransientKeyEdges();
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
      this.renderIntroIris(snapshot);
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
      this.renderIntroIris(snapshot);
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
        if (this.beginSpikeDeathRespawn(stepSnapshot, spike.dir)) {
          this.playerView.tick(stepSnapshot, stepEffects, this.fixedDt);
          this.applyDisplacementEffects(stepSnapshot, stepEffects);
          effects.push(...stepEffects);
          this.accumulator = 0;
          steps++;
          break;
        }
      }

      let snapshot = this.player.getSnapshot();
      this.playerView.tick(snapshot, stepEffects, this.fixedDt);
      this.applyDisplacementEffects(snapshot, stepEffects);
      effects.push(...stepEffects);

      if (this.tryStartRoomTransition(snapshot)) {
        break;
      }
      if (this.tryHandleBottomFallout(snapshot)) {
        break;
      }
      snapshot = this.player.getSnapshot();

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
    this.renderIntroIris(snapshot);
    if (this.gameplayEdgesConsumed) {
      this.clearTransientKeyEdges();
    }
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

  private requestDeathShake(): void {
    this.requestScreenShake(DEATH_SHAKE_DURATION_MS, DEATH_SHAKE_INTENSITY);
  }

  requestScreenShake(durationMs: number, intensity: number): void {
    if (!this.gameOptions.screenShakeEffects) {
      return;
    }

    this.cameras.main.shake(durationMs, intensity);
  }

  shutdown(): void {
    if (this.input.keyboard) {
      this.input.keyboard.off("keydown", this.onKeyDown, this);
      this.input.keyboard.off("keyup", this.onKeyUp, this);
    }
    if (this.debugKey) {
      this.debugKey.off("down", this.onDebugToggleDown, this);
    }
    this.heldKeyCodes.clear();
    this.pressedKeyCodes.clear();
    this.releasedKeyCodes.clear();
    this.captureKeyBindingAction = null;
    this.controls?.reset();
    this.unpauseRecovery.clear();
    this.playerView?.destroy();
    this.pauseOverlay?.destroy();
    this.playerSolidOcclusionMask?.destroy();
    this.playerSolidOcclusionMaskGfx?.destroy();
    this.debugGfx?.destroy();
    this.spawnWipe?.destroy();
    this.introIris?.destroy();
    this.refillEmitter?.destroy();
    this.lighting?.destroy();
    this.displacement?.destroy();
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

    const useEdges = !this.gameplayEdgesConsumed;
    this.controls.setCheck("left", this.actionHeld("left"));
    this.controls.setCheck("right", this.actionHeld("right"));
    this.controls.setCheck("up", this.actionHeld("up"));
    this.controls.setCheck("down", this.actionHeld("down"));
    this.controls.setCheck("jump", this.actionHeld("jump"));
    this.controls.setCheck("dash", this.actionHeld("dash"));
    this.controls.setCheck("crouchDash", this.actionHeld("crouchDash"));
    this.controls.setCheck("grab", this.actionHeld("grab"));

    if (useEdges) {
      this.queueControlEdges("jump", "jump");
      this.queueControlEdges("dash", "dash");
      this.queueControlEdges("crouchDash", "crouchDash");
      this.gameplayEdgesConsumed = true;
    }

    return this.controls.update(this.fixedDt);
  }

  private onDebugToggleDown(event: KeyboardEvent): void {
    if (event.repeat) return;
    if (this.captureKeyBindingAction !== null) return;
    this.debugEnabled = !this.debugEnabled;
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.repeat) {
      return;
    }

    const code = event.code;
    this.heldKeyCodes.add(code);
    this.pressedKeyCodes.add(code);
    this.releasedKeyCodes.delete(code);

    if (this.captureKeyBindingAction !== null || this.isHandledKey(code)) {
      event.preventDefault();
    }
  }

  private onKeyUp(event: KeyboardEvent): void {
    const code = event.code;
    this.heldKeyCodes.delete(code);
    this.releasedKeyCodes.add(code);

    if (this.captureKeyBindingAction !== null || this.isHandledKey(code)) {
      event.preventDefault();
    }
  }

  private queueControlEdges(action: KeyBindingAction, binding: Parameters<PlayerControls["queuePress"]>[0]): void {
    if (this.actionPressed(action)) {
      this.controls.queuePress(binding);
    }
    if (this.actionReleased(action)) {
      this.controls.queueRelease(binding);
    }
  }

  private actionHeld(action: KeyBindingAction): boolean {
    return this.bindingCodes(action).some((code) => this.heldKeyCodes.has(code));
  }

  private actionPressed(action: KeyBindingAction): boolean {
    return this.bindingCodes(action).some((code) => this.pressedKeyCodes.has(code));
  }

  private actionReleased(action: KeyBindingAction): boolean {
    return this.bindingCodes(action).some((code) => this.releasedKeyCodes.has(code));
  }

  private menuPressed(action: KeyBindingAction, fallbackCodes: readonly string[]): boolean {
    return this.actionPressed(action) || this.anyCodePressed(fallbackCodes);
  }

  private anyCodePressed(codes: readonly string[]): boolean {
    return codes.some((code) => this.pressedKeyCodes.has(code));
  }

  private bindingCodes(action: KeyBindingAction): readonly string[] {
    return this.gameOptions.keyboardBindings[action] ?? [];
  }

  private isHandledKey(code: string): boolean {
    return this.isBoundKey(code) ||
      MENU_UP_CODES.includes(code) ||
      MENU_DOWN_CODES.includes(code) ||
      MENU_LEFT_CODES.includes(code) ||
      MENU_RIGHT_CODES.includes(code) ||
      MENU_CONFIRM_CODES.includes(code) ||
      MENU_CANCEL_CODES.includes(code) ||
      MENU_CLEAR_CODES.includes(code);
  }

  private isBoundKey(code: string): boolean {
    return KEY_BINDING_DEFINITIONS.some(({ action }) => this.bindingCodes(action).includes(code));
  }

  private clearTransientKeyEdges(): void {
    this.pressedKeyCodes.clear();
    this.releasedKeyCodes.clear();
    this.gameplayEdgesConsumed = false;
  }

  private clearActionTransientKeyEdges(action: KeyBindingAction): void {
    for (const code of this.bindingCodes(action)) {
      this.pressedKeyCodes.delete(code);
      this.releasedKeyCodes.delete(code);
    }
  }

  private spawnInitialPlayer(): void {
    this.startIntroIris();
    this.revivePlayerAtCheckpoint("start", this.spawnX, this.spawnY, introIrisTotalDuration());
  }

  private beginNormalRespawn(): void {
    const snapshot = this.player.getSnapshot();
    if (!this.player.die({ x: 0, y: 0 }, true)) {
      return;
    }
    this.requestDeathShake();
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
  ): boolean {
    const knockback = this.spikeKnockback(snapshot, spikeDir);
    if (!this.player.die(this.spikeDirectionVector(spikeDir))) {
      return false;
    }
    this.requestDeathShake();
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
    return true;
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
    introDuration?: number,
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
        duration: introDuration,
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

  private startIntroIris(): void {
    this.introIrisState = { elapsed: 0 };
  }

  private advanceIntroIris(dt: number): void {
    if (!this.introIrisState) {
      return;
    }

    this.introIrisState.elapsed += dt;
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
    this.applyDisplacementEffects(stepSnapshot, stepEffects);
    effects.push(...stepEffects);
  }

  private applyDisplacementEffects(
    snapshot: ReturnType<Player["getSnapshot"]>,
    effects: readonly PlayerEffect[],
  ): void {
    for (const effect of effects) {
      if (effect.type === "dash_begin") {
        this.displacement.addBurst(snapshot.centerX, snapshot.centerY);
      }
    }
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

  private tryHandleBottomFallout(snapshot: ReturnType<Player["getSnapshot"]>): boolean {
    const bounds = this.currentRoom.bounds;
    if (snapshot.top <= bounds.y + bounds.h) {
      return false;
    }

    const roomBelow = findAdjacentRoom(this.rooms, this.currentRoom, "down", snapshot.centerX);
    if (roomBelow !== null) {
      return false;
    }

    if (this.beginBottomFalloutRespawn(snapshot)) {
      return true;
    }

    this.player.bounceFromBottom(bounds.y + bounds.h, this.actionHeld("jump"));
    return false;
  }

  private beginBottomFalloutRespawn(snapshot: ReturnType<Player["getSnapshot"]>): boolean {
    if (!this.player.die({ x: 0, y: 0 })) {
      return false;
    }
    this.requestDeathShake();
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

  private createPlayerSolidOcclusionMaskGraphics(): Phaser.GameObjects.Graphics {
    const graphics = this.make.graphics({ x: 0, y: 0 }, false);
    graphics.fillStyle(0xffffff, 1);

    // Fill playable space, so only the live player sprite is clipped when squash/stretch enters solids.
    for (let row = 0; row < this.world.rows; row++) {
      let runStart = -1;

      for (let col = 0; col <= this.world.cols; col++) {
        const visibleToPlayer = col < this.world.cols && tileAt(this.world, col, row) !== TILE_SOLID;
        if (visibleToPlayer && runStart < 0) {
          runStart = col;
        } else if (!visibleToPlayer && runStart >= 0) {
          graphics.fillRect(
            runStart * WORLD.tile,
            row * WORLD.tile,
            (col - runStart) * WORLD.tile,
            WORLD.tile,
          );
          runStart = -1;
        }
      }
    }

    return graphics;
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

  private renderIntroIris(snapshot: ReturnType<Player["getSnapshot"]>): void {
    const state = this.introIrisState;
    if (!state) {
      this.clearIntroIris();
      return;
    }

    const camera = this.cameras.main;
    const centerX = snapshot.centerX - camera.scrollX;
    const centerY = snapshot.centerY - camera.scrollY;
    const sample = sampleIntroIrisRadius(
      state.elapsed,
      this.introIrisMaxRadius(centerX, centerY),
    );
    if (sample.done) {
      this.introIrisState = null;
      this.clearIntroIris();
      return;
    }

    this.drawIntroIris(centerX, centerY, sample.radius);
  }

  private introIrisMaxRadius(centerX: number, centerY: number): number {
    return Math.max(
      Math.hypot(centerX, centerY),
      Math.hypot(VIEWPORT.width - centerX, centerY),
      Math.hypot(centerX, VIEWPORT.height - centerY),
      Math.hypot(VIEWPORT.width - centerX, VIEWPORT.height - centerY),
    ) + 2;
  }

  private drawIntroIris(centerX: number, centerY: number, radius: number): void {
    const rowHeight = INTRO_IRIS_VISUALS.scanlineHeight;
    const radiusSq = radius * radius;
    this.introIris.clear();
    this.introIris.fillStyle(INTRO_IRIS_VISUALS.color, 1);

    if (radius <= 0) {
      this.introIris.fillRect(0, 0, VIEWPORT.width, VIEWPORT.height);
      this.introIris.setVisible(true);
      return;
    }

    for (let y = 0; y < VIEWPORT.height; y += rowHeight) {
      const midY = y + rowHeight * 0.5;
      const dy = midY - centerY;
      if (Math.abs(dy) >= radius) {
        this.introIris.fillRect(0, y, VIEWPORT.width, rowHeight);
        continue;
      }

      const halfWidth = Math.sqrt(Math.max(0, radiusSq - dy * dy));
      const leftWidth = Math.max(0, Math.floor(centerX - halfWidth));
      const rightX = Math.min(VIEWPORT.width, Math.ceil(centerX + halfWidth));
      if (leftWidth > 0) {
        this.introIris.fillRect(0, y, leftWidth, rowHeight);
      }
      if (rightX < VIEWPORT.width) {
        this.introIris.fillRect(rightX, y, VIEWPORT.width - rightX, rowHeight);
      }
    }

    this.introIris.setVisible(true);
  }

  private clearIntroIris(): void {
    if (!this.introIris) {
      return;
    }

    this.introIris.clear();
    this.introIris.setVisible(false);
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

    const player = this.player.getPlayerColliderBounds();
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
    const playerLightOffsetY = snapshot.isCrouched
      ? PLAYER_LIGHT_OFFSET_Y.crouched
      : PLAYER_LIGHT_OFFSET_Y.normal;
    const lights: LightingSource[] = [
      {
        x: snapshot.x,
        y: snapshot.y + playerLightOffsetY,
        radius: 48,
        color: COLORS.dust,
        intensity: 0.15,
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
        this.drawDebugGrid(
          entity.collider,
          entity instanceof JumpThruTilesEntity ? DEBUG_JUMP_THRU_HEIGHT : entity.collider.cellHeight,
        );
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

  private drawDebugGrid(grid: Grid, debugCellHeight: number): void {
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
            h: debugCellHeight,
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

  private canOpenPauseMenu(): boolean {
    const snapshot = this.player.getSnapshot();
    if (this.roomTransition !== null || snapshot.dead) {
      return false;
    }

    return this.deathRespawnSequence === null || this.deathRespawnSequence.respawnStarted;
  }

  private createPauseRootMenu(): PauseActionMenu {
    const canRetry = this.canRetryFromPause();
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
          disabled: !canRetry,
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
    const infiniteStaminaOption: PauseMenuOption<boolean> = {
      label: "Infinite Stamina",
      values: ON_OFF_CHOICES,
      valueIndex: this.gameOptions.infiniteStamina ? 1 : 0,
    };
    const airDashesOption: PauseMenuOption<AirDashAssist> = {
      label: "Air Dashes",
      values: AIR_DASH_CHOICES,
      valueIndex: AIR_DASH_CHOICES.findIndex((choice) => choice.value === this.gameOptions.airDashes),
    };
    if (airDashesOption.valueIndex < 0) {
      airDashesOption.valueIndex = 0;
    }
    const invincibilityOption: PauseMenuOption<boolean> = {
      label: "Invincibility",
      values: ON_OFF_CHOICES,
      valueIndex: this.gameOptions.invincibility ? 1 : 0,
    };

    const draft: PauseOptionsMenu = {
      kind: "options",
      title: "OPTIONS",
      selectedIndex: 0,
      onCancel: (controller) => {
        const screenShakeEffects = currentPauseOptionValue(screenShakeOption);
        const dynamicHair = currentPauseOptionValue(dynamicHairOption);
        const infiniteStamina = currentPauseOptionValue(infiniteStaminaOption);
        const airDashes = currentPauseOptionValue(airDashesOption);
        const invincibility = currentPauseOptionValue(invincibilityOption);
        this.gameOptions = saveGameOptions({
          ...this.gameOptions,
          screenShakeEffects: screenShakeEffects ?? this.gameOptions.screenShakeEffects,
          dynamicHair: dynamicHair ?? this.gameOptions.dynamicHair,
          infiniteStamina: infiniteStamina ?? this.gameOptions.infiniteStamina,
          airDashes: airDashes ?? this.gameOptions.airDashes,
          invincibility: invincibility ?? this.gameOptions.invincibility,
        });
        this.player.setAssistOptions(this.gameOptions);
        this.playerView.setDynamicHairEnabled(this.gameOptions.dynamicHair);
        if (!this.gameOptions.screenShakeEffects) {
          this.stopScreenShake();
        }
        controller.pop();
      },
      items: [
        screenShakeOption,
        dynamicHairOption,
        {
          kind: "submenu",
          label: "Keyboard Config",
          activate: (controller) => {
            controller.push(this.createKeyboardConfigMenu());
          },
        },
        infiniteStaminaOption,
        airDashesOption,
        invincibilityOption,
      ],
    };
    return draft;
  }

  private createKeyboardConfigMenu(): PauseOptionsMenu {
    const items: PauseMenuOptionItem<KeyBindingAction>[] = [
      ...KEY_BINDING_DEFINITIONS.map<PauseMenuKeyBindingItem<KeyBindingAction>>(({ action, label }) => ({
        kind: "keybinding",
        label,
        action,
        keys: [...this.gameOptions.keyboardBindings[action]],
      })),
      {
        kind: "command",
        label: "Reset All to Defaults",
        activate: (controller) => {
          this.setKeyboardBindings(normalizeKeyBindings(DEFAULT_KEY_BINDINGS));
          this.refreshKeyboardConfigScreen(controller.current);
        },
      },
    ];

    return {
      kind: "options",
      title: "KEYBOARD CONFIG",
      selectedIndex: 0,
      onCancel: (controller) => {
        this.captureKeyBindingAction = null;
        controller.pop();
      },
      items,
    };
  }

  private setKeyboardBindings(bindings: KeyBindings): void {
    this.gameOptions = saveGameOptions({
      ...this.gameOptions,
      keyboardBindings: normalizeKeyBindings(bindings),
    });
  }

  private refreshKeyboardConfigScreen(screen: PauseOptionsMenu | PauseActionMenu | null): void {
    if (screen === null || screen.kind !== "options" || screen.title !== "KEYBOARD CONFIG") {
      return;
    }

    for (const item of screen.items) {
      if (isPauseKeyBindingItem(item)) {
        item.keys = [...this.gameOptions.keyboardBindings[item.action as KeyBindingAction]];
      }
    }
  }

  private updatePauseInput(): void {
    if (this.captureKeyBindingAction !== null) {
      this.updateKeyBindingCapture();
      return;
    }

    if (this.menuPressed("up", MENU_UP_CODES)) {
      this.pauseMenu.moveVertical(-1);
    }
    if (this.menuPressed("down", MENU_DOWN_CODES)) {
      this.pauseMenu.moveVertical(1);
    }
    if (this.menuPressed("left", MENU_LEFT_CODES)) {
      this.movePauseSelectionHorizontal(-1);
    }
    if (this.menuPressed("right", MENU_RIGHT_CODES)) {
      this.movePauseSelectionHorizontal(1);
    }
    if (this.anyCodePressed(MENU_CLEAR_CODES)) {
      this.clearSelectedKeyBindings();
    }
    if (this.menuPressed("confirm", MENU_CONFIRM_CODES)) {
      this.confirmPauseSelection();
      this.afterPauseMenuInteraction();
    }
    if (this.menuPressed("cancel", MENU_CANCEL_CODES)) {
      this.pauseMenu.cancel();
      this.afterPauseMenuInteraction();
    }
  }

  private updateKeyBindingCapture(): void {
    const code = this.firstPressedCode();
    if (code === null || this.captureKeyBindingAction === null) {
      return;
    }

    const action = this.captureKeyBindingAction;
    const bindings = normalizeKeyBindings(this.gameOptions.keyboardBindings);
    const keys = bindings[action];
    const existingIndex = keys.indexOf(code);
    if (existingIndex >= 0) {
      keys.splice(existingIndex, 1);
    } else {
      keys.push(code);
    }

    this.setKeyboardBindings(bindings);
    this.captureKeyBindingAction = null;
    this.refreshKeyboardConfigScreen(this.pauseMenu.current);
  }

  private firstPressedCode(): string | null {
    for (const code of this.pressedKeyCodes) {
      return code;
    }

    return null;
  }

  private movePauseSelectionHorizontal(direction: -1 | 1): void {
    const item = this.selectedPauseOptionItem();
    if (item && isPauseKeyBindingItem(item)) {
      this.clearSelectedKeyBindings();
      return;
    }

    this.pauseMenu.moveHorizontal(direction);
  }

  private confirmPauseSelection(): void {
    const item = this.selectedPauseOptionItem();
    if (item && isPauseKeyBindingItem(item)) {
      this.captureKeyBindingAction = item.action as KeyBindingAction;
      return;
    }

    this.pauseMenu.confirm();
  }

  private clearSelectedKeyBindings(): void {
    const item = this.selectedPauseOptionItem();
    if (!item || !isPauseKeyBindingItem(item)) {
      return;
    }

    const action = item.action as KeyBindingAction;
    const bindings = normalizeKeyBindings(this.gameOptions.keyboardBindings);
    bindings[action] = [];
    this.setKeyboardBindings(bindings);
    item.keys = [];
    if (this.captureKeyBindingAction === action) {
      this.captureKeyBindingAction = null;
    }
  }

  private selectedPauseOptionItem(): PauseMenuOptionItem<unknown> | null {
    const screen = this.pauseMenu.current;
    if (screen === null || screen.kind !== "options") {
      return null;
    }

    return screen.items[screen.selectedIndex] ?? null;
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
    if (!this.canRetryFromPause()) {
      return;
    }

    this.beginNormalRespawn();
  }

  private canRetryFromPause(): boolean {
    return this.deathRespawnSequence === null && this.player.canRetry;
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
    this.renderIntroIris(snapshot);
  }

  private advanceUnpauseRecovery(rawFrameDt: number): boolean {
    this.accumulator = addFloat(this.accumulator, rawFrameDt);

    while (this.unpauseRecovery.active && this.accumulator >= this.fixedDt) {
      const result = this.unpauseRecovery.step(this.currentUnpauseRecoveryHeldState());

      if (result.openPause) {
        this.accumulator = 0;
        if (this.canOpenPauseMenu()) {
          this.openPauseMenu();
        } else {
          this.clearActionTransientKeyEdges("pause");
          this.resumePauseManagedEffects();
          return false;
        }
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
      if (result.queueCrouchDash) {
        this.controls.queuePress("crouchDash");
      }
      this.resumePauseManagedEffects();
      return false;
    }

    return this.unpauseRecovery.active;
  }

  private currentUnpauseRecoveryHeldState(): { pause: boolean; jump: boolean; dash: boolean; crouchDash: boolean } {
    return {
      pause: this.actionHeld("pause"),
      jump: this.actionHeld("jump"),
      dash: this.actionHeld("dash"),
      crouchDash: this.actionHeld("crouchDash"),
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
