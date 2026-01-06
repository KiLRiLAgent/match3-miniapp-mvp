import Phaser from "phaser";
import { createPulseAnimation } from "../utils/helpers";
import type { BossAbilityType } from "../game/config";

const COLORS = {
  bgIdle: 0x8b0000,
  bgReady: 0xff4444,
} as const;

// Иконки для каждого типа способности
const ABILITY_ICONS: Record<BossAbilityType, string> = {
  attack: "\u2694",      // ⚔ мечи
  bombs: "\uD83D\uDCA3", // 💣 бомба
  shield: "\uD83D\uDEE1", // 🛡 щит
  powerStrike: "\u26A1", // ⚡ молния
};

export class CooldownIcon extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Arc;
  private iconText: Phaser.GameObjects.Text;
  private cooldownText: Phaser.GameObjects.Text;
  private isPulsing = false;

  constructor(scene: Phaser.Scene, x: number, y: number, size = 48) {
    super(scene, x, y);

    // Круглый фон
    this.bg = scene.add
      .circle(0, 0, size / 2, COLORS.bgIdle, 0.9)
      .setStrokeStyle(2, 0xffffff, 0.6);

    this.iconText = scene.add
      .text(0, -4, "\u2694", { fontSize: "22px", color: "#ffffff", fontFamily: "Arial, sans-serif" })
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

    this.add([this.bg, this.iconText, this.cooldownText]);
    scene.add.existing(this);
  }

  setCooldown(value: number): void {
    const isReady = value <= 0;
    this.bg.setFillStyle(isReady ? COLORS.bgReady : COLORS.bgIdle, isReady ? 1 : 0.9);
    this.cooldownText.setText(isReady ? "!" : value.toString());

    if (isReady) this.pulse();
  }

  setAbility(type: BossAbilityType, cooldown: number): void {
    this.iconText.setText(ABILITY_ICONS[type] || "\u2694");
    this.setCooldown(cooldown);
  }

  private pulse(): void {
    if (this.isPulsing) return;
    this.isPulsing = true;
    createPulseAnimation(this.scene, this).then(() => (this.isPulsing = false));
  }
}
