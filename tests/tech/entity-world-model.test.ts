import { describe, expect, test } from "bun:test";
import { WORLD } from "../../src/constants.ts";
import { Hitbox } from "../../src/entities/core/Hitbox.ts";
import { EntityWorld } from "../../src/entities/EntityWorld.ts";
import {
  CameraControllerEntity,
  CameraKillboxEntity,
  JumpThruTilesEntity,
  RefillPickupEntity,
  SolidTilesEntity,
  SpikeHazardEntity,
} from "../../src/entities/runtime.ts";
import type { LevelEntitySpec } from "../../src/entities/types.ts";

describe("EntityWorld Monocle model", () => {
  test("tracks world entities by runtime type", () => {
    const specs: LevelEntitySpec[] = [
      { kind: "solidTile", col: 2, row: 3 },
      { kind: "jumpThruTile", col: 4, row: 5 },
      { kind: "refill", x: 40, y: 50, type: 1 },
      { kind: "spike", col: 8, row: 9, dir: "up" },
    ];
    const world = EntityWorld.fromSpecs(WORLD.cols, WORLD.rows, specs);

    expect(world.getEntity(SolidTilesEntity)).not.toBeNull();
    expect(world.getEntity(JumpThruTilesEntity)).not.toBeNull();
    expect(world.getEntities(RefillPickupEntity)).toHaveLength(1);
    expect(world.getEntities(SpikeHazardEntity)).toHaveLength(1);
  });

  test("solid and jump-thru layers are backed by grid colliders", () => {
    const world = EntityWorld.fromSpecs(WORLD.cols, WORLD.rows, [
      { kind: "solidTile", col: 6, row: 7 },
      { kind: "jumpThruTile", col: 8, row: 9 },
    ]);

    const solid = world.getEntity(SolidTilesEntity);
    const jumpThru = world.getEntity(JumpThruTilesEntity);
    expect(solid).not.toBeNull();
    expect(jumpThru).not.toBeNull();

    expect(solid?.grid.getCell(6, 7)).toBeTrue();
    expect(jumpThru?.grid.getCell(8, 9)).toBeTrue();
    expect(world.collideSolidAt(6 * WORLD.tile, 7 * WORLD.tile, WORLD.tile, WORLD.tile)).toBeTrue();
    expect(world.overlapsJumpThrough(8 * WORLD.tile, 9 * WORLD.tile, WORLD.tile, WORLD.tile)).toBeTrue();
  });

  test("camera helpers are tracked through world entities", () => {
    const world = EntityWorld.fromSpecs(WORLD.cols, WORLD.rows, []);

    expect(world.getEntity(CameraControllerEntity)).toBe(world.cameraController);
    expect(world.getEntities(CameraKillboxEntity)).toHaveLength(0);

    world.setCameraKillboxes([
      { x: 8, y: 16, w: 24, h: 32 },
      { x: 48, y: 56, w: 16, h: 8, active: false },
    ]);

    const killboxes = world.getEntities(CameraKillboxEntity);
    expect(killboxes).toHaveLength(2);
    expect(killboxes[0]?.bounds).toEqual({ x: 8, y: 16, w: 24, h: 32 });
    expect(killboxes[1]?.active).toBeFalse();
    expect(killboxes[1]?.collidable).toBeFalse();

    world.clearCameraKillboxes();
    expect(world.getEntities(CameraKillboxEntity)).toHaveLength(0);
  });

  test("typed collision queries work against tracked hitbox entities", () => {
    const world = EntityWorld.fromSpecs(WORLD.cols, WORLD.rows, [
      { kind: "refill", x: 64, y: 72, type: "max" },
      { kind: "spike", col: 12, row: 10, dir: "right" },
    ]);

    const refillProbe = new Hitbox(8, 8, 60, 68);
    const spikeProbe = { x: 12 * WORLD.tile, y: 10 * WORLD.tile, w: WORLD.tile, h: WORLD.tile };

    expect(world.collideCheck(RefillPickupEntity, refillProbe)).toBeTrue();
    expect(world.collideFirst(SpikeHazardEntity, spikeProbe)).not.toBeNull();
    expect(world.collideAll(RefillPickupEntity, refillProbe)).toHaveLength(1);
  });
});
