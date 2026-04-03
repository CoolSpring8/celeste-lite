import { WORLD } from "../constants";
import { SolidGrid, TILE_EMPTY, TILE_JUMP_THROUGH, TILE_SOLID } from "../grid";
import { CollisionWorld, GroundProbe } from "./CollisionWorld";
import { Collider } from "./core/Collider";
import { Entity, type EntityType } from "./core/Entity";
import { Tracker } from "./core/Tracker";
import {
  JumpThruTilesEntity,
  RefillPickupEntity,
  SolidTilesEntity,
  SpikeHazardEntity,
  WorldEntity,
} from "./runtime";
import {
  Aabb,
  LevelEntitySpec,
  SpikeDirection,
} from "./types";

const REFILL_PICKUP_SIZE = Math.max(6, Math.round(WORLD.tile * 0.75));
const REFILL_RESPAWN_TIME = 2.5;
const REFILL_BOB_AMPLITUDE = WORLD.tile * 0.1;
const SPIKE_SIZE = WORLD.tile;
const SPIKE_HEIGHT = Math.max(5, Math.round(WORLD.tile * 0.625));
const SPIKE_EPSILON = 0.0001;

type CollisionTarget = Entity | Collider | Aabb;

export class EntityWorld implements SolidGrid, CollisionWorld {
  readonly cols: number;
  readonly rows: number;
  readonly data: Uint8Array;

  readonly tracker = new Tracker();
  readonly entities: WorldEntity[] = [];
  readonly solidTiles: SolidTilesEntity;
  readonly jumpThruTiles: JumpThruTilesEntity;

  private nextEntityId = 1;

  constructor(cols: number, rows: number, specs: LevelEntitySpec[]) {
    this.cols = cols;
    this.rows = rows;
    this.data = new Uint8Array(cols * rows);
    this.data.fill(TILE_EMPTY);

    this.solidTiles = this.addEntity(new SolidTilesEntity(this.nextId(), cols, rows));
    this.jumpThruTiles = this.addEntity(new JumpThruTilesEntity(this.nextId(), cols, rows));

    for (const spec of specs) {
      this.addSpec(spec);
    }
  }

  static fromSpecs(cols: number, rows: number, specs: LevelEntitySpec[]): EntityWorld {
    return new EntityWorld(cols, rows, specs);
  }

  get refills(): readonly RefillPickupEntity[] {
    return this.getEntities(RefillPickupEntity);
  }

  get spikes(): readonly SpikeHazardEntity[] {
    return this.getEntities(SpikeHazardEntity);
  }

  update(dt: number, timeSeconds: number): void {
    for (const refill of this.refills) {
      if (!refill.active) {
        refill.respawnTimer -= dt;
        if (refill.respawnTimer <= 0) {
          refill.respawnTimer = 0;
          refill.active = true;
        }
      }

      const bob = Math.sin(timeSeconds * 4 + refill.x * 0.05) * REFILL_BOB_AMPLITUDE;
      refill.y = refill.baseY + bob;
    }
  }

  resetTransientState(): void {
    for (const refill of this.refills) {
      refill.active = true;
      refill.respawnTimer = 0;
      refill.y = refill.baseY;
    }
  }

  collideSolidAt(x: number, y: number, w: number, h: number): boolean {
    return this.solidTiles.grid.collidesRectValues(x, y, w, h);
  }

  collideAt(
    x: number,
    y: number,
    w: number,
    h: number,
    fromY: number,
    movingDown: boolean,
  ): boolean {
    const left = Math.floor(x / WORLD.tile);
    const right = Math.floor((x + w - 1) / WORLD.tile);
    const top = Math.floor(y / WORLD.tile);
    const bottom = Math.floor((y + h - 1) / WORLD.tile);

    const beforeBottom = fromY + h;
    const afterBottom = y + h;

    for (let row = top; row <= bottom; row++) {
      for (let col = left; col <= right; col++) {
        const tile = this.tileAtCell(col, row);
        if (tile === TILE_SOLID) {
          return true;
        }

        if (!movingDown || tile !== TILE_JUMP_THROUGH) {
          continue;
        }

        const tileTop = row * WORLD.tile;
        const crossedTop = beforeBottom <= tileTop && afterBottom > tileTop;
        if (crossedTop) {
          return true;
        }
      }
    }

    return false;
  }

