import Phaser from "phaser";
import { ASSET_KEYS } from "../game/assets";
import { GAME_WIDTH, GAME_HEIGHT, PERK_MAX_LEVEL, SAFE_AREA, UI_LAYOUT } from "../game/config";
import type { SkillDef } from "../game/config";
import { TileKind } from "../match3/types";
import { hyphenateRu } from "../utils/ruHyphenate";

const OVERLAY_DEPTH = 1500;

const COLORS = {
  backdrop: 0x000000,
  panelBg: 0x1a1f3a,
  panelStroke: 0x6b4a9e,
  applyBg: 0x2da548,
  applyBgHover: 0x35c357,
  applyStroke: 0x7af09a,
  manaText: "#7ab8ff",
  cooldownText: "#ffd166",
  damageText: "#ff8866",
  healText: "#9ef7a5",
  nameText: "#ffd700",
  starOn: 0xffd700,
  starOff: 0x4a3a6e,
} as const;

const CARD_W = 270;
const CARD_H = 150;
const CARD_RADIUS = 12;
const ICON_SIZE = 56;
// Cost badge (mana drop) sits on top-left edge of the icon circle.
// BADGE_OFFSET ≈ ICON_SIZE/2 * cos(45°) so the badge centre lies right on the circle border.
// Badge is 20% larger on the confirmation overlay than on the resting SkillButton —
// the "selected skill" callout should read prominently.
const BADGE_SIZE = 38;
const BADGE_OFFSET = Math.round((ICON_SIZE / 2) * 0.72);
const BACKDROP_ALPHA = 0.35;
const BTN_W = 200;
const BTN_H = 48;
const BTN_RADIUS = 10;

// Card placement: floats above the boss name; safe-area clamp keeps it clear of the notch.
const CARD_NAME_GAP = 12;
const CARD_TOP_SAFE_GAP = 8;

// Card inner layout offsets.
const LEFT_PAD = 20;
const RIGHT_PAD = 16;
const ICON_CARD_Y_OFFSET = 12; // nudges icon above centre to make room for stars below
const STAR_SIZE = 12;
const STAR_GAP = 3;
const STAR_Y_PAD = 10;
const BTN_Y_GAP = 20;

// Text row layout inside the card (right-hand side).
const NAME_LINE_HEIGHT = 20;
const ROW_GAP = 4;
const NAME_TOP_PAD = 18;
const CD_ROW_HEIGHT = 20;
const CD_TOP_PAD = 4;

export interface SkillApplyOverlayOptions {
  /** Skill definition to display */
  skill: SkillDef;
  /** Current perk level (1..PERK_MAX_LEVEL) */
  level: number;
  /** Callback fired when player confirms — should activate the skill */
  onConfirm: () => void;
  /** Callback fired when player cancels (X / backdrop tap) */
  onCancel: () => void;
  /** Optional: fired once after the overlay is built — scene can highlight HP/MP bars, dim other UI, etc. */
  onOpen?: () => void;
  /** Optional: fired in both confirm and cancel paths AFTER destroy — scene must clean up any highlights/tweens it started in onOpen */
  onClose?: () => void;
}

/**
 * Compact confirmation card shown after tapping a skill button.
 * Displays skill icon, stars, name, cost, cooldown, effect description, and a
 * green "Применить!" button. Game field is visible through a lighter backdrop.
 *
 * Modal pattern per `.conventions/gold-standards/ui-component.ts` §12:
 * - backdrop pointerdown closes (with stopPropagation)
 * - card panel absorbs pointerdown (stopPropagation)
 * - apply button stopPropagation in its own handler
 */
export class SkillApplyOverlay extends Phaser.GameObjects.Container {
  private opts: SkillApplyOverlayOptions;
  private closed = false;
  private pulseTweens: Phaser.Tweens.Tween[] = [];

  constructor(scene: Phaser.Scene, opts: SkillApplyOverlayOptions) {
    super(scene, 0, 0);
    this.opts = opts;
    this.setDepth(OVERLAY_DEPTH);
    this.build();
    scene.add.existing(this);
    try {
      opts.onOpen?.();
    } catch (err) {
      console.error("SkillApplyOverlay onOpen error:", err);
    }
  }

