import { Entity } from "../entities/core/Entity";
import { CollisionWorld } from "../entities/CollisionWorld";
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

      if (!this.world.collideAt(nextX, this.y, this.getMoveWidth(), this.getMoveHeight(), this.y, false)) {
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

      if (
        !this.world.collideAt(
          this.x,
          nextY,
          this.getMoveWidth(),
          this.getMoveHeight(),
          this.y,
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

  protected abstract getMoveWidth(): number;
  protected abstract getMoveHeight(): number;
}
