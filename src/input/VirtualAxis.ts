import { VirtualInput, VirtualInputNode } from "./VirtualInput";

export abstract class VirtualAxisNode extends VirtualInputNode {
  abstract get value(): number;
}

export class VirtualAxis extends VirtualInput {
  readonly nodes: VirtualAxisNode[];
  value = 0;
  previousValue = 0;

  constructor(...nodes: VirtualAxisNode[]) {
    super();
    this.nodes = nodes;
  }

  update(_dt: number): void {
    for (const node of this.nodes) {
      node.update();
    }

    this.previousValue = this.value;
    this.value = 0;
    for (const node of this.nodes) {
      const value = node.value;
      if (value !== 0) {
        this.value = value;
        break;
      }
    }
  }

  override reset(): void {
    this.value = 0;
    this.previousValue = 0;
  }
}
