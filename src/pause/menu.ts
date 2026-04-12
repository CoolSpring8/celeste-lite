export interface PauseMenuChoice<T = unknown> {
  label: string;
  value: T;
}

export interface PauseMenuOption<T = unknown> {
  label: string;
  values: readonly PauseMenuChoice<T>[];
  valueIndex: number;
}

export interface PauseMenuItem {
  label: string;
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
  items: PauseMenuOption<unknown>[];
}

export type PauseMenuScreen = PauseActionMenu | PauseOptionsMenu;

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
    if (!option || !canMovePauseOption(option, direction)) {
      return;
    }

    option.valueIndex += direction;
  }

  confirm(): void {
    const screen = this.current;
    if (screen === null || screen.kind !== "action") {
      return;
    }

    const item = screen.items[screen.selectedIndex];
    item?.activate(this);
  }

  cancel(): void {
    this.current?.onCancel(this);
  }
}
