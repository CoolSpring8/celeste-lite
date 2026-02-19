export const WORLD = {
  tile: 16,
  cols: 52,
  rows: 30,
} as const;

export const VIEWPORT = {
  width: WORLD.cols * WORLD.tile,
  height: WORLD.rows * WORLD.tile,
} as const;

export const PLAYER_GEOMETRY = {
  hitboxW: 8,
  hitboxH: 11,
  crouchHitboxH: 6,
  hurtboxH: 9,
  crouchHurtboxH: 4,
  drawW: 10,
  drawH: 16,
} as const;

export interface PlayerConfig {
  input: {
    jumpBufferTime: number;
    dashBufferTime: number;
  };
  movement: {
    walkSpeed: number;
    maxRun: number;
    runAccel: number;
    runReduce: number;
    airMult: number;
    duckFriction: number;
    upwardCornerCorrection: number;
    dashCornerCorrection: number;
    duckCorrectCheck: number;
    duckCorrectSlide: number;
    wallSpeedRetentionTime: number;
  };
  gravity: {
    normal: number;
    halfGravThreshold: number;
    maxFall: number;
    fastMaxFall: number;
    fastMaxAccel: number;
    wallSlideStartMax: number;
    wallSlideTime: number;
  };
  jump: {
    graceTime: number;
    speed: number;
    hBoost: number;
    varTime: number;
    ceilingVarJumpGrace: number;
    jumpThruAssistSpeed: number;
    wallJumpCheckDist: number;
    wallJumpForceTime: number;
    wallJumpHSpeed: number;
    superJumpH: number;
    duckSuperJumpXMult: number;
    duckSuperJumpYMult: number;
    superWallJumpSpeed: number;
    superWallJumpVarTime: number;
    superWallJumpH: number;
  };
  climb: {
    max: number;
    tiredThreshold: number;
    upCost: number;
    stillCost: number;
    jumpCost: number;
    checkDist: number;
    upCheckDist: number;
    noMoveTime: number;
    climbUpSpeed: number;
    climbDownSpeed: number;
    climbSlipSpeed: number;
    climbAccel: number;
    climbGrabYMult: number;
    climbHopY: number;
    climbHopX: number;
    climbHopForceTime: number;
    climbJumpBoostTime: number;
    exhaustedSlipSpeed: number;
  };
  dash: {
    speed: number;
    endSpeed: number;
    endDashUpMult: number;
    duration: number;
    preDelay: number;
    cooldown: number;
    refillCooldown: number;
    hJumpThruNudge: number;
    floorSnapDist: number;
    attackTime: number;
    dodgeSlideSpeedMult: number;
    maxDashes: number;
  };
  lift: {
    momentumStoreTime: number;
    maxBoostX: number;
    maxBoostY: number;
  };
} 

export const PLAYER_CONFIG: PlayerConfig = {
  input: {
    jumpBufferTime: 0.1,
    dashBufferTime: 0.1,
  },
  movement: {
    walkSpeed: 64,
    maxRun: 90,
    runAccel: 1000,
    runReduce: 400,
    airMult: 0.65,
    duckFriction: 500,
    upwardCornerCorrection: 4,
    dashCornerCorrection: 4,
    duckCorrectCheck: 4,
    duckCorrectSlide: 50,
    wallSpeedRetentionTime: 0.06,
  },
  gravity: {
    normal: 900,
    halfGravThreshold: 40,
    maxFall: 160,
    fastMaxFall: 240,
    fastMaxAccel: 300,
    wallSlideStartMax: 20,
    wallSlideTime: 1.2,
  },
  jump: {
    graceTime: 0.1,
    speed: -105,
    hBoost: 40,
    varTime: 0.2,
    ceilingVarJumpGrace: 0.05,
    jumpThruAssistSpeed: -40,
    wallJumpCheckDist: 3,
    wallJumpForceTime: 0.16,
    wallJumpHSpeed: 130,
    superJumpH: 260,
    duckSuperJumpXMult: 1.25,
    duckSuperJumpYMult: 0.5,
    superWallJumpSpeed: -160,
    superWallJumpVarTime: 0.25,
    superWallJumpH: 170,
  },
  climb: {
    max: 110,
    tiredThreshold: 20,
    upCost: 100 / 2.2,
    stillCost: 100 / 10,
    jumpCost: 110 / 4,
    checkDist: 2,
    upCheckDist: 2,
    noMoveTime: 0.1,
    climbUpSpeed: -45,
    climbDownSpeed: 80,
    climbSlipSpeed: 30,
    climbAccel: 900,
    climbGrabYMult: 0.2,
    climbHopY: -120,
    climbHopX: 100,
    climbHopForceTime: 0.2,
    climbJumpBoostTime: 0.2,
    exhaustedSlipSpeed: 30,
  },
  dash: {
    speed: 240,
    endSpeed: 160,
    endDashUpMult: 0.75,
    duration: 0.15,
    preDelay: 1 / 60,
    cooldown: 0.2,
    refillCooldown: 0.1,
    hJumpThruNudge: 6,
    floorSnapDist: 3,
    attackTime: 0.3,
    dodgeSlideSpeedMult: 1.2,
    maxDashes: 1,
  },
  lift: {
    momentumStoreTime: 0.12,
    maxBoostX: 250,
    maxBoostY: 130,
  },
};

export const COLORS = {
  playerNoDash: 0x5bc0eb, // cyan
  playerOneDash: 0xb24139, // auburn-ish red
  playerTwoDash: 0xf08ad6, // pink
  playerManyDash: 0x62c462, // green
  playerCooldown: 0xffffff, // white
  tile: 0x3a3a5c,
  tileEdge: 0x5a5a8c,
  background: 0x16213e,
} as const;
