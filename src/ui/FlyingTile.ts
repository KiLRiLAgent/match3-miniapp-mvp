import Phaser from "phaser";
import { TileKind } from "../match3/types";

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

/**
 * Анимация полёта фишки к цели с трейлом.
 * Фишка летит по кривой Безье, уменьшаясь в размере.
 * За ней остаётся цветной след.
 */
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
    const size = 32;

    // Рандомизация точки попадания
    const offsetX = Phaser.Math.Between(-15, 15);
    const offsetY = Phaser.Math.Between(-15, 15);
    const endX = target.x + offsetX;
    const endY = target.y + offsetY;

    // Контрольная точка для кривой Безье (дуга)
    const midX = (startX + endX) / 2;
    const midY = Math.min(startY, endY) - 60 - Phaser.Math.Between(0, 30);

    // Основной спрайт фишки (квадрат с цветом)
    const tile = scene.add
      .rectangle(startX, startY, size, size, color, 1)
      .setDepth(200);

    // Контейнер для трейла
    const trailGraphics = scene.add.graphics().setDepth(199);
    const trailPoints: { x: number; y: number; alpha: number }[] = [];

    // Анимация полёта по кривой
    let progress = 0;
    const startTime = scene.time.now + delay;

    const updateHandler = () => {
      const now = scene.time.now;
      if (now < startTime) return;

      progress = Math.min(1, (now - startTime) / duration);

      // Квадратичная кривая Безье: B(t) = (1-t)²P0 + 2(1-t)tP1 + t²P2
      const t = progress;
      const oneMinusT = 1 - t;
      const x =
        oneMinusT * oneMinusT * startX +
        2 * oneMinusT * t * midX +
        t * t * endX;
      const y =
        oneMinusT * oneMinusT * startY +
        2 * oneMinusT * t * midY +
        t * t * endY;

      tile.setPosition(x, y);

      // Уменьшение размера во время полёта
      const scale = 1 - progress * 0.6;
      tile.setScale(scale);

      // Добавляем точку в трейл
      trailPoints.push({ x, y, alpha: 1 });

      // Рисуем трейл
      trailGraphics.clear();
      for (let i = 0; i < trailPoints.length; i++) {
        const point = trailPoints[i];
        point.alpha -= 0.08;
        if (point.alpha > 0) {
          const pointSize = 6 * point.alpha;
          trailGraphics.fillStyle(color, point.alpha * 0.7);
          trailGraphics.fillCircle(point.x, point.y, pointSize);
        }
      }

      // Удаляем старые точки
      while (trailPoints.length > 0 && trailPoints[0].alpha <= 0) {
        trailPoints.shift();
      }

      if (progress >= 1) {
        scene.events.off("update", updateHandler);
        tile.destroy();

        // Финальная очистка трейла с анимацией затухания
        scene.tweens.add({
          targets: trailGraphics,
          alpha: 0,
          duration: 150,
          onComplete: () => {
            trailGraphics.destroy();
          },
        });

        resolve();
      }
    };

    scene.events.on("update", updateHandler);
  });
}

/**
 * Запускает полёт нескольких фишек к цели одновременно.
 */
export function flyTilesToTarget(
  scene: Phaser.Scene,
  tiles: Array<{ x: number; y: number; kind: TileKind }>,
  target: FlyTarget,
  baseDuration = 400
): Promise<void> {
  if (tiles.length === 0) {
    return Promise.resolve();
  }

  // Небольшая задержка между фишками для каскадного эффекта
  const promises = tiles.map((tile, index) => {
    const delay = index * 30;
    return flyTileToTarget(
      scene,
      tile.x,
      tile.y,
      target,
      tile.kind,
      baseDuration,
      delay
    );
  });

  return Promise.all(promises).then(() => {});
}
