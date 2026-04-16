export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface GameOptions {
  screenShakeEffects: boolean;
  dynamicHair: boolean;
}

export const GAME_OPTIONS_STORAGE_KEY = "celeste-lite.options";

export const DEFAULT_GAME_OPTIONS: Readonly<GameOptions> = Object.freeze({
  screenShakeEffects: true,
  dynamicHair: false,
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
  };
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
