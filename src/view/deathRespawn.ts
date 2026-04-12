import { VIEWPORT } from "../constants";
import { PLAYER_INTRO_TIMING } from "../player/intro";

export type DeathRespawnSequenceKind = "normal" | "spike";

export const DEATH_RESPAWN_SEQUENCE_TIMING = {
  fastSkipTotalDuration: 0.5,
  spikeRecoilDuration: 0.5,
  burstHoldDuration: 0.15,
  wipeCoverDuration: 0.25,
  wipeRevealDuration: PLAYER_INTRO_TIMING.respawnDuration,
} as const;

export const SPAWN_WIPE_VISUALS = {
  edgeOverscan: 24,
  color: 0x000000,
  pointWidth: VIEWPORT.width + 24 * 2,
  pointDepth: 64,
} as const;

export interface SpawnTransitionTimings {
  totalDuration: number;
  explodeAt: number;
  wipeCoverAt: number;
  wipeRevealAt: number;
}

export function baseTransitionDuration(kind: DeathRespawnSequenceKind): number {
  switch (kind) {
    case "normal":
      return postExplosionDuration();
    case "spike":
      return DEATH_RESPAWN_SEQUENCE_TIMING.spikeRecoilDuration + postExplosionDuration();
  }
}

export function retimedTransitionDuration(
  kind: DeathRespawnSequenceKind,
  elapsed: number,
): number {
  return Math.min(
    baseTransitionDuration(kind),
    elapsed + DEATH_RESPAWN_SEQUENCE_TIMING.fastSkipTotalDuration,
  );
}

export function transitionTimings(
  kind: DeathRespawnSequenceKind,
  totalDuration = baseTransitionDuration(kind),
): SpawnTransitionTimings {
  const scale = totalDuration / baseTransitionDuration(kind);
  const recoil = kind === "spike" ? DEATH_RESPAWN_SEQUENCE_TIMING.spikeRecoilDuration * scale : 0;
  const burstHold = DEATH_RESPAWN_SEQUENCE_TIMING.burstHoldDuration * scale;
  const wipeCover = DEATH_RESPAWN_SEQUENCE_TIMING.wipeCoverDuration * scale;

  return {
    totalDuration,
    explodeAt: recoil,
    wipeCoverAt: recoil + burstHold,
    wipeRevealAt: recoil + burstHold + wipeCover,
  };
}

function postExplosionDuration(): number {
  return DEATH_RESPAWN_SEQUENCE_TIMING.burstHoldDuration +
    DEATH_RESPAWN_SEQUENCE_TIMING.wipeCoverDuration +
    DEATH_RESPAWN_SEQUENCE_TIMING.wipeRevealDuration;
}