  wallDirAt(x: number, y: number, w: number, h: number): number {
    if (this.collideSolidAt(x - 1, y, w, h)) return -1;
    if (this.collideSolidAt(x + 1, y, w, h)) return 1;
    return 0;
  }

  probeGround(x: number, y: number, w: number, h: number): GroundProbe {
    const nextY = y + 1;
    const left = Math.floor(x / WORLD.tile);
    const right = Math.floor((x + w - 1) / WORLD.tile);
    const row = Math.floor((nextY + h - 1) / WORLD.tile);
    const beforeBottom = y + h;
    const afterBottom = nextY + h;

    let onJumpThrough = false;

    for (let col = left; col <= right; col++) {
      const tile = this.tileAtCell(col, row);
      if (tile === TILE_SOLID) {
        return { onGround: true, onJumpThrough: false };
      }

      if (tile !== TILE_JUMP_THROUGH) {
        continue;
      }

      const tileTop = row * WORLD.tile;
      const crossedTop = beforeBottom <= tileTop && afterBottom > tileTop;
      if (crossedTop) {
        onJumpThrough = true;
      }
    }

    return { onGround: onJumpThrough, onJumpThrough };
  }

  overlapsJumpThrough(x: number, y: number, w: number, h: number): boolean {
    return this.jumpThruTiles.grid.collidesRectValues(x, y, w, h);
  }

  wouldLandOnJumpThruAt(x: number, y: number, w: number, h: number, dist: number): boolean {
    const beforeBottom = y + h;
    const afterBottom = y + h + dist;
    const left = Math.floor(x / WORLD.tile);
    const right = Math.floor((x + w - 1) / WORLD.tile);
    const fromRow = Math.floor(beforeBottom / WORLD.tile);
    const toRow = Math.floor(afterBottom / WORLD.tile);

    for (let row = fromRow; row <= toRow; row++) {
      for (let col = left; col <= right; col++) {
        if (this.tileAtCell(col, row) !== TILE_JUMP_THROUGH) {
          continue;
        }

        const tileTop = row * WORLD.tile;
        if (beforeBottom <= tileTop && afterBottom > tileTop) {
          return true;
        }
      }
    }

    return false;
  }

  findJumpThruNudgeY(x: number, y: number, w: number, h: number, maxNudge: number): number | null {
    const left = Math.floor(x / WORLD.tile);
    const right = Math.floor((x + w - 1) / WORLD.tile);
    const top = Math.floor(y / WORLD.tile);
    const bottom = Math.floor((y + h - 1) / WORLD.tile);
    const bodyBottom = y + h;

    let bestY: number | null = null;

    for (let row = top; row <= bottom; row++) {
      for (let col = left; col <= right; col++) {
        if (this.tileAtCell(col, row) !== TILE_JUMP_THROUGH) {
          continue;
        }

        const tileTop = row * WORLD.tile;
        const penetration = bodyBottom - tileTop;
        if (penetration <= 0 || penetration > maxNudge) {
          continue;
        }

        const nudgeY = tileTop - h;
        if (nudgeY >= y) {
          continue;
        }

        if (bestY === null || nudgeY > bestY) {
          bestY = nudgeY;
        }
      }
    }

    return bestY;
  }

