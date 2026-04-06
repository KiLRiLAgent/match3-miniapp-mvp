/**
 * CombatBridgeScene — wraps v1 GameScene as a "combat module" inside v2 story flow.
 *
 * Flow:
 *   1. init(data) captures encounterId + post-battle node ids + dialogueId (instance fields, safe)
 *   2. create() builds CombatContext via EncounterBuilder, launches GameScene with
 *      encounterContext + onCombatComplete callback (CLOSURE captures encounterDef + context)
 *   3. handleCombatComplete fires from GameScene's emitV2CombatResult:
 *      a. scene.stop("GameScene") — RISK-2 caveat 5: BEFORE wake
 *      b. scene.wake() — resume self
 *      c. delayedCall(0, ...) — RISK-2 caveat 3: defer to next tick
 *      d. encounterBuilder.applyResult — single point of SaveData mutation
 *      e. gameState.flush() — MITIGATION-3: bypass 2s autosave debounce
 *      f. sceneRouter.replace → PostCombatScene
 *
 * MITIGATION-2: encounterDef and context use closure capture (NOT instance fields).
 * Robust against future refactors that might add scene.restart() or change Phaser
 * sleep/wake semantics. onVictoryNode/onDefeatNode/returnToDialogueId ARE safe as
 * instance fields — they're set in init and never need to survive cross-scene transitions.
 */

import Phaser from "phaser";
import { sceneRouter } from "../core/SceneRouter";
import { gameState } from "../core/GameState";
import { encounterBuilder } from "../systems/EncounterBuilder";
import { ENCOUNTERS } from "../content/encounters";
import type {
  CombatContext,
  CombatResult,
  EncounterDef,
  GameSceneInitData,
  RawCombatResult,
} from "../content/types";

const TRANSITION_FADE_DURATION = 300;
const TRANSITION_HOLD_DURATION = 400;
const TRANSITION_TEXT_COLOR = "#e6c068";
const TRANSITION_TEXT_FONT_SIZE = "28px";
const TRANSITION_FONT = "'Exo 2', Arial, sans-serif";
const TRANSITION_BG_COLOR = 0x000000;

interface CombatBridgeData {
  encounterId: string;
  onVictoryNode: string;
  onDefeatNode: string;
  returnToDialogueId: string;
}

export class CombatBridgeScene extends Phaser.Scene {
  // Instance fields safe for non-closure data (set in init, used in handleCombatComplete via this).
  // Per MITIGATION-2: encounterDef and context are NOT stored here — closure capture instead.
  private encounterId!: string;
  private onVictoryNode!: string;
  private onDefeatNode!: string;
  private returnToDialogueId!: string;

  constructor() {
    super("CombatBridgeScene");
  }

  init(data: CombatBridgeData) {
    this.encounterId = data.encounterId;
    this.onVictoryNode = data.onVictoryNode;
    this.onDefeatNode = data.onDefeatNode;
    this.returnToDialogueId = data.returnToDialogueId;
  }

  create() {
    const encounterDef = ENCOUNTERS[this.encounterId];
    if (!encounterDef) {
      console.error(`CombatBridgeScene: encounter ${this.encounterId} not found`);
      sceneRouter.pop(this);
      return;
    }

    // CLOSURE CAPTURE — encounterDef and context live in the callback closure
    // (more robust than instance fields against future refactors per MITIGATION-2)
    const context: CombatContext = encounterBuilder.build(encounterDef);

    this.showTransitionOverlay(() => {
      const initData: GameSceneInitData = {
        encounterContext: context,
        onCombatComplete: (raw: RawCombatResult) => {
          // encounterDef + context + this captured in closure (NOT instance fields)
          this.handleCombatComplete(raw, encounterDef, context);
        },
      };
      this.scene.launch("GameScene", initData);
      // After launch, sleep self — Phaser preserves this scene's instance state across sleep/wake
      this.scene.sleep();
    });
  }

  /**
   * Handler invoked from GameScene's onCombatComplete callback closure.
   * Receives encounterDef and context via closure capture (MITIGATION-2).
   *
   * Order is critical:
   *   1. scene.stop("GameScene") — RISK-2 caveat 5: BEFORE wake
   *   2. scene.wake() — resumes this scene
   *   3. delayedCall(0, ...) — RISK-2 caveat 3: defers next ops to next tick
   *   4. encounterBuilder.applyResult — mutates SaveData
   *   5. gameState.flush() — MITIGATION-3: bypass 2s debounce
   *   6. sceneRouter.replace to PostCombatScene
   */
  private handleCombatComplete(
    raw: RawCombatResult,
    encounterDef: EncounterDef,
    context: CombatContext,
  ): void {
    // RISK-2 caveat 5: stop GameScene BEFORE wake — otherwise next encounter's launch
    // hits SceneManager.start() shutdown branch and breaks the second fight.
    this.scene.stop("GameScene");
    this.scene.wake();

    // RISK-2 caveat 3: defer router push via delayedCall(0) to ensure wake is processed
    // before the next ops (Phaser scene queue runs on next update tick).
    this.time.delayedCall(0, () => {
      const appliedDelta = encounterBuilder.applyResult(raw, encounterDef);

      // MITIGATION-3 / RISK-9: explicit flush bypasses 2-second autosave debounce.
      // beforeunload is unreliable on mobile Telegram WebView (iOS WKWebView doesn't
      // fire on swipe-away). Without this, force-quit immediately after victory would
      // lose XP/gold/relationship rewards.
      gameState.flush();

      const enriched: CombatResult = {
        ...raw,
        appliedDelta,
        xpGained: raw.victory ? encounterDef.rewards.xp : 0,
        goldGained: raw.victory ? encounterDef.rewards.gold : 0,
      };

      sceneRouter.replace(this, "PostCombatScene", {
        result: enriched,
        encounterContext: context,
        onVictoryNode: this.onVictoryNode,
        onDefeatNode: this.onDefeatNode,
        returnToDialogueId: this.returnToDialogueId,
      });
    });
  }

  private showTransitionOverlay(onDone: () => void) {
    const camW = this.cameras.main.width;
    const camH = this.cameras.main.height;
    this.add.rectangle(0, 0, camW, camH, TRANSITION_BG_COLOR, 1).setOrigin(0);
    const text = this.add
      .text(camW / 2, camH / 2, "Бой начинается...", {
        fontSize: TRANSITION_TEXT_FONT_SIZE,
        color: TRANSITION_TEXT_COLOR,
        fontFamily: TRANSITION_FONT,
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setAlpha(0);
    this.tweens.add({
      targets: text,
      alpha: { from: 0, to: 1 },
      duration: TRANSITION_FADE_DURATION,
      onComplete: () => {
        this.time.delayedCall(TRANSITION_HOLD_DURATION, onDone);
      },
    });
  }
}
