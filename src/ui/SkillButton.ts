import Phaser from "phaser";
import { TileKind } from "../match3/types";
import { ASSET_KEYS } from "../game/assets";

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

    // Стоимость — бейдж-капля поверх кнопки (top-left, как на карточках перков)
    const badgeOffset = Math.round(size * 0.28);
    const badgeSize = Math.max(18, Math.round(size * 0.38));
    const badgeFontSize = Math.max(10, Math.round(size * 0.19));

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

  private repositionManaIcon() {
    // Badge is at fixed position, no repositioning needed
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
   * Короткий «pop»-flash на иконке: белая вспышка + scale-pulse 1 → 1.3 → 1.
   * Используется как landing-эффект при прилёте VFX (gold trail) на skill button.
   * Fire-and-forget — возвращает Promise, который резолвится по завершении.
   */
  flashIconPulse(durationMs = 240): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.scene) { resolve(); return; }
      const target: Phaser.GameObjects.GameObject =
        this.iconImage?.visible ? this.iconImage : this.iconText;
      // Сохраняем исходный tint (для image) — flash вернётся в исходник через clearTint.
      if (target instanceof Phaser.GameObjects.Image) {
        target.setTintFill(0xffffff);
        this.scene.time.delayedCall(durationMs * 0.4, () => {
          if (this.scene && target.scene) target.clearTint();
        });
      }
      // Scale-pulse — анимируем сам Container, чтобы и подложка кружка пульсировала.
      this.scene.tweens.add({
        targets: this,
        scale: { from: 1, to: 1.25 },
        duration: durationMs * 0.45,
        ease: "Quad.easeOut",
        yoyo: true,
        onComplete: () => {
          if (this.scene) this.setScale(1);
          resolve();
        },
      });
    });
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
      this.repositionManaIcon();
    }
  }
}
