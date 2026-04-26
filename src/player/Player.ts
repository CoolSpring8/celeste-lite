import { DEFAULT_ASSIST_OPTIONS, type AssistOptions } from "../assists";
import { COLORS, PLAYER_CONFIG, PLAYER_GEOMETRY, PlayerConfig, WORLD } from "../constants";
import { CollisionWorld } from "../entities/CollisionWorld";
import { Hitbox } from "../entities/core/Hitbox";
import {
  addFloat,
  approach,
  clamp01Float,
  clampFloat,
  dashDirection,
  lerp,
  maxFloat,
  minFloat,
  mulFloat,
  sign,
  stepTimer,
  subFloat,
  toFloat,
} from "./math";
import { Actor, type MoveCollisionResult } from "./Actor";
import {
  introDuration,
  isActivePlayerIntroSpec,
  type ActivePlayerIntroSpec,
  type PlayerIntroSpec,
  samplePlayerIntroState,
  type PlayerIntroType,
} from "./intro";
import { StateMachine } from "./StateMachine";
import { InputState, PlayerEffect, PlayerSnapshot, PlayerState, PlayerSweatState } from "./types";

type DashHorizontalCollisionResult = "none" | "corrected" | "ducked";

const EPSILON = 0.0001;
const DASH_TRAIL_INTERVAL = 0.08;
const HAIR_FLASH_DURATION = 0.12;
const USED_HAIR_LERP_RATE = 6;
const BOUNCE_AUTO_JUMP_TIME = 0.1;
const BOUNCE_VAR_JUMP_TIME = 0.2;
const BOUNCE_SPEED = -140;
const BOTTOM_BOUNCE_JUMP_HELD_SPEED = -180;
const SWEAT_JUMP_HOLD_TIME = 0.12;
const ZERO_DIRECTION = { x: 0, y: 0 };
const EMPTY_INPUT: InputState = {
  x: 0,
  y: 0,
  aimX: 0,
  aimY: 0,
  jump: false,
  jumpPressed: false,
  jumpReleased: false,
  dash: false,
  dashPressed: false,
  crouchDash: false,
  crouchDashPressed: false,
  grab: false,
};

export class Player extends Actor {
  vx = 0;
  vy = 0;

  facing: 1 | -1 = 1;

  onGround = false;
  onJumpThrough = false;
  wallDir = 0;

  private readonly normalHitbox = new Hitbox(PLAYER_GEOMETRY.hitboxW, PLAYER_GEOMETRY.hitboxH, -4, -11);
  private readonly duckHitbox = new Hitbox(PLAYER_GEOMETRY.hitboxW, PLAYER_GEOMETRY.crouchHitboxH, -4, -6);
  private readonly normalHurtbox = new Hitbox(PLAYER_GEOMETRY.hitboxW, PLAYER_GEOMETRY.hurtboxH, -4, -11);
  private readonly duckHurtbox = new Hitbox(PLAYER_GEOMETRY.hitboxW, PLAYER_GEOMETRY.crouchHurtboxH, -4, -6);
  private hurtbox: Hitbox;
  private moveXInput = 0;

  private jumpGraceTimer = 0;
  private jumpPressBufferTimer = 0;
  private varJumpTimer = 0;
  private varJumpSpeed = 0;
  private autoJump = false;
  private autoJumpTimer = 0;

  private readonly stateMachine: StateMachine<PlayerState>;
  private frameDt = 0;
  private input: InputState = EMPTY_INPUT;

  private dashCooldownTimer = 0;
  private dashPressBufferTimer = 0;
  private dashPressCrouches = false;
  private dashRefillCooldownTimer = 0;
  private dashAttackTimer = 0;
  private dashTrailTimer = 0;
  private freezeRequestTimer = 0;
  private dashStartedOnGround = false;
  private crouchDashActive = false;

  private wallSlideTimer: number;
  private wallSlideDir = 0;
  private wallDustDir = 0;
  private maxFall: number;

  private forceMoveX = 0;
  private forceMoveXTimer = 0;
  private wallSpeedRetentionTimer = 0;
  private wallSpeedRetained = 0;
  private wallBoostDir = 0;
  private wallBoostTimer = 0;

  private climbNoMoveTimer = 0;
  private lastClimbMove = 0;
  private hopWaitX = 0;
  private hopWaitXSpeed = 0;

  private lastAim = { x: 1, y: 0 };
  dashDir = { x: 0, y: 0 };
  dashesLeft: number;
  stamina: number;

  private beforeDashVx = 0;
  private wasDashB = false;
  private hairColor: number = COLORS.playerOneDash;
  private hairFlashTimer = 0;
  private lastHairDashes: number;
  private sweatJumpTimer = 0;

  private isFastFalling = false;

  private liftVx = 0;
  private liftVy = 0;
  private liftTimer = 0;

  private dead = false;
  private justRespawned = false;
  private lastDeathDirection: Readonly<{ x: number; y: number }> = ZERO_DIRECTION;
  private introType: PlayerIntroType = "none";
  private introElapsed = 0;
  private introDuration = 0;
  private introSourceX: number | null = null;
  private introSourceY: number | null = null;
  private wasOnGround = false;
  private effects: PlayerEffect[] = [];
  private assistOptions: AssistOptions = DEFAULT_ASSIST_OPTIONS;

  private cfg: PlayerConfig;

  constructor(x: number, y: number, world: CollisionWorld, cfg: PlayerConfig = PLAYER_CONFIG) {
    super(x, y, world);
    this.cfg = cfg;
    this.collider = this.normalHitbox;
    this.hurtbox = this.normalHurtbox;
    this.dashesLeft = cfg.dash.maxDashes;
    this.stamina = toFloat(cfg.climb.max);
    this.lastHairDashes = this.dashesLeft;
    this.wallSlideTimer = toFloat(cfg.gravity.wallSlideTime);
    this.maxFall = toFloat(cfg.gravity.maxFall);
    this.resetHairState();

    this.stateMachine = new StateMachine<PlayerState>("normal");
    this.stateMachine.setCallbacks(
      "normal",
      () => this.normalUpdate(),
      undefined,
      () => this.normalBegin(),
      () => this.normalEnd(),
    );
    this.stateMachine.setCallbacks(
      "climb",
      () => this.climbUpdate(),
      undefined,
      () => this.climbBegin(),
      () => this.climbEnd(),
    );
    this.stateMachine.setCallbacks(
      "dash",
      () => this.dashUpdate(),
      () => this.dashCoroutine(),
      () => this.dashBegin(),
      () => this.dashEnd(),
    );
    this.stateMachine.setCallbacks(
      "intro_start",
      () => this.introStartUpdate(),
      undefined,
      () => this.introStartBegin(),
      () => this.introEnd(),
    );
    this.stateMachine.setCallbacks(
      "intro_respawn",
      () => this.introRespawnUpdate(),
      undefined,
      () => this.introRespawnBegin(),
      () => this.introEnd(),
    );
    this.stateMachine.forceState("normal");
  }

  private get ducking(): boolean {
    return this.collider === this.duckHitbox;
  }

