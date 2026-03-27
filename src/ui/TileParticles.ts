import Phaser from "phaser";
import { TileKind } from "../match3/types";
import { ASSET_KEYS } from "../game/assets";

const TILE_COLORS: Record<string, number> = {
  [TileKind.Sword]: 0xff4444,
  [TileKind.Star]: 0xaa44ff,
  [TileKind.Mana]: 0x4488ff,
  [TileKind.Heal]: 0x44ff66,
  [TileKind.Bomb]: 0xff2222,
  /** @deprecated No longer generated */
  [TileKind.BoosterRow]: 0xf7c948,
  /** @deprecated No longer generated */
  [TileKind.BoosterCol]: 0xf17c67,
  /** @deprecated No longer generated */
  [TileKind.Ultimate]: 0xffffff,
};

export function emitTileParticles(
  scene: Phaser.Scene,
  x: number,
  y: number,
  tileKind: TileKind,
  count = 6
): void {
  const color = TILE_COLORS[tileKind] ?? 0xffffff;

  const emitter = scene.add.particles(x, y, ASSET_KEYS.particle, {
    speed: { min: 40, max: 100 },
    scale: { start: 0.8, end: 0 },
    alpha: { start: 1, end: 0 },
    lifespan: 400,
    quantity: count,
    tint: color,
    emitting: false,
  });
  emitter.setDepth(3);
  emitter.explode(count);

  scene.time.delayedCall(500, () => emitter.destroy());
}
