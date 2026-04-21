import Phaser from "phaser";

const FLASH_DURATION = 200;
const DELTA_DRAIN_DURATION = 500;
const PREVIEW_PULSE_DURATION = 600;
// Danger pulse duration — MUST match GameScene.showVignette tween duration
// so the bar flash and the vignette breathe at the same cadence.
const DANGER_PULSE_DURATION = 1200;
const DANGER_FLASH_PEAK_ALPHA = 0.55;
const DANGER_FLASH_COLOR = 0xde3e3e;
const DANGER_LABEL_COLOR = 0xde3e3e;
const DANGER_LABEL_BASE_COLOR = 0xffffff;

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

  // Preview support
  private previewGfx: Phaser.GameObjects.Graphics;
  private previewPulseTween?: Phaser.Tweens.Tween;

  // Danger pulse — red flash overlay + label colour interpolation.
  // Keeps the bar's base colour (green/orange per ratio) — only overlays a
  // pulsating red wash. Drawn on its own Graphics so the white `flash()`
  // layer can run on top without conflict.
  private dangerFlashGfx!: Phaser.GameObjects.Graphics;
  private dangerPulsing = false;
  private dangerPulseTween?: Phaser.Tweens.Tween;

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

    // Preview overlay (between fill and highlight)
    this.previewGfx = scene.add.graphics();
    children.push(this.previewGfx);

    // Highlight strip for faux gradient
    this.highlightGfx = scene.add.graphics();
    this.drawHighlight(this.widthPx);
    children.push(this.highlightGfx);

    // Danger flash overlay (red low-HP pulse — sits above highlight, below white flash)
    this.dangerFlashGfx = scene.add.graphics();
    children.push(this.dangerFlashGfx);

    // Flash overlay (white damage/heal flash — topmost)
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
   * - width < 2 * radius: pill shape (all four corners rounded to width/2),
   *   so the narrow remainder doesn't show a vertical sharp edge on the right.
   * - otherwise: left corners rounded, right corners straight.
   */
  private fillRadius(width: number): number | Phaser.Types.GameObjects.Graphics.RoundedRectRadius {
    const r = this.radius;
    if (width >= this.widthPx - r) return r;
    if (width < 2 * r) {
      const eff = width / 2;
      return { tl: eff, tr: eff, bl: eff, br: eff };
    }
    return { tl: r, tr: 0, bl: r, br: 0 };
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

  /**
   * Start a red-wash pulse over the fill + label colour interpolation.
   * Bar keeps its base colour (green / orange per ratio). Pulse cadence
   * matches GameScene's vignette tween so they breathe together.
   */
  startDangerPulse() {
    if (this.dangerPulsing) return;
    this.dangerPulsing = true;
    const whiteCol = Phaser.Display.Color.ValueToColor(DANGER_LABEL_BASE_COLOR);
    const redCol = Phaser.Display.Color.ValueToColor(DANGER_LABEL_COLOR);
    this.dangerPulseTween = this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: DANGER_PULSE_DURATION,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
      onUpdate: (tween) => {
        const t = tween.getValue() ?? 0;
        this.drawDangerFlash(t);
        const mixed = Phaser.Display.Color.Interpolate.ColorWithColor(
          whiteCol, redCol, 100, Math.round(t * 100),
        );
        this.label.setColor(
          Phaser.Display.Color.RGBToString(mixed.r, mixed.g, mixed.b, 0, "#"),
        );
      },
    });
  }

  /** Paint the red pulse overlay at the given 0..1 intensity. */
  private drawDangerFlash(t: number) {
    this.dangerFlashGfx.clear();
    if (this.currentFillWidth <= 0) return;
    this.dangerFlashGfx.fillStyle(DANGER_FLASH_COLOR, t * DANGER_FLASH_PEAK_ALPHA);
    const fr = this.fillRadius(this.currentFillWidth);
    const drawW = typeof fr === "number" ? this.widthPx : this.currentFillWidth;
    this.dangerFlashGfx.fillRoundedRect(this.barOffsetX, 0, drawW, this.heightPx, fr);
  }

  /** Stop danger pulse — clear overlay + restore label colour to white. */
  stopDangerPulse() {
    if (!this.dangerPulsing) return;
    this.dangerPulsing = false;

    if (this.dangerPulseTween) {
      this.dangerPulseTween.stop();
      this.dangerPulseTween = undefined;
    }

    this.dangerFlashGfx.clear();
    this.label.setColor("#ffffff");
  }

  /**
   * Show a delta preview on the bar.
   *
   * - Negative delta (damage): draws a white semi-transparent section over the
   *   fill from `(current + delta)` to `current`, indicating HP that will be lost.
   * - Positive delta (heal): draws a green semi-transparent section from
   *   `current` to `(current + delta)`, indicating HP that will be gained.
   *
   * Starts a subtle pulse tween on the preview layer.
   */
  showPreview(current: number, max: number, delta: number) {
    this.clearPreview();
    if (delta === 0 || max === 0) return;

    const clamped = Phaser.Math.Clamp(current, 0, max);
    const after = Phaser.Math.Clamp(clamped + delta, 0, max);

    const fromRatio = Math.min(clamped, after) / max;
    const toRatio = Math.max(clamped, after) / max;

    const startPx = this.widthPx * fromRatio;
    const endPx = this.widthPx * toRatio;
    const segmentWidth = endPx - startPx;
    if (segmentWidth <= 0) return;

    const isDamage = delta < 0;
    this.drawPreview(startPx, segmentWidth, isDamage);

    // Pulse the preview layer
    this.previewPulseTween = this.scene.tweens.add({
      targets: this.previewGfx,
      alpha: { from: 0.5, to: 0.9 },
      duration: PREVIEW_PULSE_DURATION,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });
  }

  /** Remove the preview overlay and stop its pulse tween */
  clearPreview() {
    if (this.previewPulseTween) {
      this.previewPulseTween.stop();
      this.previewPulseTween = undefined;
    }
    this.previewGfx.clear();
    this.previewGfx.setAlpha(1);
  }

  private drawPreview(startPx: number, segmentWidth: number, isDamage: boolean) {
    this.previewGfx.clear();

    // Damage: white overlay on the fill area that will be lost
    // Heal: green overlay extending beyond the current fill
    const color = isDamage ? 0xffffff : 0x4caf50;
    const alpha = isDamage ? 0.8 : 0.7;

    this.previewGfx.fillStyle(color, alpha);

    // Calculate the total width from bar start to end of preview segment
    const totalEnd = startPx + segmentWidth;
    const fr = this.fillRadius(totalEnd);

    if (typeof fr === "number") {
      // In right curve zone — snap to full remaining width (same tradeoff as
      // drawFill: values near max visually show as full, exact value in label)
      this.previewGfx.fillRoundedRect(
        this.barOffsetX + startPx, 0,
        this.widthPx - startPx, this.heightPx, {
          tl: startPx === 0 ? this.radius : 0,
          tr: this.radius,
          bl: startPx === 0 ? this.radius : 0,
          br: this.radius,
        },
      );
    } else {
      // Normal zone — simple rect with appropriate corners
      const leftR = startPx === 0 ? this.radius : 0;
      const rightR = totalEnd >= this.widthPx - this.radius ? this.radius : 0;
      this.previewGfx.fillRoundedRect(
        this.barOffsetX + startPx, 0,
        segmentWidth, this.heightPx, {
          tl: leftR, tr: rightR,
          bl: leftR, br: rightR,
        },
      );
    }
  }

  /** Phaser lifecycle — stop tweens before children are destroyed */
  preDestroy() {
    if (this.previewPulseTween) {
      this.previewPulseTween.stop();
      this.previewPulseTween = undefined;
    }
    if (this.dangerPulseTween) {
      this.dangerPulseTween.stop();
      this.dangerPulseTween = undefined;
    }
    if (this.deltaDrainTween) {
      this.deltaDrainTween.stop();
      this.deltaDrainTween = undefined;
    }
  }
}
