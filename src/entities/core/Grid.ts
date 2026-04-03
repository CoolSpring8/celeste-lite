import type { Aabb } from "../types";
import { Collider } from "./Collider";
import type { Hitbox } from "./Hitbox";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export class Grid extends Collider {
  readonly kind = "grid";
  readonly cellsX: number;
  readonly cellsY: number;
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly data: Uint8Array;

  constructor(cellsX: number, cellsY: number, cellWidth: number, cellHeight: number, x = 0, y = 0) {
    super(x, y);
    this.cellsX = cellsX;
    this.cellsY = cellsY;
    this.cellWidth = cellWidth;
    this.cellHeight = cellHeight;
    this.data = new Uint8Array(cellsX * cellsY);
  }

  getCell(col: number, row: number): boolean {
    if (col < 0 || row < 0 || col >= this.cellsX || row >= this.cellsY) {
      return false;
    }

    return this.data[row * this.cellsX + col] !== 0;
  }

  setCell(col: number, row: number, filled: boolean): void {
    if (col < 0 || row < 0 || col >= this.cellsX || row >= this.cellsY) {
      return;
    }

    this.data[row * this.cellsX + col] = filled ? 1 : 0;
  }

  checkRect(col: number, row: number, width: number, height: number): boolean {
    if (col < 0) {
      width += col;
      col = 0;
    }
    if (row < 0) {
      height += row;
      row = 0;
    }
    if (col + width > this.cellsX) {
      width = this.cellsX - col;
    }
    if (row + height > this.cellsY) {
      height = this.cellsY - row;
    }

    for (let c = 0; c < width; c++) {
      for (let r = 0; r < height; r++) {
        if (this.getCell(col + c, row + r)) {
          return true;
        }
      }
    }

    return false;
  }

  collidesPoint(x: number, y: number): boolean {
    if (
      x < this.absoluteLeft ||
      y < this.absoluteTop ||
      x >= this.absoluteRight ||
      y >= this.absoluteBottom
    ) {
      return false;
    }

    const col = Math.floor((x - this.absoluteLeft) / this.cellWidth);
    const row = Math.floor((y - this.absoluteTop) / this.cellHeight);
    return this.getCell(col, row);
  }

  collidesRect(rect: Aabb): boolean {
    return this.collidesRectValues(rect.x, rect.y, rect.w, rect.h);
  }

  collidesRectValues(x: number, y: number, w: number, h: number): boolean {
    if (!this.overlapsBounds(x, y, w, h)) {
      return false;
    }

    const col = Math.floor((x - this.absoluteLeft) / this.cellWidth);
    const row = Math.floor((y - this.absoluteTop) / this.cellHeight);
    const width = Math.floor((x + w - this.absoluteLeft - 1) / this.cellWidth) - col + 1;
    const height = Math.floor((y + h - this.absoluteTop - 1) / this.cellHeight) - row + 1;
    return this.checkRect(col, row, width, height);
  }

  collidesHitbox(hitbox: Hitbox): boolean {
    return this.collidesRect(hitbox.bounds);
  }

  collidesGrid(grid: Grid): boolean {
    if (!this.overlapsBounds(grid.absoluteLeft, grid.absoluteTop, grid.width, grid.height)) {
      return false;
    }

    const startCol = clamp(
      Math.floor((grid.absoluteLeft - this.absoluteLeft) / this.cellWidth),
      0,
      this.cellsX - 1,
    );
    const endCol = clamp(
      Math.floor((grid.absoluteRight - this.absoluteLeft - 1) / this.cellWidth),
      0,
      this.cellsX - 1,
    );
    const startRow = clamp(
      Math.floor((grid.absoluteTop - this.absoluteTop) / this.cellHeight),
      0,
      this.cellsY - 1,
    );
    const endRow = clamp(
      Math.floor((grid.absoluteBottom - this.absoluteTop - 1) / this.cellHeight),
      0,
      this.cellsY - 1,
    );

    for (let col = startCol; col <= endCol; col++) {
      for (let row = startRow; row <= endRow; row++) {
        if (!this.getCell(col, row)) {
          continue;
        }

        const cellX = this.absoluteLeft + col * this.cellWidth;
        const cellY = this.absoluteTop + row * this.cellHeight;
        if (grid.collidesRectValues(cellX, cellY, this.cellWidth, this.cellHeight)) {
          return true;
        }
      }
    }

    return false;
  }

  get width(): number {
    return this.cellWidth * this.cellsX;
  }

  set width(_value: number) {
    throw new Error("Grid width is derived from its cell dimensions");
  }

  get height(): number {
    return this.cellHeight * this.cellsY;
  }

  set height(_value: number) {
    throw new Error("Grid height is derived from its cell dimensions");
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
    return this.x + this.width;
  }

  set right(value: number) {
    this.x = value - this.width;
  }

  get bottom(): number {
    return this.y + this.height;
  }

  set bottom(value: number) {
    this.y = value - this.height;
  }
}
