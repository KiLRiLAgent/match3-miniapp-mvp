import "./style.css";
import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { GameScene } from "./scenes/GameScene";
import { setScreenSize, updateScaledValues } from "./game/config";
import { initTelegram, getSafeViewport } from "./telegram/telegram";

// Инициализация Telegram WebApp до создания игры
initTelegram();

// Получаем безопасные размеры viewport с учётом safe areas Telegram
const viewport = getSafeViewport();
setScreenSize(viewport.width, viewport.height, viewport.safeTop, viewport.safeBottom);
updateScaledValues();

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: viewport.width,
  height: viewport.height,
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
