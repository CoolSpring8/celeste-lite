export interface Vec2Like {
  x: number;
  y: number;
}

export const f32 = Math.fround;

const HALF = f32(0.5);
const ZERO = f32(0);
const ONE = f32(1);
const EIGHT_WAY_DIVIDER = f32((Math.PI * 2) / 8);
const EIGHT_WAY_OFFSET = f32(EIGHT_WAY_DIVIDER / 2);

export function toFloat(value: number): number {
  return f32(value);
}

export function addFloat(a: number, b: number): number {
  return f32(a + b);
}

export function subFloat(a: number, b: number): number {
  return f32(a - b);
}

export function mulFloat(a: number, b: number): number {
  return f32(a * b);
}

export function divFloat(a: number, b: number): number {
  return f32(a / b);
}

export function minFloat(a: number, b: number): number {
  return f32(Math.min(a, b));
}

export function maxFloat(a: number, b: number): number {
  return f32(Math.max(a, b));
}

export function clampFloat(value: number, min: number, max: number): number {
  return maxFloat(min, minFloat(value, max));
}

export function clamp01Float(value: number): number {
  return clampFloat(value, ZERO, ONE);
}

export function stepTimer(timer: number, dt: number): number {
  return maxFloat(ZERO, subFloat(timer, dt));
}

export function sign(value: number): number {
  if (value > 0) return 1;
  if (value < 0) return -1;
  return 0;
}

export function roundToEvenInt(value: number): number {
  const floor = Math.floor(value);
  const diff = value - floor;

  if (diff < HALF) return floor;
  if (diff > HALF) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

export function truncateToInt(value: number): number {
  return value < 0 ? Math.ceil(value) : Math.floor(value);
}

export function lerp(from: number, to: number, t: number): number {
  return addFloat(from, mulFloat(subFloat(to, from), t));
}

export function approach(current: number, target: number, maxDelta: number): number {
  const value = toFloat(current);
  const goal = toFloat(target);
  const delta = toFloat(maxDelta);

  return value > goal
    ? maxFloat(subFloat(value, delta), goal)
    : minFloat(addFloat(value, delta), goal);
}

export function angleToVector(angle: number, length = ONE): Vec2Like {
  const scaledLength = toFloat(length);
  return {
    x: mulFloat(Math.cos(angle), scaledLength),
    y: mulFloat(Math.sin(angle), scaledLength),
  };
}

export function eightWayNormal(inputX: number, inputY: number): Vec2Like {
  if (inputX === 0 && inputY === 0) {
    return { x: 0, y: 0 };
  }

  const angle = toFloat(Math.atan2(inputY, inputX));
  const snapped = toFloat(
    Math.floor(toFloat((angle + EIGHT_WAY_OFFSET) / EIGHT_WAY_DIVIDER)) * EIGHT_WAY_DIVIDER,
  );
  const direction = angleToVector(snapped);

  if (Math.abs(direction.x) < HALF) {
    direction.x = 0;
  } else if (Math.abs(direction.y) < HALF) {
    direction.y = 0;
  }

  return {
    x: toFloat(direction.x),
    y: toFloat(direction.y),
  };
}

export function dashDirection(
  inputX: number,
  inputY: number,
  facing: number,
): Vec2Like {
  if (inputX === 0 && inputY === 0) {
    return { x: facing, y: 0 };
  }

  return eightWayNormal(inputX, inputY);
}
