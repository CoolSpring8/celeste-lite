import { WORLD } from "../constants";
import { SolidGrid, TILE_EMPTY, TILE_JUMP_THROUGH, TILE_SOLID } from "../grid";
import { CollisionWorld, GroundProbe } from "./CollisionWorld";
import {
  Aabb,
  JumpThruTileEntity,
  LevelEntitySpec,
  RefillEntity,
  SolidTileEntity,
  SpikeEntity,
  SpikeDirection,
  TileEntity,
  WorldEntity,
} from "./types";

const REFILL_PICKUP_SIZE = 12;
const REFILL_RESPAWN_TIME = 2.5;
const SPIKE_SIZE = WORLD.tile;
const SPIKE_HEIGHT = 10;
const SPIKE_EPSILON = 0.0001;

export class EntityWorld implements SolidGrid, CollisionWorld {
  readonly cols: number;
  readonly rows: number;
  readonly data: Uint8Array;

  readonly entities: WorldEntity[] = [];
  readonly tiles: TileEntity[] = [];
  readonly refills: RefillEntity[] = [];
  readonly spikes: SpikeEntity[] = [];

  private nextEntityId = 1;

  constructor(cols: number, rows: number, specs: LevelEntitySpec[]) {
    this.cols = cols;
    this.rows = rows;
    this.data = new Uint8Array(cols * rows);
    this.data.fill(TILE_EMPTY);

    for (const spec of specs) {
      this.addSpec(spec);
    }
  }

