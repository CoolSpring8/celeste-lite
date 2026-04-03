import { PLAYER_GEOMETRY, WORLD } from "./constants";
import { EntityWorld } from "./entities/EntityWorld";
import { LevelEntitySpec, SpikeDirection } from "./entities/types";

// 0 = 空气, 1 = 实心方块
// 这张图设计了：地面、墙壁、浮空平台、需要冲刺越过的大间隙、练习蹬墙跳的竖井
const RAW = `
XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
XXXXX..............................................XXXX
XXXXX..............................................XXXX
XXXXX..............................................XXXX
XXXXX..............................................XXXX
XXXXX....................XXXXXXXX..................XXXX
XXXXX.2......^^..........XXXXXXXX..................XXXX
XXXXX........XX..........XXXXXXXX..................XXXX
XXXXX........XX...........XXXXXXX..................XXXX
XXXXX........XX...........XXXXXXX......XXXXXX===XXXXXXX
XXXXX........XX...........XXXXXXX......XXXXXX...XXXXXXX
XXXXXXXX..................XXXXXXX........XXXX...XXXXXXX
XXXXXXXX.........^^^^^....XXXXXXX.........XXX...XXXXXXX
XXXXXXXX.........XXXXX....XXXXXXX.........XXX...XXXXXXX
XXXXXXXX.........XXXXX...1XXXXXXX.........XXX...XXXXXXX
XXXXXXXX.........XXXXX....XXXXXXX.........XXX...XXXXXXX
XXXX......................XXXXXXX..................XXXX
XXXX......................XXXXXXX..................XXXX
XXXX...........XXXXXXXX...XXXXXXX..................XXXX
XXXX...........XXXXXXXX...XXXXXXX..................XXXX
XXXXX..........XXXXXXXX......XXXX.............=====XXXX
XXXXX..........XXXXXXXX.....XXXXX..................XXXX
XXXXXS.........XXXXXXXX............................XXXX
XXXXX..........XXXXXXXX...XXXXXXX..................XXXX
XXXXXXXXX^^^^^^XXXXXXXX^^^XXXXXXX.......XXXX.......XXXX
XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.......XXXX
XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX^^^^^^^XXXX
XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`;

export interface LevelData {
  world: EntityWorld;
  spawnX: number;
  spawnY: number;
}

export function parseLevel(): LevelData {
  const lines = RAW.trim().split("\n");
  const spawnInsetX = Math.floor((WORLD.tile - PLAYER_GEOMETRY.hitboxW) * 0.5);
  let spawnX = 3 * WORLD.tile + spawnInsetX + PLAYER_GEOMETRY.hitboxW * 0.5;
  let spawnY = 20 * WORLD.tile + PLAYER_GEOMETRY.hitboxH;
  const entities: LevelEntitySpec[] = [];

  for (let r = 0; r < WORLD.rows; r++) {
    const line = lines[r] || "";
    for (let c = 0; c < WORLD.cols; c++) {
      const ch = line[c] || ".";
      if (ch === "X") {
        entities.push({ kind: "solidTile", col: c, row: r });
      } else if (ch === "=") {
        entities.push({ kind: "jumpThruTile", col: c, row: r });
        } else {
          if (ch === "S") {
            spawnX = c * WORLD.tile + spawnInsetX + PLAYER_GEOMETRY.hitboxW * 0.5;
            spawnY = r * WORLD.tile + PLAYER_GEOMETRY.hitboxH;
          } else if (ch === "D") {
          entities.push({
            kind: "refill",
            x: c * WORLD.tile + WORLD.tile * 0.5,
            y: r * WORLD.tile + WORLD.tile * 0.5,
            type: "max",
          });
        } else if (ch >= "1" && ch <= "9") {
          entities.push({
            kind: "refill",
            x: c * WORLD.tile + WORLD.tile * 0.5,
            y: r * WORLD.tile + WORLD.tile * 0.5,
            type: Number(ch),
          });
        } else {
          const spikeDir = spikeDirectionFromChar(ch);
          if (spikeDir) {
            entities.push({
              kind: "spike",
              col: c,
              row: r,
              dir: spikeDir,
            });
          }
        }
      }
    }
  }

  return {
    world: EntityWorld.fromSpecs(WORLD.cols, WORLD.rows, entities),
    spawnX,
    spawnY,
  };
}

function spikeDirectionFromChar(ch: string): SpikeDirection | null {
  if (ch === "^") return "up";
  if (ch === "v") return "down";
  if (ch === "<") return "left";
  if (ch === ">") return "right";
  return null;
}
