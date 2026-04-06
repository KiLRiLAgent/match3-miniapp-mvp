import Phaser from "phaser";

const FLASH_DURATION = 200;
const DELTA_DRAIN_DURATION = 500;

export interface MeterOptions {
  /** Enable trailing delta rectangle showing lost HP */
  trailingDelta?: boolean;
  /** Keep bar always green regardless of ratio */
  alwaysGreen?: boolean;
  /** Texture key for icon displayed to the left of the bar */
  iconKey?: string;
  /** Icon size in pixels (default: bar height) */
  iconSize?: number;
}

export class Meter extends Phaser.GameObjects.Container {
  private fillGfx: Phaser.GameObjects.Graphics;
  private highlightGfx: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private widthPx: number;
  private heightPx: number;
  private radius: number;
  private baseColor: number;
  private isHp: boolean;
  private currentColor: number;

  // Flash support
  private flashGfx: Phaser.GameObjects.Graphics;
  private flashing = false;

  // Trailing delta support
  private deltaEnabled: boolean;
  private deltaGfx: Phaser.GameObjects.Graphics;
  private currentFillWidth = 0;
  private deltaWidth = 0;
  private deltaDraining = false;
  private deltaDrainTween?: Phaser.Tweens.Tween;

  // Always-green option
  private alwaysGreen: boolean;

  // Danger pulse
  private dangerPulsing = false;
  private dangerPulseTween?: Phaser.Tweens.Tween;
  private savedColor?: number;

