import Phaser from "phaser";
import { ASSET_KEYS } from "../game/assets";
import { CELL_SIZE, BASE_TYPES, setScreenSize, updateScaledValues, loadGameParams, DPR } from "../game/config";
import { TileKind } from "../match3/types";
import { getSafeAreaInsets } from "../telegram/telegram";
import { loadAudioSettings } from "../utils/audioSettings";
import { loadHapticSettings } from "../utils/haptics";


export class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  preload() {
    // === Loading screen (task 2) ===
    const cx = this.cameras.main.width / 2;
    const cy = this.cameras.main.height / 2;
    const d = DPR;

    const titleText = this.add
      .text(cx, cy - 80 * d, "Match-3 Battle", {
        fontSize: `${42 * d}px`,
        color: "#ffffff",
        fontFamily: "'Exo 2', Arial, sans-serif",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    const barWidth = 320 * d;
    const barHeight = 28 * d;
    const barBg = this.add
      .rectangle(cx, cy, barWidth, barHeight, 0x333333)
      .setOrigin(0.5);
    barBg.setStrokeStyle(3 * d, 0x555555);

    const barFill = this.add
      .rectangle(cx - barWidth / 2 + 2 * d, cy, 0, barHeight - 4 * d, 0x3b82f6)
      .setOrigin(0, 0.5);

    const percentText = this.add
      .text(cx, cy + 40 * d, "0%", {
        fontSize: `${24 * d}px`,
        color: "#aaaaaa",
        fontFamily: "'Exo 2', Arial, sans-serif",
      })
      .setOrigin(0.5);

    this.load.on("progress", (value: number) => {
      barFill.width = (barWidth - 4 * d) * value;
      percentText.setText(`${Math.floor(value * 100)}%`);
    });

    this.load.on("complete", () => {
      titleText.destroy();
      barBg.destroy();
      barFill.destroy();
      percentText.destroy();
    });

    // Load boss sprites (5 states × 2 layers)
    this.load.image(ASSET_KEYS.boss.intro, "assets/safira/safira_intro.png");
    this.load.image(ASSET_KEYS.boss.introBack, "assets/safira/safira_intro_back.png");
    this.load.image(ASSET_KEYS.boss.main, "assets/safira/safira_main.png");
    this.load.image(ASSET_KEYS.boss.mainBack, "assets/safira/safira_main_back.png");
    this.load.image(ASSET_KEYS.boss.attack, "assets/safira/safira_attack.png");
    this.load.image(ASSET_KEYS.boss.attackBack, "assets/safira/safira_attack_back.png");
    this.load.image(ASSET_KEYS.boss.ulta, "assets/safira/safira_ulta.png");
    this.load.image(ASSET_KEYS.boss.ultaBack, "assets/safira/safira_ulta_back.png");
    this.load.image(ASSET_KEYS.boss.lowhp, "assets/safira/safira_lowhp.png");
    this.load.image(ASSET_KEYS.boss.lowhpBack, "assets/safira/safira_lowhp_back.png");
    this.load.image(ASSET_KEYS.boss.damage, "assets/safira/safira_damage.png");
    this.load.image(ASSET_KEYS.boss.damageBack, "assets/safira/safira_damage_back.png");
    this.load.image(ASSET_KEYS.boss.shield, "assets/shield.png");

    // Load intro assets
    this.load.image(ASSET_KEYS.intro.background, "assets/intro/background.png");
    this.load.image(ASSET_KEYS.intro.vsLogo, "assets/intro/vs_logo.png");
    this.load.image(ASSET_KEYS.intro.swords, "assets/intro/swords.png");
    this.load.image(ASSET_KEYS.intro.swordsGloom, "assets/intro/swords_gloom.png");
    this.load.image(ASSET_KEYS.intro.playerGloom, "assets/intro/player_gloom.png");
    this.load.image(ASSET_KEYS.intro.playerFrame, "assets/intro/player_frame.png");
    this.load.image(ASSET_KEYS.intro.playerNameplate, "assets/intro/player_nameplate.png");

    // Load game background
    this.load.image(ASSET_KEYS.game.background, "background.png");

    // Load player avatar
    this.load.image(ASSET_KEYS.player.avatar, "assets/player/player.png");

    // Load base tile sprites
    BASE_TYPES.forEach((kind) => {
      const key = ASSET_KEYS.tiles[kind];
      this.load.image(key, `assets/tiles/${key}.png`);
    });

    // Load SFX
    Object.values(ASSET_KEYS.sfx).forEach(key => {
      this.load.audio(key, `assets/sfx/${key}.mp3`);
    });

    // Load background music
    this.load.audio(ASSET_KEYS.music.bgm, `assets/sfx/${ASSET_KEYS.music.bgm}.mp3`);

    // Ignore individual file load failures (audio may fail on some devices)
    this.load.on("loaderror", (file: Phaser.Loader.File) => {
      console.warn(`Failed to load: ${file.key} (${file.url})`);
    });
  }

  create() {
    // Обновить layout с актуальными safe areas от Telegram ПЕРЕД генерацией текстур
    // (CELL_SIZE вычисляется динамически в updateScaledValues)
    const safeArea = getSafeAreaInsets();
    setScreenSize(window.innerWidth, window.innerHeight, safeArea);
    updateScaledValues();

    this.buildSpecialTileTextures();
    this.buildParticleTexture();

    // Load user settings
    loadAudioSettings();
    loadHapticSettings();

    // Загружаем параметры до старта любых сцен
    loadGameParams();

    // Ждём пока браузер завершит загрузку всех @font-face (включая Google Fonts из index.html)
    const fontReady = document.fonts.ready.then(() => {
      if (!document.fonts.check('700 16px "Exo 2"')) {
        // Google Fonts CSS не дошёл — принудительно тригерим загрузку
        return Promise.all([
          document.fonts.load('500 16px "Exo 2"'),
          document.fonts.load('600 16px "Exo 2"'),
          document.fonts.load('700 16px "Exo 2"'),
        ]);
      }
    });
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 3000));
    Promise.race([fontReady, timeout]).then(() => {
      this.scene.start("IntroScene");
    });
  }

  private buildSpecialTileTextures() {
    const d = DPR;
    const size = (CELL_SIZE - 2) * d;
    const specialTiles = [
      { color: 0xf7c948, accent: 0xffffff, key: ASSET_KEYS.tiles[TileKind.BoosterRow] },
      { color: 0xf17c67, accent: 0xffffff, key: ASSET_KEYS.tiles[TileKind.BoosterCol] },
      { color: 0xffffff, accent: 0x222222, key: ASSET_KEYS.tiles[TileKind.Ultimate] },
    ];

    for (const tile of specialTiles) {
      const g = this.add.graphics();
      g.fillStyle(tile.color, 1);
      g.fillRoundedRect(2 * d, 2 * d, size, size, 10 * d);
      g.lineStyle(4 * d, tile.accent, 0.8);
      g.strokeRoundedRect(2 * d, 2 * d, size, size, 10 * d);
      g.generateTexture(tile.key, CELL_SIZE * d, CELL_SIZE * d);
      g.destroy();
    }

    this.buildBombTexture();
    this.buildEnhancedGlowTextures();
  }

  private buildBombTexture() {
    const d = DPR;
    const g = this.add.graphics();
    const center = CELL_SIZE * d / 2;
    const radius = (CELL_SIZE - 4) * d / 2;

    // Ярко-красный фон
    g.fillStyle(0xdd3333, 1);
    g.fillCircle(center, center, radius);

    // Тёмно-красная обводка
    g.lineStyle(3 * d, 0x991111, 1);
    g.strokeCircle(center, center, radius);

    // Тёмный круг бомбы внутри
    g.fillStyle(0x333333, 1);
    g.fillCircle(center, center + 3 * d, radius * 0.55);

    // Блик на бомбе
    g.fillStyle(0x555555, 1);
    g.fillCircle(center - 5 * d, center - 2 * d, 4 * d);

    // Фитиль
    g.lineStyle(3 * d, 0xffaa00, 1);
    g.beginPath();
    g.moveTo(center, center - radius * 0.35);
    g.lineTo(center + 6 * d, center - radius * 0.65);
    g.strokePath();

    // Искра на фитиле
    g.fillStyle(0xffff00, 1);
    g.fillCircle(center + 7 * d, center - radius * 0.7, 5 * d);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(center + 7 * d, center - radius * 0.7, 2 * d);

    g.generateTexture(ASSET_KEYS.tiles[TileKind.Bomb], CELL_SIZE * d, CELL_SIZE * d);
    g.destroy();
  }

  private buildEnhancedGlowTextures() {
    const d = DPR;
    const size = Math.ceil(CELL_SIZE * d);

    const buildGradient = (key: string, r: number, g: number, b: number) => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const center = size / 2;
      const grad = ctx.createRadialGradient(center, center, 0, center, center, center);
      const rgba = (a: number) => `rgba(${r},${g},${b},${a})`;
      grad.addColorStop(0, rgba(0.9));
      grad.addColorStop(0.6, rgba(0.5));
      grad.addColorStop(1, rgba(0));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
      this.textures.addCanvas(key, canvas);
    };

    // Gold glow (4-match)
    buildGradient(ASSET_KEYS.glow.gold, 255, 215, 0);
    // Red glow (5+ match)
    buildGradient(ASSET_KEYS.glow.red, 255, 68, 68);
  }

  private buildParticleTexture() {
    const d = DPR;
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillCircle(4 * d, 4 * d, 4 * d);
    g.generateTexture(ASSET_KEYS.particle, 8 * d, 8 * d);
    g.destroy();
  }
}
