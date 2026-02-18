import { PLAYER_CONFIG, PLAYER_GEOMETRY, PlayerConfig, WORLD } from "../constants";
import { SolidGrid } from "../grid";
import { collideAt, collideSolidAt, probeGround, wallDirAt } from "./collision";
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
  onJumpThrough = false;
  wallDir = 0;

  coyoteTimer = 0;
  jumpBufferTimer = 0;
  wallJumpLockTimer = 0;
  wallStickTimer = 0;
  dashTimer = 0;
  dashFreezeTimer = 0;
  dashAttackTimer = 0;
  dashCarryTimer = 0;
  climbHopTimer = 0;

  dashesLeft: number;
  dashDir = { x: 0, y: 0 };
  stamina: number;
  private isFastFalling = false;

  private duckDashActive = false;

  private liftVx = 0;
  private liftVy = 0;
  private liftTimer = 0;

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
    this.stamina = cfg.stamina.max;
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

    const h = this.getHitboxH();
    const ground = probeGround(this.x, this.y, h, this.grid);
    this.onGround = ground.onGround;
    this.onJumpThrough = ground.onJumpThrough;
    this.wallDir = wallDirAt(this.x, this.y, h, this.grid);

    if (this.onGround) {
      if (!this.wasOnGround) {
        this.dashesLeft = this.cfg.dash.maxDashes;
      }
      this.stamina = this.cfg.stamina.max;
      this.liftTimer = 0;
      if (this.state !== "dash") {
        this.vy = 0;
        this.remY = 0;
      }
    } else if (this.liftTimer > 0) {
      this.liftTimer -= dt;
    }

    if (this.dashAttackTimer > 0) {
      this.dashAttackTimer -= dt;
      if (this.dashAttackTimer <= 0 && this.state === "dashAttack") {
        if (this.duckDashActive) {
          this.state = "duck";
        } else {
          this.state = "normal";
        }
      }
    }
    if (this.dashCarryTimer > 0) this.dashCarryTimer -= dt;
    this.isFastFalling = false;

    switch (this.state) {
      case "normal":
      case "dashAttack":
        this.normalUpdate(dt, input);
        break;
      case "dash":
        this.dashUpdate(dt, input);
        break;
      case "grab":
        this.grabUpdate(dt, input);
        break;
      case "duck":
        this.duckUpdate(dt, input);
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
    const hitboxH = this.getHitboxH();
    const isCrouched = this.state === "duck" || this.duckDashActive;
    let drawW = PLAYER_GEOMETRY.drawW;
    let drawH = isCrouched
      ? (PLAYER_GEOMETRY.drawH * PLAYER_GEOMETRY.crouchHitboxH) / PLAYER_GEOMETRY.hitboxH
      : PLAYER_GEOMETRY.drawH;

    if (this.isFastFalling && !isCrouched) {
      drawW *= 0.82;
      drawH *= 1.2;
    }

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
      stamina: this.stamina,
      drawW,
      hitboxH,
      drawH,
      isCrouched,
      isFastFalling: this.isFastFalling,
    };
  }

  setLiftVelocity(vx: number, vy: number): void {
    this.liftVx = Math.max(-this.cfg.lift.maxBoostX, Math.min(this.cfg.lift.maxBoostX, vx));
    this.liftVy = Math.max(-this.cfg.lift.maxBoostY, Math.min(this.cfg.lift.maxBoostY, vy));
    this.liftTimer = this.cfg.lift.momentumStoreTime;
  }

  hardRespawn(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.remX = 0;
    this.remY = 0;
    this.state = "normal";
    this.isFastFalling = false;
    this.duckDashActive = false;
    this.dashesLeft = this.cfg.dash.maxDashes;
    this.stamina = this.cfg.stamina.max;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.wallJumpLockTimer = 0;
    this.dashTimer = 0;
    this.dashFreezeTimer = 0;
    this.dashAttackTimer = 0;
    this.dashCarryTimer = 0;
    this.climbHopTimer = 0;
    this.onGround = false;
    this.onJumpThrough = false;
    this.wallDir = 0;
    this.wasOnGround = false;
    this.emit({ type: "respawn" });
  }

  private normalUpdate(dt: number, input: InputState): void {
    const ix = input.x;

    if (ix !== 0) this.facing = ix as 1 | -1;

    if (this.onGround && input.y > 0) {
      this.tryEnterDuck();
      return;
    }

    if (this.tryStartGrab(input)) {
      return;
    }

    if (this.wallJumpLockTimer > 0) {
      this.wallJumpLockTimer -= dt;
    } else {
      const carryNoInput = this.dashCarryTimer > 0 && ix === 0;
      const accel = this.onGround ? this.cfg.movement.runAccel : this.cfg.movement.airAccel;
      const decel = carryNoInput
        ? this.cfg.movement.airDecel * 0.2
        : this.onGround
          ? this.cfg.movement.runDecel
          : this.cfg.movement.airDecel;

      if (ix !== 0) {
        this.vx = approach(this.vx, this.cfg.movement.maxRun * ix, accel * dt);
      } else {
        this.vx = approach(this.vx, 0, decel * dt);
      }
    }

    this.isFastFalling =
      !this.onGround &&
      (this.state === "normal" || this.state === "dashAttack") &&
      input.y > 0 &&
      this.vy >= 0;

    if (this.onGround && this.vy >= 0) {
      this.vy = 0;
    } else {
      let grav = this.isFastFalling ? this.cfg.gravity.fastFall : this.cfg.gravity.normal;
      if (!this.isFastFalling && Math.abs(this.vy) < this.cfg.gravity.peakThreshold) {
        grav = this.cfg.gravity.peak;
      }
      this.vy = approach(this.vy, this.cfg.gravity.maxFall, grav * dt);
    }

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

  private duckUpdate(dt: number, input: InputState): void {
    if (!this.onGround) {
      this.state = "normal";
      this.tryStand();
      return;
    }

    if (input.dashPressed && this.dashesLeft > 0 && input.y > 0 && input.x !== 0) {
      this.startDash(input, { x: Math.sign(input.x), y: 0 }, true);
      return;
    }

    if (input.jumpPressed) {
      if (this.tryStand()) {
        this.state = "normal";
        this.doJump();
      }
      return;
    }

    this.vx = approach(this.vx, 0, this.cfg.movement.runDecel * 2.6 * dt);
    this.vy = Math.max(this.vy, 0);

    if (input.y <= 0 && this.tryStand()) {
      this.state = "normal";
    }
  }

  private grabUpdate(dt: number, input: InputState): void {
    if (input.dashPressed && this.dashesLeft > 0) {
      this.startDash(input);
      return;
    }

    if (!input.grab || this.wallDir === 0) {
      this.state = "normal";
      return;
    }

    if (this.stamina <= 0) {
      this.state = "normal";
      this.vy = Math.max(this.vy, this.cfg.grab.exhaustedSlipSpeed);
      return;
    }

    this.vx = 0;
    this.remX = 0;
    this.facing = (-this.wallDir) as 1 | -1;

    if (this.climbHopTimer > 0) {
      this.climbHopTimer -= dt;
      this.vy = this.cfg.grab.climbHopSpeedY;
      return;
    }

    if (input.jumpPressed) {
      if (input.y < 0) {
        this.doClimbHop();
      } else {
        this.state = "normal";
        this.doWallJump();
      }
      return;
    }

    if (input.y < 0) {
      this.vy = -this.cfg.grab.climbUpSpeed;
      this.consumeStamina(this.cfg.stamina.climbDrainPerSec * dt);
    } else if (input.y > 0) {
      this.vy = this.cfg.grab.climbDownSpeed;
    } else {
      this.vy = 0;
      this.consumeStamina(this.cfg.stamina.holdDrainPerSec * dt);
    }

    if (this.stamina <= 0) {
      this.state = "normal";
      this.vy = Math.max(this.vy, this.cfg.grab.exhaustedSlipSpeed);
    }
  }

  private dashUpdate(dt: number, input: InputState): void {
    this.dashTimer -= dt;

    this.vx = this.dashDir.x * this.cfg.dash.speed;
    this.vy = this.dashDir.y * this.cfg.dash.speed;

    if (input.jumpPressed && this.dashDir.y > 0.1) {
      this.state = "normal";
      this.duckDashActive = false;
      this.vx = this.facing * this.cfg.dash.hyperHBoost;
      this.vy = this.cfg.dash.hyperVSpeed;
      this.jumpBufferTimer = 0;
      this.emit({ type: "hyper", dirX: this.facing, dirY: -1 });
      return;
    }

    if (input.jumpPressed && this.wallDir !== 0) {
      this.state = "normal";
      this.duckDashActive = false;
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
      if (this.duckDashActive) {
        this.state = "duck";
        this.vx *= 0.6;
        this.vy = Math.max(0, this.vy);
        return;
      }

      this.state = "dashAttack";
      this.dashAttackTimer = this.cfg.dash.attackTime;
      this.dashCarryTimer = this.cfg.dash.carryTime;
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

    if (this.liftTimer > 0) {
      this.vx += this.liftVx;
      this.vy += Math.min(0, this.liftVy);
      this.liftTimer = 0;
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

  private doClimbHop(): void {
    this.vx = 0;
    this.remX = 0;
    this.remY = 0;
    this.vy = this.cfg.grab.climbHopSpeedY;
    this.climbHopTimer = this.cfg.grab.climbHopTime;
    this.consumeStamina(this.cfg.stamina.grabHopCost);
    this.emit({ type: "jump", dirX: 0, dirY: -1 });
  }

  private startDash(
    input: InputState,
    forcedDir?: { x: number; y: number },
    keepDuck = false,
  ): void {
    this.dashesLeft--;

    if (forcedDir) {
      this.dashDir = forcedDir;
    } else {
      this.dashDir = dashDirection(input.x, input.y, this.facing);
    }

    this.duckDashActive = keepDuck;
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
    const h = this.getHitboxH();

    while (move !== 0) {
      const nextX = this.x + sign;
      if (
        !collideAt(
          nextX,
          this.y,
          PLAYER_GEOMETRY.hitboxW,
          h,
          this.grid,
          this.y,
          false,
        )
      ) {
        this.x = nextX;
        move -= sign;
      } else if (this.tryDashCornerCorrectionX(sign, h)) {
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
    const h = this.getHitboxH();

    while (move !== 0) {
      const nextY = this.y + sign;
      if (
        !collideAt(
          this.x,
          nextY,
          PLAYER_GEOMETRY.hitboxW,
          h,
          this.grid,
          this.y,
          sign > 0,
        )
      ) {
        this.y = nextY;
        move -= sign;
      } else if (sign < 0 && this.tryUpCornerCorrectionY(h)) {
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

  private tryStartGrab(input: InputState): boolean {
    if (!input.grab) return false;
    if (this.wallDir === 0) return false;
    if (this.stamina <= 0) return false;

    this.state = "grab";
    this.vx = 0;
    this.remX = 0;
    this.vy = 0;
    this.tryStand();
    return true;
  }

  private tryEnterDuck(): boolean {
    if (this.state === "duck") return true;
    if (!this.onGround) return false;

    const standH = PLAYER_GEOMETRY.hitboxH;
    const crouchH = PLAYER_GEOMETRY.crouchHitboxH;
    if (crouchH >= standH) return false;

    this.y += standH - crouchH;
    this.state = "duck";
    return true;
  }

  private tryStand(): boolean {
    if (this.state !== "duck" && !this.duckDashActive) return true;

    const standH = PLAYER_GEOMETRY.hitboxH;
    const crouchH = PLAYER_GEOMETRY.crouchHitboxH;
    if (crouchH >= standH) return true;

    const delta = standH - crouchH;
    const targetY = this.y - delta;

    if (
      collideAt(
        this.x,
        targetY,
        PLAYER_GEOMETRY.hitboxW,
        standH,
        this.grid,
        this.y,
        false,
      )
    ) {
      return false;
    }

    this.y = targetY;
    this.duckDashActive = false;
    if (this.state === "duck") {
      this.state = "normal";
    }
    return true;
  }

  private getHitboxH(): number {
    const crouchedBody = this.state === "duck" || this.duckDashActive;
    return crouchedBody ? PLAYER_GEOMETRY.crouchHitboxH : PLAYER_GEOMETRY.hitboxH;
  }

  private tryDashCornerCorrectionX(sign: number, h: number): boolean {
    if (this.state !== "dash" && this.state !== "dashAttack") return false;

    for (let i = 1; i <= this.cfg.movement.cornerCorrection; i++) {
      if (collideSolidAt(this.x, this.y - i, PLAYER_GEOMETRY.hitboxW, h, this.grid)) {
        continue;
      }

      if (collideSolidAt(this.x + sign, this.y - i, PLAYER_GEOMETRY.hitboxW, h, this.grid)) {
        continue;
      }

      this.y -= i;
      this.x += sign;
      return true;
    }

    return false;
  }

  private tryUpCornerCorrectionY(h: number): boolean {
    for (let i = 1; i <= this.cfg.movement.cornerCorrection; i++) {
      if (!collideSolidAt(this.x + i, this.y - 1, PLAYER_GEOMETRY.hitboxW, h, this.grid)) {
        this.x += i;
        this.y -= 1;
        return true;
      }

      if (!collideSolidAt(this.x - i, this.y - 1, PLAYER_GEOMETRY.hitboxW, h, this.grid)) {
        this.x -= i;
        this.y -= 1;
        return true;
      }
    }

    return false;
  }

  private consumeStamina(amount: number): void {
    this.stamina = Math.max(0, this.stamina - amount);
  }

  private emit(effect: PlayerEffect): void {
    this.effects.push(effect);
  }
}
