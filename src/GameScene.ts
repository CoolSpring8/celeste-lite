import Phaser from "phaser";
import { COLORS, PLAYER_CONFIG, PLAYER_GEOMETRY, VIEWPORT, WORLD } from "./constants";
import { TILE_JUMP_THROUGH, tileAt } from "./grid";
import { parseLevel, RefillType } from "./level";
import { Player } from "./player/Player";
import { InputState, PlayerEffect } from "./player/types";
import { PlayerView } from "./view/PlayerView";

interface RefillEntity {
  x: number;
  y: number;
  baseY: number;
  type: RefillType;
  active: boolean;
  respawnTimer: number;
  glow: Phaser.GameObjects.Ellipse;
  body: Phaser.GameObjects.Rectangle;
}

export class GameScene extends Phaser.Scene {
  private player!: Player;
  private playerView!: PlayerView;
  private grid!: ReturnType<typeof parseLevel>["grid"];
  private spawnX!: number;
  private spawnY!: number;

  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private prevJump = false;
  private prevDash = false;

  private accumulator = 0;
  private readonly fixedDt = 1 / 120;
  private readonly maxSteps = 6;

  private tileGfx!: Phaser.GameObjects.Graphics;
  private hudText!: Phaser.GameObjects.Text;
  private cameraTarget!: Phaser.GameObjects.Zone;
  private refills: RefillEntity[] = [];
  private refillEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor() {
    super("GameScene");
  }

  create(): void {
    const level = parseLevel();
    this.grid = level.grid;
    this.spawnX = level.spawnX;
    this.spawnY = level.spawnY;

    this.tileGfx = this.add.graphics();
    this.drawTiles();

    this.player = new Player(this.spawnX, this.spawnY, this.grid, PLAYER_CONFIG);
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
    this.createRefills(level.refills);

    this.cameraTarget = this.add.zone(this.spawnX, this.spawnY, 1, 1);
    this.cameras.main.startFollow(this.cameraTarget, true, 0.15, 0.15);
    this.cameras.main.setDeadzone(80, 50);
    this.cameras.main.roundPixels = true;

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

    const input = this.gatherInput();

    if (this.keys.restart.isDown) {
      this.player.hardRespawn(this.spawnX, this.spawnY);
      this.resetRefills();
      this.cameras.main.fadeIn(80, 10, 10, 20);
      this.accumulator = 0;
    }

    const effects: PlayerEffect[] = [];
    let steps = 0;

    while (this.accumulator >= this.fixedDt && steps < this.maxSteps) {
      this.player.update(this.fixedDt, input);
      this.updateRefills(this.fixedDt);

      let stepEffects = this.player.consumeEffects();
      const fellOut = stepEffects.some((e) => e.type === "fell_out");
      if (fellOut) {
        this.player.hardRespawn(this.spawnX, this.spawnY);
        this.resetRefills();
        this.cameras.main.fadeIn(120, 10, 10, 20);
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

    this.cameraTarget.setPosition(
      snapshot.x + PLAYER_GEOMETRY.hitboxW / 2,
      snapshot.y + snapshot.hitboxH / 2,
    );

    this.prevJump = input.jump;
    this.prevDash = this.keys.dash.isDown;

    this.updateHUD(snapshot, effects);
  }

  shutdown(): void {
    this.playerView?.destroy();
    this.refillEmitter?.destroy();
    for (const refill of this.refills) {
      refill.glow.destroy();
      refill.body.destroy();
    }
    this.refills = [];
  }

  private gatherInput(): InputState {
    let x = 0;
    let y = 0;
    if (this.keys.left.isDown || this.keys.a.isDown) x -= 1;
    if (this.keys.right.isDown || this.keys.d.isDown) x += 1;
    if (this.keys.up.isDown || this.keys.w.isDown) y -= 1;
    if (this.keys.down.isDown || this.keys.s.isDown) y += 1;

    const jump = this.keys.jump.isDown;
    const dash = this.keys.dash.isDown;
    const grab = this.keys.grab.isDown;

    return {
      x,
      y,
      jump,
      jumpPressed: jump && !this.prevJump,
      jumpReleased: !jump && this.prevJump,
      dashPressed: dash && !this.prevDash,
      grab,
    };
  }

  private drawTiles(): void {
    const g = this.tileGfx;
    for (let r = 0; r < WORLD.rows; r++) {
      for (let c = 0; c < WORLD.cols; c++) {
        const x = c * WORLD.tile;
        const y = r * WORLD.tile;
        const tile = tileAt(this.grid, c, r);
        if (tile === 0) continue;

        if (tile === TILE_JUMP_THROUGH) {
          g.fillStyle(COLORS.tile, 1);
          g.fillRect(x, y + 2, WORLD.tile, 3);
          g.fillStyle(COLORS.tileEdge, 1);
          g.fillRect(x, y, WORLD.tile, 2);
        } else {
          g.fillStyle(COLORS.tile, 1);
          g.fillRect(x, y, WORLD.tile, WORLD.tile);
          if (tileAt(this.grid, c, r - 1) === 0) {
            g.fillStyle(COLORS.tileEdge, 1);
            g.fillRect(x, y, WORLD.tile, 2);
          }
        }
      }
    }
  }

  private createRefills(spawns: ReturnType<typeof parseLevel>["refills"]): void {
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
        x: spawn.x,
        y: spawn.y,
        baseY: spawn.y,
        type: spawn.type,
        active: true,
        respawnTimer: 0,
        glow,
        body,
      });
    }
  }

  private resetRefills(): void {
    for (const refill of this.refills) {
      refill.active = true;
      refill.respawnTimer = 0;
      refill.glow.setVisible(true);
      refill.body.setVisible(true);
      refill.y = refill.baseY;
      refill.glow.setPosition(refill.x, refill.y);
      refill.body.setPosition(refill.x, refill.y);
    }
  }

  private updateRefills(dt: number): void {
    if (this.refills.length === 0) return;

    const t = this.time.now / 1000;
    const player = this.player.getHitboxBounds();

    for (const refill of this.refills) {
      if (!refill.active) {
        refill.respawnTimer -= dt;
        if (refill.respawnTimer <= 0) {
          refill.active = true;
          refill.glow.setVisible(true);
          refill.body.setVisible(true);
        }
        continue;
      }

      const bob = Math.sin(t * 4 + refill.x * 0.05) * 1.6;
      refill.y = refill.baseY + bob;
      refill.glow.setPosition(refill.x, refill.y);
      refill.body.setPosition(refill.x, refill.y);

      if (!this.overlapAabb(player.x, player.y, player.w, player.h, refill.x - 6, refill.y - 6, 12, 12)) {
        continue;
      }
      if (!this.player.tryRefill(refill.type)) {
        continue;
      }

      refill.active = false;
      refill.respawnTimer = 2.5;
      refill.glow.setVisible(false);
      refill.body.setVisible(false);
      this.refillEmitter.setParticleTint(this.refillColor(refill.type));
      this.refillEmitter.emitParticleAt(refill.x, refill.y, 7);
      this.cameras.main.shake(40, 0.0012);
    }
  }

  private overlapAabb(
    ax: number,
    ay: number,
    aw: number,
    ah: number,
    bx: number,
    by: number,
    bw: number,
    bh: number,
  ): boolean {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
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
        `  |  ${snapshot.onGround ? "GROUND" : "AIR"}` +
        `${events ? `\nEffects: ${events}` : ""}`,
    );
  }
}
