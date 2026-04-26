import { describe, expect, test } from "bun:test";
import { DEFAULT_ASSIST_OPTIONS } from "../../src/assists.ts";
import { COLORS, PLAYER_CONFIG, PLAYER_GEOMETRY, WORLD } from "../../src/constants.ts";
import type { LevelEntitySpec } from "../../src/entities/types.ts";
import {
  buildWorld,
  createPlayer,
  createPlayerOnFloor,
  makeInput,
  step,
  stepOnce,
  withFloor,
} from "../support/harness.ts";

describe("Assist options", () => {
  test("infinite stamina keeps wall climbing from draining stamina", () => {
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

    player.setAssistOptions({
      ...DEFAULT_ASSIST_OPTIONS,
      infiniteStamina: true,
    });

    stepOnce(player, makeInput({ grab: true }));
    const results = step(player, makeInput({ grab: true, y: -1 }), 240);
    const final = results[results.length - 1].snapshot;

    expect(final.state).toBe("climb");
    expect(final.stamina).toBeCloseTo(PLAYER_CONFIG.climb.max, 5);
  });

  test("two air dashes grants two dashes until spent", () => {
    const world = buildWorld([]);
    const player = createPlayerOnFloor(world);

    player.setAssistOptions({
      ...DEFAULT_ASSIST_OPTIONS,
      airDashes: "two",
    });

    expect(player.getSnapshot().dashesLeft).toBe(2);
    const dash = stepOnce(player, makeInput({ x: 1, dashPressed: true }));

    expect(dash.snapshot.state).toBe("dash");
    expect(dash.snapshot.dashesLeft).toBe(1);
  });

  test("infinite air dashes spend through the normal dash path and then refill to pink hair", () => {
    const world = buildWorld([]);
    const player = createPlayerOnFloor(world);

    player.setAssistOptions({
      ...DEFAULT_ASSIST_OPTIONS,
      airDashes: "infinite",
    });

    expect(player.getSnapshot().hairColor).toBe(COLORS.playerTwoDash);

    const dash = stepOnce(player, makeInput({ x: 1, dashPressed: true }));

    expect(dash.snapshot.state).toBe("dash");
    expect(dash.snapshot.dashesLeft).toBe(1);
    expect(dash.snapshot.hairColor).toBe(COLORS.playerHairFlash);
    expect((player as unknown as { dashCooldownTimer: number }).dashCooldownTimer).toBeCloseTo(
      PLAYER_CONFIG.dash.cooldown,
      5,
    );

    const afterRefillCooldown = step(player, makeInput({ x: 1 }), 12).at(-1)!.snapshot;
    expect(afterRefillCooldown.dashesLeft).toBe(2);
    expect(afterRefillCooldown.hairColor).toBe(COLORS.playerTwoDash);
  });

  test("invincibility blocks ordinary deaths but allows forced retry deaths", () => {
    const world = buildWorld([]);
    const player = createPlayerOnFloor(world);

    player.setAssistOptions({
      ...DEFAULT_ASSIST_OPTIONS,
      invincibility: true,
    });

    expect(player.die({ x: 0, y: 0 })).toBeFalse();
    expect(player.die({ x: 0, y: 0 }, true)).toBeTrue();
  });
});
