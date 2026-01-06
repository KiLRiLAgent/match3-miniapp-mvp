import Phaser from "phaser";

type SkillState = {
  enabled: boolean;
  ready: boolean;
  info?: string;
};

const COLORS = {
  bgIdle: 0x4a3a6e,    // Фиолетовый как в референсе
  bgReady: 0x6b4a9e,   // Ярче когда готово
  bgDisabled: 0x2a2a3e,
} as const;

export class SkillButton extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Arc;
  private iconText: Phaser.GameObjects.Text;
  private costText: Phaser.GameObjects.Text;
  private clickCallback: () => void;
  private isEnabled = true;

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
      .text(0, size / 2 + 12, `${cost}`, {
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
    const { enabled, ready, info } = state;
    this.isEnabled = enabled;

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
