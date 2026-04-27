export interface PauseMenuChoice<T = unknown> {
  label: string;
  value: T;
}

export interface PauseMenuOption<T = unknown> {
  kind?: "choice";
  label: string;
  values: readonly PauseMenuChoice<T>[];
  valueIndex: number;
}

export interface PauseMenuSubmenuItem {
  kind: "submenu";
  label: string;
  disabled?: boolean;
  activate: (controller: PauseMenuController) => void;
}

export interface PauseMenuKeyBindingItem<TAction = unknown> {
  kind: "keybinding";
  label: string;
  action: TAction;
  keys: string[];
}

export interface PauseMenuCommandItem {
  kind: "command";
  label: string;
  disabled?: boolean;
  activate: (controller: PauseMenuController) => void;
}

export type PauseMenuOptionItem<T = unknown> =
  | PauseMenuOption<T>
  | PauseMenuSubmenuItem
  | PauseMenuKeyBindingItem<T>
  | PauseMenuCommandItem;

export interface PauseMenuItem {
  label: string;
  disabled?: boolean;
  activate: (controller: PauseMenuController) => void;
}

interface PauseMenuScreenBase {
  title: string;
  selectedIndex: number;
  onCancel: (controller: PauseMenuController) => void;
}

export interface PauseActionMenu extends PauseMenuScreenBase {
  kind: "action";
  items: PauseMenuItem[];
}

export interface PauseOptionsMenu extends PauseMenuScreenBase {
  kind: "options";
  items: PauseMenuOptionItem<unknown>[];
}

export type PauseMenuScreen = PauseActionMenu | PauseOptionsMenu;

export function isPauseChoiceOption(item: PauseMenuOptionItem<unknown>): item is PauseMenuOption<unknown> {
  return item.kind === undefined || item.kind === "choice";
}

export function isPauseSubmenuItem(item: PauseMenuOptionItem<unknown>): item is PauseMenuSubmenuItem {
  return item.kind === "submenu";
}

export function isPauseKeyBindingItem(item: PauseMenuOptionItem<unknown>): item is PauseMenuKeyBindingItem<unknown> {
  return item.kind === "keybinding";
}

export function isPauseCommandItem(item: PauseMenuOptionItem<unknown>): item is PauseMenuCommandItem {
  return item.kind === "command";
}

export function isPauseMenuItemDisabled(item: { disabled?: boolean }): boolean {
  return item.disabled === true;
}

export function currentPauseOptionValue<T>(option: PauseMenuOption<T>): T | null {
  return option.values[option.valueIndex]?.value ?? null;
}

export function currentPauseOptionLabel(option: PauseMenuOption<unknown>): string {
  return option.values[option.valueIndex]?.label ?? "";
}

export function canMovePauseOption(option: PauseMenuOption<unknown>, direction: -1 | 1): boolean {
  if (option.values.length === 0) {
    return false;
  }

  if (direction < 0) {
    return option.valueIndex > 0;
  }

  return option.valueIndex < option.values.length - 1;
}

export class PauseMenuController {
  private stack: PauseMenuScreen[] = [];

  get current(): PauseMenuScreen | null {
    return this.stack.length > 0 ? this.stack[this.stack.length - 1] : null;
  }

  get isOpen(): boolean {
    return this.current !== null;
  }

  open(root: PauseMenuScreen): void {
    this.stack = [root];
  }

  push(screen: PauseMenuScreen): void {
    this.stack.push(screen);
  }

  pop(): void {
    if (this.stack.length === 0) {
      return;
    }

    this.stack.pop();
  }

  close(): void {
    this.stack = [];
  }

  moveVertical(direction: -1 | 1): void {
    const screen = this.current;
    if (screen === null || screen.items.length === 0) {
      return;
    }

    const itemCount = screen.items.length;
    screen.selectedIndex = (screen.selectedIndex + direction + itemCount) % itemCount;
  }

  moveHorizontal(direction: -1 | 1): void {
    const screen = this.current;
    if (screen === null || screen.kind !== "options") {
      return;
    }

    const option = screen.items[screen.selectedIndex];
    if (!option || !isPauseChoiceOption(option)) {
      return;
    }

    if (!canMovePauseOption(option, direction)) {
      return;
    }

    option.valueIndex += direction;
  }

  confirm(): void {
    const screen = this.current;
    if (screen === null) {
      return;
    }

    if (screen.kind === "action") {
      const item = screen.items[screen.selectedIndex];
      if (!item || isPauseMenuItemDisabled(item)) {
        return;
      }

      item.activate(this);
      return;
    }

    const item = screen.items[screen.selectedIndex];
    if (!item) {
      return;
    }

    if ((isPauseSubmenuItem(item) || isPauseCommandItem(item)) && !isPauseMenuItemDisabled(item)) {
      item.activate(this);
    }
  }

  cancel(): void {
    this.current?.onCancel(this);
  }
}
