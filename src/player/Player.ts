import { PLAYER_CONFIG, PLAYER_GEOMETRY, PlayerConfig, WORLD } from "../constants";
import { SolidGrid } from "../grid";
import { collideAt, collideSolidAt, probeGround, wallDirAt } from "./collision";
import { approach, dashDirection } from "./math";
import { InputState, PlayerEffect, PlayerSnapshot, PlayerState } from "./types";

type DashHorizontalCollisionResult = "none" | "corrected" | "ducked";

const EPSILON = 0.0001;

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

  private ducking = false;
  private moveXInput = 0;

  private jumpGraceTimer = 0;
  private varJumpTimer = 0;
  private varJumpSpeed = 0;
  private autoJump = false;
  private autoJumpTimer = 0;

  private dashCooldownTimer = 0;
  private dashRefillCooldownTimer = 0;
  private dashTimer = 0;
  private dashFreezeTimer = 0;
  private dashAttackTimer = 0;
  private dashStartedOnGround = false;
  private dashJustStarted = false;

  private wallSlideTimer: number;
  private wallSlideDir = 0;
  private maxFall: number;

  private forceMoveX = 0;
  private forceMoveXTimer = 0;
  private wallSpeedRetentionTimer = 0;
  private wallSpeedRetained = 0;
  private wallBoostDir = 0;
  private wallBoostTimer = 0;

  private climbNoMoveTimer = 0;
  private lastClimbMove = 0;

  private lastAim = { x: 1, y: 0 };
  dashDir = { x: 0, y: 0 };
  dashesLeft: number;
  stamina: number;

  private beforeDashVx = 0;
  private beforeDashVy = 0;

  private isFastFalling = false;

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
    this.stamina = cfg.climb.max;
    this.wallSlideTimer = cfg.gravity.wallSlideTime;
    this.maxFall = cfg.gravity.maxFall;
  }

  update(dt: number, input: InputState): void {
    this.refreshEnvironment();

    if (this.forceMoveXTimer > 0) {
      this.forceMoveXTimer = Math.max(0, this.forceMoveXTimer - dt);
      this.moveXInput = this.forceMoveX;
    } else {
      this.moveXInput = input.x;
    }

    if (this.wallSlideDir !== 0) {
      this.wallSlideTimer = Math.max(0, this.wallSlideTimer - dt);
      this.wallSlideDir = 0;
    }

    if (this.wallBoostTimer > 0) {
      this.wallBoostTimer -= dt;
      if (this.moveXInput === this.wallBoostDir) {
        this.vx = this.cfg.jump.wallJumpHSpeed * this.moveXInput;
        this.stamina = Math.min(this.cfg.climb.max, this.stamina + this.cfg.climb.jumpCost);
        this.wallBoostTimer = 0;
      }
    }

    if (this.onGround && this.state !== "grab") {
      this.autoJump = false;
      this.stamina = this.cfg.climb.max;
      this.wallSlideTimer = this.cfg.gravity.wallSlideTime;
    }

    if (this.dashAttackTimer > 0) {
      this.dashAttackTimer = Math.max(0, this.dashAttackTimer - dt);
    }

    if (this.onGround) {
      this.jumpGraceTimer = this.cfg.jump.graceTime;
    } else if (this.jumpGraceTimer > 0) {
      this.jumpGraceTimer = Math.max(0, this.jumpGraceTimer - dt);
    }

    if (this.dashCooldownTimer > 0) {
      this.dashCooldownTimer = Math.max(0, this.dashCooldownTimer - dt);
    }

    if (this.dashRefillCooldownTimer > 0) {
      this.dashRefillCooldownTimer = Math.max(0, this.dashRefillCooldownTimer - dt);
    } else if (this.onGround && this.dashesLeft < this.cfg.dash.maxDashes) {
      this.dashesLeft = this.cfg.dash.maxDashes;
    }

    if (this.varJumpTimer > 0) {
      this.varJumpTimer = Math.max(0, this.varJumpTimer - dt);
    }

    if (this.autoJumpTimer > 0) {
      if (this.autoJump) {
        this.autoJumpTimer -= dt;
        if (this.autoJumpTimer <= 0) {
          this.autoJump = false;
        }
      } else {
        this.autoJumpTimer = 0;
      }
    }

    if (this.liftTimer > 0 && !this.onGround) {
      this.liftTimer = Math.max(0, this.liftTimer - dt);
    }

    const lift = this.liftBoost();
    if (lift.y < 0 && this.wasOnGround && !this.onGround && this.vy >= 0) {
      this.vy = lift.y;
    }

    if (this.moveXInput !== 0 && this.state !== "grab" && this.state !== "freeze") {
      this.facing = this.moveXInput as 1 | -1;
    }

    this.lastAim = dashDirection(input.x, input.y, this.facing);
    this.updateWallSpeedRetention(dt);

    if (this.state === "freeze") {
      this.dashFreezeTimer -= dt;
      if (this.dashFreezeTimer > 0) {
        this.refreshEnvironment();
        this.wasOnGround = this.onGround;
        return;
      }

      this.beginDashMotion();
    }

    switch (this.state) {
      case "grab":
        this.climbUpdate(dt, input);
        break;
      case "dash":
        this.dashUpdate(dt, input);
        break;
      case "normal":
      case "duck":
      case "dashAttack":
      default:
        this.normalUpdate(dt, input);
        break;
    }

    this.moveX(this.vx * dt);
    this.moveY(this.vy * dt);

    this.refreshEnvironment();

    if (this.vy > 0 && this.canUnDuck() && !this.onGround) {
      this.setDucking(false);
    }

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
    const target = targetDashes === "max"
      ? this.cfg.dash.maxDashes
      : Math.max(0, targetDashes);

    const needsDashRefill = this.dashesLeft < target;
    const needsStaminaRefill = this.stamina < this.cfg.climb.max;
    if (!needsDashRefill && !needsStaminaRefill) return false;

    this.dashesLeft = Math.max(this.dashesLeft, target);
    this.stamina = this.cfg.climb.max;
    this.dashRefillCooldownTimer = 0;
    return true;
  }

  getSnapshot(): PlayerSnapshot {
    const hitboxH = this.getHitboxH();
    let drawW = PLAYER_GEOMETRY.drawW;
    let drawH = this.ducking
      ? (PLAYER_GEOMETRY.drawH * PLAYER_GEOMETRY.crouchHitboxH) / PLAYER_GEOMETRY.hitboxH
      : PLAYER_GEOMETRY.drawH;

    if (this.isFastFalling && !this.ducking) {
      drawW *= 0.82;
      drawH *= 1.2;
    }

    const state = this.state === "normal" && this.ducking ? "duck" : this.state;

    return {
      x: this.x,
      y: this.y,
      vx: this.vx,
      vy: this.vy,
      state,
      facing: this.facing,
      onGround: this.onGround,
      wallDir: this.wallDir,
      dashesLeft: this.dashesLeft,
      dashCooldownActive: this.dashRefillCooldownTimer > 0,
      stamina: this.stamina,
      drawW,
      hitboxH,
      drawH,
      isCrouched: this.ducking,
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
    this.facing = 1;
    this.ducking = false;

    this.onGround = false;
    this.onJumpThrough = false;
    this.wallDir = 0;
    this.wasOnGround = false;

    this.moveXInput = 0;
    this.jumpGraceTimer = 0;
    this.varJumpTimer = 0;
    this.varJumpSpeed = 0;
    this.autoJump = false;
    this.autoJumpTimer = 0;

    this.dashCooldownTimer = 0;
    this.dashRefillCooldownTimer = 0;
    this.dashTimer = 0;
    this.dashFreezeTimer = 0;
    this.dashAttackTimer = 0;
    this.dashStartedOnGround = false;
    this.dashJustStarted = false;

    this.wallSlideTimer = this.cfg.gravity.wallSlideTime;
    this.wallSlideDir = 0;
    this.maxFall = this.cfg.gravity.maxFall;

    this.forceMoveX = 0;
    this.forceMoveXTimer = 0;
    this.wallSpeedRetentionTimer = 0;
    this.wallSpeedRetained = 0;
    this.wallBoostDir = 0;
    this.wallBoostTimer = 0;

    this.climbNoMoveTimer = 0;
    this.lastClimbMove = 0;

    this.lastAim = { x: this.facing, y: 0 };
    this.dashDir = { x: 0, y: 0 };
    this.dashesLeft = this.cfg.dash.maxDashes;
    this.stamina = this.cfg.climb.max;

    this.beforeDashVx = 0;
    this.beforeDashVy = 0;

    this.isFastFalling = false;

    this.liftVx = 0;
    this.liftVy = 0;
    this.liftTimer = 0;

    this.emit({ type: "respawn" });
  }

  private refreshEnvironment(): void {
    const h = this.getHitboxH();
    const ground = probeGround(this.x, this.y, h, this.grid);
    this.onGround = ground.onGround;
    this.onJumpThrough = ground.onJumpThrough;
    this.wallDir = wallDirAt(this.x, this.y, h, this.grid);
  }

  private normalUpdate(dt: number, input: InputState): void {
    if (this.tryStartGrab(input)) {
      return;
    }

    if (this.canDash(input)) {
      this.applyLiftBoost();
      this.startDash();
      return;
    }

    if (this.ducking) {
      if (this.onGround && input.y !== 1) {
        if (!this.tryStand() && Math.abs(this.vx) <= EPSILON) {
          this.tryDuckCorrection(dt);
        }
      }
    } else if (this.onGround && input.y === 1 && this.vy >= 0) {
      this.tryEnterDuck();
    }

    if (this.ducking && this.onGround) {
      this.vx = approach(this.vx, 0, this.cfg.movement.duckFriction * dt);
    } else {
      const mult = this.onGround ? 1 : this.cfg.movement.airMult;
      const target = this.cfg.movement.maxRun * this.moveXInput;

      if (
        this.moveXInput !== 0 &&
        Math.abs(this.vx) > this.cfg.movement.maxRun &&
        Math.sign(this.vx) === this.moveXInput
      ) {
        this.vx = approach(this.vx, target, this.cfg.movement.runReduce * mult * dt);
      } else {
        this.vx = approach(this.vx, target, this.cfg.movement.runAccel * mult * dt);
      }
    }

    this.updateVertical(dt, input);

    if (input.jumpPressed) {
      if (this.jumpGraceTimer > 0) {
        this.jump();
        return;
      }

      if (this.canUnDuck()) {
        if (this.wallJumpCheck(1)) {
          if (this.isUpDashAttackActive()) {
            this.superWallJump(-1);
          } else {
            this.wallJump(-1);
          }
          return;
        }

        if (this.wallJumpCheck(-1)) {
          if (this.isUpDashAttackActive()) {
            this.superWallJump(1);
          } else {
            this.wallJump(1);
          }
          return;
        }
      }
    }
  }

  private updateVertical(dt: number, input: InputState): void {
    if (input.y === 1 && this.vy >= this.cfg.gravity.maxFall) {
      this.maxFall = approach(this.maxFall, this.cfg.gravity.fastMaxFall, this.cfg.gravity.fastMaxAccel * dt);
    } else {
      this.maxFall = approach(this.maxFall, this.cfg.gravity.maxFall, this.cfg.gravity.fastMaxAccel * dt);
    }

    this.isFastFalling = this.maxFall > this.cfg.gravity.maxFall + 1;

    if (!this.onGround) {
      let max = this.maxFall;

      if ((this.moveXInput === this.facing || (this.moveXInput === 0 && input.grab)) && input.y !== 1) {
        if (
          this.vy >= 0 &&
          this.wallSlideTimer > 0 &&
          this.climbBoundsCheck(this.facing) &&
          this.isFacingWallSolid() &&
          this.canUnDuck()
        ) {
          this.setDucking(false);
          this.wallSlideDir = this.facing;
        }

        if (this.wallSlideDir !== 0) {
          const t = Math.max(0, Math.min(1, this.wallSlideTimer / this.cfg.gravity.wallSlideTime));
          max = this.lerp(this.cfg.gravity.maxFall, this.cfg.gravity.wallSlideStartMax, t);
        }
      }

      const halfGravity =
        Math.abs(this.vy) < this.cfg.gravity.halfGravThreshold && (input.jump || this.autoJump);
      const gravityMult = halfGravity ? 0.5 : 1;
      this.vy = approach(this.vy, max, this.cfg.gravity.normal * gravityMult * dt);
    }

    this.updateVariableJump(input);
  }

  private climbUpdate(dt: number, input: InputState): void {
    this.climbNoMoveTimer -= dt;

    if (this.wallDir !== 0) {
      this.facing = this.wallDir as 1 | -1;
    }

    if (this.onGround) {
      this.stamina = this.cfg.climb.max;
    }

    if (input.jumpPressed && (!this.ducking || this.canUnDuck())) {
      if (this.moveXInput === -this.facing) {
        this.wallJump(-this.facing);
      } else {
        this.climbJump();
      }
      return;
    }

    if (this.canDash(input)) {
      this.applyLiftBoost();
      this.startDash();
      return;
    }

    if (!input.grab) {
      this.applyLiftBoost();
      this.toNormalState();
      return;
    }

    if (!this.climbCheck(this.facing)) {
      if (this.vy < 0) {
        this.climbHop();
      }
      this.toNormalState();
      return;
    }

    let target = 0;
    let trySlip = false;

    if (this.climbNoMoveTimer <= 0) {
      if (input.y === -1) {
        target = this.cfg.climb.climbUpSpeed;

        const blockedAbove =
          collideSolidAt(this.x, this.y - 1, PLAYER_GEOMETRY.hitboxW, this.getHitboxH(), this.grid) ||
          (this.climbHopBlockedCheck() && this.slipCheck(-1));

        if (blockedAbove) {
          if (this.vy < 0) {
            this.vy = 0;
          }
          target = 0;
          trySlip = true;
        } else if (this.slipCheck()) {
          this.climbHop();
          return;
        }
      } else if (input.y === 1) {
        target = this.cfg.climb.climbDownSpeed;

        if (this.onGround) {
          if (this.vy > 0) {
            this.vy = 0;
          }
          target = 0;
        }
      } else {
        trySlip = true;
      }
    } else {
      trySlip = true;
    }

    this.lastClimbMove = Math.sign(target);

    if (trySlip && this.slipCheck()) {
      target = this.cfg.climb.climbSlipSpeed;
    }

    this.vy = approach(this.vy, target, this.cfg.climb.climbAccel * dt);

    if (
      input.y !== 1 &&
      this.vy > 0 &&
      !collideSolidAt(
        this.x + this.facing,
        this.y + 1,
        PLAYER_GEOMETRY.hitboxW,
        this.getHitboxH(),
        this.grid,
      )
    ) {
      this.vy = 0;
    }

    if (this.climbNoMoveTimer <= 0) {
      if (this.lastClimbMove < 0) {
        this.consumeStamina(this.cfg.climb.upCost * dt);
      } else if (this.lastClimbMove === 0) {
        this.consumeStamina(this.cfg.climb.stillCost * dt);
      }
    }

    if (this.stamina <= 0) {
      this.applyLiftBoost();
      this.vy = Math.max(this.vy, this.cfg.climb.exhaustedSlipSpeed);
      this.toNormalState();
      return;
    }

    this.vx = 0;
    this.remX = 0;
  }

  private dashUpdate(dt: number, input: InputState): void {
    if (this.dashDir.y === 0) {
      if (input.jumpPressed && this.canUnDuck() && this.jumpGraceTimer > 0) {
        this.superJump();
        return;
      }
    }

    if (this.dashDir.x === 0 && this.dashDir.y < -0.9) {
      if (input.jumpPressed && this.canUnDuck()) {
        if (this.wallJumpCheck(1)) {
          this.superWallJump(-1);
          return;
        }
        if (this.wallJumpCheck(-1)) {
          this.superWallJump(1);
          return;
        }
      }
    } else if (input.jumpPressed && this.canUnDuck()) {
      if (this.wallJumpCheck(1)) {
        this.wallJump(-1);
        return;
      }
      if (this.wallJumpCheck(-1)) {
        this.wallJump(1);
        return;
      }
    }

    if (this.dashJustStarted) {
      this.dashJustStarted = false;
      return;
    }

    this.dashTimer -= dt;
    if (this.dashTimer <= 0) {
      this.finishDash();
    }
  }

  private tryStartGrab(input: InputState): boolean {
    if (!input.grab || this.isTired() || this.ducking) return false;

    if (this.vy < 0) return false;
    if (Math.sign(this.vx) === -this.facing) return false;

    if (this.climbCheck(this.facing)) {
      this.enterClimb();
      return true;
    }

    if (input.y < 1) {
      for (let i = 1; i <= this.cfg.climb.upCheckDist; i++) {
        if (collideSolidAt(this.x, this.y - i, PLAYER_GEOMETRY.hitboxW, this.getHitboxH(), this.grid)) {
          continue;
        }

        if (this.climbCheck(this.facing, -i)) {
          this.y -= i;
          this.enterClimb();
          return true;
        }
      }
    }

    return false;
  }

  private enterClimb(): void {
    this.setDucking(false);
    this.state = "grab";
    this.autoJump = false;
    this.vx = 0;
    this.remX = 0;
    this.vy *= this.cfg.climb.climbGrabYMult;
    this.wallSlideTimer = this.cfg.gravity.wallSlideTime;
    this.climbNoMoveTimer = this.cfg.climb.noMoveTime;
    this.wallBoostTimer = 0;
    this.lastClimbMove = 0;

    for (let i = 0; i < this.cfg.climb.checkDist; i++) {
      if (!collideSolidAt(this.x + this.facing, this.y, PLAYER_GEOMETRY.hitboxW, this.getHitboxH(), this.grid)) {
        this.x += this.facing;
      } else {
        break;
      }
    }
  }

  private jump(emitEffect = true): void {
    this.jumpGraceTimer = 0;
    this.varJumpTimer = this.cfg.jump.varTime;
    this.autoJump = false;
    this.dashAttackTimer = 0;
    this.wallSlideTimer = this.cfg.gravity.wallSlideTime;
    this.wallBoostTimer = 0;

    this.vx += this.cfg.jump.hBoost * this.moveXInput;
    this.vy = this.cfg.jump.speed;
    this.applyLiftBoost();
    this.varJumpSpeed = this.vy;
    this.toNormalState();

    if (emitEffect) {
      this.emit({ type: "jump", dirX: Math.sign(this.vx) || this.facing, dirY: -1 });
    }
  }

  private wallJump(dir: number): void {
    this.setDucking(false);
    this.jumpGraceTimer = 0;
    this.varJumpTimer = this.cfg.jump.varTime;
    this.autoJump = false;
    this.dashAttackTimer = 0;
    this.wallSlideTimer = this.cfg.gravity.wallSlideTime;
    this.wallBoostTimer = 0;

    if (this.moveXInput !== 0) {
      this.forceMoveX = dir;
      this.forceMoveXTimer = this.cfg.jump.wallJumpForceTime;
    }

    this.vx = this.cfg.jump.wallJumpHSpeed * dir;
    this.vy = this.cfg.jump.speed;
    this.applyLiftBoost();
    this.varJumpSpeed = this.vy;
    this.facing = dir as 1 | -1;
    this.toNormalState();

    this.emit({ type: "wall_jump", wallDir: -dir, dirX: dir, dirY: -1 });
  }

  private superWallJump(dir: number): void {
    this.setDucking(false);
    this.jumpGraceTimer = 0;
    this.varJumpTimer = this.cfg.jump.superWallJumpVarTime;
    this.autoJump = false;
    this.dashAttackTimer = 0;
    this.wallSlideTimer = this.cfg.gravity.wallSlideTime;
    this.wallBoostTimer = 0;

    this.vx = this.cfg.jump.superWallJumpH * dir;
    this.vy = this.cfg.jump.superWallJumpSpeed;
    this.applyLiftBoost();
    this.varJumpSpeed = this.vy;
    this.facing = dir as 1 | -1;
    this.toNormalState();

    this.emit({ type: "wall_jump", wallDir: -dir, dirX: dir, dirY: -1 });
  }

  private climbJump(): void {
    if (!this.onGround) {
      this.consumeStamina(this.cfg.climb.jumpCost);
    }

    this.jump(false);

    if (this.moveXInput === 0) {
      this.wallBoostDir = -this.facing;
      this.wallBoostTimer = this.cfg.climb.climbJumpBoostTime;
    }

    this.emit({ type: "jump", dirX: Math.sign(this.vx) || this.facing, dirY: -1 });
  }

  private superJump(): void {
    this.jumpGraceTimer = 0;
    this.varJumpTimer = this.cfg.jump.varTime;
    this.autoJump = false;
    this.dashAttackTimer = 0;
    this.wallSlideTimer = this.cfg.gravity.wallSlideTime;
    this.wallBoostTimer = 0;

    const wasDucking = this.ducking;
    const wasFacing = this.facing;
    const reverse = this.dashDir.x !== 0 && Math.sign(this.dashDir.x) !== wasFacing;

    this.vx = this.cfg.jump.superJumpH * this.facing;
    this.vy = this.cfg.jump.speed;
    this.applyLiftBoost();

    if (wasDucking) {
      this.setDucking(false);
      this.vx *= this.cfg.jump.duckSuperJumpXMult;
      this.vy *= this.cfg.jump.duckSuperJumpYMult;
    }

    this.varJumpSpeed = this.vy;
    this.toNormalState();

    const type = wasDucking
      ? (this.dashStartedOnGround ? "hyper" : "wavedash")
      : "super";

    const extended = this.dashesLeft >= this.cfg.dash.maxDashes;

    this.emit({
      type,
      dirX: Math.sign(this.vx) || this.facing,
      dirY: -1,
      extended,
      reverse,
    });
  }

  private canDash(input: InputState): boolean {
    return input.dashPressed && this.dashCooldownTimer <= 0 && this.dashesLeft > 0;
  }

  private startDash(): void {
    this.dashesLeft = Math.max(0, this.dashesLeft - 1);
    this.dashCooldownTimer = this.cfg.dash.cooldown;
    this.dashRefillCooldownTimer = this.cfg.dash.refillCooldown;
    this.dashAttackTimer = this.cfg.dash.attackTime;
    this.dashStartedOnGround = this.onGround;

    this.beforeDashVx = this.vx;
    this.beforeDashVy = this.vy;

    this.vx = 0;
    this.vy = 0;
    this.dashDir = { x: 0, y: 0 };

    if (!this.onGround && this.ducking && this.canUnDuck()) {
      this.setDucking(false);
    }

    this.dashJustStarted = false;
    this.state = "freeze";
    this.dashFreezeTimer = this.cfg.dash.preDelay;
  }

  private beginDashMotion(): void {
    const dir = this.lastAim;

    const baseVx = dir.x * this.cfg.dash.speed;
    let newVx = baseVx;
    const newVy = dir.y * this.cfg.dash.speed;

    if (
      baseVx !== 0 &&
      Math.sign(this.beforeDashVx) === Math.sign(baseVx) &&
      Math.abs(this.beforeDashVx) > Math.abs(baseVx)
    ) {
      newVx = this.beforeDashVx;
    }

    this.vx = newVx;
    this.vy = newVy;

    this.dashDir = { x: dir.x, y: dir.y };
    if (this.dashDir.x !== 0) {
      this.facing = Math.sign(this.dashDir.x) as 1 | -1;
    }

    if (this.onGround && this.isDownDiagonalDash() && this.vy > 0) {
      this.applyDashSlide(false);
    }

    this.state = "dash";
    this.dashTimer = this.cfg.dash.duration;
    this.dashJustStarted = true;

    this.emit({ type: "dash_start", dirX: this.dashDir.x, dirY: this.dashDir.y });
  }

  private finishDash(): void {
    this.autoJump = true;
    this.autoJumpTimer = 0;

    if (this.dashDir.y <= 0) {
      this.vx = this.dashDir.x * this.cfg.dash.endSpeed;
      this.vy = this.dashDir.y * this.cfg.dash.endSpeed;
    }

    if (this.vy < 0) {
      this.vy *= this.cfg.dash.endDashUpMult;
    }

    this.dashJustStarted = false;
    this.toNormalState();
    this.dashTimer = 0;
  }

  private moveX(amount: number): void {
    this.remX += amount;
    let move = Math.round(this.remX);
    this.remX -= move;
    const h = this.getHitboxH();

    while (move !== 0) {
      const sign = Math.sign(move);
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
        continue;
      }

      const dashCollision = this.tryDashHorizontalCollision(sign, h);
      if (dashCollision === "corrected") {
        move -= sign;
        continue;
      }

      if (dashCollision === "ducked") {
        break;
      }

      if (this.wallSpeedRetentionTimer <= 0) {
        this.wallSpeedRetained = this.vx;
        this.wallSpeedRetentionTimer = this.cfg.movement.wallSpeedRetentionTime;
      }

      this.vx = 0;
      this.remX = 0;
      this.dashAttackTimer = 0;
      break;
    }
  }

  private moveY(amount: number): void {
    this.remY += amount;
    let move = Math.round(this.remY);
    this.remY -= move;
    const h = this.getHitboxH();

    while (move !== 0) {
      const sign = Math.sign(move);
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
        continue;
      }

      if (sign < 0 && this.tryUpCornerCorrectionY(h)) {
        move -= sign;
        continue;
      }

      if (sign > 0 && this.tryDashDownwardCornerCorrection(h)) {
        move -= sign;
        continue;
      }

      if (sign > 0 && this.isDownDiagonalDash() && this.vy > 0) {
        this.applyDashSlide(!this.dashStartedOnGround);
      }

      if (sign > 0 && !this.onGround) {
        this.emit({ type: "land" });
      }

      if (sign < 0 && this.varJumpTimer < this.cfg.jump.varTime - this.cfg.jump.ceilingVarJumpGrace) {
        this.varJumpTimer = 0;
      }

      this.vy = 0;
      this.remY = 0;
      this.dashAttackTimer = 0;
      break;
    }
  }

  private tryDashHorizontalCollision(sign: number, h: number): DashHorizontalCollisionResult {
    if (this.state !== "dash") return "none";

    if (this.onGround && this.duckFreeAt(this.x + sign)) {
      this.setDucking(true);
      return "ducked";
    }

    if (Math.abs(this.vy) <= EPSILON && Math.abs(this.vx) > EPSILON) {
      for (let i = 1; i <= this.cfg.movement.dashCornerCorrection; i++) {
        for (const j of [1, -1]) {
          const yOffset = i * j;
          if (!collideSolidAt(this.x + sign, this.y + yOffset, PLAYER_GEOMETRY.hitboxW, h, this.grid)) {
            this.y += yOffset;
            this.x += sign;
            return "corrected";
          }
        }
      }
    }

    return "none";
  }

  private tryDashDownwardCornerCorrection(h: number): boolean {
    if (this.state !== "dash" || this.dashStartedOnGround || this.vy <= 0) {
      return false;
    }

    if (this.vx <= 0) {
      for (let i = -1; i >= -this.cfg.movement.dashCornerCorrection; i--) {
        if (!this.onGroundAt(this.x + i, this.y, h)) {
          this.x += i;
          this.y += 1;
          return true;
        }
      }
    }

    if (this.vx >= 0) {
      for (let i = 1; i <= this.cfg.movement.dashCornerCorrection; i++) {
        if (!this.onGroundAt(this.x + i, this.y, h)) {
          this.x += i;
          this.y += 1;
          return true;
        }
      }
    }

    return false;
  }

  private tryUpCornerCorrectionY(h: number): boolean {
    if (this.vx <= 0) {
      for (let i = 1; i <= this.cfg.movement.upwardCornerCorrection; i++) {
        if (!collideSolidAt(this.x - i, this.y - 1, PLAYER_GEOMETRY.hitboxW, h, this.grid)) {
          this.x -= i;
          this.y -= 1;
          return true;
        }
      }
    }

    if (this.vx >= 0) {
      for (let i = 1; i <= this.cfg.movement.upwardCornerCorrection; i++) {
        if (!collideSolidAt(this.x + i, this.y - 1, PLAYER_GEOMETRY.hitboxW, h, this.grid)) {
          this.x += i;
          this.y -= 1;
          return true;
        }
      }
    }

    return false;
  }

  private updateVariableJump(input: InputState): void {
    if (this.varJumpTimer <= 0) return;

    if (this.autoJump || input.jump) {
      this.vy = Math.min(this.vy, this.varJumpSpeed);
    } else {
      this.varJumpTimer = 0;
    }
  }

  private applyDashSlide(emitUltra: boolean): boolean {
    if (!this.isDownDiagonalDash() || this.vy <= 0) {
      return false;
    }

    const dirX = this.dashDir.x === 0 ? this.facing : Math.sign(this.dashDir.x);

    this.dashDir = { x: dirX, y: 0 };
    this.vy = 0;
    this.vx *= this.cfg.dash.dodgeSlideSpeedMult;
    this.setDucking(true);

    if (emitUltra) {
      this.emit({ type: "ultra", dirX, dirY: 0 });
    }

    return true;
  }

  private updateWallSpeedRetention(dt: number): void {
    if (this.wallSpeedRetentionTimer <= 0) return;

    if (Math.sign(this.vx) === -Math.sign(this.wallSpeedRetained)) {
      this.wallSpeedRetentionTimer = 0;
      return;
    }

    const dir = Math.sign(this.wallSpeedRetained);
    if (
      dir !== 0 &&
      !collideSolidAt(this.x + dir, this.y, PLAYER_GEOMETRY.hitboxW, this.getHitboxH(), this.grid)
    ) {
      this.vx = this.wallSpeedRetained;
      this.wallSpeedRetentionTimer = 0;
      return;
    }

    this.wallSpeedRetentionTimer = Math.max(0, this.wallSpeedRetentionTimer - dt);
  }

  private consumeStamina(amount: number): void {
    this.stamina = Math.max(0, this.stamina - amount);
  }

  private applyLiftBoost(): void {
    const boost = this.liftBoost();
    this.vx += boost.x;
    this.vy += boost.y;
    this.liftTimer = 0;
  }

  private liftBoost(): { x: number; y: number } {
    if (this.liftTimer <= 0) {
      return { x: 0, y: 0 };
    }

    let x = this.liftVx;
    let y = this.liftVy;

    if (Math.abs(x) > this.cfg.lift.maxBoostX) {
      x = this.cfg.lift.maxBoostX * Math.sign(x);
    }

    if (y > 0) {
      y = 0;
    } else if (y < -this.cfg.lift.maxBoostY) {
      y = -this.cfg.lift.maxBoostY;
    }

    return { x, y };
  }

  private tryEnterDuck(): boolean {
    if (this.ducking || !this.onGround) return false;

    const delta = PLAYER_GEOMETRY.hitboxH - PLAYER_GEOMETRY.crouchHitboxH;
    if (delta <= 0) return false;

    this.y += delta;
    this.ducking = true;
    return true;
  }

  private tryStand(): boolean {
    if (!this.ducking) return true;
    if (!this.canUnDuck()) return false;

    this.setDucking(false);
    return true;
  }

  private setDucking(value: boolean): void {
    if (this.ducking === value) return;

    const delta = PLAYER_GEOMETRY.hitboxH - PLAYER_GEOMETRY.crouchHitboxH;
    if (delta <= 0) {
      this.ducking = value;
      return;
    }

    if (value) {
      this.y += delta;
    } else {
      this.y -= delta;
    }

    this.ducking = value;
  }

  private canUnDuck(): boolean {
    if (!this.ducking) return true;

    const standTop = this.getStandTopAt(this.x, this.y);
    return !collideSolidAt(
      this.x,
      standTop,
      PLAYER_GEOMETRY.hitboxW,
      PLAYER_GEOMETRY.hitboxH,
      this.grid,
    );
  }

  private canUnDuckAt(x: number): boolean {
    if (!this.ducking) return true;

    const standTop = this.getStandTopAt(x, this.y);
    return !collideSolidAt(
      x,
      standTop,
      PLAYER_GEOMETRY.hitboxW,
      PLAYER_GEOMETRY.hitboxH,
      this.grid,
    );
  }

  private duckFreeAt(x: number): boolean {
    const footY = this.y + this.getHitboxH();
    const crouchTop = footY - PLAYER_GEOMETRY.crouchHitboxH;
    return !collideSolidAt(
      x,
      crouchTop,
      PLAYER_GEOMETRY.hitboxW,
      PLAYER_GEOMETRY.crouchHitboxH,
      this.grid,
    );
  }

  private tryDuckCorrection(dt: number): void {
    for (let i = this.cfg.movement.duckCorrectCheck; i > 0; i--) {
      if (this.canUnDuckAt(this.x + i)) {
        this.moveX(this.cfg.movement.duckCorrectSlide * dt);
        break;
      }

      if (this.canUnDuckAt(this.x - i)) {
        this.moveX(-this.cfg.movement.duckCorrectSlide * dt);
        break;
      }
    }
  }

  private wallJumpCheck(dir: number): boolean {
    return this.climbBoundsCheck(dir) &&
      collideSolidAt(
        this.x + dir * this.cfg.jump.wallJumpCheckDist,
        this.y,
        PLAYER_GEOMETRY.hitboxW,
        this.getHitboxH(),
        this.grid,
      );
  }

  private climbBoundsCheck(dir: number): boolean {
    const left = this.x + dir * this.cfg.climb.checkDist;
    const right = this.x + PLAYER_GEOMETRY.hitboxW - 1 + dir * this.cfg.climb.checkDist;
    const worldRight = WORLD.cols * WORLD.tile;
    return left >= 0 && right < worldRight;
  }

  private climbCheck(dir: number, yAdd = 0): boolean {
    return this.climbBoundsCheck(dir) &&
      collideSolidAt(
        this.x + dir * this.cfg.climb.checkDist,
        this.y + yAdd,
        PLAYER_GEOMETRY.hitboxW,
        this.getHitboxH(),
        this.grid,
      );
  }

  private climbHop(): void {
    this.vx = this.facing * this.cfg.climb.climbHopX;
    this.vy = Math.min(this.vy, this.cfg.climb.climbHopY);
    this.forceMoveX = 0;
    this.forceMoveXTimer = this.cfg.climb.climbHopForceTime;
    this.toNormalState();
  }

  private slipCheck(addY = 0): boolean {
    const y = this.y + 4 + addY;
    const x = this.facing === 1 ? this.x + PLAYER_GEOMETRY.hitboxW : this.x - 1;

    return !this.solidAtPoint(x, y) && !this.solidAtPoint(x, y - 4);
  }

  private climbHopBlockedCheck(): boolean {
    return false;
  }

  private solidAtPoint(px: number, py: number): boolean {
    return collideSolidAt(px, py, 1, 1, this.grid);
  }

  private isFacingWallSolid(): boolean {
    return collideSolidAt(
      this.x + this.facing,
      this.y,
      PLAYER_GEOMETRY.hitboxW,
      this.getHitboxH(),
      this.grid,
    );
  }

  private onGroundAt(x: number, y: number, h: number): boolean {
    return probeGround(x, y, h, this.grid).onGround;
  }

  private isDownDiagonalDash(): boolean {
    return Math.abs(this.dashDir.x) > EPSILON && this.dashDir.y > EPSILON;
  }

  private isUpDashAttackActive(): boolean {
    return this.dashAttackTimer > 0 && Math.abs(this.dashDir.x) <= EPSILON && this.dashDir.y < -0.9;
  }

  private isTired(): boolean {
    return this.stamina <= this.cfg.climb.tiredThreshold;
  }

  private getHitboxH(): number {
    return this.ducking ? PLAYER_GEOMETRY.crouchHitboxH : PLAYER_GEOMETRY.hitboxH;
  }

  private getStandTopAt(x: number, y: number): number {
    const footY = y + PLAYER_GEOMETRY.crouchHitboxH;
    return footY - PLAYER_GEOMETRY.hitboxH;
  }

  private lerp(from: number, to: number, t: number): number {
    return from + (to - from) * t;
  }

  private toNormalState(): void {
    this.state = "normal";
    this.maxFall = this.cfg.gravity.maxFall;
  }

  private emit(effect: PlayerEffect): void {
    this.effects.push(effect);
  }
}
