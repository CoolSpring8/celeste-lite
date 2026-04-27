export const INTRO_IRIS_TIMING = {
  initialRevealDuration: 0.36,
  holdDuration: 0.28,
  finalRevealDuration: 0.64,
} as const;

export const INTRO_IRIS_VISUALS = {
  holdRadius: 34,
  scanlineHeight: 1,
  color: 0x000000,
} as const;

export type IntroIrisPhase = "opening" | "hold" | "revealing" | "done";

export interface IntroIrisSample {
  phase: IntroIrisPhase;
  radius: number;
  done: boolean;
}

export function introIrisTotalDuration(): number {
  return INTRO_IRIS_TIMING.initialRevealDuration +
    INTRO_IRIS_TIMING.holdDuration +
    INTRO_IRIS_TIMING.finalRevealDuration;
}

export function sampleIntroIrisRadius(elapsed: number, maxRadius: number): IntroIrisSample {
  const targetRadius = Math.max(INTRO_IRIS_VISUALS.holdRadius, maxRadius);
  const clampedElapsed = Math.max(0, elapsed);
  const initialEnd = INTRO_IRIS_TIMING.initialRevealDuration;
  const holdEnd = initialEnd + INTRO_IRIS_TIMING.holdDuration;
  const total = introIrisTotalDuration();

  if (clampedElapsed >= total) {
    return {
      phase: "done",
      radius: targetRadius,
      done: true,
    };
  }

  if (clampedElapsed < initialEnd) {
    const t = clampedElapsed / INTRO_IRIS_TIMING.initialRevealDuration;
    return {
      phase: "opening",
      radius: INTRO_IRIS_VISUALS.holdRadius * cubicOut(t),
      done: false,
    };
  }

  if (clampedElapsed < holdEnd) {
    return {
      phase: "hold",
      radius: INTRO_IRIS_VISUALS.holdRadius,
      done: false,
    };
  }

  const t = (clampedElapsed - holdEnd) / INTRO_IRIS_TIMING.finalRevealDuration;
  return {
    phase: "revealing",
    radius: lerp(INTRO_IRIS_VISUALS.holdRadius, targetRadius, cubicOut(t)),
    done: false,
  };
}

function cubicOut(value: number): number {
  const inv = 1 - Math.min(Math.max(value, 0), 1);
  return 1 - inv * inv * inv;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
