import Phaser from "phaser";

export class Meter extends Phaser.GameObjects.Container {
  private fill: Phaser.GameObjects.Rectangle;
  private label: Phaser.GameObjects.Text;
  private widthPx: number;

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

    const border = scene.add
      .rectangle(0, 0, width, height, 0x0a0c16, 0.65)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0xffffff, 0.4);

    this.fill = scene.add
      .rectangle(0, 0, width, height, color, 0.95)
      .setOrigin(0, 0);

    const title = scene.add
      .text(0, -18, label, {
        fontSize: "14px",
        color: "#cfd8ff",
        fontFamily: "Arial, sans-serif",
      })
      .setOrigin(0, 0.5);

    // Текст по центру полоски
    this.label = scene.add
      .text(width / 2, height / 2, "0/0", {
        fontSize: "13px",
        color: "#ffffff",
        fontFamily: "Arial, sans-serif",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 2,
      })
      .setOrigin(0.5, 0.5);

    this.add([border, this.fill, title, this.label]);
    scene.add.existing(this);
  }

  setValue(current: number, max: number) {
    const clamped = Phaser.Math.Clamp(current, 0, max);
    const ratio = max === 0 ? 0 : clamped / max;
    this.fill.width = this.widthPx * ratio;
    this.label.setText(`${Math.floor(clamped)}/${max}`);
  }
}
