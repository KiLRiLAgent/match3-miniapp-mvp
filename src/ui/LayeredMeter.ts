import Phaser from "phaser";

const FLASH_DURATION = 200;
const DELTA_DRAIN_DURATION = 500;
const PREVIEW_PULSE_DURATION = 600;

export class LayeredMeter extends Phaser.GameObjects.Container {
  private widthPx: number;
  private heightPx: number;
  private radius: number;

  private layerCount: number;
  /** HP for each layer: index 0 = layer 1 (bottom/last), index N-1 = layer N (top/first to deplete) */
  private layerHpArray: number[];
  /** Cumulative HP thresholds: cumulativeHp[i] = sum of layerHpArray[0..i] */
  private cumulativeHp: number[];
  private totalHp: number;
  private colors: number[];

  // Graphics layers (back to front): nextFill, delta, currentFill, preview, highlight, flash
  private nextFillGfx: Phaser.GameObjects.Graphics;
  private deltaGfx: Phaser.GameObjects.Graphics;
  private fillGfx: Phaser.GameObjects.Graphics;
  private previewGfx: Phaser.GameObjects.Graphics;
  private highlightGfx: Phaser.GameObjects.Graphics;
  private flashGfx: Phaser.GameObjects.Graphics;

  // State
  private currentHp: number;
  private currentFillWidth = 0;
  private flashing = false;

  // Trailing delta
  private deltaWidth = 0;
  private deltaDraining = false;
  private deltaDrainTween?: Phaser.Tweens.Tween;
  private prevLayerIdx: number;

  // Preview support
  private previewPulseTween?: Phaser.Tweens.Tween;

