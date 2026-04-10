import { PLAYER_GEOMETRY, VIEWPORT, WORLD } from "./constants";
import { EntityWorld } from "./entities/EntityWorld";
import { type Aabb, LevelEntitySpec, SpikeDirection } from "./entities/types";

export const LEVEL_ROOM_COLS = VIEWPORT.width / WORLD.tile;
export const LEVEL_ROOM_ROWS = WORLD.rows;

export type RoomDirection = "left" | "right" | "up" | "down";

interface RoomBlueprint {
  id: string;
  gridX: number;
  gridY: number;
  rows: readonly string[];
}

export interface LevelRoom {
  id: string;
  gridX: number;
  gridY: number;
  cols: number;
  rows: number;
  bounds: Aabb;
  checkpoint: { x: number; y: number } | null;
}

const ROOM_BLUEPRINTS: readonly RoomBlueprint[] = [
  {
    id: "foothills",
    gridX: 0,
    gridY: 0,
    rows: [
      "XXXXXXXXXXXXXXXX........................",
      "XXXXX...................................",
      "XXXXX...................................",
      "XXXXX...................................",
      "XXXXX...................................",
      "XXXXX...................................",
      "XXXXX...................................",
      "XXXXX..............XXXX.................",
      "XXXXX....2.........XXXX.................",
      "XXXXX..............XXXX.................",
      "XXXXX...................................",
      "XXXXX.........................=====.....",
      "XXXXX...................................",
      "XXXXX...........^^......................",
      "XXXXX...........XX......................",
      "XXXXX...........XX.........XXXX.........",
      "XXXXX...........XX.........XXXX.........",
      "XXXXX......................XXXX.........",
      "XXXXX......................XXXX.........",
      "XXXXX..........XXXX.....................",
      "XXXXX..........XXXX.....................",
      "XXXXX...................................",
      "XXXXX...................................",
      "XXXXX.....................XXXX..........",
      "XXS.....................................",
      "XX......................................",
      "XXXXXXXX................................",
      "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    ],
  },
  {
    id: "crossing",
    gridX: 1,
    gridY: 0,
    rows: [
      "...................................XXXXX",
      "...................................XXXXX",
      "...................................XXXXX",
      "...................................XXXXX",
      "....................XXXX...........XXXXX",
      "....................XXXX...........XXXXX",
      "...................................XXXXX",
      "..........=====....................XXXXX",
      "...................................XXXXX",
      "..............2....................XXXXX",
      "...................................XXXXX",
      "..............^^^^.................XXXXX",
      "..............XXXX.................XXXXX",
      "...................................XXXXX",
      "......................XXXXXXX......XXXXX",
      "......................XXXXXXX......XXXXX",
      "...................................XXXXX",
      ".....XXXX..........................XXXXX",
      ".....XXXX..........................XXXXX",
      "...................................XXXXX",
      "...................................XXXXX",
      "...................................XXXXX",
      "...................................XXXXX",
      "...................................XXXXX",
      "S..................................XXXXX",
      "...................................XXXXX",
      "......................XXXXXXX......XXXXX",
      "XXXXXXXXXXXX......XXXXXXXXXXXXXXXXXXXXXX",
      "XXXXXXXXXXXX......XXXXXXXXXXXXXXXXXXXXXX",
      "XXXXXXXXXXXX......XXXXXXXXXXXXXXXXXXXXXX",
    ],
  },
] as const;

export interface LevelData {
  world: EntityWorld;
  rooms: LevelRoom[];
  spawnX: number;
  spawnY: number;
}

export function parseLevel(): LevelData {
  const entities: LevelEntitySpec[] = [];
  const rooms: LevelRoom[] = [];
  const spawnInsetX = Math.floor((WORLD.tile - PLAYER_GEOMETRY.hitboxW) * 0.5);
  let worldCols = 0;
  let worldRows = 0;
  let startCheckpoint: { x: number; y: number } | null = null;

  for (const blueprint of ROOM_BLUEPRINTS) {
    const rows = normalizeRoomRows(blueprint.rows);
    const offsetCol = blueprint.gridX * LEVEL_ROOM_COLS;
    const offsetRow = blueprint.gridY * LEVEL_ROOM_ROWS;
    let checkpoint: { x: number; y: number } | null = null;

    for (let r = 0; r < LEVEL_ROOM_ROWS; r++) {
      const line = rows[r];
      for (let c = 0; c < LEVEL_ROOM_COLS; c++) {
        const ch = line[c] || ".";
        const col = offsetCol + c;
        const row = offsetRow + r;

        if (ch === "X") {
          entities.push({ kind: "solidTile", col, row });
          continue;
        }

        if (ch === "=") {
          entities.push({ kind: "jumpThruTile", col, row });
          continue;
        }

        if (ch === "S") {
          checkpoint = {
            x: col * WORLD.tile + spawnInsetX + PLAYER_GEOMETRY.hitboxW * 0.5,
            y: row * WORLD.tile + PLAYER_GEOMETRY.hitboxH,
          };
          startCheckpoint ??= checkpoint;
          continue;
        }

        if (ch === "D") {
          entities.push({
            kind: "refill",
            x: col * WORLD.tile + WORLD.tile * 0.5,
            y: row * WORLD.tile + WORLD.tile * 0.5,
            type: "max",
          });
          continue;
        }

        if (ch >= "1" && ch <= "9") {
          entities.push({
            kind: "refill",
            x: col * WORLD.tile + WORLD.tile * 0.5,
            y: row * WORLD.tile + WORLD.tile * 0.5,
            type: Number(ch),
          });
          continue;
        }

        const spikeDir = spikeDirectionFromChar(ch);
        if (spikeDir) {
          entities.push({
            kind: "spike",
            col,
            row,
            dir: spikeDir,
          });
        }
      }
    }

    worldCols = Math.max(worldCols, offsetCol + LEVEL_ROOM_COLS);
    worldRows = Math.max(worldRows, offsetRow + LEVEL_ROOM_ROWS);
    rooms.push({
      id: blueprint.id,
      gridX: blueprint.gridX,
      gridY: blueprint.gridY,
      cols: LEVEL_ROOM_COLS,
      rows: LEVEL_ROOM_ROWS,
      bounds: {
        x: offsetCol * WORLD.tile,
        y: offsetRow * WORLD.tile,
        w: LEVEL_ROOM_COLS * WORLD.tile,
        h: LEVEL_ROOM_ROWS * WORLD.tile,
      },
      checkpoint,
    });
  }

  if (startCheckpoint === null) {
    throw new Error("Level requires at least one room checkpoint marked with 'S'");
  }

  return {
    world: EntityWorld.fromSpecs(worldCols, worldRows, entities),
    rooms,
    spawnX: startCheckpoint.x,
    spawnY: startCheckpoint.y,
  };
}

export function findRoomAtPoint(
  rooms: readonly LevelRoom[],
  x: number,
  y: number,
): LevelRoom | null {
  for (const room of rooms) {
    const bounds = room.bounds;
    if (x >= bounds.x && x < bounds.x + bounds.w && y >= bounds.y && y < bounds.y + bounds.h) {
      return room;
    }
  }

  return null;
}

export function findAdjacentRoom(
  rooms: readonly LevelRoom[],
  room: LevelRoom,
  direction: RoomDirection,
): LevelRoom | null {
  const bounds = room.bounds;

  for (const candidate of rooms) {
    if (candidate.id === room.id) {
      continue;
    }

    const other = candidate.bounds;
    if (direction === "left" &&
      other.x + other.w === bounds.x &&
      rangesOverlap(other.y, other.y + other.h, bounds.y, bounds.y + bounds.h)) {
      return candidate;
    }
    if (direction === "right" &&
      other.x === bounds.x + bounds.w &&
      rangesOverlap(other.y, other.y + other.h, bounds.y, bounds.y + bounds.h)) {
      return candidate;
    }
    if (direction === "up" &&
      other.y + other.h === bounds.y &&
      rangesOverlap(other.x, other.x + other.w, bounds.x, bounds.x + bounds.w)) {
      return candidate;
    }
    if (direction === "down" &&
      other.y === bounds.y + bounds.h &&
      rangesOverlap(other.x, other.x + other.w, bounds.x, bounds.x + bounds.w)) {
      return candidate;
    }
  }

  return null;
}

function normalizeRoomRows(rows: readonly string[]): string[] {
  const out: string[] = [];
  for (let r = 0; r < LEVEL_ROOM_ROWS; r++) {
    const line = rows[r] ?? "";
    out.push(line.padEnd(LEVEL_ROOM_COLS, ".").slice(0, LEVEL_ROOM_COLS));
  }
  return out;
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && aEnd > bStart;
}

function spikeDirectionFromChar(ch: string): SpikeDirection | null {
  if (ch === "^") return "up";
  if (ch === "v") return "down";
  if (ch === "<") return "left";
  if (ch === ">") return "right";
  return null;
}
