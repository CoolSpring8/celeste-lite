import { describe, expect, test } from "bun:test";
import {
  INTRO_IRIS_TIMING,
  INTRO_IRIS_VISUALS,
  introIrisTotalDuration,
  sampleIntroIrisRadius,
} from "../../src/view/introIris.ts";

describe("Intro iris reveal", () => {
  test("opens to a player-sized hole, holds, then reveals the full viewport", () => {
    const maxRadius = 200;
    const closed = sampleIntroIrisRadius(0, maxRadius);
    const open = sampleIntroIrisRadius(INTRO_IRIS_TIMING.initialRevealDuration, maxRadius);
    const held = sampleIntroIrisRadius(
      INTRO_IRIS_TIMING.initialRevealDuration + INTRO_IRIS_TIMING.holdDuration * 0.5,
      maxRadius,
    );
    const revealing = sampleIntroIrisRadius(
      INTRO_IRIS_TIMING.initialRevealDuration + INTRO_IRIS_TIMING.holdDuration + 0.01,
      maxRadius,
    );
    const done = sampleIntroIrisRadius(introIrisTotalDuration(), maxRadius);

    expect(closed.phase).toBe("opening");
    expect(closed.radius).toBeCloseTo(0, 5);
    expect(open.phase).toBe("hold");
    expect(open.radius).toBeCloseTo(INTRO_IRIS_VISUALS.holdRadius, 5);
    expect(held.phase).toBe("hold");
    expect(held.radius).toBeCloseTo(open.radius, 5);
    expect(revealing.phase).toBe("revealing");
    expect(revealing.radius).toBeGreaterThan(held.radius);
    expect(done.phase).toBe("done");
    expect(done.radius).toBeCloseTo(maxRadius, 5);
    expect(done.done).toBe(true);
  });
});
