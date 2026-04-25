import Phaser from "phaser";
import { ASSET_KEYS } from "../game/assets";
import { TileKind } from "../match3/types";

type SkillState = {
  enabled: boolean;
  ready: boolean;
  cooldown?: number;
  info?: string;
  locked?: boolean;
};

const COLORS = {
  bgIdle: 0x4a3a6e,    // Фиолетовый как в референсе
  bgReady: 0x6b4a9e,   // Ярче когда готово
  bgDisabled: 0x2a2a3e,
  bgCooldown: 0x1a1a2e, // Тёмный для кулдауна
} as const;

// Badge placement — centre of badge sits on the icon circle border at 45°
// (matches `BADGE_OFFSET = Math.round((ICON_SIZE / 2) * 0.72)` in SkillApplyOverlay).
const BADGE_BORDER_COS45 = 0.72;
// Badge size/font bumped +31% vs. the original factors (0.36 → 0.47,
// 0.17 → 0.22) so the mana cost reads as a first-class UI element at
// rest, matching the original SkillApplyOverlay treatment.
const BADGE_SIZE_FACTOR = 0.47;
const BADGE_FONT_FACTOR = 0.22;
const BADGE_FONT_MIN_PX = 13;
const BADGE_SIZE_MIN_PX = 24;

// Landing flash — split between unlock (white pulse) and upgrade (gold,
// stronger). Unlock keeps the original tuning (scale 1.25, 240ms). Upgrade
// has been intentionally amped (scale 1.4, 320ms) so the level-up landing
// reads as a meaningfully bigger event than a fresh unlock — see
// DECISIONS R-T3-2 and `.conventions/gold-standards/phaser-animation.ts §9c`.
const FLASH_SCALE = 1.25; // legacy unlock peak (used by flashIconPulse)
const UPGRADE_FLASH_SCALE_PEAK = 1.4; // upgrade peak — explicitly stronger
const FLASH_TINT_RATIO = 0.4;
const FLASH_TWEEN_RATIO = 0.45;
const UPGRADE_FLASH_TWEEN_RATIO = 0.5; // slightly slower upgrade pulse
const PULSE_FLASH_COLOR = 0xffffff; // flashIconPulse — unlock VFX (new skill)
const UPGRADE_FLASH_COLOR = 0xffd700; // flashIconUpgrade — upgrade VFX (level +1)

// Pop-in (unlock landing) — scale 0 → POP_PEAK → 1, alpha 0 → 1.
// Used by `playUnlockPopIn` to give a freshly-unlocked SkillButton an
// "appear" beat distinct from the upgrade landing. The total duration is
// split between two tween phases:
//   - PEAK phase (scale 0 → POP_PEAK + alpha 0 → 1) with Back.easeOut
//   - SETTLE phase (scale POP_PEAK → 1) with Quad.easeOut
// Ratios sum to 1.0; tuned so the snappy overshoot dominates the timing.
const UNLOCK_POP_IN_SCALE_PEAK = 1.2;
const UNLOCK_POP_IN_DURATION_MS = 280;
const UNLOCK_POP_IN_PEAK_RATIO = 0.65;
const UNLOCK_POP_IN_SETTLE_RATIO = 0.35;

