import Phaser from "phaser";
import { MAX_PERK_LEVEL } from "../game/PerkManager";
import type { PerkDef } from "../game/PerkManager";
import { ASSET_KEYS } from "../game/assets";
import { TileKind } from "../match3/types";

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
  upgradeArrow: "#4CAF50",
  upgradeArrowStroke: "#1b3d1f",
} as const;

const STAR_CHAR = "\u2605"; // ★
const STAR_EMPTY_CHAR = "\u2606"; // ☆

export interface PerkCardOptions {
  width?: number;
  height?: number;
  /**
   * Опт-ин на «крупный» вариант оформления (используется в v1 GameScene.showPerkSelection).
   * При false (по умолчанию) поведение карты остаётся прежним — это нужно, чтобы любые
   * существующие/будущие интеграции (включая v2 ArenaPerkModal-подобные сценарии)
   * не поменяли визуал.
   */
  enhancedVisuals?: boolean;
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
    const enhanced = options?.enhancedVisuals ?? false;
    // Множители шрифтов / звёзд / иконки для «крупного» варианта.
    // Сохраняем 1.0 в дефолте, чтобы поведение для не-enhanced вызовов не менялось.
    const fontMul = enhanced ? 1.1 : 1.0;
    const starMul = 0.97;
    const titleMul = enhanced ? 1.2 : 1.0;
    const iconMul = enhanced ? 1.18 : 1.0;
    const manaMul = 1.0;

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

    // Title text — create first to measure, then draw strip behind it
    const titleMaxW = w - 12;
    let titleFontSize = Math.round(16 * titleMul);
    const titleText = scene.add
      .text(0, 0, perk.name, {
        fontSize: `${titleFontSize}px`,
        color: CARD_COLORS.title,
        fontFamily: "'Exo 2', Arial, sans-serif",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 2,
        // useAdvancedWrap lets Phaser break long single words at the card
        // edge — without it, "Оглушение" stays on one line wider than the
        // card and overflows sideways.
        wordWrap: { width: titleMaxW, useAdvancedWrap: true },
        align: "center",
        resolution: 2,
      })
      .setOrigin(0.5);
    // Shrink font if title exceeds ~2 lines OR overflows sideways. The
    // width check matters when advanced wrap is disabled or when a single
    // very long word still beats the wrap heuristic.
    const maxTitleTextH = titleFontSize * 2.6;
    while (
      (titleText.height > maxTitleTextH || titleText.width > titleMaxW) &&
      titleFontSize > 10
    ) {
      titleFontSize -= 1;
      titleText.setFontSize(titleFontSize);
    }
    const titleH = Math.max(Math.round(26 * scale * titleMul), Math.round(titleText.height + 6));
    titleText.setY(-halfH + titleH / 2);

    // Title background strip
    const titleGfx = scene.add.graphics();
    titleGfx.fillStyle(CARD_COLORS.titleBg, 0.9);
    titleGfx.fillRoundedRect(-halfW, -halfH, w, titleH, { tl: r, tr: r, bl: 0, br: 0 });

    // Skill icon in circle (like game skill buttons)
    const iconY = -halfH + titleH + Math.round(38 * scale * titleMul);
    const circleR = Math.round(28 * scale * iconMul);
    const iconCircleGfx = scene.add.graphics();
    iconCircleGfx.fillStyle(0x2a2a4a, 0.9);
    iconCircleGfx.fillCircle(0, iconY, circleR);
    iconCircleGfx.lineStyle(2, 0x4a4a8a, 0.8);
    iconCircleGfx.strokeCircle(0, iconY, circleR);

    const iconText = scene.add
      .text(0, iconY, perk.icon, {
        fontSize: `${Math.round(32 * scale * iconMul)}px`,
        color: CARD_COLORS.icon,
        fontFamily: "'Exo 2', Arial, sans-serif",
        resolution: 2,
      })
      .setOrigin(0.5);

