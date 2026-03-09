import Phaser from "phaser";
import { GameScene } from "./GameScene";
import { COLORS, VIEWPORT } from "./constants";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: VIEWPORT.width,
  height: VIEWPORT.height,
  backgroundColor: `#${COLORS.background.toString(16).padStart(6, "0")}`,
  pixelArt: true,
  fps: {
    target: 60,
    forceSetTimeOut: true,
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [GameScene],
};

new Phaser.Game(config);
