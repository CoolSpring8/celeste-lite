import { WORLD } from "../constants";
import { Entity } from "./core/Entity";
import { Grid } from "./core/Grid";
import { Hitbox } from "./core/Hitbox";
import type { Aabb, RefillType, SpikeDirection } from "./types";

const REFILL_SIZE = 8;

export abstract class WorldEntity extends Entity {
  readonly id: number;

  protected constructor(id: number, x = 0, y = 0) {
    super(x, y);
    this.id = id;
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
    this.collider = new Hitbox(WORLD.tile, WORLD.tile);
  }
}