  private build() {
    const scene = this.scene;
    const cfg = this.opts.skill;
    const cx = GAME_WIDTH / 2;

    // === Backdrop — fullscreen, lighter alpha, closes on tap ===
    const backdrop = new Phaser.GameObjects.Rectangle(
      scene, 0, 0, GAME_WIDTH, GAME_HEIGHT, COLORS.backdrop, BACKDROP_ALPHA,
    ).setOrigin(0).setInteractive({ useHandCursor: false });
    backdrop.on("pointerdown", (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      this.close(false);
    });
    this.add(backdrop);

    // === Card position — above boss name, clamped to safe area ===
    const minTopY = SAFE_AREA.top + CARD_H / 2 + CARD_TOP_SAFE_GAP;
    const idealCardY = UI_LAYOUT.bossNameY - CARD_NAME_GAP - CARD_H / 2;
    const cardY = Math.max(minTopY, idealCardY);
    const cardX = cx;

    // === Card background (Graphics for rounded rect) ===
    const cardGfx = new Phaser.GameObjects.Graphics(scene);
    cardGfx.fillStyle(COLORS.panelBg, 0.95);
    cardGfx.fillRoundedRect(
      cardX - CARD_W / 2, cardY - CARD_H / 2,
      CARD_W, CARD_H, CARD_RADIUS,
    );
    cardGfx.lineStyle(2, COLORS.panelStroke, 0.9);
    cardGfx.strokeRoundedRect(
      cardX - CARD_W / 2, cardY - CARD_H / 2,
      CARD_W, CARD_H, CARD_RADIUS,
    );
    this.add(cardGfx);

    // Card interactive zone — absorbs taps (stopPropagation)
    const cardHitZone = new Phaser.GameObjects.Rectangle(
      scene, cardX, cardY, CARD_W, CARD_H, 0x000000, 0,
    ).setInteractive({ useHandCursor: false });
    cardHitZone.on("pointerdown", (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
    });
    this.add(cardHitZone);

    // === LEFT side: icon + stars ===
    const iconX = cardX - CARD_W / 2 + LEFT_PAD + ICON_SIZE / 2;
    const iconY = cardY - ICON_CARD_Y_OFFSET;

    // Icon circle bg
    const iconBg = new Phaser.GameObjects.Arc(
      scene, iconX, iconY, ICON_SIZE / 2, 0, 360, false, 0x4a3a6e, 0.95,
    ).setStrokeStyle(2, 0xffffff, 0.4);
    this.add(iconBg);

    // Icon content (texture or emoji)
    if (cfg.iconTexture && scene.textures.exists(cfg.iconTexture)) {
      const iconImg = new Phaser.GameObjects.Image(scene, iconX, iconY, cfg.iconTexture)
        .setDisplaySize(ICON_SIZE * 0.7, ICON_SIZE * 0.7);
      this.add(iconImg);
    } else {
      const iconText = new Phaser.GameObjects.Text(scene, iconX, iconY - 2, cfg.icon, {
        fontSize: "36px",
        color: "#ffffff",
        fontFamily: "'Exo 2', Arial, sans-serif",
        resolution: 2,
      }).setOrigin(0.5);
      this.add(iconText);
    }

    // === Mana cost badge (drop) on top-left of the icon circle ===
    // Centre of badge sits on the circle border for visual "intersection".
    const badgeX = iconX - BADGE_OFFSET;
    const badgeY = iconY - BADGE_OFFSET;
    const manaBadge = new Phaser.GameObjects.Image(scene, badgeX, badgeY, ASSET_KEYS.tiles[TileKind.Mana])
      .setDisplaySize(BADGE_SIZE, BADGE_SIZE)
      .setOrigin(0.5);
    this.add(manaBadge);
    const costBadgeText = new Phaser.GameObjects.Text(scene, badgeX, badgeY, `${cfg.cost}`, {
      fontSize: "14px",
      color: "#ffffff",
      fontFamily: "'Exo 2', Arial, sans-serif",
      fontStyle: "bold",
      stroke: "#0b3a7a",
      strokeThickness: 2,
      resolution: 2,
    }).setOrigin(0.5);
    this.add(costBadgeText);

    // Stars below icon
    const totalStarsW = PERK_MAX_LEVEL * STAR_SIZE + (PERK_MAX_LEVEL - 1) * STAR_GAP;
    const starsStartX = iconX - totalStarsW / 2 + STAR_SIZE / 2;
    const starsY = iconY + ICON_SIZE / 2 + STAR_Y_PAD;
    const lvl = Phaser.Math.Clamp(this.opts.level, 0, PERK_MAX_LEVEL);
    for (let i = 0; i < PERK_MAX_LEVEL; i++) {
      const filled = i < lvl;
      const star = new Phaser.GameObjects.Text(
        scene, starsStartX + i * (STAR_SIZE + STAR_GAP), starsY,
        "★",
        {
          fontSize: `${STAR_SIZE + 2}px`,
          color: filled ? "#ffd700" : "#4a3a6e",
          fontFamily: "'Exo 2', Arial, sans-serif",
          fontStyle: "bold",
          stroke: filled ? "#6b4c00" : "#000000",
          strokeThickness: filled ? 2 : 1,
          resolution: 2,
        },
      ).setOrigin(0.5);
      this.add(star);
    }

    // === RIGHT side: name, cooldown, description (all syllable-wrapped) ===
    const rightX = iconX + ICON_SIZE / 2 + RIGHT_PAD;
    // Web fonts (Exo 2) may not be loaded yet when the overlay builds —
    // Phaser measures with a fallback font and under-reports width, so a
    // word that "fits" in the probe ends up overflowing after the font
    // finishes loading. Shave 12% off the budget so hyphenation kicks in
    // with headroom for the real render.
    const TEXT_BUDGET_SAFETY = 0.88;
    const rightMaxW = (CARD_W - LEFT_PAD - ICON_SIZE - RIGHT_PAD - RIGHT_PAD) * TEXT_BUDGET_SAFETY;
    let rowY = cardY - CARD_H / 2 + NAME_TOP_PAD;

    // Builds a style-specific measurer for hyphenateRu. Each call creates
    // and destroys a throwaway Phaser.Text — acceptable because this runs
    // only at overlay construction time (not in a render loop).
    const makeMeasurer = (style: Phaser.Types.GameObjects.Text.TextStyle) => (s: string): number => {
      const probe = scene.make.text({ x: 0, y: 0, text: s, style, add: false });
      const w = probe.width;
      probe.destroy();
      return w;
    };

    // Skill name (gold, bold) — Russian syllable-wrap via hyphenateRu
    const nameStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontSize: "18px",
      color: COLORS.nameText,
      fontFamily: "'Exo 2', Arial, sans-serif",
      fontStyle: "bold",
      stroke: "#000000",
      strokeThickness: 2,
      resolution: 2,
    };
    const nameLines = hyphenateRu(cfg.name, rightMaxW, makeMeasurer(nameStyle));
    const nameText = new Phaser.GameObjects.Text(
      scene, rightX, rowY, nameLines.join("\n"), nameStyle,
    ).setOrigin(0, 0);
    this.add(nameText);

