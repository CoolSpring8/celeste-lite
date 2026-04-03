import { describe, expect, test } from "bun:test";
import { ButtonBank } from "../../src/input/ButtonBank.ts";
import { PlayerControls } from "../../src/input/PlayerControls.ts";
import { VirtualButton } from "../../src/input/VirtualButton.ts";
import { ButtonBindingNode } from "../../src/input/nodes.ts";
import { DT } from "../support/harness.ts";

describe("Input model", () => {
  test("virtual buttons buffer held presses and clear once the button is released", () => {
    const bank = new ButtonBank(["jump"]);
    const jump = new VirtualButton(0.1, new ButtonBindingNode(bank, "jump"));

    bank.setCheck("jump", true);
    bank.queuePress("jump");
    bank.beginStep();
    jump.update(DT);
    expect(jump.check).toBeTrue();
    expect(jump.pressed).toBeTrue();

    bank.setCheck("jump", true);
    bank.beginStep();
    jump.update(DT);
    expect(jump.check).toBeTrue();
    expect(jump.pressed).toBeTrue();

    bank.setCheck("jump", false);
    bank.queueRelease("jump");
    bank.beginStep();
    jump.update(DT);
    expect(jump.check).toBeFalse();
    expect(jump.released).toBeTrue();
    expect(jump.pressed).toBeFalse();
  });

  test("player controls use TakeNewer resolution for opposing horizontal inputs", () => {
    const controls = new PlayerControls();

    controls.setCheck("leftArrow", true);
    const first = controls.update(DT);
    expect(first.x).toBe(-1);
    expect(first.aimX).toBe(-1);

    controls.setCheck("rightArrow", true);
    const newer = controls.update(DT);
    expect(newer.x).toBe(1);
    expect(newer.aimX).toBe(1);

    controls.setCheck("rightArrow", false);
    const fallback = controls.update(DT);
    expect(fallback.x).toBe(-1);
    expect(fallback.aimX).toBe(-1);
  });

  test("player controls feed button press and release edges across fixed steps", () => {
    const controls = new PlayerControls();

    controls.setCheck("jump", true);
    controls.queuePress("jump");
    const first = controls.update(DT);
    expect(first.jump).toBeTrue();
    expect(first.jumpPressed).toBeTrue();

    controls.setCheck("jump", true);
    const held = controls.update(DT);
    expect(held.jump).toBeTrue();
    expect(held.jumpPressed).toBeFalse();

    controls.setCheck("jump", false);
    controls.queueRelease("jump");
    const released = controls.update(DT);
    expect(released.jump).toBeFalse();
    expect(released.jumpReleased).toBeTrue();
  });
});
