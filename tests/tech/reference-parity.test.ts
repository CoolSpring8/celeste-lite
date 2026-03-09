import { describe, expect, test } from "bun:test";
import { PLAYER_CONFIG } from "../../src/constants.ts";

describe("Reference parity constants", () => {
  test("movement and jump constants match Player.Celeste.reference.cs", () => {
    expect(PLAYER_CONFIG.movement.upwardCornerCorrection).toBe(4);
    expect(PLAYER_CONFIG.movement.dashCornerCorrection).toBe(4);
    expect(PLAYER_CONFIG.movement.wallSpeedRetentionTime).toBe(0.06);
    expect(PLAYER_CONFIG.gravity.maxFall).toBe(160);
    expect(PLAYER_CONFIG.gravity.fastMaxFall).toBe(240);
    expect(PLAYER_CONFIG.jump.graceTime).toBe(0.1);
    expect(PLAYER_CONFIG.jump.speed).toBe(-105);
    expect(PLAYER_CONFIG.jump.hBoost).toBe(40);
    expect(PLAYER_CONFIG.jump.superJumpH).toBe(260);
    expect(PLAYER_CONFIG.jump.duckSuperJumpXMult).toBe(1.25);
    expect(PLAYER_CONFIG.jump.duckSuperJumpYMult).toBe(0.5);
    expect(PLAYER_CONFIG.jump.wallJumpHSpeed).toBe(130);
    expect(PLAYER_CONFIG.jump.superWallJumpH).toBe(170);
    expect(PLAYER_CONFIG.jump.superWallJumpSpeed).toBe(-160);
    expect(PLAYER_CONFIG.climb.climbHopY).toBe(-120);
    expect(PLAYER_CONFIG.climb.climbHopX).toBe(100);
    expect(PLAYER_CONFIG.climb.climbJumpBoostTime).toBe(0.2);
    expect(PLAYER_CONFIG.lift.maxBoostX).toBe(250);
    expect(PLAYER_CONFIG.lift.maxBoostY).toBe(130);
  });
});
