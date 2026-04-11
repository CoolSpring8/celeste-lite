export type SpawnTransitionKind = "initial" | "normal" | "spike";

export interface SpawnIntroSample {
  ghostAlpha: number;
  ghostScaleX: number;
  ghostScaleY: number;
  auraAlpha: number;
  auraScale: number;
  coreAlpha: number;
  coreScale: number;
}

export const SPAWN_SEQUENCE_TIMING = {
  fastSkipTotalDuration: 0.5,
  spikeRecoilDuration: 0.5,
  burstHoldDuration: 0.25,
  wipeCoverDuration: 0.3,
  wipeRevealDuration: 0.45,
  spawnIntroDuration: 0.46,
} as const;

export const SPAWN_WIPE_VISUALS = {
  edgeOverscan: 24,
  color: 0x000000,
  headWidth: 156,
  headDepth: 26,
  shoulderInset: 42,
  shoulderLift: 5,
  tailDepth: 18,
} as const;

export const SPAWN_INTRO_VISUALS = {
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

export interface SpawnTransitionTimings {
  totalDuration: number;
  explodeAt: number;
  wipeCoverAt: number;
  wipeRevealAt: number;
}

export function baseTransitionDuration(kind: SpawnTransitionKind): number {
  switch (kind) {
    case "initial":
      return SPAWN_SEQUENCE_TIMING.spawnIntroDuration;
    case "normal":
      return postExplosionDuration();
    case "spike":
      return SPAWN_SEQUENCE_TIMING.spikeRecoilDuration + postExplosionDuration();
  }
}

export function retimedTransitionDuration(
  kind: Exclude<SpawnTransitionKind, "initial">,
  elapsed: number,
): number {
  return Math.min(
    baseTransitionDuration(kind),
    elapsed + SPAWN_SEQUENCE_TIMING.fastSkipTotalDuration,
  );
}

export function transitionTimings(
  kind: SpawnTransitionKind,
  totalDuration = baseTransitionDuration(kind),
): SpawnTransitionTimings {
  if (kind === "initial") {
    return {
      totalDuration,
      explodeAt: Number.POSITIVE_INFINITY,
      wipeCoverAt: Number.POSITIVE_INFINITY,
      wipeRevealAt: Number.POSITIVE_INFINITY,
    };
  }

  const scale = totalDuration / baseTransitionDuration(kind);
  const recoil = kind === "spike" ? SPAWN_SEQUENCE_TIMING.spikeRecoilDuration * scale : 0;
  const burstHold = SPAWN_SEQUENCE_TIMING.burstHoldDuration * scale;
  const wipeCover = SPAWN_SEQUENCE_TIMING.wipeCoverDuration * scale;

  return {
    totalDuration,
    explodeAt: recoil,
    wipeCoverAt: recoil + burstHold,
    wipeRevealAt: recoil + burstHold + wipeCover,
  };
}

function postExplosionDuration(): number {
  return SPAWN_SEQUENCE_TIMING.burstHoldDuration +
    SPAWN_SEQUENCE_TIMING.wipeCoverDuration +
    SPAWN_SEQUENCE_TIMING.wipeRevealDuration;
}

export function sampleSpawnIntro(progress: number): SpawnIntroSample {
  const t = clamp01(progress);
  const eased = cubicOut(t);

  return {
    ghostAlpha: lerp(SPAWN_INTRO_VISUALS.ghostStartAlpha, SPAWN_INTRO_VISUALS.ghostEndAlpha, t),
    ghostScaleX: lerp(
      SPAWN_INTRO_VISUALS.ghostStartScaleX,
      SPAWN_INTRO_VISUALS.ghostEndScaleX,
      eased,
    ),
    ghostScaleY: lerp(
      SPAWN_INTRO_VISUALS.ghostStartScaleY,
      SPAWN_INTRO_VISUALS.ghostEndScaleY,
      eased,
    ),
    auraAlpha: lerp(SPAWN_INTRO_VISUALS.auraStartAlpha, SPAWN_INTRO_VISUALS.auraEndAlpha, eased),
    auraScale: lerp(SPAWN_INTRO_VISUALS.auraStartScale, SPAWN_INTRO_VISUALS.auraEndScale, eased),
    coreAlpha: lerp(SPAWN_INTRO_VISUALS.coreStartAlpha, SPAWN_INTRO_VISUALS.coreEndAlpha, eased),
    coreScale: lerp(SPAWN_INTRO_VISUALS.coreStartScale, SPAWN_INTRO_VISUALS.coreEndScale, eased),
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
