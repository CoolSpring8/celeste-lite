import { describe, expect, test } from "bun:test";
import type { LevelEntitySpec } from "../../src/entities/types.ts";
import {
  buildWorld,
  createPlayerOnFloor,
  makeInput,
  step,
  stepOnce,
  withFloor,
} from "../support/harness.ts";

describe("Dash behavior", () => {
  test("dash enters state immediately and commits direction after the frozen startup", () => {
    const specs: LevelEntitySpec[] = [];
    withFloor(specs, 20);
    const world = buildWorld(specs);
    const player = createPlayerOnFloor(world, 104, 20);

    stepOnce(player, makeInput());
    const press = stepOnce(player, makeInput({ x: -1, dashPressed: true }));
    expect(press.snapshot.state).toBe("dash");
    expect(press.snapshot.vx).toBe(0);
    expect(press.effects.some((effect) => effect.type === "dash_begin")).toBeTrue();
    expect(press.effects.some((effect) => effect.type === "dash_start")).toBeFalse();

    for (let frame = 0; frame < 3; frame++) {
      const startup = stepOnce(player, makeInput({ x: 1 }));
      expect(startup.snapshot.state).toBe("dash");
      expect(startup.snapshot.vx).toBe(0);
      expect(startup.effects.some((effect) => effect.type === "dash_start")).toBeFalse();
    }

    const commit = stepOnce(player, makeInput({ x: 1 }));
    const dashStart = commit.effects.find((effect) => effect.type === "dash_start");
    expect(dashStart).toBeTruthy();
    expect(dashStart?.dirX).toBeGreaterThan(0);
    expect(commit.snapshot.vx).toBeGreaterThan(0);
  });

  test("dash trail effects follow the canonical start, 0.08s, end schedule with no freeze-start trails", () => {
    const specs: LevelEntitySpec[] = [];
    withFloor(specs, 20);
    const world = buildWorld(specs);
    const player = createPlayerOnFloor(world, 104, 20);

    stepOnce(player, makeInput());

    const press = stepOnce(player, makeInput({ x: 1, dashPressed: true }));
    expect(press.effects.some((effect) => effect.type === "dash_trail")).toBeFalse();

    for (let frame = 0; frame < 3; frame++) {
      const frozen = stepOnce(player, makeInput({ x: 1 }));
      expect(frozen.effects.some((effect) => effect.type === "dash_trail")).toBeFalse();
    }

    const trailFrames: number[] = [];
    const trailXs: number[] = [];
    for (let frame = 0; frame < 20; frame++) {
      const result = stepOnce(player, makeInput({ x: 1 }));
      const trail = result.effects.find((effect) => effect.type === "dash_trail");
      if (trail) {
        trailFrames.push(frame);
        trailXs.push(trail.trailX ?? NaN);
      }
    }

    expect(trailFrames).toEqual([0, 5, 10]);
    expect(trailXs[0]).toBeLessThan(trailXs[1]);
    expect(trailXs[1]).toBeLessThan(trailXs[2]);
  });

  test("manual crouch dash jump resolves as hyper before dash motion on the coroutine commit frame", () => {
    const specs: LevelEntitySpec[] = [];
    withFloor(specs, 20);
    const world = buildWorld(specs);
    const probe = createPlayerOnFloor(world, 104, 20);

    stepOnce(probe, makeInput());
    stepOnce(probe, makeInput({ x: 1, y: 1, dashPressed: true }));

    let commitFrame = -1;
    for (let frame = 0; frame < 10; frame++) {
      const result = stepOnce(probe, makeInput({ x: 1, y: 1 }));
      if (result.effects.some((effect) => effect.type === "dash_start")) {
        commitFrame = frame;
        break;
      }
    }

    expect(commitFrame).toBeGreaterThanOrEqual(0);

    const player = createPlayerOnFloor(world, 104, 20);
    stepOnce(player, makeInput());
    stepOnce(player, makeInput({ x: 1, y: 1, dashPressed: true }));
    step(player, makeInput({ x: 1, y: 1 }), commitFrame);
    const jump = stepOnce(player, makeInput({ x: 1, y: 1, jump: true, jumpPressed: true }));

    expect(jump.effects.some((effect) => effect.type === "super")).toBeFalse();
    expect(jump.effects.some((effect) => effect.type === "hyper")).toBeTrue();
    expect(jump.snapshot.state).toBe("normal");
    expect(jump.snapshot.vx).toBeCloseTo(325, 5);
    expect(jump.snapshot.vy).toBeCloseTo(-52.5, 5);
  });
});
