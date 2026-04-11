import { describe, expect, test } from "bun:test";
import {
  baseTransitionDuration,
  retimedTransitionDuration,
  sampleSpawnIntro,
  transitionTimings,
} from "../../src/view/deathRespawn.ts";

describe("Spawn intro presentation math", () => {
  test("starts as a low, wide ground-form silhouette and settles into the live pose", () => {
    const start = sampleSpawnIntro(0);
    const middle = sampleSpawnIntro(0.5);
    const end = sampleSpawnIntro(1);

    expect(start.ghostAlpha).toBeCloseTo(0.06, 5);
    expect(start.ghostScaleX).toBeGreaterThan(1);
    expect(start.ghostScaleY).toBeLessThan(0.2);
    expect(start.auraAlpha).toBeCloseTo(0.6, 5);

    expect(middle.ghostAlpha).toBeGreaterThan(start.ghostAlpha);
    expect(middle.ghostScaleX).toBeLessThan(start.ghostScaleX);
    expect(middle.ghostScaleY).toBeGreaterThan(start.ghostScaleY);
    expect(middle.auraAlpha).toBeLessThan(start.auraAlpha);

    expect(end.ghostAlpha).toBeCloseTo(1, 5);
    expect(end.ghostScaleX).toBeCloseTo(1.03, 5);
    expect(end.ghostScaleY).toBeCloseTo(1.04, 5);
    expect(end.auraAlpha).toBeCloseTo(0, 5);
    expect(end.coreAlpha).toBeCloseTo(0, 5);
  });

  test("uses the requested 1.5s spike path, 1s normal path, and 0.5s fast-skip floor", () => {
    expect(baseTransitionDuration("spike")).toBeCloseTo(1.5, 5);
    expect(baseTransitionDuration("normal")).toBeCloseTo(1, 5);

    expect(retimedTransitionDuration("spike", 0)).toBeCloseTo(0.5, 5);
    expect(retimedTransitionDuration("normal", 0.1)).toBeCloseTo(0.6, 5);
    expect(retimedTransitionDuration("spike", 1.2)).toBeCloseTo(1.5, 5);
  });

  test("starts the wipe later than the explosion and keeps spike recoil ahead of it", () => {
    const normal = transitionTimings("normal");
    const spike = transitionTimings("spike");

    expect(normal.explodeAt).toBeCloseTo(0, 5);
    expect(normal.wipeCoverAt).toBeGreaterThan(normal.explodeAt);
    expect(normal.wipeRevealAt).toBeGreaterThan(normal.wipeCoverAt);

    expect(spike.explodeAt).toBeCloseTo(0.5, 5);
    expect(spike.wipeCoverAt).toBeGreaterThan(spike.explodeAt);
    expect(spike.wipeRevealAt).toBeGreaterThan(spike.wipeCoverAt);
  });
});