  // Layer counter text
  private counterText: Phaser.GameObjects.Text;
  // HP label inside bar
  private label: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    height: number,
    layerHpArray: number[],
    colors: number[]
  ) {
    super(scene, x, y);
    this.heightPx = height;
    this.radius = Math.round(height / 2);
    this.layerHpArray = layerHpArray;
    this.layerCount = layerHpArray.length;
    this.colors = colors;

    // Build cumulative HP thresholds
    this.cumulativeHp = [];
    let sum = 0;
    for (const hp of layerHpArray) {
      sum += hp;
      this.cumulativeHp.push(sum);
    }
    this.totalHp = sum;
    this.currentHp = this.totalHp;

    const children: Phaser.GameObjects.GameObject[] = [];

    this.widthPx = width;

    // Rounded background
    const borderGfx = scene.add.graphics();
    borderGfx.fillStyle(0x555555, 0.9);
    borderGfx.fillRoundedRect(0, 0, this.widthPx, height, this.radius);
    borderGfx.lineStyle(2, 0x334466, 0.7);
    borderGfx.strokeRoundedRect(0, 0, this.widthPx, height, this.radius);
    children.push(borderGfx);

    // Next layer fill (behind current)
    this.nextFillGfx = scene.add.graphics();
    children.push(this.nextFillGfx);

    // Delta rectangle (behind current fill)
    this.deltaGfx = scene.add.graphics();
    children.push(this.deltaGfx);

    // Current layer fill
    this.fillGfx = scene.add.graphics();
    children.push(this.fillGfx);

    // Preview overlay (between fill and highlight)
    this.previewGfx = scene.add.graphics();
    children.push(this.previewGfx);

    // Highlight strip
    this.highlightGfx = scene.add.graphics();
    children.push(this.highlightGfx);

    // Flash overlay
    this.flashGfx = scene.add.graphics();
    this.flashGfx.setAlpha(0);
    children.push(this.flashGfx);

    // HP text centered in bar
    this.label = scene.add
      .text(this.widthPx / 2, height / 2, "", {
        fontSize: "15px",
        color: "#ffffff",
        fontFamily: "'Exo 2', Arial, sans-serif",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 3,
        resolution: 2,
      })
      .setOrigin(0.5, 0.5);
    children.push(this.label);

    // Layer counter inside bar (right-aligned)
    this.counterText = scene.add
      .text(this.widthPx - 8, height / 2, "", {
        fontSize: "18px",
        color: "#ffffff",
        fontFamily: "'Exo 2', Arial, sans-serif",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 3,
        resolution: 2,
      })
      .setOrigin(1, 0.5);
    children.push(this.counterText);

    this.add(children);
    scene.add.existing(this);

    // Initial state
    this.prevLayerIdx = this.getLayerIndex();
    this.currentFillWidth = this.widthPx;
    this.drawAll();
  }

  /** 1-based layer index (N = full/top, 1 = last/bottom layer, 0 = dead) */
  private getLayerIndex(): number {
    if (this.currentHp <= 0) return 0;
    for (let i = 0; i < this.layerCount; i++) {
      if (this.currentHp <= this.cumulativeHp[i]) return i + 1;
    }
    return this.layerCount;
  }

  /** Color for a given 1-based layer index */
  private getLayerColor(layerIdx: number): number {
    // Layer N (top) = colors[0], layer N-1 = colors[1], alternating
    const fromTop = this.layerCount - layerIdx;
    return this.colors[fromTop % this.colors.length];
  }

  /** Fill ratio within current layer (0..1) */
  private getLayerFillRatio(): number {
    if (this.currentHp <= 0) return 0;
    const layerIdx = this.getLayerIndex();
    const layerHp = this.layerHpArray[layerIdx - 1];
    const prevCumulative = layerIdx >= 2 ? this.cumulativeHp[layerIdx - 2] : 0;
    const hpInLayer = this.currentHp - prevCumulative;
    return hpInLayer / layerHp;
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

  private drawAll() {
    const layerIdx = this.getLayerIndex();
    const ratio = this.getLayerFillRatio();
    const fillWidth = this.widthPx * ratio;

    // Next layer fill (full width, visible behind current as it depletes)
    this.nextFillGfx.clear();
    if (layerIdx > 1) {
      const nextColor = this.getLayerColor(layerIdx - 1);
      this.nextFillGfx.fillStyle(nextColor, 0.95);
      this.nextFillGfx.fillRoundedRect(0, 0, this.widthPx, this.heightPx, this.radius);
    }

    // Current layer fill: left corners rounded, right corners straight when partial
    this.fillGfx.clear();
    if (fillWidth > 0) {
      const color = this.getLayerColor(layerIdx);
      this.fillGfx.fillStyle(color, 0.95);
      const fr = this.fillRadius(fillWidth);
      const drawW = typeof fr === "number" ? this.widthPx : fillWidth;
      this.fillGfx.fillRoundedRect(0, 0, drawW, this.heightPx, fr);
    }

    this.currentFillWidth = fillWidth;

    // Highlight disabled — looks like white strip on delta/layered bars
    this.highlightGfx.clear();

    // Delta
    this.drawDelta();

    // Counter text
    this.counterText.setText(layerIdx > 1 ? `x${layerIdx}` : "");

    // HP label
    this.label.setText(`${Math.floor(this.currentHp)}/${this.totalHp}`);
  }

  private drawDelta() {
    this.deltaGfx.clear();
    if (this.deltaWidth <= 0) return;
    const totalWidth = Math.min(this.currentFillWidth + this.deltaWidth, this.widthPx);
    if (totalWidth <= 0) return;
    this.deltaGfx.fillStyle(0xffffff, 0.85);
    const dr = this.fillRadius(totalWidth);
    const dW = typeof dr === "number" ? this.widthPx : totalWidth;
    this.deltaGfx.fillRoundedRect(0, 0, dW, this.heightPx, dr);
  }

  /** Update displayed HP. Accepts (current) or (current, max) for Meter API compat. */
  setValue(current: number, _max?: number) {
    const clamped = Phaser.Math.Clamp(current, 0, this.totalHp);
    const oldHp = this.currentHp;
    const oldFillWidth = this.currentFillWidth;
    const oldLayerIdx = this.prevLayerIdx;

    this.currentHp = clamped;
    const newLayerIdx = this.getLayerIndex();
    const newFillWidth = this.widthPx * this.getLayerFillRatio();

    // Clear delta when dead
    if (clamped <= 0) {
      this.deltaWidth = 0;
      if (this.deltaDraining && this.deltaDrainTween) {
        this.deltaDrainTween.stop();
        this.deltaDraining = false;
      }
      this.prevLayerIdx = 0;
      this.drawAll();
      return;
    }

    // Trailing delta
    if (clamped < oldHp) {
      // HP decreased — cancel active drain and accumulate delta
      if (this.deltaDraining && this.deltaDrainTween) {
        this.deltaDrainTween.stop();
        this.deltaDraining = false;
      }

      if (newLayerIdx === oldLayerIdx) {
        // Same layer — delta is the fill shrinkage
        this.deltaWidth += oldFillWidth - newFillWidth;
      } else {
        // Layer boundary crossed — reset delta to gap in new layer
        this.deltaWidth = this.widthPx - newFillWidth;
      }
    } else if (clamped > oldHp && newLayerIdx === oldLayerIdx) {
      // HP increased within same layer — shrink delta
      this.deltaWidth = Math.max(0, this.deltaWidth - (newFillWidth - oldFillWidth));
    }

    this.prevLayerIdx = newLayerIdx;
    this.drawAll();
  }

  flash() {
    if (this.flashing || this.currentFillWidth <= 0) return;
    this.flashing = true;

    this.flashGfx.clear();
    this.flashGfx.fillStyle(0xffffff, 1);
    const fr = this.fillRadius(this.currentFillWidth);
    const fW = typeof fr === "number" ? this.widthPx : this.currentFillWidth;
    this.flashGfx.fillRoundedRect(0, 0, fW, this.heightPx, fr);
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

  drainDelta() {
    if (this.deltaWidth <= 0 || this.deltaDraining) return;
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
   * Show a delta preview on the bar.
   *
   * For LayeredMeter, the preview is rendered relative to the current layer's
   * fill ratio. Negative delta (damage) shows a white section, positive delta
   * (heal) shows a green section.
   */
  showPreview(current: number, max: number, delta: number) {
    this.clearPreview();
    if (delta === 0 || max === 0) return;

    const clamped = Phaser.Math.Clamp(current, 0, this.totalHp);
    const after = Phaser.Math.Clamp(clamped + delta, 0, this.totalHp);

    // Convert to fill ratios within the current layer
    const layerIdx = this.getLayerIndex();
    if (layerIdx <= 0) return;
    const layerHp = this.layerHpArray[layerIdx - 1];
    const prevCumulative = layerIdx >= 2 ? this.cumulativeHp[layerIdx - 2] : 0;

    const currentInLayer = Phaser.Math.Clamp(clamped - prevCumulative, 0, layerHp);
    const afterInLayer = Phaser.Math.Clamp(after - prevCumulative, 0, layerHp);

    const fromRatio = Math.min(currentInLayer, afterInLayer) / layerHp;
    const toRatio = Math.max(currentInLayer, afterInLayer) / layerHp;

    const startPx = this.widthPx * fromRatio;
    const endPx = this.widthPx * toRatio;
    const segmentWidth = endPx - startPx;
    if (segmentWidth <= 0) return;

    const isDamage = delta < 0;
    const color = isDamage ? 0xffffff : 0x4caf50;
    const alpha = isDamage ? 0.8 : 0.7;

    this.previewGfx.clear();
    this.previewGfx.fillStyle(color, alpha);

    const totalEnd = startPx + segmentWidth;
    const fr = this.fillRadius(totalEnd);

    if (typeof fr === "number") {
      // In right curve zone — snap to full remaining width (same tradeoff as
      // drawAll: values near max visually show as full, exact value in label)
      this.previewGfx.fillRoundedRect(
        startPx, 0,
        this.widthPx - startPx, this.heightPx, {
          tl: startPx === 0 ? this.radius : 0,
          tr: this.radius,
          bl: startPx === 0 ? this.radius : 0,
          br: this.radius,
        },
      );
    } else {
      const leftR = startPx === 0 ? this.radius : 0;
      const rightR = totalEnd >= this.widthPx - this.radius ? this.radius : 0;
      this.previewGfx.fillRoundedRect(
        startPx, 0,
        segmentWidth, this.heightPx, {
          tl: leftR, tr: rightR,
          bl: leftR, br: rightR,
        },
      );
    }

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

  /** Phaser lifecycle — stop tweens before children are destroyed */
  preDestroy() {
    if (this.previewPulseTween) {
      this.previewPulseTween.stop();
      this.previewPulseTween = undefined;
    }
    if (this.deltaDrainTween) {
      this.deltaDrainTween.stop();
      this.deltaDrainTween = undefined;
    }
  }
}
