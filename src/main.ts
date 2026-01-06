import "./style.css";
import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { GameScene } from "./scenes/GameScene";
import { GAME_HEIGHT, GAME_WIDTH } from "./game/config";
import { initTelegram } from "./telegram/telegram";

// Инициализация Telegram WebApp до создания игры
initTelegram();

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: "app",
  backgroundColor: "#0d0f1a",
  scene: [BootScene, GameScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: "arcade",
  },
};

new Phaser.Game(config);