  update(dt: number, input: InputState): void {
    dt = toFloat(dt);
    this.frameDt = dt;
    this.input = input;
    if (this.dead) {
      this.refreshEnvironment();
      return;
    }

    this.refreshEnvironment();
    if (this.assistOptions.infiniteStamina) {
      this.stamina = toFloat(this.cfg.climb.max);
    }
    this.wallDustDir = 0;

    if (this.forceMoveXTimer > 0) {
      this.forceMoveXTimer = stepTimer(this.forceMoveXTimer, dt);
      this.moveXInput = this.forceMoveX;
    } else {
      this.moveXInput = input.x;
    }

    if (input.jumpPressed) {
      this.jumpPressBufferTimer = toFloat(this.cfg.input.jumpBufferTime);
    } else if (!input.jump) {
      this.jumpPressBufferTimer = 0;
    } else if (this.jumpPressBufferTimer > 0) {
      this.jumpPressBufferTimer = stepTimer(this.jumpPressBufferTimer, dt);
    }

    if (input.crouchDashPressed) {
      this.dashPressBufferTimer = toFloat(this.cfg.input.dashBufferTime);
      this.dashPressCrouches = true;
    } else if (input.dashPressed) {
      this.dashPressBufferTimer = toFloat(this.cfg.input.dashBufferTime);
      this.dashPressCrouches = input.y === 1;
    } else if (!input.dash && !input.crouchDash) {
      this.dashPressBufferTimer = 0;
      this.dashPressCrouches = false;
    } else if (this.dashPressBufferTimer > 0) {
      this.dashPressBufferTimer = stepTimer(this.dashPressBufferTimer, dt);
      if (this.dashPressBufferTimer <= 0) {
        this.dashPressCrouches = false;
      }
    }

    if (this.wallSlideDir !== 0) {
      this.wallSlideTimer = stepTimer(this.wallSlideTimer, dt);
      this.wallSlideDir = 0;
    }

    if (this.wallBoostTimer > 0) {
      this.wallBoostTimer = subFloat(this.wallBoostTimer, dt);
      if (this.moveXInput === this.wallBoostDir) {
        this.vx = toFloat(this.cfg.jump.wallJumpHSpeed * this.moveXInput);
        this.stamina = minFloat(this.cfg.climb.max, addFloat(this.stamina, this.cfg.climb.jumpCost));
        this.wallBoostTimer = 0;
      }
    }

    if (this.onGround && this.stateMachine.state !== "climb") {
      this.autoJump = false;
      this.stamina = toFloat(this.cfg.climb.max);
      this.wallSlideTimer = toFloat(this.cfg.gravity.wallSlideTime);
    }

    if (this.dashAttackTimer > 0) {
      this.dashAttackTimer = stepTimer(this.dashAttackTimer, dt);
    }

    if (this.onGround) {
      this.jumpGraceTimer = toFloat(this.cfg.jump.graceTime);
    } else if (this.jumpGraceTimer > 0) {
      this.jumpGraceTimer = stepTimer(this.jumpGraceTimer, dt);
    }

    if (this.dashCooldownTimer > 0) {
      this.dashCooldownTimer = stepTimer(this.dashCooldownTimer, dt);
    }

    if (this.dashRefillCooldownTimer > 0) {
      this.dashRefillCooldownTimer = stepTimer(this.dashRefillCooldownTimer, dt);
    } else if (this.assistOptions.airDashes === "infinite") {
      this.refillDash();
    } else {
      const hurtbox = this.getHurtboxBounds();
      if (
        this.onGround &&
        this.dashesLeft < this.maxAirDashes() &&
        !this.world.collidesWithSpikeAt(hurtbox.x, hurtbox.y, hurtbox.w, hurtbox.h, this.vx, this.vy)
      ) {
        this.refillDash();
      }
    }

    if (this.varJumpTimer > 0) {
      this.varJumpTimer = stepTimer(this.varJumpTimer, dt);
    }

    if (this.autoJumpTimer > 0) {
      if (this.autoJump) {
        this.autoJumpTimer = subFloat(this.autoJumpTimer, dt);
        if (this.autoJumpTimer <= 0) {
          this.autoJump = false;
        }
      } else {
        this.autoJumpTimer = 0;
      }
    }

    if (this.liftTimer > 0 && !this.onGround) {
      this.liftTimer = stepTimer(this.liftTimer, dt);
    }

    if (this.sweatJumpTimer > 0) {
      this.sweatJumpTimer = stepTimer(this.sweatJumpTimer, dt);
    }

    const lift = this.liftBoost();
    if (lift.y < 0 && this.wasOnGround && !this.onGround && this.vy >= 0) {
      this.vy = lift.y;
    }

    if (this.moveXInput !== 0 && this.stateMachine.state !== "climb") {
      this.facing = this.moveXInput as 1 | -1;
    }

    this.lastAim = dashDirection(input.aimX, input.aimY, this.facing);
    this.updateWallSpeedRetention(dt);
    this.updateHopWait();

    this.stateMachine.update(dt);

    // Canonical order: pre-physics helper nudges before main movement step.
    this.applyJumpThruAssist(dt);
    this.applyDashFloorSnap();
    if (this.vy > 0 && this.canUnDuck() && !this.onGround) {
      this.setDucking(false);
    }

    this.moveH(mulFloat(this.vx, dt));
    this.moveV(mulFloat(this.vy, dt));

    this.refreshEnvironment();
    this.updateHairState(dt);

    if (this.justRespawned && (this.vx !== 0 || this.vy !== 0)) {
      this.justRespawned = false;
    }

    this.wasOnGround = this.onGround;
  }

  consumeEffects(): PlayerEffect[] {
    const out = this.effects;
    this.effects = [];
    return out;
  }

  getCollisionBounds(): { x: number; y: number; w: number; h: number } {
    return this.getHitboxBounds();
  }

  getHitboxBounds(): { x: number; y: number; w: number; h: number } {
    return this.bodyBoundsFor(this.requireBodyHitbox(), this.x, this.y);
  }

  getHurtboxBounds(): { x: number; y: number; w: number; h: number } {
    return this.bodyBoundsFor(this.hurtbox, this.x, this.y);
  }

  setAssistOptions(options: AssistOptions): void {
    const previousMaxDashes = this.maxAirDashes();
    this.assistOptions = { ...options };
    const nextMaxDashes = this.maxAirDashes();

    if (this.dashesLeft >= previousMaxDashes || this.assistOptions.airDashes === "infinite") {
      this.dashesLeft = nextMaxDashes;
      this.updateHairState(0);
    } else {
      this.dashesLeft = Math.min(this.dashesLeft, nextMaxDashes);
    }

    if (this.assistOptions.infiniteStamina) {
      this.stamina = toFloat(this.cfg.climb.max);
    }
  }

  tryRefill(targetDashes: number | "max"): boolean {
    const target = targetDashes === "max"
      ? this.maxAirDashes()
      : Math.max(0, targetDashes);

    const needsDashRefill = this.dashesLeft < target;
    const needsStaminaRefill = this.stamina < this.cfg.climb.tiredThreshold;
    if (!needsDashRefill && !needsStaminaRefill) return false;

    this.dashesLeft = Math.max(this.dashesLeft, target);
    this.stamina = toFloat(this.cfg.climb.max);
    this.dashRefillCooldownTimer = 0;
    if (needsDashRefill) {
      this.updateHairState(0);
    }
    return true;
  }

  getSnapshot(): PlayerSnapshot {
    const bounds = this.getHitboxBounds();
    const hitboxW = bounds.w;
    const hitboxH = bounds.h;
    const drawW = PLAYER_GEOMETRY.drawW;
    const drawH = this.ducking
      ? (PLAYER_GEOMETRY.drawH * PLAYER_GEOMETRY.crouchHitboxH) / PLAYER_GEOMETRY.hitboxH
      : PLAYER_GEOMETRY.drawH;
    const centerX = this.x;
    const centerY = bounds.y + hitboxH * 0.5;

    return {
      x: this.x,
      y: this.y,
      left: bounds.x,
      top: bounds.y,
      right: bounds.x + hitboxW,
      bottom: bounds.y + hitboxH,
      centerX,
      centerY,
      vx: this.vx,
      vy: this.vy,
      state: this.state,
      facing: this.facing,
      onGround: this.onGround,
      wallDir: this.wallSlideDir,
      wallDustDir: this.wallDustDir,
      dashesLeft: this.dashesLeft,
      hairColor: this.hairColor,
      sweatState: this.resolveSweatState(),
      isTired: this.isTired(),
      stamina: this.stamina,
      hitboxW,
      drawW,
      hitboxH,
      drawH,
      isCrouched: this.ducking,
      isFastFalling: this.isFastFalling,
      dead: this.dead,
      justRespawned: this.justRespawned,
      inControl: this.inControl,
      intro: this.currentIntroSnapshot(centerX, centerY),
    };
  }

