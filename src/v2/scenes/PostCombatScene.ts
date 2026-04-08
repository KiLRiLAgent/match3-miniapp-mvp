/**
 * PostCombatScene — pure display of CombatResult with relationship before/after
 * animation. NO state mutation here — rewards already applied by
 * CombatBridgeScene.handleCombatComplete via encounterBuilder.applyResult.
 *
 * Reads `before` from `combatContext.relationshipSnapshot` (frozen pre-combat
 * snapshot deep-cloned by EncounterBuilder.build) and `after` from
 * `relationshipSystem.getState()` (current, post-applyResult). The before/after
 * delta is animated on the RelationshipMeter component.
 *
 * Continue button transitions back to DialogueScene at the post-battle node
 * (onVictoryNode or onDefeatNode) via sceneRouter.replace.
 *
 * Phase 1C R3 / C3 resilience:
 *   - If `encounterContext` is null OR encounter/character lookup fails OR
 *     `synthesizedDefeat === true`, the scene renders a `renderFallback()`
 *     view that shows whatever IS available on `result` and a continue button
 *     that always navigates somewhere (returnToDialogueId → Hub).
 *   - When `synthesizedDefeat === true` (set by CombatBridgeScene's missing-
 *     encounter path) the scene also shows a top toast — this is intentional:
 *     CombatBridgeScene cannot show the toast itself because the scene shuts
 *     down before the player can read it (DECISIONS.md R3).
 *   - `handleContinue()` falls back to Hub if `returnToDialogueId` is unknown,
 *     so a deleted dialogue cannot strand the player either.
 */

import Phaser from "phaser";
import { DPR, SAFE_AREA } from "../../game/config";
import { sceneRouter } from "../core/SceneRouter";
import { eventBus } from "../core/EventBus";
import { relationshipSystem } from "../systems/RelationshipSystem";
import { ENCOUNTERS } from "../content/encounters";
import { CHARACTERS } from "../content/characters";
import { DIALOGUES } from "../content/dialogues";
import { ITEMS } from "../content/items";
import { RelationshipMeter } from "../ui/RelationshipMeter";
import { toast } from "../ui/Toast";
import type { CharacterDef, CombatContext, CombatResult, EncounterDef } from "../content/types";

const BG_COLOR = 0x0d0820;
const TITLE_COLOR_VICTORY = "#4caf50";
const TITLE_COLOR_DEFEAT = "#c83e3e";
const SUBTITLE_COLOR = "#b8a8d0";
const STAT_COLOR = "#ffffff";
const LEVEL_UP_COLOR = "#ffd54a";
const LOOT_COLOR = "#b8e994";
const STAT_FONT_SIZE = 18;
const LEVEL_UP_FONT_SIZE = 32;
const TITLE_FONT_SIZE = 48;
const SUBTITLE_FONT_SIZE = 20;
const TITLE_STROKE_COLOR = "#000000";
const TITLE_STROKE_WIDTH = 5;
const LEVEL_UP_STROKE_WIDTH = 4;
const FONT = "'Exo 2', Arial, sans-serif";

const BTN_BG = 0x4a2d6e;
const BTN_BG_HOVER = 0x5a3d7e;
const BTN_BG_ALPHA = 0.95;
const BTN_STROKE = 0xe6c068;
const BTN_STROKE_WIDTH = 2;
const BTN_TEXT_COLOR = "#f4e4c1";
const BTN_TEXT_FONT_SIZE = 20;
const BTN_WIDTH = 240;
const BTN_HEIGHT = 56;

const METER_WIDTH_RATIO = 0.7;
const METER_ROW_HEIGHT = 14;
const METER_ANIMATE_DELAY = 500;

const TITLE_Y = 100;
const SUBTITLE_Y = 160;
const STATS_START_Y = 220;
const STAT_LINE_HEIGHT = 30;
const METER_GAP = 50;
const BUTTON_BOTTOM_OFFSET = 100;

