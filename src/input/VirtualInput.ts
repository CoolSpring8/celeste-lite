export enum OverlapBehavior {
  CancelOut,
  TakeOlder,
  TakeNewer,
}

export enum ThresholdMode {
  LargerThan,
  LessThan,
  EqualTo,
}

export abstract class VirtualInput {
  abstract update(dt: number): void;

  reset(): void {
  }
}

export abstract class VirtualInputNode {
  update(): void {
  }
}
