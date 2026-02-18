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
  hitboxH: 14,
  crouchHitboxH: 9,
  drawW: 10,
  drawH: 16,
} as const;

export interface PlayerConfig {
  movement: {
    maxRun: number;
    runAccel: number;
    runDecel: number;
    airAccel: number;
    airDecel: number;
    cornerCorrection: number;
  };
  gravity: {
    normal: number;
    peak: number;
    fastFall: number;
    peakThreshold: number;
    maxFall: number;
  };
  jump: {
    speed: number;
    hBoost: number;
    cutMultiplier: number;
    coyoteTime: number;
    bufferTime: number;
  };
  wall: {
    slideMax: number;
    jumpH: number;
    jumpV: number;
    neutralJumpH: number;
    neutralJumpLockTime: number;
    jumpLockTime: number;
    stickTime: number;
    bounceH: number;
    bounceV: number;
  };
  stamina: {
    max: number;
    holdDrainPerSec: number;
    climbDrainPerSec: number;
    grabHopCost: number;
  };
  grab: {
    climbUpSpeed: number;
    climbDownSpeed: number;
    climbHopSpeedY: number;
    climbHopTime: number;
    exhaustedSlipSpeed: number;
  };
  dash: {
    straightSpeed: number;
    diagonalComponentSpeed: number;
    duration: number;
    refillCooldown: number;
    freezeTime: number;
    attackTime: number;
    carryTime: number;
    postHorizontalSpeed: number;
    postVerticalSpeed: number;
    maxDashes: number;
    superSpeed: number;
  };
  lift: {
    momentumStoreTime: number;
    maxBoostX: number;
    maxBoostY: number;
  };
} 

export const PLAYER_CONFIG: PlayerConfig = {
  movement: {
    maxRun: 160,
    runAccel: 1400,
    runDecel: 1800,
    airAccel: 1100,
    airDecel: 700,
    cornerCorrection: 4,
  },
  gravity: {
    normal: 1200,
    peak: 500,
    fastFall: 2100,
    peakThreshold: 50,
    maxFall: 300,
  },
  jump: {
    speed: -310,
    hBoost: 20,
    cutMultiplier: 0.45,
    coyoteTime: 0.08,
    bufferTime: 0.1,
  },
  wall: {
    slideMax: 60,
    jumpH: 170,
    jumpV: -280,
    neutralJumpH: 115,
    neutralJumpLockTime: 0.03,
    jumpLockTime: 0.13,
    stickTime: 0.06,
    bounceH: 280,
    bounceV: -260,
  },
  stamina: {
    max: 110,
    holdDrainPerSec: 12,
    climbDrainPerSec: 32,
    grabHopCost: 22,
  },
  grab: {
    climbUpSpeed: 52,
    climbDownSpeed: 78,
    climbHopSpeedY: -240,
    climbHopTime: 0.08,
    exhaustedSlipSpeed: 110,
  },
  dash: {
    straightSpeed: 240,
    diagonalComponentSpeed: 170,
    duration: 15 / 60,
    refillCooldown: 10 / 60,
    freezeTime: 0.04,
    attackTime: 0.08,
    carryTime: 0.12,
    postHorizontalSpeed: 160,
    postVerticalSpeed: 120,
    maxDashes: 1,
    superSpeed: 260,
  },
  lift: {
    momentumStoreTime: 0.12,
    maxBoostX: 80,
    maxBoostY: 60,
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
