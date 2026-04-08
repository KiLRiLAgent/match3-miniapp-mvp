/**
 * HubScene — главный экран v2 «Университет Падших».
 *
 * Phase 1B: расширен до 4 кнопок навигации:
 *   1. «🗺 Карта» → StoryMapScene (кампус, существующая локация)
 *   2. «👤 Персонаж» → PlayerStatsScene (статы, уровень, экипировка)
 *   3. «📖 Галерея» → CharacterGalleryScene (встреченные души)
 *   4. «← Назад в v1» → setActiveMode("v1") + reload
 *
 * Приветствие расширено уровнем: "Добро пожаловать, {name}! Уровень {level}".
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

const BG_COLOR = 0x1a0f2e;
const TITLE_COLOR = "#e6c068";
const SUBTITLE_COLOR = "#9f7fc7";
const GREETING_COLOR = "#d4b8e8";
const FONT = "'Exo 2', Arial, sans-serif";

const PRIMARY_BG = 0x4a2d6e;
const PRIMARY_BG_HOVER = 0x6a4a90;
const PRIMARY_STROKE = 0xe6c068;
const PRIMARY_TEXT = "#f4e4c1";
const PRIMARY_TEXT_HOVER = "#ffffff";

const SECONDARY_BG = 0x2a1845;
const SECONDARY_BG_HOVER = 0x3a2358;
const SECONDARY_STROKE = 0x9f7fc7;
const SECONDARY_TEXT = "#b8a8d0";
const SECONDARY_TEXT_HOVER = "#e6c068";

const PRIMARY_BUTTON_WIDTH = 300;
const PRIMARY_BUTTON_HEIGHT = 64;
const PRIMARY_BUTTON_GAP = 18;
const SECONDARY_BUTTON_WIDTH = 260;
const SECONDARY_BUTTON_HEIGHT = 52;

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

    this.add.rectangle(0, 0, camW, camH, BG_COLOR).setOrigin(0);

    this.add
      .text(cx, 90 * d + SAFE_AREA.top * d, "Университет Падших", {
        fontSize: `${34 * d}px`,
        color: TITLE_COLOR,
        fontFamily: FONT,
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 4 * d,
      })
      .setOrigin(0.5);

    this.add
      .text(cx, 134 * d + SAFE_AREA.top * d, "v2 · β", {
        fontSize: `${16 * d}px`,
        color: SUBTITLE_COLOR,
        fontFamily: FONT,
        fontStyle: "italic",
      })
      .setOrigin(0.5);

    this.add
      .text(
        cx,
        184 * d + SAFE_AREA.top * d,
        `Добро пожаловать, ${save.player.name}! Уровень ${level}`,
        {
          fontSize: `${20 * d}px`,
          color: GREETING_COLOR,
          fontFamily: FONT,
        },
      )
      .setOrigin(0.5);

    // Primary buttons stacked vertically, centered between greeting and
    // bottom-anchored "back to v1" button. Step = height + gap.
    const buttonStep = (PRIMARY_BUTTON_HEIGHT + PRIMARY_BUTTON_GAP) * d;
    const stackCenterY = camH * 0.55;
    const firstY = stackCenterY - buttonStep;

    this.createPrimaryButton(cx, firstY, "🗺 Карта", () => {
      sceneRouter.push(this, "StoryMapScene");
    });
    this.createPrimaryButton(cx, firstY + buttonStep, "👤 Персонаж", () => {
      sceneRouter.push(this, "PlayerStatsScene");
    });
    this.createPrimaryButton(cx, firstY + buttonStep * 2, "📖 Галерея", () => {
      sceneRouter.push(this, "CharacterGalleryScene");
    });

    const secondaryY = camH - 80 * d - SAFE_AREA.bottom * d;
    this.createSecondaryButton(cx, secondaryY, "← Назад в v1", () => {
      setActiveMode("v1");
      window.location.reload();
    });
  }

  private createPrimaryButton(
    x: number,
    y: number,
    label: string,
    onClick: () => void,
  ): void {
    const d = DPR;
    const width = PRIMARY_BUTTON_WIDTH * d;
    const height = PRIMARY_BUTTON_HEIGHT * d;

    const bg = this.add
      .rectangle(x, y, width, height, PRIMARY_BG, 0.95)
      .setStrokeStyle(3 * d, PRIMARY_STROKE)
      .setInteractive({ useHandCursor: true });

    const text = this.add
      .text(x, y, label, {
        fontSize: `${24 * d}px`,
        color: PRIMARY_TEXT,
        fontFamily: FONT,
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    bg.on("pointerover", () => {
      bg.setFillStyle(PRIMARY_BG_HOVER, 1);
      text.setColor(PRIMARY_TEXT_HOVER);
    });
    bg.on("pointerout", () => {
      bg.setFillStyle(PRIMARY_BG, 0.95);
      text.setColor(PRIMARY_TEXT);
    });
    bg.on("pointerdown", onClick);
  }

  private createSecondaryButton(
    x: number,
    y: number,
    label: string,
    onClick: () => void,
  ): void {
    const d = DPR;
    const width = SECONDARY_BUTTON_WIDTH * d;
    const height = SECONDARY_BUTTON_HEIGHT * d;

    const bg = this.add
      .rectangle(x, y, width, height, SECONDARY_BG, 0.95)
      .setStrokeStyle(2 * d, SECONDARY_STROKE)
      .setInteractive({ useHandCursor: true });

    const text = this.add
      .text(x, y, label, {
        fontSize: `${18 * d}px`,
        color: SECONDARY_TEXT,
        fontFamily: FONT,
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    bg.on("pointerover", () => {
      bg.setFillStyle(SECONDARY_BG_HOVER, 1);
      text.setColor(SECONDARY_TEXT_HOVER);
    });
    bg.on("pointerout", () => {
      bg.setFillStyle(SECONDARY_BG, 0.95);
      text.setColor(SECONDARY_TEXT);
    });
    bg.on("pointerdown", onClick);
  }
}
