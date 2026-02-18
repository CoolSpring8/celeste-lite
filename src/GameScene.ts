import Phaser from "phaser";
import * as C from "./constants";
import { Player, InputState } from "./Player";
import { parseLevel } from "./level";

export class GameScene extends Phaser.Scene {
  private player!: Player;
  private grid!: number[][];
  private spawnX!: number;
  private spawnY!: number;

  // 输入
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private prevJump = false;
  private prevDash = false;

  // 绘图
  private gfx!: Phaser.GameObjects.Graphics;
  private tileGfx!: Phaser.GameObjects.Graphics;
  private hudText!: Phaser.GameObjects.Text;

  constructor() {
    super("GameScene");
  }

  create(): void {
    // ── 解析关卡 ──
    const level = parseLevel();
    this.grid = level.grid;
    this.spawnX = level.spawnX;
    this.spawnY = level.spawnY;

    // ── 绘制静态瓦片（只画一次） ──
    this.tileGfx = this.add.graphics();
    this.drawTiles();

    // ── 动态图形层（每帧重绘） ──
    this.gfx = this.add.graphics();

    // ── 创建玩家 ──
    this.player = new Player(this.spawnX, this.spawnY, this.grid);

    // ── 注册按键 ──
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

    // ── HUD ──
    this.hudText = this.add
      .text(8, 8, "", {
        fontFamily: "monospace",
        fontSize: "13px",
        color: "#8888bb",
      })
      .setDepth(10);

    // ── 控制提示 ──
    this.add
      .text(C.GAME_W - 8, C.GAME_H - 8, "← → ↑ ↓  |  Z/C/Space: Jump  |  X/Shift: Dash  |  R: Reset", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#444466",
      })
      .setOrigin(1, 1)
      .setDepth(10);
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000; // ms → s
    const clampedDt = Math.min(dt, 0.033); // 防止 dt 过大（切窗口回来）

    // ── 收集输入 ──
    const input = this.gatherInput();

    // ── 重生 ──
    if (this.keys.restart.isDown) {
      this.player.x = this.spawnX;
      this.player.y = this.spawnY;
      this.player.respawn();
    }

    // ── 更新玩家 ──
    this.player.update(clampedDt, input);

    // ── 保存上帧输入 ──
    this.prevJump = input.jump;
    this.prevDash =
      this.keys.dashX.isDown || this.keys.dashShift.isDown;

    // ── 绘制 ──
    this.draw();
    this.updateHUD();
  }

  // ================================================================
  //  输入
  // ================================================================

  private gatherInput(): InputState {
    let x = 0;
    let y = 0;
    if (this.keys.left.isDown || this.keys.a.isDown) x -= 1;
    if (this.keys.right.isDown || this.keys.d.isDown) x += 1;
    if (this.keys.up.isDown || this.keys.w.isDown) y -= 1;
    if (this.keys.down.isDown || this.keys.s.isDown) y += 1;

    const jump =
      this.keys.jumpZ.isDown ||
      this.keys.jumpC.isDown ||
      this.keys.jumpSpace.isDown;

    const dash = this.keys.dashX.isDown || this.keys.dashShift.isDown;

    return {
      x,
      y,
      jump,
      jumpPressed: jump && !this.prevJump,
      dashPressed: dash && !this.prevDash,
    };
  }

  // ================================================================
  //  渲染
  // ================================================================

  private drawTiles(): void {
    const g = this.tileGfx;
    for (let r = 0; r < C.ROWS; r++) {
      for (let c = 0; c < C.COLS; c++) {
        if (this.grid[r][c] !== 1) continue;

        const x = c * C.TILE;
        const y = r * C.TILE;

        // 主体
        g.fillStyle(C.COLOR_TILE, 1);
        g.fillRect(x, y, C.TILE, C.TILE);

        // 顶边高光（如果上方是空气）
        const above = this.grid[r - 1]?.[c] ?? 0;
        if (above === 0) {
          g.fillStyle(C.COLOR_TILE_EDGE, 1);
          g.fillRect(x, y, C.TILE, 2);
        }
      }
    }
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();

    const p = this.player;

    // ── 后像 ──
    for (const a of p.afterimages) {
      g.fillStyle(a.color, a.alpha * 0.6);
      g.fillRect(
        a.x - (C.P_DRAW_W - C.PW) / 2,
        a.y - (C.P_DRAW_H - C.PH),
        C.P_DRAW_W,
        C.P_DRAW_H,
      );
    }

    // ── 玩家（带挤压拉伸） ──
    const drawW = C.P_DRAW_W * p.squashX;
    const drawH = C.P_DRAW_H * p.squashY;
    // 以底部中心为锚点进行挤压
    const drawX = p.x + C.PW / 2 - drawW / 2;
    const drawY = p.y + C.PH - drawH;

    g.fillStyle(p.color, 1);
    g.fillRect(drawX, drawY, drawW, drawH);

    // ── 冲刺中的速度线 ──
    if (p.state === "dash") {
      g.lineStyle(1, C.COLOR_PLAYER_DASH, 0.5);
      for (let i = 0; i < 3; i++) {
        const ox = (Math.random() - 0.5) * 6;
        const oy = (Math.random() - 0.5) * 6;
        const cx = p.x + C.PW / 2;
        const cy = p.y + C.PH / 2;
        g.lineBetween(
          cx + ox,
          cy + oy,
          cx + ox - p.vx * 0.04,
          cy + oy - p.vy * 0.04,
        );
      }
    }

    // ── 滑墙粒子 ──
    if (
      !p.onGround &&
      p.wallDir !== 0 &&
      p.vy > 0 &&
      p.state === "normal"
    ) {
      for (let i = 0; i < 2; i++) {
        const px =
          p.wallDir < 0 ? p.x - 1 : p.x + C.PW;
        const py = p.y + Math.random() * C.PH;
        g.fillStyle(C.COLOR_TILE_EDGE, 0.6);
        g.fillRect(px, py, 1, 1);
      }
    }
  }

  // ================================================================
  //  HUD
  // ================================================================

  private updateHUD(): void {
    const p = this.player;
    const state = p.state.toUpperCase();
    const wallSliding =
      !p.onGround && p.wallDir !== 0 && p.vy > 0 && p.state === "normal"
        ? "  WALL-SLIDE"
        : "";
    this.hudText.setText(
      `State: ${state}${wallSliding}` +
      `  |  Dashes: ${p.dashesLeft}` +
      `  |  Vel: (${p.vx.toFixed(0)}, ${p.vy.toFixed(0)})` +
      `  |  ${p.onGround ? "GROUND" : "AIR"}`,
    );
  }
}