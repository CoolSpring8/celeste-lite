import * as C from "./constants";

// ──────────────────────── 工具函数 ────────────────────────

/** 平滑趋近：从 current 向 target 移动，最多移动 maxDelta */
function approach(current: number, target: number, maxDelta: number): number {
  return current < target
    ? Math.min(current + maxDelta, target)
    : Math.max(current - maxDelta, target);
}

/** 返回冲刺方向向量（归一化到8方向） */
function dashDirection(
  inputX: number,
  inputY: number,
  facing: number,
): { x: number; y: number } {
  let dx = inputX;
  let dy = inputY;
  // 没有输入方向 → 向面朝方向冲刺
  if (dx === 0 && dy === 0) dx = facing;
  // 归一化（对角线不会更快）
  const len = Math.sqrt(dx * dx + dy * dy);
  return { x: dx / len, y: dy / len };
}

// ──────────────────────── 碰撞检测 ────────────────────────

/** 检查矩形是否和关卡中任何实心瓦片重叠 */
function collideAt(
  x: number,
  y: number,
  w: number,
  h: number,
  grid: number[][],
): boolean {
  const left = Math.floor(x / C.TILE);
  const right = Math.floor((x + w - 1) / C.TILE);
  const top = Math.floor(y / C.TILE);
  const bottom = Math.floor((y + h - 1) / C.TILE);

  for (let r = top; r <= bottom; r++) {
    for (let c = left; c <= right; c++) {
      if (grid[r]?.[c] === 1) return true;
    }
  }
  return false;
}

// ──────────────────────── 后像数据 ────────────────────────

export interface Afterimage {
  x: number;
  y: number;
  alpha: number;
  color: number;
}

// ──────────────────────── Player 类 ────────────────────────

type State = "normal" | "dash" | "freeze";

export class Player {
  // ── 位置 & 速度 ──
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  private remX = 0; // 亚像素残余
  private remY = 0;

  // ── 状态 ──
  state: State = "normal";
  facing: 1 | -1 = 1;

  // ── 碰撞状态 ──
  onGround = false;
  wallDir = 0; // -1=左墙 0=无 1=右墙

  // ── 计时器（秒） ──
  coyoteTimer = 0;
  jumpBufferTimer = 0;
  wallJumpLockTimer = 0;
  wallStickTimer = 0;
  dashTimer = 0;
  dashFreezeTimer = 0;

  // ── 冲刺 ──
  dashesLeft = C.MAX_DASHES;
  dashDir = { x: 0, y: 0 };

  // ── 跳跃 ──
  private jumpHeld = false;
  private wasOnGround = false;

  // ── 视觉 ──
  afterimages: Afterimage[] = [];
  color = C.COLOR_PLAYER;
  squashX = 1;
  squashY = 1;

  // ── 关卡引用 ──
  private grid: number[][];

  constructor(x: number, y: number, grid: number[][]) {
    this.x = x;
    this.y = y;
    this.grid = grid;
  }

  // ================================================================
  //  主更新入口
  // ================================================================
  update(dt: number, input: InputState): void {
    // 冻结帧（冲刺起手）
    if (this.state === "freeze") {
      this.dashFreezeTimer -= dt;
      if (this.dashFreezeTimer <= 0) {
        this.state = "dash";
        this.dashTimer = C.DASH_TIME;
      }
      this.updateVisuals(dt);
      return;
    }

    // 检测碰撞状态
    this.onGround = collideAt(
      this.x,
      this.y + 1,
      C.PW,
      C.PH,
      this.grid,
    );
    this.wallDir = this.getWallDir();

    // 落地恢复冲刺次数
    if (this.onGround) {
      this.dashesLeft = C.MAX_DASHES;
    }

    // 分状态更新
    switch (this.state) {
      case "normal":
        this.normalUpdate(dt, input);
        break;
      case "dash":
        this.dashUpdate(dt, input);
        break;
    }

    // 移动 & 碰撞
    this.moveX(this.vx * dt);
    this.moveY(this.vy * dt);

    // 边界保护：掉出地图 → 重生
    if (this.y > C.ROWS * C.TILE + 32) {
      this.respawn();
    }

    this.wasOnGround = this.onGround;
    this.updateVisuals(dt);
  }

