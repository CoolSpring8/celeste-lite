export function approach(current: number, target: number, maxDelta: number): number {
  return current < target
    ? Math.min(current + maxDelta, target)
    : Math.max(current - maxDelta, target);
}

export function dashDirection(
  inputX: number,
  inputY: number,
  facing: number,
): { x: number; y: number } {
  let dx = inputX;
  let dy = inputY;

  if (dx === 0 && dy === 0) dx = facing;

  const len = Math.sqrt(dx * dx + dy * dy);
  return { x: dx / len, y: dy / len };
}
