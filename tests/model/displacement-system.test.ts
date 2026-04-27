import { describe, expect, test } from "bun:test";
import {
  DASH_DISPLACEMENT_CONFIG,
  DisplacementBurstModel,
  easeQuadOut,
  projectBurstToPostFx,
} from "../../src/displacement/ripple.ts";

describe("DisplacementBurstModel", () => {
  test("starts a compact dash ripple at the burst center", () => {
    const model = new DisplacementBurstModel();
    model.addBurst(120, 64);

    const [burst] = model.shaderBursts();

    expect(burst.x).toBe(120);
    expect(burst.y).toBe(64);
    expect(burst.radius).toBe(DASH_DISPLACEMENT_CONFIG.startRadius);
    expect(burst.ringWidth).toBe(DASH_DISPLACEMENT_CONFIG.ringWidth);
    expect(burst.amplitude).toBe(DASH_DISPLACEMENT_CONFIG.amplitude);
    expect(burst.strength).toBe(DASH_DISPLACEMENT_CONFIG.strength);
  });

  test("expands and fades with quad-out timing", () => {
    const model = new DisplacementBurstModel();
    model.addBurst(0, 0);
    model.update(DASH_DISPLACEMENT_CONFIG.duration * 0.5);

    const [burst] = model.shaderBursts();
    const eased = easeQuadOut(0.5);

    expect(burst.radius).toBeCloseTo(
      DASH_DISPLACEMENT_CONFIG.startRadius +
        (DASH_DISPLACEMENT_CONFIG.endRadius - DASH_DISPLACEMENT_CONFIG.startRadius) * eased,
    );
    expect(burst.strength).toBeCloseTo(DASH_DISPLACEMENT_CONFIG.strength * (1 - eased));
  });

  test("expires old bursts and caps overlap", () => {
    const model = new DisplacementBurstModel({
      ...DASH_DISPLACEMENT_CONFIG,
      maxBursts: 2,
    });

    model.addBurst(1, 1);
    model.addBurst(2, 2);
    model.addBurst(3, 3);

    expect(model.shaderBursts().map((burst) => burst.x)).toEqual([2, 3]);

    model.update(DASH_DISPLACEMENT_CONFIG.duration);

    expect(model.hasActiveBursts()).toBeFalse();
  });
});

describe("projectBurstToPostFx", () => {
  test("keeps camera-relative x and flips y for post-fx texture coordinates", () => {
    const burst = {
      x: 128,
      y: 96,
      radius: 8,
      ringWidth: 3,
      amplitude: 2,
      strength: 0.4,
    };

    expect(projectBurstToPostFx(burst, { scrollX: 8, scrollY: 16, height: 180 })).toEqual({
      ...burst,
      screenX: 120,
      screenY: 100,
    });
  });
});
