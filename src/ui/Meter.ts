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

    // Rounded background (matches bar shape)
    const bgColor = this.deltaEnabled ? 0x555555 : 0x333333;
    const bgAlpha = this.deltaEnabled ? 0.9 : 0.8;
    const borderGfx = scene.add.graphics();
    borderGfx.fillStyle(bgColor, bgAlpha);
    borderGfx.fillRoundedRect(this.barOffsetX, 0, this.widthPx, height, this.radius);
    borderGfx.lineStyle(2, 0x334466, 0.7);
    borderGfx.strokeRoundedRect(this.barOffsetX, 0, this.widthPx, height, this.radius);
    children.push(borderGfx);

    // Geometry mask: clip fill/delta/highlight/flash to the rounded bar shape
    const maskGfx = scene.add.graphics();
    maskGfx.fillStyle(0xffffff);
    maskGfx.fillRoundedRect(this.barOffsetX, 0, this.widthPx, height, this.radius);
    maskGfx.setVisible(false);
    children.push(maskGfx);
    const barMask = maskGfx.createGeometryMask();

    // Delta rectangle (behind fill)
    this.deltaGfx = scene.add.graphics();
    this.deltaGfx.setMask(barMask);
    children.push(this.deltaGfx);

    // Fill drawn as straight rect, clipped by geometry mask
    this.fillGfx = scene.add.graphics();
    this.fillGfx.setMask(barMask);
    this.drawFill(this.widthPx);
    this.currentFillWidth = this.widthPx;
    children.push(this.fillGfx);

    // Highlight strip for faux gradient
    this.highlightGfx = scene.add.graphics();
    this.highlightGfx.setMask(barMask);
    this.drawHighlight(this.widthPx);
    children.push(this.highlightGfx);

    // Flash overlay (on top of fill and highlight)
    this.flashGfx = scene.add.graphics();
    this.flashGfx.setMask(barMask);
    this.flashGfx.setAlpha(0);
    children.push(this.flashGfx);

    if (label) {
      const title = scene.add
        .text(this.barOffsetX, -18, label, {
          fontSize: "14px",
          color: "#cfd8ff",
          fontFamily: "'Exo 2', Arial, sans-serif",
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
      })
      .setOrigin(0.5, 0.5);
    children.push(this.label);

    this.add(children);
    scene.add.existing(this);
  }

  private drawFill(fillWidth: number) {
    this.fillGfx.clear();
    if (fillWidth <= 0) return;
    this.fillGfx.fillStyle(this.currentColor, 0.95);
    this.fillGfx.fillRect(this.barOffsetX, 0, fillWidth, this.heightPx);
  }

  private drawHighlight(fillWidth: number) {
    this.highlightGfx.clear();
    if (fillWidth <= 0) return;
    this.highlightGfx.fillStyle(0xffffff, 0.15);
    this.highlightGfx.fillRect(this.barOffsetX, 0, fillWidth, Math.round(this.heightPx * 0.3));
  }

  private drawDelta() {
    this.deltaGfx.clear();
    if (this.deltaWidth <= 0) return;
    const totalWidth = Math.min(this.currentFillWidth + this.deltaWidth, this.widthPx);
    if (totalWidth <= 0) return;
    this.deltaGfx.fillStyle(0xffffff, 0.85);
    this.deltaGfx.fillRect(this.barOffsetX, 0, totalWidth, this.heightPx);
  }

  setValue(current: number, max: number) {
    const clamped = Phaser.Math.Clamp(current, 0, max);
    const ratio = max === 0 ? 0 : clamped / max;
    const newFillWidth = this.widthPx * ratio;

    if (this.isHp && !this.alwaysGreen) {
      this.currentColor = ratio > 0.5 ? this.baseColor : ratio > 0.25 ? 0xf5a623 : 0xde3e3e;
    }

    // Trailing delta: accumulate when value decreases, cancel active drain
    if (this.deltaEnabled && newFillWidth < this.currentFillWidth) {
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
    this.flashGfx.fillRect(this.barOffsetX, 0, this.currentFillWidth, this.heightPx);
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
}
