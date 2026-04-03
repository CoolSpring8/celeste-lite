import { SPIKE_HITBOX_THICKNESS, SPIKE_RENDER_HEIGHT, WORLD } from "../constants";
import { Entity } from "./core/Entity";
import { Grid } from "./core/Grid";
import { Hitbox } from "./core/Hitbox";
import type { Aabb, CameraLockMode, RefillType, SpikeDirection } from "./types";

const REFILL_SIZE = 8;

function spikeHitbox(dir: SpikeDirection): Hitbox {
  switch (dir) {
    case "up":
      return new Hitbox(
        WORLD.tile,
        SPIKE_HITBOX_THICKNESS,
        0,
        WORLD.tile - SPIKE_RENDER_HEIGHT,
      );
    case "down":
      return new Hitbox(WORLD.tile, SPIKE_HITBOX_THICKNESS);
    case "left":
      return new Hitbox(
        SPIKE_HITBOX_THICKNESS,
        WORLD.tile,
        WORLD.tile - SPIKE_RENDER_HEIGHT,
        0,
      );
    case "right":
    default:
      return new Hitbox(SPIKE_HITBOX_THICKNESS, WORLD.tile);
  }
}

export abstract class WorldEntity extends Entity {
  readonly id: number;

  protected constructor(id: number, x = 0, y = 0) {
    super(x, y);
    this.id = id;
  }
}

export class CameraControllerEntity extends WorldEntity {
  readonly kind = "cameraController";
  offsetX = 0;
  offsetY = 0;
  anchorX = 0;
  anchorY = 0;
  anchorLerpX = 0;
  anchorLerpY = 0;
  anchorIgnoreX = false;
  anchorIgnoreY = false;
  lockMode: CameraLockMode = "none";
  upwardMaxY = Number.POSITIVE_INFINITY;

  constructor(id: number) {
    super(id, 0, 0);
    this.collidable = false;
  }
}

export class CameraKillboxEntity extends WorldEntity {
  readonly kind = "cameraKillbox";
  active = true;

  constructor(id: number, x: number, y: number, w: number, h: number, active = true) {
    super(id, x, y);
    this.active = active;
    this.collidable = active;
    this.collider = new Hitbox(w, h);
  }

  get bounds(): Aabb {
    return this.collider?.bounds ?? { x: this.x, y: this.y, w: 0, h: 0 };
  }
}

export class SolidTilesEntity extends WorldEntity {
  readonly kind = "solidGrid";
  readonly grid: Grid;

  constructor(id: number, cols: number, rows: number) {
    super(id, 0, 0);
    this.grid = new Grid(cols, rows, WORLD.tile, WORLD.tile);
    this.collider = this.grid;
  }
}

export class JumpThruTilesEntity extends WorldEntity {
  readonly kind = "jumpThruGrid";
  readonly grid: Grid;

  constructor(id: number, cols: number, rows: number) {
    super(id, 0, 0);
    this.grid = new Grid(cols, rows, WORLD.tile, WORLD.tile);
    this.collider = this.grid;
  }
}

export class RefillPickupEntity extends WorldEntity {
  readonly kind = "refill";
  readonly type: RefillType;
  active = true;
  baseY: number;
  respawnTimer = 0;
  respawnDelay: number;

  constructor(id: number, x: number, y: number, type: RefillType, respawnDelay: number) {
    super(id, x, y);
    this.type = type;
    this.baseY = y;
    this.respawnDelay = respawnDelay;
    this.collider = new Hitbox(REFILL_SIZE, REFILL_SIZE, -REFILL_SIZE / 2, -REFILL_SIZE / 2);
  }

  get bounds(): Aabb {
    return this.collider?.bounds ?? {
      x: this.x - REFILL_SIZE / 2,
      y: this.y - REFILL_SIZE / 2,
      w: REFILL_SIZE,
      h: REFILL_SIZE,
    };
  }
}

export class SpikeHazardEntity extends WorldEntity {
  readonly kind = "spike";
  readonly dir: SpikeDirection;

  constructor(id: number, x: number, y: number, dir: SpikeDirection) {
    super(id, x, y);
    this.dir = dir;
    this.collider = spikeHitbox(dir);
  }
}
