import Phaser from "phaser";
import {
  canMovePauseOption,
  currentPauseOptionLabel,
  isPauseChoiceOption,
  isPauseCommandItem,
  isPauseKeyBindingItem,
  isPauseMenuItemDisabled,
  isPauseSubmenuItem,
  type PauseMenuScreen,
} from "../pause/menu";
import { VIEWPORT } from "../constants";
import { formatKeyBinding, type KeyBindingAction } from "../input/keybindings";

interface PauseRowView {
  label: Phaser.GameObjects.Text;
  leftArrow: Phaser.GameObjects.Text;
  value: Phaser.GameObjects.Text;
  rightArrow: Phaser.GameObjects.Text;
}

const OVERLAY_DEPTH = 40;
const LAYOUT_WIDTH = 236;
const ACTION_ROW_HEIGHT = 16;
const OPTIONS_ROW_HEIGHT = 18;
const ROW_GAP = 4;
const TITLE_TO_ROWS_GAP = 14;
const ROWS_TO_HINT_GAP = 16;
const SCROLL_MARGIN = 12;
const COLOR_TITLE = "#f7f7ff";
const COLOR_SELECTED = "#ffffff";
const COLOR_TEXT = "#aeb3d8";
const COLOR_MUTED = "#7c83b7";
const COLOR_DISABLED = "#4d526f";

export class PauseOverlay {
  private readonly container: Phaser.GameObjects.Container;
  private readonly backdrop: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.Text;
  private readonly hint: Phaser.GameObjects.Text;
  private readonly rows: PauseRowView[] = [];
  private screenKey = "";
  private scrollOffset = 0;

  constructor(scene: Phaser.Scene) {
    this.container = scene.add.container(0, 0).setDepth(OVERLAY_DEPTH).setScrollFactor(0);
    this.backdrop = scene.add.graphics();
    this.title = scene.add.text(0, 0, "", {
      fontFamily: "monospace",
      fontSize: "18px",
      color: COLOR_TITLE,
      align: "center",
    });
    this.hint = scene.add.text(0, 0, "", {
      fontFamily: "monospace",
      fontSize: "8px",
      color: COLOR_MUTED,
      align: "center",
      wordWrap: { width: LAYOUT_WIDTH, useAdvancedWrap: true },
    });

    this.container.add([this.backdrop, this.title, this.hint]);
    this.hide();
  }

