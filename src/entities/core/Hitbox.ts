import type { Aabb } from "../types";
import { Collider } from "./Collider";
import type { Grid } from "./Grid";

export class Hitbox extends Collider {
  readonly kind = "hitbox";

  private widthValue: number;
  private heightValue: number;

  constructor(width: number, height: number, x = 0, y = 0) {
    super(x, y);
    this.widthValue = width;
    this.heightValue = height;
  }

  set(x: number, y: number, width: number, height: number): void {
    this.x = x;
    this.y = y;
    this.widthValue = width;
    this.heightValue = height;
  }

  collidesPoint(x: number, y: number): boolean {
    return x >= this.absoluteLeft &&
      y >= this.absoluteTop &&
      x < this.absoluteRight &&
      y < this.absoluteBottom;
  }

  collidesRect(rect: Aabb): boolean {
    return this.collidesRectValues(rect.x, rect.y, rect.w, rect.h);
  }

  collidesRectValues(x: number, y: number, w: number, h: number): boolean {
    return this.absoluteRight > x &&
      this.absoluteBottom > y &&
      this.absoluteLeft < x + w &&
      this.absoluteTop < y + h;
  }

  collidesHitbox(hitbox: Hitbox): boolean {
    return this.collidesRectValues(hitbox.absoluteLeft, hitbox.absoluteTop, hitbox.width, hitbox.height);
  }

  collidesGrid(grid: Grid): boolean {
    return grid.collidesRect(this.bounds);
  }

  get width(): number {
    return this.widthValue;
  }

  set width(value: number) {
    this.widthValue = value;
  }

  get height(): number {
    return this.heightValue;
  }

  set height(value: number) {
    this.heightValue = value;
  }

  get left(): number {
    return this.x;
  }

  set left(value: number) {
    this.x = value;
  }

  get top(): number {
    return this.y;
  }

  set top(value: number) {
    this.y = value;
  }

  get right(): number {
    return this.x + this.widthValue;
  }

  set right(value: number) {
    this.x = value - this.widthValue;
  }

  get bottom(): number {
    return this.y + this.heightValue;
  }

  set bottom(value: number) {
    this.y = value - this.heightValue;
  }
}