export class SkillButton extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Arc;
  private iconText: Phaser.GameObjects.Text;
  private iconImage?: Phaser.GameObjects.Image;
  private costText: Phaser.GameObjects.Text;
  private manaIcon: Phaser.GameObjects.Image;
  private clickCallback: () => void;
  private isEnabled = true;
  private originalIcon: string;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    size: number,
    icon: string,
    cost: number,
    onClick: () => void,
    iconTexture?: string
  ) {
    super(scene, x, y);
    this.clickCallback = onClick;
    this.originalIcon = icon;

    // Круглый фон
    this.bg = scene.add
      .circle(0, 0, size / 2, COLORS.bgIdle, 0.95)
      .setStrokeStyle(2, 0xffffff, 0.4)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.isEnabled && this.clickCallback());

    // Эмодзи иконка по центру (скрыта если есть текстура)
    this.iconText = scene.add
      .text(0, -2, icon, {
        fontSize: "30px",
        color: "#ffffff",
        fontFamily: "'Exo 2', Arial, sans-serif",
        resolution: 2,
      })
      .setOrigin(0.5);

    // Спрайт-иконка (если передана текстура)
    if (iconTexture) {
      this.iconImage = scene.add
        .image(0, 0, iconTexture)
        .setDisplaySize(size * 0.7, size * 0.7)
        .setOrigin(0.5);
      this.iconText.setVisible(false);
    }

    // Mana cost badge — centre sits on the icon circle border at 45° (top-left
    // diagonal), same geometry as SkillApplyOverlay's badge. Fixed position is
    // independent of cost text width — costText origin(0.5, 0.5) centres the
    // number on the badge regardless of digits (30, 50, 100…).
    const iconRadius = size / 2;
    const badgeOffset = Math.round(iconRadius * BADGE_BORDER_COS45);
    const badgeSize = Math.max(BADGE_SIZE_MIN_PX, Math.round(size * BADGE_SIZE_FACTOR));
    const badgeFontSize = Math.max(BADGE_FONT_MIN_PX, Math.round(size * BADGE_FONT_FACTOR));

    this.manaIcon = scene.add
      .image(-badgeOffset, -badgeOffset, ASSET_KEYS.tiles[TileKind.Mana])
      .setDisplaySize(badgeSize, badgeSize)
      .setOrigin(0.5);

    this.costText = scene.add
      .text(-badgeOffset, -badgeOffset, `${cost}`, {
        fontSize: `${badgeFontSize}px`,
        color: "#ffffff",
        fontFamily: "'Exo 2', Arial, sans-serif",
        fontStyle: "bold",
        stroke: "#0b3a7a",
        strokeThickness: 2,
        resolution: 2,
      })
      .setOrigin(0.5);

    const children: Phaser.GameObjects.GameObject[] = [this.bg, this.iconText];
    if (this.iconImage) children.push(this.iconImage);
    children.push(this.manaIcon, this.costText);
    this.add(children);
    this.setSize(size, size);
    scene.add.existing(this);
  }

  /**
   * Возвращает мировую позицию центра иконки скилла.
   * Иконка размещена в локальной точке (0, -2) внутри Container'а, чей
   * `.x` / `.y` уже мировые. Используется как target для VFX (Task #2 RISK-3:
   * вызывать **после** repositionSkillButtons, иначе target будет промахиваться).
   */
  getIconWorldPosition(): { x: number; y: number } {
    return { x: this.x, y: this.y - 2 };
  }

  /**
   * Короткий «pop»-flash на иконке: белая вспышка + scale-pulse 1 → 1.25 → 1.
   * Используется как landing-эффект при прилёте VFX (gold trail) на skill button
   * в сценарии unlock (новый скилл).
   * Fire-and-forget — возвращает Promise, который резолвится по завершении.
   */
  flashIconPulse(durationMs = 240): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.scene) { resolve(); return; }
      const target: Phaser.GameObjects.GameObject =
        this.iconImage?.visible ? this.iconImage : this.iconText;
      // Сохраняем исходный tint (для image) — flash вернётся в исходник через clearTint.
      if (target instanceof Phaser.GameObjects.Image) {
        target.setTintFill(PULSE_FLASH_COLOR);
        this.scene.time.delayedCall(durationMs * FLASH_TINT_RATIO, () => {
          if (this.scene && target.scene) target.clearTint();
        });
      }
      // Scale-pulse — анимируем сам Container, чтобы и подложка кружка пульсировала.
      this.scene.tweens.add({
        targets: this,
        scale: { from: 1, to: FLASH_SCALE },
        duration: durationMs * FLASH_TWEEN_RATIO,
        ease: "Quad.easeOut",
        yoyo: true,
        onComplete: () => {
          if (this.scene) this.setScale(1);
          resolve();
        },
      });
    });
  }

  /**
   * Golden landing flash used when an upgrade-VFX lands on an ALREADY-unlocked
   * skill button (skill level +1). Mirrors `flashIconPulse` structure but with
   * gold tint (0xffd700) and an INTENTIONALLY stronger peak (scale 1.4 vs
   * 1.25 for unlock, 320ms vs 240ms) — the brief explicitly asks the upgrade
   * landing to outshine the unlock landing.
   *
   * The radial golden particle burst that accompanies this flash lives on the
   * caller (GameScene.burstGoldDots) — dots need to escape SkillButton's
   * bounding rect, so they're spawned on scene depth instead of inside the
   * Container. See DECISIONS R-T3-2 / phaser-animation.ts §9c.
   */
  flashIconUpgrade(durationMs = 320): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.scene) { resolve(); return; }
      const target: Phaser.GameObjects.GameObject =
        this.iconImage?.visible ? this.iconImage : this.iconText;
      if (target instanceof Phaser.GameObjects.Image) {
        target.setTintFill(UPGRADE_FLASH_COLOR);
        this.scene.time.delayedCall(durationMs * FLASH_TINT_RATIO, () => {
          if (this.scene && target.scene) target.clearTint();
        });
      }
      this.scene.tweens.add({
        targets: this,
        scale: { from: 1, to: UPGRADE_FLASH_SCALE_PEAK },
        duration: durationMs * UPGRADE_FLASH_TWEEN_RATIO,
        ease: "Quad.easeOut",
        yoyo: true,
        onComplete: () => {
          if (this.scene) this.setScale(1);
          resolve();
        },
      });
    });
  }

  /**
   * Pop-in animation for a freshly-unlocked SkillButton landing in its slot.
   * Plays scale 0 → 1.2 → 1 + alpha 0 → 1 over ~280ms with `Back.easeOut`
   * for a snappy "appear" beat. Used by GameScene's perk-select unlock path
   * INSTEAD of the white flashIconPulse — pop-in already conveys the
   * "new skill" semantic without the white tint.
   *
   * Caller is responsible for resetting `setScale(0).setAlpha(0)` BEFORE
   * the flying VFX starts so the button is invisible during transit and
   * pops in on landing.
   */
  playUnlockPopIn(durationMs = UNLOCK_POP_IN_DURATION_MS): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.scene) { resolve(); return; }
      this.scene.tweens.add({
        targets: this,
        scale: { from: 0, to: UNLOCK_POP_IN_SCALE_PEAK },
        alpha: { from: 0, to: 1 },
        duration: durationMs * UNLOCK_POP_IN_PEAK_RATIO,
        ease: "Back.easeOut",
        onComplete: () => {
          if (!this.scene) { resolve(); return; }
          this.scene.tweens.add({
            targets: this,
            scale: 1,
            duration: durationMs * UNLOCK_POP_IN_SETTLE_RATIO,
            ease: "Quad.easeOut",
            onComplete: () => {
              if (this.scene) this.setScale(1);
              resolve();
            },
          });
        },
      });
    });
  }

  /**
   * Disable the underlying pointerdown handler on the inner Arc. The public
   * click path (`bg.on("pointerdown", ...)` → `clickCallback`) is the only
   * interactive layer on this Container; the Container itself has no input
   * object (see gold standards §confirmation-overlay + logic-reviewer notes
   * on Task #2). Use this to block clicks on the button while an overlay
   * renders it in a "preview" state.
   */
  setClickDisabled() {
    this.bg.disableInteractive();
  }

  /**
   * Re-enable the underlying pointerdown handler on the inner Arc, paired
   * with `setClickDisabled`. Restores the same `{ useHandCursor: true }`
   * shape used in the constructor so the cursor stays consistent.
   */
  setClickEnabled() {
    this.bg.setInteractive({ useHandCursor: true });
  }

  applyState(state: SkillState) {
    const { enabled, ready, cooldown, info } = state;

    // Заблокирован — показать замок
    if (state.locked) {
      this.isEnabled = false;
      this.iconText.setText("🔒");
      this.iconText.setVisible(true);
      this.iconText.setFontSize(24);
      this.iconText.setY(-2);
      if (this.iconImage) this.iconImage.setVisible(false);
      this.bg.setFillStyle(COLORS.bgDisabled, 0.9);
      this.bg.setStrokeStyle(2, 0xffffff, 0.15);
      this.bg.setAlpha(0.3);
      this.iconText.setAlpha(0.4);
      this.costText.setAlpha(0);
      this.manaIcon.setAlpha(0);
      return;
    }

    // На кулдауне - показать цифру вместо иконки
    if (cooldown && cooldown > 0) {
      this.isEnabled = false;
      this.iconText.setText(cooldown.toString());
      this.iconText.setVisible(true);
      this.iconText.setFontSize(30);
      this.iconText.setY(0);
      if (this.iconImage) this.iconImage.setVisible(false);
      this.bg.setFillStyle(COLORS.bgCooldown, 0.9);
      this.bg.setStrokeStyle(2, 0xff4444, 0.5);
      this.bg.setAlpha(0.7);
      this.iconText.setAlpha(1);
      this.costText.setAlpha(0);
      this.manaIcon.setAlpha(0);
      return;
    }

    // Обычный режим
    this.isEnabled = enabled;
    if (this.iconImage) {
      this.iconImage.setVisible(true);
      this.iconText.setVisible(false);
    } else {
      this.iconText.setText(this.originalIcon);
      this.iconText.setVisible(true);
    }
    this.iconText.setFontSize(30);
    this.iconText.setY(-2);

    const alpha = enabled ? 1 : 0.4;
    const isActive = ready && enabled;
    const bgColor = !enabled ? COLORS.bgDisabled : ready ? COLORS.bgReady : COLORS.bgIdle;

    this.bg.setFillStyle(bgColor, 0.95);
    this.bg.setStrokeStyle(
      isActive ? 3 : 2,
      isActive ? 0x66aaff : 0xffffff,
      isActive ? 0.9 : enabled ? 0.6 : 0.2
    );
    this.bg.setAlpha(alpha);
    this.iconText.setAlpha(alpha);
    if (this.iconImage) this.iconImage.setAlpha(alpha);
    this.costText.setAlpha(alpha);
    this.manaIcon.setAlpha(alpha);

    if (info) {
      this.costText.setText(info);
    }
  }
}
