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

  test("climbing into ledge-top spikes stalls instead of climbhopping", () => {
    const specs: LevelEntitySpec[] = [];
    withFloor(specs, 20);
    for (let row = 15; row <= 19; row++) {
      specs.push({ kind: "solidTile", col: 10, row });
    }
    specs.push({ kind: "spike", col: 10, row: 14, dir: "up" });
    const world = buildWorld(specs);
    const player = createPlayer(
      world,
      10 * WORLD.tile - PLAYER_GEOMETRY.hitboxW - 1,
      18 * WORLD.tile,
    );

    let snapshot = player.getSnapshot();
    for (let frame = 0; frame < 60; frame++) {
      snapshot = stepOnce(player, makeInput({ grab: true, y: -1 })).snapshot;
    }

    expect(snapshot.state).toBe("grab");
    expect(snapshot.vx).toBe(0);
    expect(snapshot.vy).toBeCloseTo(0, 5);
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
    expect(wallboost.vx).toBeCloseTo(-125.6666666667, 5);
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

  test("running out of stamina while climbing exits without forcing slip speed", () => {
    const specs: LevelEntitySpec[] = [];
    withFloor(specs, 26);
    for (let row = 0; row <= 25; row++) {
      specs.push({ kind: "solidTile", col: 10, row });
    }
    const world = buildWorld(specs);
    const player = createPlayer(
      world,
      10 * WORLD.tile - PLAYER_GEOMETRY.hitboxW - 1,
      22 * WORLD.tile,
    );

    stepOnce(player, makeInput({ grab: true }));
    expect(player.getSnapshot().state).toBe("grab");

    let exhausted: ReturnType<typeof player.getSnapshot> | null = null;
    for (let frame = 0; frame < 240; frame++) {
      const result = stepOnce(player, makeInput({ grab: true, y: -1 }));
      if (result.snapshot.state !== "grab") {
        exhausted = result.snapshot;
        break;
      }
    }

    expect(exhausted).toBeTruthy();
    expect(exhausted?.stamina).toBe(0);
    expect(exhausted?.vy).toBeLessThan(0);
  });

  test("climb loses hold when adjacent wall contact is gone even if the up-check regrab search can still find the wall above", () => {
    const specs: LevelEntitySpec[] = [];
    for (let row = 12; row <= 16; row++) {
      specs.push({ kind: "solidTile", col: 20, row });
    }
    const world = buildWorld(specs);
    const wallBottom = 17 * WORLD.tile;
    const player = createPlayer(world, 20 * WORLD.tile - PLAYER_GEOMETRY.hitboxW, wallBottom);
    const internals = player as unknown as {
      state: string;
      facing: 1 | -1;
      refreshEnvironment: () => void;
      climbCheck: (dir: number, yAdd?: number) => boolean;
    };

    internals.state = "grab";
    internals.facing = 1;
    internals.refreshEnvironment();

    expect(internals.climbCheck(1)).toBeFalse();
    expect(internals.climbCheck(1, -1)).toBeTrue();

    const result = stepOnce(player, makeInput({ x: 1, grab: true }));
    expect(result.snapshot.state).toBe("normal");
  });

  test("climb movement uses float32 remainders, so two quarter-pixel taps cross 0.5 and advance on the second tap", () => {
    const specs: LevelEntitySpec[] = [];
    for (let row = 12; row <= 16; row++) {
      specs.push({ kind: "solidTile", col: 20, row });
    }
    const world = buildWorld(specs);
    const wallBottom = 17 * WORLD.tile;
    const player = createPlayer(world, 20 * WORLD.tile - PLAYER_GEOMETRY.hitboxW, wallBottom - 1);
    const internals = player as unknown as {
      state: string;
      facing: 1 | -1;
      refreshEnvironment: () => void;
    };

    internals.state = "grab";
    internals.facing = 1;
    internals.refreshEnvironment();

    stepOnce(player, makeInput({ x: 1, y: 1, grab: true }));
    stepOnce(player, makeInput({ x: 1, grab: true }));
    stepOnce(player, makeInput({ x: 1, grab: true }));
    stepOnce(player, makeInput({ x: 1, grab: true }));
    const secondTap = stepOnce(player, makeInput({ x: 1, y: 1, grab: true }));

    expect(secondTap.snapshot.state).toBe("grab");
    expect(secondTap.snapshot.y).toBe(wallBottom);
  });
});
