import { ButtonBank } from "./ButtonBank";
import { VirtualButtonNode } from "./VirtualButton";
import { VirtualAxisNode } from "./VirtualAxis";
import { VirtualIntegerAxisNode } from "./VirtualIntegerAxis";
import { VirtualJoystickNode, VirtualVector } from "./VirtualJoystick";
import { OverlapBehavior } from "./VirtualInput";

export class ButtonBindingNode extends VirtualButtonNode {
  constructor(
    private readonly bank: ButtonBank,
    private readonly name: string,
  ) {
    super();
  }

  get check(): boolean {
    return this.bank.get(this.name).check;
  }

  get pressed(): boolean {
    return this.bank.get(this.name).pressed;
  }

  get released(): boolean {
    return this.bank.get(this.name).released;
  }
}

export class AxisButtonsNode extends VirtualAxisNode implements VirtualIntegerAxisNode {
  private valueState = 0;
  private turned = false;

  constructor(
    private readonly bank: ButtonBank,
    private readonly overlapBehavior: OverlapBehavior,
    private readonly negative: string,
    private readonly positive: string,
  ) {
    super();
  }

  override update(): void {
    const positive = this.bank.get(this.positive).check;
    const negative = this.bank.get(this.negative).check;

    if (positive) {
      if (negative) {
        switch (this.overlapBehavior) {
          case OverlapBehavior.TakeNewer:
            if (!this.turned) {
              this.valueState *= -1;
              this.turned = true;
            }
            break;
          case OverlapBehavior.TakeOlder:
            break;
          case OverlapBehavior.CancelOut:
          default:
            this.valueState = 0;
            break;
        }
      } else {
        this.turned = false;
        this.valueState = 1;
      }
    } else if (negative) {
      this.turned = false;
      this.valueState = -1;
    } else {
      this.turned = false;
      this.valueState = 0;
    }
  }

  get value(): number {
    return this.valueState;
  }
}

export class JoystickButtonsNode extends VirtualJoystickNode {
  private turnedX = false;
  private turnedY = false;
  private readonly valueState: VirtualVector = { x: 0, y: 0 };

  constructor(
    private readonly bank: ButtonBank,
    private readonly overlapBehavior: OverlapBehavior,
    private readonly left: string,
    private readonly right: string,
    private readonly up: string,
    private readonly down: string,
  ) {
    super();
  }

  override update(): void {
    const left = this.bank.get(this.left).check;
    const right = this.bank.get(this.right).check;
    const up = this.bank.get(this.up).check;
    const down = this.bank.get(this.down).check;

    if (left) {
      if (right) {
        switch (this.overlapBehavior) {
          case OverlapBehavior.TakeNewer:
            if (!this.turnedX) {
              this.valueState.x *= -1;
              this.turnedX = true;
            }
            break;
          case OverlapBehavior.TakeOlder:
            break;
          case OverlapBehavior.CancelOut:
          default:
            this.valueState.x = 0;
            break;
        }
      } else {
        this.turnedX = false;
        this.valueState.x = -1;
      }
    } else if (right) {
      this.turnedX = false;
      this.valueState.x = 1;
    } else {
      this.turnedX = false;
      this.valueState.x = 0;
    }

    if (up) {
      if (down) {
        switch (this.overlapBehavior) {
          case OverlapBehavior.TakeNewer:
            if (!this.turnedY) {
              this.valueState.y *= -1;
              this.turnedY = true;
            }
            break;
          case OverlapBehavior.TakeOlder:
            break;
          case OverlapBehavior.CancelOut:
          default:
            this.valueState.y = 0;
            break;
        }
      } else {
        this.turnedY = false;
        this.valueState.y = -1;
      }
    } else if (down) {
      this.turnedY = false;
      this.valueState.y = 1;
    } else {
      this.turnedY = false;
      this.valueState.y = 0;
    }
  }

  get value(): VirtualVector {
    return this.valueState;
  }
}