// Phase 1C fallback path constants — used by renderFallback()
const TOAST_DURATION_MS = 5000;
const FALLBACK_TITLE_COLOR = "#e6c068";
const FALLBACK_TITLE_FONT_SIZE = 32;
const FALLBACK_LINE_FONT_SIZE = 18;
const FALLBACK_LINE_HEIGHT = 32;
const FALLBACK_TITLE_Y = 140;
const FALLBACK_STATS_START_Y = 220;

interface PostCombatData {
  result: CombatResult;
  /**
   * Phase 1C R3: nullable for synthetic-defeat path (CombatBridgeScene cannot
   * build a real CombatContext when the encounterId is missing).
   */
  encounterContext: CombatContext | null;
  onVictoryNode: string;
  onDefeatNode: string;
  returnToDialogueId: string;
  /**
   * Phase 1C R3: set by CombatBridgeScene when it synthesizes a defeat result
   * after failing to look up the encounter. PostCombatScene shows the toast
   * here (where it lives long enough to be read) and renders the fallback UI.
   */
  synthesizedDefeat?: boolean;
  /**
   * Phase 1C R3 (round 4 refinement): explicit toast message text from the
   * call site. Decouples toast text from the flag — future synthetic-defeat
   * sources (missing character, item def, etc.) can reuse `synthesizedDefeat`
   * with their own message. Falls back to a generated message when omitted.
   */
  errorMessage?: string;
}

export class PostCombatScene extends Phaser.Scene {
  private sceneData!: PostCombatData;

  constructor() {
    super("PostCombatScene");
  }

  init(data: PostCombatData) {
    this.sceneData = data;
  }

  create() {
    const { result, encounterContext, synthesizedDefeat, errorMessage } = this.sceneData;

    // Phase 1C R3: synthesized defeat from CombatBridgeScene means the encounter
    // wasn't found at all. Show toast HERE (lives long enough to be read) and
    // render a fallback UI that always has a working continue button.
    // R3 round 4: prefer explicit errorMessage from call site — it knows the
    // context (e.g. "encounter X not found" vs "character Y missing").
    if (synthesizedDefeat) {
      const message =
        errorMessage ?? `Ошибка контента: бой '${result.encounterId}' не найден`;
      toast.show(this, {
        message,
        type: "error",
        durationMs: TOAST_DURATION_MS,
      });
    }

    const encounter = ENCOUNTERS[result.encounterId];
    const character = encounter ? CHARACTERS[encounter.characterId] : undefined;

    // Phase 1C: missing encounter / character / synthesized defeat all share
    // the same fallback path — never strand the player on a stuck scene.
    // synthesizedDefeat ALWAYS triggers fallback even if registry happens to
    // have entries (call-site signaled the data is unsafe to render).
    if (!encounter || !character || !encounterContext || synthesizedDefeat) {
      console.warn(
        `PostCombatScene: missing encounter or character for result ${result.encounterId}`,
      );
      eventBus.emit("contentError", {
        source: "post-combat",
        detail: `missing encounter '${result.encounterId}' or character`,
      });
      this.renderFallback();
      return;
    }

    // NOTE: NO gameState.patch here. Rewards are already applied by
    // CombatBridgeScene.handleCombatComplete. PostCombatScene is pure display.
    this.renderUI(result, encounter, character, encounterContext);
  }

