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
 */

import Phaser from "phaser";
import { DPR, SAFE_AREA } from "../../game/config";
import { sceneRouter } from "../core/SceneRouter";
import { relationshipSystem } from "../systems/RelationshipSystem";
import { ENCOUNTERS } from "../content/encounters";
import { CHARACTERS } from "../content/characters";
import { RelationshipMeter } from "../ui/RelationshipMeter";
import type { CharacterDef, CombatContext, CombatResult, EncounterDef } from "../content/types";

const BG_COLOR = 0x0d0820;
const TITLE_COLOR_VICTORY = "#4caf50";
const TITLE_COLOR_DEFEAT = "#c83e3e";
const SUBTITLE_COLOR = "#b8a8d0";
const STAT_COLOR = "#ffffff";
const STAT_FONT_SIZE = 18;
const TITLE_FONT_SIZE = 48;
const SUBTITLE_FONT_SIZE = 20;
const TITLE_STROKE_COLOR = "#000000";
const TITLE_STROKE_WIDTH = 5;
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

interface PostCombatData {
  result: CombatResult;
  encounterContext: CombatContext;
  onVictoryNode: string;
  onDefeatNode: string;
  returnToDialogueId: string;
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
    const { result, encounterContext } = this.sceneData;
    const encounter = ENCOUNTERS[result.encounterId];
    const character = CHARACTERS[result.characterId];
    if (!encounter || !character) {
      console.error("PostCombatScene: missing encounter or character");
      sceneRouter.pop(this);
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
      if (encounter.rewards.lootText) {
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

  private createContinueButton(x: number, y: number) {
    const d = DPR;
    const bg = this.add
      .rectangle(x, y, BTN_WIDTH * d, BTN_HEIGHT * d, BTN_BG, BTN_BG_ALPHA)
      .setStrokeStyle(BTN_STROKE_WIDTH * d, BTN_STROKE)
      .setInteractive({ useHandCursor: true })
      .on("pointerover", () => bg.setFillStyle(BTN_BG_HOVER, BTN_BG_ALPHA))
      .on("pointerout", () => bg.setFillStyle(BTN_BG, BTN_BG_ALPHA))
      .on("pointerup", () => this.handleContinue());

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
    sceneRouter.replace(this, "DialogueScene", {
      dialogueId: this.sceneData.returnToDialogueId,
      startNodeId: targetNode,
    });
  }
}
