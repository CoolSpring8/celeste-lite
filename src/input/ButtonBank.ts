export interface ButtonState {
  check: boolean;
  pressed: boolean;
  released: boolean;
}

interface ButtonTracker {
  check: boolean;
  pressedQueue: number;
  releasedQueue: number;
}

const EMPTY_BUTTON_STATE: ButtonState = {
  check: false,
  pressed: false,
  released: false,
};

export class ButtonBank {
  private readonly trackers = new Map<string, ButtonTracker>();
  private readonly stepStates = new Map<string, ButtonState>();

  constructor(names: readonly string[] = []) {
    for (const name of names) {
      this.register(name);
    }
  }

  register(name: string): void {
    if (this.trackers.has(name)) return;

    this.trackers.set(name, {
      check: false,
      pressedQueue: 0,
      releasedQueue: 0,
    });
    this.stepStates.set(name, EMPTY_BUTTON_STATE);
  }

  setCheck(name: string, value: boolean): void {
    this.ensure(name).check = value;
  }

  queuePress(name: string): void {
    this.ensure(name).pressedQueue++;
  }

  queueRelease(name: string): void {
    this.ensure(name).releasedQueue++;
  }

  beginStep(): void {
    for (const [name, tracker] of this.trackers) {
      const pressed = tracker.pressedQueue > 0;
      const released = tracker.releasedQueue > 0;
      if (pressed) tracker.pressedQueue--;
      if (released) tracker.releasedQueue--;

      this.stepStates.set(name, {
        check: tracker.check,
        pressed,
        released,
      });
    }
  }

  get(name: string): ButtonState {
    return this.stepStates.get(name) ?? EMPTY_BUTTON_STATE;
  }

  clearQueues(): void {
    for (const tracker of this.trackers.values()) {
      tracker.pressedQueue = 0;
      tracker.releasedQueue = 0;
    }

    for (const [name, tracker] of this.trackers) {
      this.stepStates.set(name, {
        check: tracker.check,
        pressed: false,
        released: false,
      });
    }
  }

  reset(): void {
    for (const tracker of this.trackers.values()) {
      tracker.check = false;
      tracker.pressedQueue = 0;
      tracker.releasedQueue = 0;
    }

    for (const name of this.trackers.keys()) {
      this.stepStates.set(name, EMPTY_BUTTON_STATE);
    }
  }

  private ensure(name: string): ButtonTracker {
    this.register(name);
    return this.trackers.get(name)!;
  }
}
