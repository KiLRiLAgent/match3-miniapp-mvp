import "./style.css";
import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { GameScene } from "./scenes/GameScene";
import { setScreenSize, updateScaledValues } from "./game/config";
import { initTelegram, getSafeAreaInsets } from "./telegram/telegram";

// Инициализация Telegram WebApp до создания игры (fullscreen mode)
initTelegram();

// Ждём 100ms для полной инициализации Telegram API (safeAreaInset)
setTimeout(() => {
  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;
  const safeArea = getSafeAreaInsets();

  setScreenSize(screenWidth, screenHeight, safeArea);
  updateScaledValues();

  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: screenWidth,
    height: screenHeight,
    parent: "app",
    backgroundColor: "#0d0f1a",
    scene: [BootScene, GameScene],
    scale: {
      mode: Phaser.Scale.NONE,
    },
    physics: {
      default: "arcade",
    },
  };

  new Phaser.Game(config);
}, 100);
