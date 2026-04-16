import type { PlayerState } from "../player/types";

export type Sqrt11Pose = "idle" | "duck";

export interface HairPoint {
  x: number;
  y: number;
}

export interface HairLayout {
  anchor: HairPoint;
  segmentOffset: HairPoint;
  maxDistance: number;
  followRate: number;
}

export interface HairSnapshotLike {
  facing: 1 | -1;
  isCrouched: boolean;
  onGround: boolean;
  state: PlayerState;
  vx: number;
  vy: number;
}

export const SQRT11_HAIR_RADII = [2, 2, 1, 1, 1] as const;

const HAIR_LAYOUTS: Record<Sqrt11Pose, { anchor: HairPoint; segmentOffset: HairPoint; maxDistance: number }> = {
  idle: {
    anchor: { x: -1.5, y: -8.5 },
    segmentOffset: { x: -0.75, y: 1.55 },
    maxDistance: 2.25,
  },
  duck: {
    anchor: { x: -1.0, y: -4.5 },
    segmentOffset: { x: -0.55, y: 0.95 },
    maxDistance: 1.7,
  },
};

const DEFAULT_HAIR_NODE_COUNT: number = SQRT11_HAIR_RADII.length;
const DEFAULT_FOLLOW_RATE = 20;

export function resolveHairLayout(snapshot: HairSnapshotLike): HairLayout {
  const pose = resolveHairPose(snapshot);
  const base = HAIR_LAYOUTS[pose];
  const localVx = snapshot.vx * snapshot.facing;
  let localOffsetX = base.segmentOffset.x + clamp(-localVx / 140, -0.6, 0.7);
  let offsetY = base.segmentOffset.y;

  if (!snapshot.onGround) {
    offsetY += 0.12;
  }

  if (snapshot.vy < 0) {
    offsetY += clamp(-snapshot.vy / 220, 0, 0.55);
  } else if (snapshot.vy > 0) {
    offsetY -= clamp(snapshot.vy / 220, 0, 0.4);
  }

  if (snapshot.state === "dash") {
    localOffsetX -= 0.4;
    offsetY -= 0.45;
  } else if (snapshot.state === "climb") {
    localOffsetX += 0.15;
    offsetY -= 0.1;
  }

  return {
    anchor: {
      x: base.anchor.x * snapshot.facing,
      y: base.anchor.y,
    },
    segmentOffset: {
      x: clamp(localOffsetX, -1.9, 0.35) * snapshot.facing,
      y: clamp(offsetY, 0.45, 2.15),
    },
    maxDistance: base.maxDistance,
    followRate: DEFAULT_FOLLOW_RATE,
  };
}

export function snapHairChain(layout: HairLayout, count = DEFAULT_HAIR_NODE_COUNT): HairPoint[] {
  const points: HairPoint[] = [];
  let previous = layout.anchor;

  for (let i = 0; i < count; i++) {
    const point = i === 0
      ? { ...layout.anchor }
      : {
        x: previous.x + layout.segmentOffset.x,
        y: previous.y + layout.segmentOffset.y,
      };
    points.push(point);
    previous = point;
  }

  return points;
}

export function stepHairChain(
  currentPoints: readonly HairPoint[],
  layout: HairLayout,
  dt: number,
  count = Math.max(currentPoints.length, DEFAULT_HAIR_NODE_COUNT),
): HairPoint[] {
  const next: HairPoint[] = [];
  const follow = clamp(dt * layout.followRate, 0, 1);
  let previous = layout.anchor;

  for (let i = 0; i < count; i++) {
    const target = i === 0
      ? layout.anchor
      : {
        x: previous.x + layout.segmentOffset.x,
        y: previous.y + layout.segmentOffset.y,
      };
    const source = currentPoints[i] ?? target;
    let x = source.x + (target.x - source.x) * follow;
    let y = source.y + (target.y - source.y) * follow;

    const dx = x - target.x;
    const dy = y - target.y;
    const distance = Math.hypot(dx, dy);
    if (distance > layout.maxDistance && distance > 0.0001) {
      const scale = layout.maxDistance / distance;
      x = target.x + dx * scale;
      y = target.y + dy * scale;
    }

    const point = { x, y };
    next.push(point);
    previous = point;
  }

  return next;
}

function resolveHairPose(snapshot: Pick<HairSnapshotLike, "isCrouched">): Sqrt11Pose {
  return snapshot.isCrouched ? "duck" : "idle";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
