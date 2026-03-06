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

let pendingCanvasRetry = false;

window.onerror = (msg) => {
  if (!pendingCanvasRetry && String(msg).includes("Framebuffer")) {
    pendingCanvasRetry = true;
    startGame(Phaser.CANVAS);
    return true;
  }
  showError("ERROR: " + msg);
};
window.addEventListener("unhandledrejection", (e) => showError("REJECT: " + e.reason));

// Инициализация Telegram WebApp до создания игры (fullscreen mode)
initTelegram();

function detectRenderer(): number {
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl") || c.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return Phaser.CANVAS;
    // Test with texture attachment — this is what Phaser uses internally
    const fb = gl.createFramebuffer();
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 2, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.deleteFramebuffer(fb);
    gl.deleteTexture(tex);
    c.remove();
    return ok ? Phaser.AUTO : Phaser.CANVAS;
  } catch {
    return Phaser.CANVAS;
  }
}

let gameInstance: Phaser.Game | null = null;
let currentUnlockAudio: (() => void) | null = null;

function removeAudioUnlockListeners() {
  if (currentUnlockAudio) {
    document.removeEventListener("touchstart", currentUnlockAudio, true);
    document.removeEventListener("touchend", currentUnlockAudio, true);
    document.removeEventListener("click", currentUnlockAudio, true);
    currentUnlockAudio = null;
  }
}

function startGame(rendererType: number) {
  // Destroy previous instance if retrying with Canvas
  if (gameInstance) {
    removeAudioUnlockListeners();
    try { gameInstance.destroy(true); } catch { /* ignore */ }
    const appEl = document.getElementById("app");
    if (appEl) appEl.innerHTML = "";
  }

  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;
  const safeArea = getSafeAreaInsets();
  const dpr = Math.min(window.devicePixelRatio || 1, 3);

  setDPR(dpr);
  setScreenSize(screenWidth, screenHeight, safeArea);
  updateScaledValues();

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
    gameInstance = new Phaser.Game(config);

    // Aggressive audio unlock for Telegram WebApp / mobile WebViews.
    // Tiny silent WAV (44-byte header, no samples)
    const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";
    let audioUnlocked = false;
    const game = gameInstance;
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
      if (!ctx) return;
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

      removeAudioUnlockListeners();
    };
    currentUnlockAudio = unlockAudio;
    document.addEventListener("touchstart", unlockAudio, { capture: true });
    document.addEventListener("touchend", unlockAudio, { capture: true });
    document.addEventListener("click", unlockAudio, { capture: true });
  } catch (e) {
    showError("GAME: " + (e instanceof Error ? e.message : String(e)));
  }
}

// Ждём 100ms для полной инициализации Telegram API (safeAreaInset)
setTimeout(() => startGame(detectRenderer()), 100);
