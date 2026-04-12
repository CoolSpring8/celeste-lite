export type PlayerIntroType = "none" | "start" | "respawn";

export interface PlayerIntroStateSnapshot {
  type: Exclude<PlayerIntroType, "none">;
  progress: number;
  ease: number;
  offsetX: number;
  offsetY: number;
}

export interface PlayerIntroSpec {
  type: PlayerIntroType;
  sourceX?: number;
  sourceY?: number;
  duration?: number;
}

export type ActivePlayerIntroSpec = PlayerIntroSpec & {
  type: Exclude<PlayerIntroType, "none">;
};

export interface RespawnClampBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export const PLAYER_INTRO_TIMING = {
  startDuration: 0.46,
  respawnDuration: 0.6,
  respawnClampPad: 40,
} as const;

export const PLAYER_RESPAWN_VISUALS = {
  useSourceLerp: false,
} as const;

export function introDuration(type: Exclude<PlayerIntroType, "none">): number {
  switch (type) {
    case "start":
      return PLAYER_INTRO_TIMING.startDuration;
    case "respawn":
      return PLAYER_INTRO_TIMING.respawnDuration;
  }
}

export function isActivePlayerIntroType(
  type: PlayerIntroType,
): type is Exclude<PlayerIntroType, "none"> {
  return type !== "none";
}

export function isActivePlayerIntroSpec(
  spec: PlayerIntroSpec,
): spec is ActivePlayerIntroSpec {
  return isActivePlayerIntroType(spec.type);
}

export function clampRespawnSource(
  x: number,
  y: number,
  bounds: RespawnClampBounds,
): { x: number; y: number } {
  const pad = PLAYER_INTRO_TIMING.respawnClampPad;
  return {
    x: clamp(x, bounds.left + pad, bounds.right - pad),
    y: clamp(y, bounds.top + pad, bounds.bottom - pad),
  };
}

export function samplePlayerIntroState(
  type: Exclude<PlayerIntroType, "none">,
  progress: number,
  currentCenterX: number,
  currentCenterY: number,
  sourceX?: number,
  sourceY?: number,
): PlayerIntroStateSnapshot {
  const t = clamp01(progress);
  const eased = cubicOut(t);

  if (type === "start") {
    return {
      type,
      progress: t,
      ease: 1 - eased,
      offsetX: 0,
      offsetY: 0,
    };
  }

  const fromOffsetX = PLAYER_RESPAWN_VISUALS.useSourceLerp
    ? (sourceX ?? currentCenterX) - currentCenterX
    : 0;
  const fromOffsetY = PLAYER_RESPAWN_VISUALS.useSourceLerp
    ? (sourceY ?? currentCenterY) - currentCenterY
    : 0;
  return {
    type,
    progress: t,
    ease: 1 - eased,
    offsetX: lerp(fromOffsetX, 0, eased),
    offsetY: lerp(fromOffsetY, 0, eased),
  };
}

function clamp(value: number, min: number, max: number): number {
  if (min > max) {
    return (min + max) * 0.5;
  }
  return Math.min(Math.max(value, min), max);
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function cubicOut(value: number): number {
  const inv = 1 - value;
  return 1 - inv * inv * inv;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
