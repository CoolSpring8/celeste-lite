import { PLAYER_GEOMETRY, WORLD } from "../constants";
import { SolidGrid, TILE_SOLID, isJumpThroughTile, tileAt } from "../grid";

export interface GroundProbe {
  onGround: boolean;
  onJumpThrough: boolean;
}

export function collideSolidAt(
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
      if (tileAt(grid, c, r) === TILE_SOLID) return true;
    }
  }

  return false;
}

export function collideAt(
  x: number,
  y: number,
  w: number,
  h: number,
  grid: SolidGrid,
  fromY: number,
  movingDown: boolean,
): boolean {
  const left = Math.floor(x / WORLD.tile);
  const right = Math.floor((x + w - 1) / WORLD.tile);
  const top = Math.floor(y / WORLD.tile);
  const bottom = Math.floor((y + h - 1) / WORLD.tile);

  const beforeBottom = fromY + h;
  const afterBottom = y + h;

  for (let r = top; r <= bottom; r++) {
    for (let c = left; c <= right; c++) {
      const tile = tileAt(grid, c, r);
      if (tile === TILE_SOLID) return true;

      if (!movingDown || !isJumpThroughTile(tile)) continue;

      const tileTop = r * WORLD.tile;
      const crossedTop = beforeBottom <= tileTop && afterBottom > tileTop;
      if (crossedTop) return true;
    }
  }

  return false;
}

export function wallDirAt(x: number, y: number, h: number, grid: SolidGrid): number {
  if (
    collideSolidAt(
      x - 1,
      y,
      PLAYER_GEOMETRY.hitboxW,
      h,
      grid,
    )
  ) {
    return -1;
  }
  if (
    collideSolidAt(
      x + 1,
      y,
      PLAYER_GEOMETRY.hitboxW,
      h,
      grid,
    )
  ) {
    return 1;
  }
  return 0;
}

export function probeGround(
  x: number,
  y: number,
  h: number,
  grid: SolidGrid,
): GroundProbe {
  const nextY = y + 1;
  const left = Math.floor(x / WORLD.tile);
  const right = Math.floor((x + PLAYER_GEOMETRY.hitboxW - 1) / WORLD.tile);
  const row = Math.floor((nextY + h - 1) / WORLD.tile);
  const beforeBottom = y + h;
  const afterBottom = nextY + h;

  let onJumpThrough = false;

  for (let c = left; c <= right; c++) {
    const tile = tileAt(grid, c, row);
    if (tile === TILE_SOLID) {
      return { onGround: true, onJumpThrough: false };
    }

    if (isJumpThroughTile(tile)) {
      const tileTop = row * WORLD.tile;
      const crossedTop = beforeBottom <= tileTop && afterBottom > tileTop;
      if (crossedTop) {
        onJumpThrough = true;
      }
    }
  }

  return { onGround: onJumpThrough, onJumpThrough };
}
