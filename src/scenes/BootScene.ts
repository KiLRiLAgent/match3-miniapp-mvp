import Phaser from "phaser";
import { ASSET_KEYS } from "../game/assets";
import { CELL_SIZE, BASE_TYPES, setScreenSize, updateScaledValues, loadGameParams } from "../game/config";
import { TileKind } from "../match3/types";
import { getSafeAreaInsets } from "../telegram/telegram";

// All tiles use png
const TILE_EXTENSIONS: Record<string, string> = {};

export class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  preload() {
    // Load boss sprites (new Safira assets)
    this.load.image(ASSET_KEYS.boss.normal, "assets/safira/safira_normal.png");
    this.load.image(ASSET_KEYS.boss.battle, "assets/safira/safira_battle.png");
    this.load.image(ASSET_KEYS.boss.damaged, "assets/safira/safira_damaged.png");
    this.load.image(ASSET_KEYS.boss.ulta, "assets/safira/safira_ulta.png");

    // Load intro assets
    this.load.image(ASSET_KEYS.intro.background, "assets/intro/background.png");
    this.load.image(ASSET_KEYS.intro.vsLogo, "assets/intro/vs_logo.png");
    this.load.image(ASSET_KEYS.intro.swords, "assets/intro/swords.png");
    this.load.image(ASSET_KEYS.intro.swordsGloom, "assets/intro/swords_gloom.png");
    this.load.image(ASSET_KEYS.intro.playerFrame, "assets/intro/player_frame.png");
    this.load.image(ASSET_KEYS.intro.playerNameplate, "assets/intro/player_nameplate.png");

    // Load game background
    this.load.image(ASSET_KEYS.game.background, "background.png");

    // Load player avatar
    this.load.image(ASSET_KEYS.player.avatar, "assets/player/player.png");

    // Load base tile sprites
    BASE_TYPES.forEach((kind) => {
      const key = ASSET_KEYS.tiles[kind];
      const ext = TILE_EXTENSIONS[kind] ?? "png";
      this.load.image(key, `assets/tiles/${key}.${ext}`);
    });
  }

  create() {
    this.buildSpecialTileTextures();

    // Обновить layout с актуальными safe areas от Telegram
    const safeArea = getSafeAreaInsets();
    setScreenSize(window.innerWidth, window.innerHeight, safeArea);
    updateScaledValues();

    // Загружаем параметры до старта любых сцен
    loadGameParams();

    // Ждём загрузки веб-шрифта, затем переходим в интро
    document.fonts.ready.then(() => {
      this.scene.start("IntroScene");
    });
  }

  private buildSpecialTileTextures() {
    const size = CELL_SIZE - 4;
    const specialTiles = [
      { color: 0xf7c948, accent: 0xffffff, key: ASSET_KEYS.tiles[TileKind.BoosterRow] },
      { color: 0xf17c67, accent: 0xffffff, key: ASSET_KEYS.tiles[TileKind.BoosterCol] },
      { color: 0xffffff, accent: 0x222222, key: ASSET_KEYS.tiles[TileKind.Ultimate] },
    ];

    for (const tile of specialTiles) {
      const g = this.add.graphics();
      g.fillStyle(tile.color, 1);
      g.fillRoundedRect(2, 2, size, size, 10);
      g.lineStyle(4, tile.accent, 0.8);
      g.strokeRoundedRect(2, 2, size, size, 10);
      g.generateTexture(tile.key, CELL_SIZE, CELL_SIZE);
      g.destroy();
    }

    this.buildBombTexture();
  }

  private buildBombTexture() {
    const g = this.add.graphics();
    const center = CELL_SIZE / 2;
    const radius = (CELL_SIZE - 8) / 2;

    // Ярко-красный фон
    g.fillStyle(0xdd3333, 1);
    g.fillCircle(center, center, radius);

    // Тёмно-красная обводка
    g.lineStyle(3, 0x991111, 1);
    g.strokeCircle(center, center, radius);

    // Тёмный круг бомбы внутри
    g.fillStyle(0x333333, 1);
    g.fillCircle(center, center + 3, radius * 0.55);

    // Блик на бомбе
    g.fillStyle(0x555555, 1);
    g.fillCircle(center - 5, center - 2, 4);

    // Фитиль
    g.lineStyle(3, 0xffaa00, 1);
    g.beginPath();
    g.moveTo(center, center - radius * 0.35);
    g.lineTo(center + 6, center - radius * 0.65);
    g.strokePath();

    // Искра на фитиле
    g.fillStyle(0xffff00, 1);
    g.fillCircle(center + 7, center - radius * 0.7, 5);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(center + 7, center - radius * 0.7, 2);

    g.generateTexture(ASSET_KEYS.tiles[TileKind.Bomb], CELL_SIZE, CELL_SIZE);
    g.destroy();
  }
}
