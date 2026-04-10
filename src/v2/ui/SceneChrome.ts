/**
 * SceneChrome — shared button and title factories for v2 scenes.
 *
 * Extracted from HubScene / ArenaScene / ShopScene / PlayerStatsScene /
 * CharacterGalleryScene / StoryMapScene / LocationScene which all duplicated
 * 20-30 lines of identical button-creation code.
 *
 * Phase 2B R2B-2 dedup (task #1). All coordinates/sizes in **dp** — callers
 * pass logical units, SceneChrome multiplies by DPR internally (per
 * `.conventions/gold-standards/scene-coordinates.md`).
 *
 * Returns raw GameObjects (not Containers) so callers can add them to any
 * layer, including scrollable rootLayer Containers.
 */

import Phaser from "phaser";
import { DPR } from "../../game/config";
import { V2_COLORS, V2_FONTS, V2_SPACING } from "./theme";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ButtonResult {
  bg: Phaser.GameObjects.Rectangle;
  text: Phaser.GameObjects.Text;
}

// ─── Buttons ─────────────────────────────────────────────────────────────────

/**
 * Generic button factory. All v2 button variants (primary, secondary, back)
 * route through this single body. Returns `{ bg, text }` so callers can add
 * them to a Container or set depth individually.
 */
function createButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  widthDp: number,
  heightDp: number,
  fontDp: number,
  label: string,
  bgColor: number,
  bgHover: number,
  strokeColor: number,
  textColor: string,
  textHover: string,
  strokeDp: number,
  onClick: () => void,
): ButtonResult {
  const d = DPR;
  const bg = scene.add
    .rectangle(x, y, widthDp * d, heightDp * d, bgColor, 0.95)
    .setStrokeStyle(strokeDp * d, strokeColor)
    .setInteractive({ useHandCursor: true });

  const text = scene.add
    .text(x, y, label, {
      fontSize: `${fontDp * d}px`,
      color: textColor,
      fontFamily: V2_FONTS.primary,
      fontStyle: "bold",
    })
    .setOrigin(0.5);

  bg.on("pointerover", () => {
    bg.setFillStyle(bgHover, 1);
    text.setColor(textHover);
  });
  bg.on("pointerout", () => {
    bg.setFillStyle(bgColor, 0.95);
    text.setColor(textColor);
  });
  bg.on("pointerdown", onClick);

  return { bg, text };
}

/**
 * Gold-accented primary button — used for main CTA actions.
 *
 * Default size: 300 x 64 dp, font 24 dp.
 * Override `widthDp` / `heightDp` / `fontDp` via options.
 */
export function createPrimaryButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
  opts?: { widthDp?: number; heightDp?: number; fontDp?: number },
): ButtonResult {
  return createButton(
    scene,
    x,
    y,
    opts?.widthDp ?? V2_SPACING.primaryBtnWidth,
    opts?.heightDp ?? V2_SPACING.primaryBtnHeight,
    opts?.fontDp ?? 24,
    label,
    V2_COLORS.primaryBg,
    V2_COLORS.primaryBgHover,
    V2_COLORS.primaryStroke,
    V2_COLORS.primaryText,
    V2_COLORS.primaryTextHover,
    3,
    onClick,
  );
}

/**
 * Muted purple secondary button — used for secondary actions like "Abort run".
 *
 * Default size: 260 x 52 dp, font 18 dp.
 */
export function createSecondaryButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
  opts?: { widthDp?: number; heightDp?: number; fontDp?: number },
): ButtonResult {
  return createButton(
    scene,
    x,
    y,
    opts?.widthDp ?? V2_SPACING.secondaryBtnWidth,
    opts?.heightDp ?? V2_SPACING.secondaryBtnHeight,
    opts?.fontDp ?? 18,
    label,
    V2_COLORS.secondaryBg,
    V2_COLORS.secondaryBgHover,
    V2_COLORS.secondaryStroke,
    V2_COLORS.secondaryText,
    V2_COLORS.secondaryTextHover,
    2,
    onClick,
  );
}

/**
 * Back / navigation button — small muted button typically placed at the bottom
 * of a scene. Same palette as secondary, smaller defaults (180 x 48 dp).
 */
export function createBackButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
  opts?: { widthDp?: number; heightDp?: number; fontDp?: number },
): ButtonResult {
  return createButton(
    scene,
    x,
    y,
    opts?.widthDp ?? V2_SPACING.backBtnWidth,
    opts?.heightDp ?? V2_SPACING.backBtnHeight,
    opts?.fontDp ?? 18,
    label,
    V2_COLORS.secondaryBg,
    V2_COLORS.secondaryBgHover,
    V2_COLORS.secondaryStroke,
    V2_COLORS.secondaryText,
    V2_COLORS.secondaryTextHover,
    2,
    onClick,
  );
}

// ─── Text helpers ────────────────────────────────────────────────────────────

/**
 * Scene title — gold, bold, with black stroke. Mirrors the pattern used
 * in every v2 scene header.
 */
export function createTitle(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  opts?: { fontDp?: number; strokeDp?: number },
): Phaser.GameObjects.Text {
  const d = DPR;
  return scene.add
    .text(x, y, text, {
      fontSize: `${(opts?.fontDp ?? 30) * d}px`,
      color: V2_COLORS.titleColor,
      fontFamily: V2_FONTS.primary,
      fontStyle: "bold",
      stroke: "#000000",
      strokeThickness: (opts?.strokeDp ?? 3) * d,
    })
    .setOrigin(0.5);
}

/**
 * Scene subtitle — muted purple, italic. Placed below the title in most scenes.
 */
export function createSubtitle(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  opts?: { fontDp?: number; color?: string },
): Phaser.GameObjects.Text {
  const d = DPR;
  return scene.add
    .text(x, y, text, {
      fontSize: `${(opts?.fontDp ?? 16) * d}px`,
      color: opts?.color ?? V2_COLORS.subtitleColor,
      fontFamily: V2_FONTS.primary,
      fontStyle: "italic",
    })
    .setOrigin(0.5);
}