    // Mana cost — blue water-drop icon overlapping icon circle (top-left).
    // Enhanced режим использует ASSET_KEYS.tiles[TileKind.Mana] (синий каплеподобный
    // тайл) c числом стоимости, отрисованным поверх иконки. Fallback на старый круг
    // оставлен для не-enhanced вызовов и на случай отсутствия текстуры.
    const dropX = -circleR + Math.round(10 * scale);
    const dropY = iconY - circleR + Math.round(10 * scale);
    const dropR = Math.round(15 * scale * manaMul);
    const manaTexKey = ASSET_KEYS.tiles[TileKind.Mana];
    const useManaSprite = enhanced && scene.textures.exists(manaTexKey);
    let manaIcon: Phaser.GameObjects.GameObject;
    if (useManaSprite) {
      const sprite = scene.add.image(dropX, dropY, manaTexKey);
      const targetSize = dropR * 2.3;
      sprite.setDisplaySize(targetSize, targetSize);
      manaIcon = sprite;
    } else {
      const dropGfx = scene.add.graphics();
      dropGfx.fillStyle(0x3b82f6, 0.9);
      dropGfx.fillCircle(dropX, dropY, dropR);
      manaIcon = dropGfx;
    }
    const costText = scene.add
      .text(dropX, dropY, `${manaCost}`, {
        fontSize: `${Math.round(11 * scale * manaMul)}px`,
        color: "#ffffff",
        fontFamily: "'Exo 2', Arial, sans-serif",
        fontStyle: "bold",
        stroke: "#0b3a7a",
        strokeThickness: enhanced ? 3 : 0,
        resolution: 2,
      })
      .setOrigin(0.5);

    // Stars row (5 stars)
    const starsY = iconY + Math.round(55 * scale * (enhanced ? 1.15 : 1));
    const starSpacing = Math.round(16 * scale * starMul);
    const starsStartX = -(starSpacing * (MAX_PERK_LEVEL - 1)) / 2;

    const starsTexts: Phaser.GameObjects.Text[] = [];
    for (let i = 0; i < MAX_PERK_LEVEL; i++) {
      const isFilled = i < currentLevel;
      const isNext = i === currentLevel;
      const char = isFilled || isNext ? STAR_CHAR : STAR_EMPTY_CHAR;
      const color = isFilled || isNext ? "#ffd700" : "#444466";

      const star = scene.add
        .text(starsStartX + i * starSpacing, starsY, char, {
          fontSize: `${Math.round(16 * scale * starMul)}px`,
          color,
          fontFamily: "'Exo 2', Arial, sans-serif",
          stroke: enhanced ? "#000000" : undefined,
          strokeThickness: enhanced ? 2 : 0,
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

    // Description text — arrows (↑ / ↓) are rendered inline with the
    // description as regular characters, not as a separate coloured
    // callout. Trade-off: loses the accent colour (green / red) the
    // separate arrows row used to have. If accent colour is needed back,
    // split the string into head + arrows and render them as two Phaser.Text
    // objects side-by-side.
    const baseDescription = nextDescription;
    const descFontSize = Math.round(10 * scale * fontMul);

    // Description area: from below stars to card bottom
    const descAreaTop = starsY + Math.round(12 * scale);
    const descAreaBottom = halfH - 6;
    const descVisibleH = Math.max(0, descAreaBottom - descAreaTop);

    // Build description with shrink-to-fit — no marquee scroll. If the
    // rendered height exceeds the visible area, we step the font size
    // down until it fits (floor 8 px). Quieter than the old auto-scroll
    // and keeps the card static.
    let currentDescFontSize = descFontSize;
    const descText = scene.add
      .text(0, descAreaTop, baseDescription, {
        fontSize: `${currentDescFontSize}px`,
        color: CARD_COLORS.description,
        fontFamily: "'Exo 2', Arial, sans-serif",
        fontStyle: "bold",
        align: "center",
        // useAdvancedWrap lets Phaser break long Russian words at the card
        // edge instead of letting them overflow sideways.
        wordWrap: { width: w - 16, useAdvancedWrap: true },
        padding: { left: 2, right: 2, top: 0, bottom: 0 },
        resolution: 2,
      })
      .setOrigin(0.5, 0);
    const DESC_MIN_FONT_PX = 8;
    while (
      descVisibleH > 0 &&
      descText.height > descVisibleH &&
      currentDescFontSize > DESC_MIN_FONT_PX
    ) {
      currentDescFontSize -= 1;
      descText.setFontSize(currentDescFontSize);
    }

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
      manaIcon,
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
    if (this.glowTween) { this.glowTween.stop(); this.glowTween = undefined; }
    super.destroy(fromScene);
  }
}
