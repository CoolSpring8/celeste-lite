import { describe, expect, test } from "bun:test";
import {
  DEFAULT_GAME_OPTIONS,
  GAME_OPTIONS_STORAGE_KEY,
  loadGameOptions,
  saveGameOptions,
  type StorageLike,
} from "../../src/options.ts";

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

  test("screen shake, dynamic hair, and assist selections persist through storage", () => {
    const storage = createStorage();

    saveGameOptions({
      screenShakeEffects: false,
      dynamicHair: true,
      infiniteStamina: true,
      airDashes: "infinite",
      invincibility: true,
    }, storage);

    expect(storage.getItem(GAME_OPTIONS_STORAGE_KEY)).toBe(
      JSON.stringify({
        screenShakeEffects: false,
        dynamicHair: true,
        infiniteStamina: true,
        airDashes: "infinite",
        invincibility: true,
      }),
    );
    expect(loadGameOptions(storage)).toEqual({
      screenShakeEffects: false,
      dynamicHair: true,
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

  test("invalid stored option payloads fall back to defaults", () => {
    const storage = createStorage({
      [GAME_OPTIONS_STORAGE_KEY]: "{not valid json",
    });

    expect(loadGameOptions(storage)).toEqual(DEFAULT_GAME_OPTIONS);
  });
});
