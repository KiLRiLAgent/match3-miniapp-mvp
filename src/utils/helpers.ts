import Phaser from "phaser";

export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const wait = (scene: Phaser.Scene, ms: number): Promise<void> =>
  new Promise<void>((resolve) => {
    scene.time.delayedCall(ms, () => resolve());
  });
