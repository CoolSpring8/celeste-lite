import { describe, expect, test } from "bun:test";
import { PLAYER_CONFIG, PLAYER_GEOMETRY, WORLD } from "../../src/constants.ts";
import type { LevelEntitySpec } from "../../src/entities/types.ts";
import type { PlayerSnapshot } from "../../src/player/types.ts";
import {
  buildWorld,
  createPlayer,
  makeInput,
  step,
  stepOnce,
  withFloor,
} from "../support/harness.ts";

describe("Climb behavior", () => {
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
      10 * WORLD.tile - PLAYER_GEOMETRY.hitboxW * 0.5 - 1,
      18 * WORLD.tile + PLAYER_GEOMETRY.hitboxH,
    );

    let snapshot = player.getSnapshot();
    for (let frame = 0; frame < 60; frame++) {
      snapshot = stepOnce(player, makeInput({ grab: true, y: -1 })).snapshot;
    }

    expect(snapshot.state).toBe("climb");
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
      10 * WORLD.tile - PLAYER_GEOMETRY.hitboxW * 0.5 - 1,
      18 * WORLD.tile + PLAYER_GEOMETRY.hitboxH,
    ) as unknown as {
      climbHopBlockedCheck: () => boolean;
    };

    expect(player.climbHopBlockedCheck()).toBeTrue();
  });

  test("tired state uses the strict threshold and wallboost stamina grace", () => {
    const world = buildWorld([]);
    const player = createPlayer(world, 0, 0) as unknown as {
      stamina: number;
      wallBoostTimer: number;
      getSnapshot: () => PlayerSnapshot;
    };

    player.stamina = 20;
    player.wallBoostTimer = 0;
    expect(player.getSnapshot().isTired).toBeFalse();

    player.stamina = 0;
    player.wallBoostTimer = PLAYER_CONFIG.climb.climbJumpBoostTime;
    expect(player.getSnapshot().isTired).toBeFalse();

    player.stamina = 0;
    player.wallBoostTimer = 0;
    expect(player.getSnapshot().isTired).toBeTrue();
  });

  test("climb sweat snapshot distinguishes climb and danger states", () => {
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
    ) as unknown as { stamina: number; getSnapshot: () => PlayerSnapshot };

    let snapshot = player.getSnapshot();
    for (let frame = 0; frame < 8; frame++) {
      snapshot = stepOnce(player, makeInput({ grab: true, y: -1 })).snapshot;
    }
    expect(snapshot.state).toBe("climb");
    expect(snapshot.sweatState).toBe("climb");

    player.stamina = PLAYER_CONFIG.climb.tiredThreshold;
    snapshot = stepOnce(player, makeInput({ grab: true, y: -1 })).snapshot;
    expect(snapshot.sweatState).toBe("danger");
  });

  test("climb jump exposes a temporary jump sweat state", () => {
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

    for (let frame = 0; frame < 2; frame++) {
      stepOnce(player, makeInput({ grab: true }));
    }

    let snapshot = stepOnce(player, makeInput({ grab: true, jumpPressed: true })).snapshot;
    expect(snapshot.sweatState).toBe("jump");

    snapshot = step(player, makeInput(), 8).at(-1)!.snapshot;
    expect(snapshot.sweatState).toBe("idle");
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
      12 * WORLD.tile - PLAYER_GEOMETRY.hitboxW * 0.5 - 20,
      18 * WORLD.tile + PLAYER_GEOMETRY.hitboxH,
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
      10 * WORLD.tile - PLAYER_GEOMETRY.hitboxW * 0.5 - 1,
      22 * WORLD.tile + PLAYER_GEOMETRY.hitboxH,
    );

    stepOnce(player, makeInput({ grab: true }));
    expect(player.getSnapshot().state).toBe("climb");

    let exhausted: ReturnType<typeof player.getSnapshot> | null = null;
    for (let frame = 0; frame < 240; frame++) {
      const result = stepOnce(player, makeInput({ grab: true, y: -1 }));
      if (result.snapshot.state !== "climb") {
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
    const player = createPlayer(
      world,
      20 * WORLD.tile - PLAYER_GEOMETRY.hitboxW * 0.5,
      wallBottom + PLAYER_GEOMETRY.hitboxH,
    );
    const internals = player as unknown as {
      forceState: (state: PlayerSnapshot["state"]) => void;
      facing: 1 | -1;
      refreshEnvironment: () => void;
      climbCheck: (dir: number, yAdd?: number) => boolean;
    };

    internals.forceState("climb");
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
    const player = createPlayer(
      world,
      20 * WORLD.tile - PLAYER_GEOMETRY.hitboxW * 0.5,
      wallBottom + PLAYER_GEOMETRY.hitboxH - 1,
    );
    const internals = player as unknown as {
      climbNoMoveTimer: number;
      forceState: (state: PlayerSnapshot["state"]) => void;
      facing: 1 | -1;
      refreshEnvironment: () => void;
    };

    internals.forceState("climb");
    internals.facing = 1;
    internals.refreshEnvironment();
    internals.climbNoMoveTimer = 0;

    stepOnce(player, makeInput({ x: 1, y: 1, grab: true }));
    stepOnce(player, makeInput({ x: 1, grab: true }));
    stepOnce(player, makeInput({ x: 1, grab: true }));
    stepOnce(player, makeInput({ x: 1, grab: true }));
    const secondTap = stepOnce(player, makeInput({ x: 1, y: 1, grab: true }));

    expect(secondTap.snapshot.state).toBe("climb");
    expect(secondTap.snapshot.y).toBe(wallBottom + PLAYER_GEOMETRY.hitboxH);
  });
});
