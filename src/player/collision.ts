import { WORLD } from "../constants";
import { SolidGrid, solidAt } from "../grid";

export function collideAt(
  x: number,
  y: number,
  w: number,
  h: number,
  grid: SolidGrid,
): boolean {
  const left = Math.floor(x / WORLD.tile);
  const right = Math.floor((x + w - 1) / WORLD.tile);
  const top = Math.floor(y / WORLD.tile);
  const bottom = Math.floor((y + h - 1) / WORLD.tile);

  for (let r = top; r <= bottom; r++) {
    for (let c = left; c <= right; c++) {
      if (solidAt(grid, c, r)) return true;
    }
  }

  return false;
}

export function wallDirAt(
  x: number,
  y: number,
  w: number,
  h: number,
  grid: SolidGrid,
): number {
  if (collideAt(x - 1, y, w, h, grid)) return -1;
  if (collideAt(x + 1, y, w, h, grid)) return 1;
  return 0;
}
