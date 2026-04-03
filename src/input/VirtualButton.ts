import { VirtualInput, VirtualInputNode } from "./VirtualInput";

export abstract class VirtualButtonNode extends VirtualInputNode {
  abstract get check(): boolean;
  abstract get pressed(): boolean;
  abstract get released(): boolean;
}

export class VirtualButton extends VirtualInput {
  readonly nodes: VirtualButtonNode[];
  readonly bufferTime: number;

  private firstRepeatTime = 0;
  private multiRepeatTime = 0;
  private bufferCounter = 0;
  private repeatCounter = 0;
  private canRepeat = false;
  private consumed = false;
  private repeating = false;
  private checkValue = false;
  private pressedValue = false;
  private releasedValue = false;

  constructor(bufferTime = 0, ...nodes: VirtualButtonNode[]) {
    super();
    this.bufferTime = bufferTime;
    this.nodes = nodes;
  }

  setRepeat(firstRepeatTime: number, multiRepeatTime = firstRepeatTime): void {
    this.firstRepeatTime = firstRepeatTime;
    this.multiRepeatTime = multiRepeatTime;
    this.canRepeat = this.firstRepeatTime > 0;
    if (!this.canRepeat) {
      this.repeating = false;
    }
  }

  update(dt: number): void {
    this.consumed = false;
    this.bufferCounter = Math.max(0, this.bufferCounter - dt);

    let active = false;
    let check = false;
    let pressed = false;
    let released = false;

    for (const node of this.nodes) {
      node.update();

      if (node.pressed) {
        this.bufferCounter = this.bufferTime;
        active = true;
        pressed = true;
      } else if (node.check) {
        active = true;
      }

      if (node.check) {
        check = true;
      }

      if (node.released) {
        released = true;
      }
    }

    if (!active) {
      this.repeating = false;
      this.repeatCounter = 0;
      this.bufferCounter = 0;
    } else if (this.canRepeat) {
      this.repeating = false;
      if (this.repeatCounter === 0) {
        this.repeatCounter = this.firstRepeatTime;
      } else {
        this.repeatCounter -= dt;
        if (this.repeatCounter <= 0) {
          this.repeating = true;
          this.repeatCounter = this.multiRepeatTime;
        }
      }
    }

    this.checkValue = check;
    this.pressedValue = pressed;
    this.releasedValue = released;
  }

  get check(): boolean {
    return this.checkValue;
  }

  get pressed(): boolean {
    if (this.consumed) return false;
    return this.bufferCounter > 0 || this.repeating || this.pressedValue;
  }

  get released(): boolean {
    return this.releasedValue;
  }

  consumeBuffer(): void {
    this.bufferCounter = 0;
  }

  consumePress(): void {
    this.bufferCounter = 0;
    this.consumed = true;
  }

  override reset(): void {
    this.bufferCounter = 0;
    this.repeatCounter = 0;
    this.repeating = false;
    this.consumed = false;
    this.checkValue = false;
    this.pressedValue = false;
    this.releasedValue = false;
  }
}
