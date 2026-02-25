import Phaser from "phaser";

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

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    color: number,
    isHp = false
  ) {
    super(scene, x, y);
    this.widthPx = width;
    this.heightPx = height;
    this.baseColor = color;
    this.currentColor = color;
    this.isHp = isHp;
    this.radius = Math.round(height / 2);

    // Rounded border background
    const borderGfx = scene.add.graphics();
    borderGfx.fillStyle(0x0a0c16, 0.65);
    borderGfx.fillRoundedRect(0, 0, width, height, this.radius);
    borderGfx.lineStyle(2, 0x334466, 0.7);
    borderGfx.strokeRoundedRect(0, 0, width, height, this.radius);

    // Fill drawn as rounded rect (no mask needed)
    this.fillGfx = scene.add.graphics();
    this.drawFill(width);

    // Highlight strip for faux gradient
    this.highlightGfx = scene.add.graphics();
    this.drawHighlight(width);

    const title = scene.add
      .text(0, -18, label, {
        fontSize: "14px",
        color: "#cfd8ff",
        fontFamily: "'Exo 2', Arial, sans-serif",
      })
      .setOrigin(0, 0.5);

    // Текст по центру полоски
    this.label = scene.add
      .text(width / 2, height / 2, "0/0", {
        fontSize: "13px",
        color: "#ffffff",
        fontFamily: "'Exo 2', Arial, sans-serif",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 2,
      })
      .setOrigin(0.5, 0.5);

    this.add([borderGfx, this.fillGfx, this.highlightGfx, title, this.label]);
    scene.add.existing(this);
  }

  private drawFill(fillWidth: number) {
    this.fillGfx.clear();
    if (fillWidth <= 0) return;
    this.fillGfx.fillStyle(this.currentColor, 0.95);
    this.fillGfx.fillRoundedRect(0, 0, fillWidth, this.heightPx, this.radius);
  }

  private drawHighlight(fillWidth: number) {
    this.highlightGfx.clear();
    if (fillWidth <= 0) return;
    this.highlightGfx.fillStyle(0xffffff, 0.15);
    this.highlightGfx.fillRoundedRect(0, 0, fillWidth, Math.round(this.heightPx * 0.3), this.radius);
  }

  setValue(current: number, max: number) {
    const clamped = Phaser.Math.Clamp(current, 0, max);
    const ratio = max === 0 ? 0 : clamped / max;
    const fillWidth = this.widthPx * ratio;

    if (this.isHp) {
      this.currentColor = ratio > 0.5 ? this.baseColor : ratio > 0.25 ? 0xf5a623 : 0xde3e3e;
    }

    this.drawFill(fillWidth);
    this.drawHighlight(fillWidth);
    this.label.setText(`${Math.floor(clamped)}/${max}`);
  }
}
