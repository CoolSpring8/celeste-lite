import { describe, expect, test } from "bun:test";
import { resolveHairLayout, snapHairChain, stepHairChain } from "../../src/view/playerHair.ts";

describe("sqrt(11) player hair", () => {
  test("snap builds the chain from the anchor and segment offset", () => {
    const layout = {
      anchor: { x: -1.5, y: -8.5 },
      segmentOffset: { x: -0.75, y: 1.5 },
      maxDistance: 2,
      followRate: 40,
    };

    const chain = snapHairChain(layout, 4);

    expect(chain).toEqual([
      { x: -1.5, y: -8.5 },
      { x: -2.25, y: -7 },
      { x: -3, y: -5.5 },
      { x: -3.75, y: -4 },
    ]);
  });

  test("forward motion and dash flatten the ponytail further behind the body", () => {
    const idle = resolveHairLayout({
      facing: 1,
      isCrouched: false,
      onGround: true,
      state: "normal",
      vx: 0,
      vy: 0,
    });
    const run = resolveHairLayout({
      facing: 1,
      isCrouched: false,
      onGround: true,
      state: "normal",
      vx: 140,
      vy: 0,
    });
    const dash = resolveHairLayout({
      facing: 1,
      isCrouched: false,
      onGround: false,
      state: "dash",
      vx: 140,
      vy: 0,
    });

    expect(run.segmentOffset.x).toBeLessThan(idle.segmentOffset.x);
    expect(dash.segmentOffset.x).toBeLessThan(run.segmentOffset.x);
    expect(dash.segmentOffset.y).toBeLessThan(run.segmentOffset.y);
  });

  test("facing mirrors the hair anchor and segment direction instead of reusing the same side", () => {
    const right = resolveHairLayout({
      facing: 1,
      isCrouched: false,
      onGround: true,
      state: "normal",
      vx: 0,
      vy: 0,
    });
    const left = resolveHairLayout({
      facing: -1,
      isCrouched: false,
      onGround: true,
      state: "normal",
      vx: 0,
      vy: 0,
    });

    expect(left.anchor.x).toBe(-right.anchor.x);
    expect(left.anchor.y).toBe(right.anchor.y);
    expect(left.segmentOffset.x).toBe(-right.segmentOffset.x);
    expect(left.segmentOffset.y).toBe(right.segmentOffset.y);
  });

  test("step keeps each node within the configured max distance of its target", () => {
    const layout = {
      anchor: { x: 0, y: 0 },
      segmentOffset: { x: -1, y: 2 },
      maxDistance: 1.25,
      followRate: 0,
    };

    const next = stepHairChain(
      [
        { x: 8, y: 5 },
        { x: -7, y: 11 },
      ],
      layout,
      1 / 60,
      2,
    );

    expect(Math.hypot(next[0].x - layout.anchor.x, next[0].y - layout.anchor.y)).toBeLessThanOrEqual(
      1.250001,
    );
    expect(Math.hypot(next[1].x - (next[0].x - 1), next[1].y - (next[0].y + 2))).toBeLessThanOrEqual(
      1.250001,
    );
  });
});
