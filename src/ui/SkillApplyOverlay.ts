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

const CARD_W = 360;
const CARD_H = 220;
const CARD_RADIUS = 14;
const ICON_SIZE = 96;
const BACKDROP_ALPHA = 0.35;
const BTN_W = 220;
const BTN_H = 52;
const BTN_RADIUS = 12;

// Card placement: floats above the boss name; safe-area clamp keeps it clear of the notch.
const CARD_NAME_GAP = 12;
const CARD_TOP_SAFE_GAP = 8;

// Card inner layout offsets.
const LEFT_PAD = 18;
const RIGHT_PAD = 16;
const STARS_TOP_GAP = 14;
const STAR_SIZE = 20;
const STAR_GAP = 4;

// Right-column (text) layout. Rows stack from NAME_TOP_PAD downwards.
const NAME_FONT_SIZE = 30;
const NAME_LINE_HEIGHT = 34;
const NAME_TOP_PAD = 16;
const META_FONT_SIZE = 17;
const META_LINE_HEIGHT = 22;
const META_GAP_AFTER_NAME = 6;
const DESC_FONT_SIZE = 20;
const DESC_GAP_AFTER_META = 10;

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

    // === LEFT side: icon plate + stars ===
    const iconX = cardX - CARD_W / 2 + LEFT_PAD + ICON_SIZE / 2;
    const starsRowH = STAR_SIZE + 6; // small gap above/below star cluster
    const leftBlockH = ICON_SIZE + STARS_TOP_GAP + starsRowH;
    const iconY = cardY - (leftBlockH / 2) + ICON_SIZE / 2;

    // Icon circle bg
    const iconBg = new Phaser.GameObjects.Arc(
      scene, iconX, iconY, ICON_SIZE / 2, 0, 360, false, 0x4a3a6e, 0.95,
    ).setStrokeStyle(3, 0x7ab8ff, 0.8);
    this.add(iconBg);

    // Icon content (texture or emoji)
    if (cfg.iconTexture && scene.textures.exists(cfg.iconTexture)) {
      const iconImg = new Phaser.GameObjects.Image(scene, iconX, iconY, cfg.iconTexture)
        .setDisplaySize(ICON_SIZE * 0.7, ICON_SIZE * 0.7);
      this.add(iconImg);
    } else {
      const iconText = new Phaser.GameObjects.Text(scene, iconX, iconY - 2, cfg.icon, {
        fontSize: `${Math.round(ICON_SIZE * 0.6)}px`,
        color: "#ffffff",
        fontFamily: "'Exo 2', Arial, sans-serif",
        resolution: 2,
      }).setOrigin(0.5);
      this.add(iconText);
    }

    // Stars row below icon (no badge — mana cost is inline in the text column)
    const starsY = iconY + ICON_SIZE / 2 + STARS_TOP_GAP;
    const totalStarsW = PERK_MAX_LEVEL * STAR_SIZE + (PERK_MAX_LEVEL - 1) * STAR_GAP;
    const starsStartX = iconX - totalStarsW / 2 + STAR_SIZE / 2;
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

    // === RIGHT side: name, cost row, cooldown row, description ===
    const rightX = iconX + ICON_SIZE / 2 + RIGHT_PAD;
    // 12 % safety margin — see `fc75d5a` commit for rationale (web font
    // load race with Phaser text measurement).
    const TEXT_BUDGET_SAFETY = 0.88;
    const rightMaxW = (CARD_W - LEFT_PAD - ICON_SIZE - RIGHT_PAD - RIGHT_PAD) * TEXT_BUDGET_SAFETY;
    let rowY = cardY - CARD_H / 2 + NAME_TOP_PAD;

    const makeMeasurer = (style: Phaser.Types.GameObjects.Text.TextStyle) => (s: string): number => {
      const probe = scene.make.text({ x: 0, y: 0, text: s, style, add: false });
      const w = probe.width;
      probe.destroy();
      return w;
    };

    // --- Skill name (gold, bold, large) ---
    const nameStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontSize: `${NAME_FONT_SIZE}px`,
      color: COLORS.nameText,
      fontFamily: "'Exo 2', Arial, sans-serif",
      fontStyle: "bold",
      stroke: "#000000",
      strokeThickness: 3,
      resolution: 2,
    };
    const nameLines = hyphenateRu(cfg.name, rightMaxW, makeMeasurer(nameStyle));
    const nameText = new Phaser.GameObjects.Text(
      scene, rightX, rowY, nameLines.join("\n"), nameStyle,
    ).setOrigin(0, 0);
    this.add(nameText);
    rowY += nameLines.length * NAME_LINE_HEIGHT + META_GAP_AFTER_NAME;

    // --- Cost row: «Стоимость 💧N маны» (label + mana-drop sprite + number) ---
    const metaStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontSize: `${META_FONT_SIZE}px`,
      color: "#ffffff",
      fontFamily: "'Exo 2', Arial, sans-serif",
      fontStyle: "bold",
      stroke: "#000000",
      strokeThickness: 2,
      resolution: 2,
    };
    const costLabel = new Phaser.GameObjects.Text(scene, rightX, rowY, "Стоимость", metaStyle)
      .setOrigin(0, 0);
    this.add(costLabel);
    const metaIconSize = META_FONT_SIZE + 6;
    const metaInlineGap = 4;
    const manaIconX = rightX + costLabel.width + metaInlineGap + metaIconSize / 2;
    const manaIcon = new Phaser.GameObjects.Image(
      scene, manaIconX, rowY + META_FONT_SIZE / 2, ASSET_KEYS.tiles[TileKind.Mana],
    ).setDisplaySize(metaIconSize, metaIconSize).setOrigin(0.5);
    this.add(manaIcon);
    const costValueText = new Phaser.GameObjects.Text(
      scene, manaIconX + metaIconSize / 2 + metaInlineGap, rowY,
      `${cfg.cost} маны`, metaStyle,
    ).setOrigin(0, 0);
    this.add(costValueText);
    rowY += META_LINE_HEIGHT;

    // --- Cooldown row: «Перезарядка ⏳N ход(а|ов)» ---
    const cdLabel = new Phaser.GameObjects.Text(scene, rightX, rowY, "Перезарядка", metaStyle)
      .setOrigin(0, 0);
    this.add(cdLabel);
    const hourglassX = rightX + cdLabel.width + metaInlineGap + metaIconSize / 2;
    const hourglass = new Phaser.GameObjects.Text(
      scene, hourglassX, rowY + META_FONT_SIZE / 2, "⏳",
      { ...metaStyle, color: COLORS.cooldownText, strokeThickness: 1 },
    ).setOrigin(0.5);
    this.add(hourglass);
    const cdSuffix = cfg.cooldown === 1 ? "ход" : cfg.cooldown >= 2 && cfg.cooldown <= 4 ? "хода" : "ходов";
    const cdValue = new Phaser.GameObjects.Text(
      scene, hourglassX + metaIconSize / 2 + metaInlineGap, rowY,
      `${cfg.cooldown} ${cdSuffix}`, metaStyle,
    ).setOrigin(0, 0);
    this.add(cdValue);
    rowY += META_LINE_HEIGHT + DESC_GAP_AFTER_META;

    // --- Description row: «Наносит ⚔️N физического урона» ---
    const descColor = cfg.heal > 0 ? COLORS.healText : cfg.damage > 0 ? COLORS.damageText : "#cfd8ff";
    const descStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontSize: `${DESC_FONT_SIZE}px`,
      color: descColor,
      fontFamily: "'Exo 2', Arial, sans-serif",
      fontStyle: "bold",
      stroke: "#000000",
      strokeThickness: 2,
      resolution: 2,
    };
    const descLines = hyphenateRu(cfg.description, rightMaxW, makeMeasurer(descStyle));
    const descText = new Phaser.GameObjects.Text(
      scene, rightX, rowY, descLines.join("\n"), descStyle,
    ).setOrigin(0, 0);
    this.add(descText);

    // === Apply button — centred horizontally AND vertically on the board ===
    // Board centre is the most natural spot for an acknowledge-action button
    // (players look at the board while thinking about the skill).
    const btnY = UI_LAYOUT.boardOriginY + UI_LAYOUT.boardHeight / 2;

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
