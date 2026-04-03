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
} from "../support/harness.ts";

describe("Checklist mechanics", () => {
  test("directional spikes are safe only while moving in the direction they point", () => {
    const specs: LevelEntitySpec[] = [
      { kind: "spike", col: 15, row: 19, dir: "right" },
      { kind: "solidTile", col: 13, row: 20 },
      { kind: "solidTile", col: 14, row: 20 },
      { kind: "solidTile", col: 15, row: 20 },
    ];
    const world = buildWorld(specs);
    const hurtbox = {
      x: 15 * WORLD.tile - PLAYER_GEOMETRY.hitboxW + 1,
      y: 19 * WORLD.tile,
      w: PLAYER_GEOMETRY.hitboxW,
      h: PLAYER_GEOMETRY.hurtboxH,
    };

    expect(world.collidesWithSpike(hurtbox, 90, 0)).toBeNull();
    expect(world.collidesWithSpike(hurtbox, 0, 0)).not.toBeNull();
    expect(world.collidesWithSpike(hurtbox, -90, 0)).not.toBeNull();
  });

  test("coyote jump remains available for 5 ticks at 60 Hz and expires on the 6th", () => {
    const specs: LevelEntitySpec[] = [];
    withFloor(specs, 20, 0, 9);
    const world = buildWorld(specs);

    const withinWindow = createPlayerOnFloor(world, 44, 20);
    stepOnce(withinWindow, makeInput());
    withinWindow.x = 220;
    for (let frame = 0; frame < 5; frame++) {
      stepOnce(withinWindow, makeInput());
    }
    const coyoteJump = stepOnce(withinWindow, makeInput({ jump: true, jumpPressed: true }));
    expect(coyoteJump.snapshot.vy).toBeLessThan(0);

    const afterWindow = createPlayerOnFloor(world, 44, 20);
    stepOnce(afterWindow, makeInput());
    afterWindow.x = 220;
    for (let frame = 0; frame < 6; frame++) {
      stepOnce(afterWindow, makeInput());
    }
    const lateJump = stepOnce(afterWindow, makeInput({ jump: true, jumpPressed: true }));
    expect(lateJump.snapshot.vy).toBeGreaterThanOrEqual(0);
  });

  test("jump buffering is valid 3 frames before the first grounded snapshot and expires 4 frames early", () => {
    const specs: LevelEntitySpec[] = [];
    withFloor(specs, 20);
    const world = buildWorld(specs);
    const startY = 20 * WORLD.tile - 80;

    const probe = createPlayer(world, 124, startY);
    let landingFrame = -1;
    for (let frame = 0; frame < 120; frame++) {
      const result = stepOnce(probe, makeInput());
      if (result.snapshot.onGround) {
        landingFrame = frame;
        break;
      }
    }
    expect(landingFrame).toBeGreaterThan(0);

    const withinWindow = createPlayer(world, 124, startY);
    // The buffered jump resolves on the first update after the landing step, so the
    // "4 frames early" Celeste window appears as 3 frames before the first grounded snapshot.
    const pressFrame = Math.max(0, landingFrame - 3);
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

    const afterWindow = createPlayer(world, 124, startY);
    const latePressFrame = Math.max(0, landingFrame - 4);
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

  test("jump buffer is cleared when jump is released before it becomes usable", () => {
    const specs: LevelEntitySpec[] = [];
    withFloor(specs, 20);
    const world = buildWorld(specs);
    const startY = 20 * WORLD.tile - 80;

    const probe = createPlayer(world, 124, startY);
    let landingFrame = -1;
    for (let frame = 0; frame < 120; frame++) {
      const result = stepOnce(probe, makeInput());
      if (result.snapshot.onGround) {
        landingFrame = frame;
        break;
      }
    }
    expect(landingFrame).toBeGreaterThan(0);

    const player = createPlayer(world, 124, startY);
    const pressFrame = landingFrame - 5;
    let bufferedJump = false;
    for (let frame = 0; frame < 120; frame++) {
      const result = stepOnce(player, makeInput({
        jump: frame === pressFrame,
        jumpPressed: frame === pressFrame,
      }));
      if (result.effects.some((effect) => effect.type === "jump")) {
        bufferedJump = true;
        break;
      }
    }

    expect(bufferedJump).toBeFalse();
  });

  test("dash buffer is cleared when dash is released before dashing becomes possible", () => {
    const specs: LevelEntitySpec[] = [];
    withFloor(specs, 20);
    const world = buildWorld(specs);
    const player = createPlayerOnFloor(world, 104, 20);
    (player as unknown as { dashCooldownTimer: number }).dashCooldownTimer = 0.02;

    stepOnce(player, makeInput({ dash: true, dashPressed: true }));
    stepOnce(player, makeInput());

    const released = stepOnce(player, makeInput());
    expect(released.snapshot.state).not.toBe("dash");

    const holding = createPlayerOnFloor(world, 104, 20);
    (holding as unknown as { dashCooldownTimer: number }).dashCooldownTimer = 0.02;

    stepOnce(holding, makeInput({ dash: true, dashPressed: true }));
    const bufferedDash = stepOnce(holding, makeInput({ dash: true }));
    expect(bufferedDash.snapshot.state).toBe("dash");
    expect(bufferedDash.effects.some((effect) => effect.type === "dash_begin")).toBeTrue();
  });

  test("fastfall raises max fall speed from 160 to 240", () => {
    const world = buildWorld([]);

    const normal = createPlayer(world, 124, 91);
    let normalMaxVy = -Infinity;
    for (let frame = 0; frame < 400; frame++) {
      const result = stepOnce(normal, makeInput());
      normalMaxVy = Math.max(normalMaxVy, result.snapshot.vy);
    }
    expect(normalMaxVy).toBeCloseTo(160, 5);

    const fastfall = createPlayer(world, 124, 91);
    let fastfallMaxVy = -Infinity;
    for (let frame = 0; frame < 400; frame++) {
      const result = stepOnce(fastfall, makeInput({ y: 1 }));
      fastfallMaxVy = Math.max(fastfallMaxVy, result.snapshot.vy);
    }
    expect(fastfallMaxVy).toBeCloseTo(240, 5);
  });
});
