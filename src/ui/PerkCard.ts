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
const ARROW_UP_CHAR = "\u2191"; // ↑

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
    const fontMul = enhanced ? 1.25 : 1.0;
    const starMul = 1.0;
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

    // Title background strip
    const titleH = Math.round(26 * scale * titleMul);
    const titleGfx = scene.add.graphics();
    titleGfx.fillStyle(CARD_COLORS.titleBg, 0.9);
    titleGfx.fillRoundedRect(-halfW, -halfH, w, titleH, { tl: r, tr: r, bl: 0, br: 0 });

    // Title text
    const titleText = scene.add
      .text(0, -halfH + titleH / 2, perk.name, {
        fontSize: `${Math.round(16 * titleMul)}px`,
        color: CARD_COLORS.title,
        fontFamily: "'Exo 2', Arial, sans-serif",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 2,
        resolution: 2,
      })
      .setOrigin(0.5);

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
    const dropX = -circleR + Math.round(4 * scale);
    const dropY = iconY - circleR + Math.round(4 * scale);
    const dropR = Math.round(13 * scale * manaMul);
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

    // Description text (bottom).
    // В enhanced-режиме отделяем стрелки `↑↑↑` (или `↓↓↓`) от текста и рендерим их
    // отдельным крупным ярко-зелёным элементом снизу. Это даёт ту самую визуальную
    // акцентную «прокачку» из мокапа, не ломая старое API.
    const arrowParse = enhanced ? splitDescriptionArrows(nextDescription) : null;
    const baseDescription = arrowParse?.text ?? nextDescription;
    const arrowsString = arrowParse?.arrows ?? "";
    const descFontSize = Math.round(11 * scale * fontMul);
    const arrowsFontSize = Math.round(22 * scale * (enhanced ? 1.4 : 1));
    const descLineHeight = descFontSize + 4;
    const arrowsLineHeight = arrowsString.length > 0 ? arrowsFontSize + 4 : 0;
    const descY = halfH - Math.round(22 * scale) - (arrowsLineHeight > 0 ? arrowsLineHeight / 2 : 0);
    const descText = scene.add
      .text(0, descY, baseDescription, {
        fontSize: `${descFontSize}px`,
        color: CARD_COLORS.description,
        fontFamily: "'Exo 2', Arial, sans-serif",
        align: "center",
        wordWrap: { width: w - 16 },
        resolution: 2,
      })
      .setOrigin(0.5);

    let arrowsText: Phaser.GameObjects.Text | null = null;
    if (arrowsString.length > 0) {
      const isUp = arrowsString.includes(ARROW_UP_CHAR);
      const arrowColor = isUp ? CARD_COLORS.upgradeArrow : "#e35454";
      arrowsText = scene.add
        .text(0, descY + descLineHeight / 2 + arrowsLineHeight / 2, arrowsString, {
          fontSize: `${arrowsFontSize}px`,
          color: arrowColor,
          fontFamily: "'Exo 2', Arial, sans-serif",
          fontStyle: "bold",
          stroke: CARD_COLORS.upgradeArrowStroke,
          strokeThickness: 3,
          resolution: 2,
        })
        .setOrigin(0.5);
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
      ...(arrowsText ? [arrowsText] : []),
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

/**
 * Отделяет завершающую группу стрелок `↑`/`↓` (включая повторы) от описания.
 * Используется только для enhanced-варианта карты, чтобы вынести стрелки
 * в отдельную крупную ярко-зелёную (или красную для `↓`) подпись.
 *
 * Возвращает текст без хвостовых стрелок и саму строку стрелок (как есть,
 * без перемешивания символов — чтобы UI отражал семантику текста).
 */
function splitDescriptionArrows(input: string): { text: string; arrows: string } {
  if (!input) return { text: "", arrows: "" };
  // Берём хвост, состоящий только из стрелок (с возможным пробелом/переводом строки между ними).
  const m = input.match(/[\s]*([\u2191\u2193]+)\s*$/);
  if (!m) return { text: input, arrows: "" };
  const arrows = m[1];
  const text = input.slice(0, input.length - m[0].length).trim();
  return { text, arrows };
}
