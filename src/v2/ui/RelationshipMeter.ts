import Phaser from "phaser";
import { DPR } from "../../game/config";

const BAR_BG_COLOR = 0x222244;
const BAR_BG_ALPHA = 0.9;
const BAR_BORDER_COLOR = 0x6e4ac8;
const BAR_BORDER_WIDTH = 1;
const BAR_BORDER_ALPHA = 0.8;
const FILL_ALPHA = 0.95;

const AXIS_COLORS = {
  empathy: 0x4caf50,
  dominance: 0xc83e8e,
  cynicism: 0x808088,
} as const;

const AXIS_LABELS: Record<keyof typeof AXIS_COLORS, string> = {
  empathy: "Эмпатия",
  dominance: "Доминирование",
  cynicism: "Цинизм",
};

const MAX_VALUE = 100;
const ROW_GAP = 6;
const LABEL_FONT_SIZE = 12;
const LABEL_FONT = "'Exo 2', Arial, sans-serif";
const LABEL_COLOR = "#ffffff";
const LABEL_STROKE = "#000000";
const LABEL_STROKE_WIDTH = 2;

export interface RelationshipMeterValues {
  empathy: number;
  dominance: number;
  cynicism: number;
}

type AxisKey = keyof typeof AXIS_COLORS;
const AXES: readonly AxisKey[] = ["empathy", "dominance", "cynicism"];

/**
 * Three small bars (empathy / dominance / cynicism) for PostCombatScene.
 * Uses the three-case `fillRadius()` helper from gold-standards/ui-component.ts
 * (snap full / pill narrow / left-rounded middle) to avoid sharp-corner
 * artifacts on partial fills. Container-based, no geometry masks.
 */
export class RelationshipMeter extends Phaser.GameObjects.Container {
  private widthPx: number;
  private rowHeight: number;
  private radius: number;
  private bars: Record<AxisKey, Phaser.GameObjects.Graphics>;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    rowHeight: number,
  ) {
    super(scene, x, y);
    this.widthPx = width;
    this.rowHeight = rowHeight;
    this.radius = Math.round(rowHeight / 2);

    const d = DPR;
    this.bars = {
      empathy: new Phaser.GameObjects.Graphics(scene),
      dominance: new Phaser.GameObjects.Graphics(scene),
      cynicism: new Phaser.GameObjects.Graphics(scene),
    };

    const children: Phaser.GameObjects.GameObject[] = [];
    AXES.forEach((axis, idx) => {
      const yOffset = idx * (rowHeight + ROW_GAP);

      const bg = new Phaser.GameObjects.Graphics(scene);
      bg.fillStyle(BAR_BG_COLOR, BAR_BG_ALPHA);
      bg.fillRoundedRect(0, yOffset, width, rowHeight, this.radius);
      bg.lineStyle(BAR_BORDER_WIDTH * d, BAR_BORDER_COLOR, BAR_BORDER_ALPHA);
      bg.strokeRoundedRect(0, yOffset, width, rowHeight, this.radius);

      const label = new Phaser.GameObjects.Text(
        scene,
        0,
        yOffset + rowHeight / 2,
        AXIS_LABELS[axis],
        {
          fontSize: `${LABEL_FONT_SIZE * d}px`,
          color: LABEL_COLOR,
          fontFamily: LABEL_FONT,
          stroke: LABEL_STROKE,
          strokeThickness: LABEL_STROKE_WIDTH * d,
        },
      );
      label.setOrigin(0, 0.5);

      children.push(bg, this.bars[axis], label);
    });

    this.add(children);
    scene.add.existing(this);
  }

  setValues(values: RelationshipMeterValues): void {
    AXES.forEach((axis, idx) => {
      this.drawBar(axis, values[axis], idx);
    });
  }

  /**
   * Per-corner radius for partial fills — three cases:
   *   1. snap to full (width >= widthPx - r): caller draws widthPx with uniform radius
   *   2. narrow (width < 2r): pill shape (all four corners = width/2)
   *   3. middle: left rounded, right straight
   * Mirrors src/ui/Meter.ts:151 (gold-standards/ui-component.ts section 2a).
   */
  private fillRadius(
    width: number,
  ): number | Phaser.Types.GameObjects.Graphics.RoundedRectRadius {
    const r = this.radius;
    if (width >= this.widthPx - r) return r;
    if (width < 2 * r) {
      const eff = width / 2;
      return { tl: eff, tr: eff, bl: eff, br: eff };
    }
    return { tl: r, tr: 0, bl: r, br: 0 };
  }

  private drawBar(axis: AxisKey, value: number, idx: number): void {
    const ratio = Math.max(0, Math.min(MAX_VALUE, value)) / MAX_VALUE;
    const fillWidth = this.widthPx * ratio;
    const yOffset = idx * (this.rowHeight + ROW_GAP);
    const fill = this.bars[axis];
    fill.clear();
    if (fillWidth <= 0) return;
    const fr = this.fillRadius(fillWidth);
    const drawW = typeof fr === "number" ? this.widthPx : fillWidth;
    fill.fillStyle(AXIS_COLORS[axis], FILL_ALPHA);
    fill.fillRoundedRect(0, yOffset, drawW, this.rowHeight, fr);
  }
}
