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

  test("passive transition ticks expire existing jump and dash buffers", () => {
    const world = buildWorld([]);
    const player = createPlayer(world, 100, 100);
    const internals = player as unknown as {
      jumpPressBufferTimer: number;
      dashPressBufferTimer: number;
      dashPressCrouches: boolean;
    };

    internals.jumpPressBufferTimer = PLAYER_CONFIG.input.jumpBufferTime;
    internals.dashPressBufferTimer = PLAYER_CONFIG.input.dashBufferTime;
    internals.dashPressCrouches = true;

    for (let frame = 0; frame < 5; frame++) {
      player.tickInputBuffers(1 / 60, { jump: true, dash: false, crouchDash: true });
    }

    expect(internals.jumpPressBufferTimer).toBe(0);
    expect(internals.dashPressBufferTimer).toBe(0);
    expect(internals.dashPressCrouches).toBeFalse();
  });

  test("passive transition clears existing buffers on release", () => {
    const world = buildWorld([]);
    const player = createPlayer(world, 100, 100);
    const internals = player as unknown as {
      jumpPressBufferTimer: number;
      dashPressBufferTimer: number;
      dashPressCrouches: boolean;
    };

    internals.jumpPressBufferTimer = PLAYER_CONFIG.input.jumpBufferTime;
    internals.dashPressBufferTimer = PLAYER_CONFIG.input.dashBufferTime;
    internals.dashPressCrouches = true;

    player.tickInputBuffers(1 / 60, { jump: false, dash: false, crouchDash: false });

    expect(internals.jumpPressBufferTimer).toBe(0);
    expect(internals.dashPressBufferTimer).toBe(0);
    expect(internals.dashPressCrouches).toBeFalse();
  });

  test("top limit clamps the player like a ceiling", () => {
    const world = buildWorld([]);
    const player = createPlayer(world, 100, 30);

    (player as unknown as { vy: number }).vy = -90;
    player.enforceTopLimit(24);

    const snapshot = player.getSnapshot();
    expect(snapshot.top).toBe(24);
    expect(snapshot.vy).toBe(0);
  });

  test("bounce resets to normal state and sustains upward speed briefly", () => {
    const world = buildWorld([]);
    const player = createPlayer(world, 100, 100);

    player.forceState("climb");
    player.bounce();

    const bounced = player.getSnapshot();
    expect(bounced.state).toBe("normal");
    expect(bounced.vy).toBe(-140);

    const result = stepOnce(player, makeInput());
    expect(result.snapshot.vy).toBe(-140);
  });

  test("bottom bounce clamps to the room edge and jumps higher while jump is held", () => {
    const world = buildWorld([]);
    const player = createPlayer(world, 100, 100);

    player.bounceFromBottom(92, true);

    const bounced = player.getSnapshot();
    expect(bounced.bottom).toBe(92);
    expect(bounced.vy).toBe(-180);

    const result = stepOnce(player, makeInput({ jump: true }));
    expect(result.snapshot.vy).toBe(-180);
  });
});
