import Phaser from "phaser";
import { TileKind } from "../match3/types";
import { ASSET_KEYS } from "../game/assets";
import { FLYING_TILE } from "../game/animations";

// Trail colors per tile type
const TILE_COLORS: Partial<Record<TileKind, number>> = {
  [TileKind.Sword]: 0xff6644,
  [TileKind.Star]: 0xaa66ff,
  [TileKind.Mana]: 0x4488ff,
  [TileKind.Heal]: 0x44ff66,
};

export interface FlyTarget {
  x: number;
  y: number;
}

function calculateBezierPoint(
  t: number,
  startX: number,
  startY: number,
  midX: number,
  midY: number,
  endX: number,
  endY: number
): { x: number; y: number } {
  const oneMinusT = 1 - t;
  return {
    x: oneMinusT * oneMinusT * startX + 2 * oneMinusT * t * midX + t * t * endX,
    y: oneMinusT * oneMinusT * startY + 2 * oneMinusT * t * midY + t * t * endY,
  };
}

export function flyTileToTarget(
  scene: Phaser.Scene,
  startX: number,
  startY: number,
  target: FlyTarget,
  tileKind: TileKind,
  duration = 400,
  delay = 0
): Promise<void> {
  return new Promise<void>((resolve) => {
    const color = TILE_COLORS[tileKind] ?? 0xffffff;

    const endX = target.x + Phaser.Math.Between(-FLYING_TILE.targetSpread, FLYING_TILE.targetSpread);
    const endY = target.y + Phaser.Math.Between(-FLYING_TILE.targetSpread, FLYING_TILE.targetSpread);
    const midX = (startX + endX) / 2;
    const midY = Math.min(startY, endY) - FLYING_TILE.arcHeight - Phaser.Math.Between(0, FLYING_TILE.arcVariation);

    const textureKey = ASSET_KEYS.tiles[tileKind] ?? tileKind;
    const tile = scene.add
      .image(startX, startY, textureKey)
      .setDisplaySize(FLYING_TILE.size, FLYING_TILE.size)
      .setDepth(200);

    const baseScale = tile.scaleX;
    const trailGraphics = scene.add.graphics().setDepth(199);

    // Circular buffer for trail points - avoids O(n) shift operations
    const MAX_TRAIL_POINTS = 32;
    const trailPoints: Array<{ x: number; y: number; alpha: number }> = [];
    let trailHead = 0;

    let progress = 0;
    const startTime = scene.time.now + delay;
    let isCleanedUp = false;

    const cleanup = () => {
      if (isCleanedUp) return;
      isCleanedUp = true;

      scene.events.off("update", updateHandler);
      scene.events.off("shutdown", cleanup);

      if (tile.scene) tile.destroy();
      if (trailGraphics.scene) trailGraphics.destroy();

      resolve();
    };

    const updateHandler = () => {
      if (isCleanedUp) return;
      if (!scene.sys.isActive()) {
        cleanup();
        return;
      }

      const now = scene.time.now;
      if (now < startTime) return;

      progress = Math.min(1, (now - startTime) / duration);

      const { x, y } = calculateBezierPoint(
        progress,
        startX,
        startY,
        midX,
        midY,
        endX,
        endY
      );

      tile.setPosition(x, y);
      tile.setScale(baseScale * (1 - progress * FLYING_TILE.flyingTileScaleReduction));

      // Add new trail point using circular buffer pattern
      if (trailPoints.length < MAX_TRAIL_POINTS) {
        trailPoints.push({ x, y, alpha: 1 });
      } else {
        trailPoints[trailHead] = { x, y, alpha: 1 };
        trailHead = (trailHead + 1) % MAX_TRAIL_POINTS;
      }

      // Render trail - iterate all points and fade them
      trailGraphics.clear();
      for (let i = 0; i < trailPoints.length; i++) {
        const point = trailPoints[i];
        point.alpha -= FLYING_TILE.trailFade;
        if (point.alpha > 0) {
          trailGraphics.fillStyle(color, point.alpha * FLYING_TILE.trailOpacity);
          trailGraphics.fillCircle(point.x, point.y, FLYING_TILE.trailSize * point.alpha);
        }
      }

      if (progress >= 1) {
        scene.events.off("update", updateHandler);
        scene.events.off("shutdown", cleanup);

        if (tile.scene) tile.destroy();

        if (trailGraphics.scene) {
          scene.tweens.add({
            targets: trailGraphics,
            alpha: 0,
            duration: 150,
            onComplete: () => {
              if (trailGraphics.scene) trailGraphics.destroy();
            },
          });
        }

        isCleanedUp = true;
        resolve();
      }
    };

    scene.events.on("update", updateHandler);
    scene.events.once("shutdown", cleanup);
  });
}

export function flyTilesToTarget(
  scene: Phaser.Scene,
  tiles: Array<{ x: number; y: number; kind: TileKind }>,
  target: FlyTarget,
  baseDuration = 400
): Promise<void> {
  if (tiles.length === 0) return Promise.resolve();

  const promises = tiles.map((tile, index) =>
    flyTileToTarget(scene, tile.x, tile.y, target, tile.kind, baseDuration, index * FLYING_TILE.delayBetweenTiles)
  );

  return Promise.all(promises).then(() => undefined);
}