  static fromSpecs(cols: number, rows: number, specs: LevelEntitySpec[]): EntityWorld {
    return new EntityWorld(cols, rows, specs);
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

      const bob = Math.sin(timeSeconds * 4 + refill.x * 0.05) * 1.6;
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
    const left = Math.floor(x / WORLD.tile);
    const right = Math.floor((x + w - 1) / WORLD.tile);
    const top = Math.floor(y / WORLD.tile);
    const bottom = Math.floor((y + h - 1) / WORLD.tile);

    for (let r = top; r <= bottom; r++) {
      for (let c = left; c <= right; c++) {
        if (this.tileAtCell(c, r) === TILE_SOLID) return true;
      }
    }

    return false;
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

    for (let r = top; r <= bottom; r++) {
      for (let c = left; c <= right; c++) {
        const tile = this.tileAtCell(c, r);
        if (tile === TILE_SOLID) return true;

        if (!movingDown || tile !== TILE_JUMP_THROUGH) continue;

        const tileTop = r * WORLD.tile;
        const crossedTop = beforeBottom <= tileTop && afterBottom > tileTop;
        if (crossedTop) return true;
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

    for (let c = left; c <= right; c++) {
      const tile = this.tileAtCell(c, row);
      if (tile === TILE_SOLID) {
        return { onGround: true, onJumpThrough: false };
      }

      if (tile !== TILE_JUMP_THROUGH) continue;

      const tileTop = row * WORLD.tile;
      const crossedTop = beforeBottom <= tileTop && afterBottom > tileTop;
      if (crossedTop) {
        onJumpThrough = true;
      }
    }

    return { onGround: onJumpThrough, onJumpThrough };
  }

  overlapsJumpThrough(x: number, y: number, w: number, h: number): boolean {
    const left = Math.floor(x / WORLD.tile);
    const right = Math.floor((x + w - 1) / WORLD.tile);
    const top = Math.floor(y / WORLD.tile);
    const bottom = Math.floor((y + h - 1) / WORLD.tile);

    for (let r = top; r <= bottom; r++) {
      for (let c = left; c <= right; c++) {
        if (this.tileAtCell(c, r) !== TILE_JUMP_THROUGH) continue;

        const tileX = c * WORLD.tile;
        const tileY = r * WORLD.tile;
        const intersects =
          x < tileX + WORLD.tile &&
          x + w > tileX &&
          y < tileY + WORLD.tile &&
          y + h > tileY;

        if (intersects) return true;
      }
    }

    return false;
  }

  wouldLandOnJumpThruAt(x: number, y: number, w: number, h: number, dist: number): boolean {
    const beforeBottom = y + h;
    const afterBottom = y + h + dist;
    const left = Math.floor(x / WORLD.tile);
    const right = Math.floor((x + w - 1) / WORLD.tile);
    const fromRow = Math.floor(beforeBottom / WORLD.tile);
    const toRow = Math.floor(afterBottom / WORLD.tile);

    for (let r = fromRow; r <= toRow; r++) {
      for (let c = left; c <= right; c++) {
        if (this.tileAtCell(c, r) !== TILE_JUMP_THROUGH) continue;

        const tileTop = r * WORLD.tile;
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

    for (let r = top; r <= bottom; r++) {
      for (let c = left; c <= right; c++) {
        if (this.tileAtCell(c, r) !== TILE_JUMP_THROUGH) continue;

        const tileTop = r * WORLD.tile;
        const penetration = bodyBottom - tileTop;
        if (penetration <= 0 || penetration > maxNudge) continue;

        const nudgeY = tileTop - h;
        if (nudgeY >= y) continue;
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
  ): RefillEntity[] {
    const consumed: RefillEntity[] = [];

    for (const refill of this.refills) {
      if (!refill.active) continue;

      const size = REFILL_PICKUP_SIZE;
      const pickupBox = {
        x: refill.x - size * 0.5,
        y: refill.y - size * 0.5,
        w: size,
        h: size,
      };

      if (!this.overlapAabb(playerBounds, pickupBox)) continue;
      if (!tryConsume(refill.type)) continue;

      refill.active = false;
      refill.respawnTimer = refill.respawnDelay;
      consumed.push(refill);
    }

    return consumed;
  }

  collidesWithSpike(hurtbox: Aabb, vx = 0, vy = 0): SpikeEntity | null {
    for (const spike of this.spikes) {
      if (this.isSafeFromSpike(spike, vx, vy)) continue;

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

  private addSpec(spec: LevelEntitySpec): void {
    if (spec.kind === "solidTile" || spec.kind === "jumpThruTile") {
      this.addTile(spec.kind, spec.col, spec.row);
      return;
    }

    if (spec.kind === "refill") {
      const refill: RefillEntity = {
        id: this.nextId(),
        kind: "refill",
        x: spec.x,
        y: spec.y,
        w: 8,
        h: 8,
        type: spec.type,
        active: true,
        baseY: spec.y,
        respawnTimer: 0,
        respawnDelay: REFILL_RESPAWN_TIME,
      };
      this.entities.push(refill);
      this.refills.push(refill);
      return;
    }

    const spike: SpikeEntity = {
      id: this.nextId(),
      kind: "spike",
      x: spec.col * WORLD.tile,
      y: spec.row * WORLD.tile,
      w: WORLD.tile,
      h: WORLD.tile,
      dir: spec.dir,
    };
    this.entities.push(spike);
    this.spikes.push(spike);
  }

  private addTile(kind: "solidTile" | "jumpThruTile", col: number, row: number): void {
    const id = this.nextId();
    const x = col * WORLD.tile;
    const y = row * WORLD.tile;
    const w = WORLD.tile;
    const h = WORLD.tile;
    const idx = row * this.cols + col;

    if (kind === "solidTile") {
      this.data[idx] = TILE_SOLID;
      const solid: SolidTileEntity = {
        id,
        kind,
        col,
        row,
        x,
        y,
        w,
        h,
      };
      this.entities.push(solid);
      this.tiles.push(solid);
      return;
    }

    this.data[idx] = TILE_JUMP_THROUGH;
    const jumpThru: JumpThruTileEntity = {
      id,
      kind,
      col,
      row,
      x,
      y,
      w,
      h,
    };
    this.entities.push(jumpThru);
    this.tiles.push(jumpThru);
  }

  private nextId(): number {
    const id = this.nextEntityId;
    this.nextEntityId++;
    return id;
  }

  private tileAtCell(col: number, row: number): number {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return TILE_EMPTY;
    return this.data[row * this.cols + col];
  }

  private spikeDangerBounds(spike: SpikeEntity): Aabb {
    const h = Math.min(SPIKE_HEIGHT, Math.min(spike.w, spike.h));
    switch (spike.dir) {
      case "up":
        return { x: spike.x, y: spike.y + spike.h - h, w: spike.w, h };
      case "down":
        return { x: spike.x, y: spike.y, w: spike.w, h };
      case "left":
        return { x: spike.x + spike.w - h, y: spike.y, w: h, h: spike.h };
      case "right":
      default:
        return { x: spike.x, y: spike.y, w: h, h: spike.h };
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

  private isSafeFromSpike(spike: SpikeEntity, vx: number, vy: number): boolean {
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

export function spikeTrianglePoints(spike: SpikeEntity): Array<{ x: number; y: number }> {
  const tris = spikeTriangles(spike);
  return tris[0];
}

export function spikeTriangles(
  spike: SpikeEntity,
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
