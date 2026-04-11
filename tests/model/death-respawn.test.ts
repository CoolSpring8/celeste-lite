import { describe, expect, test } from "bun:test";
import {
  DEATH_RESPAWN_VISUALS,
  computeRespawnIntroOffset,
  sampleRespawnIntro,
} from "../../src/view/deathRespawn.ts";

describe("Death respawn presentation math", () => {
  test("clamps the death origin into the current room before offsetting from spawn", () => {
    const offset = computeRespawnIntroOffset(
      { x: 96, y: 120 },
      { x: 10, y: 260 },
      { x: 64, y: 80, w: 160, h: 120 },
    );

    expect(offset).toEqual({
      x: 8,
      y: 40,
    });
  });

  test("collapses to the room center when padding would invert the clamp range", () => {
    const offset = computeRespawnIntroOffset(
      { x: 100, y: 100 },
      { x: 40, y: 40 },
      { x: 80, y: 92, w: 12, h: 10 },
      DEATH_RESPAWN_VISUALS.roomClampPad,
    );

    expect(offset).toEqual({
      x: -15,
      y: -4,
    });
  });

  test("samples the intro from the full offset back to the spawn point", () => {
    const start = sampleRespawnIntro({ x: -48, y: 24 }, 0);
    const middle = sampleRespawnIntro({ x: -48, y: 24 }, 0.5);
    const end = sampleRespawnIntro({ x: -48, y: 24 }, 1);

    expect(start.offsetX).toBe(-48);
    expect(start.offsetY).toBe(24);
    expect(start.ghostAlpha).toBeCloseTo(0.18, 5);
    expect(start.auraAlpha).toBeCloseTo(0.55, 5);

    expect(Math.abs(middle.offsetX)).toBeLessThan(Math.abs(start.offsetX));
    expect(Math.abs(middle.offsetY)).toBeLessThan(Math.abs(start.offsetY));
    expect(middle.ghostAlpha).toBeGreaterThan(start.ghostAlpha);
    expect(middle.auraAlpha).toBeLessThan(start.auraAlpha);

    expect(end.offsetX).toBeCloseTo(0, 5);
    expect(end.offsetY).toBeCloseTo(0, 5);
    expect(end.ghostScale).toBeCloseTo(1.08, 5);
    expect(end.auraAlpha).toBeCloseTo(0, 5);
    expect(end.coreAlpha).toBeCloseTo(0, 5);
  });
});
