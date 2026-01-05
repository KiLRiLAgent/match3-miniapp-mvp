import Phaser from "phaser";

export type DamageNumberType = "damage" | "heal" | "mana";

const TYPE_COLORS: Record<DamageNumberType, string> = {
  damage: "#ff4444",
  heal: "#44ff66",
  mana: "#4488ff",
};

const TYPE_PREFIX: Record<DamageNumberType, string> = {
  damage: "-",
  heal: "+",
  mana: "+",
};

export class DamageNumber extends Phaser.GameObjects.Container {
  private text: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    value: number,
    type: DamageNumberType = "damage"
  ) {
    super(scene, x, y);

    const prefix = TYPE_PREFIX[type];
    const color = TYPE_COLORS[type];

    this.text = scene.add
      .text(0, 0, `${prefix}${Math.floor(value)}`, {
        fontSize: "28px",
        fontFamily: "Arial, sans-serif",
        color: color,
        stroke: "#000000",
        strokeThickness: 4,
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0.5);

    this.add(this.text);
    scene.add.existing(this);

    this.setDepth(1000);
    this.playAnimation();
  }

  private playAnimation() {
    this.setScale(0.5);
    const offsetX = Phaser.Math.Between(-20, 20);

    this.scene.tweens.add({
      targets: this,
      scale: 1,
      duration: 150,
      ease: "Back.easeOut",
    });

    this.scene.tweens.add({
      targets: this,
      x: this.x + offsetX,
      y: this.y - 60,
      alpha: 0,
      duration: 800,
      delay: 200,
      ease: "Quad.easeOut",
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
