import { COLS, ROWS, TILE } from "./constants";
import { SolidGrid } from "./grid";

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
X...........XX.....................................X
X.................XX..............XX.........XX....X
X..................................................X
X..................................................X
X..XX..............................................X
X..XX......XX..........X....X..........XXXX........X
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
  const data = new Uint8Array(COLS * ROWS);
  let spawnX = 3 * TILE;
  let spawnY = 20 * TILE;

  for (let r = 0; r < ROWS; r++) {
    const line = lines[r] || "";
    for (let c = 0; c < COLS; c++) {
      const ch = line[c] || ".";
      const idx = r * COLS + c;
      if (ch === "X") {
        data[idx] = 1;
      } else {
        data[idx] = 0;
        if (ch === "S") {
          spawnX = c * TILE + 4;
          spawnY = r * TILE;
        }
      }
    }
  }

  return {
    grid: {
      cols: COLS,
      rows: ROWS,
      data,
    },
    spawnX,
    spawnY,
  };
}
