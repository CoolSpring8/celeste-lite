import { describe, expect, test } from "bun:test";
import { PLAYER_GEOMETRY, WORLD } from "../../src/constants.ts";
import type { LevelEntitySpec } from "../../src/entities/types.ts";
import {
  buildWorld,
  createPlayer,
  makeInput,
  stepOnce,
  withFloor,
} from "./harness.ts";

describe("Climb and dashless tech", () => {
  test("climbhop transitions from climb to normal with climbhop Y speed", () => {
    const specs: LevelEntitySpec[] = [];
    withFloor(specs, 20);
    for (let row = 15; row <= 19; row++) {
      specs.push({ kind: "solidTile", col: 10, row });
    }
    const world = buildWorld(specs);
    const player = createPlayer(
      world,
      10 * WORLD.tile - PLAYER_GEOMETRY.hitboxW - 1,
      18 * WORLD.tile,
    );

    let climbedOut = false;
    for (let frame = 0; frame < 400; frame++) {
      const result = stepOnce(player, makeInput({ grab: true, y: -1 }));
      if (frame > 10 && result.snapshot.state !== "grab") {
        climbedOut = true;
        expect(result.snapshot.vy).toBeCloseTo(-120, 5);
        break;
      }
    }

    expect(climbedOut).toBeTrue();
  });

  test("climbhop blocker matches the reference solid-above check", () => {
    const specs: LevelEntitySpec[] = [];
    withFloor(specs, 20);
    for (let row = 15; row <= 19; row++) {
      specs.push({ kind: "solidTile", col: 10, row });
    }
    specs.push({ kind: "solidTile", col: 9, row: 17 });
    const world = buildWorld(specs);
    const player = createPlayer(
      world,
      10 * WORLD.tile - PLAYER_GEOMETRY.hitboxW - 1,
      18 * WORLD.tile,
    ) as unknown as {
      climbHopBlockedCheck: () => boolean;
    };

    expect(player.climbHopBlockedCheck()).toBeTrue();
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
      10 * WORLD.tile - PLAYER_GEOMETRY.hitboxW - 1,
      20 * WORLD.tile,
    );

    stepOnce(player, makeInput({ grab: true }));
    expect(player.getSnapshot().state).toBe("grab");

    stepOnce(player, makeInput({ grab: true, jump: true, jumpPressed: true, x: 0 }));
    expect(player.getSnapshot().stamina).toBeCloseTo(82.5, 5);

    stepOnce(player, makeInput({ x: -1 }));
    const wallboost = player.getSnapshot();
    expect(wallboost.stamina).toBeCloseTo(110, 5);
    expect(wallboost.vx).toBeCloseTo(-128, 0);
  });

  test("wall speed retention refunds stored speed when the path clears inside the retention window", () => {
    const specs: LevelEntitySpec[] = [];
    withFloor(specs, 26);
    for (let row = 18; row <= 25; row++) {
      specs.push({ kind: "solidTile", col: 12, row });
    }
    const world = buildWorld(specs);
    const player = createPlayer(
      world,
      12 * WORLD.tile - PLAYER_GEOMETRY.hitboxW - 20,
      18 * WORLD.tile,
    );

    stepOnce(player, makeInput());
    stepOnce(player, makeInput({ x: 1, dashPressed: true }));

    let collided = false;
    let refunded = false;
    for (let frame = 0; frame < 40; frame++) {
      stepOnce(player, makeInput({ x: 1 }));
      const timer = (player as unknown as { wallSpeedRetentionTimer: number }).wallSpeedRetentionTimer;
      if (!collided && timer > 0) {
        collided = true;
        player.y -= 20;
      } else if (collided && player.getSnapshot().vx > 0) {
        refunded = true;
        break;
      }
    }

    expect(collided).toBeTrue();
    expect(refunded).toBeTrue();
    expect(player.getSnapshot().vx).toBeCloseTo(240, 5);
  });
});
