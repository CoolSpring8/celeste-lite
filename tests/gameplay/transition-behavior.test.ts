import { describe, expect, test } from "bun:test";
import { PLAYER_CONFIG } from "../../src/constants.ts";
import type { LevelEntitySpec } from "../../src/entities/types.ts";
import {
  buildWorld,
  createPlayer,
  createPlayerOnFloor,
  makeInput,
  stepOnce,
  withFloor,
} from "../support/harness.ts";

describe("Transition behavior", () => {
  test("transition clears coyote time and refills dash and stamina", () => {
    const specs: LevelEntitySpec[] = [];
    withFloor(specs, 20, 0, 9);
    const world = buildWorld(specs);
    const player = createPlayerOnFloor(world, 44, 20);

    stepOnce(player, makeInput());
    player.x = 220;
    stepOnce(player, makeInput());

    (player as unknown as { dashesLeft: number }).dashesLeft = 0;
    (player as unknown as { stamina: number }).stamina = 0;

    player.onTransition();

    const result = stepOnce(player, makeInput({ jump: true, jumpPressed: true }));
    expect(result.snapshot.vy).toBeGreaterThanOrEqual(0);
    expect(result.snapshot.dashesLeft).toBe(PLAYER_CONFIG.dash.maxDashes);
    expect(result.snapshot.stamina).toBeCloseTo(PLAYER_CONFIG.climb.max, 5);
  });

  test("transition clears forced horizontal motion from a wall jump", () => {
    const world = buildWorld([]);
    const player = createPlayer(world, 100, 100);

    (player as unknown as { forceMoveX: number }).forceMoveX = 1;
    (player as unknown as { forceMoveXTimer: number }).forceMoveXTimer = 0.1;

    player.onTransition();

    const result = stepOnce(player, makeInput({ x: -1, aimX: -1 }));
    expect(result.snapshot.vx).toBeLessThan(0);
  });
});
