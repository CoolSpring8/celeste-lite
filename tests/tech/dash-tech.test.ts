import { describe, expect, test } from "bun:test";
import { PLAYER_GEOMETRY, PLAYER_CONFIG, WORLD } from "../../src/constants.ts";
import type { LevelEntitySpec } from "../../src/entities/types.ts";
import {
  buildWorld,
  createPlayer,
  createPlayerOnFloor,
  makeInput,
  step,
  stepOnce,
  withFloor,
} from "./harness.ts";

describe("Dash tech", () => {
  test("dash enters state immediately and commits direction on the 5th frame from press", () => {
    const specs: LevelEntitySpec[] = [];
    withFloor(specs, 20);
    const world = buildWorld(specs);
    const player = createPlayerOnFloor(world, 100, 20);

    stepOnce(player, makeInput());
    const press = stepOnce(player, makeInput({ x: -1, dashPressed: true }));
    expect(press.snapshot.state).toBe("dash");
    expect(press.snapshot.vx).toBe(0);
    expect(press.effects.some((effect) => effect.type === "dash_start")).toBeFalse();

    for (let frame = 0; frame < 4; frame++) {
      const startup = stepOnce(player, makeInput({ x: 1 }));
      expect(startup.snapshot.state).toBe("dash");
      expect(startup.snapshot.vx).toBe(0);
      expect(startup.effects.some((effect) => effect.type === "dash_start")).toBeFalse();
    }

    const commit = stepOnce(player, makeInput({ x: 1 }));
    const dashStart = commit.effects.find((effect) => effect.type === "dash_start");
    expect(dashStart).toBeTruthy();
    expect(dashStart?.dirX).toBeGreaterThan(0);
    expect(commit.snapshot.vx).toBeGreaterThan(0);
  });

  test("superdash gives 260 horizontal speed and full jump height", () => {
    const specs: LevelEntitySpec[] = [];
    withFloor(specs, 20);
    const world = buildWorld(specs);
    const player = createPlayerOnFloor(world, 100, 20);

    stepOnce(player, makeInput());
    stepOnce(player, makeInput({ x: 1, dashPressed: true }));
    stepOnce(player, makeInput({ x: 1 }));
    stepOnce(player, makeInput({ x: 1 }));
    const jump = stepOnce(player, makeInput({ x: 1, jump: true, jumpPressed: true }));

    expect(jump.effects.some((effect) => effect.type === "super")).toBeTrue();
    expect(jump.snapshot.vx).toBeCloseTo(260, 5);
    expect(jump.snapshot.vy).toBeCloseTo(-105, 5);
  });

  test("hyperdash gives 325 horizontal speed and half jump height", () => {
    const specs: LevelEntitySpec[] = [];
    withFloor(specs, 20);
    const world = buildWorld(specs);
    const player = createPlayerOnFloor(world, 100, 20);

    stepOnce(player, makeInput());
    stepOnce(player, makeInput({ x: 1, y: 1, dashPressed: true }));
    stepOnce(player, makeInput({ x: 1, y: 1 }));
    stepOnce(player, makeInput({ x: 1, y: 1 }));
    stepOnce(player, makeInput({ x: 1, y: 1 }));
    stepOnce(player, makeInput({ x: 1, y: 1 }));
    stepOnce(player, makeInput({ x: 1, y: 1 }));
    const jump = stepOnce(player, makeInput({ x: 1, y: 1, jump: true, jumpPressed: true }));

    expect(jump.effects.some((effect) => effect.type === "hyper")).toBeTrue();
    expect(jump.snapshot.vx).toBeCloseTo(325, 5);
    expect(jump.snapshot.vy).toBeCloseTo(-52.5, 5);
  });

  test("wavedash produces hyper values and restores the dash when extended", () => {
    const specs: LevelEntitySpec[] = [];
    withFloor(specs, 20);
    const world = buildWorld(specs);
    const player = createPlayer(
      world,
      100,
      20 * WORLD.tile - PLAYER_GEOMETRY.hitboxH - 24,
    );

    stepOnce(player, makeInput());
    stepOnce(player, makeInput({ x: 1, y: 1, dashPressed: true }));

    let wavedash = null as ReturnType<typeof player.getSnapshot> | null;
    let extended = false;
    for (let frame = 0; frame < 30; frame++) {
      const jumpHeld = frame >= 7;
      const result = stepOnce(player, makeInput({
        x: 1,
        y: 1,
        jump: jumpHeld,
        jumpPressed: frame === 7,
      }));
      const fx = result.effects.find((effect) => effect.type === "wavedash");
      if (fx) {
        wavedash = result.snapshot;
        extended = !!fx.extended;
        break;
      }
    }

    expect(wavedash).toBeTruthy();
    expect(wavedash!.vx).toBeCloseTo(325, 5);
    expect(wavedash!.vy).toBeCloseTo(-52.5, 5);
    expect(extended).toBeTrue();
    expect(wavedash!.dashesLeft).toBe(1);
  });

  test("reverse super and reverse hyper are detected", () => {
    const specs: LevelEntitySpec[] = [];
    withFloor(specs, 20);
    const world = buildWorld(specs);

    const reverseSuper = createPlayerOnFloor(world, 200, 20);
    stepOnce(reverseSuper, makeInput());
    stepOnce(reverseSuper, makeInput({ x: -1, dashPressed: true }));
    stepOnce(reverseSuper, makeInput({ x: -1 }));
    stepOnce(reverseSuper, makeInput({ x: -1 }));
    stepOnce(reverseSuper, makeInput({ x: -1 }));
    stepOnce(reverseSuper, makeInput({ x: -1 }));
    stepOnce(reverseSuper, makeInput({ x: -1 }));
    const superJump = stepOnce(reverseSuper, makeInput({ x: 1, jump: true, jumpPressed: true }));
    const superFx = superJump.effects.find((effect) => effect.type === "super");

    expect(superFx?.reverse).toBeTrue();
    expect(superJump.snapshot.vx).toBeCloseTo(260, 5);

    const reverseHyper = createPlayerOnFloor(world, 240, 20);
    stepOnce(reverseHyper, makeInput());
    stepOnce(reverseHyper, makeInput({ x: -1, y: 1, dashPressed: true }));
    stepOnce(reverseHyper, makeInput({ x: -1, y: 1 }));
    stepOnce(reverseHyper, makeInput({ x: -1, y: 1 }));
    stepOnce(reverseHyper, makeInput({ x: -1, y: 1 }));
    stepOnce(reverseHyper, makeInput({ x: -1, y: 1 }));
    stepOnce(reverseHyper, makeInput({ x: -1, y: 1 }));
    const hyperJump = stepOnce(reverseHyper, makeInput({ x: 1, y: 1, jump: true, jumpPressed: true }));
    const hyperFx = hyperJump.effects.find((effect) => effect.type === "hyper");

    expect(hyperFx?.reverse).toBeTrue();
    expect(hyperJump.snapshot.vx).toBeCloseTo(325, 5);
  });

  test("extended super regains the dash after the refill cooldown passes", () => {
    const specs: LevelEntitySpec[] = [];
    withFloor(specs, 20);
    const world = buildWorld(specs);
    const player = createPlayerOnFloor(world, 100, 20);

    stepOnce(player, makeInput());
    stepOnce(player, makeInput({ x: 1, dashPressed: true }));

    let extended = false;
    for (let frame = 0; frame < 25; frame++) {
      const result = stepOnce(player, makeInput({
        x: 1,
        jump: frame === 7,
        jumpPressed: frame === 7,
      }));
      const fx = result.effects.find((effect) => effect.type === "super");
      if (fx) {
        extended = !!fx.extended;
        expect(result.snapshot.dashesLeft).toBe(1);
        break;
      }
    }

    expect(extended).toBeTrue();
  });

  test("grounded ultra reaches 390 speed", () => {
    const specs: LevelEntitySpec[] = [];
    withFloor(specs, 20);
    const world = buildWorld(specs);
    const player = createPlayerOnFloor(world, 120, 20);
    player.vx = 325;
    player.dashesLeft = 1;

    stepOnce(player, makeInput({ x: 1, y: 1, dashPressed: true }));
    stepOnce(player, makeInput({ x: 1, y: 1 }));
    stepOnce(player, makeInput({ x: 1, y: 1 }));
    stepOnce(player, makeInput({ x: 1, y: 1 }));
    stepOnce(player, makeInput({ x: 1, y: 1 }));
    const slide = stepOnce(player, makeInput({ x: 1, y: 1 }));

    expect(slide.snapshot.vx).toBeCloseTo(390, 5);
  });

  test("delayed ultra applies on landing after the dash state has already ended", () => {
    const specs: LevelEntitySpec[] = [];
    withFloor(specs, 20);
    const world = buildWorld(specs);
    const player = createPlayer(world, 120, 260);
    player.vx = 325;
    player.vy = 0;
    player.dashesLeft = 1;

    stepOnce(player, makeInput({ x: 1, y: 1, dashPressed: true }));

    let delayedUltra = null as ReturnType<typeof player.getSnapshot> | null;
    for (let frame = 0; frame < 80; frame++) {
      const result = stepOnce(player, makeInput({ x: 1, y: 1 }));
      if (result.effects.some((effect) => effect.type === "ultra")) {
        delayedUltra = result.snapshot;
        break;
      }
    }

    expect(delayedUltra).toBeTruthy();
    expect(delayedUltra!.state).not.toBe("dash");
    expect(delayedUltra!.vx).toBeGreaterThan(330);
  });

  test("wallbounce gives super walljump values (170, -160)", () => {
    const specs: LevelEntitySpec[] = [];
    withFloor(specs, 20);
    for (let row = 10; row <= 20; row++) {
      specs.push({ kind: "solidTile", col: 15, row });
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
    expect(Math.abs(wallbounce.snapshot.vx)).toBeCloseTo(170, 5);
    expect(wallbounce.snapshot.vy).toBeCloseTo(-160, 5);
  });

  test("reference dash constants stay aligned with the Celeste player source", () => {
    expect(PLAYER_CONFIG.dash.speed).toBe(240);
    expect(PLAYER_CONFIG.dash.endSpeed).toBe(160);
    expect(PLAYER_CONFIG.dash.duration).toBe(0.15);
    expect(PLAYER_CONFIG.dash.freezeTime).toBe(0.05);
    expect(PLAYER_CONFIG.dash.cooldown).toBe(0.2);
    expect(PLAYER_CONFIG.dash.refillCooldown).toBe(0.1);
    expect(PLAYER_CONFIG.dash.attackTime).toBe(0.3);
  });
});
