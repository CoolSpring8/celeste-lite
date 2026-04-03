import type { Aabb } from "../types";
import type { Collider } from "./Collider";

export class Entity {
  active = true;
  collidable = true;
  x: number;
  y: number;

  private colliderValue: Collider | null = null;

  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  get collider(): Collider | null {
    return this.colliderValue;
  }

  set collider(value: Collider | null) {
    if (this.colliderValue === value) {
      return;
    }

    this.colliderValue?.detach();
    this.colliderValue = value;
    this.colliderValue?.attach(this);
  }

  collidePoint(x: number, y: number): boolean {
    if (!this.collidable || this.colliderValue === null) {
      return false;
    }

    return this.colliderValue.collidesPoint(x, y);
  }

  collideRect(rect: Aabb): boolean {
    if (!this.collidable || this.colliderValue === null) {
      return false;
    }

    return this.colliderValue.collidesRect(rect);
  }
}

export type EntityType<T extends Entity> = abstract new (...args: any[]) => T;
