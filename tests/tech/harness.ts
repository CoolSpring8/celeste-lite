import { PLAYER_CONFIG, PLAYER_GEOMETRY, WORLD } from "../../src/constants.ts";
import { EntityWorld } from "../../src/entities/EntityWorld.ts";
import type { LevelEntitySpec } from "../../src/entities/types.ts";
import { Player } from "../../src/player/Player.ts";
import type { InputState, PlayerEffect, PlayerSnapshot } from "../../src/player/types.ts";

export const DT = 1 / 60;
const freezeTimers = new WeakMap<Player, number>();

export interface StepResult {
  snapshot: PlayerSnapshot;
  effects: PlayerEffect[];
}

export function makeInput(partial: Partial<InputState> = {}): InputState {
  return {
    x: 0,
    y: 0,
    jump: false,
    jumpPressed: false,
    jumpReleased: false,
    dashPressed: false,
    grab: false,
    ...partial,
  };
}

export function withFloor(specs: LevelEntitySpec[], row = 20, fromCol = 0, toCol = WORLD.cols - 1): void {
  for (let col = fromCol; col <= toCol; col++) {
    specs.push({ kind: "solidTile", col, row });
  }
}

export function buildWorld(specs: LevelEntitySpec[]): EntityWorld {
  return EntityWorld.fromSpecs(WORLD.cols, WORLD.rows, specs);
}

export function createPlayer(
  world: EntityWorld,
  x: number,
  y: number,
): Player {
  return new Player(x, y, world, PLAYER_CONFIG);
}

export function createPlayerOnFloor(
  world: EntityWorld,
  x = 100,
  floorRow = 20,
): Player {
  return createPlayer(world, x, floorRow * WORLD.tile - PLAYER_GEOMETRY.hitboxH);
}

export function step(player: Player, input: InputState, frames = 1): StepResult[] {
  const out: StepResult[] = [];
  for (let i = 0; i < frames; i++) {
    const freezeTimer = freezeTimers.get(player) ?? 0;
    if (freezeTimer > 0) {
      freezeTimers.set(player, Math.max(0, freezeTimer - DT));
      out.push({
        snapshot: player.getSnapshot(),
        effects: [],
      });
      continue;
    }

    player.update(DT, input);
    const freeze = player.consumeFreezeRequest();
    if (freeze > 0) {
      freezeTimers.set(player, freeze);
    }

    out.push({
      snapshot: player.getSnapshot(),
      effects: player.consumeEffects(),
    });
  }
  return out;
}

export function stepOnce(player: Player, input: InputState): StepResult {
  return step(player, input, 1)[0];
}
