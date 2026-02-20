import Phaser from "phaser";
import { COLORS, PLAYER_CONFIG, PLAYER_GEOMETRY, VIEWPORT, WORLD } from "./constants";
import { EntityWorld, spikeTriangles } from "./entities/EntityWorld";
import { RefillEntity, RefillType } from "./entities/types";
import { TILE_JUMP_THROUGH, tileAt } from "./grid";
import { parseLevel } from "./level";
import { Player } from "./player/Player";
import { InputState, PlayerEffect } from "./player/types";
import { PlayerView } from "./view/PlayerView";

interface RefillView {
  entity: RefillEntity;
  glow: Phaser.GameObjects.Ellipse;
  body: Phaser.GameObjects.Rectangle;
}

type CameraLockMode = "none" | "finalBoss" | "boostSequence";

const CAMERA_SMOOTH_BASE = 0.01;
const CAMERA_BOOST_UPWARD_MAX_Y_OFFSET = 48;

interface CameraKillbox {
  x: number;
  y: number;
  w: number;
  h: number;
  active?: boolean;
}

export class GameScene extends Phaser.Scene {
  private player!: Player;
  private playerView!: PlayerView;
  private world!: EntityWorld;
  private spawnX!: number;
  private spawnY!: number;

  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private pendingJumpEdges: Array<"down" | "up"> = [];
  private pendingDashPresses = 0;

  private accumulator = 0;
  private readonly fixedDt = 1 / 120;
  private readonly maxSteps = 6;

  private tileGfx!: Phaser.GameObjects.Graphics;
  private hudText!: Phaser.GameObjects.Text;
  private refills: RefillView[] = [];
  private refillEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private cameraOffset = new Phaser.Math.Vector2(0, 0);
  private cameraAnchor = new Phaser.Math.Vector2(0, 0);
  private cameraAnchorLerp = new Phaser.Math.Vector2(0, 0);
  private cameraAnchorIgnoreX = false;
  private cameraAnchorIgnoreY = false;
  private forceCameraUpdate = false;
  private forceCameraSnapNextFrame = true;
  private cameraLockMode: CameraLockMode = "none";
  private cameraUpwardMaxY = Number.POSITIVE_INFINITY;
  private cameraKillboxes: CameraKillbox[] = [];

  constructor() {
    super("GameScene");
  }

  create(): void {
    const level = parseLevel();
    this.world = level.world;
    this.spawnX = level.spawnX;
    this.spawnY = level.spawnY;

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
      a: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      d: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      w: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      s: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      grab: kb.addKey(Phaser.Input.Keyboard.KeyCodes.Z),
      dash: kb.addKey(Phaser.Input.Keyboard.KeyCodes.X),
      jump: kb.addKey(Phaser.Input.Keyboard.KeyCodes.C),
      restart: kb.addKey(Phaser.Input.Keyboard.KeyCodes.R),
    };
    this.keys.jump.on("down", this.onJumpDown, this);
    this.keys.jump.on("up", this.onJumpUp, this);
    this.keys.dash.on("down", this.onDashDown, this);

    this.hudText = this.add
      .text(8, 8, "", {
        fontFamily: "monospace",
        fontSize: "13px",
        color: "#8888bb",
      })
      .setDepth(10)
      .setScrollFactor(0);

