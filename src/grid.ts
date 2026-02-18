export interface SolidGrid {
  cols: number;
  rows: number;
  data: Uint8Array;
}

export const TILE_EMPTY = 0;
export const TILE_SOLID = 1;
export const TILE_JUMP_THROUGH = 2;

export function gridIndex(grid: SolidGrid, col: number, row: number): number {
  return row * grid.cols + col;
}

export function solidAt(grid: SolidGrid, col: number, row: number): boolean {
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return false;
  return grid.data[gridIndex(grid, col, row)] === TILE_SOLID;
}

export function tileAt(grid: SolidGrid, col: number, row: number): number {
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return TILE_EMPTY;
  return grid.data[gridIndex(grid, col, row)];
}

export function isJumpThroughTile(tile: number): boolean {
  return tile === TILE_JUMP_THROUGH;
}
