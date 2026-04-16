import Phaser from "phaser";
import { TileKind } from "../match3/types";
import { ASSET_KEYS } from "../game/assets";
import { GAME_WIDTH, GAME_HEIGHT, PERK_MAX_LEVEL } from "../game/config";
import type { SkillDef } from "../game/config";

const OVERLAY_DEPTH = 1500;

const COLORS = {
  backdrop: 0x000000,
  panelBg: 0x1a1f3a,
  panelStroke: 0x6b4a9e,
  applyBg: 0x2da548,
  applyBgHover: 0x35c357,
  applyStroke: 0x7af09a,
  closeBg: 0x4a3a6e,
  closeStroke: 0xff8866,
  manaText: "#7ab8ff",
  cooldownText: "#ffd166",
  damageText: "#ff8866",
  healText: "#9ef7a5",
  starOn: 0xffd700,
  starOff: 0x4a3a6e,
} as const;

const MANA_ICON_SIZE = 18;
const HOURGLASS_SIZE = 18;

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
 * Confirmation overlay shown after tapping a skill button.
 * Displays skill details, cost, cooldown, level stars, and a green "Применить!"
 * button. Player must confirm before the skill activates.
 *
 * Modal pattern per `.conventions/gold-standards/ui-component.ts` §12:
 * - backdrop pointerdown closes (with stopPropagation)
 * - panel absorbs pointerdown
 * - close button + apply button stopPropagation in their own handlers
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
    // Fire onOpen after add.existing so scene can safely tween/dim UI elements
    try {
      opts.onOpen?.();
    } catch (err) {
      console.error("SkillApplyOverlay onOpen error:", err);
    }
  }

  private build() {
    const scene = this.scene;
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    // === Backdrop — fullscreen, closes on tap ===
    const backdrop = new Phaser.GameObjects.Rectangle(
      scene, 0, 0, GAME_WIDTH, GAME_HEIGHT, COLORS.backdrop, 0.7,
    ).setOrigin(0).setInteractive({ useHandCursor: false });
    backdrop.on("pointerdown", (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      this.close(false);
    });
    this.add(backdrop);

    // === Panel — centered, absorbs taps ===
    const panelW = Math.min(GAME_WIDTH - 32, 380);
    const panelH = Math.min(GAME_HEIGHT - 80, 460);

    const panel = new Phaser.GameObjects.Rectangle(
      scene, cx, cy, panelW, panelH, COLORS.panelBg, 0.96,
    ).setStrokeStyle(2, COLORS.panelStroke, 0.9).setInteractive({ useHandCursor: false });
    panel.on("pointerdown", (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
    });
    this.add(panel);

    // === Layout inside the panel (top-down) ===
    const padX = 20;
    const innerLeft = cx - panelW / 2 + padX;
    const innerRight = cx + panelW / 2 - padX;
    const top = cy - panelH / 2;

    // Close button — top-right corner inside panel
    const closeR = 18;
    const closeX = innerRight - closeR;
    const closeY = top + closeR + 8;
    const closeBg = new Phaser.GameObjects.Arc(
      scene, closeX, closeY, closeR, 0, 360, false, COLORS.closeBg, 0.95,
    ).setStrokeStyle(2, COLORS.closeStroke, 0.9).setInteractive({ useHandCursor: true });
    const closeText = new Phaser.GameObjects.Text(scene, closeX, closeY - 1, "✕", {
      fontSize: "20px",
      color: "#ffffff",
      fontFamily: "'Exo 2', Arial, sans-serif",
      fontStyle: "bold",
      resolution: 2,
    }).setOrigin(0.5);
    const closeHandler = (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      this.close(false);
    };
    closeBg.on("pointerdown", closeHandler);
    this.add([closeBg, closeText]);

    // === Header row: large icon + name ===
    const headerY = top + 56;
    const iconSize = 64;
    const iconX = innerLeft + iconSize / 2;

    const iconBg = new Phaser.GameObjects.Arc(
      scene, iconX, headerY, iconSize / 2, 0, 360, false, 0x4a3a6e, 0.95,
    ).setStrokeStyle(2, 0xffffff, 0.4);
    this.add(iconBg);

    const cfg = this.opts.skill;
    if (cfg.iconTexture && scene.textures.exists(cfg.iconTexture)) {
      const iconImg = new Phaser.GameObjects.Image(scene, iconX, headerY, cfg.iconTexture)
        .setDisplaySize(iconSize * 0.7, iconSize * 0.7);
      this.add(iconImg);
    } else {
      const iconText = new Phaser.GameObjects.Text(scene, iconX, headerY - 2, cfg.icon, {
        fontSize: "36px",
        color: "#ffffff",
        fontFamily: "'Exo 2', Arial, sans-serif",
        resolution: 2,
      }).setOrigin(0.5);
      this.add(iconText);
    }

    // Pulse the skill icon (this is what player is using)
    this.pulseTweens.push(scene.tweens.add({
      targets: iconBg,
      scale: { from: 1, to: 1.08 },
      duration: 700,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    }));

    // Skill name — to the right of icon
    const nameX = iconX + iconSize / 2 + 12;
    const nameText = new Phaser.GameObjects.Text(scene, nameX, headerY, cfg.name, {
      fontSize: "22px",
      color: "#ffffff",
      fontFamily: "'Exo 2', Arial, sans-serif",
      fontStyle: "bold",
      stroke: "#000000",
      strokeThickness: 3,
      resolution: 2,
    }).setOrigin(0, 0.5);
    this.add(nameText);

    // === Stat rows ===
    let rowY = headerY + iconSize / 2 + 22;
    const rowGap = 26;
    const rowLeft = innerLeft;

    // Mana cost row: drop icon + cost number + " маны"
    const manaIcon = new Phaser.GameObjects.Image(scene, rowLeft + MANA_ICON_SIZE / 2, rowY, ASSET_KEYS.tiles[TileKind.Mana])
      .setDisplaySize(MANA_ICON_SIZE, MANA_ICON_SIZE);
    const manaText = new Phaser.GameObjects.Text(
      scene, rowLeft + MANA_ICON_SIZE + 8, rowY,
      `${cfg.cost} маны`,
      {
        fontSize: "16px",
        color: COLORS.manaText,
        fontFamily: "'Exo 2', Arial, sans-serif",
        fontStyle: "bold",
        resolution: 2,
      },
    ).setOrigin(0, 0.5);
    this.add([manaIcon, manaText]);

    rowY += rowGap;

    // Cooldown row: hourglass + cd
    const hourglassText = new Phaser.GameObjects.Text(
      scene, rowLeft + HOURGLASS_SIZE / 2, rowY, "⏳",
      {
        fontSize: "16px",
        color: "#ffffff",
        fontFamily: "'Exo 2', Arial, sans-serif",
        resolution: 2,
      },
    ).setOrigin(0.5);
    const cdLabel = cfg.cooldown === 1 ? "ход" : cfg.cooldown < 5 ? "хода" : "ходов";
    const cdText = new Phaser.GameObjects.Text(
      scene, rowLeft + HOURGLASS_SIZE + 8, rowY,
      `${cfg.cooldown} ${cdLabel} перезарядки`,
      {
        fontSize: "16px",
        color: COLORS.cooldownText,
        fontFamily: "'Exo 2', Arial, sans-serif",
        fontStyle: "bold",
        resolution: 2,
      },
    ).setOrigin(0, 0.5);
    this.add([hourglassText, cdText]);

    rowY += rowGap + 4;

    // Description
    const descColor = cfg.heal > 0 ? COLORS.healText : cfg.damage > 0 ? COLORS.damageText : "#cfd8ff";
    const descText = new Phaser.GameObjects.Text(
      scene, cx, rowY, cfg.description,
      {
        fontSize: "17px",
        color: descColor,
        fontFamily: "'Exo 2', Arial, sans-serif",
        fontStyle: "bold",
        align: "center",
        wordWrap: { width: panelW - padX * 2 },
        resolution: 2,
      },
    ).setOrigin(0.5, 0);
    this.add(descText);

    rowY += descText.height + 18;

    // === Star rating ===
    const starSize = 18;
    const starGap = 6;
    const totalStarsW = PERK_MAX_LEVEL * starSize + (PERK_MAX_LEVEL - 1) * starGap;
    const starsStartX = cx - totalStarsW / 2 + starSize / 2;
    const lvl = Phaser.Math.Clamp(this.opts.level, 0, PERK_MAX_LEVEL);
    for (let i = 0; i < PERK_MAX_LEVEL; i++) {
      const filled = i < lvl;
      const star = new Phaser.GameObjects.Text(
        scene, starsStartX + i * (starSize + starGap), rowY,
        "★",
        {
          fontSize: `${starSize + 4}px`,
          color: filled ? "#ffd700" : "#4a3a6e",
          fontFamily: "'Exo 2', Arial, sans-serif",
          fontStyle: "bold",
          stroke: filled ? "#6b4c00" : "#000000",
          strokeThickness: filled ? 2 : 1,
          resolution: 2,
        },
      ).setOrigin(0.5, 0);
      this.add(star);
    }

    rowY += starSize + 24;

    // === Apply button (big green, centered) ===
    const btnW = panelW - padX * 2;
    const btnH = 56;
    const btnY = cy + panelH / 2 - btnH / 2 - 18;

    const applyBg = new Phaser.GameObjects.Rectangle(
      scene, cx, btnY, btnW, btnH, COLORS.applyBg, 1,
    ).setStrokeStyle(3, COLORS.applyStroke, 1).setInteractive({ useHandCursor: true });
    const applyText = new Phaser.GameObjects.Text(scene, cx, btnY, "Применить!", {
      fontSize: "22px",
      color: "#ffffff",
      fontFamily: "'Exo 2', Arial, sans-serif",
      fontStyle: "bold",
      stroke: "#0a3a18",
      strokeThickness: 3,
      resolution: 2,
    }).setOrigin(0.5);

    applyBg.on("pointerover", () => applyBg.setFillStyle(COLORS.applyBgHover, 1));
    applyBg.on("pointerout", () => applyBg.setFillStyle(COLORS.applyBg, 1));
    applyBg.on("pointerdown", (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      this.close(true);
    });
    this.add([applyBg, applyText]);

    // Subtle pulse on apply button to draw attention
    this.pulseTweens.push(scene.tweens.add({
      targets: applyBg,
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

  /** Close the overlay. confirmed=true → onConfirm, false → onCancel. */
  private close(confirmed: boolean) {
    if (this.closed) return;
    this.closed = true;
    const cb = confirmed ? this.opts.onConfirm : this.opts.onCancel;
    const onClose = this.opts.onClose;
    // Destroy first so callbacks run in clean state
    this.destroy();
    // onClose runs FIRST so scene can clean up highlights before its main callback
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
