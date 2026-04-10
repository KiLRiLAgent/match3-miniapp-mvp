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
import {
  createPrimaryButton,
  createSecondaryButton,
  createBackButton,
  createTitle,
  createSubtitle,
} from "../ui/SceneChrome";
import { toast } from "../ui/Toast";
import { V2_COLORS, V2_FONTS } from "../ui/theme";

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

    this.add.rectangle(0, 0, camW, camH, V2_COLORS.bg).setOrigin(0);

    createTitle(this, cx, 90 * d + SAFE_AREA.top * d, "⚔️ Арена", {
      fontDp: 34,
      strokeDp: 4,
    });

    createSubtitle(this, cx, 134 * d + SAFE_AREA.top * d, "Испытай свою силу");

    // Stats block
    const statsY = 210 * d + SAFE_AREA.top * d;
    this.add
      .text(cx, statsY, `Лучший этаж: ${arena.bestScore}/6`, {
        fontSize: `${20 * d}px`,
        color: V2_COLORS.valueColor,
        fontFamily: V2_FONTS.primary,
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
          color: V2_COLORS.bodyColor,
          fontFamily: V2_FONTS.primary,
        },
      )
      .setOrigin(0.5);

    // CTA buttons — centered vertically in the lower half.
    const ctaY = camH * 0.58;
    if (activeRun) {
      this.add
        .text(cx, ctaY - 60 * d, `Активный run: этаж ${activeRun.floor}/6`, {
          fontSize: `${15 * d}px`,
          color: V2_COLORS.subtitleColor,
          fontFamily: V2_FONTS.primary,
          fontStyle: "italic",
        })
        .setOrigin(0.5);
      createPrimaryButton(this, cx, ctaY, "Продолжить run", () => {
        sceneRouter.replace(this, "ArenaRunScene");
      });
      createSecondaryButton(this, cx, ctaY + 78 * d, "Прекратить run", () => {
        arenaSystem.abortRun();
        // Pass runJustFailed so the restarted scene shows the failure toast,
        // matching PostCombat-routed defeat UX (architect-frontend nitpick #12).
        this.scene.restart({ runJustFailed: true });
      });
    } else {
      createPrimaryButton(this, cx, ctaY, "Начать новый run", () => {
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
    createBackButton(this, cx, backY, "← В Hub", () => sceneRouter.pop(this), {
      heightDp: 44,
    });
  }
}