  consumeTouchingRefills(
    playerBounds: Aabb,
    tryConsume: (target: number | "max") => boolean,
  ): RefillPickupEntity[] {
    const consumed: RefillPickupEntity[] = [];

    for (const refill of this.refills) {
      if (!refill.active) {
        continue;
      }

      const size = REFILL_PICKUP_SIZE;
      const pickupBox = {
        x: refill.x - size * 0.5,
        y: refill.y - size * 0.5,
        w: size,
        h: size,
      };

      if (!this.overlapAabb(playerBounds, pickupBox)) {
        continue;
      }
      if (!tryConsume(refill.type)) {
        continue;
      }

      refill.active = false;
      refill.respawnTimer = refill.respawnDelay;
      consumed.push(refill);
    }

    return consumed;
  }

  collidesWithSpike(hurtbox: Aabb, vx = 0, vy = 0): SpikeHazardEntity | null {
    for (const spike of this.spikes) {
      if (this.isSafeFromSpike(spike, vx, vy)) {
        continue;
      }
      if (!spike.collider?.collidesRect(hurtbox)) {
        continue;
      }

      const probe = this.spikeProbeBounds(hurtbox, spike.dir);
      const danger = this.spikeDangerBounds(spike);
      if (this.overlapAabb(probe, danger)) {
        return spike;
      }
    }

    return null;
  }

  collidesWithSpikeAt(
    x: number,
    y: number,
    w: number,
    h: number,
    vx: number,
    vy: number,
  ): boolean {
    return this.collidesWithSpike({ x, y, w, h }, vx, vy) !== null;
  }

  getEntity<T extends Entity>(type: EntityType<T>): T | null {
    return this.tracker.getEntity(type);
  }

  getEntities<T extends Entity>(type: EntityType<T>): readonly T[] {
    return this.tracker.getEntities(type);
  }

  collideCheck<T extends WorldEntity>(type: EntityType<T>, target: CollisionTarget): boolean {
    return this.collideFirst(type, target) !== null;
  }

  collideFirst<T extends WorldEntity>(type: EntityType<T>, target: CollisionTarget): T | null {
    for (const entity of this.getEntities(type)) {
      if (!entity.collidable || entity.collider === null) {
        continue;
      }

      if (this.targetCollides(entity.collider, target)) {
        return entity;
      }
    }

    return null;
  }

  collideAll<T extends WorldEntity>(type: EntityType<T>, target: CollisionTarget): T[] {
    const hits: T[] = [];

    for (const entity of this.getEntities(type)) {
      if (!entity.collidable || entity.collider === null) {
        continue;
      }

      if (this.targetCollides(entity.collider, target)) {
        hits.push(entity);
      }
    }

    return hits;
  }

  private addSpec(spec: LevelEntitySpec): void {
    if (spec.kind === "solidTile" || spec.kind === "jumpThruTile") {
      this.addTile(spec.kind, spec.col, spec.row);
      return;
    }

    if (spec.kind === "refill") {
      this.addEntity(
        new RefillPickupEntity(
          this.nextId(),
          spec.x,
          spec.y,
          spec.type,
          REFILL_RESPAWN_TIME,
        ),
      );
      return;
    }

    this.addEntity(
      new SpikeHazardEntity(
        this.nextId(),
        spec.col * WORLD.tile,
        spec.row * WORLD.tile,
        spec.dir,
      ),
    );
  }

  private addTile(kind: "solidTile" | "jumpThruTile", col: number, row: number): void {
    const idx = row * this.cols + col;

    if (kind === "solidTile") {
      this.data[idx] = TILE_SOLID;
      this.solidTiles.grid.setCell(col, row, true);
      return;
    }

    this.data[idx] = TILE_JUMP_THROUGH;
    this.jumpThruTiles.grid.setCell(col, row, true);
  }

  private addEntity<T extends WorldEntity>(entity: T): T {
    this.entities.push(entity);
    this.tracker.track(entity);
    return entity;
  }

  private nextId(): number {
    const id = this.nextEntityId;
    this.nextEntityId++;
    return id;
  }