  setLiftVelocity(vx: number, vy: number): void {
    this.liftVx = clampFloat(vx, -this.cfg.lift.maxBoostX, this.cfg.lift.maxBoostX);
    this.liftVy = clampFloat(vy, -this.cfg.lift.maxBoostY, this.cfg.lift.maxBoostY);
    this.liftTimer = toFloat(this.cfg.lift.momentumStoreTime);
  }

  private resetStateAt(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.clearMovementRemainders();
    this.stateMachine.locked = false;

    this.facing = 1;
    this.collider = this.normalHitbox;
    this.hurtbox = this.normalHurtbox;

    this.onGround = false;
    this.onJumpThrough = false;
    this.wallDir = 0;
    this.wallDustDir = 0;
    this.wasOnGround = false;

    this.moveXInput = 0;
    this.jumpGraceTimer = 0;
    this.jumpPressBufferTimer = 0;
    this.varJumpTimer = 0;
    this.varJumpSpeed = 0;
    this.autoJump = false;
    this.autoJumpTimer = 0;

    this.dashCooldownTimer = 0;
    this.dashPressBufferTimer = 0;
    this.dashPressCrouches = false;
    this.dashRefillCooldownTimer = 0;
    this.dashAttackTimer = 0;
    this.dashTrailTimer = 0;
    this.freezeRequestTimer = 0;
    this.dashStartedOnGround = false;
    this.crouchDashActive = false;

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
    this.hopWaitX = 0;
    this.hopWaitXSpeed = 0;

    this.lastAim = { x: this.facing, y: 0 };
    this.dashDir = { x: 0, y: 0 };
    this.dashesLeft = this.maxAirDashes();
    this.stamina = toFloat(this.cfg.climb.max);
    this.wasDashB = false;

    this.beforeDashVx = 0;
    this.resetHairState();
    this.sweatJumpTimer = 0;

    this.isFastFalling = false;

    this.liftVx = 0;
    this.liftVy = 0;
    this.liftTimer = 0;

    this.dead = false;
    this.lastDeathDirection = ZERO_DIRECTION;
    this.justRespawned = false;
    this.clearIntroState();
    this.effects = [];
    this.stateMachine.forceState("normal");
  }

  // Scene-managed teleports bypass the normal update loop, so collision-derived
  // state needs an explicit refresh before normal simulation resumes.
  private syncStateAfterExternalMove(): void {
    this.refreshEnvironment();
    this.wasOnGround = this.onGround;
    if (this.onGround) {
      this.jumpGraceTimer = toFloat(this.cfg.jump.graceTime);
    }
  }

  die(direction: Readonly<{ x: number; y: number }>, evenIfInvincible = false): boolean {
    if (this.dead || (!evenIfInvincible && this.assistOptions.invincibility)) {
      return false;
    }

    this.dead = true;
    this.justRespawned = false;
    this.lastDeathDirection = {
      x: Math.sign(direction.x),
      y: Math.sign(direction.y),
    };
    this.sweatJumpTimer = 0;
    this.vx = 0;
    this.vy = 0;
    this.clearMovementRemainders();
    this.clearIntroState();
    this.effects = [];
    this.stateMachine.locked = true;
    return true;
  }

  reviveAt(
    x: number,
    y: number,
    intro:
      | PlayerIntroType
      | PlayerIntroSpec = "none",
  ): void {
    const introSpec: PlayerIntroSpec = typeof intro === "string" ? { type: intro } : intro;
    this.resetStateAt(x, y);
    this.syncStateAfterExternalMove();
    this.alignFacingForIntro(x, introSpec);

    if (!isActivePlayerIntroSpec(introSpec)) {
      return;
    }

    this.beginIntro(introSpec);
  }

  get state(): PlayerState {
    return this.stateMachine.state;
  }

  get canRetry(): boolean {
    return !this.dead && !this.timePaused;
  }

  get timePaused(): boolean {
    if (this.dead) {
      return true;
    }

    switch (this.stateMachine.state) {
      case "intro_start":
      case "intro_respawn":
        return true;
      default:
        return false;
    }
  }

  get inControl(): boolean {
    if (this.dead) {
      return false;
    }

    switch (this.stateMachine.state) {
      case "intro_start":
      case "intro_respawn":
        return false;
      default:
        return true;
    }
  }

  forceState(state: PlayerState): void {
    this.stateMachine.forceState(state);
  }

  onTransition(): void {
    this.wallSlideTimer = toFloat(this.cfg.gravity.wallSlideTime);
    this.jumpGraceTimer = 0;
    this.forceMoveXTimer = 0;

    const maxDashes = this.maxAirDashes();
    const dashRefilled = this.dashesLeft < maxDashes;
    this.refillDash();
    this.stamina = toFloat(this.cfg.climb.max);
    this.dashRefillCooldownTimer = 0;

    if (dashRefilled) {
      this.updateHairState(0);
    }
  }

  bounce(): void {
    this.stateMachine.forceState("normal");
    this.jumpGraceTimer = 0;
    this.varJumpTimer = BOUNCE_VAR_JUMP_TIME;
    this.autoJump = true;
    this.autoJumpTimer = BOUNCE_AUTO_JUMP_TIME;
    this.dashAttackTimer = 0;
    this.wallSlideTimer = toFloat(this.cfg.gravity.wallSlideTime);
    this.wallBoostTimer = 0;
    this.varJumpSpeed = this.vy = BOUNCE_SPEED;
    this.clearVerticalRemainder();
    this.emit({ type: "bounce", dirY: -1 });
  }

  bounceFromBottom(bottomLimit: number, jumpHeld: boolean): void {
    const hitbox = this.requireBodyHitbox();
    if (this.getHitboxBottom() > bottomLimit) {
      this.y = this.entityYForFoot(hitbox, bottomLimit);
    }

    this.bounce();
    if (jumpHeld) {
      this.varJumpTimer = BOUNCE_VAR_JUMP_TIME;
      this.autoJump = true;
      this.autoJumpTimer = BOUNCE_AUTO_JUMP_TIME;
      this.varJumpSpeed = this.vy = BOTTOM_BOUNCE_JUMP_HELD_SPEED;
    }
  }

  enforceTopLimit(minTop: number): void {
    const bounds = this.getHitboxBounds();
    if (bounds.y >= minTop) {
      return;
    }

    this.y = minTop + bounds.h;
    this.afterBlockedV(-1);
    this.refreshEnvironment();
  }

  private refreshEnvironment(): void {
    const body = this.getHitboxBounds();
    const ground = this.world.probeGround(body.x, body.y, body.w, body.h);
    this.onGround = ground.onGround;
    this.onJumpThrough = ground.onJumpThrough;
    this.wallDir = this.world.wallDirAt(body.x, body.y, body.w, body.h);
  }

  private currentIntroSnapshot(centerX: number, centerY: number) {
    if (this.introType === "none") {
      return null;
    }

    const duration = Math.max(this.introDuration, Number.EPSILON);
    return samplePlayerIntroState(
      this.introType,
      this.introElapsed / duration,
      centerX,
      centerY,
      this.introSourceX ?? centerX,
      this.introSourceY ?? centerY,
    );
  }

