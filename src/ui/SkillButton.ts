import Phaser from "phaser";

type SkillState = {
  enabled: boolean;
  ready: boolean;
  info?: string;
};

export class SkillButton extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Rectangle;
  private label: Phaser.GameObjects.Text;
  private sub: Phaser.GameObjects.Text;
  private clickCallback: () => void;
  private isEnabled = true;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    height: number,
    title: string,
    subtitle: string,
    onClick: () => void
  ) {
    super(scene, x, y);
    this.clickCallback = onClick;

    const centerX = x + width / 2;
    const centerY = y + height / 2;

    this.bg = scene.add
      .rectangle(centerX, centerY, width, height, 0x1c1c28, 0.95)
      .setStrokeStyle(2, 0xffffff, 0.3)
      .setInteractive({ useHandCursor: true })
      .setDepth(10)
      .on("pointerdown", () => this.isEnabled && this.clickCallback());

    this.label = scene.add
      .text(centerX, centerY - 6, title, {
        fontSize: "14px",
        color: "#ffffff",
        fontFamily: "Arial, sans-serif",
      })
      .setOrigin(0.5)
      .setDepth(11);

    this.sub = scene.add
      .text(centerX, y + height - 18, subtitle, {
        fontSize: "12px",
        color: "#cbd5ff",
        fontFamily: "Arial, sans-serif",
      })
      .setOrigin(0.5)
      .setDepth(11);

    this.setSize(width, height);
    scene.add.existing(this);
  }

  applyState(state: SkillState) {
    const { enabled, ready, info } = state;
    this.isEnabled = enabled;

    const alpha = enabled ? 1 : 0.35;
    const bgColor = ready ? 0x3355ff : 0x1c1c28;
    const strokeAlpha = enabled ? 0.8 : 0.3;

    this.bg.setFillStyle(bgColor, 0.95 * alpha);
    this.bg.setStrokeStyle(2, 0xffffff, strokeAlpha);
    this.label.setAlpha(alpha);
    this.sub.setAlpha(alpha);

    if (info) this.sub.setText(info);
  }
}