  private targetCollides(source: Collider, target: CollisionTarget): boolean {
    if (target instanceof Entity) {
      if (!target.collidable || target.collider === null) {
        return false;
      }

      return source.collides(target.collider);
    }

    if (target instanceof Collider) {
      return source.collides(target);
    }

    return source.collidesRect(target);
  }

  private tileAtCell(col: number, row: number): number {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) {
      return TILE_EMPTY;
    }
    return this.data[row * this.cols + col];
  }

  private spikeDangerBounds(spike: SpikeHazardEntity): Aabb {
    const h = Math.min(SPIKE_HEIGHT, WORLD.tile);
    switch (spike.dir) {
      case "up":
        return { x: spike.x, y: spike.y + WORLD.tile - h, w: WORLD.tile, h };
      case "down":
        return { x: spike.x, y: spike.y, w: WORLD.tile, h };
      case "left":
        return { x: spike.x + WORLD.tile - h, y: spike.y, w: h, h: WORLD.tile };
      case "right":
      default:
        return { x: spike.x, y: spike.y, w: h, h: WORLD.tile };
    }
  }

  private spikeProbeBounds(hurtbox: Aabb, dir: SpikeDirection): Aabb {
    switch (dir) {
      case "up":
        return { x: hurtbox.x, y: hurtbox.y + hurtbox.h - 1, w: hurtbox.w, h: 1 };
      case "down":
        return { x: hurtbox.x, y: hurtbox.y, w: hurtbox.w, h: 1 };
      case "left":
        return { x: hurtbox.x, y: hurtbox.y, w: 1, h: hurtbox.h };
      case "right":
      default:
        return { x: hurtbox.x + hurtbox.w - 1, y: hurtbox.y, w: 1, h: hurtbox.h };
    }
  }

  private isSafeFromSpike(spike: SpikeHazardEntity, vx: number, vy: number): boolean {
    switch (spike.dir) {
      case "up":
        return vy < -SPIKE_EPSILON;
      case "down":
        return vy > SPIKE_EPSILON;
      case "left":
        return vx < -SPIKE_EPSILON;
      case "right":
      default:
        return vx > SPIKE_EPSILON;
    }
  }

  private overlapAabb(a: Aabb, b: Aabb): boolean {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
}

export function spikeTrianglePoints(spike: SpikeHazardEntity): Array<{ x: number; y: number }> {
  const tris = spikeTriangles(spike);
  return tris[0];
}

export function spikeTriangles(
  spike: SpikeHazardEntity,
): Array<Array<{ x: number; y: number }>> {
  const x = spike.x;
  const y = spike.y;
  const s = SPIKE_SIZE;
  const half = s * 0.5;
  const quarter = s * 0.25;
  const h = SPIKE_HEIGHT;

  const dir: SpikeDirection = spike.dir;
  if (dir === "up") {
    return [
      [
        { x, y: y + s },
        { x: x + quarter, y: y + s - h },
        { x: x + half, y: y + s },
      ],
      [
        { x: x + half, y: y + s },
        { x: x + quarter * 3, y: y + s - h },
        { x: x + s, y: y + s },
      ],
    ];
  }

  if (dir === "down") {
    return [
      [
        { x, y },
        { x: x + quarter, y: y + h },
        { x: x + half, y },
      ],
      [
        { x: x + half, y },
        { x: x + quarter * 3, y: y + h },
        { x: x + s, y },
      ],
    ];
  }

  if (dir === "left") {
    return [
      [
        { x: x + s, y },
        { x: x + s - h, y: y + quarter },
        { x: x + s, y: y + half },
      ],
      [
        { x: x + s, y: y + half },
        { x: x + s - h, y: y + quarter * 3 },
        { x: x + s, y: y + s },
      ],
    ];
  }

  return [
    [
      { x, y },
      { x: x + h, y: y + quarter },
      { x, y: y + half },
    ],
    [
      { x, y: y + half },
      { x: x + h, y: y + quarter * 3 },
      { x, y: y + s },
    ],
  ];
}
