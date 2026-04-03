import { Entity } from "../entities/core/Entity";
import { CollisionWorld } from "../entities/CollisionWorld";
import type { Aabb } from "../entities/types";
import { addFloat, roundToEvenInt, sign, subFloat } from "./math";

export type MoveCollisionResult = "none" | "moved" | "break";

export abstract class Actor extends Entity {
  protected readonly world: CollisionWorld;

  private remX = 0;
  private remY = 0;

  protected constructor(x: number, y: number, world: CollisionWorld) {
    super(x, y);
    this.world = world;
  }

  protected moveH(amount: number): boolean {
    this.remX = addFloat(this.remX, amount);
    const move = roundToEvenInt(this.remX);
    this.remX = subFloat(this.remX, move);
    return this.moveHExact(move);
  }

  protected moveV(amount: number): boolean {
    this.remY = addFloat(this.remY, amount);
    const move = roundToEvenInt(this.remY);
    this.remY = subFloat(this.remY, move);
    return this.moveVExact(move);
  }

  protected moveHExact(move: number): boolean {
    let collided = false;

    while (move !== 0) {
      const step = sign(move);
      const nextX = this.x + step;
      const currentBounds = this.getCollisionBoundsAt(this.x, this.y);
      const nextBounds = this.getCollisionBoundsAt(nextX, this.y);

      if (!this.world.collideAt(nextBounds.x, nextBounds.y, nextBounds.w, nextBounds.h, currentBounds.y, false)) {
        this.x = nextX;
        move -= step;
        continue;
      }

      collided = true;
      const result = this.onCollideH(step);
      if (result === "moved") {
        move -= step;
        continue;
      }
      if (result === "break") {
        break;
      }

      this.afterBlockedH(step);
      break;
    }

    return collided;
  }

  protected moveVExact(move: number): boolean {
    let collided = false;

    while (move !== 0) {
      const step = sign(move);
      const nextY = this.y + step;
      const currentBounds = this.getCollisionBoundsAt(this.x, this.y);
      const nextBounds = this.getCollisionBoundsAt(this.x, nextY);

      if (
        !this.world.collideAt(
          nextBounds.x,
          nextBounds.y,
          nextBounds.w,
          nextBounds.h,
          currentBounds.y,
          step > 0,
        )
      ) {
        this.y = nextY;
        move -= step;
        continue;
      }

      collided = true;
      const result = this.onCollideV(step);
      if (result === "moved") {
        move -= step;
        continue;
      }
      if (result === "break") {
        break;
      }

      this.afterBlockedV(step);
      break;
    }

    return collided;
  }

  protected clearMovementRemainders(): void {
    this.remX = 0;
    this.remY = 0;
  }

  protected clearHorizontalRemainder(): void {
    this.remX = 0;
  }

  protected clearVerticalRemainder(): void {
    this.remY = 0;
  }

  protected onCollideH(_step: number): MoveCollisionResult {
    return "none";
  }

  protected onCollideV(_step: number): MoveCollisionResult {
    return "none";
  }

  protected afterBlockedH(_step: number): void {
  }

  protected afterBlockedV(_step: number): void {
  }

  protected getCollisionBoundsAt(x: number, y: number): Aabb {
    const collider = this.collider;
    if (collider === null) {
      throw new Error("Actor movement requires an attached collider");
    }

    return {
      x: x + collider.left,
      y: y + collider.top,
      w: collider.width,
      h: collider.height,
    };
  }
}
