import type { Aabb } from "../types";
import type { Entity } from "./Entity";
import type { Grid } from "./Grid";
import type { Hitbox } from "./Hitbox";

function rectsOverlap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

export abstract class Collider {
  entity: Entity | null = null;
  x: number;
  y: number;

  protected constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  abstract readonly kind: "grid" | "hitbox";

  attach(entity: Entity): void {
    this.entity = entity;
  }

  detach(): void {
    this.entity = null;
  }

  collides(target: Collider): boolean {
    if (target.kind === "hitbox") {
      return this.collidesHitbox(target as Hitbox);
    }

    return this.collidesGrid(target as Grid);
  }

  abstract collidesPoint(x: number, y: number): boolean;
  abstract collidesRect(rect: Aabb): boolean;
  abstract collidesRectValues(x: number, y: number, w: number, h: number): boolean;
  abstract collidesHitbox(hitbox: Hitbox): boolean;
  abstract collidesGrid(grid: Grid): boolean;

  protected overlapsBounds(x: number, y: number, w: number, h: number): boolean {
    return rectsOverlap(this.absoluteLeft, this.absoluteTop, this.width, this.height, x, y, w, h);
  }

  get absoluteLeft(): number {
    return (this.entity?.x ?? 0) + this.left;
  }

  get absoluteTop(): number {
    return (this.entity?.y ?? 0) + this.top;
  }

  get absoluteRight(): number {
    return (this.entity?.x ?? 0) + this.right;
  }

  get absoluteBottom(): number {
    return (this.entity?.y ?? 0) + this.bottom;
  }

  get bounds(): Aabb {
    return {
      x: this.absoluteLeft,
      y: this.absoluteTop,
      w: this.width,
      h: this.height,
    };
  }

  abstract get width(): number;
  abstract set width(value: number);
  abstract get height(): number;
  abstract set height(value: number);
  abstract get left(): number;
  abstract set left(value: number);
  abstract get top(): number;
  abstract set top(value: number);
  abstract get right(): number;
  abstract set right(value: number);
  abstract get bottom(): number;
  abstract set bottom(value: number);
}
