import Phaser from "phaser";
import { TileKind } from "../match3/types";
import { ASSET_KEYS } from "../game/assets";
import { GAME_WIDTH, GAME_HEIGHT, PERK_MAX_LEVEL, UI_LAYOUT } from "../game/config";
import type { SkillDef } from "../game/config";

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

const CARD_W = 300;
const CARD_H = 150;
const CARD_RADIUS = 12;
const ICON_SIZE = 64;
const BACKDROP_ALPHA = 0.35;
const BTN_W = 200;
const BTN_H = 48;
const BTN_RADIUS = 10;

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

    // === Card position — above game board ===
    const cardY = UI_LAYOUT.bossHpBarY + UI_LAYOUT.hpBarHeight + 20 + CARD_H / 2;
    const cardX = cx;

    // === Card background (Graphics for rounded rect) ===
    const cardGfx = new Phaser.GameObjects.Graphics(scene);
    cardGfx.fillStyle(0x1a1f3a, 0.95);
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
    const leftPad = 20;
    const iconX = cardX - CARD_W / 2 + leftPad + ICON_SIZE / 2;
    const iconY = cardY - 12; // slightly above center to make room for stars

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

    // Pulse the icon
    this.pulseTweens.push(scene.tweens.add({
      targets: iconBg,
      scale: { from: 1, to: 1.08 },
      duration: 700,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    }));

    // Stars below icon
    const starSize = 12;
    const starGap = 3;
    const totalStarsW = PERK_MAX_LEVEL * starSize + (PERK_MAX_LEVEL - 1) * starGap;
    const starsStartX = iconX - totalStarsW / 2 + starSize / 2;
    const starsY = iconY + ICON_SIZE / 2 + 10;
    const lvl = Phaser.Math.Clamp(this.opts.level, 0, PERK_MAX_LEVEL);
    for (let i = 0; i < PERK_MAX_LEVEL; i++) {
      const filled = i < lvl;
      const star = new Phaser.GameObjects.Text(
        scene, starsStartX + i * (starSize + starGap), starsY,
        "\u2605",
        {
          fontSize: `${starSize + 2}px`,
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

    // === RIGHT side: name, cost, cooldown, description ===
    const rightX = iconX + ICON_SIZE / 2 + 16;
    const rightMaxW = CARD_W - leftPad - ICON_SIZE - 16 - 16; // available width for text
    let rowY = cardY - CARD_H / 2 + 22;
    const rowGap = 22;

    // Skill name (gold, bold)
    const nameText = new Phaser.GameObjects.Text(scene, rightX, rowY, cfg.name, {
      fontSize: "20px",
      color: COLORS.nameText,
      fontFamily: "'Exo 2', Arial, sans-serif",
      fontStyle: "bold",
      stroke: "#000000",
      strokeThickness: 2,
      resolution: 2,
    }).setOrigin(0, 0);
    this.add(nameText);

    rowY += rowGap;

    // Mana cost row
    const manaIconSize = 16;
    const manaIcon = new Phaser.GameObjects.Image(scene, rightX + manaIconSize / 2, rowY + 8, ASSET_KEYS.tiles[TileKind.Mana])
      .setDisplaySize(manaIconSize, manaIconSize);
    const manaText = new Phaser.GameObjects.Text(
      scene, rightX + manaIconSize + 6, rowY + 8,
      `${cfg.cost} \u043C\u0430\u043D\u044B`,
      {
        fontSize: "14px",
        color: COLORS.manaText,
        fontFamily: "'Exo 2', Arial, sans-serif",
        fontStyle: "bold",
        resolution: 2,
      },
    ).setOrigin(0, 0.5);
    this.add([manaIcon, manaText]);

    rowY += rowGap;

    // Cooldown row
    const cdLabel = cfg.cooldown === 1 ? "\u0445\u043E\u0434" : "\u0445\u043E\u0434\u043E\u0432";
    const cdText = new Phaser.GameObjects.Text(
      scene, rightX, rowY + 8,
      `\u23F3 ${cfg.cooldown} ${cdLabel}`,
      {
        fontSize: "14px",
        color: COLORS.cooldownText,
        fontFamily: "'Exo 2', Arial, sans-serif",
        fontStyle: "bold",
        resolution: 2,
      },
    ).setOrigin(0, 0.5);
    this.add(cdText);

    rowY += rowGap;

    // Effect description
    const descColor = cfg.heal > 0 ? COLORS.healText : cfg.damage > 0 ? COLORS.damageText : "#cfd8ff";
    const descText = new Phaser.GameObjects.Text(
      scene, rightX, rowY + 4, cfg.description,
      {
        fontSize: "14px",
        color: descColor,
        fontFamily: "'Exo 2', Arial, sans-serif",
        fontStyle: "bold",
        wordWrap: { width: rightMaxW },
        resolution: 2,
      },
    ).setOrigin(0, 0.5);
    this.add(descText);

    // === Apply button — separate from card, at bottom-center ===
    const btnY = UI_LAYOUT.playerHpBarY - 20;

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

    const applyLabel = new Phaser.GameObjects.Text(scene, cx, btnY, "\u041F\u0440\u0438\u043C\u0435\u043D\u0438\u0442\u044C!", {
      fontSize: "22px",
      color: "#ffffff",
      fontFamily: "'Exo 2', Arial, sans-serif",
      fontStyle: "bold",
      stroke: "#0a3a18",
      strokeThickness: 3,
      resolution: 2,
    }).setOrigin(0.5);
    this.add(applyLabel);

    // Pulse the apply button
    this.pulseTweens.push(scene.tweens.add({
      targets: [btnGfx, btnHit, applyLabel],
      scaleX: { from: 1, to: 1.03 },
      scaleY: { from: 1, to: 1.03 },
      duration: 800,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    }));
  }

  /** Phaser lifecycle hook — kill our infinite tweens before children are destroyed */
  preDestroy() {
    for (const t of this.pulseTweens) {
      if (t && t.isPlaying()) t.stop();
    }
    this.pulseTweens.length = 0;
  }

  /** Close the overlay. confirmed=true -> onConfirm, false -> onCancel. */
  private close(confirmed: boolean) {
    if (this.closed) return;
    this.closed = true;
    const cb = confirmed ? this.opts.onConfirm : this.opts.onCancel;
    const onClose = this.opts.onClose;
    this.destroy();
    if (onClose) {
      try { onClose(); } catch (err) { console.error("SkillApplyOverlay onClose error:", err); }
    }
    try {
      cb();
    } catch (err) {
      console.error("SkillApplyOverlay callback error:", err);
    }
  }
}
