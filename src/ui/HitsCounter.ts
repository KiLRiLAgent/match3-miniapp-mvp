import Phaser from "phaser";

const HITS_FONT_SIZE = 38;
const HITS_COLOR = "#ffd700";
const HITS_STROKE_COLOR = "#000000";
const HITS_STROKE_THICKNESS = 4;
const HITS_FADE_IN_DURATION = 150;
const HITS_FADE_OUT_DURATION = 250;
const HITS_POP_SCALE = 1.2;
const HITS_POP_DURATION = 180;
const HITS_FADE_OUT_RISE = 20;

export class HitsCounter extends Phaser.GameObjects.Container {
  private label: Phaser.GameObjects.Text;
  private baseY: number;
  private fadeTween?: Phaser.Tweens.Tween;
  private popTween?: Phaser.Tweens.Tween;
  private shutdownHandler: () => void;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    this.baseY = y;
    this.label = scene.add
      .text(0, 0, "", {
        fontSize: `${HITS_FONT_SIZE}px`,
        color: HITS_COLOR,
        fontFamily: "'Exo 2', Arial, sans-serif",
        fontStyle: "bold",
        stroke: HITS_STROKE_COLOR,
        strokeThickness: HITS_STROKE_THICKNESS,
        resolution: 2,
      })
      .setOrigin(0.5);
    this.add([this.label]);
    scene.add.existing(this);
    this.setAlpha(0);
    this.setScale(1);

    this.shutdownHandler = () => {
      if (this.scene && this.active) this.destroy();
    };
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdownHandler);
  }

  /**
   * Show or update the «N Hits!» label with a pop animation.
   * If a fade-out is in progress (back-to-back cascade race), the fade is
   * cancelled and the existing instance is reused with the new count.
   */
  showHits(count: number): void {
    if (!this.scene || !this.active) return;
    this.label.setText(`${count} Hits!`);

    if (this.fadeTween && this.fadeTween.isPlaying()) {
      this.fadeTween.stop();
      this.fadeTween = undefined;
      this.y = this.baseY;
    }

    if (this.alpha < 1) {
      this.fadeTween = this.scene.tweens.add({
        targets: this,
        alpha: 1,
        duration: HITS_FADE_IN_DURATION,
        ease: "Quad.easeOut",
      });
    }

    this.popTween?.stop();
    this.label.setScale(1);
    this.popTween = this.scene.tweens.add({
      targets: this.label,
      scale: { from: 1, to: HITS_POP_SCALE },
      duration: HITS_POP_DURATION,
      ease: "Quad.easeOut",
      yoyo: true,
      onComplete: () => {
        if (this.scene && this.label.active) this.label.setScale(1);
      },
    });
  }

  /**
   * Fade out and destroy. Resolves once the tween completes (or immediately
   * if already destroyed). Safe if called multiple times — outstanding
   * fade-out is reused; if a new showHits arrives mid-fade, the fade is
   * cancelled (see showHits).
   */
  hide(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.scene || !this.active) {
        resolve();
        return;
      }
      if (this.fadeTween && this.fadeTween.isPlaying()) {
        // Already fading; piggyback on either COMPLETE (normal finish) or
        // STOP (re-show interrupts). `settled` flag guarantees resolve fires
        // exactly once even if both events arrive on the same tween.
        let settled = false;
        const settle = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        this.fadeTween.once(Phaser.Tweens.Events.TWEEN_COMPLETE, settle);
        this.fadeTween.once(Phaser.Tweens.Events.TWEEN_STOP, settle);
        return;
      }
      this.fadeTween = this.scene.tweens.add({
        targets: this,
        alpha: 0,
        y: this.baseY - HITS_FADE_OUT_RISE,
        duration: HITS_FADE_OUT_DURATION,
        ease: "Quad.easeOut",
        onComplete: () => {
          if (this.scene && this.active) this.destroy();
          resolve();
        },
        onStop: () => {
          // Stopped by a re-show — caller's promise still resolves so the
          // GameScene doesn't await forever.
          resolve();
        },
      });
    });
  }

  override destroy(fromScene?: boolean): void {
    this.fadeTween?.stop();
    this.popTween?.stop();
    if (this.scene) {
      this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.shutdownHandler);
    }
    super.destroy(fromScene);
  }
}
