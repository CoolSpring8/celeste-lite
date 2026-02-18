import * as C from "../constants";

export function collideAt(
  x: number,
  y: number,
  w: number,
  h: number,
  grid: number[][],
): boolean {
  const left = Math.floor(x / C.TILE);
  const right = Math.floor((x + w - 1) / C.TILE);
  const top = Math.floor(y / C.TILE);
  const bottom = Math.floor((y + h - 1) / C.TILE);

  for (let r = top; r <= bottom; r++) {
    for (let c = left; c <= right; c++) {
      if (grid[r]?.[c] === 1) return true;
    }
  }

  return false;
}

export function wallDirAt(
  x: number,
  y: number,
  w: number,
  h: number,
  grid: number[][],
): number {
  if (collideAt(x - 1, y, w, h, grid)) return -1;
  if (collideAt(x + 1, y, w, h, grid)) return 1;
  return 0;
}
