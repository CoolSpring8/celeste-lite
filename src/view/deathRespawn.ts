import { type Aabb } from "../entities/types";

export interface RespawnPoint {
  x: number;
  y: number;
}

export interface RespawnIntroSample {
  offsetX: number;
  offsetY: number;
  ghostAlpha: number;
  ghostScale: number;
  auraAlpha: number;
  auraScale: number;
  coreAlpha: number;
  coreScale: number;
}

export const DEATH_RESPAWN_TIMING = {
  deathPause: 0.34,
  introDuration: 0.6,
} as const;

export const DEATH_RESPAWN_VISUALS = {
  roomClampPad: 40,
  ghostStartAlpha: 0.18,
  ghostEndAlpha: 0.96,
  ghostStartScale: 0.55,
  ghostEndScale: 1.08,
  auraStartAlpha: 0.55,
  auraEndAlpha: 0,
  auraStartScale: 1.85,
  auraEndScale: 0.55,
  coreStartAlpha: 0.95,
  coreEndAlpha: 0,
  coreStartScale: 0.9,
  coreEndScale: 0.25,
} as const;

export function computeRespawnIntroOffset(
  spawn: RespawnPoint,
  death: RespawnPoint,
  room: Aabb,
  pad = DEATH_RESPAWN_VISUALS.roomClampPad,
): RespawnPoint {
  const source = clampRespawnSource(death, room, pad);
  return {
    x: source.x - spawn.x,
    y: source.y - spawn.y,
  };
}

export function sampleRespawnIntro(
  offset: RespawnPoint,
  progress: number,
): RespawnIntroSample {
  const t = clamp01(progress);
  const eased = cubicOut(t);

  return {
    offsetX: lerp(offset.x, 0, eased),
    offsetY: lerp(offset.y, 0, eased),
    ghostAlpha: lerp(
      DEATH_RESPAWN_VISUALS.ghostStartAlpha,
      DEATH_RESPAWN_VISUALS.ghostEndAlpha,
      t,
    ),
    ghostScale: lerp(
      DEATH_RESPAWN_VISUALS.ghostStartScale,
      DEATH_RESPAWN_VISUALS.ghostEndScale,
      eased,
    ),
    auraAlpha: lerp(
      DEATH_RESPAWN_VISUALS.auraStartAlpha,
      DEATH_RESPAWN_VISUALS.auraEndAlpha,
      eased,
    ),
    auraScale: lerp(
      DEATH_RESPAWN_VISUALS.auraStartScale,
      DEATH_RESPAWN_VISUALS.auraEndScale,
      eased,
    ),
    coreAlpha: lerp(
      DEATH_RESPAWN_VISUALS.coreStartAlpha,
      DEATH_RESPAWN_VISUALS.coreEndAlpha,
      eased,
    ),
    coreScale: lerp(
      DEATH_RESPAWN_VISUALS.coreStartScale,
      DEATH_RESPAWN_VISUALS.coreEndScale,
      eased,
    ),
  };
}

function clampRespawnSource(point: RespawnPoint, room: Aabb, pad: number): RespawnPoint {
  const minX = room.x;
  const maxX = room.x + room.w;
  const minY = room.y;
  const maxY = room.y + room.h;

  const paddedMinX = minX + Math.min(pad, Math.max(0, room.w * 0.5 - 1));
  const paddedMaxX = maxX - Math.min(pad, Math.max(0, room.w * 0.5 - 1));
  const paddedMinY = minY + Math.min(pad, Math.max(0, room.h * 0.5 - 1));
  const paddedMaxY = maxY - Math.min(pad, Math.max(0, room.h * 0.5 - 1));

  return {
    x: clampWithCollapsedRange(point.x, paddedMinX, paddedMaxX),
    y: clampWithCollapsedRange(point.y, paddedMinY, paddedMaxY),
  };
}

function clampWithCollapsedRange(value: number, min: number, max: number): number {
  if (min > max) {
    return (min + max) * 0.5;
  }

  return Math.min(Math.max(value, min), max);
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function cubicOut(value: number): number {
  const inv = 1 - value;
  return 1 - inv * inv * inv;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
