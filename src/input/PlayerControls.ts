import { ButtonBank } from "./ButtonBank";
import { VirtualButton } from "./VirtualButton";
import { VirtualIntegerAxis } from "./VirtualIntegerAxis";
import { VirtualJoystick } from "./VirtualJoystick";
import { AxisButtonsNode, ButtonBindingNode, JoystickButtonsNode } from "./nodes";
import { OverlapBehavior } from "./VirtualInput";
import type { InputState } from "../player/types";

export type PlayerBinding =
  | "leftArrow"
  | "rightArrow"
  | "upArrow"
  | "downArrow"
  | "grab"
  | "dash"
  | "jump";

const PLAYER_BINDINGS: readonly PlayerBinding[] = [
  "leftArrow",
  "rightArrow",
  "upArrow",
  "downArrow",
  "grab",
  "dash",
  "jump",
];

export class PlayerControls {
  private readonly bank = new ButtonBank(PLAYER_BINDINGS);

  private readonly moveX = new VirtualIntegerAxis(
    new AxisButtonsNode(this.bank, OverlapBehavior.TakeNewer, "leftArrow", "rightArrow"),
  );

  private readonly moveY = new VirtualIntegerAxis(
    new AxisButtonsNode(this.bank, OverlapBehavior.TakeNewer, "upArrow", "downArrow"),
  );

  private readonly aim = new VirtualJoystick(
    false,
    new JoystickButtonsNode(
      this.bank,
      OverlapBehavior.TakeNewer,
      "leftArrow",
      "rightArrow",
      "upArrow",
      "downArrow",
    ),
  );

  private readonly jump = new VirtualButton(0, new ButtonBindingNode(this.bank, "jump"));
  private readonly dash = new VirtualButton(0, new ButtonBindingNode(this.bank, "dash"));
  private readonly grab = new VirtualButton(0, new ButtonBindingNode(this.bank, "grab"));

  setCheck(binding: PlayerBinding, value: boolean): void {
    this.bank.setCheck(binding, value);
  }

  queuePress(binding: PlayerBinding): void {
    this.bank.queuePress(binding);
  }

  queueRelease(binding: PlayerBinding): void {
    this.bank.queueRelease(binding);
  }

  update(dt: number): InputState {
    this.bank.beginStep();
    this.moveX.update(dt);
    this.moveY.update(dt);
    this.aim.update(dt);
    this.jump.update(dt);
    this.dash.update(dt);
    this.grab.update(dt);

    const aim = this.aim.value;

    return {
      x: this.moveX.value,
      y: this.moveY.value,
      aimX: aim.x,
      aimY: aim.y,
      jump: this.jump.check,
      jumpPressed: this.jump.pressed,
      jumpReleased: this.jump.released,
      dash: this.dash.check,
      dashPressed: this.dash.pressed,
      grab: this.grab.check,
    };
  }

  clearTransientState(): void {
    this.bank.clearQueues();
    this.jump.reset();
    this.dash.reset();
    this.grab.reset();
  }

  reset(): void {
    this.bank.reset();
    this.moveX.reset();
    this.moveY.reset();
    this.aim.reset();
    this.jump.reset();
    this.dash.reset();
    this.grab.reset();
  }
}
