import { PLAYER_CONFIG, PLAYER_GEOMETRY, PlayerConfig, WORLD } from "../constants";
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

  dashesLeft: number;
  dashDir = { x: 0, y: 0 };

  private wasOnGround = false;
  private effects: PlayerEffect[] = [];

  private grid: SolidGrid;
  private cfg: PlayerConfig;

  constructor(x: number, y: number, grid: SolidGrid, cfg: PlayerConfig = PLAYER_CONFIG) {
    this.x = x;
    this.y = y;
    this.grid = grid;
    this.cfg = cfg;
    this.dashesLeft = cfg.dash.maxDashes;
  }

  update(dt: number, input: InputState): void {
    if (this.state === "freeze") {
      this.dashFreezeTimer -= dt;
      if (this.dashFreezeTimer <= 0) {
        this.state = "dash";
        this.dashTimer = this.cfg.dash.duration;
      }
      return;
    }

    this.onGround = collideAt(this.x, this.y + 1, PLAYER_GEOMETRY.hitboxW, PLAYER_GEOMETRY.hitboxH, this.grid);
    this.wallDir = wallDirAt(this.x, this.y, PLAYER_GEOMETRY.hitboxW, PLAYER_GEOMETRY.hitboxH, this.grid);

    if (this.onGround) {
      this.dashesLeft = this.cfg.dash.maxDashes;
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

    if (this.y > WORLD.rows * WORLD.tile + 32) {
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
    this.dashesLeft = this.cfg.dash.maxDashes;
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
      const accel = this.onGround ? this.cfg.movement.runAccel : this.cfg.movement.airAccel;
      const decel = this.onGround ? this.cfg.movement.runDecel : this.cfg.movement.airDecel;

      if (ix !== 0) {
        this.vx = approach(this.vx, this.cfg.movement.maxRun * ix, accel * dt);
      } else {
        this.vx = approach(this.vx, 0, decel * dt);
      }
    }

    let grav = this.cfg.gravity.normal;
    if (Math.abs(this.vy) < this.cfg.gravity.peakThreshold) {
      grav = this.cfg.gravity.peak;
    }
    this.vy = approach(this.vy, this.cfg.gravity.maxFall, grav * dt);

    if (!this.onGround && this.wallDir !== 0 && ix === this.wallDir && this.vy > 0) {
      this.vy = approach(this.vy, this.cfg.wall.slideMax, this.cfg.gravity.normal * dt);
    }

    if (this.wasOnGround && !this.onGround) {
      this.coyoteTimer = this.cfg.jump.coyoteTime;
    }
    if (this.coyoteTimer > 0) this.coyoteTimer -= dt;

    if (this.wallDir !== 0) {
      this.wallStickTimer = this.cfg.wall.stickTime;
    }
    if (this.wallStickTimer > 0) this.wallStickTimer -= dt;

    if (input.jumpPressed) {
      this.jumpBufferTimer = this.cfg.jump.bufferTime;
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
      this.vy *= this.cfg.jump.cutMultiplier;
    }

    if (input.dashPressed && this.dashesLeft > 0) {
      this.startDash(input);
    }
  }

  private dashUpdate(dt: number, input: InputState): void {
    this.dashTimer -= dt;

    this.vx = this.dashDir.x * this.cfg.dash.speed;
    this.vy = this.dashDir.y * this.cfg.dash.speed;

    if (input.jumpPressed && this.dashDir.y > 0.1) {
      this.state = "normal";
      this.vx = this.facing * this.cfg.dash.hyperHBoost;
      this.vy = this.cfg.dash.hyperVSpeed;
      this.jumpBufferTimer = 0;
      this.emit({ type: "hyper", dirX: this.facing, dirY: -1 });
      return;
    }

    if (input.jumpPressed && this.wallDir !== 0) {
      this.state = "normal";
      this.vx = -this.wallDir * this.cfg.wall.bounceH;
      this.vy = this.cfg.wall.bounceV;
      this.facing = -this.wallDir as 1 | -1;
      this.wallJumpLockTimer = this.cfg.wall.jumpLockTime;
      this.jumpBufferTimer = 0;
      this.dashesLeft = this.cfg.dash.maxDashes;
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
    this.vy = this.cfg.jump.speed;
    if (Math.abs(this.vx) > this.cfg.movement.maxRun * 0.5) {
      this.vx += Math.sign(this.vx) * this.cfg.jump.hBoost;
    }
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.emit({ type: "jump", dirX: Math.sign(this.vx), dirY: -1 });
  }

  private doWallJump(): void {
    const dir = this.wallDir !== 0 ? -this.wallDir : -this.facing;
    this.vx = dir * this.cfg.wall.jumpH;
    this.vy = this.cfg.wall.jumpV;
    this.facing = dir as 1 | -1;
    this.wallJumpLockTimer = this.cfg.wall.jumpLockTime;
    this.wallStickTimer = 0;
    this.jumpBufferTimer = 0;
    this.emit({ type: "wall_jump", wallDir: -dir, dirX: dir, dirY: -1 });
  }

  private startDash(input: InputState): void {
    this.dashesLeft--;
    this.dashDir = dashDirection(input.x, input.y, this.facing);
    this.state = "freeze";
    this.dashFreezeTimer = this.cfg.dash.freezeTime;
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
      if (!collideAt(this.x + sign, this.y, PLAYER_GEOMETRY.hitboxW, PLAYER_GEOMETRY.hitboxH, this.grid)) {
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
      if (!collideAt(this.x, this.y + sign, PLAYER_GEOMETRY.hitboxW, PLAYER_GEOMETRY.hitboxH, this.grid)) {
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
