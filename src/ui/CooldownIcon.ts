import Phaser from "phaser";
import { createPulseController } from "../utils/helpers";
import type { BossAbilityType } from "../game/config";

const COLORS = {
  bgIdle: 0x8b0000,
  bgReady: 0xff4444,
  highlightStroke: 0xffd700,
  defaultStroke: 0xffffff,
} as const;
const HIGHLIGHT_STROKE_WIDTH = 4;
const DEFAULT_STROKE_WIDTH = 2;

// Иконки для каждого типа способности
const ABILITY_ICONS: Record<BossAbilityType, string> = {
  attack: "⚔",      // ⚔ мечи
  bombs: "💣", // 💣 бомба
  shield: "🛡", // 🛡 щит
  powerStrike: "⚡", // ⚡ молния
};

export class CooldownIcon extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Arc;
  private iconText: Phaser.GameObjects.Text;
  private cooldownText: Phaser.GameObjects.Text;
  private pulse: () => void;

  constructor(scene: Phaser.Scene, x: number, y: number, size = 48) {
    super(scene, x, y);

    // Круглый фон
    this.bg = scene.add
      .circle(0, 0, size / 2, COLORS.bgIdle, 0.9)
      .setStrokeStyle(DEFAULT_STROKE_WIDTH, COLORS.defaultStroke, 0.6);

    this.iconText = scene.add
      .text(0, -4, "⚔", { fontSize: "22px", color: "#ffffff", fontFamily: "'Exo 2', Arial, sans-serif", resolution: 2 })
      .setOrigin(0.5);

    this.cooldownText = scene.add
      .text(0, size / 2 - 10, "3", {
        fontSize: "16px",
        fontFamily: "'Exo 2', Arial, sans-serif",
        color: "#ffffff",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 3,
        resolution: 2,
      })
      .setOrigin(0.5);

    this.add([this.bg, this.iconText, this.cooldownText]);
    scene.add.existing(this);

    this.pulse = createPulseController(scene, this);
  }

  setCooldown(value: number): void {
    const isReady = value <= 0;
    this.bg.setFillStyle(isReady ? COLORS.bgReady : COLORS.bgIdle, isReady ? 1 : 0.9);
    this.cooldownText.setText(isReady ? "!" : value.toString());

    if (isReady) this.pulse();
  }

  setAbility(type: BossAbilityType, cooldown: number): void {
    this.iconText.setText(ABILITY_ICONS[type] || "⚔");
    this.setCooldown(cooldown);
  }

  /**
   * Toggle a gold stroke around the icon — used when a stun-type skill is
   * being previewed in SkillApplyOverlay, signaling "this will interact
   * with the boss cooldown shown here". No tween; static highlight.
   */
  setHighlight(active: boolean): void {
    if (active) {
      this.bg.setStrokeStyle(HIGHLIGHT_STROKE_WIDTH, COLORS.highlightStroke, 1);
    } else {
      this.bg.setStrokeStyle(DEFAULT_STROKE_WIDTH, COLORS.defaultStroke, 0.6);
    }
  }
}
