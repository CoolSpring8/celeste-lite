import { describe, expect, test } from "bun:test";
import {
  DEFAULT_GAME_OPTIONS,
  GAME_OPTIONS_STORAGE_KEY,
  loadGameOptions,
  saveGameOptions,
  type StorageLike,
} from "../../src/options.ts";
import { DEFAULT_KEY_BINDINGS } from "../../src/input/keybindings.ts";

function createStorage(initial: Record<string, string> = {}): StorageLike {
  const values = new Map(Object.entries(initial));

  return {
    getItem(key: string): string | null {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      values.set(key, value);
    },
  };
}

describe("Game options", () => {
  test("screen shake defaults to on while visual and assist options default to parity settings", () => {
    const storage = createStorage();
    expect(loadGameOptions(storage)).toEqual(DEFAULT_GAME_OPTIONS);
  });

  test("screen shake, dynamic hair, assists, and keyboard bindings persist through storage", () => {
    const storage = createStorage();

    saveGameOptions({
      screenShakeEffects: false,
      dynamicHair: true,
      keyboardBindings: {
        ...DEFAULT_KEY_BINDINGS,
        jump: ["KeyC", "Space"],
        crouchDash: ["KeyV"],
      },
      infiniteStamina: true,
      airDashes: "infinite",
      invincibility: true,
    }, storage);

    expect(storage.getItem(GAME_OPTIONS_STORAGE_KEY)).toBe(
      JSON.stringify({
        screenShakeEffects: false,
        dynamicHair: true,
        keyboardBindings: {
          ...DEFAULT_KEY_BINDINGS,
          jump: ["KeyC", "Space"],
          crouchDash: ["KeyV"],
        },
        infiniteStamina: true,
        airDashes: "infinite",
        invincibility: true,
      }),
    );
    expect(loadGameOptions(storage)).toEqual({
      screenShakeEffects: false,
      dynamicHair: true,
      keyboardBindings: {
        ...DEFAULT_KEY_BINDINGS,
        jump: ["KeyC", "Space"],
        crouchDash: ["KeyV"],
      },
      infiniteStamina: true,
      airDashes: "infinite",
      invincibility: true,
    });
  });

  test("missing newer fields in stored payloads fall back to defaults", () => {
    const storage = createStorage({
      [GAME_OPTIONS_STORAGE_KEY]: JSON.stringify({ screenShakeEffects: false }),
    });

    expect(loadGameOptions(storage)).toEqual({
      screenShakeEffects: false,
      dynamicHair: false,
      keyboardBindings: DEFAULT_KEY_BINDINGS,
      infiniteStamina: false,
      airDashes: "default",
      invincibility: false,
    });
  });

  test("invalid air dash assist values fall back to default", () => {
    const storage = createStorage({
      [GAME_OPTIONS_STORAGE_KEY]: JSON.stringify({ airDashes: "triple" }),
    });

    expect(loadGameOptions(storage).airDashes).toBe("default");
  });

  test("keyboard bindings support empty lists and drop duplicate stored keys", () => {
    const storage = createStorage({
      [GAME_OPTIONS_STORAGE_KEY]: JSON.stringify({
        keyboardBindings: {
          jump: ["KeyC", "Space", "Space"],
          confirm: [],
          crouchDash: ["KeyV"],
        },
      }),
    });

    expect(loadGameOptions(storage).keyboardBindings).toEqual({
      ...DEFAULT_KEY_BINDINGS,
      jump: ["KeyC", "Space"],
      confirm: [],
      crouchDash: ["KeyV"],
    });
  });

  test("invalid stored option payloads fall back to defaults", () => {
    const storage = createStorage({
      [GAME_OPTIONS_STORAGE_KEY]: "{not valid json",
    });

    expect(loadGameOptions(storage)).toEqual(DEFAULT_GAME_OPTIONS);
  });
});
