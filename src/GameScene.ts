import Phaser from "phaser";
import { COLORS, PLAYER_CONFIG, VIEWPORT, WORLD } from "./constants";
import { EntityWorld, spikeTriangles } from "./entities/EntityWorld";
import { type RefillPickupEntity } from "./entities/runtime";
import { CameraKillboxSpec, CameraLockMode, RefillType } from "./entities/types";
import { TILE_JUMP_THROUGH, tileAt } from "./grid";
import { parseLevel } from "./level";
import { PlayerControls } from "./input/PlayerControls";
import { addFloat, approach, maxFloat, stepTimer, subFloat, toFloat } from "./player/math";
import { Player } from "./player/Player";
import { InputState, PlayerEffect } from "./player/types";
import { PlayerView } from "./view/PlayerView";

interface RefillView {
  entity: RefillPickupEntity;
  glow: Phaser.GameObjects.Ellipse;
  body: Phaser.GameObjects.Rectangle;
}

const CAMERA_SMOOTH_BASE = 0.01;
const CAMERA_SETTLE_EPSILON = 0.75;
const CAMERA_BOOST_UPWARD_MAX_Y_OFFSET = 48;
const CAMERA_FOOT_ANCHOR_Y = Math.round(VIEWPORT.height * 0.46);
const CAMERA_PLAYER_MARGIN_X = 12;
const CAMERA_PLAYER_MARGIN_TOP = 18;
const CAMERA_PLAYER_MARGIN_BOTTOM = 20;
const CAMERA_VERTICAL_VISIBILITY_CATCHUP = 60;
const TILE_EDGE_HEIGHT = Math.max(1, Math.round(WORLD.tile * 0.125));
const JUMP_THRU_EDGE_HEIGHT = TILE_EDGE_HEIGHT;
const JUMP_THRU_BODY_HEIGHT = Math.max(1, Math.round(WORLD.tile * 0.1875));
const REFILL_GLOW_SIZE = Math.max(7, Math.round(WORLD.tile * 0.875));
const REFILL_BODY_SIZE = Math.max(4, Math.round(WORLD.tile * 0.5));
const REFILL_CONSUME_FREEZE_TIME = 0.05;

export class GameScene extends Phaser.Scene {
  private player!: Player;
  private playerView!: PlayerView;
  private world!: EntityWorld;
  private spawnX!: number;
  private spawnY!: number;
  private tileDepths!: Int32Array;

  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private controls!: PlayerControls;

  private accumulator = 0;
  private readonly fixedDt = toFloat(1 / 60);
  private readonly maxSteps = 6;
  private freezeTimer = 0;

  private tileGfx!: Phaser.GameObjects.Graphics;
  private hudText!: Phaser.GameObjects.Text;
  private helpText!: Phaser.GameObjects.Text;
  private refills: RefillView[] = [];
  private refillEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private forceCameraUpdate = false;
  private forceCameraSnapNextFrame = true;

  constructor() {
    super("GameScene");
  }

  create(): void {
    const level = parseLevel();
    this.world = level.world;
    this.spawnX = level.spawnX;
    this.spawnY = level.spawnY;

    this.computeTileDepths();
    this.tileGfx = this.add.graphics();
    this.drawTiles();

    this.player = new Player(this.spawnX, this.spawnY, this.world, PLAYER_CONFIG);
    this.playerView = new PlayerView(this);
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

    this.helpText = this.add
      .text(
        VIEWPORT.width - 8,
        VIEWPORT.height - 8,
        "Move: arrow keys\nC jump  X dash  Z grab  R reset",
        {
          fontFamily: "monospace",
          fontSize: "9px",
          color: "#666699",
          align: "right",
          lineSpacing: -2,
          wordWrap: { width: 168, useAdvancedWrap: true },
        },
      )
      .setOrigin(1, 1)
      .setDepth(10)
      .setScrollFactor(0);
  }