    rowY += nameLines.length * NAME_LINE_HEIGHT + ROW_GAP;

    // Cooldown row
    const cdLabel = cfg.cooldown === 1 ? "ход" : "ходов";
    const cdText = new Phaser.GameObjects.Text(
      scene, rightX, rowY + CD_TOP_PAD,
      `⏳ ${cfg.cooldown} ${cdLabel}`,
      {
        fontSize: "14px",
        color: COLORS.cooldownText,
        fontFamily: "'Exo 2', Arial, sans-serif",
        fontStyle: "bold",
        resolution: 2,
      },
    ).setOrigin(0, 0);
    this.add(cdText);

    rowY += CD_ROW_HEIGHT + ROW_GAP;

    // Effect description — Russian syllable-wrap via hyphenateRu
    const descColor = cfg.heal > 0 ? COLORS.healText : cfg.damage > 0 ? COLORS.damageText : "#cfd8ff";
    const descStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontSize: "14px",
      color: descColor,
      fontFamily: "'Exo 2', Arial, sans-serif",
      fontStyle: "bold",
      resolution: 2,
    };
    const descLines = hyphenateRu(cfg.description, rightMaxW, makeMeasurer(descStyle));
    const descText = new Phaser.GameObjects.Text(
      scene, rightX, rowY, descLines.join("\n"), descStyle,
    ).setOrigin(0, 0);
    this.add(descText);

    // === Apply button — separate from card, at bottom-center ===
    const btnY = UI_LAYOUT.playerHpBarY - BTN_Y_GAP;

    const btnGfx = new Phaser.GameObjects.Graphics(scene);
    btnGfx.fillStyle(COLORS.applyBg, 1);
    btnGfx.fillRoundedRect(cx - BTN_W / 2, btnY - BTN_H / 2, BTN_W, BTN_H, BTN_RADIUS);
    btnGfx.lineStyle(3, COLORS.applyStroke, 1);
    btnGfx.strokeRoundedRect(cx - BTN_W / 2, btnY - BTN_H / 2, BTN_W, BTN_H, BTN_RADIUS);
    this.add(btnGfx);

    // Button hit zone (interactive)
    const btnHit = new Phaser.GameObjects.Rectangle(
      scene, cx, btnY, BTN_W, BTN_H, 0x000000, 0,
    ).setInteractive({ useHandCursor: true });
    btnHit.on("pointerdown", (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      this.close(true);
    });
    this.add(btnHit);

    const applyLabel = new Phaser.GameObjects.Text(scene, cx, btnY, "Применить!", {
      fontSize: "22px",
      color: "#ffffff",
      fontFamily: "'Exo 2', Arial, sans-serif",
      fontStyle: "bold",
      stroke: "#0a3a18",
      strokeThickness: 3,
      resolution: 2,
    }).setOrigin(0.5);
    this.add(applyLabel);
  }

  /** Phaser lifecycle hook — kill tweens + fire onClose (lifecycle-safe) */
  preDestroy() {
    for (const t of this.pulseTweens) {
      if (t && t.isPlaying()) t.stop();
    }
    this.pulseTweens.length = 0;
    try { this.opts.onClose?.(); } catch (err) { console.error("SkillApplyOverlay onClose error:", err); }
  }

  /**
   * Close the overlay.
   * Apply path:  onConfirm() → destroy() → preDestroy → onClose
   * Cancel path: destroy() → preDestroy → onClose → onCancel()
   */
  private close(confirmed: boolean) {
    if (this.closed) return;
    this.closed = true;
    if (confirmed) {
      try { this.opts.onConfirm(); } catch (err) { console.error("SkillApplyOverlay onConfirm error:", err); }
      this.destroy(); // → preDestroy → onClose
    } else {
      const onCancel = this.opts.onCancel;
      this.destroy(); // → preDestroy → onClose
      try { onCancel(); } catch (err) { console.error("SkillApplyOverlay onCancel error:", err); }
    }
  }
}
