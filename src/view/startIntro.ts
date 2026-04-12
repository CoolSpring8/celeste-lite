export interface StartIntroSample {
  ghostAlpha: number;
  ghostScaleX: number;
  ghostScaleY: number;
  auraAlpha: number;
  auraScale: number;
  coreAlpha: number;
  coreScale: number;
}

export const START_INTRO_VISUALS = {
  ghostStartAlpha: 0.06,
  ghostEndAlpha: 1,
  ghostStartScaleX: 1.55,
  ghostEndScaleX: 1.03,
  ghostStartScaleY: 0.12,
  ghostEndScaleY: 1.04,
  auraStartAlpha: 0.6,
  auraEndAlpha: 0,
  auraStartScale: 1.7,
  auraEndScale: 0.7,
  coreStartAlpha: 0.95,
  coreEndAlpha: 0,
  coreStartScale: 1,
  coreEndScale: 0.28,
} as const;

export function sampleStartIntro(progress: number): StartIntroSample {
  const t = clamp01(progress);
  const eased = cubicOut(t);

  return {
    ghostAlpha: lerp(START_INTRO_VISUALS.ghostStartAlpha, START_INTRO_VISUALS.ghostEndAlpha, t),
    ghostScaleX: lerp(
      START_INTRO_VISUALS.ghostStartScaleX,
      START_INTRO_VISUALS.ghostEndScaleX,
      eased,
    ),
    ghostScaleY: lerp(
      START_INTRO_VISUALS.ghostStartScaleY,
      START_INTRO_VISUALS.ghostEndScaleY,
      eased,
    ),
    auraAlpha: lerp(START_INTRO_VISUALS.auraStartAlpha, START_INTRO_VISUALS.auraEndAlpha, eased),
    auraScale: lerp(START_INTRO_VISUALS.auraStartScale, START_INTRO_VISUALS.auraEndScale, eased),
    coreAlpha: lerp(START_INTRO_VISUALS.coreStartAlpha, START_INTRO_VISUALS.coreEndAlpha, eased),
    coreScale: lerp(START_INTRO_VISUALS.coreStartScale, START_INTRO_VISUALS.coreEndScale, eased),
  };
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
