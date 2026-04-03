import { describe, expect, test } from "bun:test";
import { PLAYER_GEOMETRY, WORLD } from "../../src/constants.ts";
import type { LevelEntitySpec } from "../../src/entities/types.ts";
import {
  buildWorld,
  createPlayer,
  makeInput,
  stepOnce,
  withFloor,
} from "../support/harness.ts";

describe("Checklist dashless tech", () => {
  test("climbhop transitions from climb to normal with climbhop Y speed", () => {
    const specs: LevelEntitySpec[] = [];
    withFloor(specs, 20);
    for (let row = 15; row <= 19; row++) {
      specs.push({ kind: "solidTile", col: 10, row });
    }
    const world = buildWorld(specs);
    const player = createPlayer(
      world,
      10 * WORLD.tile - PLAYER_GEOMETRY.hitboxW * 0.5 - 1,
      18 * WORLD.tile + PLAYER_GEOMETRY.hitboxH,
    );

    let climbedOut = false;
    for (let frame = 0; frame < 400; frame++) {
      const result = stepOnce(player, makeInput({ grab: true, y: -1 }));
      if (frame > 10 && result.snapshot.state !== "climb") {
        climbedOut = true;
        expect(result.snapshot.vy).toBeCloseTo(-120, 5);
        break;
      }
    }

    expect(climbedOut).toBeTrue();
  });

  test("wallboost refunds climbjump stamina when pressing away in the boost window", () => {
    const specs: LevelEntitySpec[] = [];
    withFloor(specs, 26);
    for (let row = 8; row <= 25; row++) {
      specs.push({ kind: "solidTile", col: 10, row });
    }
    const world = buildWorld(specs);
    const player = createPlayer(
      world,
      10 * WORLD.tile - PLAYER_GEOMETRY.hitboxW * 0.5 - 1,
      20 * WORLD.tile + PLAYER_GEOMETRY.hitboxH,
    );

    stepOnce(player, makeInput({ grab: true }));
    expect(player.getSnapshot().state).toBe("climb");

    stepOnce(player, makeInput({ grab: true, jump: true, jumpPressed: true, x: 0 }));
    expect(player.getSnapshot().stamina).toBeCloseTo(82.5, 5);

    stepOnce(player, makeInput({ x: -1 }));
    const wallboost = player.getSnapshot();
    expect(wallboost.stamina).toBeCloseTo(110, 5);
    expect(wallboost.vx).toBeCloseTo(-125.6666666667, 5);
  });
});
