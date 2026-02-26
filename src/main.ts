import "./style.css";
import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { IntroScene } from "./scenes/IntroScene";
import { GameScene } from "./scenes/GameScene";
import { setScreenSize, updateScaledValues, setDPR } from "./game/config";
import { initTelegram, getSafeAreaInsets } from "./telegram/telegram";

function showError(msg: string) {
  const div = document.createElement("div");
  div.style.cssText = "position:fixed;top:0;left:0;right:0;padding:16px;background:red;color:white;font:14px monospace;z-index:99999;word-break:break-all";
  div.textContent = msg;
  document.body.appendChild(div);
}
window.onerror = (msg) => showError("ERROR: " + msg);
window.addEventListener("unhandledrejection", (e) => showError("REJECT: " + e.reason));

// Инициализация Telegram WebApp до создания игры (fullscreen mode)
initTelegram();

function detectRenderer(): number {
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl") || c.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return Phaser.CANVAS;
    const fb = gl.createFramebuffer();
    const rb = gl.createRenderbuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA4, 2, 2);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, rb);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.deleteFramebuffer(fb);
    gl.deleteRenderbuffer(rb);
    c.remove();
    return ok ? Phaser.AUTO : Phaser.CANVAS;
  } catch {
    return Phaser.CANVAS;
  }
}

// Ждём 100ms для полной инициализации Telegram API (safeAreaInset)
setTimeout(() => {
  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;
  const safeArea = getSafeAreaInsets();
  const dpr = Math.min(window.devicePixelRatio || 1, 3);

  setDPR(dpr);
  setScreenSize(screenWidth, screenHeight, safeArea);
  updateScaledValues();

  const rendererType = detectRenderer();

  const config: Phaser.Types.Core.GameConfig = {
    type: rendererType,
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
  };

  try {
    const game = new Phaser.Game(config);

    // Aggressive audio unlock for Telegram WebApp / mobile WebViews.
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
  } catch (e) {
    showError("GAME: " + (e instanceof Error ? e.message : String(e)));
  }
}, 100);
