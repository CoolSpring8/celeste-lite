import { type PlayerEffect, type PlayerSnapshot } from "../player/types";

export interface RespawnEffectGate {
  suppressGroundedLandEffects: boolean;
}

export function createRespawnEffectGate(): RespawnEffectGate {
  return {
    suppressGroundedLandEffects: false,
  };
}

export function resetRespawnEffectGate(gate: RespawnEffectGate): void {
  gate.suppressGroundedLandEffects = false;
}

export function armRespawnEffectGate(
  gate: RespawnEffectGate,
  snapshot: Pick<PlayerSnapshot, "onGround">,
): void {
  gate.suppressGroundedLandEffects = snapshot.onGround;
}

export function filterRespawnEffects(
  gate: RespawnEffectGate,
  snapshot: Pick<PlayerSnapshot, "onGround">,
  effects: PlayerEffect[],
): PlayerEffect[] {
  if (!gate.suppressGroundedLandEffects) {
    return effects;
  }

  if (!snapshot.onGround) {
    gate.suppressGroundedLandEffects = false;
    return effects;
  }

  return effects.filter((effect) => effect.type !== "land");
}
