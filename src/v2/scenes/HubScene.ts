/**
 * HubScene — главный экран v2 «Университет Падших».
 *
 * Phase 2A — 5 primary navigation buttons + 1 secondary, vertically stacked:
 *   1. «🗺 Карта» → StoryMapScene (кампус, существующая локация)
 *   2. «👤 Персонаж» → PlayerStatsScene (статы, уровень, экипировка)
 *   3. «📖 Галерея» → CharacterGalleryScene (встреченные души)
 *   4. «⚔️ Арена» → ArenaScene (Phase 2A roguelike entry)
 *   5. «🛒 Магазин» → ShopScene (Phase 2A magazin)
 *   6. «← Назад в v1» (secondary) → setActiveMode("v1") + reload
 *
 * Layout note: 5 primary buttons stacked require compact dimensions
 * (height 52dp, gap 12dp) so the column fits the 640dp min-screen budget
 * alongside the title block, greeting + XP bar, and bottom-anchored
 * secondary button.
 *
 * Приветствие расширено уровнем: "Добро пожаловать, {name}! Уровень {level}".
 *
 * Phase 1C: под greeting добавлен thin XP-bar (220×8 dp), который показывает
 * прогресс ВНУТРИ текущего уровня (см. avoid-absolute-progress-bar.md). На
 * максимальном уровне рисуется полностью заполненный bar с подписью «МАКС».
 *
 * Layout правила (non-zoomed v2 scene):
 * — Использовать `this.cameras.main.width / height`, НЕ `GAME_WIDTH/HEIGHT`.
 * — Множить координаты/размеры/fontSize/stroke на DPR.
 * — Bottom-anchored controls респектят `SAFE_AREA.bottom`.
 *
 * RISK-7: `progressionSystem.getCurrentLevel()` вызывается ТОЛЬКО внутри
 * `create()` ПОСЛЕ `gameState.ensureLoaded()` — никогда на module level и
 * никогда в конструкторе. ProgressionSystem читает save через GameState,
 * поэтому preload-порядок обязателен.
 *
 * v2-isolation: импорты только из `src/v2/*` + `src/game/config` (DPR/SAFE_AREA)
 * + `src/game/version` (setActiveMode). НИКАКИХ импортов из `src/scenes/*`,
 * `src/match3/*`, `src/ui/*` — это нарушит границу.
 */

import Phaser from "phaser";
import { DPR, SAFE_AREA } from "../../game/config";
import { setActiveMode } from "../../game/version";
import { gameState } from "../core/GameState";
import { sceneRouter } from "../core/SceneRouter";
import { progressionSystem } from "../systems/ProgressionSystem";
import { createPrimaryButton, createSecondaryButton, createTitle, createSubtitle } from "../ui/SceneChrome";
import { V2_COLORS, V2_FONTS } from "../ui/theme";

const PRIMARY_BUTTON_HEIGHT = 52;
const PRIMARY_BUTTON_GAP = 12;

// Phase 1C XP bar — thin progress strip under the greeting. Reuses the
// PlayerStatsScene colour palette for visual consistency. Width is narrower
// (220 vs 260) since this is a glanceable summary, not the full breakdown.
const XP_BAR_WIDTH = 220;
const XP_BAR_HEIGHT = 8;
const XP_BAR_BG_COLOR = 0x222244;
const XP_BAR_FILL_COLOR = 0x6e4ac8;
const XP_BAR_STROKE_COLOR = 0xe6c068;
const XP_BAR_LABEL_COLOR = "#d4b8e8";
const XP_BAR_Y = 210;
const XP_LABEL_FONT_SIZE = 11;
const XP_LABEL_GAP = 4;

export class HubScene extends Phaser.Scene {
  constructor() {
    super("HubScene");
  }

  /**
   * Lazy-load v2-only assets the first time HubScene starts. Phaser's scene
   * loader natively handles the queue → start → complete cycle and blocks
   * `create()` until everything finishes. Subsequent navigations skip the
   * load (textures stay in cache for the rest of the session).
   *
   * v1 users never reach this scene, so v2 assets never enter their bundle
   * or download path.
   */
  preload() {
    if (!this.textures.exists("chain_iron")) {
      this.load.image("chain_iron", "v2/chains/chain_iron.png");
    }
    if (!this.textures.exists("location_atrium")) {
      this.load.image("location_atrium", "v2/locations/location_atrium.jpg");
    }
  }

