import Phaser from "phaser";

export class Meter extends Phaser.GameObjects.Container {
  private fill: Phaser.GameObjects.Rectangle;
  private border: Phaser.GameObjects.Rectangle;
  private label: Phaser.GameObjects.Text;
  private widthPx: number;
  private color: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    color: number
  ) {
    super(scene, x, y);
    this.widthPx = width;
    this.color = color;

    this.border = scene.add
      .rectangle(0, 0, width, height, 0x000000, 0.35)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0xffffff, 0.35);
    this.fill = scene.add
      .rectangle(0, 0, width, height, color, 0.9)
      .setOrigin(0, 0);
    this.label = scene.add
      .text(width / 2, height / 2, label, {
        fontSize: "14px",
        color: "#ffffff",
        fontFamily: "Arial, sans-serif",
      })
      .setOrigin(0.5);

    this.add([this.border, this.fill, this.label]);
    scene.add.existing(this);
  }

  setValue(current: number, max: number) {
    const clamped = Math.max(0, Math.min(current, max));
    const ratio = max === 0 ? 0 : clamped / max;
    this.fill.width = this.widthPx * ratio;
    this.fill.setFillStyle(this.color, 0.9);
    this.label.setText(`${Math.floor(clamped)}/${max}`);
  }
}
