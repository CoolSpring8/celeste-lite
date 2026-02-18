import Phaser from "phaser";
import { COLORS, PLAYER_CONFIG, PLAYER_GEOMETRY, VIEWPORT, WORLD } from "./constants";
import { TILE_JUMP_THROUGH, tileAt } from "./grid";
import { parseLevel } from "./level";
import { Player } from "./player/Player";
import { InputState, PlayerEffect } from "./player/types";
import { PlayerView } from "./view/PlayerView";

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
      this.cameras.main.fadeIn(80, 10, 10, 20);
      this.accumulator = 0;
    }

    const effects: PlayerEffect[] = [];
    let steps = 0;

    while (this.accumulator >= this.fixedDt && steps < this.maxSteps) {
      this.player.update(this.fixedDt, input);

      let stepEffects = this.player.consumeEffects();
      const fellOut = stepEffects.some((e) => e.type === "fell_out");
      if (fellOut) {
        this.player.hardRespawn(this.spawnX, this.spawnY);
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
      snapshot.y + PLAYER_GEOMETRY.hitboxH / 2,
    );

    this.prevJump = input.jump;
    this.prevDash = this.keys.dash.isDown;

    this.updateHUD(snapshot, effects);
  }

  shutdown(): void {
    this.playerView?.destroy();
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

  private updateHUD(snapshot: ReturnType<Player["getSnapshot"]>, effects: PlayerEffect[]): void {
    const state = snapshot.state.toUpperCase();
    const wallSliding =
      !snapshot.onGround && snapshot.wallDir !== 0 && snapshot.vy > 0 && snapshot.state === "normal"
        ? "  WALL-SLIDE"
        : "";
    const events = effects.map((e) => e.type).join(", ");

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
