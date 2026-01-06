import "./style.css";
import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { GameScene } from "./scenes/GameScene";
import { setScreenSize, updateScaledValues } from "./game/config";
import { initTelegram } from "./telegram/telegram";

// Инициализация Telegram WebApp до создания игры
initTelegram();

// Определяем реальный размер экрана и обновляем масштаб
const screenWidth = window.innerWidth;
const screenHeight = window.innerHeight;
setScreenSize(screenWidth, screenHeight);
updateScaledValues();

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: screenWidth,
  height: screenHeight,
  parent: "app",
  backgroundColor: "#0d0f1a",
  scene: [BootScene, GameScene],
  scale: {
    mode: Phaser.Scale.NONE, // Без масштабирования - используем реальный размер
  },
  physics: {
    default: "arcade",
  },
};

new Phaser.Game(config);