  private renderUI(
    result: CombatResult,
    encounter: EncounterDef,
    character: CharacterDef,
    encounterContext: CombatContext,
  ) {
    const camW = this.cameras.main.width;
    const camH = this.cameras.main.height;
    const cx = camW / 2;
    const d = DPR;

    this.add.rectangle(0, 0, camW, camH, BG_COLOR).setOrigin(0);

    const title = result.victory ? "Победа" : "Поражение";
    const titleColor = result.victory ? TITLE_COLOR_VICTORY : TITLE_COLOR_DEFEAT;
    this.add
      .text(cx, TITLE_Y * d + SAFE_AREA.top * d, title, {
        fontSize: `${TITLE_FONT_SIZE * d}px`,
        color: titleColor,
        fontFamily: FONT,
        fontStyle: "bold",
        stroke: TITLE_STROKE_COLOR,
        strokeThickness: TITLE_STROKE_WIDTH * d,
      })
      .setOrigin(0.5);

    this.add
      .text(cx, SUBTITLE_Y * d + SAFE_AREA.top * d, `Бой против: ${character.name}`, {
        fontSize: `${SUBTITLE_FONT_SIZE * d}px`,
        color: SUBTITLE_COLOR,
        fontFamily: FONT,
      })
      .setOrigin(0.5);

    let y = STATS_START_Y * d + SAFE_AREA.top * d;
    if (result.victory) {
      this.addStat(cx, y, `+ ${result.xpGained} XP`);
      y += STAT_LINE_HEIGHT * d;
      this.addStat(cx, y, `+ ${result.goldGained} осколков`);
      y += STAT_LINE_HEIGHT * d;
      if (result.leveledUp && result.newLevel !== undefined) {
        this.addLevelUp(cx, y, `Уровень ${result.newLevel}!`);
        y += LEVEL_UP_FONT_SIZE * d + 6 * d;
      }
      if (result.lootedItems && result.lootedItems.length > 0) {
        for (const itemId of result.lootedItems) {
          const itemName = ITEMS[itemId]?.name ?? itemId;
          this.addLoot(cx, y, `Получен предмет: ${itemName}`);
          y += STAT_LINE_HEIGHT * d;
        }
      } else if (encounter.rewards.lootText) {
        this.addStat(cx, y, encounter.rewards.lootText);
        y += STAT_LINE_HEIGHT * d;
      }
    }
    this.addStat(cx, y, `Цепей разорвано: ${result.chainsBroken}`);
    y += STAT_LINE_HEIGHT * d;
    this.addStat(cx, y, `Ходов: ${result.turnsPlayed}`);
    y += METER_GAP * d;

    // RelationshipMeter — animated before → after.
    // before: from frozen combatContext.relationshipSnapshot (deep-cloned by EncounterBuilder.build)
    // after: from relationshipSystem.getState() (post-applyResult, current state)
    const before = encounterContext.relationshipSnapshot;
    const after = relationshipSystem.getState(result.characterId);
    const meterWidth = camW * METER_WIDTH_RATIO;
    const meter = new RelationshipMeter(
      this,
      (camW - meterWidth) / 2,
      y,
      meterWidth,
      METER_ROW_HEIGHT * d,
    );
    meter.setValues({
      empathy: before.empathy,
      dominance: before.dominance,
      cynicism: before.cynicism,
    });
    this.time.delayedCall(METER_ANIMATE_DELAY, () => {
      meter.setValues({
        empathy: after.empathy,
        dominance: after.dominance,
        cynicism: after.cynicism,
      });
    });

    this.createContinueButton(cx, camH - BUTTON_BOTTOM_OFFSET * d - SAFE_AREA.bottom * d);
  }

  private addStat(x: number, y: number, text: string) {
    this.add
      .text(x, y, text, {
        fontSize: `${STAT_FONT_SIZE * DPR}px`,
        color: STAT_COLOR,
        fontFamily: FONT,
      })
      .setOrigin(0.5);
  }

  private addLevelUp(x: number, y: number, text: string) {
    this.add
      .text(x, y, text, {
        fontSize: `${LEVEL_UP_FONT_SIZE * DPR}px`,
        color: LEVEL_UP_COLOR,
        fontFamily: FONT,
        fontStyle: "bold",
        stroke: TITLE_STROKE_COLOR,
        strokeThickness: LEVEL_UP_STROKE_WIDTH * DPR,
      })
      .setOrigin(0.5);
  }

  private addLoot(x: number, y: number, text: string) {
    this.add
      .text(x, y, text, {
        fontSize: `${STAT_FONT_SIZE * DPR}px`,
        color: LOOT_COLOR,
        fontFamily: FONT,
        fontStyle: "bold",
      })
      .setOrigin(0.5);
  }

