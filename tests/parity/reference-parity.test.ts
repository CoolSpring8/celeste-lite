import { describe, expect, test } from "bun:test";
import { PLAYER_CONFIG } from "../../src/constants.ts";

describe("Reference parity constants", () => {
  test("movement and jump constants match Player.Celeste.reference.cs", () => {
    expect(PLAYER_CONFIG.movement.walkSpeed).toBe(64);
    expect(PLAYER_CONFIG.movement.maxRun).toBe(90);
    expect(PLAYER_CONFIG.movement.runAccel).toBe(1000);
    expect(PLAYER_CONFIG.movement.runReduce).toBe(400);
    expect(PLAYER_CONFIG.movement.airMult).toBe(0.65);
    expect(PLAYER_CONFIG.movement.duckFriction).toBe(500);
    expect(PLAYER_CONFIG.movement.upwardCornerCorrection).toBe(4);
    expect(PLAYER_CONFIG.movement.dashCornerCorrection).toBe(4);
    expect(PLAYER_CONFIG.movement.duckCorrectCheck).toBe(4);
    expect(PLAYER_CONFIG.movement.duckCorrectSlide).toBe(50);
    expect(PLAYER_CONFIG.movement.wallSpeedRetentionTime).toBe(0.06);

    expect(PLAYER_CONFIG.gravity.normal).toBe(900);
    expect(PLAYER_CONFIG.gravity.halfGravThreshold).toBe(40);
    expect(PLAYER_CONFIG.gravity.maxFall).toBe(160);
    expect(PLAYER_CONFIG.gravity.fastMaxFall).toBe(240);
    expect(PLAYER_CONFIG.gravity.fastMaxAccel).toBe(300);
    expect(PLAYER_CONFIG.gravity.wallSlideStartMax).toBe(20);
    expect(PLAYER_CONFIG.gravity.wallSlideTime).toBe(1.2);

    expect(PLAYER_CONFIG.jump.graceTime).toBe(0.1);
    expect(PLAYER_CONFIG.jump.speed).toBe(-105);
    expect(PLAYER_CONFIG.jump.hBoost).toBe(40);
    expect(PLAYER_CONFIG.jump.varTime).toBe(0.2);
    expect(PLAYER_CONFIG.jump.ceilingVarJumpGrace).toBe(0.05);
    expect(PLAYER_CONFIG.jump.jumpThruAssistSpeed).toBe(-40);
    expect(PLAYER_CONFIG.jump.wallJumpCheckDist).toBe(3);
    expect(PLAYER_CONFIG.jump.wallJumpForceTime).toBe(0.16);
    expect(PLAYER_CONFIG.jump.superJumpH).toBe(260);
    expect(PLAYER_CONFIG.jump.duckSuperJumpXMult).toBe(1.25);
    expect(PLAYER_CONFIG.jump.duckSuperJumpYMult).toBe(0.5);
    expect(PLAYER_CONFIG.jump.wallJumpHSpeed).toBe(130);
    expect(PLAYER_CONFIG.jump.superWallJumpH).toBe(170);
    expect(PLAYER_CONFIG.jump.superWallJumpSpeed).toBe(-160);
    expect(PLAYER_CONFIG.jump.superWallJumpVarTime).toBe(0.25);

    expect(PLAYER_CONFIG.climb.max).toBe(110);
    expect(PLAYER_CONFIG.climb.tiredThreshold).toBe(20);
    expect(PLAYER_CONFIG.climb.upCost).toBeCloseTo(100 / 2.2, 6);
    expect(PLAYER_CONFIG.climb.stillCost).toBe(10);
    expect(PLAYER_CONFIG.climb.jumpCost).toBe(27.5);
    expect(PLAYER_CONFIG.climb.checkDist).toBe(2);
    expect(PLAYER_CONFIG.climb.upCheckDist).toBe(2);
    expect(PLAYER_CONFIG.climb.noMoveTime).toBe(0.1);
    expect(PLAYER_CONFIG.climb.climbUpSpeed).toBe(-45);
    expect(PLAYER_CONFIG.climb.climbDownSpeed).toBe(80);
    expect(PLAYER_CONFIG.climb.climbSlipSpeed).toBe(30);
    expect(PLAYER_CONFIG.climb.climbAccel).toBe(900);
    expect(PLAYER_CONFIG.climb.climbGrabYMult).toBe(0.2);
    expect(PLAYER_CONFIG.climb.climbHopY).toBe(-120);
    expect(PLAYER_CONFIG.climb.climbHopX).toBe(100);
    expect(PLAYER_CONFIG.climb.climbHopForceTime).toBe(0.2);
    expect(PLAYER_CONFIG.climb.climbJumpBoostTime).toBe(0.2);

    expect(PLAYER_CONFIG.dash.speed).toBe(240);
    expect(PLAYER_CONFIG.dash.endSpeed).toBe(160);
    expect(PLAYER_CONFIG.dash.endDashUpMult).toBe(0.75);
    expect(PLAYER_CONFIG.dash.duration).toBe(0.15);
    expect(PLAYER_CONFIG.dash.freezeTime).toBe(0.05);
    expect(PLAYER_CONFIG.dash.cooldown).toBe(0.2);
    expect(PLAYER_CONFIG.dash.refillCooldown).toBe(0.1);
    expect(PLAYER_CONFIG.dash.hJumpThruNudge).toBe(6);
    expect(PLAYER_CONFIG.dash.floorSnapDist).toBe(3);
    expect(PLAYER_CONFIG.dash.attackTime).toBe(0.3);
    expect(PLAYER_CONFIG.dash.dodgeSlideSpeedMult).toBe(1.2);

    expect(PLAYER_CONFIG.lift.maxBoostX).toBe(250);
    expect(PLAYER_CONFIG.lift.maxBoostY).toBe(130);
  });
});
