export type KeyBindingAction =
  | "left"
  | "right"
  | "up"
  | "down"
  | "jump"
  | "dash"
  | "grab"
  | "confirm"
  | "cancel"
  | "pause"
  | "crouchDash";

export interface KeyBindingDefinition {
  action: KeyBindingAction;
  label: string;
}

export type KeyBindings = Record<KeyBindingAction, string[]>;

export const KEY_BINDING_DEFINITIONS: readonly KeyBindingDefinition[] = [
  { action: "left", label: "Left" },
  { action: "right", label: "Right" },
  { action: "up", label: "Up" },
  { action: "down", label: "Down" },
  { action: "jump", label: "Jump" },
  { action: "dash", label: "Dash" },
  { action: "grab", label: "Grab" },
  { action: "confirm", label: "Confirm" },
  { action: "cancel", label: "Cancel" },
  { action: "pause", label: "Pause" },
  { action: "crouchDash", label: "Crouch Dash" },
];

export const DEFAULT_KEY_BINDINGS: Readonly<KeyBindings> = Object.freeze({
  left: ["ArrowLeft"],
  right: ["ArrowRight"],
  up: ["ArrowUp"],
  down: ["ArrowDown"],
  jump: ["KeyC"],
  dash: ["KeyX"],
  grab: ["KeyZ"],
  confirm: ["KeyC"],
  cancel: ["KeyX", "Escape"],
  pause: ["Escape"],
  crouchDash: [],
});

const KNOWN_LABELS: Readonly<Record<string, string>> = Object.freeze({
  ArrowLeft: "LEFT",
  ArrowRight: "RIGHT",
  ArrowUp: "UP",
  ArrowDown: "DOWN",
  Escape: "ESC",
  Space: "SPACE",
  Enter: "ENTER",
  NumpadEnter: "NUM ENTER",
  Backspace: "BACKSPACE",
  Delete: "DELETE",
  Tab: "TAB",
  ShiftLeft: "L SHIFT",
  ShiftRight: "R SHIFT",
  ControlLeft: "L CTRL",
  ControlRight: "R CTRL",
  AltLeft: "L ALT",
  AltRight: "R ALT",
  MetaLeft: "L META",
  MetaRight: "R META",
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
});

export function normalizeKeyBindings(value: unknown): KeyBindings {
  const source = isRecord(value) ? value : {};
  const normalized = {} as KeyBindings;

  for (const { action } of KEY_BINDING_DEFINITIONS) {
    normalized[action] = normalizeKeyCodeList(source[action], DEFAULT_KEY_BINDINGS[action]);
  }

  return normalized;
}

export function keyDisplayName(code: string): string {
  const known = KNOWN_LABELS[code];
  if (known) return known;

  if (/^Key[A-Z]$/.test(code)) {
    return code.slice(3);
  }

  if (/^Digit[0-9]$/.test(code)) {
    return code.slice(5);
  }

  if (/^F[0-9]{1,2}$/.test(code)) {
    return code;
  }

  if (code.startsWith("Numpad")) {
    return `NUM ${code.slice("Numpad".length).toUpperCase()}`;
  }

  return code
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export function formatKeyBinding(codes: readonly string[], maxKeys = 3): string {
  if (codes.length === 0) {
    return "-";
  }

  const visibleCodes = codes.slice(0, maxKeys);
  const label = visibleCodes.map(keyDisplayName).join(" / ");
  const extra = codes.length - visibleCodes.length;
  return extra > 0 ? `${label} +${extra}` : label;
}

function normalizeKeyCodeList(value: unknown, fallback: readonly string[]): string[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;

    const code = item.trim();
    if (code.length === 0 || out.includes(code)) continue;
    out.push(code);
  }

  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
