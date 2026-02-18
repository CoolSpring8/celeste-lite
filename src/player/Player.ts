import * as C from "../constants";
import { SolidGrid } from "../grid";
import { collideAt, wallDirAt } from "./collision";
import { approach, dashDirection } from "./math";
import { InputState, PlayerEffect, PlayerSnapshot, PlayerState } from "./types";

export class Player {
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  private remX = 0;
  private remY = 0;

  state: PlayerState = "normal";
  facing: 1 | -1 = 1;

  onGround = false;
  wallDir = 0;

  coyoteTimer = 0;
  jumpBufferTimer = 0;
  wallJumpLockTimer = 0;
  wallStickTimer = 0;
  dashTimer = 0;
  dashFreezeTimer = 0;

  dashesLeft = C.MAX_DASHES;
  dashDir = { x: 0, y: 0 };

  private wasOnGround = false;
  private effects: PlayerEffect[] = [];

  private grid: SolidGrid;

  constructor(x: number, y: number, grid: SolidGrid) {
    this.x = x;
    this.y = y;
    this.grid = grid;
  }

  update(dt: number, input: InputState): void {
    if (this.state === "freeze") {
      this.dashFreezeTimer -= dt;
      if (this.dashFreezeTimer <= 0) {
        this.state = "dash";
        this.dashTimer = C.DASH_TIME;
      }
      return;
    }

    this.onGround = collideAt(this.x, this.y + 1, C.PW, C.PH, this.grid);
    this.wallDir = wallDirAt(this.x, this.y, C.PW, C.PH, this.grid);

    if (this.onGround) {
      this.dashesLeft = C.MAX_DASHES;
    }

    switch (this.state) {
      case "normal":
        this.normalUpdate(dt, input);
        break;
      case "dash":
        this.dashUpdate(dt, input);
        break;
    }

    this.moveX(this.vx * dt);
    this.moveY(this.vy * dt);

    if (this.y > C.ROWS * C.TILE + 32) {
      this.emit({ type: "fell_out" });
    }

    this.wasOnGround = this.onGround;
  }

  consumeEffects(): PlayerEffect[] {
    const out = this.effects;
    this.effects = [];
    return out;
  }

  getSnapshot(): PlayerSnapshot {
    return {
      x: this.x,
      y: this.y,
      vx: this.vx,
      vy: this.vy,
      state: this.state,
      facing: this.facing,
      onGround: this.onGround,
      wallDir: this.wallDir,
      dashesLeft: this.dashesLeft,
    };
  }

  hardRespawn(x: number, y: number): void {
    this.x = x;
    this.y = y;
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
    this.dashFreezeTimer = 0;
    this.onGround = false;
    this.wallDir = 0;
    this.wasOnGround = false;
    this.emit({ type: "respawn" });
  }

  private normalUpdate(dt: number, input: InputState): void {
    const ix = input.x;

    if (ix !== 0) this.facing = ix as 1 | -1;

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

    let grav = C.GRAVITY;
    if (Math.abs(this.vy) < C.PEAK_THRESHOLD) {
      grav = C.GRAVITY_PEAK;
    }
    this.vy = approach(this.vy, C.MAX_FALL, grav * dt);

    if (!this.onGround && this.wallDir !== 0 && ix === this.wallDir && this.vy > 0) {
      this.vy = approach(this.vy, C.WALL_SLIDE_MAX, C.GRAVITY * dt);
    }

    if (this.wasOnGround && !this.onGround) {
      this.coyoteTimer = C.COYOTE_TIME;
    }
    if (this.coyoteTimer > 0) this.coyoteTimer -= dt;

    if (this.wallDir !== 0) {
      this.wallStickTimer = C.WALL_STICK;
    }
    if (this.wallStickTimer > 0) this.wallStickTimer -= dt;

    if (input.jumpPressed) {
      this.jumpBufferTimer = C.JUMP_BUFFER;
    }
    if (this.jumpBufferTimer > 0) this.jumpBufferTimer -= dt;

    if (this.jumpBufferTimer > 0) {
      if (this.onGround || this.coyoteTimer > 0) {
        this.doJump();
      } else if (this.wallStickTimer > 0 || this.wallDir !== 0) {
        this.doWallJump();
      }
    }

    if (input.jumpReleased && this.vy < 0) {
      this.vy *= C.JUMP_CUT;
    }

    if (input.dashPressed && this.dashesLeft > 0) {
      this.startDash(input);
    }
  }

  private dashUpdate(dt: number, input: InputState): void {
    this.dashTimer -= dt;

    this.vx = this.dashDir.x * C.DASH_SPEED;
    this.vy = this.dashDir.y * C.DASH_SPEED;

    if (input.jumpPressed && this.dashDir.y > 0.1) {
      this.state = "normal";
      this.vx = this.facing * C.HYPER_H_BOOST;
      this.vy = C.HYPER_V_SPEED;
      this.jumpBufferTimer = 0;
      this.emit({ type: "hyper", dirX: this.facing, dirY: -1 });
      return;
    }

    if (input.jumpPressed && this.wallDir !== 0) {
      this.state = "normal";
      this.vx = -this.wallDir * C.WALLBOUNCE_H;
      this.vy = C.WALLBOUNCE_V;
      this.facing = -this.wallDir as 1 | -1;
      this.wallJumpLockTimer = C.WALL_JUMP_LOCK;
      this.jumpBufferTimer = 0;
      this.dashesLeft = C.MAX_DASHES;
      this.emit({ type: "wall_bounce", wallDir: this.wallDir });
      return;
    }

    if (this.dashTimer <= 0) {
      this.state = "normal";
      this.vx *= 0.6;
      if (this.dashDir.y < 0) {
        this.vy *= 0.4;
      }
    }
  }

  private doJump(): void {
    this.vy = C.JUMP_SPEED;
    if (Math.abs(this.vx) > C.MAX_RUN * 0.5) {
      this.vx += Math.sign(this.vx) * C.JUMP_H_BOOST;
    }
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.emit({ type: "jump", dirX: Math.sign(this.vx), dirY: -1 });
  }

  private doWallJump(): void {
    const dir = this.wallDir !== 0 ? -this.wallDir : -this.facing;
    this.vx = dir * C.WALL_JUMP_H;
    this.vy = C.WALL_JUMP_V;
    this.facing = dir as 1 | -1;
    this.wallJumpLockTimer = C.WALL_JUMP_LOCK;
    this.wallStickTimer = 0;
    this.jumpBufferTimer = 0;
    this.emit({ type: "wall_jump", wallDir: -dir, dirX: dir, dirY: -1 });
  }

  private startDash(input: InputState): void {
    this.dashesLeft--;
    this.dashDir = dashDirection(input.x, input.y, this.facing);
    this.state = "freeze";
    this.dashFreezeTimer = C.DASH_FREEZE;
    this.vx = 0;
    this.vy = 0;
    this.emit({ type: "dash_start", dirX: this.dashDir.x, dirY: this.dashDir.y });
  }

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
        if (sign > 0 && !this.onGround) {
          this.emit({ type: "land" });
        }
        this.vy = 0;
        this.remY = 0;
        break;
      }
    }
  }

  private emit(effect: PlayerEffect): void {
    this.effects.push(effect);
  }
}
