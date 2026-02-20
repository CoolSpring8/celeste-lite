export function approach(current: number, target: number, maxDelta: number): number {
  return current < target
    ? Math.min(current + maxDelta, target)
    : Math.max(current - maxDelta, target);
}

const EIGHT_WAY_DIRECTIONS: Array<{ x: number; y: number }> = [
  { x: 1, y: 0 },
  { x: Math.SQRT1_2, y: Math.SQRT1_2 },
  { x: 0, y: 1 },
  { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
  { x: -1, y: 0 },
  { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
  { x: 0, y: -1 },
  { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
];

const EIGHT_WAY_STEP = Math.PI / 4;

export function dashDirection(
  inputX: number,
  inputY: number,
  facing: number,
): { x: number; y: number } {
  let dx = inputX;
  let dy = inputY;

  if (dx === 0 && dy === 0) dx = facing;

  const angle = Math.atan2(dy, dx);
  const snappedIndex = Math.round(angle / EIGHT_WAY_STEP);
  const wrapped = ((snappedIndex % 8) + 8) % 8;
  return EIGHT_WAY_DIRECTIONS[wrapped];
}
