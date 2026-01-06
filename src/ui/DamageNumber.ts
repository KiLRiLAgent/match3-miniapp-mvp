import Phaser from "phaser";

export type DamageNumberType = "damage" | "heal" | "mana" | "mana_loss" | "shield";

const TYPE_CONFIG: Record<DamageNumberType, { color: string; prefix: string; fontSize: string }> = {
  damage: { color: "#ff4444", prefix: "-", fontSize: "28px" },
  heal: { color: "#44ff66", prefix: "+", fontSize: "28px" },
  mana: { color: "#4488ff", prefix: "+", fontSize: "28px" },
  mana_loss: { color: "#8844ff", prefix: "-", fontSize: "28px" },
  shield: { color: "#aaaaaa", prefix: "", fontSize: "22px" },
};

const ANIMATION = {
  scaleUp: { duration: 150, ease: "Back.easeOut" },
  float: { duration: 800, delay: 200, ease: "Quad.easeOut", yOffset: -60 },
  xSpread: 20,
} as const;

export class DamageNumber extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, x: number, y: number, value: number, type: DamageNumberType = "damage") {
    super(scene, x, y);

    const { color, prefix, fontSize } = TYPE_CONFIG[type];
    const displayText = type === "shield" ? "\u{1F6E1} \u0429\u0438\u0442" : `${prefix}${Math.floor(value)}`;

    const text = scene.add
      .text(0, 0, displayText, {
        fontSize,
        fontFamily: "Arial, sans-serif",
        color,
        stroke: "#000000",
        strokeThickness: 4,
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    this.add(text);
    scene.add.existing(this);
    this.setDepth(1000);
    this.playAnimation();
  }

  private playAnimation() {
    this.setScale(0.5);

    this.scene.tweens.add({
      targets: this,
      scale: 1,
      duration: ANIMATION.scaleUp.duration,
      ease: ANIMATION.scaleUp.ease,
    });

    this.scene.tweens.add({
      targets: this,
      x: this.x + Phaser.Math.Between(-ANIMATION.xSpread, ANIMATION.xSpread),
      y: this.y + ANIMATION.float.yOffset,
      alpha: 0,
      duration: ANIMATION.float.duration,
      delay: ANIMATION.float.delay,
      ease: ANIMATION.float.ease,
      onComplete: () => this.destroy(),
    });
  }
}

export function showDamageNumber(
  scene: Phaser.Scene,
  x: number,
  y: number,
  value: number,
  type: DamageNumberType = "damage"
): void {
  new DamageNumber(scene, x, y, value, type);
}