  private beginIntro(spec: ActivePlayerIntroSpec): void {
    this.introType = spec.type;
    this.introElapsed = 0;
    this.introDuration = spec.duration ?? introDuration(spec.type);
    this.introSourceX = spec.sourceX ?? null;
    this.introSourceY = spec.sourceY ?? null;
    this.justRespawned = spec.type === "respawn";
    this.stateMachine.forceState(spec.type === "respawn" ? "intro_respawn" : "intro_start");
  }

  private clearIntroState(): void {
    this.introType = "none";
    this.introElapsed = 0;
    this.introDuration = 0;
    this.introSourceX = null;
    this.introSourceY = null;
  }

  private alignFacingForIntro(x: number, introSpec: PlayerIntroSpec): void {
    if (introSpec.type === "none") {
      return;
    }

    const defaultCenterX = (this.world.cols * WORLD.tile) * 0.5;
    const compareCenterX = introSpec.facingCenterX ?? defaultCenterX;
    this.facing = x > compareCenterX ? -1 : 1;
    this.lastAim = { x: this.facing, y: 0 };
  }

  private introStartBegin(): void {
    this.vx = 0;
    this.vy = 0;
  }

  private introRespawnBegin(): void {
    this.vx = 0;
    this.vy = 0;
  }

  private introStartUpdate(): PlayerState {
    return this.advanceIntroState("intro_start");
  }

  private introRespawnUpdate(): PlayerState {
    return this.advanceIntroState("intro_respawn");
  }

  private advanceIntroState(state: "intro_start" | "intro_respawn"): PlayerState {
    this.vx = 0;
    this.vy = 0;
    this.introElapsed = Math.min(this.introDuration, this.introElapsed + this.frameDt);
    if (this.introElapsed < this.introDuration) {
      return state;
    }

    if (state === "intro_respawn") {
      this.emit({ type: "respawn_pop" });
    }

    return "normal";
  }

  private introEnd(): void {
    this.clearIntroState();
  }

  private normalBegin(): void {
    this.maxFall = toFloat(this.cfg.gravity.maxFall);
  }

  private normalEnd(): void {
    this.wallBoostTimer = 0;
    this.wallSpeedRetentionTimer = 0;
    this.hopWaitX = 0;
    this.hopWaitXSpeed = 0;
  }

  private normalUpdate(): PlayerState {
    const dt = this.frameDt;
    const input = this.input;

    if (this.tryStartGrab(input)) {
      return "climb";
    }

    if (this.canDash()) {
      this.applyLiftBoost();
      return this.startDash();
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
      this.vx = approach(this.vx, 0, mulFloat(this.cfg.movement.duckFriction, dt));
    } else {
      const mult = this.onGround ? 1 : this.cfg.movement.airMult;
      const target = toFloat(this.cfg.movement.maxRun * this.moveXInput);

      if (
        this.moveXInput !== 0 &&
        Math.abs(this.vx) > this.cfg.movement.maxRun &&
        sign(this.vx) === this.moveXInput
      ) {
        this.vx = approach(this.vx, target, mulFloat(mulFloat(this.cfg.movement.runReduce, mult), dt));
      } else {
        this.vx = approach(this.vx, target, mulFloat(mulFloat(this.cfg.movement.runAccel, mult), dt));
      }
    }

    this.updateVertical(dt, input);

    if (this.hasJumpPress()) {
      if (this.jumpGraceTimer > 0) {
        this.jump();
        return "normal";
      }

      if (this.canUnDuck()) {
        if (this.wallJumpCheck(1)) {
          if (this.facing === 1 && input.grab && this.stamina > 0) {
            this.climbJump();
            return "normal";
          }

          if (this.isUpDashAttackActive()) {
            this.superWallJump(-1);
          } else {
            this.wallJump(-1);
          }
          return "normal";
        }

        if (this.wallJumpCheck(-1)) {
          if (this.facing === -1 && input.grab && this.stamina > 0) {
            this.climbJump();
            return "normal";
          }

          if (this.isUpDashAttackActive()) {
            this.superWallJump(1);
          } else {
            this.wallJump(1);
          }
          return "normal";
        }
      }
    }

    return "normal";
  }

  private updateVertical(dt: number, input: InputState): void {
    if (input.y === 1 && this.vy >= this.cfg.gravity.maxFall) {
      this.maxFall = approach(this.maxFall, this.cfg.gravity.fastMaxFall, mulFloat(this.cfg.gravity.fastMaxAccel, dt));
    } else {
      this.maxFall = approach(this.maxFall, this.cfg.gravity.maxFall, mulFloat(this.cfg.gravity.fastMaxAccel, dt));
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
          const t = this.cfg.gravity.wallSlideTime > 0
            ? clamp01Float(this.wallSlideTimer / this.cfg.gravity.wallSlideTime)
            : 0;
          max = lerp(this.cfg.gravity.maxFall, this.cfg.gravity.wallSlideStartMax, t);
          if (t > 0.65) {
            this.wallDustDir = this.wallSlideDir;
          }
        }
      }

