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
    this.bg = scene.add
      .rectangle(0, 0, width, height, 0x1c1c28, 0.95)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0xffffff, 0.3);

    this.label = scene.add
      .text(width / 2, height / 2 - 6, title, {
        fontSize: "14px",
        color: "#ffffff",
        fontFamily: "Arial, sans-serif",
      })
      .setOrigin(0.5, 0.5);

    this.sub = scene.add
      .text(width / 2, height - 18, subtitle, {
        fontSize: "12px",
        color: "#cbd5ff",
        fontFamily: "Arial, sans-serif",
      })
      .setOrigin(0.5, 0.5);

    this.add([this.bg, this.label, this.sub]);
    this.setSize(width, height);
    this.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, width, height),
      Phaser.Geom.Rectangle.Contains
    );
    this.on("pointerdown", () => {
      if (this.bg.alpha >= 0.9) {
        onClick();
      }
    });

    scene.add.existing(this);
  }

  applyState(state: SkillState) {
    const { enabled, ready, info } = state;
    const alpha = enabled ? 1 : 0.35;
    this.bg.setFillStyle(ready ? 0x3355ff : 0x1c1c28, 0.95 * alpha);
    this.bg.setStrokeStyle(2, 0xffffff, enabled ? 0.8 : 0.3);
    this.label.setAlpha(alpha);
    this.sub.setAlpha(alpha);
    if (info) {
      this.sub.setText(info);
    }
  }
}