  // Bar offset (for icon)
  private barOffsetX = 0;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    color: number,
    isHp = false,
    options?: MeterOptions
  ) {
    super(scene, x, y);
    this.heightPx = height;
    this.baseColor = color;
    this.currentColor = color;
    this.isHp = isHp;
    this.radius = Math.round(height / 2);
    this.deltaEnabled = options?.trailingDelta ?? false;
    this.alwaysGreen = options?.alwaysGreen ?? false;

    // Icon support
    const children: Phaser.GameObjects.GameObject[] = [];
    if (options?.iconKey) {
      const iconSize = options.iconSize ?? height;
      const icon = scene.add.image(iconSize / 2, height / 2, options.iconKey)
        .setDisplaySize(iconSize, iconSize);
      children.push(icon);
      this.barOffsetX = iconSize + 4;
    }

    this.widthPx = width - this.barOffsetX;

    // Rounded background
    const bgColor = this.deltaEnabled ? 0x555555 : 0x0a0c16;
    const bgAlpha = this.deltaEnabled ? 0.9 : 0.65;
    const borderGfx = scene.add.graphics();
    borderGfx.fillStyle(bgColor, bgAlpha);
    borderGfx.fillRoundedRect(this.barOffsetX, 0, this.widthPx, height, this.radius);
    borderGfx.lineStyle(2, 0x334466, 0.7);
    borderGfx.strokeRoundedRect(this.barOffsetX, 0, this.widthPx, height, this.radius);
    children.push(borderGfx);

    // Delta rectangle (behind fill)
    this.deltaGfx = scene.add.graphics();
    children.push(this.deltaGfx);

    // Fill drawn as rounded rect
    this.fillGfx = scene.add.graphics();
    this.drawFill(this.widthPx);
    this.currentFillWidth = this.widthPx;
    children.push(this.fillGfx);

    // Highlight strip for faux gradient
    this.highlightGfx = scene.add.graphics();
    this.drawHighlight(this.widthPx);
    children.push(this.highlightGfx);

    // Flash overlay (on top of fill and highlight)
    this.flashGfx = scene.add.graphics();
    this.flashGfx.setAlpha(0);
    children.push(this.flashGfx);

    if (label) {
      const title = scene.add
        .text(this.barOffsetX, -18, label, {
          fontSize: "14px",
          color: "#cfd8ff",
          fontFamily: "'Exo 2', Arial, sans-serif",
          resolution: 2,
        })
        .setOrigin(0, 0.5);
      children.push(title);
    }

    // Текст по центру полоски
    this.label = scene.add
      .text(this.barOffsetX + this.widthPx / 2, height / 2, "0/0", {
        fontSize: "13px",
        color: "#ffffff",
        fontFamily: "'Exo 2', Arial, sans-serif",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 2,
        resolution: 2,
      })
      .setOrigin(0.5, 0.5);
    children.push(this.label);

    this.add(children);
    scene.add.existing(this);
  }

  /**
   * Per-corner radius for partial fills.
   * - width in right curve zone (>= widthPx - radius): snap to full width + uniform radius,
   *   so the right edge does not poke past the rounded border curve.
   * - width < 2 * radius: clamp left-corner radius to width/2 to avoid degenerate shapes.
   * - otherwise: left corners rounded, right corners straight.
   */
  private fillRadius(width: number): number | Phaser.Types.GameObjects.Graphics.RoundedRectRadius {
    const r = this.radius;
    if (width >= this.widthPx - r) return r;
    const eff = Math.min(r, width / 2);
    return { tl: eff, tr: 0, bl: eff, br: 0 };
  }

  private drawFill(fillWidth: number) {
    this.fillGfx.clear();
    if (fillWidth <= 0) return;
    this.fillGfx.fillStyle(this.currentColor, 0.95);
    const fr = this.fillRadius(fillWidth);
    const drawW = typeof fr === "number" ? this.widthPx : fillWidth;
    this.fillGfx.fillRoundedRect(this.barOffsetX, 0, drawW, this.heightPx, fr);
  }

  private drawHighlight(fillWidth: number) {
    this.highlightGfx.clear();
    if (fillWidth <= 0 || this.deltaEnabled) return; // skip highlight on delta bars — looks like white strip
    this.highlightGfx.fillStyle(0xffffff, 0.15);
    const hr = this.fillRadius(fillWidth);
    const drawW = typeof hr === "number" ? this.widthPx : fillWidth;
    this.highlightGfx.fillRoundedRect(this.barOffsetX, 0, drawW, Math.round(this.heightPx * 0.3), hr);
  }

  private drawDelta() {
    this.deltaGfx.clear();
    if (this.deltaWidth <= 0) return;
    const totalWidth = Math.min(this.currentFillWidth + this.deltaWidth, this.widthPx);
    if (totalWidth <= 0) return;
    this.deltaGfx.fillStyle(0xffffff, 0.85);
    const dr = this.fillRadius(totalWidth);
    const drawW = typeof dr === "number" ? this.widthPx : totalWidth;
    this.deltaGfx.fillRoundedRect(this.barOffsetX, 0, drawW, this.heightPx, dr);
  }

  setValue(current: number, max: number) {
    const clamped = Phaser.Math.Clamp(current, 0, max);
    const ratio = max === 0 ? 0 : clamped / max;
    const newFillWidth = this.widthPx * ratio;

    if (this.isHp && !this.alwaysGreen) {
      this.currentColor = ratio > 0.5 ? this.baseColor : ratio > 0.25 ? 0xf5a623 : 0xde3e3e;
    }

    // Clear delta when value reaches 0
    if (this.deltaEnabled && clamped <= 0) {
      this.deltaWidth = 0;
      if (this.deltaDraining && this.deltaDrainTween) {
        this.deltaDrainTween.stop();
        this.deltaDraining = false;
      }
    }

    // Trailing delta: accumulate when value decreases, cancel active drain
    if (this.deltaEnabled && newFillWidth < this.currentFillWidth && clamped > 0) {
      if (this.deltaDraining && this.deltaDrainTween) {
        this.deltaDrainTween.stop();
        this.deltaDraining = false;
      }
      const lost = this.currentFillWidth - newFillWidth;
      this.deltaWidth += lost;
    } else if (this.deltaEnabled && newFillWidth > this.currentFillWidth) {
      // Value increased — shrink delta proportionally
      this.deltaWidth = Math.max(0, this.deltaWidth - (newFillWidth - this.currentFillWidth));
    }

    this.currentFillWidth = newFillWidth;
    this.drawFill(newFillWidth);
    this.drawHighlight(newFillWidth);

    if (this.deltaEnabled) {
      this.drawDelta();
    }

    this.label.setText(`${Math.floor(clamped)}/${max}`);
  }

  /** Flash the bar fill white briefly */
  flash() {
    if (this.flashing || this.currentFillWidth <= 0) return;
    this.flashing = true;

    this.flashGfx.clear();
    this.flashGfx.fillStyle(0xffffff, 1);
    const fr = this.fillRadius(this.currentFillWidth);
    const fW = typeof fr === "number" ? this.widthPx : this.currentFillWidth;
    this.flashGfx.fillRoundedRect(this.barOffsetX, 0, fW, this.heightPx, fr);
    this.flashGfx.setAlpha(0);

    this.scene.tweens.add({
      targets: this.flashGfx,
      alpha: { from: 0, to: 0.6 },
      duration: FLASH_DURATION / 2,
      yoyo: true,
      onComplete: () => {
        this.flashGfx.setAlpha(0);
        this.flashing = false;
      },
    });
  }

  /** Smoothly drain the trailing delta rectangle */
  drainDelta() {
    if (!this.deltaEnabled || this.deltaWidth <= 0 || this.deltaDraining) return;
    this.deltaDraining = true;

    const startWidth = this.deltaWidth;
    let prevT = 1;
    this.deltaDrainTween = this.scene.tweens.addCounter({
      from: 1,
      to: 0,
      duration: DELTA_DRAIN_DURATION,
      ease: "Quad.easeOut",
      onUpdate: (tween) => {
        const t = tween.getValue() ?? 0;
        const step = (prevT - t) * startWidth;
        this.deltaWidth = Math.max(0, this.deltaWidth - step);
        prevT = t;
        this.drawDelta();
      },
      onComplete: () => {
        this.deltaDraining = false;
        this.deltaDrainTween = undefined;
      },
    });
  }

  /** Start danger pulse — fill turns red + brightness pulses on fillGfx only */
  startDangerPulse() {
    if (this.dangerPulsing) return;
    this.dangerPulsing = true;

    // Save original color and force red
    this.savedColor = this.currentColor;
    this.currentColor = 0xde3e3e;
    this.drawFill(this.currentFillWidth);

    // Pulse fillGfx alpha for brightness effect + tiny scale on fillGfx
    this.dangerPulseTween = this.scene.tweens.add({
      targets: this.fillGfx,
      alpha: { from: 0.7, to: 1.0 },
      scaleX: { from: 1.0, to: 1.03 },
      scaleY: { from: 1.0, to: 1.03 },
      duration: 500,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });
  }

  /** Stop danger pulse — restore original color */
  stopDangerPulse() {
    if (!this.dangerPulsing) return;
    this.dangerPulsing = false;

    if (this.dangerPulseTween) {
      this.dangerPulseTween.stop();
      this.dangerPulseTween = undefined;
    }

    // Restore color and alpha
    if (this.savedColor !== undefined) {
      this.currentColor = this.savedColor;
      this.savedColor = undefined;
    }
    this.fillGfx.setAlpha(0.95);
    this.fillGfx.setScale(1);
    this.drawFill(this.currentFillWidth);
  }
}