  // ================================================================
  //  Normal 状态
  // ================================================================
  private normalUpdate(dt: number, input: InputState): void {
    const ix = input.x; // -1, 0, 1
    const iy = input.y;

    // ── 朝向 ──
    if (ix !== 0) this.facing = ix as 1 | -1;

    // ── 水平移动（地面 vs 空中不同手感） ──
    if (this.wallJumpLockTimer > 0) {
      this.wallJumpLockTimer -= dt;
    } else {
      const accel = this.onGround ? C.RUN_ACCEL : C.AIR_ACCEL;
      const decel = this.onGround ? C.RUN_DECEL : C.AIR_DECEL;

      if (ix !== 0) {
        this.vx = approach(this.vx, C.MAX_RUN * ix, accel * dt);
      } else {
        this.vx = approach(this.vx, 0, decel * dt);
      }
    }

    // ── 重力（非对称！） ──
    let grav = C.GRAVITY;
    if (Math.abs(this.vy) < C.PEAK_THRESHOLD) {
      grav = C.GRAVITY_PEAK; // 跳跃顶点附近轻重力 → 滞空
    }
    this.vy = approach(this.vy, C.MAX_FALL, grav * dt);

    // ── 滑墙减速 ──
    if (
      !this.onGround &&
      this.wallDir !== 0 &&
      ix === this.wallDir &&
      this.vy > 0
    ) {
      this.vy = approach(this.vy, C.WALL_SLIDE_MAX, C.GRAVITY * dt);
    }

    // ── Coyote Time ──
    if (this.wasOnGround && !this.onGround) {
      this.coyoteTimer = C.COYOTE_TIME;
    }
    if (this.coyoteTimer > 0) this.coyoteTimer -= dt;

    // ── Wall Stick Time ──
    if (this.wallDir !== 0) {
      this.wallStickTimer = C.WALL_STICK;
    }
    if (this.wallStickTimer > 0) this.wallStickTimer -= dt;

    // ── Jump Buffer ──
    if (input.jumpPressed) {
      this.jumpBufferTimer = C.JUMP_BUFFER;
    }
    if (this.jumpBufferTimer > 0) this.jumpBufferTimer -= dt;

    // ── 跳跃判定 ──
    if (this.jumpBufferTimer > 0) {
      if (this.onGround || this.coyoteTimer > 0) {
        // 普通跳
        this.doJump();
      } else if (this.wallStickTimer > 0 || this.wallDir !== 0) {
        // 蹬墙跳
        this.doWallJump();
      }
    }

    // ── 可变跳跃高度：松开跳跃键 → 截断上升 ──
    if (!input.jump && this.vy < 0) {
      this.vy *= C.JUMP_CUT;
    }

    // ── 冲刺触发 ──
    if (input.dashPressed && this.dashesLeft > 0) {
      this.startDash(input);
    }
  }

  // ================================================================
  //  Dash 状态
  // ================================================================
  private dashUpdate(dt: number, input: InputState): void {
    this.dashTimer -= dt;

    // 冲刺期间固定速度、无重力
    this.vx = this.dashDir.x * C.DASH_SPEED;
    this.vy = this.dashDir.y * C.DASH_SPEED;

    // 留后像
    if (Math.random() < 0.7) {
      this.afterimages.push({
        x: this.x,
        y: this.y,
        alpha: 0.8,
        color: C.COLOR_PLAYER_DASH,
      });
    }

    // ── Hyperdash：向下冲刺中按跳 → 取消冲刺 + 水平爆发 ──
    if (input.jumpPressed && this.dashDir.y > 0.1) {
      this.state = "normal";
      this.vx = this.facing * C.HYPER_H_BOOST;
      this.vy = C.HYPER_V_SPEED;
      this.jumpBufferTimer = 0;
      this.setSquishy(0.6, 1.4);
      return;
    }

    // ── Wallbounce：冲刺中撞墙 + 按跳 → 超级蹬墙跳 ──
    if (input.jumpPressed && this.wallDir !== 0) {
      this.state = "normal";
      this.vx = -this.wallDir * C.WALLBOUNCE_H;
      this.vy = C.WALLBOUNCE_V;
      this.facing = -this.wallDir as 1 | -1;
      this.wallJumpLockTimer = C.WALL_JUMP_LOCK;
      this.jumpBufferTimer = 0;
      this.dashesLeft = C.MAX_DASHES; // wallbounce 返还冲刺
      this.setSquishy(0.5, 1.5);
      return;
    }

    // 冲刺结束
    if (this.dashTimer <= 0) {
      this.state = "normal";
      // 冲刺结束后保留一部分速度
      this.vx *= 0.6;
      if (this.dashDir.y < 0) {
        this.vy *= 0.4; // 向上冲刺后速度衰减更多
      }
    }
  }

