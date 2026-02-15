import "./style.css";
import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { IntroScene } from "./scenes/IntroScene";
import { GameScene } from "./scenes/GameScene";
import { setScreenSize, updateScaledValues, setDPR } from "./game/config";
import { initTelegram, getSafeAreaInsets } from "./telegram/telegram";

// Инициализация Telegram WebApp до создания игры (fullscreen mode)
initTelegram();

// Ждём 100ms для полной инициализации Telegram API (safeAreaInset)
setTimeout(() => {
  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;
  const safeArea = getSafeAreaInsets();
  const dpr = Math.min(window.devicePixelRatio || 1, 3);

  setDPR(dpr);
  setScreenSize(screenWidth, screenHeight, safeArea);
  updateScaledValues();

  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: screenWidth * dpr,
    height: screenHeight * dpr,
    parent: "app",
    backgroundColor: "#0d0f1a",
    scene: [BootScene, IntroScene, GameScene],
    scale: {
      mode: Phaser.Scale.NONE,
    },
    physics: {
      default: "arcade",
    },
  };

  new Phaser.Game(config);
}, 100);
