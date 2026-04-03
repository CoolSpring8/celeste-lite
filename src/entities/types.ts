export type RefillType = number | "max";

export type SpikeDirection = "up" | "down" | "left" | "right";

export interface Aabb {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type LevelEntitySpec =
  | { kind: "solidTile"; col: number; row: number }
  | { kind: "jumpThruTile"; col: number; row: number }
  | { kind: "refill"; x: number; y: number; type: RefillType }
  | { kind: "spike"; col: number; row: number; dir: SpikeDirection };
