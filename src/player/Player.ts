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
  dashRefillTimer = 0;
  climbHopTimer = 0;
  varJumpTimer = 0;
  varJumpSpeed = 0;

  dashesLeft: number;
  dashDir = { x: 0, y: 0 };
  private dashVelX = 0;
  private dashVelY = 0;
  private preDashVx = 0;
  private preDashVy = 0;
  private pendingDashForcedDir: { x: number; y: number } | null = null;
  private pendingDashKeepDuck = false;
  stamina: number;
  private isFastFalling = false;

  private duckDashActive = false;
  private dashStartedOnGround = false;
  private downDiagonalDashSlideActive = false;
  private bunnyhopWindowTimer = 0;

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
    if (this.dashRefillTimer > 0) {
      this.dashRefillTimer -= dt;
      if (this.dashRefillTimer < 0) this.dashRefillTimer = 0;
    }
    if (this.bunnyhopWindowTimer > 0) {
      this.bunnyhopWindowTimer -= dt;
      if (this.bunnyhopWindowTimer < 0) this.bunnyhopWindowTimer = 0;
    }

    if (this.state === "freeze") {
      this.dashFreezeTimer -= dt;
      if (this.dashFreezeTimer <= 0) {
        this.beginDashMotionFromInput(input);
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
      if (this.state !== "dash" && this.dashesLeft < this.cfg.dash.maxDashes && this.dashRefillTimer <= 0) {
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

  getHitboxBounds(): { x: number; y: number; w: number; h: number } {
    const h = this.getHitboxH();
    return { x: this.x, y: this.y, w: PLAYER_GEOMETRY.hitboxW, h };
  }

  tryRefill(targetDashes: number | "max"): boolean {
    const maxStamina = this.cfg.stamina.max;
    const target = targetDashes === "max"
      ? this.cfg.dash.maxDashes
      : Math.max(0, targetDashes);

    const needsDashRefill = this.dashesLeft < target;
    const needsStaminaRefill = this.stamina < maxStamina;
    if (!needsDashRefill && !needsStaminaRefill) return false;

    this.dashesLeft = Math.max(this.dashesLeft, target);
    this.stamina = maxStamina;
    this.dashRefillTimer = 0;
    return true;
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
      dashCooldownActive: this.dashRefillTimer > 0,
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
    this.dashStartedOnGround = false;
    this.downDiagonalDashSlideActive = false;
    this.bunnyhopWindowTimer = 0;
    this.dashesLeft = this.cfg.dash.maxDashes;
    this.stamina = this.cfg.stamina.max;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.wallJumpLockTimer = 0;
    this.dashTimer = 0;
    this.dashFreezeTimer = 0;
    this.dashAttackTimer = 0;
    this.dashCarryTimer = 0;
    this.dashRefillTimer = 0;
    this.climbHopTimer = 0;
    this.varJumpTimer = 0;
    this.varJumpSpeed = 0;
    this.preDashVx = 0;
    this.preDashVy = 0;
    this.pendingDashForcedDir = null;
    this.pendingDashKeepDuck = false;
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
      const bunnyhopFrictionMult =
        this.onGround && this.bunnyhopWindowTimer > 0
          ? this.cfg.movement.bunnyhopGroundDecelMultiplier
          : 1;
      const decel = carryNoInput
        ? this.cfg.movement.airDecel * 0.2
        : this.onGround
          ? this.cfg.movement.runDecel * bunnyhopFrictionMult
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

    this.updateVariableJump(dt, input);

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
        this.doJump(ix);
      } else if (this.wallStickTimer > 0 || this.wallDir !== 0) {
        const neutral = input.x === 0 && !input.grab;
        this.doWallJump(neutral);
      }
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
        this.doJump(input.x);
      }
      return;
    }

    const bunnyhopFrictionMult = this.bunnyhopWindowTimer > 0
      ? this.cfg.movement.bunnyhopGroundDecelMultiplier
      : 1;
    this.vx = approach(this.vx, 0, this.cfg.movement.runDecel * 2.6 * bunnyhopFrictionMult * dt);
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
        this.doWallJump(false);
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

    this.vx = this.dashVelX;
    this.vy = this.dashVelY;

    if (input.x !== 0) {
      this.facing = input.x as 1 | -1;
    }

    if (input.jumpPressed) {
      this.jumpBufferTimer = this.cfg.jump.bufferTime;
    }
    if (this.jumpBufferTimer > 0) {
      this.jumpBufferTimer -= dt;
    }

    if (this.jumpBufferTimer > 0) {
      if (this.tryDashJumpTech()) return;
    }

    if (input.jumpPressed && this.wallDir !== 0) {
      this.state = "normal";
      this.duckDashActive = false;
      this.downDiagonalDashSlideActive = false;
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
        this.downDiagonalDashSlideActive = false;
        return;
      }

      const horizontalDash = Math.abs(this.dashDir.x) > 0.1 && Math.abs(this.dashDir.y) <= 0.1;
      const diagonalDash = Math.abs(this.dashDir.x) > 0.1 && Math.abs(this.dashDir.y) > 0.1;
      const upDiagonalDash = diagonalDash && this.dashDir.y < -0.1;
      const downDiagonalDash = diagonalDash && this.dashDir.y > 0.1;
      const verticalDash = Math.abs(this.dashDir.x) <= 0.1 && Math.abs(this.dashDir.y) > 0.1;

      this.state = "dashAttack";
      this.dashAttackTimer = this.cfg.dash.attackTime;
      this.dashCarryTimer = this.cfg.dash.carryTime;
      this.downDiagonalDashSlideActive = false;

      if (horizontalDash || upDiagonalDash) {
        const dir = this.dashDir.x !== 0 ? Math.sign(this.dashDir.x) : Math.sign(this.vx || this.facing);
        this.vx = dir * Math.max(this.cfg.dash.postHorizontalSpeed, Math.abs(this.vx));
      } else if (verticalDash) {
        const dir = this.dashDir.y !== 0 ? Math.sign(this.dashDir.y) : Math.sign(this.vy || 1);
        this.vy = dir * this.cfg.dash.postVerticalSpeed;
      } else if (!downDiagonalDash) {
        this.vx *= 0.6;
      }
    }
  }

  private doJump(moveX = 0): void {
    const bunnyhop = this.onGround && this.bunnyhopWindowTimer > 0;
    this.vy = this.cfg.jump.speed;
    if (moveX !== 0) {
      this.vx += this.cfg.jump.hBoost * Math.sign(moveX);
    }

    this.applyLiftBoostToJump();
    this.startVariableJump();

    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    if (bunnyhop) {
      this.bunnyhopWindowTimer = 0;
      this.emit({ type: "bunnyhop", dirX: Math.sign(this.vx), dirY: -1 });
    }
    this.emit({ type: "jump", dirX: Math.sign(this.vx), dirY: -1 });
  }

  private doWallJump(neutral = false): void {
    const dir = this.wallDir !== 0 ? -this.wallDir : -this.facing;
    this.vx = dir * (neutral ? this.cfg.wall.neutralJumpH : this.cfg.wall.jumpH);
    this.vy = this.cfg.wall.jumpV;
    this.facing = dir as 1 | -1;
    this.wallJumpLockTimer = neutral
      ? this.cfg.wall.neutralJumpLockTime
      : this.cfg.wall.jumpLockTime;
    this.wallStickTimer = 0;
    this.jumpBufferTimer = 0;
    this.startVariableJump();
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
    this.beginDashRefillCooldown();

    this.dashStartedOnGround = this.onGround;
    this.downDiagonalDashSlideActive = false;
    this.preDashVx = this.vx;
    this.preDashVy = this.vy;
    this.pendingDashForcedDir = forcedDir ?? null;
    this.pendingDashKeepDuck = keepDuck;
    this.duckDashActive = keepDuck;
    this.dashDir = { x: 0, y: 0 };
    this.dashVelX = 0;
    this.dashVelY = 0;
    this.jumpBufferTimer = 0;

    this.state = "freeze";
    this.dashFreezeTimer = this.cfg.dash.freezeTime;
    this.vx = 0;
    this.vy = 0;
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
        const landedThisFrame = sign > 0 && !this.onGround;
        if (sign > 0 && this.isDownDiagonalDashDir() && this.vy > 0) {
          this.convertDownDiagonalDashToSlide();
        }
        if (landedThisFrame) {
          this.bunnyhopWindowTimer = this.cfg.jump.bunnyhopWindow;
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

  private tryDashJumpTech(): boolean {
    if (!this.onGround) return false;

    if (this.isHorizontalDashDir() && this.dashStartedOnGround && !this.downDiagonalDashSlideActive) {
      return this.performDashJumpTech("super");
    }

    if (this.downDiagonalDashSlideActive || this.isDownDiagonalDashDir()) {
      return this.performDashJumpTech(this.dashStartedOnGround ? "hyper" : "wavedash");
    }

    return false;
  }

  private performDashJumpTech(type: "super" | "hyper" | "wavedash"): boolean {
    const fromDuckDash = this.duckDashActive;
    if (fromDuckDash && !this.tryStand()) {
      return false;
    }

    const resolvedType = fromDuckDash && type === "super" ? "hyper" : type;
    const dir = this.facing;
    const reverse = this.dashDir.x !== 0 && Math.sign(this.dashDir.x) !== dir;
    const extended = this.tryGrantExtendedDash();

    this.state = "normal";
    this.duckDashActive = false;
    this.downDiagonalDashSlideActive = false;
    this.dashTimer = 0;
    this.dashAttackTimer = 0;

    this.vx = dir * (resolvedType === "super" ? this.cfg.dash.superSpeed : this.cfg.dash.hyperSpeed);
    this.vy = resolvedType === "super"
      ? this.cfg.jump.speed
      : this.cfg.jump.speed * this.cfg.dash.hyperJumpYMultiplier;
    this.applyLiftBoostToJump();
    this.startVariableJump();

    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.emit({ type: resolvedType, dirX: dir, dirY: -1, extended, reverse });
    return true;
  }

  private isHorizontalDashDir(): boolean {
    return Math.abs(this.dashDir.x) > 0.1 && Math.abs(this.dashDir.y) <= 0.1;
  }

  private isDownDiagonalDashDir(): boolean {
    return Math.abs(this.dashDir.x) > 0.1 && this.dashDir.y > 0.1;
  }

  private convertDownDiagonalDashToSlide(): void {
    if (this.downDiagonalDashSlideActive) return;

    const dashDirX = this.dashDir.x !== 0 ? Math.sign(this.dashDir.x) : Math.sign(this.vx || this.facing);
    const baseX = this.dashVelX !== 0 ? this.dashVelX : this.vx;
    const boostedX = baseX * this.cfg.dash.ultraSpeedMultiplier;

    this.downDiagonalDashSlideActive = true;
    this.dashDir = { x: dashDirX, y: 0 };
    this.dashVelX = boostedX;
    this.dashVelY = 0;
    this.vx = boostedX;
    this.vy = 0;
    this.emit({ type: "ultra", dirX: dashDirX, dirY: 0 });
  }

  private tryGrantExtendedDash(): boolean {
    if (this.dashRefillTimer > 0) return false;
    if (this.dashesLeft >= this.cfg.dash.maxDashes) return false;
    this.dashesLeft = this.cfg.dash.maxDashes;
    return true;
  }

  private beginDashMotionFromInput(input: InputState): void {
    const dir = this.pendingDashForcedDir ?? dashDirection(input.x, input.y, this.facing);
    this.pendingDashForcedDir = null;

    this.dashDir = dir;
    if (this.dashDir.x !== 0) {
      this.facing = Math.sign(this.dashDir.x) as 1 | -1;
    }

    const diagonal = Math.abs(this.dashDir.x) > 0.1 && Math.abs(this.dashDir.y) > 0.1;
    const baseX = this.dashDir.x === 0
      ? 0
      : Math.sign(this.dashDir.x) *
        (diagonal ? this.cfg.dash.diagonalComponentSpeed : this.cfg.dash.straightSpeed);
    const baseY = this.dashDir.y === 0
      ? 0
      : Math.sign(this.dashDir.y) *
        (diagonal ? this.cfg.dash.diagonalComponentSpeed : this.cfg.dash.straightSpeed);

    // Preserve already-faster momentum in the same direction when dash is committed.
    this.dashVelX =
      baseX !== 0 && Math.sign(this.preDashVx) === Math.sign(baseX) && Math.abs(this.preDashVx) > Math.abs(baseX)
        ? this.preDashVx
        : baseX;
    this.dashVelY =
      baseY !== 0 && Math.sign(this.preDashVy) === Math.sign(baseY) && Math.abs(this.preDashVy) > Math.abs(baseY)
        ? this.preDashVy
        : baseY;

    if (!this.pendingDashKeepDuck && this.onGround && this.isDownDiagonalDashDir() && this.dashVelY > 0) {
      this.convertDownDiagonalDashToSlide();
    }

    this.pendingDashKeepDuck = false;
    this.emit({ type: "dash_start", dirX: this.dashDir.x, dirY: this.dashDir.y });
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

  private applyLiftBoostToJump(): void {
    if (this.liftTimer <= 0) return;
    this.vx += this.liftVx;
    this.vy += Math.min(0, this.liftVy);
    this.liftTimer = 0;
  }

  private updateVariableJump(dt: number, input: InputState): void {
    if (this.varJumpTimer <= 0) return;

    this.varJumpTimer -= dt;
    if (this.varJumpTimer <= 0) {
      this.varJumpTimer = 0;
      return;
    }

    if (input.jump) {
      this.vy = Math.min(this.vy, this.varJumpSpeed);
    } else {
      this.varJumpTimer = 0;
    }
  }

  private startVariableJump(): void {
    if (this.vy >= 0) {
      this.varJumpTimer = 0;
      return;
    }

    this.varJumpSpeed = this.vy;
    this.varJumpTimer = this.cfg.jump.varTime;
  }

  private beginDashRefillCooldown(): void {
    this.dashRefillTimer = Math.max(this.dashRefillTimer, this.cfg.dash.refillCooldown);
  }

  private emit(effect: PlayerEffect): void {
    this.effects.push(effect);
  }
}
