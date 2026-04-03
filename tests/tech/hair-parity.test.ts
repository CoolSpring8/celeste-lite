import { describe, expect, test } from "bun:test";
import { COLORS, PLAYER_CONFIG, WORLD } from "../../src/constants.ts";
import { Player } from "../../src/player/Player.ts";
import {
  DT,
  buildWorld,
  createPlayerOnFloor,
  makeInput,
  step,
  stepOnce,
  withFloor,
} from "./harness.ts";

function lerpColor(from: number, to: number, t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  const fromR = (from >> 16) & 0xff;
  const fromG = (from >> 8) & 0xff;
  const fromB = from & 0xff;
  const toR = (to >> 16) & 0xff;
  const toG = (to >> 8) & 0xff;
  const toB = to & 0xff;
  const r = Math.round(fromR + (toR - fromR) * clamped);
  const g = Math.round(fromG + (toG - fromG) * clamped);
  const b = Math.round(fromB + (toB - fromB) * clamped);
  return (r << 16) | (g << 8) | b;
}

function createDashPlayer(maxDashes: number, y = 20 * WORLD.tile): Player {
  const cfg = {
    ...PLAYER_CONFIG,
    dash: {
      ...PLAYER_CONFIG.dash,
      maxDashes,
    },
  };
  return new Player(104, y, buildWorld([]), cfg);
}

describe("Hair parity", () => {
  test("one-dash spend skips white and lerps toward used blue", () => {
    const specs = [];
    withFloor(specs, 20);
    const world = buildWorld(specs);
    const player = createPlayerOnFloor(world, 104, 20);

    expect(stepOnce(player, makeInput()).snapshot.hairColor).toBe(COLORS.playerOneDash);

    const dash = stepOnce(player, makeInput({ x: 1, dashPressed: true }));
    expect(dash.snapshot.dashesLeft).toBe(0);
    expect(dash.snapshot.hairColor).toBe(lerpColor(COLORS.playerOneDash, COLORS.playerNoDash, 6 * DT));
    expect(dash.snapshot.hairColor).not.toBe(COLORS.playerHairFlash);
    expect(dash.effects.find((effect) => effect.type === "dash_begin")?.dashColor).toBe(COLORS.playerNoDash);
  });

  test("two-dash air dash flashes white, keeps the flash through freeze, then settles auburn", () => {
    const world = buildWorld([]);
    const cfg = {
      ...PLAYER_CONFIG,
      dash: {
        ...PLAYER_CONFIG.dash,
        maxDashes: 2,
      },
    };
    const player = new Player(104, 40, world, cfg);

    expect(stepOnce(player, makeInput()).snapshot.hairColor).toBe(COLORS.playerTwoDash);

    const dash = stepOnce(player, makeInput({ x: 1, dashPressed: true }));
    expect(dash.snapshot.dashesLeft).toBe(1);
    expect(dash.snapshot.hairColor).toBe(COLORS.playerHairFlash);
    expect(dash.effects.find((effect) => effect.type === "dash_begin")?.dashColor).toBe(COLORS.playerOneDash);

    for (let frame = 0; frame < 3; frame++) {
      const frozen = stepOnce(player, makeInput({ x: 1 }));
      expect(frozen.snapshot.hairColor).toBe(COLORS.playerHairFlash);
    }

    let settled = false;
    for (let frame = 0; frame < 20; frame++) {
      const result = stepOnce(player, makeInput({ x: 1 }));
      if (result.snapshot.hairColor === COLORS.playerOneDash) {
        settled = true;
        break;
      }
    }

    expect(settled).toBeTrue();
  });

  test("refill updates hair immediately instead of waiting for the next player tick", () => {
    const player = createDashPlayer(2, 40);

    expect(stepOnce(player, makeInput()).snapshot.hairColor).toBe(COLORS.playerTwoDash);

    stepOnce(player, makeInput({ x: 1, dashPressed: true }));
    step(player, makeInput({ x: 1 }), 30);
    const spent = stepOnce(player, makeInput({ x: 1, dashPressed: true }));

    expect(spent.snapshot.dashesLeft).toBe(0);
    expect(player.tryRefill("max")).toBeTrue();
    expect(player.getSnapshot().dashesLeft).toBe(2);
    expect(player.getSnapshot().hairColor).toBe(COLORS.playerHairFlash);
  });

  test("dash counts above two fall back to canonical auburn instead of a custom green", () => {
    const player = createDashPlayer(3, 40);
    expect(player.getSnapshot().hairColor).toBe(COLORS.playerOneDash);
  });
});
