import Phaser from "phaser";
import { ASSET_KEYS } from "../game/assets";
import { CELL_SIZE, BASE_TYPES, GAME_WIDTH, GAME_HEIGHT, setScreenSize, updateScaledValues } from "../game/config";
import { TileKind } from "../match3/types";
import { getSafeAreaInsets } from "../telegram/telegram";

// Tile asset file extensions (most are png, heal is jpg)
const TILE_EXTENSIONS: Record<string, string> = {
  [TileKind.Heal]: "jpg",
};

export class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  preload() {
    // Load boss sprites
    Object.entries(ASSET_KEYS.boss).forEach(([, key]) => {
      this.load.image(key, `assets/${key}.png`);
    });

    // Load base tile sprites
    BASE_TYPES.forEach((kind) => {
      const key = ASSET_KEYS.tiles[kind];
      const ext = TILE_EXTENSIONS[kind] ?? "png";
      this.load.image(key, `assets/tiles/${key}.${ext}`);
    });
  }

  create() {
    this.buildSpecialTileTextures();
    this.showLoadingScreen();
  }

  private showLoadingScreen() {
    // Тёмный фон
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0d0f1a).setOrigin(0);

    // Текст "Загрузка..."
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40, "Загрузка...", {
      fontSize: "24px",
      color: "#ffffff",
      fontFamily: "Arial, sans-serif",
    }).setOrigin(0.5);

    // Фон прогресс-бара
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 20, 200, 20, 0x333333)
      .setOrigin(0.5)
      .setStrokeStyle(2, 0x555555);

    // Заполнение прогресс-бара
    const barFill = this.add.rectangle(
      GAME_WIDTH / 2 - 98,
      GAME_HEIGHT / 2 + 20,
      0,
      16,
      0x4caf50
    ).setOrigin(0, 0.5);

    // Анимация прогресса (2 секунды)
    this.tweens.add({
      targets: barFill,
      width: 196,
      duration: 2000,
      ease: "Linear",
      onComplete: () => {
        // Обновить layout с актуальными safe areas от Telegram
        const safeArea = getSafeAreaInsets();
        setScreenSize(window.innerWidth, window.innerHeight, safeArea);
        updateScaledValues();

        // Небольшая задержка и переход в игру
        this.time.delayedCall(300, () => {
          this.scene.start("GameScene");
        });
      },
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
