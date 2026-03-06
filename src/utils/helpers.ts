import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT } from "../game/config";

export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const wait = (scene: Phaser.Scene, ms: number): Promise<void> =>
  new Promise<void>((resolve) => {
    scene.time.delayedCall(ms, () => resolve());
  });

export const waitOrTap = (scene: Phaser.Scene, ms: number, depth = 100): Promise<void> =>
  new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      blocker.destroy();
      timer.destroy();
      resolve();
    };
    const blocker = scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0);
    blocker.setDepth(depth).setInteractive();
    blocker.once("pointerdown", finish);
    const timer = scene.time.delayedCall(ms, finish);
  });

/**
 * Creates a pulse animation on a game object.
 */
export function createPulseAnimation(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.GameObject,
  scale = 1.15,
  duration = 200
): Promise<void> {
  return new Promise<void>((resolve) => {
    scene.tweens.add({
      targets: target,
      scale,
      duration,
      yoyo: true,
      ease: "Sine.easeInOut",
      onComplete: () => resolve(),
    });
  });
}

/**
 * Creates a guarded pulse controller that prevents overlapping pulses.
 * Returns a function that triggers the pulse animation only if not already pulsing.
 */
export function createPulseController(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.GameObject,
  scale = 1.15,
  duration = 200
): () => void {
  let isPulsing = false;
  return () => {
    if (isPulsing) return;
    isPulsing = true;
    createPulseAnimation(scene, target, scale, duration).then(() => {
      isPulsing = false;
    });
  };
}

/**
 * Wraps a Phaser tween in a Promise for async/await usage.
 * Simplifies animation sequencing in scene code.
 */
export function tweenPromise(
  scene: Phaser.Scene,
  config: Phaser.Types.Tweens.TweenBuilderConfig
): Promise<void> {
  const originalOnComplete = config.onComplete;
  return new Promise<void>((resolve) => {
    scene.tweens.add({
      ...config,
      onComplete: (tween, targets, ...args) => {
        if (originalOnComplete) {
          (originalOnComplete as Function)(tween, targets, ...args);
        }
        resolve();
      },
    });
  });
}
