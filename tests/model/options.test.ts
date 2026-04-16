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
  test("screen shake defaults to on and dynamic hair defaults to off when storage is empty", () => {
    const storage = createStorage();
    expect(loadGameOptions(storage)).toEqual(DEFAULT_GAME_OPTIONS);
  });

  test("screen shake and dynamic hair selections persist through storage", () => {
    const storage = createStorage();

    saveGameOptions({ screenShakeEffects: false, dynamicHair: true }, storage);

    expect(storage.getItem(GAME_OPTIONS_STORAGE_KEY)).toBe(
      JSON.stringify({ screenShakeEffects: false, dynamicHair: true }),
    );
    expect(loadGameOptions(storage)).toEqual({ screenShakeEffects: false, dynamicHair: true });
  });

  test("missing newer fields in stored payloads fall back to defaults", () => {
    const storage = createStorage({
      [GAME_OPTIONS_STORAGE_KEY]: JSON.stringify({ screenShakeEffects: false }),
    });

    expect(loadGameOptions(storage)).toEqual({ screenShakeEffects: false, dynamicHair: false });
  });

  test("invalid stored option payloads fall back to defaults", () => {
    const storage = createStorage({
      [GAME_OPTIONS_STORAGE_KEY]: "{not valid json",
    });

    expect(loadGameOptions(storage)).toEqual(DEFAULT_GAME_OPTIONS);
  });
});
