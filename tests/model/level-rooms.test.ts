import { describe, expect, test } from "bun:test";
import { PLAYER_GEOMETRY, WORLD } from "../../src/constants.ts";
import {
  buildLevelFromBlueprints,
  findAdjacentRoom,
  findRoomAtPoint,
  type LevelRoom,
  type LevelRoomBlueprint,
} from "../../src/level.ts";

describe("Level room mechanics", () => {
  test("builds rooms from authored bounds and prefers the explicit initial spawn room", () => {
    const blueprints: LevelRoomBlueprint[] = [
      {
        id: "upper-left",
        bounds: { x: 0, y: 0, w: 3 * WORLD.tile, h: 2 * WORLD.tile },
        rows: [
          "S.S",
          "...",
        ],
      },
      {
        id: "upper-right",
        bounds: { x: 3 * WORLD.tile, y: 0, w: 5 * WORLD.tile, h: 2 * WORLD.tile },
        initialSpawn: true,
        rows: [
          "..S..",
          ".....",
        ],
      },
      {
        id: "lower",
        bounds: { x: 0, y: 2 * WORLD.tile, w: 8 * WORLD.tile, h: 3 * WORLD.tile },
        rows: [
          "........",
          ".1......",
          "........",
        ],
      },
    ];

    const level = buildLevelFromBlueprints(blueprints);
    const roomById = new Map(level.rooms.map((room) => [room.id, room]));
    const initialRoom = roomById.get("upper-right");
    const nonInitialRoom = roomById.get("upper-left");

    expect(level.world.cols).toBe(8);
    expect(level.world.rows).toBe(5);
    expect(initialRoom?.bounds).toEqual(blueprints[1]!.bounds);
    expect(nonInitialRoom?.checkpoint).toEqual({
      x: 0 * WORLD.tile + Math.floor((WORLD.tile - PLAYER_GEOMETRY.hitboxW) * 0.5) + PLAYER_GEOMETRY.hitboxW * 0.5,
      y: 0 * WORLD.tile + WORLD.tile,
    });
    expect(initialRoom?.checkpoint).toEqual({
      x: 5 * WORLD.tile + Math.floor((WORLD.tile - PLAYER_GEOMETRY.hitboxW) * 0.5) + PLAYER_GEOMETRY.hitboxW * 0.5,
      y: 0 * WORLD.tile + WORLD.tile,
    });
    expect(level.spawnX).toBe(initialRoom?.checkpoint?.x);
    expect(level.spawnY).toBe(initialRoom?.checkpoint?.y);
  });

  test("snaps checkpoint spawns down to the nearest grounded slot inside the room", () => {
    const level = buildLevelFromBlueprints([
      {
        id: "grounded",
        bounds: { x: 0, y: 0, w: 5 * WORLD.tile, h: 5 * WORLD.tile },
        initialSpawn: true,
        rows: [
          "..S..",
          ".....",
          ".....",
          "XXXXX",
          "XXXXX",
        ],
      },
    ]);

    expect(level.spawnX).toBe(2 * WORLD.tile + PLAYER_GEOMETRY.hitboxW * 0.5);
    expect(level.spawnY).toBe(3 * WORLD.tile);
  });

  test("finds rooms by point and resolves multiple shared-edge neighbors using the probe", () => {
    const rooms: LevelRoom[] = [
      {
        id: "top-left",
        cols: 4,
        rows: 3,
        bounds: { x: 0, y: 0, w: 4 * WORLD.tile, h: 3 * WORLD.tile },
        checkpoint: null,
      },
      {
        id: "top-right",
        cols: 4,
        rows: 3,
        bounds: { x: 4 * WORLD.tile, y: 0, w: 4 * WORLD.tile, h: 3 * WORLD.tile },
        checkpoint: null,
      },
      {
        id: "bottom-left",
        cols: 5,
        rows: 3,
        bounds: { x: 0, y: 3 * WORLD.tile, w: 5 * WORLD.tile, h: 3 * WORLD.tile },
        checkpoint: null,
      },
      {
        id: "bottom-right",
        cols: 3,
        rows: 3,
        bounds: { x: 5 * WORLD.tile, y: 3 * WORLD.tile, w: 3 * WORLD.tile, h: 3 * WORLD.tile },
        checkpoint: null,
      },
    ];

    expect(findRoomAtPoint(rooms, WORLD.tile, WORLD.tile)).toBe(rooms[0]);
    expect(findRoomAtPoint(rooms, 6 * WORLD.tile, WORLD.tile)).toBe(rooms[1]);
    expect(findRoomAtPoint(rooms, 2 * WORLD.tile, 4 * WORLD.tile)).toBe(rooms[2]);
    expect(findRoomAtPoint(rooms, 6 * WORLD.tile, 4 * WORLD.tile)).toBe(rooms[3]);
    expect(findRoomAtPoint(rooms, -1, WORLD.tile)).toBeNull();

    expect(findAdjacentRoom(rooms, rooms[0]!, "right")).toBe(rooms[1]);
    expect(findAdjacentRoom(rooms, rooms[1]!, "left")).toBe(rooms[0]);
    expect(findAdjacentRoom(rooms, rooms[1]!, "down", 4.5 * WORLD.tile)).toBe(rooms[2]);
    expect(findAdjacentRoom(rooms, rooms[1]!, "down", 6.5 * WORLD.tile)).toBe(rooms[3]);
    expect(findAdjacentRoom(rooms, rooms[0]!, "left")).toBeNull();
  });
});
