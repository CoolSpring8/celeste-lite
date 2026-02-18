import { WORLD } from "./constants";
import { SolidGrid, TILE_EMPTY, TILE_JUMP_THROUGH, TILE_SOLID } from "./grid";

// 0 = 空气, 1 = 实心方块
// 这张图设计了：地面、墙壁、浮空平台、需要冲刺越过的大间隙、练习蹬墙跳的竖井
const RAW = `
XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
X..................................................X
X..................................................X
X..................................................X
X..................................................X
X..................................................X
X..................................................X
X........XX.............................XX.........X
X..................................................X
X..................................................X
X..................................................X
X...............................XX.................X
X.......................XX.........................X
X..................................................X
X..................................................X
X...........XX...........======....................X
X.................XX..............XX.........XX....X
X..................................................X
X..................................................X
X..XX..............................................X
X..XX......XX..........X====X..........XXXX........X
X..XX..............................................X
X..XX......................................XX.XX...X
X..XX..............................................X
X..XX..XX..XX..........X....X......................X
X..................................................X
X.S................................................X
X..................................................X
XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`;

export interface LevelData {
  grid: SolidGrid;
  spawnX: number;
  spawnY: number;
}

export function parseLevel(): LevelData {
  const lines = RAW.trim().split("\n");
  const data = new Uint8Array(WORLD.cols * WORLD.rows);
  let spawnX = 3 * WORLD.tile;
  let spawnY = 20 * WORLD.tile;

  for (let r = 0; r < WORLD.rows; r++) {
    const line = lines[r] || "";
    for (let c = 0; c < WORLD.cols; c++) {
      const ch = line[c] || ".";
      const idx = r * WORLD.cols + c;
      if (ch === "X") {
        data[idx] = TILE_SOLID;
      } else if (ch === "=") {
        data[idx] = TILE_JUMP_THROUGH;
      } else {
        data[idx] = TILE_EMPTY;
        if (ch === "S") {
          spawnX = c * WORLD.tile + 4;
          spawnY = r * WORLD.tile;
        }
      }
    }
  }

  return {
    grid: {
      cols: WORLD.cols,
      rows: WORLD.rows,
      data,
    },
    spawnX,
    spawnY,
  };
}
