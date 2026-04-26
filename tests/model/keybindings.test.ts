import { describe, expect, test } from "bun:test";
import {
  DEFAULT_KEY_BINDINGS,
  formatKeyBinding,
  keyDisplayName,
  normalizeKeyBindings,
} from "../../src/input/keybindings.ts";

describe("Keyboard bindings", () => {
  test("defaults are functionality-named and crouch dash starts unbound", () => {
    expect(DEFAULT_KEY_BINDINGS.left).toEqual(["ArrowLeft"]);
    expect(DEFAULT_KEY_BINDINGS.jump).toEqual(["KeyC"]);
    expect(DEFAULT_KEY_BINDINGS.crouchDash).toEqual([]);
  });

  test("normalization preserves intentionally empty bindings", () => {
    const bindings = normalizeKeyBindings({
      confirm: [],
      jump: ["KeyC", "Space", "Space"],
      crouchDash: ["KeyV"],
    });

    expect(bindings.confirm).toEqual([]);
    expect(bindings.jump).toEqual(["KeyC", "Space"]);
    expect(bindings.crouchDash).toEqual(["KeyV"]);
    expect(bindings.cancel).toEqual(DEFAULT_KEY_BINDINGS.cancel);
  });

  test("display labels are compact for common keyboard codes", () => {
    expect(keyDisplayName("KeyC")).toBe("C");
    expect(keyDisplayName("ArrowLeft")).toBe("LEFT");
    expect(keyDisplayName("Space")).toBe("SPACE");
    expect(formatKeyBinding(["KeyC", "Space", "KeyV", "ShiftLeft"])).toBe("C / SPACE / V +1");
    expect(formatKeyBinding([])).toBe("-");
  });
});
