import Phaser from "phaser";

const FLASH_DURATION = 200;
const DELTA_DRAIN_DURATION = 500;

export class LayeredMeter extends Phaser.GameObjects.Container {
  private widthPx: number;
  private heightPx: number;
  private radius: number;

  private layerCount: number;
  private hpPerLayer: number;
  private totalHp: number;
  private colors: number[];

  // Graphics layers (back to front): nextFill, delta, currentFill, highlight, flash
  private nextFillGfx: Phaser.GameObjects.Graphics;
  private deltaGfx: Phaser.GameObjects.Graphics;
  private fillGfx: Phaser.GameObjects.Graphics;
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
    layerCount: number,
    hpPerLayer: number,
    colors: number[]
  ) {
    super(scene, x, y);
    this.heightPx = height;
    this.radius = Math.round(height / 2);
    this.layerCount = layerCount;
    this.hpPerLayer = hpPerLayer;
    this.totalHp = layerCount * hpPerLayer;
    this.colors = colors;
    this.currentHp = this.totalHp;

    const children: Phaser.GameObjects.GameObject[] = [];

    // Counter text width reservation
    const counterWidth = 36;
    this.widthPx = width - counterWidth;

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
        fontSize: "13px",
        color: "#ffffff",
        fontFamily: "'Exo 2', Arial, sans-serif",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 2,
      })
      .setOrigin(0.5, 0.5);
    children.push(this.label);

    // Layer counter on the right
    this.counterText = scene.add
      .text(this.widthPx + 4, height / 2, "", {
        fontSize: "16px",
        color: "#ffffff",
        fontFamily: "'Exo 2', Arial, sans-serif",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setOrigin(0, 0.5);
    children.push(this.counterText);

    this.add(children);
    scene.add.existing(this);

    // Initial state
    this.prevLayerIdx = this.getLayerIndex();
    this.currentFillWidth = this.widthPx;
    this.drawAll();
  }

  /** 1-based layer index (10 = full, 1 = last layer, 0 = dead) */
  private getLayerIndex(): number {
    if (this.currentHp <= 0) return 0;
    return Math.ceil(this.currentHp / this.hpPerLayer);
  }

  /** Color for a given 1-based layer index */
  private getLayerColor(layerIdx: number): number {
    // Layer 10 (top) = colors[0], layer 9 = colors[1], alternating
    const fromTop = this.layerCount - layerIdx;
    return this.colors[fromTop % this.colors.length];
  }

  /** Fill ratio within current layer (0..1) */
  private getLayerFillRatio(): number {
    if (this.currentHp <= 0) return 0;
    const remainder = this.currentHp % this.hpPerLayer;
    return remainder === 0 ? 1 : remainder / this.hpPerLayer;
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

    // Current layer fill: rounded when full width, straight right edge when partial
    this.fillGfx.clear();
    if (fillWidth > 0) {
      const color = this.getLayerColor(layerIdx);
      this.fillGfx.fillStyle(color, 0.95);
      if (fillWidth >= this.widthPx) {
        this.fillGfx.fillRoundedRect(0, 0, this.widthPx, this.heightPx, this.radius);
      } else {
        this.fillGfx.fillRect(0, 0, fillWidth, this.heightPx);
      }
    }

    this.currentFillWidth = fillWidth;

    // Highlight: same logic
    this.highlightGfx.clear();
    if (fillWidth > 0) {
      this.highlightGfx.fillStyle(0xffffff, 0.15);
      const hlH = Math.round(this.heightPx * 0.3);
      if (fillWidth >= this.widthPx) {
        this.highlightGfx.fillRoundedRect(0, 0, this.widthPx, hlH, this.radius);
      } else {
        this.highlightGfx.fillRect(0, 0, fillWidth, hlH);
      }
    }

    // Delta
    this.drawDelta();

    // Counter text
    this.counterText.setText(layerIdx > 0 ? `x${layerIdx}` : "");

    // HP label
    this.label.setText(`${Math.floor(this.currentHp)}/${this.totalHp}`);
  }

  private drawDelta() {
    this.deltaGfx.clear();
    if (this.deltaWidth <= 0) return;
    const totalWidth = Math.min(this.currentFillWidth + this.deltaWidth, this.widthPx);
    if (totalWidth <= 0) return;
    this.deltaGfx.fillStyle(0xffffff, 0.85);
    this.deltaGfx.fillRect(0, 0, totalWidth, this.heightPx);
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
    if (this.currentFillWidth >= this.widthPx) {
      this.flashGfx.fillRoundedRect(0, 0, this.widthPx, this.heightPx, this.radius);
    } else {
      this.flashGfx.fillRect(0, 0, this.currentFillWidth, this.heightPx);
    }
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
}
