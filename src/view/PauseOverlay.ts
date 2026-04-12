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
const PANEL_WIDTH = 248;
const ACTION_ROW_HEIGHT = 18;
const OPTIONS_ROW_HEIGHT = 20;
const PANEL_TOP_PADDING = 28;
const PANEL_BOTTOM_PADDING = 26;
const ROW_GAP = 3;
const COLOR_TITLE = "#f7f7ff";
const COLOR_SELECTED = "#ffffff";
const COLOR_TEXT = "#aeb3d8";
const COLOR_MUTED = "#7c83b7";
const COLOR_DISABLED = "#4d526f";

export class PauseOverlay {
  private readonly container: Phaser.GameObjects.Container;
  private readonly backdrop: Phaser.GameObjects.Graphics;
  private readonly panel: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.Text;
  private readonly hint: Phaser.GameObjects.Text;
  private readonly rows: PauseRowView[] = [];

  constructor(scene: Phaser.Scene) {
    this.container = scene.add.container(0, 0).setDepth(OVERLAY_DEPTH).setScrollFactor(0);
    this.backdrop = scene.add.graphics();
    this.panel = scene.add.graphics();
    this.title = scene.add.text(0, 0, "", {
      fontFamily: "monospace",
      fontSize: "20px",
      color: COLOR_TITLE,
      align: "center",
    });
    this.hint = scene.add.text(0, 0, "", {
      fontFamily: "monospace",
      fontSize: "9px",
      color: COLOR_MUTED,
      align: "center",
      wordWrap: { width: PANEL_WIDTH - 20, useAdvancedWrap: true },
    });

    this.container.add([this.backdrop, this.panel, this.title, this.hint]);
    this.hide();
  }

  render(screen: PauseMenuScreen): void {
    this.container.setVisible(true);

    const rowHeight = screen.kind === "options" ? OPTIONS_ROW_HEIGHT : ACTION_ROW_HEIGHT;
    const itemHeight = screen.items.length * rowHeight + Math.max(0, screen.items.length - 1) * ROW_GAP;
    const titleSize = screen.title === "PAUSED" ? 24 : 18;
    const panelHeight = PANEL_TOP_PADDING + 24 + 12 + itemHeight + PANEL_BOTTOM_PADDING + 20;
    const panelLeft = Math.round((VIEWPORT.width - PANEL_WIDTH) * 0.5);
    const panelTop = Math.round((VIEWPORT.height - panelHeight) * 0.5);
    const panelCenterX = panelLeft + PANEL_WIDTH * 0.5;
    const rowStartY = panelTop + PANEL_TOP_PADDING + 30;

    this.redrawBackdrop(panelLeft, panelTop, panelHeight);
    this.title
      .setText(screen.title)
      .setFontSize(titleSize)
      .setOrigin(0.5, 0)
      .setPosition(panelCenterX, panelTop + PANEL_TOP_PADDING - 4);

    for (let i = 0; i < screen.items.length; i++) {
      const row = this.ensureRow(i);
      const y = rowStartY + i * (rowHeight + ROW_GAP);
      const selected = i === screen.selectedIndex;
      const labelColor = selected ? COLOR_SELECTED : COLOR_TEXT;

      row.label.setVisible(true).setText(screen.items[i].label).setColor(labelColor);
      row.label.setY(y);

      if (screen.kind === "action") {
        row.label
          .setX(panelCenterX)
          .setOrigin(0.5, 0)
          .setFontSize(14);
        row.leftArrow.setVisible(false);
        row.value.setVisible(false);
        row.rightArrow.setVisible(false);
        continue;
      }

      const option = screen.items[i];
      const valueColor = selected ? COLOR_SELECTED : COLOR_TEXT;
      row.label
        .setX(panelLeft + 20)
        .setOrigin(0, 0)
        .setFontSize(12);
      row.leftArrow
        .setVisible(true)
        .setText("<")
        .setPosition(panelLeft + PANEL_WIDTH - 68, y)
        .setOrigin(1, 0)
        .setColor(canMovePauseOption(option, -1) ? valueColor : COLOR_DISABLED);
      row.value
        .setVisible(true)
        .setText(currentPauseOptionLabel(option))
        .setPosition(panelLeft + PANEL_WIDTH - 44, y)
        .setOrigin(0.5, 0)
        .setColor(valueColor);
      row.rightArrow
        .setVisible(true)
        .setText(">")
        .setPosition(panelLeft + PANEL_WIDTH - 20, y)
        .setOrigin(0, 0)
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
      .setText(
        screen.kind === "options"
          ? "Up/Down Select  Left/Right Change  X/Esc Save"
          : screen.title === "PAUSED"
          ? "Up/Down Select  C Confirm  X/Esc Resume"
          : "Up/Down Select  C Confirm  X/Esc Back",
      )
      .setPosition(panelCenterX, panelTop + panelHeight - PANEL_BOTTOM_PADDING)
      .setOrigin(0.5, 0.5);
  }

  hide(): void {
    this.container.setVisible(false);
  }

  destroy(): void {
    this.rows.length = 0;
    this.container.destroy(true);
  }

  private redrawBackdrop(panelLeft: number, panelTop: number, panelHeight: number): void {
    this.backdrop.clear();
    this.backdrop.fillStyle(0x04050b, 0.68);
    this.backdrop.fillRect(0, 0, VIEWPORT.width, VIEWPORT.height);

    this.panel.clear();
    this.panel.fillStyle(0x15172a, 0.94);
    this.panel.fillRoundedRect(panelLeft, panelTop, PANEL_WIDTH, panelHeight, 8);
    this.panel.lineStyle(1, 0xa7acd4, 0.25);
    this.panel.strokeRoundedRect(panelLeft, panelTop, PANEL_WIDTH, panelHeight, 8);
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
      fontSize: "12px",
      color: COLOR_TEXT,
    });
  }
}
