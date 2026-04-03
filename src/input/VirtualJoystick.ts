import { VirtualInput, VirtualInputNode } from "./VirtualInput";

export interface VirtualVector {
  x: number;
  y: number;
}

const ZERO: VirtualVector = { x: 0, y: 0 };

function snapVector(value: VirtualVector, slices: number, normalized: boolean): VirtualVector {
  if (slices <= 0) return value;

  const len = Math.hypot(value.x, value.y);
  if (len <= 0.00001) return ZERO;

  const step = (Math.PI * 2) / slices;
  const angle = Math.atan2(value.y, value.x);
  const snapped = Math.round(angle / step) * step;
  const scale = normalized ? 1 : len;
  return {
    x: Math.cos(snapped) * scale,
    y: Math.sin(snapped) * scale,
  };
}

export abstract class VirtualJoystickNode extends VirtualInputNode {
  abstract get value(): VirtualVector;
}

export class VirtualJoystick extends VirtualInput {
  readonly nodes: VirtualJoystickNode[];
  readonly normalized: boolean;
  snapSlices?: number;
  value: VirtualVector = ZERO;
  previousValue: VirtualVector = ZERO;

  constructor(normalized: boolean, ...nodes: VirtualJoystickNode[]) {
    super();
    this.nodes = nodes;
    this.normalized = normalized;
  }

  update(_dt: number): void {
    for (const node of this.nodes) {
      node.update();
    }

    this.previousValue = { x: this.value.x, y: this.value.y };
    this.value = { x: 0, y: 0 };
    for (const node of this.nodes) {
      const raw = node.value;
      if (raw.x === 0 && raw.y === 0) {
        continue;
      }

      let next = raw;
      if (this.normalized) {
        if (this.snapSlices !== undefined) {
          next = snapVector(next, this.snapSlices, true);
        } else {
          const len = Math.hypot(next.x, next.y);
          if (len > 0.00001) {
            next = { x: next.x / len, y: next.y / len };
          }
        }
      } else if (this.snapSlices !== undefined) {
        next = snapVector(next, this.snapSlices, false);
      }

      this.value = { x: next.x, y: next.y };
      break;
    }
  }

  override reset(): void {
    this.value = { x: 0, y: 0 };
    this.previousValue = { x: 0, y: 0 };
  }
}
