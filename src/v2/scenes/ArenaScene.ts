/**
 * ArenaScene — entry/menu screen for Phase 2A arena mode.
 *
 * Layout:
 *   Title "⚔️ Арена" + subtitle
 *   Stats block: best floor, runs completed/failed
 *   CTA:
 *     - No active run → «Начать новый run» (primary)
 *     - Active run    → «Продолжить run» (primary) + «Прекратить run» (secondary)
 *   Toast banner if init data flags `runJustCompleted` / `runJustFailed` (R13).
 *   Back button «← В Hub» pops to HubScene.
 *
 * Navigation contract:
 *   HubScene pushes us via `sceneRouter.push`. Transition to ArenaRunScene is
 *   `sceneRouter.replace` so Back from ArenaRunScene pops directly to Hub
 *   (Arena menu is not a meaningful back-stop mid-run).
 *
 * RISK-7: `gameState.ensureLoaded()` runs before any save read (mirrors HubScene
 * precedent). `arenaSystem.getActiveRun()` reads gameState internally.
 *
 * R14 v2-isolation: imports only from `src/v2/*` + `src/game/config` (DPR/SAFE_AREA).
 */

import Phaser from "phaser";
import { DPR, SAFE_AREA } from "../../game/config";
import { gameState } from "../core/GameState";
import { sceneRouter } from "../core/SceneRouter";
import { arenaSystem } from "../systems/ArenaSystem";
import { toast } from "../ui/Toast";

const BG_COLOR = 0x1a0f2e;
const TITLE_COLOR = "#e6c068";
const SUBTITLE_COLOR = "#9f7fc7";
const STAT_LABEL_COLOR = "#d4b8e8";
const STAT_VALUE_COLOR = "#f4e4c1";
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
const SECONDARY_BUTTON_WIDTH = 260;
const SECONDARY_BUTTON_HEIGHT = 52;
const BACK_BUTTON_WIDTH = 180;
const BACK_BUTTON_HEIGHT = 44;

interface ArenaSceneData {
  runJustCompleted?: boolean;
  runJustFailed?: boolean;
}

export class ArenaScene extends Phaser.Scene {
  private sceneData: ArenaSceneData = {};

  constructor() {
    super("ArenaScene");
  }

  init(data?: ArenaSceneData): void {
    this.sceneData = data ?? {};
  }

  create(): void {
    const camW = this.cameras.main.width;
    const camH = this.cameras.main.height;
    const cx = camW / 2;
    const d = DPR;

    gameState.ensureLoaded();
    const arena = gameState.get().arena;
    const activeRun = arenaSystem.getActiveRun();

    this.add.rectangle(0, 0, camW, camH, BG_COLOR).setOrigin(0);

    this.add
      .text(cx, 90 * d + SAFE_AREA.top * d, "⚔️ Арена", {
        fontSize: `${34 * d}px`,
        color: TITLE_COLOR,
        fontFamily: FONT,
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 4 * d,
      })
      .setOrigin(0.5);

    this.add
      .text(cx, 134 * d + SAFE_AREA.top * d, "Испытай свою силу", {
        fontSize: `${16 * d}px`,
        color: SUBTITLE_COLOR,
        fontFamily: FONT,
        fontStyle: "italic",
      })
      .setOrigin(0.5);

    // Stats block
    const statsY = 210 * d + SAFE_AREA.top * d;
    this.add
      .text(cx, statsY, `Лучший этаж: ${arena.bestScore}/6`, {
        fontSize: `${20 * d}px`,
        color: STAT_VALUE_COLOR,
        fontFamily: FONT,
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    this.add
      .text(
        cx,
        statsY + 34 * d,
        `Завершено: ${arena.totalRunsCompleted}  ·  Поражений: ${arena.totalRunsFailed}`,
        {
          fontSize: `${14 * d}px`,
          color: STAT_LABEL_COLOR,
          fontFamily: FONT,
        },
      )
      .setOrigin(0.5);

    // CTA buttons — centered vertically in the lower half.
    const ctaY = camH * 0.58;
    if (activeRun) {
      this.add
        .text(cx, ctaY - 60 * d, `Активный run: этаж ${activeRun.floor}/6`, {
          fontSize: `${15 * d}px`,
          color: SUBTITLE_COLOR,
          fontFamily: FONT,
          fontStyle: "italic",
        })
        .setOrigin(0.5);
      this.createPrimaryButton(cx, ctaY, "Продолжить run", () => {
        sceneRouter.replace(this, "ArenaRunScene");
      });
      this.createSecondaryButton(cx, ctaY + 78 * d, "Прекратить run", () => {
        arenaSystem.abortRun();
        this.scene.restart();
      });
    } else {
      this.createPrimaryButton(cx, ctaY, "Начать новый run", () => {
        arenaSystem.startNewRun();
        sceneRouter.replace(this, "ArenaRunScene");
      });
    }

    // Result toast when returning from completed/failed run (R13).
    if (this.sceneData.runJustCompleted) {
      toast.show(this, {
        message: `Победа! Лучший этаж: ${arena.bestScore}/6`,
        type: "info",
        durationMs: 5000,
      });
    } else if (this.sceneData.runJustFailed) {
      toast.show(this, {
        message: "Поражение. Накопленные награды сохранены.",
        type: "warn",
        durationMs: 5000,
      });
    }

    // Back button — pops stack (Hub pushed us, so pop returns to Hub).
    const backY = camH - 80 * d - SAFE_AREA.bottom * d;
    this.createButton(
      cx,
      backY,
      BACK_BUTTON_WIDTH,
      BACK_BUTTON_HEIGHT,
      18,
      "← В Hub",
      SECONDARY_BG,
      SECONDARY_BG_HOVER,
      SECONDARY_STROKE,
      SECONDARY_TEXT,
      SECONDARY_TEXT_HOVER,
      2,
      () => sceneRouter.pop(this),
    );
  }

  private createPrimaryButton(
    x: number,
    y: number,
    label: string,
    onClick: () => void,
  ): void {
    this.createButton(
      x,
      y,
      PRIMARY_BUTTON_WIDTH,
      PRIMARY_BUTTON_HEIGHT,
      24,
      label,
      PRIMARY_BG,
      PRIMARY_BG_HOVER,
      PRIMARY_STROKE,
      PRIMARY_TEXT,
      PRIMARY_TEXT_HOVER,
      3,
      onClick,
    );
  }

  private createSecondaryButton(
    x: number,
    y: number,
    label: string,
    onClick: () => void,
  ): void {
    this.createButton(
      x,
      y,
      SECONDARY_BUTTON_WIDTH,
      SECONDARY_BUTTON_HEIGHT,
      18,
      label,
      SECONDARY_BG,
      SECONDARY_BG_HOVER,
      SECONDARY_STROKE,
      SECONDARY_TEXT,
      SECONDARY_TEXT_HOVER,
      2,
      onClick,
    );
  }

  /**
   * Shared button factory — merges Primary / Secondary / Back creation into
   * one body to keep Phase 2A bundle lean. Task #18 will extract this into
   * `src/v2/ui/SceneChrome.ts` and delete the inline version.
   */
  private createButton(
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
  ): void {
    const d = DPR;
    const bg = this.add
      .rectangle(x, y, widthDp * d, heightDp * d, bgColor, 0.95)
      .setStrokeStyle(strokeDp * d, strokeColor)
      .setInteractive({ useHandCursor: true });

    const text = this.add
      .text(x, y, label, {
        fontSize: `${fontDp * d}px`,
        color: textColor,
        fontFamily: FONT,
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
  }
}
