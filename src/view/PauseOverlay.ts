import Phaser from "phaser";
import {
  canMovePauseOption,
  currentPauseOptionLabel,
  type PauseMenuScreen,
} from "../pause/menu";
import { VIEWPORT } from "../constants";

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

  render(screen: PauseMenuScreen): void {
    this.container.setVisible(true);

    const rowHeight = screen.kind === "options" ? OPTIONS_ROW_HEIGHT : ACTION_ROW_HEIGHT;
    const itemHeight = screen.items.length * rowHeight + Math.max(0, screen.items.length - 1) * ROW_GAP;
    const titleSize = screen.title === "PAUSED" ? 22 : 16;
    const blockHeight = titleSize + TITLE_TO_ROWS_GAP + itemHeight + ROWS_TO_HINT_GAP + 18;
    const top = Math.round((VIEWPORT.height - blockHeight) * 0.5);
    const centerX = Math.round(VIEWPORT.width * 0.5);
    const layoutLeft = Math.round((VIEWPORT.width - LAYOUT_WIDTH) * 0.5);
    const rowStartY = top + titleSize + TITLE_TO_ROWS_GAP;

    this.redrawBackdrop();
    this.title
      .setText(screen.title)
      .setFontSize(titleSize)
      .setOrigin(0.5, 0)
      .setPosition(centerX, top);

    for (let i = 0; i < screen.items.length; i++) {
      const row = this.ensureRow(i);
      const y = rowStartY + i * (rowHeight + ROW_GAP);
      const selected = i === screen.selectedIndex;
      const labelColor = selected ? COLOR_SELECTED : COLOR_TEXT;

      row.label.setVisible(true).setText(screen.items[i].label).setColor(labelColor);
      row.label.setY(y);

      if (screen.kind === "action") {
        row.label
          .setX(centerX)
          .setOrigin(0.5, 0)
          .setFontSize(12);
        row.leftArrow.setVisible(false);
        row.value.setVisible(false);
        row.rightArrow.setVisible(false);
        continue;
      }

      const option = screen.items[i];
      const valueColor = selected ? COLOR_SELECTED : COLOR_TEXT;
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
        .setColor(canMovePauseOption(option, -1) ? valueColor : COLOR_DISABLED);
      row.value
        .setVisible(true)
        .setText(currentPauseOptionLabel(option))
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
        .setColor(canMovePauseOption(option, 1) ? valueColor : COLOR_DISABLED);
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
      .setPosition(centerX, rowStartY + itemHeight + ROWS_TO_HINT_GAP)
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
      return "UP/DOWN: SELECT  |  LEFT/RIGHT: CHANGE  |  X/ESC: SAVE";
    }

    if (screen.title === "PAUSED") {
      return "UP/DOWN: SELECT  |  C: CONFIRM  |  X/ESC: RESUME";
    }

    return "UP/DOWN: SELECT  |  C: CONFIRM  |  X/ESC: BACK";
  }
}
