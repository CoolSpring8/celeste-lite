import type { PlayerIntroStateSnapshot } from "../player/intro";

export interface DeathEffectSample {
  x: number;
  y: number;
  auraAlpha: number;
  coreAlpha: number;
  auraScale: number;
  coreScale: number;
}

export function sampleDeathEffect(
  intro: PlayerIntroStateSnapshot,
  centerX: number,
  centerY: number,
): DeathEffectSample {
  return {
    x: centerX + intro.offsetX,
    y: centerY + intro.offsetY,
    auraAlpha: intro.ease * 0.85,
    coreAlpha: intro.ease * 0.95,
    auraScale: lerp(1.55, 0.62, intro.progress),
    coreScale: lerp(0.95, 0.28, intro.progress),
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
