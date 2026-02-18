import Phaser from "phaser";
import * as C from "./constants";
import { Player } from "./player/Player";
import { InputState, PlayerEffect } from "./player/types";
import { parseLevel } from "./level";
import { PlayerView } from "./view/PlayerView";

export class GameScene extends Phaser.Scene {
  private player!: Player;
  private playerView!: PlayerView;
  private grid!: number[][];
  private spawnX!: number;
  private spawnY!: number;

  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private prevJump = false;
  private prevDash = false;

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

    this.player = new Player(this.spawnX, this.spawnY, this.grid);
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
      jumpZ: kb.addKey(Phaser.Input.Keyboard.KeyCodes.Z),
      jumpC: kb.addKey(Phaser.Input.Keyboard.KeyCodes.C),
      jumpSpace: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      dashX: kb.addKey(Phaser.Input.Keyboard.KeyCodes.X),
      dashShift: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT),
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
        C.GAME_W - 8,
        C.GAME_H - 8,
        "← → ↑ ↓  |  Z/C/Space: Jump  |  X/Shift: Dash  |  R: Reset",
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
    const dt = delta / 1000;
    const clampedDt = Math.min(dt, 0.033);

    const input = this.gatherInput();

    if (this.keys.restart.isDown) {
      this.player.hardRespawn(this.spawnX, this.spawnY);
      this.cameras.main.fadeIn(80, 10, 10, 20);
    }

    this.player.update(clampedDt, input);

    let effects = this.player.consumeEffects();
    const fellOut = effects.some((e) => e.type === "fell_out");

    if (fellOut) {
      this.player.hardRespawn(this.spawnX, this.spawnY);
      this.cameras.main.fadeIn(120, 10, 10, 20);
      effects = effects.concat(this.player.consumeEffects());
    }

    const snapshot = this.player.getSnapshot();
    this.playerView.render(snapshot, effects, clampedDt);

    this.cameraTarget.setPosition(snapshot.x + C.PW / 2, snapshot.y + C.PH / 2);

    this.prevJump = input.jump;
    this.prevDash = this.keys.dashX.isDown || this.keys.dashShift.isDown;

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

    const jump = this.keys.jumpZ.isDown || this.keys.jumpC.isDown || this.keys.jumpSpace.isDown;
    const dash = this.keys.dashX.isDown || this.keys.dashShift.isDown;

    return {
      x,
      y,
      jump,
      jumpPressed: jump && !this.prevJump,
      jumpReleased: !jump && this.prevJump,
      dashPressed: dash && !this.prevDash,
    };
  }

  private drawTiles(): void {
    const g = this.tileGfx;
    for (let r = 0; r < C.ROWS; r++) {
      for (let c = 0; c < C.COLS; c++) {
        if (this.grid[r][c] !== 1) continue;

        const x = c * C.TILE;
        const y = r * C.TILE;

        g.fillStyle(C.COLOR_TILE, 1);
        g.fillRect(x, y, C.TILE, C.TILE);

        const above = this.grid[r - 1]?.[c] ?? 0;
        if (above === 0) {
          g.fillStyle(C.COLOR_TILE_EDGE, 1);
          g.fillRect(x, y, C.TILE, 2);
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
        `  |  Vel: (${snapshot.vx.toFixed(0)}, ${snapshot.vy.toFixed(0)})` +
        `  |  ${snapshot.onGround ? "GROUND" : "AIR"}` +
        `${events ? `\nEffects: ${events}` : ""}`,
    );
  }
}