  render(screen: PauseMenuScreen, captureAction: KeyBindingAction | null = null): void {
    this.container.setVisible(true);

    const rowHeight = screen.kind === "options" ? OPTIONS_ROW_HEIGHT : ACTION_ROW_HEIGHT;
    const itemHeight = screen.items.length * rowHeight + Math.max(0, screen.items.length - 1) * ROW_GAP;
    const titleSize = screen.title === "PAUSED" ? 22 : 16;
    const blockHeight = titleSize + TITLE_TO_ROWS_GAP + itemHeight + ROWS_TO_HINT_GAP + 18;
    const scrollable = blockHeight > VIEWPORT.height - SCROLL_MARGIN * 2;
    const top = scrollable ? SCROLL_MARGIN : Math.round((VIEWPORT.height - blockHeight) * 0.5);
    const centerX = Math.round(VIEWPORT.width * 0.5);
    const layoutLeft = Math.round((VIEWPORT.width - LAYOUT_WIDTH) * 0.5);
    const rowStartY = top + titleSize + TITLE_TO_ROWS_GAP;
    const hintY = scrollable ? VIEWPORT.height - SCROLL_MARGIN : rowStartY + itemHeight + ROWS_TO_HINT_GAP;
    const visibleRowsHeight = Math.max(rowHeight, hintY - ROWS_TO_HINT_GAP - rowStartY);
    const scrollTarget = scrollable
      ? this.scrollTarget(screen.selectedIndex, rowHeight, itemHeight, visibleRowsHeight)
      : 0;
    const key = `${screen.title}:${screen.kind}`;
    if (key !== this.screenKey || !scrollable) {
      this.screenKey = key;
      this.scrollOffset = scrollTarget;
    } else {
      this.scrollOffset = Phaser.Math.Linear(this.scrollOffset, scrollTarget, 0.35);
      if (Math.abs(this.scrollOffset - scrollTarget) < 0.25) {
        this.scrollOffset = scrollTarget;
      }
    }

    this.redrawBackdrop();
    this.title
      .setText(screen.title)
      .setFontSize(titleSize)
      .setOrigin(0.5, 0)
      .setPosition(centerX, top);

    for (let i = 0; i < screen.items.length; i++) {
      const row = this.ensureRow(i);
      const y = rowStartY + i * (rowHeight + ROW_GAP) - this.scrollOffset;
      const rowVisible = !scrollable ||
        (y >= rowStartY - rowHeight && y <= rowStartY + visibleRowsHeight);
      const selected = i === screen.selectedIndex;

      if (screen.kind === "action") {
        const item = screen.items[i];
        const labelColor = isPauseMenuItemDisabled(item) ? COLOR_DISABLED : selected ? COLOR_SELECTED : COLOR_TEXT;
        row.label.setVisible(rowVisible).setText(item.label).setColor(labelColor);
        row.label.setY(y);
        row.label
          .setX(centerX)
          .setOrigin(0.5, 0)
          .setFontSize(12);
        row.leftArrow.setVisible(false);
        row.value.setVisible(false);
        row.rightArrow.setVisible(false);
        continue;
      }

      const item = screen.items[i];
      const disabled = (isPauseSubmenuItem(item) || isPauseCommandItem(item)) && isPauseMenuItemDisabled(item);
      const labelColor = disabled ? COLOR_DISABLED : selected ? COLOR_SELECTED : COLOR_TEXT;
      const valueColor = disabled ? COLOR_DISABLED : selected ? COLOR_SELECTED : COLOR_TEXT;
      row.label.setVisible(rowVisible).setText(item.label).setColor(labelColor);
      row.label.setY(y);
      if (!rowVisible) {
        row.leftArrow.setVisible(false);
        row.value.setVisible(false);
        row.rightArrow.setVisible(false);
        continue;
      }

      if (isPauseSubmenuItem(item)) {
        row.label
          .setX(layoutLeft)
          .setOrigin(0, 0)
          .setFontSize(11);
        row.leftArrow.setVisible(false);
        row.value
          .setVisible(true)
          .setText(">")
          .setPosition(layoutLeft + LAYOUT_WIDTH - 14, y)
          .setOrigin(0, 0)
          .setFontSize(11)
          .setColor(valueColor);
        row.rightArrow.setVisible(false);
        continue;
      }

      if (isPauseKeyBindingItem(item)) {
        const waiting = captureAction === item.action;
        row.label
          .setX(layoutLeft)
          .setOrigin(0, 0)
          .setFontSize(11);
        row.leftArrow.setVisible(false);
        row.value
          .setVisible(true)
          .setText(waiting ? "PRESS KEY" : formatKeyBinding(item.keys))
          .setPosition(layoutLeft + LAYOUT_WIDTH - 48, y)
          .setOrigin(0.5, 0)
          .setFontSize(11)
          .setColor(waiting || selected ? COLOR_SELECTED : COLOR_TEXT);
        row.rightArrow.setVisible(false);
        continue;
      }

      if (isPauseCommandItem(item)) {
        row.label
          .setX(centerX)
          .setOrigin(0.5, 0)
          .setFontSize(12);
        row.leftArrow.setVisible(false);
        row.value.setVisible(false);
        row.rightArrow.setVisible(false);
        continue;
      }

      if (!isPauseChoiceOption(item)) {
        continue;
      }

      row.label
        .setX(layoutLeft)
        .setOrigin(0, 0)
        .setFontSize(11);
      row.leftArrow
        .setVisible(true)
        .setText("<")
        .setPosition(layoutLeft + LAYOUT_WIDTH - 62, y)
        .setOrigin(1, 0)
        .setFontSize(11)
        .setColor(canMovePauseOption(item, -1) ? valueColor : COLOR_DISABLED);
      row.value
        .setVisible(true)
        .setText(currentPauseOptionLabel(item))
        .setPosition(layoutLeft + LAYOUT_WIDTH - 38, y)
        .setOrigin(0.5, 0)
        .setFontSize(11)
        .setColor(valueColor);
      row.rightArrow
        .setVisible(true)
        .setText(">")
        .setPosition(layoutLeft + LAYOUT_WIDTH - 14, y)
        .setOrigin(0, 0)
        .setFontSize(11)
        .setColor(canMovePauseOption(item, 1) ? valueColor : COLOR_DISABLED);
    }

    for (let i = screen.items.length; i < this.rows.length; i++) {
      const row = this.rows[i];
      row.label.setVisible(false);
      row.leftArrow.setVisible(false);
      row.value.setVisible(false);
      row.rightArrow.setVisible(false);
    }

    this.hint
      .setText(this.hintText(screen))
      .setPosition(centerX, hintY)
      .setOrigin(0.5, 0.5);
  }

  hide(): void {
    this.container.setVisible(false);
  }

  destroy(): void {
    this.rows.length = 0;
    this.container.destroy(true);
  }

  private redrawBackdrop(): void {
    this.backdrop.clear();
    this.backdrop.fillStyle(0x04050b, 0.68);
    this.backdrop.fillRect(0, 0, VIEWPORT.width, VIEWPORT.height);
  }

  private ensureRow(index: number): PauseRowView {
    const existing = this.rows[index];
    if (existing) {
      return existing;
    }

    const label = this.makeText();
    const leftArrow = this.makeText();
    const value = this.makeText();
    const rightArrow = this.makeText();

    const row = { label, leftArrow, value, rightArrow };
    this.rows.push(row);
    this.container.add([label, leftArrow, value, rightArrow]);
    return row;
  }

  private makeText(): Phaser.GameObjects.Text {
    return this.container.scene.add.text(0, 0, "", {
      fontFamily: "monospace",
      fontSize: "11px",
      color: COLOR_TEXT,
    });
  }

  private hintText(screen: PauseMenuScreen): string {
    if (screen.kind === "options") {
      if (screen.title === "KEYBOARD CONFIG") {
        return "C/ENTER: ADD/REMOVE  |  LEFT/RIGHT/BKSP: CLEAR  |  X/ESC: BACK";
      }

      return "UP/DOWN: SELECT  |  LEFT/RIGHT: CHANGE  |  C/ENTER: OPEN  |  X/ESC: SAVE";
    }

    if (screen.title === "PAUSED") {
      return "UP/DOWN: SELECT  |  C: CONFIRM  |  X/ESC: RESUME";
    }

    return "UP/DOWN: SELECT  |  C: CONFIRM  |  X/ESC: BACK";
  }

  private scrollTarget(
    selectedIndex: number,
    rowHeight: number,
    itemHeight: number,
    visibleRowsHeight: number,
  ): number {
    const rowTop = selectedIndex * (rowHeight + ROW_GAP);
    const centered = rowTop - (visibleRowsHeight - rowHeight) * 0.5;
    return Phaser.Math.Clamp(centered, 0, Math.max(0, itemHeight - visibleRowsHeight));
  }
}
