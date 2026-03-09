import { describe, expect, test } from "bun:test";
import { PLAYER_GEOMETRY, WORLD } from "../../src/constants.ts";
import type { LevelEntitySpec } from "../../src/entities/types.ts";
import { buildWorld, createPlayer, makeInput, stepOnce, withFloor } from "./harness.ts";

describe("Hazards", () => {
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

  test("spiked wallbounce is survivable when the wallbounce moves away from the spikes", () => {
    const specs: LevelEntitySpec[] = [];
    withFloor(specs, 20);
    for (let row = 10; row <= 20; row++) {
      specs.push({ kind: "solidTile", col: 15, row });
      specs.push({ kind: "spike", col: 15, row, dir: "right" });
    }
    const world = buildWorld(specs);
    const player = createPlayer(
      world,
      15 * WORLD.tile - PLAYER_GEOMETRY.hitboxW - 1,
      20 * WORLD.tile - PLAYER_GEOMETRY.hitboxH,
    );

    stepOnce(player, makeInput());
    stepOnce(player, makeInput({ y: -1, dashPressed: true }));
    stepOnce(player, makeInput({ y: -1 }));
    stepOnce(player, makeInput({ y: -1 }));
    stepOnce(player, makeInput({ y: -1 }));
    stepOnce(player, makeInput({ y: -1 }));
    stepOnce(player, makeInput({ y: -1 }));
    const wallbounce = stepOnce(player, makeInput({ x: 1, y: -1, jump: true, jumpPressed: true }));

    expect(wallbounce.effects.some((effect) => effect.type === "wall_jump")).toBeTrue();
    expect(world.collidesWithSpike(player.getHurtboxBounds(), wallbounce.snapshot.vx, wallbounce.snapshot.vy)).toBeNull();
  });
});
