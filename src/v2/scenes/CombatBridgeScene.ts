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
import { eventBus } from "../core/EventBus";
import { encounterBuilder } from "../systems/EncounterBuilder";
import { arenaEncounterGenerator } from "../systems/ArenaEncounterGenerator";
import { arenaSystem } from "../systems/ArenaSystem";
import { computeEffectiveSkills, computePassiveSnapshot } from "../systems/ArenaPerkApplicator";
import { arenaPerkSystem } from "../systems/ArenaPerkSystem";
import { openArenaPerkModal } from "../ui/ArenaPerkModal";
import { ENCOUNTERS } from "../content/encounters";
import type {
  ArenaPassiveSnapshot,
  ArenaSkillOverride,
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
  /**
   * Phase 1C S1 idempotency guard. Reset to false in `init()` (FIRST line per
   * DECISIONS R13) on every fresh scene start. handleCombatComplete checks
   * this before applying rewards — duplicate fires from GameScene's
   * onCombatComplete callback are no-ops with a warning.
   */
  private resultApplied = false;

  constructor() {
    super("CombatBridgeScene");
  }

  init(data: CombatBridgeData) {
    // R13: reset idempotency guard FIRST — defensive against init being called
    // with empty/undefined data (TypeError on data.X reads is then non-fatal).
    this.resultApplied = false;
    this.encounterId = data.encounterId;
    this.onVictoryNode = data.onVictoryNode;
    this.onDefeatNode = data.onDefeatNode;
    this.returnToDialogueId = data.returnToDialogueId;
  }

  create() {
    // Phase 2A R3: fallback chain — `ENCOUNTERS[id]` first, then synthetic
    // `arenaEncounterGenerator.generate(id)` for `arena_floor_*` ids, then
    // `handleMissingEncounter()` for everything else. The generator returns
    // `null` for non-arena ids so the chain falls through naturally.
    let encounterDef: EncounterDef | undefined = ENCOUNTERS[this.encounterId];
    if (!encounterDef) {
      const diffMult = arenaSystem.getDifficultyMultiplier();
      const generated = arenaEncounterGenerator.generate(this.encounterId, diffMult);
      if (generated) {
        encounterDef = generated;
      } else {
        this.handleMissingEncounter();
        return;
      }
    }

    // CLOSURE CAPTURE — encounterDef and context live in the callback closure
    // (more robust than instance fields against future refactors per MITIGATION-2)
    const context: CombatContext = encounterBuilder.build(encounterDef);

    // v2: arena perk handlers — only wired for arena fights
    const isArena = arenaEncounterGenerator.isArenaEncounter(this.encounterId);

    this.showTransitionOverlay(() => {
      const initData: GameSceneInitData = {
        encounterContext: context,
        onCombatComplete: (raw: RawCombatResult) => {
          // encounterDef + context + this captured in closure (NOT instance fields)
          this.handleCombatComplete(raw, encounterDef, context);
        },
      };

      // v2: inject arena perk system handlers for arena fights (gold standard §6)
      if (isArena) {
        const physAttack = context.playerStats.physAttack;
        initData.arenaPerksEnabled = true;
        initData.arenaSkillStats = (id: string): ArenaSkillOverride => {
          const levels = arenaPerkSystem.getPerkLevels();
          const all = computeEffectiveSkills(levels, physAttack);
          return all[id as keyof typeof all] ?? { unlocked: false, level: 0, cost: 0, cooldown: 0 };
        };
        initData.arenaPassives = (): ArenaPassiveSnapshot => {
          const passives = arenaPerkSystem.getTakenPassives();
          const statCounts = arenaPerkSystem.getStatPerkCounts();
          return computePassiveSnapshot(passives, statCounts) as ArenaPassiveSnapshot;
        };
        initData.arenaPerkModal = { open: openArenaPerkModal };
      }

      this.scene.launch("GameScene", initData);
      // After launch, sleep self — Phaser preserves this scene's instance state across sleep/wake
      this.scene.sleep();
    });
  }

  /**
   * Handler invoked from GameScene's onCombatComplete callback closure.
   * Receives encounterDef and context via closure capture (MITIGATION-2).
   *
   * Phase 1C S1 idempotency: guarded by `this.resultApplied` — duplicate
   * fires (GameScene emits twice for any reason) are no-ops with a warning.
   * The flag is reset to false in `init()` so a fresh combat starts clean.
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
    // S1 idempotency guard — second invocation for the same combat is a bug
    // somewhere upstream (GameScene closure leak, double-emit) and must NOT
    // double-apply rewards. Set the flag BEFORE any side effects so a re-entry
    // mid-handler still no-ops on the next call.
    if (this.resultApplied) {
      console.warn(
        `CombatBridgeScene: handleCombatComplete called twice for encounter ${encounterDef.id} — ignoring duplicate`,
      );
      return;
    }
    this.resultApplied = true;

    // RISK-2 caveat 5: stop GameScene BEFORE wake — otherwise next encounter's launch
    // hits SceneManager.start() shutdown branch and breaks the second fight.
    this.scene.stop("GameScene");
    this.scene.wake();

    // RISK-2 caveat 3: defer router push via delayedCall(0) to ensure wake is processed
    // before the next ops (Phaser scene queue runs on next update tick).
    this.time.delayedCall(0, () => {
      // RISK-5: applyResult is now the SOLE enrichment path — it returns a
      // fully-populated CombatResult (XP, gold, level-up, loot). No further
      // spreading here — passthrough only.
      const enriched = encounterBuilder.applyResult(raw, encounterDef);

      // MITIGATION-3 / RISK-9: explicit flush bypasses 2-second autosave debounce.
      // beforeunload is unreliable on mobile Telegram WebView (iOS WKWebView doesn't
      // fire on swipe-away). Without this, force-quit immediately after victory would
      // lose XP/gold/relationship rewards.
      gameState.flush();

      sceneRouter.replace(this, "PostCombatScene", {
        result: enriched,
        encounterContext: context,
        onVictoryNode: this.onVictoryNode,
        onDefeatNode: this.onDefeatNode,
        returnToDialogueId: this.returnToDialogueId,
      });
    });
  }

  /**
   * Phase 1C C2 missing-encounter recovery (DECISIONS R3 + R6).
   *
   * When `ENCOUNTERS[encounterId]` is undefined we cannot run the real combat
   * flow — building a CombatContext requires the encounter, and applying
   * rewards would corrupt stats. Instead we synthesize a defeat-shaped
   * CombatResult and route to PostCombatScene with `synthesizedDefeat: true`.
   *
   * Per R3: the toast lives on PostCombatScene (where it survives long enough
   * to be read), NOT here — `this` is about to shut down.
   * Per R6: the synthetic CombatResult literal is the second permitted
   * occurrence in the codebase; the CONTENT_ERROR_FALLBACK comment within
   * 5 lines is the documented exemption marker.
   */
  private handleMissingEncounter(): void {
    console.error(
      `CombatBridgeScene: encounter ${this.encounterId} not found in ENCOUNTERS registry`,
    );

    // Monitoring/observability — Toast UI is intentionally NOT shown here
    // (R3: would die on scene shutdown). PostCombatScene shows it.
    eventBus.emit("contentError", {
      source: "missing-encounter",
      detail: `encounter '${this.encounterId}' not in ENCOUNTERS registry`,
    });

    // CONTENT_ERROR_FALLBACK — bypasses applyResult intentionally:
    //   - synthetic defeat is NOT a real combat result
    //   - bypassing applyResult avoids corrupting stats.combatsLost
    //   - relationship deltas not applied (no real combat occurred)
    const syntheticResult: CombatResult = {
      encounterId: this.encounterId,
      characterId: "",
      victory: false,
      damageDealt: 0,
      damageReceived: 0,
      chainsBroken: 0,
      turnsPlayed: 0,
      appliedDelta: {},
      xpGained: 0,
      goldGained: 0,
    };

    sceneRouter.replace(this, "PostCombatScene", {
      result: syntheticResult,
      encounterContext: null,
      onVictoryNode: this.onVictoryNode,
      onDefeatNode: this.onDefeatNode,
      returnToDialogueId: this.returnToDialogueId,
      synthesizedDefeat: true,
      errorMessage: `Ошибка контента: бой '${this.encounterId}' не найден`,
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
