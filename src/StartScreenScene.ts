import Phaser from "phaser";
import { VIEWPORT } from "./constants";

const PROMPT = "PRESS C TO START";
const PROMPT_COLOR = 0xdedee8;
const PROMPT_FONT_SIZE = "10px";

export class StartScreenScene extends Phaser.Scene {
  private startKey: Phaser.Input.Keyboard.Key | null = null;

  constructor() {
    super("StartScreenScene");
  }

  create(): void {
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.cameras.main.setBackgroundColor("#000000");
    this.add
      .rectangle(0, 0, VIEWPORT.width, VIEWPORT.height, 0x000000, 1)
      .setOrigin(0)
      .setScrollFactor(0);

    this.add
      .text(
        Math.round(VIEWPORT.width * 0.5),
        Math.round(VIEWPORT.height * 0.7),
        PROMPT,
        {
          fontFamily: "monospace",
          fontSize: PROMPT_FONT_SIZE,
          color: `#${PROMPT_COLOR.toString(16).padStart(6, "0")}`,
          align: "center",
        },
      )
      .setOrigin(0.5)
      .setScrollFactor(0);

    this.startKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.C) ?? null;
    this.startKey?.on("down", this.startGame, this);
  }

  private startGame(): void {
    this.scene.start("GameScene");
  }

  private shutdown(): void {
    this.startKey?.off("down", this.startGame, this);
    this.startKey = null;
  }
}
