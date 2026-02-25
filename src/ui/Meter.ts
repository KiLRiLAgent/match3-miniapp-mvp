import Phaser from "phaser";

export class Meter extends Phaser.GameObjects.Container {
  private fill: Phaser.GameObjects.Rectangle;
  private highlight: Phaser.GameObjects.Rectangle;
  private label: Phaser.GameObjects.Text;
  private widthPx: number;
  private baseColor: number;
  private isHp: boolean;

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
    this.baseColor = color;
    this.isHp = isHp;

    const radius = Math.round(height / 2);

    // Rounded border background
    const borderGfx = scene.add.graphics();
    borderGfx.fillStyle(0x0a0c16, 0.65);
    borderGfx.fillRoundedRect(0, 0, width, height, radius);
    borderGfx.lineStyle(2, 0x334466, 0.7);
    borderGfx.strokeRoundedRect(0, 0, width, height, radius);

    // Mask so fill/highlight stay within rounded shape
    const maskGfx = scene.add.graphics();
    maskGfx.fillStyle(0xffffff);
    maskGfx.fillRoundedRect(0, 0, width, height, radius);
    maskGfx.setVisible(false);
    this.add(maskGfx);
    const geoMask = maskGfx.createGeometryMask();

    this.fill = scene.add
      .rectangle(0, 0, width, height, color, 0.95)
      .setOrigin(0, 0)
      .setMask(geoMask);

    // Highlight strip for faux gradient
    this.highlight = scene.add
      .rectangle(0, 0, width, Math.round(height * 0.3), 0xffffff, 0.15)
      .setOrigin(0, 0)
      .setMask(geoMask);

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

    this.add([borderGfx, this.fill, this.highlight, title, this.label]);
    scene.add.existing(this);
  }

  setValue(current: number, max: number) {
    const clamped = Phaser.Math.Clamp(current, 0, max);
    const ratio = max === 0 ? 0 : clamped / max;
    this.fill.width = this.widthPx * ratio;
    this.highlight.width = this.widthPx * ratio;
    this.label.setText(`${Math.floor(clamped)}/${max}`);

    if (this.isHp) {
      const color = ratio > 0.5 ? this.baseColor : ratio > 0.25 ? 0xf5a623 : 0xde3e3e;
      this.fill.setFillStyle(color, 0.95);
    }
  }
}
