import { describe, expect, test } from "bun:test";
import { PLAYER_CONFIG } from "../../src/constants.ts";
import { buildWorld, createPlayer, DT, makeInput } from "../support/harness.ts";

describe("Refill entity", () => {
  test("consuming a refill contributes a 0.05s scene freeze", () => {
    const world = buildWorld([
      { kind: "refill", x: 96, y: 89.5, type: "max" },
    ]);
    const player = createPlayer(world, 96, 95);
    (player as unknown as { stamina: number }).stamina = 0;

    world.update(DT, 0.5);
    player.update(DT, makeInput());
    let freeze = player.consumeFreezeRequest();
    const consumed = world.consumeTouchingRefills(player.getPlayerColliderBounds(), (target) => player.tryRefill(target));
    if (consumed.length > 0) {
      freeze = Math.max(freeze, PLAYER_CONFIG.dash.freezeTime);
    }

    expect(consumed).toHaveLength(1);
    expect(freeze).toBe(PLAYER_CONFIG.dash.freezeTime);
  });

  test("refill pickup uses the player hurtbox instead of the body hitbox", () => {
    const hitboxWorld = buildWorld([
      { kind: "refill", x: 96, y: 96, type: "max" },
    ]);
    const hitboxPlayer = createPlayer(hitboxWorld, 96, 95);

    expect(hitboxWorld.consumeTouchingRefills(hitboxPlayer.getHitboxBounds(), () => true)).toHaveLength(1);

    const hurtboxWorld = buildWorld([
      { kind: "refill", x: 96, y: 96, type: "max" },
    ]);
    const hurtboxPlayer = createPlayer(hurtboxWorld, 96, 95);

    expect(hurtboxWorld.consumeTouchingRefills(hurtboxPlayer.getPlayerColliderBounds(), () => true)).toHaveLength(0);
  });
});
