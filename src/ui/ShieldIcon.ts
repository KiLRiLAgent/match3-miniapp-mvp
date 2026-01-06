import Phaser from "phaser";
import { createPulseAnimation } from "../utils/helpers";

export class ShieldIcon extends Phaser.GameObjects.Container {
  private cooldownText: Phaser.GameObjects.Text;
  private isPulsing = false;

  constructor(scene: Phaser.Scene, x: number, y: number, size = 48) {
    super(scene, x, y);

    const bg = scene.add
      .rectangle(0, 0, size, size, 0x3366ff, 0.9)
      .setOrigin(0.5)
      .setStrokeStyle(2, 0xffffff, 0.8);

    const shieldEmoji = scene.add.text(0, -2, "\u{1F6E1}", { fontSize: "22px" }).setOrigin(0.5);

    this.cooldownText = scene.add
      .text(0, size / 2 - 10, "2", {
        fontSize: "14px",
        fontFamily: "Arial, sans-serif",
        color: "#ffffff",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 2,
      })
      .setOrigin(0.5);

    this.add([bg, shieldEmoji, this.cooldownText]);
    scene.add.existing(this);
    this.setVisible(false);
  }

  show(duration: number): void {
    this.cooldownText.setText(duration.toString());
    this.setVisible(true);
    this.pulse();
  }

  updateDuration(duration: number): void {
    this.cooldownText.setText(duration.toString());
    if (duration <= 0) this.hide();
  }

  hide(): void {
    this.setVisible(false);
  }

  private pulse(): void {
    if (this.isPulsing) return;
    this.isPulsing = true;
    createPulseAnimation(this.scene, this).then(() => (this.isPulsing = false));
  }
}
