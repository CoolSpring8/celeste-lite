import { describe, expect, test } from "bun:test";
import {
  currentPauseOptionValue,
  PauseMenuController,
  type PauseActionMenu,
  type PauseMenuOption,
  type PauseOptionsMenu,
} from "../../src/pause/menu.ts";

describe("Pause menu controller", () => {
  test("vertical navigation wraps around action menu items", () => {
    const controller = new PauseMenuController();
    const root: PauseActionMenu = {
      kind: "action",
      title: "PAUSED",
      selectedIndex: 0,
      onCancel: (menu) => menu.close(),
      items: [
        { label: "Resume", activate: () => {} },
        { label: "Retry", activate: () => {} },
        { label: "Options", activate: () => {} },
      ],
    };

    controller.open(root);
    controller.moveVertical(-1);
    expect(controller.current?.selectedIndex).toBe(2);

    controller.moveVertical(1);
    expect(controller.current?.selectedIndex).toBe(0);
  });

  test("option values clamp left and right instead of wrapping", () => {
    const controller = new PauseMenuController();
    const screenShakeOption: PauseMenuOption<boolean> = {
      label: "Screen Shake Effects",
      values: [
        { label: "OFF", value: false },
        { label: "ON", value: true },
      ],
      valueIndex: 1,
    };
    const options: PauseOptionsMenu = {
      kind: "options",
      title: "OPTIONS",
      selectedIndex: 0,
      onCancel: () => {},
      items: [screenShakeOption],
    };

    controller.open(options);
    controller.moveHorizontal(1);
    expect(screenShakeOption.valueIndex).toBe(1);

    controller.moveHorizontal(-1);
    expect(screenShakeOption.valueIndex).toBe(0);

    controller.moveHorizontal(-1);
    expect(screenShakeOption.valueIndex).toBe(0);
  });

  test("cancel on an options screen can save and pop one level", () => {
    const controller = new PauseMenuController();
    let savedValue: boolean | null = null;

    const screenShakeOption: PauseMenuOption<boolean> = {
      label: "Screen Shake Effects",
      values: [
        { label: "OFF", value: false },
        { label: "ON", value: true },
      ],
      valueIndex: 1,
    };

    const options: PauseOptionsMenu = {
      kind: "options",
      title: "OPTIONS",
      selectedIndex: 0,
      onCancel: (menu) => {
        savedValue = currentPauseOptionValue(screenShakeOption);
        menu.pop();
      },
      items: [screenShakeOption],
    };

    const root: PauseActionMenu = {
      kind: "action",
      title: "PAUSED",
      selectedIndex: 0,
      onCancel: (menu) => menu.close(),
      items: [
        {
          label: "Options",
          activate: (menu) => menu.push(options),
        },
      ],
    };

    controller.open(root);
    controller.confirm();
    expect(controller.current?.title).toBe("OPTIONS");

    controller.moveHorizontal(-1);
    controller.cancel();

    expect(savedValue).toBe(false);
    expect(controller.current?.title).toBe("PAUSED");
  });

  test("options screen can open submenu rows and run command rows", () => {
    const controller = new PauseMenuController();
    let commandRan = false;

    const child: PauseOptionsMenu = {
      kind: "options",
      title: "KEYBOARD CONFIG",
      selectedIndex: 0,
      onCancel: (menu) => menu.pop(),
      items: [],
    };
    const options: PauseOptionsMenu = {
      kind: "options",
      title: "OPTIONS",
      selectedIndex: 0,
      onCancel: (menu) => menu.pop(),
      items: [
        {
          kind: "submenu",
          label: "Keyboard Config",
          activate: (menu) => menu.push(child),
        },
        {
          kind: "command",
          label: "Reset All to Defaults",
          activate: () => {
            commandRan = true;
          },
        },
      ],
    };

    controller.open(options);
    controller.confirm();
    expect(controller.current?.title).toBe("KEYBOARD CONFIG");

    controller.cancel();
    controller.moveVertical(1);
    controller.confirm();
    expect(commandRan).toBeTrue();
  });

  test("disabled action menu items render in place but ignore confirm", () => {
    const controller = new PauseMenuController();
    let retried = false;

    const root: PauseActionMenu = {
      kind: "action",
      title: "PAUSED",
      selectedIndex: 1,
      onCancel: (menu) => menu.close(),
      items: [
        { label: "Resume", activate: () => {} },
        {
          label: "Retry",
          disabled: true,
          activate: () => {
            retried = true;
          },
        },
        { label: "Options", activate: () => {} },
      ],
    };

    controller.open(root);
    controller.confirm();

    expect(retried).toBeFalse();
    expect(controller.current?.selectedIndex).toBe(1);
  });
});
