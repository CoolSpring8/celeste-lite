export type RefillType = number | "max";

export type SpikeDirection = "up" | "down" | "left" | "right";

export type EntityKind = "solidTile" | "jumpThruTile" | "refill" | "spike";

export interface Aabb {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BaseEntity {
  id: number;
  kind: EntityKind;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SolidTileEntity extends BaseEntity {
  kind: "solidTile";
  col: number;
  row: number;
}

export interface JumpThruTileEntity extends BaseEntity {
  kind: "jumpThruTile";
  col: number;
  row: number;
}

export interface RefillEntity extends BaseEntity {
  kind: "refill";
  type: RefillType;
  active: boolean;
  baseY: number;
  respawnTimer: number;
  respawnDelay: number;
}

export interface SpikeEntity extends BaseEntity {
  kind: "spike";
  dir: SpikeDirection;
}

export type TileEntity = SolidTileEntity | JumpThruTileEntity;
export type WorldEntity = TileEntity | RefillEntity | SpikeEntity;

export type LevelEntitySpec =
  | { kind: "solidTile"; col: number; row: number }
  | { kind: "jumpThruTile"; col: number; row: number }
  | { kind: "refill"; x: number; y: number; type: RefillType }
  | { kind: "spike"; col: number; row: number; dir: SpikeDirection };
