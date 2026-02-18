export type PlayerState = "normal" | "duck" | "grab" | "dash" | "dashAttack" | "freeze";

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
  | "super"
  | "hyper"
  | "wavedash"
  | "ultra"
  | "bunnyhop"
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
  dashesLeft: number;
  dashCooldownActive: boolean;
  stamina: number;
  drawW: number;
  hitboxH: number;
  drawH: number;
  isCrouched: boolean;
  isFastFalling: boolean;
}
