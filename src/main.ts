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
    audio: {
      disableWebAudio: false,
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    physics: {
      default: "arcade",
    },
    plugins: {
      scene: [
        {
          key: "SpinePlugin",
          plugin: window.SpinePlugin,
          mapping: "spine",
        },
      ],
    },
  };

  const game = new Phaser.Game(config);

  // Aggressive audio unlock for Telegram WebApp / mobile WebViews.
  // Telegram's WebView keeps the audio session in "ambient" mode which may
  // be muted. Playing an HTML5 <audio> element forces the WebView to switch
  // to "playback" audio session, which bypasses mute restrictions.
  // Tiny silent WAV (44-byte header, no samples)
  const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";
  let audioUnlocked = false;
  const unlockAudio = () => {
    if (audioUnlocked) return;

    // Step 1: Unlock media session via HTML5 Audio (critical for Telegram WebView)
    try {
      const a = new Audio(SILENT_WAV);
      a.volume = 0.01;
      a.play().then(() => a.remove()).catch(() => {});
    } catch (_) { /* ignore */ }

    // Step 2: Resume Web Audio context
    const snd = game.sound as Phaser.Sound.WebAudioSoundManager;
    const ctx = snd?.context;
    if (!ctx) return; // Game not ready yet — keep listener for next gesture
    audioUnlocked = true;
    if (ctx.state === "suspended") ctx.resume();

    // Step 3: Play silent buffer through Web Audio (extra unlock for WebKit)
    try {
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
    } catch (_) { /* ignore */ }

    document.removeEventListener("touchstart", unlockAudio, true);
    document.removeEventListener("touchend", unlockAudio, true);
    document.removeEventListener("click", unlockAudio, true);
  };
  document.addEventListener("touchstart", unlockAudio, { capture: true });
  document.addEventListener("touchend", unlockAudio, { capture: true });
  document.addEventListener("click", unlockAudio, { capture: true });
}, 100);
