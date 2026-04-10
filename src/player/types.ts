export type PlayerState = "normal" | "climb" | "dash";

export interface InputState {
  x: number;
  y: number;
  aimX: number;
  aimY: number;
  jump: boolean;
  jumpPressed: boolean;
  jumpReleased: boolean;
  dash: boolean;
  dashPressed: boolean;
  grab: boolean;
}

export type PlayerEffectType =
  | "bounce"
  | "dash_begin"
  | "dash_trail"
  | "super"
  | "hyper"
  | "wavedash"
  | "ultra"
  | "jump"
  | "wall_jump"
  | "dash_start"
  | "wall_bounce"
  | "land"
  | "respawn";

export interface PlayerEffect {
  type: PlayerEffectType;
  dirX?: number;
  dirY?: number;
  wallDir?: number;
  impact?: number;
  extended?: boolean;
  reverse?: boolean;
  dashColor?: number;
  trailX?: number;
  trailY?: number;
  trailDrawW?: number;
  trailDrawH?: number;
  trailCrouched?: boolean;
}

export interface PlayerSnapshot {
  x: number;
  y: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
  centerX: number;
  centerY: number;
  vx: number;
  vy: number;
  state: PlayerState;
  facing: 1 | -1;
  onGround: boolean;
  wallDir: number;
  wallDustDir: number;
  dashesLeft: number;
  hairColor: number;
  isTired: boolean;
  stamina: number;
  hitboxW: number;
  drawW: number;
  hitboxH: number;
  drawH: number;
  isCrouched: boolean;
  isFastFalling: boolean;
}
