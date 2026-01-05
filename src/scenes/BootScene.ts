import Phaser from "phaser";
import { ASSET_KEYS } from "../game/assets";
import { CELL_SIZE } from "../game/config";
import { TileKind } from "../match3/types";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  preload() {
    // Boss sprites (Kristi)
    this.load.image(ASSET_KEYS.boss.normal, "assets/kristi_1.png");
    this.load.image(ASSET_KEYS.boss.damaged, "assets/kristi_2.png");
    this.load.image(ASSET_KEYS.boss.ulta, "assets/kristi_ulta.png");

    // Tile sprites from PNG files
    this.load.image(ASSET_KEYS.tiles[TileKind.Sword], "assets/tiles/tile_sword.png");
    this.load.image(ASSET_KEYS.tiles[TileKind.Star], "assets/tiles/tile_star.png");
    this.load.image(ASSET_KEYS.tiles[TileKind.Mana], "assets/tiles/tile_mana.png");
    this.load.image(ASSET_KEYS.tiles[TileKind.Heal], "assets/tiles/tile_heal.jpg");
  }

  create() {
    // Generate only special tile textures (boosters, ultimate)
    this.buildSpecialTileTextures();
    this.scene.start("GameScene");
  }

  private buildSpecialTileTextures() {
    const size = CELL_SIZE - 4;
    const specialDefs: Array<{
      color: number;
      accent: number;
      key: string;
      symbol?: string;
    }> = [
      {
        color: 0xf7c948,
        accent: 0xffffff,
        key: ASSET_KEYS.tiles[TileKind.BoosterRow],
        symbol: "→",
      },
      {
        color: 0xf17c67,
        accent: 0xffffff,
        key: ASSET_KEYS.tiles[TileKind.BoosterCol],
        symbol: "↓",
      },
      {
        color: 0xffffff,
        accent: 0x222222,
        key: ASSET_KEYS.tiles[TileKind.Ultimate],
        symbol: "★",
      },
    ];

    specialDefs.forEach((def) => {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.fillStyle(def.color, 1);
      g.fillRoundedRect(2, 2, size, size, 10);
      g.lineStyle(4, def.accent, 0.8);
      g.strokeRoundedRect(2, 2, size, size, 10);
      g.generateTexture(def.key, CELL_SIZE, CELL_SIZE);
      g.destroy();
    });
  }
}
