export interface SolidGrid {
  cols: number;
  rows: number;
  data: Uint8Array;
}

export function gridIndex(grid: SolidGrid, col: number, row: number): number {
  return row * grid.cols + col;
}

export function solidAt(grid: SolidGrid, col: number, row: number): boolean {
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return false;
  return grid.data[gridIndex(grid, col, row)] === 1;
}
