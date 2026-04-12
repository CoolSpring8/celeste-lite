import { describe, expect, test } from "bun:test";
import { WORLD } from "../../src/constants.ts";
import { buildWorld, createPlayer, step, withFloor } from "../support/harness.ts";

describe("Player intro lifecycle", () => {
  test("respawn intro enters a dedicated state, faces inward, and ends with a pop effect", () => {
    const specs: Parameters<typeof buildWorld>[0] = [];
    withFloor(specs);
    const world = buildWorld(specs);
    const player = createPlayer(world, 300, 20 * WORLD.tile);

    player.reviveAt(300, 20 * WORLD.tile, {
      type: "respawn",
      sourceX: 260,
      sourceY: 120,
    });

    const start = player.getSnapshot();
    expect(start.state).toBe("intro_respawn");
    expect(start.inControl).toBe(false);
    expect(start.justRespawned).toBe(true);
    expect(start.facing).toBe(-1);
    expect(start.intro?.type).toBe("respawn");
    expect(start.intro?.offsetX).not.toBe(0);

    const frames = step(player, {
      x: 0,
      y: 0,
      aimX: 0,
      aimY: 0,
      jump: false,
      jumpPressed: false,
      jumpReleased: false,
      dash: false,
      dashPressed: false,
      grab: false,
    }, 36);

    const end = frames[frames.length - 1];
    expect(end.snapshot.state).toBe("normal");
    expect(end.snapshot.intro).toBeNull();
    expect(end.effects.some((effect) => effect.type === "respawn_pop")).toBe(true);
  });

  test("start intro stays separate from respawn and does not mark JustRespawned", () => {
    const specs: Parameters<typeof buildWorld>[0] = [];
    withFloor(specs);
    const world = buildWorld(specs);
    const player = createPlayer(world, 80, 20 * WORLD.tile);

    player.reviveAt(80, 20 * WORLD.tile, "start");

    const snapshot = player.getSnapshot();
    expect(snapshot.state).toBe("intro_start");
    expect(snapshot.intro?.type).toBe("start");
    expect(snapshot.justRespawned).toBe(false);
    expect(snapshot.facing).toBe(1);
  });

  test("intro type none revives directly into normal control without intro state", () => {
    const specs: Parameters<typeof buildWorld>[0] = [];
    withFloor(specs);
    const world = buildWorld(specs);
    const player = createPlayer(world, 80, 20 * WORLD.tile);

    player.reviveAt(80, 20 * WORLD.tile, "none");

    const snapshot = player.getSnapshot();
    expect(snapshot.state).toBe("normal");
    expect(snapshot.intro).toBeNull();
    expect(snapshot.inControl).toBe(true);
    expect(snapshot.justRespawned).toBe(false);
    expect(snapshot.facing).toBe(1);
  });
});
