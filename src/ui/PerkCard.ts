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
    const h = options?.height ?? 180;
    const scale = h / 200; // scale factor relative to base 200px
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
    const titleH = Math.round(26 * scale);
    const titleGfx = scene.add.graphics();
    titleGfx.fillStyle(CARD_COLORS.titleBg, 0.9);
    titleGfx.fillRoundedRect(-halfW, -halfH, w, titleH, { tl: r, tr: r, bl: 0, br: 0 });

    // Title text
    const titleText = scene.add
      .text(0, -halfH + titleH / 2, perk.name, {
        fontSize: "16px",
        color: CARD_COLORS.title,
        fontFamily: "'Exo 2', Arial, sans-serif",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 2,
        resolution: 2,
      })
      .setOrigin(0.5);

    // Skill icon in circle (like game skill buttons)
    const iconY = -halfH + titleH + Math.round(38 * scale);
    const circleR = Math.round(28 * scale);
    const iconCircleGfx = scene.add.graphics();
    iconCircleGfx.fillStyle(0x2a2a4a, 0.9);
    iconCircleGfx.fillCircle(0, iconY, circleR);
    iconCircleGfx.lineStyle(2, 0x4a4a8a, 0.8);
    iconCircleGfx.strokeCircle(0, iconY, circleR);

    const iconText = scene.add
      .text(0, iconY, perk.icon, {
        fontSize: `${Math.round(32 * scale)}px`,
        color: CARD_COLORS.icon,
        fontFamily: "'Exo 2', Arial, sans-serif",
        resolution: 2,
      })
      .setOrigin(0.5);

    // Mana cost — blue drop in top-left corner of card
    const dropGfx = scene.add.graphics();
    const dropX = -halfW + Math.round(16 * scale);
    const dropY = -halfH + titleH + Math.round(12 * scale);
    const dropR = Math.round(13 * scale);
    dropGfx.fillStyle(0x3b82f6, 0.9);
    dropGfx.fillCircle(dropX, dropY, dropR);
    const costText = scene.add
      .text(dropX, dropY, `${manaCost}`, {
        fontSize: `${Math.round(11 * scale)}px`,
        color: "#ffffff",
        fontFamily: "'Exo 2', Arial, sans-serif",
        fontStyle: "bold",
        resolution: 2,
      })
      .setOrigin(0.5);

    // Stars row (5 stars)
    const starsY = iconY + Math.round(55 * scale);
    const starSpacing = Math.round(16 * scale);
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
          fontSize: `${Math.round(16 * scale)}px`,
          color,
          fontFamily: "'Exo 2', Arial, sans-serif",
          resolution: 2,
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
    const descY = halfH - Math.round(22 * scale);
    const descText = scene.add
      .text(0, descY, nextDescription, {
        fontSize: `${Math.round(11 * scale)}px`,
        color: CARD_COLORS.description,
        fontFamily: "'Exo 2', Arial, sans-serif",
        align: "center",
        wordWrap: { width: w - 16 },
        resolution: 2,
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
      iconCircleGfx,
      iconText,
      dropGfx,
      costText,
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
      if (!this.scene) { resolve(); return; }
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
      if (!this.scene) { resolve(); return; }
      this.scene.tweens.add({
        targets: this,
        scale: 1.15,
        duration: 150,
        ease: "Quad.easeOut",
        onComplete: () => {
          if (!this.scene) { resolve(); return; }
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
      if (!this.scene) { resolve(); return; }
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
    if (!this.scene) return;

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