  update(_time: number, delta: number): void {
    const rawFrameDt = toFloat(Math.min(delta / 1000, 0.1));

    if (this.keys.restart.isDown) {
      this.player.hardRespawn(this.spawnX, this.spawnY);
      this.world.resetTransientState();
      this.syncRefillViews();
      this.controls.clearTransientState();
      this.forceCameraSnap();
      this.cameras.main.fadeIn(80, 10, 10, 20);
      this.accumulator = 0;
      this.freezeTimer = 0;
    }

    const effects: PlayerEffect[] = [];

    if (this.freezeTimer > 0) {
      this.freezeTimer = stepTimer(this.freezeTimer, rawFrameDt);
      const snapshot = this.player.getSnapshot();
      this.playerView.render(snapshot);
      this.updateHUD(snapshot, effects);
      return;
    }

    this.accumulator = addFloat(this.accumulator, rawFrameDt);
    let steps = 0;

    while (this.accumulator >= this.fixedDt && steps < this.maxSteps) {
      this.world.update(this.fixedDt, this.time.now / 1000);
      this.player.update(this.fixedDt, this.gatherStepInput());
      const freeze = this.player.consumeFreezeRequest();
      const refillFreeze = this.updateRefills();

      let stepEffects = this.player.consumeEffects();
      const fellOut = stepEffects.some((e) => e.type === "fell_out");
      const stepSnapshot = this.player.getSnapshot();
      const spiked = this.world.collidesWithSpike(
        this.player.getHurtboxBounds(),
        stepSnapshot.vx,
        stepSnapshot.vy,
      ) !== null;
      if (fellOut || spiked) {
        this.player.hardRespawn(this.spawnX, this.spawnY);
        this.world.resetTransientState();
        this.syncRefillViews();
        this.controls.clearTransientState();
        this.forceCameraSnap();
        if (spiked) {
          this.cameras.main.flash(180, 0, 0, 0, false);
        } else {
          this.cameras.main.fadeIn(120, 10, 10, 20);
        }
        stepEffects = stepEffects.concat(this.player.consumeEffects());
        this.accumulator = 0;
      }

      const snapshot = this.player.getSnapshot();
      this.playerView.tick(snapshot, stepEffects, this.fixedDt);
      this.updateCamera(snapshot, this.fixedDt);
      effects.push(...stepEffects);
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

    this.updateHUD(snapshot, effects);
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
    this.cameras.main.shake(45, intensity);
  }

  shutdown(): void {
    if (this.keys) {
      this.keys.jump.off("down", this.onJumpDown, this);
      this.keys.jump.off("up", this.onJumpUp, this);
      this.keys.dash.off("down", this.onDashDown, this);
    }
    this.controls?.reset();
    this.playerView?.destroy();
    this.refillEmitter?.destroy();
    for (const refill of this.refills) {
      refill.glow.destroy();
      refill.body.destroy();
    }
    this.refills = [];
  }

  private gatherStepInput(): InputState {
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
    this.controls.queuePress("jump");
  }

  private onJumpUp(): void {
    this.controls.queueRelease("jump");
  }

  private onDashDown(event: KeyboardEvent): void {
    if (event.repeat) return;
    this.controls.queuePress("dash");
  }

  private updateCamera(snapshot: ReturnType<Player["getSnapshot"]>, dt: number): void {
    const camera = this.cameras.main;
    const target = this.computeCameraTarget(snapshot, camera);
    const maxX = Math.max(0, this.world.cols * WORLD.tile - VIEWPORT.width);
    const maxY = Math.max(0, this.world.rows * WORLD.tile - VIEWPORT.height);

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
    nextX = this.keepPlayerHorizontallyVisible(snapshot, nextX, maxX);
    nextY = this.keepPlayerVerticallyVisible(snapshot, nextY, maxY, dt);

    camera.setScroll(nextX, nextY);
    this.forceCameraSnapNextFrame = false;
  }

  private keepPlayerHorizontallyVisible(
    snapshot: ReturnType<Player["getSnapshot"]>,
    scrollX: number,
    maxX: number,
  ): number {
    const minScrollX = snapshot.right - (VIEWPORT.width - CAMERA_PLAYER_MARGIN_X);
    const maxScrollX = snapshot.left - CAMERA_PLAYER_MARGIN_X;
    return Phaser.Math.Clamp(Phaser.Math.Clamp(scrollX, minScrollX, maxScrollX), 0, maxX);
  }

  private keepPlayerVerticallyVisible(
    snapshot: ReturnType<Player["getSnapshot"]>,
    scrollY: number,
    maxY: number,
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

    return Phaser.Math.Clamp(nextY, 0, maxY);
  }

  private computeCameraTarget(
    snapshot: ReturnType<Player["getSnapshot"]>,
    camera: Phaser.Cameras.Scene2D.Camera,
  ): Phaser.Math.Vector2 {
    const controller = this.world.cameraController;
    let targetX = snapshot.centerX - VIEWPORT.width * 0.5;
    let targetY = snapshot.bottom - CAMERA_FOOT_ANCHOR_Y;

    targetX += controller.offsetX;
    targetY += controller.offsetY;

    if (controller.anchorLerpX > 0 || controller.anchorLerpY > 0) {
      if (controller.anchorIgnoreX && !controller.anchorIgnoreY) {
        targetY = Phaser.Math.Linear(targetY, controller.anchorY, controller.anchorLerpY);
      } else if (!controller.anchorIgnoreX && controller.anchorIgnoreY) {
        targetX = Phaser.Math.Linear(targetX, controller.anchorX, controller.anchorLerpX);
      } else if (controller.anchorLerpX === controller.anchorLerpY) {
        targetX = Phaser.Math.Linear(targetX, controller.anchorX, controller.anchorLerpX);
        targetY = Phaser.Math.Linear(targetY, controller.anchorY, controller.anchorLerpY);
      } else {
        targetX = Phaser.Math.Linear(targetX, controller.anchorX, controller.anchorLerpX);
        targetY = Phaser.Math.Linear(targetY, controller.anchorY, controller.anchorLerpY);
      }
    }

    const maxX = Math.max(0, this.world.cols * WORLD.tile - VIEWPORT.width);
    const maxY = Math.max(0, this.world.rows * WORLD.tile - VIEWPORT.height);
    let clampedX = Phaser.Math.Clamp(targetX, 0, maxX);
    let clampedY = Phaser.Math.Clamp(targetY, 0, maxY);

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

    clampedY = this.applyKillboxSafety(snapshot, clampedY, maxY);
    return new Phaser.Math.Vector2(clampedX, clampedY);
  }

  private applyKillboxSafety(
    snapshot: ReturnType<Player["getSnapshot"]>,
    targetY: number,
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

    return Phaser.Math.Clamp(safeY, 0, maxY);
  }

  private computeTileDepths(): void {
    this.tileDepths = new Int32Array(WORLD.cols * WORLD.rows);
    this.tileDepths.fill(9999);
    const queue: number[] = [];

    for (let r = 0; r < WORLD.rows; r++) {
      for (let c = 0; c < WORLD.cols; c++) {
        const t = tileAt(this.world, c, r);
        if (t === 0 || t === TILE_JUMP_THROUGH) {
          const idx = r * WORLD.cols + c;
          this.tileDepths[idx] = 0;
          queue.push(idx);
        }
      }
    }

    let head = 0;
    const dirs = [-1, 0, 1, 0, 0, -1, 0, 1];
    while (head < queue.length) {
      const idx = queue[head++];
      const r = Math.floor(idx / WORLD.cols);
      const c = idx % WORLD.cols;
      const d = this.tileDepths[idx];

      for (let i = 0; i < 4; i++) {
        const nr = r + dirs[i * 2 + 1];
        const nc = c + dirs[i * 2];
        if (nr >= 0 && nr < WORLD.rows && nc >= 0 && nc < WORLD.cols) {
          const nIdx = nr * WORLD.cols + nc;
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
    for (let r = 0; r < WORLD.rows; r++) {
      for (let c = 0; c < WORLD.cols; c++) {
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
          const depth = this.tileDepths[r * WORLD.cols + c];
          
          if (depth === 1) {
            g.fillStyle(COLORS.earth0, 1);
            g.fillRect(x, y, WORLD.tile, WORLD.tile);
            
            g.fillStyle(COLORS.earth1, 1);
            g.fillRect(x, y + 3, WORLD.tile, 2);
            g.fillRect(x + 3, y, 2, WORLD.tile);
            
            g.fillStyle(COLORS.earthHighlight, 1);
            if (r > 0 && this.tileDepths[(r - 1) * WORLD.cols + c] === 0) {
              g.fillRect(x, y, WORLD.tile, 1);
            }
            if (r < WORLD.rows - 1 && this.tileDepths[(r + 1) * WORLD.cols + c] === 0) {
              g.fillRect(x, y + WORLD.tile - 1, WORLD.tile, 1);
            }
            if (c > 0 && this.tileDepths[r * WORLD.cols + c - 1] === 0) {
              g.fillRect(x, y, 1, WORLD.tile);
            }
            if (c < WORLD.cols - 1 && this.tileDepths[r * WORLD.cols + c + 1] === 0) {
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
      this.cameras.main.shake(40, 0.0012);
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

  private updateHUD(snapshot: ReturnType<Player["getSnapshot"]>, effects: PlayerEffect[]): void {
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

    const lines = [
      `${state}${wallSliding}  ${snapshot.onGround ? "GROUND" : "AIR"}  D:${snapshot.dashesLeft}  ST:${snapshot.stamina.toFixed(0)}`,
      `VEL ${snapshot.vx.toFixed(0)}, ${snapshot.vy.toFixed(0)}  CAM ${this.cameras.main.scrollX.toFixed(0)}, ${this.cameras.main.scrollY.toFixed(0)}`,
    ];
    if (events) {
      lines.push(`FX ${events}`);
    }

    this.hudText.setText(lines.join("\n"));
  }
}
