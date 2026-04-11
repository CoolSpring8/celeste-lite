import { PLAYER_GEOMETRY, WORLD } from "./constants";
import type { CollisionWorld } from "./entities/CollisionWorld";
import type { Aabb } from "./entities/types";

export interface SpawnPoint {
  x: number;
  y: number;
}

export function resolveGroundedSpawnPoint(
  world: CollisionWorld,
  roomBounds: Aabb,
  authored: SpawnPoint,
): SpawnPoint {
  const maxSearch = Math.max(roomBounds.h + WORLD.tile, PLAYER_GEOMETRY.hitboxH + WORLD.tile);
  let fallback: SpawnPoint | null = null;

  for (let delta = 0; delta <= maxSearch; delta++) {
    const candidates = delta === 0
      ? [authored.y]
      : [authored.y + delta, authored.y - delta];

    for (const y of candidates) {
      const candidate = { x: authored.x, y };
      if (!spawnFits(world, candidate)) {
        continue;
      }

      if (isGroundedSpawn(world, candidate)) {
        return candidate;
      }

      fallback ??= candidate;
    }
  }

  return fallback ?? authored;
}

function isGroundedSpawn(world: CollisionWorld, point: SpawnPoint): boolean {
  const bounds = spawnBounds(point);
  return world.probeGround(bounds.x, bounds.y, bounds.w, bounds.h).onGround;
}

function spawnFits(world: CollisionWorld, point: SpawnPoint): boolean {
  const bounds = spawnBounds(point);
  return !world.collideSolidAt(bounds.x, bounds.y, bounds.w, bounds.h) &&
    !world.collidesWithSpikeAt(bounds.x, bounds.y, bounds.w, bounds.h, 0, 0);
}

function spawnBounds(point: SpawnPoint): Aabb {
  return {
    x: point.x - PLAYER_GEOMETRY.hitboxW * 0.5,
    y: point.y - PLAYER_GEOMETRY.hitboxH,
    w: PLAYER_GEOMETRY.hitboxW,
    h: PLAYER_GEOMETRY.hitboxH,
  };
}
