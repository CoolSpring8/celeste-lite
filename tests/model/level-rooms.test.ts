import { describe, expect, test } from "bun:test";
import {
  findAdjacentRoom,
  findRoomAtPoint,
  LEVEL_ROOM_COLS,
  LEVEL_ROOM_ROWS,
  parseLevel,
} from "../../src/level.ts";

describe("Level room layout", () => {
  test("parses multiple stitched rooms with room-local checkpoints", () => {
    const level = parseLevel();

    expect(level.rooms).toHaveLength(2);
    expect(level.world.cols).toBe(LEVEL_ROOM_COLS * 2);
    expect(level.world.rows).toBe(LEVEL_ROOM_ROWS);
    expect(level.rooms[0]?.checkpoint).not.toBeNull();
    expect(level.rooms[1]?.checkpoint).not.toBeNull();
    expect(level.spawnX).toBe(level.rooms[0]?.checkpoint?.x);
    expect(level.spawnY).toBe(level.rooms[0]?.checkpoint?.y);
  });

  test("finds the active room and adjacent room across the room seam", () => {
    const level = parseLevel();
    const [leftRoom, rightRoom] = level.rooms;

    expect(leftRoom).toBeDefined();
    expect(rightRoom).toBeDefined();

    const leftProbeX = leftRoom!.bounds.x + 24;
    const rightProbeX = rightRoom!.bounds.x + 24;
    const probeY = leftRoom!.bounds.y + leftRoom!.bounds.h * 0.5;

    expect(findRoomAtPoint(level.rooms, leftProbeX, probeY)).toBe(leftRoom);
    expect(findRoomAtPoint(level.rooms, rightProbeX, probeY)).toBe(rightRoom);
    expect(findRoomAtPoint(level.rooms, rightRoom!.bounds.x, probeY)).toBe(rightRoom);
    expect(findAdjacentRoom(level.rooms, leftRoom!, "right")).toBe(rightRoom);
    expect(findAdjacentRoom(level.rooms, rightRoom!, "left")).toBe(leftRoom);
    expect(findAdjacentRoom(level.rooms, leftRoom!, "left")).toBeNull();
  });
});
