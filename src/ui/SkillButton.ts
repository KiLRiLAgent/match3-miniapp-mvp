import Phaser from "phaser";

type SkillState = {
  enabled: boolean;
  ready: boolean;
  cooldown?: number;
  info?: string;
  locked?: boolean;
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
  private iconImage?: Phaser.GameObjects.Image;
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
    onClick: () => void,
    iconTexture?: string
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

    // Эмодзи иконка по центру (скрыта если есть текстура)
    this.iconText = scene.add
      .text(0, -2, icon, {
        fontSize: "30px",
        color: "#ffffff",
        fontFamily: "'Exo 2', Arial, sans-serif",
      })
      .setOrigin(0.5);

    // Спрайт-иконка (если передана текстура)
    if (iconTexture) {
      this.iconImage = scene.add
        .image(0, 0, iconTexture)
        .setDisplaySize(size * 0.7, size * 0.7)
        .setOrigin(0.5);
      this.iconText.setVisible(false);
    }

    // Стоимость под кнопкой
    this.costText = scene.add
      .text(0, size / 2 + 12, `${cost} MP`, {
        fontSize: "12px",
        color: "#aabbff",
        fontFamily: "'Exo 2', Arial, sans-serif",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    const children: Phaser.GameObjects.GameObject[] = [this.bg, this.iconText];
    if (this.iconImage) children.push(this.iconImage);
    children.push(this.costText);
    this.add(children);
    this.setSize(size, size);
    scene.add.existing(this);
  }

  applyState(state: SkillState) {
    const { enabled, ready, cooldown, info } = state;

    // Заблокирован — показать замок
    if (state.locked) {
      this.isEnabled = false;
      this.iconText.setText("🔒");
      this.iconText.setVisible(true);
      this.iconText.setFontSize(24);
      this.iconText.setY(-2);
      if (this.iconImage) this.iconImage.setVisible(false);
      this.bg.setFillStyle(COLORS.bgDisabled, 0.9);
      this.bg.setStrokeStyle(2, 0xffffff, 0.15);
      this.bg.setAlpha(0.3);
      this.iconText.setAlpha(0.4);
      this.costText.setAlpha(0);
      return;
    }

    // На кулдауне - показать цифру вместо иконки
    if (cooldown && cooldown > 0) {
      this.isEnabled = false;
      this.iconText.setText(cooldown.toString());
      this.iconText.setVisible(true);
      this.iconText.setFontSize(30);
      this.iconText.setY(0);
      if (this.iconImage) this.iconImage.setVisible(false);
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
    if (this.iconImage) {
      this.iconImage.setVisible(true);
      this.iconText.setVisible(false);
    } else {
      this.iconText.setText(this.originalIcon);
      this.iconText.setVisible(true);
    }
    this.iconText.setFontSize(30);
    this.iconText.setY(-2);

    const alpha = enabled ? 1 : 0.4;
    const isActive = ready && enabled;
    const bgColor = !enabled ? COLORS.bgDisabled : ready ? COLORS.bgReady : COLORS.bgIdle;

    this.bg.setFillStyle(bgColor, 0.95);
    this.bg.setStrokeStyle(
      isActive ? 3 : 2,
      isActive ? 0x66aaff : 0xffffff,
      isActive ? 0.9 : enabled ? 0.6 : 0.2
    );
    this.bg.setAlpha(alpha);
    this.iconText.setAlpha(alpha);
    if (this.iconImage) this.iconImage.setAlpha(alpha);
    this.costText.setAlpha(alpha);

    if (info) this.costText.setText(info);
  }
}
