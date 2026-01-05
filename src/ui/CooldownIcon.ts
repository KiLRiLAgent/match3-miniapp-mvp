import Phaser from "phaser";

export class CooldownIcon extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Rectangle;
  private cooldownText: Phaser.GameObjects.Text;
  private isPulsing = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    size: number = 48
  ) {
    super(scene, x, y);

    this.bg = scene.add
      .rectangle(0, 0, size, size, 0x8b0000, 0.9)
      .setOrigin(0.5)
      .setStrokeStyle(2, 0xffffff, 0.6);

    const iconText = scene.add
      .text(0, -4, "\u2694", {
        fontSize: "22px",
        color: "#ffffff",
        fontFamily: "Arial, sans-serif",
      })
      .setOrigin(0.5);

    this.cooldownText = scene.add
      .text(0, size / 2 - 10, "3", {
        fontSize: "16px",
        fontFamily: "Arial, sans-serif",
        color: "#ffffff",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setOrigin(0.5);

    this.add([this.bg, iconText, this.cooldownText]);
    scene.add.existing(this);
  }

  setCooldown(value: number): void {
    if (value <= 0) {
      this.bg.setFillStyle(0xff4444, 1);
      this.cooldownText.setText("!");
      this.pulseAnimation();
    } else {
      this.bg.setFillStyle(0x8b0000, 0.9);
      this.cooldownText.setText(value.toString());
    }
  }

  private pulseAnimation(): void {
    if (this.isPulsing) return;
    this.isPulsing = true;

    this.scene.tweens.add({
      targets: this,
      scale: 1.15,
      duration: 200,
      yoyo: true,
      ease: "Sine.easeInOut",
      onComplete: () => (this.isPulsing = false),
    });
  }
}