  // ================================================================
  //  动作
  // ================================================================

  private doJump(): void {
    this.vy = C.JUMP_SPEED;
    // 跑动中跳跃额外水平加速
    if (Math.abs(this.vx) > C.MAX_RUN * 0.5) {
      this.vx += Math.sign(this.vx) * C.JUMP_H_BOOST;
    }
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.setSquishy(0.7, 1.3);
  }

  private doWallJump(): void {
    const dir = this.wallDir !== 0 ? -this.wallDir : -this.facing;
    this.vx = dir * C.WALL_JUMP_H;
    this.vy = C.WALL_JUMP_V;
    this.facing = dir as 1 | -1;
    this.wallJumpLockTimer = C.WALL_JUMP_LOCK;
    this.wallStickTimer = 0;
    this.jumpBufferTimer = 0;
    this.setSquishy(0.6, 1.4);
  }

  private startDash(input: InputState): void {
    this.dashesLeft--;
    this.dashDir = dashDirection(input.x, input.y, this.facing);
    this.state = "freeze";
    this.dashFreezeTimer = C.DASH_FREEZE;
    this.vx = 0;
    this.vy = 0;
    this.setSquishy(1.4, 0.6);

    // 冲刺起手后像
    this.afterimages.push({
      x: this.x,
      y: this.y,
      alpha: 1.0,
      color: C.COLOR_PLAYER_DASH,
    });
  }

  // ================================================================
  //  碰撞移动（逐像素 —— Celeste 方法）
  // ================================================================

  private moveX(amount: number): void {
    this.remX += amount;
    let move = Math.round(this.remX);
    this.remX -= move;
    const sign = Math.sign(move);

    while (move !== 0) {
      if (!collideAt(this.x + sign, this.y, C.PW, C.PH, this.grid)) {
        this.x += sign;
        move -= sign;
      } else {
        // 撞墙
        this.vx = 0;
        this.remX = 0;
        break;
      }
    }
  }

  private moveY(amount: number): void {
    this.remY += amount;
    let move = Math.round(this.remY);
    this.remY -= move;
    const sign = Math.sign(move);

    while (move !== 0) {
      if (!collideAt(this.x, this.y + sign, C.PW, C.PH, this.grid)) {
        this.y += sign;
        move -= sign;
      } else {
        // 着地或撞天花板
        if (sign > 0 && !this.onGround) {
          // 落地瞬间的挤压效果
          this.setSquishy(1.3, 0.7);
        }
        this.vy = 0;
        this.remY = 0;
        break;
      }
    }
  }

  // ================================================================
  //  辅助
  // ================================================================

  private getWallDir(): number {
    if (collideAt(this.x - 1, this.y, C.PW, C.PH, this.grid)) return -1;
    if (collideAt(this.x + 1, this.y, C.PW, C.PH, this.grid)) return 1;
    return 0;
  }

  private setSquishy(sx: number, sy: number): void {
    this.squashX = sx;
    this.squashY = sy;
  }

  private updateVisuals(dt: number): void {
    // 挤压回弹
    this.squashX = approach(this.squashX, 1, 4 * dt);
    this.squashY = approach(this.squashY, 1, 4 * dt);

    // 后像衰减
    for (let i = this.afterimages.length - 1; i >= 0; i--) {
      this.afterimages[i].alpha -= 3.0 * dt;
      if (this.afterimages[i].alpha <= 0) {
        this.afterimages.splice(i, 1);
      }
    }

    // 颜色
    if (this.state === "dash" || this.state === "freeze") {
      this.color = C.COLOR_PLAYER_DASH;
    } else if (this.dashesLeft <= 0) {
      this.color = C.COLOR_PLAYER_NO_DASH;
    } else {
      this.color = C.COLOR_PLAYER;
    }
  }

  respawn(): void {
    // 由外部调用时设置 x, y
    this.vx = 0;
    this.vy = 0;
    this.remX = 0;
    this.remY = 0;
    this.state = "normal";
    this.dashesLeft = C.MAX_DASHES;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.wallJumpLockTimer = 0;
    this.dashTimer = 0;
    this.afterimages = [];
    this.squashX = 1;
    this.squashY = 1;
  }
}

// ──────────────────────── 输入状态 ────────────────────────

export interface InputState {
  x: number; // -1, 0, 1
  y: number; // -1 (上), 0, 1 (下)
  jump: boolean; // 是否按住
  jumpPressed: boolean; // 这帧刚按下
  dashPressed: boolean; // 这帧刚按下
}