  private createContinueButton(x: number, y: number) {
    const d = DPR;
    const bg = this.add
      .rectangle(x, y, BTN_WIDTH * d, BTN_HEIGHT * d, BTN_BG, BTN_BG_ALPHA)
      .setStrokeStyle(BTN_STROKE_WIDTH * d, BTN_STROKE)
      .setInteractive({ useHandCursor: true })
      .on("pointerover", () => bg.setFillStyle(BTN_BG_HOVER, BTN_BG_ALPHA))
      .on("pointerout", () => bg.setFillStyle(BTN_BG, BTN_BG_ALPHA))
      .on("pointerdown", () => this.handleContinue());

    this.add
      .text(x, y, "Продолжить →", {
        fontSize: `${BTN_TEXT_FONT_SIZE * d}px`,
        color: BTN_TEXT_COLOR,
        fontFamily: FONT,
        fontStyle: "bold",
      })
      .setOrigin(0.5);
  }

  private handleContinue() {
    const targetNode = this.sceneData.result.victory
      ? this.sceneData.onVictoryNode
      : this.sceneData.onDefeatNode;
    // Phase 1C: defensive — if the dialogue is missing (content was edited
    // between save and load) fall back to Hub instead of crashing DialogueScene.
    const dialogueId = this.sceneData.returnToDialogueId;
    if (dialogueId && DIALOGUES[dialogueId]) {
      sceneRouter.replace(this, "DialogueScene", {
        dialogueId,
        startNodeId: targetNode,
      });
      return;
    }
    sceneRouter.setRoot("HubScene");
    this.scene.start("HubScene");
  }

  /**
   * Phase 1C R3 / C3 fallback: rendered when the encounter or character is
   * missing (content edit broke the link between save and registry) or when
   * CombatBridgeScene synthesized a defeat. Shows whatever data IS available
   * on the CombatResult and a continue button that always navigates somewhere
   * — never strands the player.
   */
  private renderFallback() {
    const camW = this.cameras.main.width;
    const camH = this.cameras.main.height;
    const cx = camW / 2;
    const d = DPR;
    const result = this.sceneData.result;

    this.add.rectangle(0, 0, camW, camH, BG_COLOR).setOrigin(0);

    this.add
      .text(cx, FALLBACK_TITLE_Y * d + SAFE_AREA.top * d, "Бой завершён", {
        fontSize: `${FALLBACK_TITLE_FONT_SIZE * d}px`,
        color: FALLBACK_TITLE_COLOR,
        fontFamily: FONT,
        fontStyle: "bold",
        stroke: TITLE_STROKE_COLOR,
        strokeThickness: LEVEL_UP_STROKE_WIDTH * d,
      })
      .setOrigin(0.5);

    let y = FALLBACK_STATS_START_Y * d + SAFE_AREA.top * d;

    if (result.xpGained > 0) {
      this.addFallbackLine(cx, y, `+${result.xpGained} XP`, LEVEL_UP_COLOR);
      y += FALLBACK_LINE_HEIGHT * d;
    }
    if (result.goldGained > 0) {
      this.addFallbackLine(cx, y, `+${result.goldGained} осколков`, FALLBACK_TITLE_COLOR);
      y += FALLBACK_LINE_HEIGHT * d;
    }
    if (result.leveledUp && result.newLevel !== undefined) {
      this.addLevelUp(cx, y, `Уровень ${result.newLevel}!`);
      y += LEVEL_UP_FONT_SIZE * d + 6 * d;
    }
    if (result.lootedItems && result.lootedItems.length > 0) {
      for (const itemId of result.lootedItems) {
        // ITEMS lookup may also fail if item def was deleted — fall back to id.
        const itemName = ITEMS[itemId]?.name ?? itemId;
        this.addFallbackLine(cx, y, `Получен предмет: ${itemName}`, LOOT_COLOR);
        y += FALLBACK_LINE_HEIGHT * d;
      }
    }

    this.createContinueButton(cx, camH - BUTTON_BOTTOM_OFFSET * d - SAFE_AREA.bottom * d);
  }

  private addFallbackLine(x: number, y: number, text: string, color: string) {
    this.add
      .text(x, y, text, {
        fontSize: `${FALLBACK_LINE_FONT_SIZE * DPR}px`,
        color,
        fontFamily: FONT,
        fontStyle: "bold",
      })
      .setOrigin(0.5);
  }
}
