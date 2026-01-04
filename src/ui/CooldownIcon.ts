import Phaser from "phaser";

export class CooldownIcon extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Rectangle;
  private border: Phaser.GameObjects.Rectangle;
  private cooldownText: Phaser.GameObjects.Text;
  private iconText: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    size: number = 48
  ) {
    super(scene, x, y);

    // Фон иконки
    this.bg = scene.add
      .rectangle(0, 0, size, size, 0x8b0000, 0.9)
      .setOrigin(0.5, 0.5);

    // Рамка
    this.border = scene.add
      .rectangle(0, 0, size, size)
      .setOrigin(0.5, 0.5)
      .setStrokeStyle(2, 0xffffff, 0.6)
      .setFillStyle(0x000000, 0);

    // Символ способности (заглушка - кулак)
    this.iconText = scene.add
      .text(0, -4, "\u2694", {
        fontSize: "22px",
        color: "#ffffff",
        fontFamily: "Arial, sans-serif",
      })
      .setOrigin(0.5, 0.5);

    // Число кулдауна
    this.cooldownText = scene.add
      .text(0, size / 2 - 10, "3", {
        fontSize: "16px",
        fontFamily: "Arial, sans-serif",
        color: "#ffffff",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0.5);

    this.add([this.bg, this.border, this.iconText, this.cooldownText]);
    scene.add.existing(this);
  }

  /**
   * Обновляет отображаемый кулдаун.
   */
  setCooldown(value: number): void {
    this.cooldownText.setText(value.toString());

    // Подсветка когда способность готова
    if (value <= 0) {
      this.bg.setFillStyle(0xff4444, 1);
      this.cooldownText.setText("!");
      this.pulseAnimation();
    } else {
      this.bg.setFillStyle(0x8b0000, 0.9);
    }
  }

  /**
   * Анимация пульсации когда способность готова.
   */
  private pulseAnimation(): void {
    this.scene.tweens.add({
      targets: this,
      scale: 1.15,
      duration: 200,
      yoyo: true,
      ease: "Sine.easeInOut",
    });
  }

  /**
   * Устанавливает имя способности (для тултипа в будущем).
   */
  setAbilityName(_name: string): void {
    // TODO: показать тултип при наведении
  }
}