  create() {
    const camW = this.cameras.main.width;
    const camH = this.cameras.main.height;
    const cx = camW / 2;
    const d = DPR;

    // RISK-7: ensureLoaded() must run BEFORE progressionSystem.getCurrentLevel().
    // ProgressionSystem reads `gameState.get().player.level`, and `.get()`
    // throws if SaveManager has not been loaded. Keep these two lines adjacent
    // and never hoist the getCurrentLevel() call above ensureLoaded().
    const save = gameState.ensureLoaded();
    const level = progressionSystem.getCurrentLevel();

    // BootScene starts HubScene via `scene.start` (bypassing sceneRouter for
    // the v1↔v2 mode switch), so the navigation stack arrives empty. Register
    // HubScene as the root here so child scenes' back buttons (PlayerStats,
    // CharacterGallery, StoryMap) can pop back to us. Idempotent: when a child
    // pops back to Hub, this re-creates the single-entry stack from scratch.
    sceneRouter.setRoot("HubScene");

    this.add.rectangle(0, 0, camW, camH, V2_COLORS.bg).setOrigin(0);

    createTitle(this, cx, 90 * d + SAFE_AREA.top * d, "Университет Падших", {
      fontDp: 34,
      strokeDp: 4,
    });

    createSubtitle(this, cx, 134 * d + SAFE_AREA.top * d, "v2 · β");

    this.add
      .text(
        cx,
        184 * d + SAFE_AREA.top * d,
        `Добро пожаловать, ${save.player.name}! Уровень ${level}`,
        {
          fontSize: `${20 * d}px`,
          color: V2_COLORS.bodyColor,
          fontFamily: V2_FONTS.primary,
        },
      )
      .setOrigin(0.5);

    this.renderXpBar(cx, XP_BAR_Y * d + SAFE_AREA.top * d, save.player.xp, level);

    // Phase 2A: 5 primary buttons stacked vertically. Reduced height/gap so
    // the stack fits between greeting and bottom-anchored secondary on min screen.
    const buttonStep = (PRIMARY_BUTTON_HEIGHT + PRIMARY_BUTTON_GAP) * d;
    const stackCenterY = camH * 0.52;
    const firstY = stackCenterY - buttonStep * 2;

    const btnOpts = { widthDp: 300, heightDp: PRIMARY_BUTTON_HEIGHT, fontDp: 24 };
    createPrimaryButton(this, cx, firstY, "🗺 Карта", () => {
      sceneRouter.push(this, "StoryMapScene");
    }, btnOpts);
    createPrimaryButton(this, cx, firstY + buttonStep, "👤 Персонаж", () => {
      sceneRouter.push(this, "PlayerStatsScene");
    }, btnOpts);
    createPrimaryButton(this, cx, firstY + buttonStep * 2, "📖 Галерея", () => {
      sceneRouter.push(this, "CharacterGalleryScene");
    }, btnOpts);
    createPrimaryButton(this, cx, firstY + buttonStep * 3, "⚔️ Арена", () => {
      sceneRouter.push(this, "ArenaScene");
    }, btnOpts);
    createPrimaryButton(this, cx, firstY + buttonStep * 4, "🛒 Магазин", () => {
      sceneRouter.push(this, "ShopScene");
    }, btnOpts);

    const secondaryY = camH - 80 * d - SAFE_AREA.bottom * d;
    createSecondaryButton(this, cx, secondaryY, "← Назад в v1", () => {
      setActiveMode("v1");
      window.location.reload();
    });
  }

  /**
   * Phase 1C XP bar — glanceable summary of within-level progress under the
   * greeting. Uses `progressionSystem.getLevelEntryXp()` as the baseline so
   * the fill ratio measures progress *inside* the current level — NOT against
   * the absolute zero baseline (`.conventions/anti-patterns/avoid-absolute-progress-bar.md`).
   *
   * Fallback: shows "МАКС" label and a full bar if xpToNext === 0 (defensive
   * only — level cap was removed, so xpToNext is always positive in practice).
   */
  private renderXpBar(cx: number, y: number, playerXp: number, level: number): void {
    const d = DPR;
    const barWidth = XP_BAR_WIDTH * d;
    const barHeight = XP_BAR_HEIGHT * d;
    const barX = cx - barWidth / 2;

    const barBg = this.add
      .rectangle(barX, y, barWidth, barHeight, XP_BAR_BG_COLOR, 0.9)
      .setOrigin(0);
    barBg.setStrokeStyle(1 * d, XP_BAR_STROKE_COLOR, 0.6);

    const xpToNext = progressionSystem.getXpToNextLevel();
    let fillRatio = 1;
    let label = "МАКС";
    if (xpToNext > 0) {
      const levelEntryXp = progressionSystem.getLevelEntryXp();
      const levelProgress = Math.max(0, playerXp - levelEntryXp);
      const levelSpan = levelProgress + xpToNext;
      fillRatio =
        levelSpan > 0 ? Math.max(0, Math.min(1, levelProgress / levelSpan)) : 0;
      label = `${levelProgress} / ${levelSpan} XP до ${level + 1} уровня`;
    }

    if (fillRatio > 0) {
      const fillWidth = Math.max(1, barWidth * fillRatio);
      this.add
        .rectangle(barX, y, fillWidth, barHeight, XP_BAR_FILL_COLOR, 0.95)
        .setOrigin(0);
    }

    this.add
      .text(cx, y + barHeight + XP_LABEL_GAP * d, label, {
        fontSize: `${XP_LABEL_FONT_SIZE * d}px`,
        color: XP_BAR_LABEL_COLOR,
        fontFamily: V2_FONTS.primary,
        fontStyle: "italic",
      })
      .setOrigin(0.5, 0);
  }

}
