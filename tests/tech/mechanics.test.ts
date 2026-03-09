import { describe, expect, test } from "bun:test";
import { PLAYER_GEOMETRY, WORLD } from "../../src/constants.ts";
import type { LevelEntitySpec } from "../../src/entities/types.ts";
import {
  buildWorld,
  createPlayer,
  createPlayerOnFloor,
  makeInput,
  stepOnce,
  withFloor,
} from "./harness.ts";

describe("Core mechanics", () => {
  test("coyote jump remains available for 5 ticks at 60 Hz and expires on the 6th", () => {
    const specs: LevelEntitySpec[] = [];
    withFloor(specs, 20, 0, 9);
    const world = buildWorld(specs);

    const withinWindow = createPlayerOnFloor(world, 40, 20);
    stepOnce(withinWindow, makeInput());
    withinWindow.x = 220;
    for (let frame = 0; frame < 5; frame++) {
      stepOnce(withinWindow, makeInput());
    }
    const coyoteJump = stepOnce(withinWindow, makeInput({ jump: true, jumpPressed: true }));
    expect(coyoteJump.snapshot.vy).toBeLessThan(0);

    const afterWindow = createPlayerOnFloor(world, 40, 20);
    stepOnce(afterWindow, makeInput());
    afterWindow.x = 220;
    for (let frame = 0; frame < 6; frame++) {
      stepOnce(afterWindow, makeInput());
    }
    const lateJump = stepOnce(afterWindow, makeInput({ jump: true, jumpPressed: true }));
    expect(lateJump.snapshot.vy).toBeGreaterThanOrEqual(0);
  });

  test("jump buffering remains available for 5 ticks before landing and expires on the 6th", () => {
    const specs: LevelEntitySpec[] = [];
    withFloor(specs, 20);
    const world = buildWorld(specs);
    const startY = 20 * WORLD.tile - PLAYER_GEOMETRY.hitboxH - 80;

    const probe = createPlayer(world, 120, startY);
    let landingFrame = -1;
    for (let frame = 0; frame < 120; frame++) {
      const result = stepOnce(probe, makeInput());
      if (result.snapshot.onGround) {
        landingFrame = frame;
        break;
      }
    }
    expect(landingFrame).toBeGreaterThan(0);

    const withinWindow = createPlayer(world, 120, startY);
    const pressFrame = landingFrame - 5;
    let bufferedJump = false;
    for (let frame = 0; frame < 120; frame++) {
      const result = stepOnce(withinWindow, makeInput({
        jump: frame >= pressFrame,
        jumpPressed: frame === pressFrame,
      }));
      if (result.effects.some((effect) => effect.type === "jump")) {
        bufferedJump = true;
        break;
      }
    }
    expect(bufferedJump).toBeTrue();

    const afterWindow = createPlayer(world, 120, startY);
    const latePressFrame = landingFrame - 6;
    let lateBufferedJump = false;
    for (let frame = 0; frame < 120; frame++) {
      const result = stepOnce(afterWindow, makeInput({
        jump: frame >= latePressFrame,
        jumpPressed: frame === latePressFrame,
      }));
      if (result.effects.some((effect) => effect.type === "jump")) {
        lateBufferedJump = true;
        break;
      }
    }
    expect(lateBufferedJump).toBeFalse();
  });

  test("fastfall raises max fall speed from 160 to 240", () => {
    const world = buildWorld([]);

    const normal = createPlayer(world, 120, 80);
    let normalMaxVy = -Infinity;
    for (let frame = 0; frame < 400; frame++) {
      const result = stepOnce(normal, makeInput());
      normalMaxVy = Math.max(normalMaxVy, result.snapshot.vy);
    }
    expect(normalMaxVy).toBeCloseTo(160, 5);

    const fastfall = createPlayer(world, 120, 80);
    let fastfallMaxVy = -Infinity;
    for (let frame = 0; frame < 400; frame++) {
      const result = stepOnce(fastfall, makeInput({ y: 1 }));
      fastfallMaxVy = Math.max(fastfallMaxVy, result.snapshot.vy);
    }
    expect(fastfallMaxVy).toBeCloseTo(240, 5);
  });
});
