import { PLAYER_CONFIG, WORLD } from "../../src/constants.ts";
import { EntityWorld } from "../../src/entities/EntityWorld.ts";
import type { LevelEntitySpec } from "../../src/entities/types.ts";
import { Player } from "../../src/player/Player.ts";
import type { InputState, PlayerEffect, PlayerSnapshot } from "../../src/player/types.ts";

export const DT = 1 / 60;
const f32 = Math.fround;
const freezeTimers = new WeakMap<Player, number>();

export interface StepResult {
  snapshot: PlayerSnapshot;
  effects: PlayerEffect[];
}

export function makeInput(partial: Partial<InputState> = {}): InputState {
  const x = partial.x ?? 0;
  const y = partial.y ?? 0;
  const jump = partial.jump ?? !!partial.jumpPressed;
  const dash = partial.dash ?? !!partial.dashPressed;

  return {
    x,
    y,
    aimX: partial.aimX ?? x,
    aimY: partial.aimY ?? y,
    jump,
    jumpPressed: false,
    jumpReleased: false,
    dash,
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
  return createPlayer(world, x, floorRow * WORLD.tile);
}

export function step(player: Player, input: InputState, frames = 1): StepResult[] {
  const out: StepResult[] = [];
  for (let i = 0; i < frames; i++) {
    const freezeTimer = freezeTimers.get(player) ?? 0;
    if (freezeTimer > 0) {
      freezeTimers.set(player, f32(Math.max(0, f32(freezeTimer - f32(DT)))));
      out.push({
        snapshot: player.getSnapshot(),
        effects: [],
      });
      continue;
    }

    player.update(DT, input);
    const freeze = player.consumeFreezeRequest();
    if (freeze > 0) {
      freezeTimers.set(player, f32(freeze));
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
