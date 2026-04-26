import {
  DEFAULT_ASSIST_OPTIONS,
  type AirDashAssist,
  type AssistOptions,
} from "./assists";
import {
  DEFAULT_KEY_BINDINGS,
  normalizeKeyBindings,
  type KeyBindings,
} from "./input/keybindings";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface GameOptions extends AssistOptions {
  screenShakeEffects: boolean;
  dynamicHair: boolean;
  keyboardBindings: KeyBindings;
}

export const GAME_OPTIONS_STORAGE_KEY = "celeste-lite.options";

export const DEFAULT_GAME_OPTIONS: Readonly<GameOptions> = Object.freeze({
  screenShakeEffects: true,
  dynamicHair: false,
  keyboardBindings: normalizeKeyBindings(DEFAULT_KEY_BINDINGS),
  ...DEFAULT_ASSIST_OPTIONS,
});

const memoryStorage = new Map<string, string>();

function fallbackStorage(): StorageLike {
  return {
    getItem(key: string): string | null {
      return memoryStorage.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      memoryStorage.set(key, value);
    },
  };
}

function resolveStorage(storage?: StorageLike): StorageLike {
  if (storage) {
    return storage;
  }

  const globalStorage = (globalThis as { localStorage?: StorageLike }).localStorage;
  if (
    globalStorage &&
    typeof globalStorage.getItem === "function" &&
    typeof globalStorage.setItem === "function"
  ) {
    return globalStorage;
  }

  return fallbackStorage();
}

function normalizeGameOptions(value: Partial<GameOptions> | null | undefined): GameOptions {
  return {
    screenShakeEffects: typeof value?.screenShakeEffects === "boolean"
      ? value.screenShakeEffects
      : DEFAULT_GAME_OPTIONS.screenShakeEffects,
    dynamicHair: typeof value?.dynamicHair === "boolean"
      ? value.dynamicHair
      : DEFAULT_GAME_OPTIONS.dynamicHair,
    keyboardBindings: normalizeKeyBindings(value?.keyboardBindings),
    infiniteStamina: typeof value?.infiniteStamina === "boolean"
      ? value.infiniteStamina
      : DEFAULT_GAME_OPTIONS.infiniteStamina,
    airDashes: normalizeAirDashes(value?.airDashes),
    invincibility: typeof value?.invincibility === "boolean"
      ? value.invincibility
      : DEFAULT_GAME_OPTIONS.invincibility,
  };
}

function normalizeAirDashes(value: unknown): AirDashAssist {
  return value === "two" || value === "infinite"
    ? value
    : DEFAULT_GAME_OPTIONS.airDashes;
}

export function loadGameOptions(storage?: StorageLike): GameOptions {
  const raw = resolveStorage(storage).getItem(GAME_OPTIONS_STORAGE_KEY);
  if (raw === null) {
    return normalizeGameOptions(undefined);
  }

  try {
    const parsed = JSON.parse(raw) as Partial<GameOptions>;
    return normalizeGameOptions(parsed);
  } catch {
    return normalizeGameOptions(undefined);
  }
}

export function saveGameOptions(options: GameOptions, storage?: StorageLike): GameOptions {
  const normalized = normalizeGameOptions(options);
  resolveStorage(storage).setItem(GAME_OPTIONS_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}
