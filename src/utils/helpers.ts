import Phaser from "phaser";

export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const wait = (scene: Phaser.Scene, ms: number): Promise<void> =>
  new Promise<void>((resolve) => {
    scene.time.delayedCall(ms, () => resolve());
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