    this.add
      .text(
        VIEWPORT.width - 8,
        VIEWPORT.height - 8,
        "← → ↑ ↓  |  C: Jump  |  X: Dash  |  Z: Grab  |  R: Reset",
        {
          fontFamily: "monospace",
          fontSize: "11px",
          color: "#444466",
        },
      )
      .setOrigin(1, 1)
      .setDepth(10)
      .setScrollFactor(0);
  }

  update(_time: number, delta: number): void {
    const frameDt = Math.min(delta / 1000, 0.1);
    this.accumulator += frameDt;

    if (this.keys.restart.isDown) {
      this.player.hardRespawn(this.spawnX, this.spawnY);
      this.world.resetTransientState();
      this.syncRefillViews();
      this.clearInputEdgeQueues();
      this.forceCameraSnap();
      this.cameras.main.fadeIn(80, 10, 10, 20);
      this.accumulator = 0;
    }

    const effects: PlayerEffect[] = [];
    let steps = 0;

    while (this.accumulator >= this.fixedDt && steps < this.maxSteps) {
      this.world.update(this.fixedDt, this.time.now / 1000);
      this.player.update(this.fixedDt, this.gatherStepInput());
      this.updateRefills();

      let stepEffects = this.player.consumeEffects();
      const fellOut = stepEffects.some((e) => e.type === "fell_out");
      const spiked = this.world.collidesWithSpike(this.player.getHurtboxBounds()) !== null;
      if (fellOut || spiked) {
        this.player.hardRespawn(this.spawnX, this.spawnY);
        this.world.resetTransientState();
        this.syncRefillViews();
        this.clearInputEdgeQueues();
        this.forceCameraSnap();
        if (spiked) {
          this.cameras.main.flash(180, 0, 0, 0, false);
        } else {
          this.cameras.main.fadeIn(120, 10, 10, 20);
        }
        stepEffects = stepEffects.concat(this.player.consumeEffects());
        this.accumulator = 0;
      }

      effects.push(...stepEffects);
      this.accumulator -= this.fixedDt;
      steps++;
    }

    if (steps === this.maxSteps) {
      this.accumulator = 0;
    }

    const snapshot = this.player.getSnapshot();
    this.playerView.render(snapshot, effects, frameDt);
    this.updateCamera(snapshot, frameDt);

    this.updateHUD(snapshot, effects);
  }

  setCameraOffset(x: number, y: number): void {
    this.cameraOffset.set(x, y);
  }

  setCameraAnchor(
    x: number,
    y: number,
    lerpX: number,
    lerpY: number,
    opts?: { ignoreX?: boolean; ignoreY?: boolean },
  ): void {
    this.cameraAnchor.set(x, y);
    this.cameraAnchorLerp.set(Phaser.Math.Clamp(lerpX, 0, 1), Phaser.Math.Clamp(lerpY, 0, 1));
    this.cameraAnchorIgnoreX = !!opts?.ignoreX;
    this.cameraAnchorIgnoreY = !!opts?.ignoreY;
  }

  clearCameraAnchor(): void {
    this.cameraAnchorLerp.set(0, 0);
    this.cameraAnchorIgnoreX = false;
    this.cameraAnchorIgnoreY = false;
  }

  setCameraLockMode(mode: CameraLockMode): void {
    this.cameraLockMode = mode;
    if (mode !== "boostSequence") {
      this.cameraUpwardMaxY = Number.POSITIVE_INFINITY;
    }
  }

  setForceCameraUpdate(force: boolean): void {
    this.forceCameraUpdate = force;
  }

  setCameraKillboxes(killboxes: ReadonlyArray<CameraKillbox>): void {
    this.cameraKillboxes = killboxes.map((box) => ({ ...box }));
  }

  clearCameraKillboxes(): void {
    this.cameraKillboxes = [];
  }

  forceCameraSnap(): void {
    this.forceCameraSnapNextFrame = true;
    this.cameraUpwardMaxY = Number.POSITIVE_INFINITY;
  }

  shutdown(): void {
    if (this.keys) {
      this.keys.jump.off("down", this.onJumpDown, this);
      this.keys.jump.off("up", this.onJumpUp, this);
      this.keys.dash.off("down", this.onDashDown, this);
    }
    this.clearInputEdgeQueues();
    this.playerView?.destroy();
    this.refillEmitter?.destroy();
    for (const refill of this.refills) {
      refill.glow.destroy();
      refill.body.destroy();
    }
    this.refills = [];
  }

  private gatherStepInput(): InputState {
    let x = 0;
    let y = 0;
    if (this.keys.left.isDown || this.keys.a.isDown) x -= 1;
    if (this.keys.right.isDown || this.keys.d.isDown) x += 1;
    if (this.keys.up.isDown || this.keys.w.isDown) y -= 1;
    if (this.keys.down.isDown || this.keys.s.isDown) y += 1;

    const jump = this.keys.jump.isDown;
    const jumpEdge = this.pendingJumpEdges.shift();
    const jumpPressed = jumpEdge === "down";
    const jumpReleased = jumpEdge === "up";
    const dashPressed = this.pendingDashPresses > 0;
    if (dashPressed) this.pendingDashPresses--;
    const grab = this.keys.grab.isDown;

    return {
      x,
      y,
      jump,
      jumpPressed,
      jumpReleased,
      dashPressed,
      grab,
    };
  }

  private onJumpDown(event: KeyboardEvent): void {
    if (event.repeat) return;
    this.pendingJumpEdges.push("down");
  }

  private onJumpUp(): void {
    this.pendingJumpEdges.push("up");
  }

  private onDashDown(event: KeyboardEvent): void {
    if (event.repeat) return;
    this.pendingDashPresses++;
  }

  private clearInputEdgeQueues(): void {
    this.pendingJumpEdges.length = 0;
    this.pendingDashPresses = 0;
  }

  private updateCamera(snapshot: ReturnType<Player["getSnapshot"]>, dt: number): void {
    const camera = this.cameras.main;
    const target = this.computeCameraTarget(snapshot, camera);

    let nextX = target.x;
    let nextY = target.y;

    if (!this.forceCameraSnapNextFrame) {
      const smooth = 1 - Math.pow(CAMERA_SMOOTH_BASE, dt);
      nextX = camera.scrollX + (target.x - camera.scrollX) * smooth;
      nextY = camera.scrollY + (target.y - camera.scrollY) * smooth;
    }

    camera.setScroll(nextX, nextY);
    this.forceCameraSnapNextFrame = false;
  }

  private computeCameraTarget(
    snapshot: ReturnType<Player["getSnapshot"]>,
    camera: Phaser.Cameras.Scene2D.Camera,
  ): Phaser.Math.Vector2 {
    let targetX = snapshot.x + PLAYER_GEOMETRY.hitboxW * 0.5 - VIEWPORT.width * 0.5;
    let targetY = snapshot.y + snapshot.hitboxH * 0.5 - VIEWPORT.height * 0.5;

    targetX += this.cameraOffset.x;
    targetY += this.cameraOffset.y;

    if (this.cameraAnchorLerp.lengthSq() > 0) {
      if (this.cameraAnchorIgnoreX && !this.cameraAnchorIgnoreY) {
        targetY = Phaser.Math.Linear(targetY, this.cameraAnchor.y, this.cameraAnchorLerp.y);
      } else if (!this.cameraAnchorIgnoreX && this.cameraAnchorIgnoreY) {
        targetX = Phaser.Math.Linear(targetX, this.cameraAnchor.x, this.cameraAnchorLerp.x);
      } else if (this.cameraAnchorLerp.x === this.cameraAnchorLerp.y) {
        targetX = Phaser.Math.Linear(targetX, this.cameraAnchor.x, this.cameraAnchorLerp.x);
        targetY = Phaser.Math.Linear(targetY, this.cameraAnchor.y, this.cameraAnchorLerp.y);
      } else {
        targetX = Phaser.Math.Linear(targetX, this.cameraAnchor.x, this.cameraAnchorLerp.x);
        targetY = Phaser.Math.Linear(targetY, this.cameraAnchor.y, this.cameraAnchorLerp.y);
      }
    }

    const maxX = Math.max(0, this.world.cols * WORLD.tile - VIEWPORT.width);
    const maxY = Math.max(0, this.world.rows * WORLD.tile - VIEWPORT.height);
    let clampedX = Phaser.Math.Clamp(targetX, 0, maxX);
    let clampedY = Phaser.Math.Clamp(targetY, 0, maxY);

    if (this.cameraLockMode !== "none") {
      if (this.cameraLockMode !== "boostSequence") {
        clampedX = Math.max(clampedX, camera.scrollX);
      }

      if (this.cameraLockMode === "finalBoss") {
        clampedY = Math.max(clampedY, camera.scrollY);
      } else if (this.cameraLockMode === "boostSequence") {
        this.cameraUpwardMaxY = Math.min(
          camera.scrollY + CAMERA_BOOST_UPWARD_MAX_Y_OFFSET,
          this.cameraUpwardMaxY,
        );
        clampedY = Math.min(clampedY, this.cameraUpwardMaxY);
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
    if (this.cameraKillboxes.length === 0) return targetY;

    let safeY = targetY;
    const playerLeft = snapshot.x;
    const playerRight = snapshot.x + PLAYER_GEOMETRY.hitboxW;
    const playerTop = snapshot.y;

    for (const box of this.cameraKillboxes) {
      if (box.active === false) continue;

      const overlapsX = playerRight > box.x && playerLeft < box.x + box.w;
      if (!overlapsX) continue;
      if (playerTop >= box.y + box.h) continue;

      safeY = Math.min(safeY, box.y - VIEWPORT.height);
    }

    return Phaser.Math.Clamp(safeY, 0, maxY);
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
          g.fillStyle(COLORS.tile, 1);
          g.fillRect(x, y + 2, WORLD.tile, 3);
          g.fillStyle(COLORS.tileEdge, 1);
          g.fillRect(x, y, WORLD.tile, 2);
        } else {
          g.fillStyle(COLORS.tile, 1);
          g.fillRect(x, y, WORLD.tile, WORLD.tile);
          if (tileAt(this.world, c, r - 1) === 0) {
            g.fillStyle(COLORS.tileEdge, 1);
            g.fillRect(x, y, WORLD.tile, 2);
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

  private createRefills(spawns: ReadonlyArray<RefillEntity>): void {
    for (const spawn of spawns) {
      const color = this.refillColor(spawn.type);
      const glow = this.add
        .ellipse(spawn.x, spawn.y, 14, 14, color, 0.16)
        .setDepth(2);
      const body = this.add
        .rectangle(spawn.x, spawn.y, 8, 8, color, 0.95)
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

  private updateRefills(): void {
    if (this.refills.length === 0) return;

    const player = this.player.getHitboxBounds();
    const consumed = this.world.consumeTouchingRefills(player, (target) => this.player.tryRefill(target));
    for (const refill of consumed) {
      this.refillEmitter.setParticleTint(this.refillColor(refill.type));
      this.refillEmitter.emitParticleAt(refill.x, refill.y, 7);
      this.cameras.main.shake(40, 0.0012);
    }

    this.syncRefillViews();
  }

  private syncRefillViews(): void {
    for (const refill of this.refills) {
      refill.glow.setVisible(refill.entity.active);
      refill.body.setVisible(refill.entity.active);
      refill.glow.setPosition(refill.entity.x, refill.entity.y);
      refill.body.setPosition(refill.entity.x, refill.entity.y);
    }
  }

  private refillColor(type: RefillType): number {
    if (type === "max") return 0x8af6ff;
    if (type <= 1) return COLORS.playerOneDash;
    if (type === 2) return COLORS.playerTwoDash;
    return COLORS.playerManyDash;
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
        ? "  WALL-SLIDE"
        : "";
    const events = effects
      .map((e) => {
        let suffix = "";
        if (e.extended) suffix += "+ext";
        if (e.reverse) suffix += "+rev";
        return `${e.type}${suffix}`;
      })
      .join(", ");

    this.hudText.setText(
      `State: ${state}${wallSliding}` +
        `  |  Dashes: ${snapshot.dashesLeft}` +
        `  |  Stam: ${snapshot.stamina.toFixed(0)}` +
        `  |  Vel: (${snapshot.vx.toFixed(0)}, ${snapshot.vy.toFixed(0)})` +
        `  |  Cam: (${this.cameras.main.scrollX.toFixed(0)}, ${this.cameras.main.scrollY.toFixed(0)})` +
        `  |  ${snapshot.onGround ? "GROUND" : "AIR"}` +
        `${events ? `\nEffects: ${events}` : ""}`,
    );
  }
}
