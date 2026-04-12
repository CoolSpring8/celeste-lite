import { describe, expect, test } from "bun:test";
import {
  armRespawnEffectGate,
  createRespawnEffectGate,
  filterRespawnEffects,
} from "../../src/view/respawnEffectGate.ts";

describe("Respawn effect gate", () => {
  test("suppresses grounded landing effects until the player leaves the ground once", () => {
    const gate = createRespawnEffectGate();
    armRespawnEffectGate(gate, { onGround: true });

    const groundedEffects = filterRespawnEffects(gate, { onGround: true }, [
      { type: "land", impact: 1 },
      { type: "jump" },
    ]);

    expect(groundedEffects).toEqual([{ type: "jump" }]);
    expect(gate.suppressGroundedLandEffects).toBe(true);

    const airborneEffects = filterRespawnEffects(gate, { onGround: false }, [
      { type: "land", impact: 0.6 },
    ]);

    expect(airborneEffects).toEqual([{ type: "land", impact: 0.6 }]);
    expect(gate.suppressGroundedLandEffects).toBe(false);
  });

  test("does not arm suppression when the player respawns airborne", () => {
    const gate = createRespawnEffectGate();
    armRespawnEffectGate(gate, { onGround: false });

    const effects = filterRespawnEffects(gate, { onGround: true }, [
      { type: "land", impact: 0.5 },
    ]);

    expect(effects).toEqual([{ type: "land", impact: 0.5 }]);
    expect(gate.suppressGroundedLandEffects).toBe(false);
  });
});
