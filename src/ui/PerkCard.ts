import Phaser from "phaser";
import { MAX_PERK_LEVEL } from "../game/PerkManager";
import type { PerkDef } from "../game/PerkManager";

const CARD_COLORS = {
  bg: 0x1a1a2e,
  border: 0xd4a017,
  borderGlow: 0xffd700,
  titleBg: 0x2a1a0e,
  starFilled: 0xffd700,
  starEmpty: 0x444466,
  starNext: 0xffd700,
  manaCost: "#aabbff",
  description: "#cccccc",
  title: "#ffd700",
  icon: "#ffffff",
} as const;

const STAR_CHAR = "\u2605"; // ★
const STAR_EMPTY_CHAR = "\u2606"; // ☆

export interface PerkCardOptions {
  width?: number;
  height?: number;
}

export class PerkCard extends Phaser.GameObjects.Container {
  private cardBg: Phaser.GameObjects.Graphics;
  private borderGlow: Phaser.GameObjects.Graphics;
  private glowTween?: Phaser.Tweens.Tween;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    perk: PerkDef,
    currentLevel: number,
    manaCost: number,
    nextDescription: string,
    onClick: () => void,
    options?: PerkCardOptions
  ) {
    super(scene, x, y);

    const w = options?.width ?? 120;
    const h = options?.height ?? 200;
    const r = 12;
    const halfW = w / 2;
    const halfH = h / 2;

    // Glow border (behind card, slightly larger)
    this.borderGlow = scene.add.graphics();
    this.borderGlow.lineStyle(4, CARD_COLORS.borderGlow, 0.6);
    this.borderGlow.strokeRoundedRect(-halfW - 2, -halfH - 2, w + 4, h + 4, r + 2);
    this.borderGlow.setAlpha(0.4);

    // Card background
    this.cardBg = scene.add.graphics();
    this.cardBg.fillStyle(CARD_COLORS.bg, 0.95);
    this.cardBg.fillRoundedRect(-halfW, -halfH, w, h, r);
    this.cardBg.lineStyle(2, CARD_COLORS.border, 0.9);
    this.cardBg.strokeRoundedRect(-halfW, -halfH, w, h, r);

    // Title background strip
    const titleH = 30;
    const titleGfx = scene.add.graphics();
    titleGfx.fillStyle(CARD_COLORS.titleBg, 0.9);
    titleGfx.fillRoundedRect(-halfW, -halfH, w, titleH, { tl: r, tr: r, bl: 0, br: 0 });

    // Title text
    const titleText = scene.add
      .text(0, -halfH + titleH / 2, perk.name, {
        fontSize: "13px",
        color: CARD_COLORS.title,
        fontFamily: "'Exo 2', Arial, sans-serif",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 1,
      })
      .setOrigin(0.5);

    // Skill icon (large, center)
    const iconY = -halfH + titleH + 35;
    const iconText = scene.add
      .text(0, iconY, perk.icon, {
        fontSize: "40px",
        color: CARD_COLORS.icon,
        fontFamily: "'Exo 2', Arial, sans-serif",
      })
      .setOrigin(0.5);

    // Mana cost (left of icon)
    const costText = scene.add
      .text(-30, iconY + 30, `${manaCost}`, {
        fontSize: "12px",
        color: CARD_COLORS.manaCost,
        fontFamily: "'Exo 2', Arial, sans-serif",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    const manaLabel = scene.add
      .text(-30, iconY + 44, "мана", {
        fontSize: "9px",
        color: CARD_COLORS.manaCost,
        fontFamily: "'Exo 2', Arial, sans-serif",
      })
      .setOrigin(0.5);

    // Stars row (5 stars)
    const starsY = iconY + 65;
    const starSpacing = 16;
    const starsStartX = -(starSpacing * (MAX_PERK_LEVEL - 1)) / 2;

    const starsTexts: Phaser.GameObjects.Text[] = [];
    for (let i = 0; i < MAX_PERK_LEVEL; i++) {
      const isFilled = i < currentLevel;
      const isNext = i === currentLevel;
      const char = isFilled || isNext ? STAR_CHAR : STAR_EMPTY_CHAR;
      const color = isFilled
        ? "#ffd700"
        : isNext
          ? "#ffd700"
          : "#444466";

      const star = scene.add
        .text(starsStartX + i * starSpacing, starsY, char, {
          fontSize: "16px",
          color,
          fontFamily: "'Exo 2', Arial, sans-serif",
        })
        .setOrigin(0.5);

      // Blink animation for the "next" star
      if (isNext) {
        scene.tweens.add({
          targets: star,
          alpha: { from: 0.3, to: 1 },
          duration: 500,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
      }

      starsTexts.push(star);
    }

    // Description text (bottom)
    const descY = halfH - 28;
    const descText = scene.add
      .text(0, descY, nextDescription, {
        fontSize: "11px",
        color: CARD_COLORS.description,
        fontFamily: "'Exo 2', Arial, sans-serif",
        align: "center",
        wordWrap: { width: w - 16 },
      })
      .setOrigin(0.5);

    // Interactive hit area
    const hitArea = scene.add
      .rectangle(0, 0, w, h, 0x000000, 0)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => onClick())
      .on("pointerover", () => this.onHover(true))
      .on("pointerout", () => this.onHover(false));

    // Assemble children
    const children: Phaser.GameObjects.GameObject[] = [
      this.borderGlow,
      this.cardBg,
      titleGfx,
      titleText,
      iconText,
      costText,
      manaLabel,
      ...starsTexts,
      descText,
      hitArea,
    ];

    this.add(children);
    this.setSize(w, h);
    scene.add.existing(this);

    // Entry animation
    this.setScale(0);
    this.setAlpha(0);
  }

  playEntrance(delay: number): Promise<void> {
    return new Promise<void>((resolve) => {
      this.scene.tweens.add({
        targets: this,
        scale: { from: 0, to: 1 },
        alpha: { from: 0, to: 1 },
        duration: 300,
        delay,
        ease: "Back.easeOut",
        onComplete: () => resolve(),
      });
    });
  }

  playSelect(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.scene.tweens.add({
        targets: this,
        scale: 1.15,
        duration: 150,
        ease: "Quad.easeOut",
        onComplete: () => {
          this.scene.tweens.add({
            targets: this,
            alpha: 0,
            scale: 1.3,
            duration: 200,
            ease: "Quad.easeIn",
            onComplete: () => resolve(),
          });
        },
      });
    });
  }

  playDismiss(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.scene.tweens.add({
        targets: this,
        alpha: 0,
        scale: 0.8,
        duration: 200,
        ease: "Quad.easeIn",
        onComplete: () => resolve(),
      });
    });
  }

  private onHover(isOver: boolean) {
    if (this.glowTween) {
      this.glowTween.stop();
      this.glowTween = undefined;
    }

    if (isOver) {
      this.glowTween = this.scene.tweens.add({
        targets: this.borderGlow,
        alpha: 0.9,
        duration: 150,
        ease: "Quad.easeOut",
      });
    } else {
      this.glowTween = this.scene.tweens.add({
        targets: this.borderGlow,
        alpha: 0.4,
        duration: 150,
        ease: "Quad.easeOut",
      });
    }
  }

  destroy(fromScene?: boolean) {
    if (this.glowTween) {
      this.glowTween.stop();
      this.glowTween = undefined;
    }
    super.destroy(fromScene);
  }
}
