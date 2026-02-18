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
X...........................2......................X
X...........XX...........======....................X
X.................XX..............XX.........XX....X
X..................................................X
X..................................................X
X..XX..............................................X
X..XX......XX..........X====X..........XXXX........X
X..XX.............................1................X
X..XX......................................XX.XX...X
X..XX..............................................X
X..XX..XX..XX..........X....X......................X
X.................,................................X
X1S................................................X
X..................................................X
XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`;

export type RefillType = number | "max";

export interface RefillSpawn {
  x: number;
  y: number;
  type: RefillType;
}

export interface LevelData {
  grid: SolidGrid;
  spawnX: number;
  spawnY: number;
  refills: RefillSpawn[];
}

export function parseLevel(): LevelData {
  const lines = RAW.trim().split("\n");
  const data = new Uint8Array(WORLD.cols * WORLD.rows);
  let spawnX = 3 * WORLD.tile;
  let spawnY = 20 * WORLD.tile;
  const refills: RefillSpawn[] = [];

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
        } else if (ch === "D") {
          refills.push({
            x: c * WORLD.tile + WORLD.tile * 0.5,
            y: r * WORLD.tile + WORLD.tile * 0.5,
            type: "max",
          });
        } else if (ch >= "1" && ch <= "9") {
          refills.push({
            x: c * WORLD.tile + WORLD.tile * 0.5,
            y: r * WORLD.tile + WORLD.tile * 0.5,
            type: Number(ch),
          });
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
    refills,
  };
}
