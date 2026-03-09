export type PlayerState = "normal" | "duck" | "grab" | "dash" | "dashAttack";

export interface InputState {
  x: number;
  y: number;
  jump: boolean;
  jumpPressed: boolean;
  jumpReleased: boolean;
  dashPressed: boolean;
  grab: boolean;
}

export type PlayerEffectType =
  | "dash_begin"
  | "super"
  | "hyper"
  | "wavedash"
  | "ultra"
  | "jump"
  | "wall_jump"
  | "dash_start"
  | "wall_bounce"
  | "land"
  | "fell_out"
  | "respawn";

export interface PlayerEffect {
  type: PlayerEffectType;
  dirX?: number;
  dirY?: number;
  wallDir?: number;
  impact?: number;
  extended?: boolean;
  reverse?: boolean;
}

export interface PlayerSnapshot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  state: PlayerState;
  facing: 1 | -1;
  onGround: boolean;
  wallDir: number;
  wallDustDir: number;
  dashesLeft: number;
  dashCooldownActive: boolean;
  stamina: number;
  drawW: number;
  hitboxH: number;
  hurtboxH: number;
  drawH: number;
  isCrouched: boolean;
  isFastFalling: boolean;
}
