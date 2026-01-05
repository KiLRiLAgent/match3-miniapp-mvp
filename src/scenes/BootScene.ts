import Phaser from "phaser";
import { ASSET_KEYS } from "../game/assets";
import { CELL_SIZE, BASE_TYPES } from "../game/config";
import { TileKind } from "../match3/types";

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
    this.scene.start("GameScene");
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
  }
}
