import Phaser from "phaser";
import { ASSET_KEYS } from "../game/assets";
import { CELL_SIZE } from "../game/config";
import { TileKind } from "../match3/types";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  preload() {
    this.load.image("vite", "/vite.svg");
    this.load.image(ASSET_KEYS.boss.stage0, "assets/boss_stage_0.svg");
    this.load.image(ASSET_KEYS.boss.stage1, "assets/boss_stage_1.svg");
    this.load.image(ASSET_KEYS.boss.stage2, "assets/boss_stage_2.svg");
    this.load.image(ASSET_KEYS.boss.stage3, "assets/boss_stage_3.svg");
  }

  create() {
    this.buildTileTextures();
    this.scene.start("GameScene");
  }

  private buildTileTextures() {
    const size = CELL_SIZE - 4;
    const defs: Array<{
      kind: TileKind;
      color: number;
      accent: number;
      key: string;
    }> = [
      {
        kind: TileKind.Sword,
        color: 0xe4572e,
        accent: 0xffd7ba,
        key: ASSET_KEYS.tiles[TileKind.Sword],
      },
      {
        kind: TileKind.Star,
        color: 0x8a7aff,
        accent: 0xdccfff,
        key: ASSET_KEYS.tiles[TileKind.Star],
      },
      {
        kind: TileKind.Mana,
        color: 0x3ba1ff,
        accent: 0xc7e8ff,
        key: ASSET_KEYS.tiles[TileKind.Mana],
      },
      {
        kind: TileKind.Heal,
        color: 0x3abf8f,
        accent: 0xc2ffe2,
        key: ASSET_KEYS.tiles[TileKind.Heal],
      },
      {
        kind: TileKind.BoosterRow,
        color: 0xf7c948,
        accent: 0xffffff,
        key: ASSET_KEYS.tiles[TileKind.BoosterRow],
      },
      {
        kind: TileKind.BoosterCol,
        color: 0xf17c67,
        accent: 0xffffff,
        key: ASSET_KEYS.tiles[TileKind.BoosterCol],
      },
      {
        kind: TileKind.Ultimate,
        color: 0xffffff,
        accent: 0x222222,
        key: ASSET_KEYS.tiles[TileKind.Ultimate],
      },
    ];

    defs.forEach((def) => {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.fillStyle(def.color, 1);
      g.fillRoundedRect(2, 2, size, size, 10);
      g.lineStyle(4, def.accent, 0.8);
      g.strokeRoundedRect(2, 2, size, size, 10);
      g.lineBetween(6, 6, size, size);
      g.lineBetween(size, 6, 6, size);
      g.generateTexture(def.key, CELL_SIZE, CELL_SIZE);
      g.destroy();
    });
  }
}