      const halfGravity =
        Math.abs(this.vy) < this.cfg.gravity.halfGravThreshold && (input.jump || this.autoJump);
      const gravityMult = halfGravity ? 0.5 : 1;
      this.vy = approach(this.vy, max, mulFloat(mulFloat(this.cfg.gravity.normal, gravityMult), dt));
    }

    this.updateVariableJump(input);
  }

  private climbBegin(): void {
    this.autoJump = false;
    this.vx = 0;
    this.clearHorizontalRemainder();
    this.vy = mulFloat(this.vy, this.cfg.climb.climbGrabYMult);
    this.wallSlideTimer = toFloat(this.cfg.gravity.wallSlideTime);
    this.climbNoMoveTimer = toFloat(this.cfg.climb.noMoveTime);
    this.wallBoostTimer = 0;
    this.lastClimbMove = 0;

    for (let i = 0; i < this.cfg.climb.checkDist; i++) {
      if (!this.bodyCollidesAt(this.x + this.facing, this.y)) {
        this.x += this.facing;
      } else {
        break;
      }
    }
  }

  private climbEnd(): void {
    this.wallSpeedRetentionTimer = 0;
  }

  private climbUpdate(): PlayerState {
    const dt = this.frameDt;
    const input = this.input;
    this.climbNoMoveTimer = subFloat(this.climbNoMoveTimer, dt);

    if (this.wallDir !== 0) {
      this.facing = this.wallDir as 1 | -1;
    }

    if (this.onGround) {
      this.stamina = toFloat(this.cfg.climb.max);
    }

    if (this.hasJumpPress() && (!this.ducking || this.canUnDuck())) {
      if (this.moveXInput === -this.facing) {
        this.wallJump(-this.facing);
      } else {
        this.climbJump();
      }
      return "normal";
    }

    if (this.canDash()) {
      this.applyLiftBoost();
      return this.startDash();
    }

    if (!input.grab) {
      this.applyLiftBoost();
      return "normal";
    }

    if (
      !this.bodyCollidesAt(this.x + this.facing, this.y)
    ) {
      if (this.vy < 0) {
        this.climbHop();
      }
      return "normal";
    }

    let target = 0;
    let trySlip = false;

    if (this.climbNoMoveTimer <= 0) {
      if (input.y === -1) {
        target = this.cfg.climb.climbUpSpeed;

        const blockedAbove =
          this.bodyCollidesAt(this.x, this.y - 1) ||
          (this.climbHopBlockedCheck() && this.slipCheck(-1));

        if (blockedAbove) {
          if (this.vy < 0) {
            this.vy = 0;
          }
          target = 0;
          trySlip = true;
        } else if (this.slipCheck()) {
          this.climbHop();
          return "normal";
        }
      } else if (input.y === 1) {
        target = this.cfg.climb.climbDownSpeed;

        if (this.onGround) {
          if (this.vy > 0) {
            this.vy = 0;
          }
          target = 0;
        } else {
          this.wallDustDir = this.facing;
        }
      } else {
        trySlip = true;
      }
    } else {
      trySlip = true;
    }

    this.lastClimbMove = sign(target);

    if (trySlip && this.slipCheck()) {
      target = this.cfg.climb.climbSlipSpeed;
    }

    this.vy = approach(this.vy, target, mulFloat(this.cfg.climb.climbAccel, dt));

    if (
      input.y !== 1 &&
      this.vy > 0 &&
      !this.bodyCollidesAt(this.x + this.facing, this.y + 1)
    ) {
      this.vy = 0;
    }

    if (this.climbNoMoveTimer <= 0) {
      if (this.lastClimbMove < 0) {
        this.consumeStamina(mulFloat(this.cfg.climb.upCost, dt));
      } else if (this.lastClimbMove === 0) {
        this.consumeStamina(mulFloat(this.cfg.climb.stillCost, dt));
      }
    }

    if (this.stamina <= 0) {
      this.applyLiftBoost();
      return "normal";
    }

    this.vx = 0;
    this.clearHorizontalRemainder();
    return "climb";
  }

  private dashBegin(): void {
    this.dashStartedOnGround = this.onGround;
    this.dashCooldownTimer = toFloat(this.cfg.dash.cooldown);
    this.dashRefillCooldownTimer = toFloat(this.cfg.dash.refillCooldown);
    this.wallSlideTimer = toFloat(this.cfg.gravity.wallSlideTime);
    this.dashAttackTimer = toFloat(this.cfg.dash.attackTime);
    this.dashTrailTimer = 0;

    this.beforeDashVx = this.vx;
    this.hopWaitX = 0;
    this.hopWaitXSpeed = 0;
    this.vx = 0;
    this.vy = 0;
    this.dashDir = { x: 0, y: 0 };

    if (this.crouchDashActive) {
      this.setDucking(true);
    } else if (!this.onGround && this.ducking && this.canUnDuck()) {
      this.setDucking(false);
    }

    this.emit({ type: "dash_begin", dashColor: this.resolveDashTrailColor() });
    this.requestFreeze(this.cfg.dash.freezeTime);
  }

  private dashEnd(): void {
  }

  private dashUpdate(): PlayerState {
    if (this.dashTrailTimer > 0) {
      this.dashTrailTimer = stepTimer(this.dashTrailTimer, this.frameDt);
      if (this.dashTrailTimer <= 0) {
        this.emitDashTrail();
      }
    }

    if (this.dashDir.y === 0) {
      this.applyDashJumpThruNudge();

      if (this.hasJumpPress() && this.canUnDuck() && this.jumpGraceTimer > 0) {
        this.superJump();
        return "normal";
      }
    }

    if (this.dashDir.x === 0 && this.dashDir.y < -0.9) {
      if (this.hasJumpPress() && this.canUnDuck()) {
        if (this.wallJumpCheck(1)) {
          this.superWallJump(-1);
          return "normal";
        }
        if (this.wallJumpCheck(-1)) {
          this.superWallJump(1);
          return "normal";
        }
      }
    } else if (this.hasJumpPress() && this.canUnDuck()) {
      if (this.wallJumpCheck(1)) {
        this.wallJump(-1);
        return "normal";
      }
      if (this.wallJumpCheck(-1)) {
        this.wallJump(1);
        return "normal";
      }
    }

    return "dash";
  }

  private tryStartGrab(input: InputState): boolean {
    if (!input.grab || this.isTired() || this.ducking) return false;

    if (this.vy < 0) return false;
    if (sign(this.vx) === -this.facing) return false;

    if (this.climbCheck(this.facing)) {
      this.setDucking(false);
      return true;
    }

    if (input.y < 1) {
      for (let i = 1; i <= this.cfg.climb.upCheckDist; i++) {
        if (this.bodyCollidesAt(this.x, this.y - i)) {
          continue;
        }

        if (this.climbCheck(this.facing, -i)) {
          this.y -= i;
          this.setDucking(false);
          return true;
        }
      }
    }

    return false;
  }

  private jump(emitEffect = true): void {
    this.consumeJumpPress();
    this.jumpGraceTimer = 0;
    this.varJumpTimer = toFloat(this.cfg.jump.varTime);
    this.autoJump = false;
    this.dashAttackTimer = 0;
    this.wallSlideTimer = toFloat(this.cfg.gravity.wallSlideTime);
    this.wallBoostTimer = 0;

    this.vx = addFloat(this.vx, mulFloat(this.cfg.jump.hBoost, this.moveXInput));
    this.vy = toFloat(this.cfg.jump.speed);
    this.applyLiftBoost();
    this.varJumpSpeed = this.vy;

    if (emitEffect) {
      this.emit({ type: "jump", dirX: sign(this.vx) || this.facing, dirY: -1 });
    }
  }

  private wallJump(dir: number): void {
    this.consumeJumpPress();
    this.setDucking(false);
    this.jumpGraceTimer = 0;
    this.varJumpTimer = toFloat(this.cfg.jump.varTime);
    this.autoJump = false;
    this.dashAttackTimer = 0;
    this.wallSlideTimer = toFloat(this.cfg.gravity.wallSlideTime);
    this.wallBoostTimer = 0;

    if (this.moveXInput !== 0) {
      this.forceMoveX = dir;
      this.forceMoveXTimer = toFloat(this.cfg.jump.wallJumpForceTime);
    }

    this.vx = toFloat(this.cfg.jump.wallJumpHSpeed * dir);
    this.vy = toFloat(this.cfg.jump.speed);
    this.applyLiftBoost();
    this.varJumpSpeed = this.vy;

    this.emit({ type: "wall_jump", wallDir: -dir, dirX: dir, dirY: -1 });
  }

  private superWallJump(dir: number): void {
    this.consumeJumpPress();
    this.setDucking(false);
    this.jumpGraceTimer = 0;
    this.varJumpTimer = toFloat(this.cfg.jump.superWallJumpVarTime);
    this.autoJump = false;
    this.dashAttackTimer = 0;
    this.wallSlideTimer = toFloat(this.cfg.gravity.wallSlideTime);
    this.wallBoostTimer = 0;

    this.vx = toFloat(this.cfg.jump.superWallJumpH * dir);
    this.vy = toFloat(this.cfg.jump.superWallJumpSpeed);
    this.applyLiftBoost();
    this.varJumpSpeed = this.vy;

    this.emit({ type: "wall_jump", wallDir: -dir, dirX: dir, dirY: -1 });
  }

  private climbJump(): void {
    if (!this.onGround) {
      this.consumeStamina(this.cfg.climb.jumpCost);
      this.sweatJumpTimer = SWEAT_JUMP_HOLD_TIME;
    }

    this.jump(false);

    if (this.moveXInput === 0) {
      this.wallBoostDir = -this.facing;
      this.wallBoostTimer = toFloat(this.cfg.climb.climbJumpBoostTime);
    }

    this.emit({
      type: "wall_jump",
      wallDir: this.facing,
      dirX: sign(this.vx) || this.facing,
      dirY: -1,
    });
  }

  private superJump(): void {
    this.consumeJumpPress();
    this.jumpGraceTimer = 0;
    this.varJumpTimer = toFloat(this.cfg.jump.varTime);
    this.autoJump = false;
    this.dashAttackTimer = 0;
    this.wallSlideTimer = toFloat(this.cfg.gravity.wallSlideTime);
    this.wallBoostTimer = 0;

    const wasDucking = this.ducking;
    const wasFacing = this.facing;
    const reverse = this.dashDir.x !== 0 && sign(this.dashDir.x) !== wasFacing;

    this.vx = toFloat(this.cfg.jump.superJumpH * this.facing);
    this.vy = toFloat(this.cfg.jump.speed);
    this.applyLiftBoost();

    if (wasDucking) {
      this.setDucking(false);
      this.vx = mulFloat(this.vx, this.cfg.jump.duckSuperJumpXMult);
      this.vy = mulFloat(this.vy, this.cfg.jump.duckSuperJumpYMult);
    }

    this.varJumpSpeed = this.vy;

    const type = wasDucking
      ? (this.dashStartedOnGround ? "hyper" : "wavedash")
      : "super";

    const extended = this.dashesLeft >= this.maxAirDashes();

    this.emit({
      type,
      dirX: sign(this.vx) || this.facing,
      dirY: -1,
      extended,
      reverse,
    });
  }

  private canDash(): boolean {
    return this.hasDashPress() && this.dashCooldownTimer <= 0 && this.dashesLeft > 0;
  }

  private startDash(): PlayerState {
    this.crouchDashActive = this.dashPressCrouches || this.input.y === 1;
    this.consumeDashPress();
    this.wasDashB = this.dashesLeft === 2;
    this.dashesLeft = Math.max(0, this.dashesLeft - 1);
    if (this.assistOptions.airDashes === "infinite") {
      this.hairFlashTimer = HAIR_FLASH_DURATION;
    }
    return "dash";
  }

  private beginDashMotion(): void {
    const dir = this.lastAim;

    const baseVx = mulFloat(dir.x, this.cfg.dash.speed);
    let newVx = baseVx;
    const newVy = mulFloat(dir.y, this.cfg.dash.speed);

    if (
      baseVx !== 0 &&
      sign(this.beforeDashVx) === sign(baseVx) &&
      Math.abs(this.beforeDashVx) > Math.abs(baseVx)
    ) {
      newVx = this.beforeDashVx;
    }

    this.vx = newVx;
    this.vy = newVy;

    this.dashDir = { x: dir.x, y: dir.y };
    if (this.dashDir.x !== 0) {
      this.facing = sign(this.dashDir.x) as 1 | -1;
    }

    if (this.onGround && this.isDownDiagonalDash() && this.vy > 0) {
      this.applyDashSlide(false);
    }

    this.emit({
      type: "dash_start",
      dirX: this.dashDir.x,
      dirY: this.dashDir.y,
      dashColor: this.resolveDashTrailColor(),
    });
    this.emitDashTrail();
    this.dashTrailTimer = DASH_TRAIL_INTERVAL;
  }

  private finishDash(): void {
    this.emitDashTrail();
    this.autoJump = true;
    this.autoJumpTimer = 0;

    if (this.dashDir.y <= 0) {
      this.vx = mulFloat(this.dashDir.x, this.cfg.dash.endSpeed);
      this.vy = mulFloat(this.dashDir.y, this.cfg.dash.endSpeed);
    }

    if (this.vy < 0) {
      this.vy = mulFloat(this.vy, this.cfg.dash.endDashUpMult);
    }

    if (this.crouchDashActive) {
      if (this.canUnDuck()) {
        this.setDucking(false);
      }
      this.crouchDashActive = false;
    }
  }

  private applyJumpThruAssist(dt: number): void {
    if (this.onGround || this.vy > 0) return;
    if (this.stateMachine.state === "climb" && this.lastClimbMove !== -1) return;
    const body = this.getHitboxBounds();
    if (!this.world.overlapsJumpThrough(body.x, body.y, body.w, body.h)) return;

    this.moveV(mulFloat(this.cfg.jump.jumpThruAssistSpeed, dt));
  }

  private applyDashFloorSnap(): void {
    if (this.onGround) return;
    if (this.dashAttackTimer <= 0) return;
    if (Math.abs(this.dashDir.y) > EPSILON) return;

    const h = this.getHitboxH();
    const dist = this.cfg.dash.floorSnapDist;
    if (dist <= 0) return;
    const nextBounds = this.bodyBoundsFor(this.requireBodyHitbox(), this.x, this.y + dist);
    const body = this.getHitboxBounds();

    const wouldHitSolid = this.world.collideSolidAt(
      nextBounds.x,
      nextBounds.y,
      nextBounds.w,
      nextBounds.h,
    );
    const wouldHitJumpThru = this.world.wouldLandOnJumpThruAt(
      body.x,
      body.y,
      body.w,
      h,
      dist,
    );
    if (!wouldHitSolid && !wouldHitJumpThru) return;

    this.y += dist;
    this.clearVerticalRemainder();
  }

  private applyDashJumpThruNudge(): void {
    if (this.dashDir.y !== 0) return;
    const body = this.getHitboxBounds();

    const nudgeY = this.world.findJumpThruNudgeY(
      body.x,
      body.y,
      body.w,
      body.h,
      this.cfg.dash.hJumpThruNudge,
    );
    if (nudgeY === null) return;

    this.y = nudgeY;
    this.clearVerticalRemainder();
  }

  private tryDashHorizontalCollision(sign: number): DashHorizontalCollisionResult {
    if (this.stateMachine.state !== "dash") return "none";

    if (this.onGround && this.duckFreeAt(this.x + sign)) {
      this.setDucking(true);
      return "ducked";
    }

    if (Math.abs(this.vy) <= EPSILON && Math.abs(this.vx) > EPSILON) {
      for (let i = 1; i <= this.cfg.movement.dashCornerCorrection; i++) {
        for (const j of [1, -1]) {
          const yOffset = i * j;
          if (!this.bodyCollidesAt(this.x + sign, this.y + yOffset)) {
            this.y += yOffset;
            this.x += sign;
            return "corrected";
          }
        }
      }
    }

    return "none";
  }

  private tryDashDownwardCornerCorrection(): boolean {
    if (this.stateMachine.state !== "dash" || this.dashStartedOnGround || this.vy <= 0) {
      return false;
    }

    if (this.vx <= 0) {
      for (let i = -1; i >= -this.cfg.movement.dashCornerCorrection; i--) {
        if (!this.onGroundAt(this.x + i, this.y)) {
          this.x += i;
          this.y += 1;
          return true;
        }
      }
    }

    if (this.vx >= 0) {
      for (let i = 1; i <= this.cfg.movement.dashCornerCorrection; i++) {
        if (!this.onGroundAt(this.x + i, this.y)) {
          this.x += i;
          this.y += 1;
          return true;
        }
      }
    }

    return false;
  }

  private tryUpCornerCorrectionY(): boolean {
    if (this.vx <= 0) {
      for (let i = 1; i <= this.cfg.movement.upwardCornerCorrection; i++) {
        if (!this.bodyCollidesAt(this.x - i, this.y - 1)) {
          this.x -= i;
          this.y -= 1;
          return true;
        }
      }
    }

    if (this.vx >= 0) {
      for (let i = 1; i <= this.cfg.movement.upwardCornerCorrection; i++) {
        if (!this.bodyCollidesAt(this.x + i, this.y - 1)) {
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
      this.vy = minFloat(this.vy, this.varJumpSpeed);
    } else {
      this.varJumpTimer = 0;
    }
  }

  private applyDashSlide(emitUltra: boolean): boolean {
    if (!this.isDownDiagonalDash() || this.vy <= 0) {
      return false;
    }

    const dirX = this.dashDir.x === 0 ? this.facing : sign(this.dashDir.x);

    this.dashDir = { x: dirX, y: 0 };
    this.vy = 0;
    this.vx = mulFloat(this.vx, this.cfg.dash.dodgeSlideSpeedMult);
    this.setDucking(true);

    if (emitUltra) {
      this.emit({ type: "ultra", dirX, dirY: 0 });
    }

    return true;
  }

  private updateWallSpeedRetention(dt: number): void {
    if (this.wallSpeedRetentionTimer <= 0) return;

    if (sign(this.vx) === -sign(this.wallSpeedRetained)) {
      this.wallSpeedRetentionTimer = 0;
      return;
    }

    const dir = sign(this.wallSpeedRetained);
    if (
      dir !== 0 &&
      !this.bodyCollidesAt(this.x + dir, this.y)
    ) {
      this.vx = this.wallSpeedRetained;
      this.wallSpeedRetentionTimer = 0;
      return;
    }

    this.wallSpeedRetentionTimer = stepTimer(this.wallSpeedRetentionTimer, dt);
  }

  private updateHopWait(): void {
    if (this.hopWaitX === 0) return;

    if (sign(this.vx) === -this.hopWaitX || this.vy > 0) {
      this.hopWaitX = 0;
      return;
    }

    if (!this.climbCheck(this.hopWaitX)) {
      this.vx = this.hopWaitXSpeed;
      this.hopWaitX = 0;
    }
  }

  private consumeStamina(amount: number): void {
    if (this.assistOptions.infiniteStamina) {
      this.stamina = toFloat(this.cfg.climb.max);
      return;
    }

    this.stamina = maxFloat(0, subFloat(this.stamina, amount));
  }

  private maxAirDashes(): number {
    switch (this.assistOptions.airDashes) {
      case "two":
        return 2;
      case "infinite":
        return Math.max(2, this.cfg.dash.maxDashes);
      default:
        return this.cfg.dash.maxDashes;
    }
  }

  private refillDash(): boolean {
    const maxDashes = this.maxAirDashes();
    if (this.dashesLeft >= maxDashes) {
      return false;
    }

    this.dashesLeft = maxDashes;
    return true;
  }

  private applyLiftBoost(): void {
    const boost = this.liftBoost();
    this.vx = addFloat(this.vx, boost.x);
    this.vy = addFloat(this.vy, boost.y);
    this.liftTimer = 0;
  }

  private liftBoost(): { x: number; y: number } {
    if (this.liftTimer <= 0) {
      return { x: 0, y: 0 };
    }

    const x = clampFloat(this.liftVx, -this.cfg.lift.maxBoostX, this.cfg.lift.maxBoostX);
    let y = this.liftVy;

    if (y > 0) {
      y = 0;
    } else if (y < -this.cfg.lift.maxBoostY) {
      y = -this.cfg.lift.maxBoostY;
    }

    return { x, y: toFloat(y) };
  }

  private tryEnterDuck(): boolean {
    if (this.ducking || !this.onGround) return false;
    this.setDucking(true);
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
    if (!value) {
      this.crouchDashActive = false;
    }

    const footY = this.getHitboxBottom();
    const nextHitbox = value ? this.duckHitbox : this.normalHitbox;
    const nextHurtbox = value ? this.duckHurtbox : this.normalHurtbox;

    this.collider = nextHitbox;
    this.hurtbox = nextHurtbox;
    this.y = this.entityYForFoot(nextHitbox, footY);
  }

  private canUnDuck(): boolean {
    if (!this.ducking) return true;

    return !this.bodyCollidesAtFoot(this.normalHitbox, this.x, this.getHitboxBottom());
  }

  private canUnDuckAt(x: number): boolean {
    if (!this.ducking) return true;

    return !this.bodyCollidesAtFoot(this.normalHitbox, x, this.getHitboxBottom());
  }

  private duckFreeAt(x: number): boolean {
    return !this.bodyCollidesAtFoot(this.duckHitbox, x, this.getHitboxBottom());
  }

  private tryDuckCorrection(dt: number): void {
    for (let i = this.cfg.movement.duckCorrectCheck; i > 0; i--) {
      if (this.canUnDuckAt(this.x + i)) {
        this.moveH(mulFloat(this.cfg.movement.duckCorrectSlide, dt));
        break;
      }

      if (this.canUnDuckAt(this.x - i)) {
        this.moveH(mulFloat(-this.cfg.movement.duckCorrectSlide, dt));
        break;
      }
    }
  }

  private wallJumpCheck(dir: number): boolean {
    return this.climbBoundsCheck(dir) &&
      this.bodyCollidesAt(this.x + dir * this.cfg.jump.wallJumpCheckDist, this.y);
  }

  private climbBoundsCheck(dir: number): boolean {
    const bounds = this.getHitboxBounds();
    const left = bounds.x + dir * this.cfg.climb.checkDist;
    const right = bounds.x + bounds.w - 1 + dir * this.cfg.climb.checkDist;
    const worldRight = this.world.cols * WORLD.tile;
    return left >= 0 && right < worldRight;
  }

  private climbCheck(dir: number, yAdd = 0): boolean {
    return this.climbBoundsCheck(dir) &&
      this.bodyCollidesAt(this.x + dir * this.cfg.climb.checkDist, this.y + yAdd);
  }

  private climbHop(): void {
    if (this.climbCheck(this.facing)) {
      this.hopWaitX = this.facing;
      this.hopWaitXSpeed = toFloat(this.facing * this.cfg.climb.climbHopX);
    } else {
      this.hopWaitX = 0;
      this.vx = toFloat(this.facing * this.cfg.climb.climbHopX);
    }
    this.vy = minFloat(this.vy, this.cfg.climb.climbHopY);
    this.forceMoveX = 0;
    this.forceMoveXTimer = toFloat(this.cfg.climb.climbHopForceTime);
  }

  private climbHopBlockedBySpike(): boolean {
    const targetX = this.x + this.facing * this.getHitboxBounds().w;
    let targetY = this.y;

    // Celeste spikes contribute a ledge blocker, so probe the ledge-top landing slot.
    for (let i = 0; i < WORLD.tile; i++) {
      if (!this.bodyCollidesAt(targetX, targetY)) {
        break;
      }
      targetY--;
    }

    const hurtbox = this.bodyBoundsFor(this.hurtbox, targetX, targetY);
    return this.world.collidesWithSpikeAt(hurtbox.x, hurtbox.y, hurtbox.w, hurtbox.h, 0, 0);
  }

  private slipCheck(addY = 0): boolean {
    const bounds = this.getHitboxBounds();
    const x = this.facing === 1 ? bounds.x + bounds.w : bounds.x - 1;
    const firstY = bounds.y + 4 + addY;
    const secondY = bounds.y + addY * 2;

    return !this.solidAtPoint(x, firstY) && !this.solidAtPoint(x, secondY);
  }

  private climbHopBlockedCheck(): boolean {
    if (this.climbHopBlockedBySpike()) {
      return true;
    }

    return this.bodyCollidesAt(this.x, this.y - 6);
  }

  private solidAtPoint(px: number, py: number): boolean {
    return this.world.collideSolidAt(px, py, 1, 1);
  }

  private isFacingWallSolid(): boolean {
    return this.bodyCollidesAt(this.x + this.facing, this.y);
  }

  private onGroundAt(x: number, y: number): boolean {
    const bounds = this.bodyBoundsFor(this.requireBodyHitbox(), x, y);
    return this.world.probeGround(bounds.x, bounds.y, bounds.w, bounds.h).onGround;
  }

  private isDownDiagonalDash(): boolean {
    return Math.abs(this.dashDir.x) > EPSILON && this.dashDir.y > EPSILON;
  }

  private isUpDashAttackActive(): boolean {
    return this.dashAttackTimer > 0 && Math.abs(this.dashDir.x) <= EPSILON && this.dashDir.y < -0.9;
  }

  private checkStamina(): number {
    if (this.assistOptions.infiniteStamina) {
      return this.cfg.climb.max;
    }

    return this.wallBoostTimer > 0
      ? addFloat(this.stamina, this.cfg.climb.jumpCost)
      : this.stamina;
  }

  private isTired(): boolean {
    return this.checkStamina() < this.cfg.climb.tiredThreshold;
  }

  private resolveSweatState(): PlayerSweatState {
    if (this.sweatJumpTimer > 0) {
      return "jump";
    }

    if (this.stateMachine.state !== "climb") {
      return "idle";
    }

    const isDanger = this.stamina <= this.cfg.climb.tiredThreshold;

    if (this.climbNoMoveTimer <= 0) {
      if (this.lastClimbMove < 0) {
        return isDanger ? "danger" : "climb";
      }

      if (!this.onGround) {
        return isDanger ? "danger" : "still";
      }
    }

    return isDanger ? "danger" : "idle";
  }

  private hasJumpPress(): boolean {
    return this.jumpPressBufferTimer > 0;
  }

  private consumeJumpPress(): void {
    this.jumpPressBufferTimer = 0;
  }

  private hasDashPress(): boolean {
    return this.dashPressBufferTimer > 0;
  }

  private consumeDashPress(): void {
    this.dashPressBufferTimer = 0;
    this.dashPressCrouches = false;
  }

  private requireBodyHitbox(): Hitbox {
    const collider = this.collider;
    if (collider === null || !(collider instanceof Hitbox)) {
      throw new Error("Player requires a hitbox collider");
    }

    return collider;
  }

  private bodyBoundsFor(hitbox: Hitbox, entityX: number, entityY: number): { x: number; y: number; w: number; h: number } {
    return {
      x: entityX + hitbox.left,
      y: entityY + hitbox.top,
      w: hitbox.width,
      h: hitbox.height,
    };
  }

  private bodyCollidesAt(entityX: number, entityY: number, hitbox: Hitbox = this.requireBodyHitbox()): boolean {
    const bounds = this.bodyBoundsFor(hitbox, entityX, entityY);
    return this.world.collideSolidAt(bounds.x, bounds.y, bounds.w, bounds.h);
  }

  private bodyCollidesAtFoot(hitbox: Hitbox, entityX: number, footY: number): boolean {
    const bounds = this.bodyBoundsFor(hitbox, entityX, this.entityYForFoot(hitbox, footY));
    return this.world.collideSolidAt(bounds.x, bounds.y, bounds.w, bounds.h);
  }

  private getHitboxBottom(): number {
    const bounds = this.getHitboxBounds();
    return bounds.y + bounds.h;
  }

  private entityYForFoot(hitbox: Hitbox, footY: number): number {
    return footY - hitbox.bottom;
  }

  private getHitboxH(): number {
    return this.requireBodyHitbox().height;
  }

  private getHurtboxH(): number {
    return this.hurtbox.height;
  }

  private resetHairState(): void {
    this.hairColor = this.resolveHairBaseColor();
    this.hairFlashTimer = 0;
    this.lastHairDashes = this.dashesLeft;
  }

  private updateHairState(dt: number): void {
    if (this.assistOptions.airDashes === "infinite") {
      this.hairColor = this.hairFlashTimer > 0 ? COLORS.playerHairFlash : COLORS.playerTwoDash;
      this.hairFlashTimer = maxFloat(0, subFloat(this.hairFlashTimer, dt));
      this.lastHairDashes = this.dashesLeft;
      return;
    }

    if (this.dashesLeft === 0 && this.dashesLeft < this.cfg.dash.maxDashes) {
      this.hairColor = this.lerpColor(this.hairColor, COLORS.playerNoDash, USED_HAIR_LERP_RATE * dt);
      this.hairFlashTimer = 0;
    } else if (this.lastHairDashes !== this.dashesLeft) {
      this.hairColor = COLORS.playerHairFlash;
      this.hairFlashTimer = HAIR_FLASH_DURATION;
    } else if (this.hairFlashTimer > 0) {
      this.hairColor = COLORS.playerHairFlash;
      this.hairFlashTimer = maxFloat(0, subFloat(this.hairFlashTimer, dt));
    } else {
      this.hairColor = this.resolveHairBaseColor();
    }

    this.lastHairDashes = this.dashesLeft;
  }

  private resolveHairBaseColor(): number {
    if (this.assistOptions.airDashes === "infinite") {
      return COLORS.playerTwoDash;
    }

    return this.dashesLeft === 2 ? COLORS.playerTwoDash : COLORS.playerOneDash;
  }

  private resolveDashTrailColor(): number {
    return this.wasDashB ? COLORS.playerOneDash : COLORS.playerNoDash;
  }

  private emitDashTrail(): void {
    const drawH = this.ducking
      ? (PLAYER_GEOMETRY.drawH * PLAYER_GEOMETRY.crouchHitboxH) / PLAYER_GEOMETRY.hitboxH
      : PLAYER_GEOMETRY.drawH;

    this.emit({
      type: "dash_trail",
      dashColor: this.resolveDashTrailColor(),
      trailX: this.x,
      trailY: this.y,
      trailDrawW: PLAYER_GEOMETRY.drawW,
      trailDrawH: drawH,
      trailCrouched: this.ducking,
    });
  }

  private lerpColor(from: number, to: number, t: number): number {
    const clamped = clampFloat(t, 0, 1);
    const fromR = (from >> 16) & 0xff;
    const fromG = (from >> 8) & 0xff;
    const fromB = from & 0xff;
    const toR = (to >> 16) & 0xff;
    const toG = (to >> 8) & 0xff;
    const toB = to & 0xff;
    const r = Math.round(fromR + (toR - fromR) * clamped);
    const g = Math.round(fromG + (toG - fromG) * clamped);
    const b = Math.round(fromB + (toB - fromB) * clamped);
    return (r << 16) | (g << 8) | b;
  }

  private emit(effect: PlayerEffect): void {
    this.effects.push(effect);
  }

  consumeFreezeRequest(): number {
    const value = this.freezeRequestTimer;
    this.freezeRequestTimer = 0;
    return value;
  }

  private requestFreeze(duration: number): void {
    this.freezeRequestTimer = maxFloat(this.freezeRequestTimer, duration);
  }

  protected onCollideH(step: number): MoveCollisionResult {
    const dashCollision = this.tryDashHorizontalCollision(step);
    if (dashCollision === "corrected") {
      return "moved";
    }
    if (dashCollision === "ducked") {
      return "break";
    }

    return "none";
  }

  protected onCollideV(step: number): MoveCollisionResult {
    if (step < 0 && this.tryUpCornerCorrectionY()) {
      return "moved";
    }

    if (step > 0 && this.tryDashDownwardCornerCorrection()) {
      return "moved";
    }

    return "none";
  }

  protected afterBlockedH(_step: number): void {
    if (this.wallSpeedRetentionTimer <= 0) {
      this.wallSpeedRetained = this.vx;
      this.wallSpeedRetentionTimer = toFloat(this.cfg.movement.wallSpeedRetentionTime);
    }

    this.vx = 0;
    this.clearHorizontalRemainder();
    this.dashAttackTimer = 0;
  }

  protected afterBlockedV(step: number): void {
    if (step > 0 && this.isDownDiagonalDash() && this.vy > 0) {
      this.applyDashSlide(!this.dashStartedOnGround);
    }

    if (step > 0 && this.vy > 0 && this.stateMachine.state !== "climb") {
      const impact = clamp01Float(this.vy / this.cfg.gravity.fastMaxFall);
      this.emit({ type: "land", impact });
    }

    if (step < 0 && this.varJumpTimer < this.cfg.jump.varTime - this.cfg.jump.ceilingVarJumpGrace) {
      this.varJumpTimer = 0;
    }

    this.vy = 0;
    this.clearVerticalRemainder();
    this.dashAttackTimer = 0;
  }

  private *dashCoroutine(): Generator<number | null, void, unknown> {
    yield null;

    this.beginDashMotion();
    yield toFloat(this.cfg.dash.duration);

    this.finishDash();
    this.stateMachine.state = "normal";
  }
}
