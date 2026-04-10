import { PLAYER_GEOMETRY, WORLD } from "./constants";
import { EntityWorld } from "./entities/EntityWorld";
import { type Aabb, LevelEntitySpec, SpikeDirection } from "./entities/types";

export type RoomDirection = "left" | "right" | "up" | "down";

export interface LevelRoomBlueprint {
  id: string;
  bounds: Aabb;
  rows: readonly string[];
  initialSpawn?: boolean;
}

export interface LevelRoom {
  id: string;
  cols: number;
  rows: number;
  bounds: Aabb;
  checkpoint: { x: number; y: number } | null;
}

const ROOM_BLUEPRINTS: readonly LevelRoomBlueprint[] = [
  {
    id: "foothills",
    bounds: { x: 5 * WORLD.tile, y: 0, w: 40 * WORLD.tile, h: 30 * WORLD.tile },
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
    bounds: { x: 45 * WORLD.tile, y: 0, w: 40 * WORLD.tile, h: 30 * WORLD.tile },
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
      "XXXXXXXXXXXXXXXXXX...XXXXXXXXXXXXXXXXXXX",
      "XXXXXXXXXXXXXXXXXX...XXXXXXXXXXXXXXXXXXX",
      "XXXXXXXXXXXXXXXXXX...XXXXXXXXXXXXXXXXXXX",
    ],
  },
  {
    id: "legacy-foothills",
    bounds: { x: 0, y: 30 * WORLD.tile, w: 55 * WORLD.tile, h: 30 * WORLD.tile },
    initialSpawn: true,
    rows: [
      "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      "XXXXX..............................................XXXX",
      "XXXXX..............................................XXXX",
      "XXXXX..............................................XXXX",
      "XXXXX..............................................XXXX",
      "XXXXX....................XXXXXXXX......................",
      "XXXXX.2......^^..........XXXXXXXX......................",
      "XXXXX........XX..........XXXXXXXX......................",
      "XXXXX........XX...........XXXXXXX......................",
      "XXXXX........XX...........XXXXXXX......XXXXXX===XXXXXXX",
      "XXXXX........XX...........XXXXXXX......XXXXXX...XXXXXXX",
      "XXXXXXXX..................XXXXXXX........XXXX...XXXXXXX",
      "XXXXXXXX.........^^^^^....XXXXXXX.........XXX...XXXXXXX",
      "XXXXXXXX.........XXXXX....XXXXXXX.........XXX...XXXXXXX",
      "XXXXXXXX.........XXXXX...1XXXXXXX.........XXX...XXXXXXX",
      "XXXXXXXX.........XXXXX....XXXXXXX.........XXX...XXXXXXX",
      "XXXX......................XXXXXXX..................XXXX",
      "XXXX......................XXXXXXX..................XXXX",
      "XXXX...........XXXXXXXX...XXXXXXX..................XXXX",
      "XXXX...........XXXXXXXX...XXXXXXX..................XXXX",
      "XXXXX..........XXXXXXXX......XXXX.............=====XXXX",
      "XXXXX..........XXXXXXXX.....XXXXX..................XXXX",
      "XXXXXS.........XXXXXXXX............................XXXX",
      "XXXXX..........XXXXXXXX...XXXXXXX..................XXXX",
      "XXXXXXXXX^^^^^^XXXXXXXX^^^XXXXXXX.......XXXX.......XXXX",
      "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.......XXXX",
      "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX^^^^^^^XXXX",
      "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    ],
  },
  {
    id: "legacy-crossing",
    bounds: { x: 55 * WORLD.tile, y: 30 * WORLD.tile, w: 45 * WORLD.tile, h: 30 * WORLD.tile },
    rows: [
      "XXXXXXXX...XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      "XXXXX......XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      "XXX........XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      "XXX.....................................XXXXX",
      "X.......................................XXXXX",
      "X.......XXX.............................XXXXX",
      "X.......................................XXXXX",
      ".......^^^^^^^^^^^^^^^^^^...............XXXXX",
      ".......XXXXXXXXXXXXXXXXXX...............XXXXX",
      "S.......................................XXXXX",
      "........................................XXXXX",
      "XX....................................XXXXXXX",
      "XX....................................XXXXXXX",
      "XX........XXXXXXX...................XXXXXXXXX",
      "XX.=======XXXXXXXSSS................XXXXXXXXX",
      "XX........XXXXXXX...................XXXXXXXXX",
      "XX........XXXXXXX...................XXXXXXXXX",
      "XX.1......XXXXXXX...................XXXXXXXXX",
      "XX........XXXXXXX...................XXXXXXXXX",
      "XX........XXXXXXX...................XXXXXXXXX",
      "XX........XXXXXXX...................XXXXXXXXX",
      "XX........XXXXXXX...................XXXXXXXXX",
      "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
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
  return buildLevelFromBlueprints(ROOM_BLUEPRINTS);
}

export function buildLevelFromBlueprints(
  blueprints: readonly LevelRoomBlueprint[],
): LevelData {
  const entities: LevelEntitySpec[] = [];
  const rooms: LevelRoom[] = [];
  const spawnInsetX = Math.floor((WORLD.tile - PLAYER_GEOMETRY.hitboxW) * 0.5);
  let worldCols = 0;
  let worldRows = 0;
  let startCheckpoint: { x: number; y: number } | null = null;
  let hasExplicitInitialSpawn = false;

  for (const blueprint of blueprints) {
    const metrics = roomMetrics(blueprint.bounds);
    const rows = normalizeRoomRows(blueprint.rows, metrics.cols, metrics.rows);
    let checkpoint: { x: number; y: number } | null = null;

    for (let r = 0; r < metrics.rows; r++) {
      const line = rows[r];
      for (let c = 0; c < metrics.cols; c++) {
        const ch = line[c] || ".";
        const col = metrics.offsetCol + c;
        const row = metrics.offsetRow + r;

        if (ch === "X") {
          entities.push({ kind: "solidTile", col, row });
          continue;
        }

        if (ch === "=") {
          entities.push({ kind: "jumpThruTile", col, row });
          continue;
        }

        if (ch === "S") {
          checkpoint ??= {
            x: col * WORLD.tile + spawnInsetX + PLAYER_GEOMETRY.hitboxW * 0.5,
            y: row * WORLD.tile + PLAYER_GEOMETRY.hitboxH,
          };
          if (!hasExplicitInitialSpawn) {
            startCheckpoint ??= checkpoint;
          }
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

    if (blueprint.initialSpawn) {
      if (checkpoint === null) {
        throw new Error(`Room "${blueprint.id}" is marked as the initial spawn room but has no checkpoint`);
      }
      startCheckpoint = checkpoint;
      hasExplicitInitialSpawn = true;
    }

    worldCols = Math.max(worldCols, metrics.offsetCol + metrics.cols);
    worldRows = Math.max(worldRows, metrics.offsetRow + metrics.rows);
    rooms.push({
      id: blueprint.id,
      cols: metrics.cols,
      rows: metrics.rows,
      bounds: { ...blueprint.bounds },
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
  probe?: number,
): LevelRoom | null {
  const bounds = room.bounds;
  const candidates: LevelRoom[] = [];

  for (const candidate of rooms) {
    if (candidate.id === room.id) {
      continue;
    }

    const other = candidate.bounds;
    if (direction === "left" &&
      other.x + other.w === bounds.x &&
      rangesOverlap(other.y, other.y + other.h, bounds.y, bounds.y + bounds.h)) {
      candidates.push(candidate);
    }
    if (direction === "right" &&
      other.x === bounds.x + bounds.w &&
      rangesOverlap(other.y, other.y + other.h, bounds.y, bounds.y + bounds.h)) {
      candidates.push(candidate);
    }
    if (direction === "up" &&
      other.y + other.h === bounds.y &&
      rangesOverlap(other.x, other.x + other.w, bounds.x, bounds.x + bounds.w)) {
      candidates.push(candidate);
    }
    if (direction === "down" &&
      other.y === bounds.y + bounds.h &&
      rangesOverlap(other.x, other.x + other.w, bounds.x, bounds.x + bounds.w)) {
      candidates.push(candidate);
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  const sorted = candidates.sort((a, b) => {
    if (direction === "left" || direction === "right") {
      return a.bounds.y - b.bounds.y;
    }
    return a.bounds.x - b.bounds.x;
  });

  if (probe !== undefined) {
    for (const candidate of sorted) {
      if (direction === "left" || direction === "right") {
        if (probe >= candidate.bounds.y && probe < candidate.bounds.y + candidate.bounds.h) {
          return candidate;
        }
      } else if (probe >= candidate.bounds.x && probe < candidate.bounds.x + candidate.bounds.w) {
        return candidate;
      }
    }
  }

  return sorted[0] ?? null;
}

function roomMetrics(bounds: Aabb): { offsetCol: number; offsetRow: number; cols: number; rows: number } {
  assertAligned(bounds.x, "room x");
  assertAligned(bounds.y, "room y");
  assertAligned(bounds.w, "room width");
  assertAligned(bounds.h, "room height");

  return {
    offsetCol: bounds.x / WORLD.tile,
    offsetRow: bounds.y / WORLD.tile,
    cols: bounds.w / WORLD.tile,
    rows: bounds.h / WORLD.tile,
  };
}

function normalizeRoomRows(rows: readonly string[], cols: number, rowCount: number): string[] {
  const out: string[] = [];
  for (let r = 0; r < rowCount; r++) {
    const line = rows[r] ?? "";
    out.push(line.padEnd(cols, ".").slice(0, cols));
  }
  return out;
}

function assertAligned(value: number, label: string): void {
  if (value % WORLD.tile !== 0) {
    throw new Error(`${label} must align to the ${WORLD.tile}px tile size`);
  }
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
