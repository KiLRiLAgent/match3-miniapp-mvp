import Phaser from "phaser";

type SkillState = {
  enabled: boolean;
  ready: boolean;
  cooldown?: number;
  info?: string;
};

const COLORS = {
  bgIdle: 0x4a3a6e,    // Фиолетовый как в референсе
  bgReady: 0x6b4a9e,   // Ярче когда готово
  bgDisabled: 0x2a2a3e,
  bgCooldown: 0x1a1a2e, // Тёмный для кулдауна
} as const;

export class SkillButton extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Arc;
  private iconText: Phaser.GameObjects.Text;
  private costText: Phaser.GameObjects.Text;
  private clickCallback: () => void;
  private isEnabled = true;
  private originalIcon: string;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    size: number,
    icon: string,
    cost: number,
    onClick: () => void
  ) {
    super(scene, x, y);
    this.clickCallback = onClick;
    this.originalIcon = icon;

    // Круглый фон
    this.bg = scene.add
      .circle(0, 0, size / 2, COLORS.bgIdle, 0.95)
      .setStrokeStyle(2, 0xffffff, 0.4)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.isEnabled && this.clickCallback());

    // Эмодзи иконка по центру
    this.iconText = scene.add
      .text(0, -2, icon, {
        fontSize: "24px",
        color: "#ffffff",
        fontFamily: "Arial, sans-serif",
      })
      .setOrigin(0.5);

    // Стоимость под кнопкой
    this.costText = scene.add
      .text(0, size / 2 + 12, `${cost} MP`, {
        fontSize: "12px",
        color: "#aabbff",
        fontFamily: "Arial, sans-serif",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    this.add([this.bg, this.iconText, this.costText]);
    this.setSize(size, size);
    scene.add.existing(this);
  }

  applyState(state: SkillState) {
    const { enabled, ready, cooldown, info } = state;

    // На кулдауне - показать цифру вместо иконки
    if (cooldown && cooldown > 0) {
      this.isEnabled = false;
      this.iconText.setText(cooldown.toString());
      this.iconText.setFontSize(28);
      this.iconText.setY(0);
      this.bg.setFillStyle(COLORS.bgCooldown, 0.9);
      this.bg.setStrokeStyle(2, 0xff4444, 0.5);
      this.bg.setAlpha(0.7);
      this.iconText.setAlpha(1);
      this.costText.setAlpha(0.5);
      if (info) this.costText.setText(info);
      return;
    }

    // Обычный режим
    this.isEnabled = enabled;
    this.iconText.setText(this.originalIcon);
    this.iconText.setFontSize(24);
    this.iconText.setY(-2);

    const alpha = enabled ? 1 : 0.4;
    const bgColor = !enabled ? COLORS.bgDisabled : ready ? COLORS.bgReady : COLORS.bgIdle;
    const strokeAlpha = enabled ? 0.6 : 0.2;

    this.bg.setFillStyle(bgColor, 0.95);
    this.bg.setStrokeStyle(2, 0xffffff, strokeAlpha);
    this.bg.setAlpha(alpha);
    this.iconText.setAlpha(alpha);
    this.costText.setAlpha(alpha);

    if (info) this.costText.setText(info);
  }
}
