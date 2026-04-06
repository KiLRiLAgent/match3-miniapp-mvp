/**
 * DialogueScene — visual-novel layer that drives a `DialogueRunner`.
 *
 * Receives `dialogueId` via `init(data)`, looks up the `DialogueGraph` from
 * the v2 content registry, instantiates a `DialogueRunner` (REFINEMENT 8:
 * may receive `startNodeId` for PostCombatScene resume), and renders the
 * current node:
 *  - **line** node: render lines sequentially in a SpeechBubble; tap to
 *    advance to the next line, then auto-advance to `next` node.
 *  - **choice** node: render an optional prompt + DialogueChoiceButton stack;
 *    on click → `runner.selectChoiceById(choice.id)` (REFINEMENT 5) →
 *    re-render the new current node.
 *  - **battle** node: hand off to CombatBridgeScene with the encounterId and
 *    onVictory/onDefeat node ids that the runner needs to resume.
 *  - **end** node: apply end-node effects and `sceneRouter.pop` back to
 *    LocationScene (or whatever pushed us).
 *
 * v2-isolation: scene-level imports limited to `src/v2/*`, `src/game/config`,
 * and `src/ui/SpeechBubble` (the latter is a v1 component reused as-is per
 * the brief — SpeechBubble lives in `src/ui/`, not `src/scenes/*`, so this
 * is allowed by v2-isolation rules).
 *
 * Async safety: `busy` flag with try/finally on every input handler, per
 * `.conventions/gold-standards/phaser-animation.ts` section 8.
 */

import Phaser from "phaser";
import { DPR, SAFE_AREA } from "../../game/config";
import { SpeechBubble } from "../../ui/SpeechBubble";
import { CHARACTERS } from "../content/characters";
import { DIALOGUES } from "../content/dialogues";
import { gameState } from "../core/GameState";
import { sceneRouter } from "../core/SceneRouter";
import { DialogueRunner } from "../systems/DialogueRunner";
import { CharacterPortrait } from "../ui/CharacterPortrait";
import { DialogueChoiceButton } from "../ui/DialogueChoiceButton";
import type { DialogueLine, DialogueNode } from "../content/types";

const BG_COLOR = 0x0d0820;

const FONT = "'Exo 2', Arial, sans-serif";
const NAME_COLOR = "#e6c068";
const SPEAKER_NAME_FONT_SIZE = 22;
const NARRATOR_LABEL = "Повествование";

const PORTRAIT_CENTER_Y_RATIO = 0.28;
const PORTRAIT_MAX_WIDTH_RATIO = 0.5;
const PORTRAIT_MAX_HEIGHT_RATIO = 0.35;
const PORTRAIT_NAME_GAP = 20;

const BUBBLE_CENTER_Y_RATIO = 0.62;
const BUBBLE_MAX_WIDTH_RATIO = 0.85;
const BUBBLE_FONT_SIZE = 18;
const BUBBLE_PROMPT_FONT_SIZE = 16;
const BUBBLE_FADE_MS = 200;

const CHOICE_BLOCK_CENTER_Y_RATIO = 0.82;
const CHOICE_BUTTON_HEIGHT = 60;
const CHOICE_BUTTON_SPACING = 12;
const CHOICE_BUTTON_WIDTH_RATIO = 0.85;

const TAP_HINT_BOTTOM_OFFSET = 28;
const TAP_HINT_FONT_SIZE = 13;
const TAP_HINT_COLOR = "#9f7fc7";

const END_NODE_AUTO_POP_MS = 500;

const FALLBACK_PLAYER_INITIAL = "Я";

interface DialogueSceneData {
  dialogueId?: string;
  startNodeId?: string;
}

export class DialogueScene extends Phaser.Scene {
  private dialogueId = "";
  private startNodeId?: string;
  private runner!: DialogueRunner;
  private currentLineIndex = 0;
  private busy = false;

  private portrait?: CharacterPortrait;
  private speakerNameText?: Phaser.GameObjects.Text;
  private bubble?: SpeechBubble;
  private tapHint?: Phaser.GameObjects.Text;
  private choiceButtons: DialogueChoiceButton[] = [];
  /**
   * Same-tap race guard. Set to true synchronously inside `handleChoice`
   * and cleared on the next update tick via `time.delayedCall(0)`.
   * `handleTap` checks this flag first — Phaser delivers a child container's
   * pointerup to scene-level handlers AFTER the child handler returns, so
   * without this flag the same physical tap that picked a choice would also
   * advance the freshly-rendered next line node.
   */
  private suppressNextTap = false;

  constructor() {
    super("DialogueScene");
  }

  init(data?: DialogueSceneData) {
    this.dialogueId = data?.dialogueId ?? "";
    this.startNodeId = data?.startNodeId;
    this.currentLineIndex = 0;
    this.busy = false;
    this.suppressNextTap = false;
    this.choiceButtons = [];
    this.portrait = undefined;
    this.speakerNameText = undefined;
    this.bubble = undefined;
    this.tapHint = undefined;
  }

  create() {
    const graph = DIALOGUES[this.dialogueId];
    if (!graph) {
      console.error(`DialogueScene: unknown dialogue "${this.dialogueId}"`);
      sceneRouter.pop(this);
      return;
    }

    this.runner = new DialogueRunner(graph, this.startNodeId);

    const camW = this.cameras.main.width;
    const camH = this.cameras.main.height;
    const d = DPR;

    this.add.rectangle(0, 0, camW, camH, BG_COLOR).setOrigin(0);

    // Initial portrait — emotion is updated per-line as we render.
    if (graph.characterId) {
      const character = CHARACTERS[graph.characterId];
      const portraitSize = Math.min(
        camW * PORTRAIT_MAX_WIDTH_RATIO,
        camH * PORTRAIT_MAX_HEIGHT_RATIO,
      );
      const portraitY = camH * PORTRAIT_CENTER_Y_RATIO + SAFE_AREA.top * d;
      this.portrait = new CharacterPortrait(this, camW / 2, portraitY, {
        size: portraitSize,
        initial: character?.name?.charAt(0) ?? "?",
        emotion: "neutral",
      });

      this.speakerNameText = this.add
        .text(
          camW / 2,
          portraitY + portraitSize / 2 + PORTRAIT_NAME_GAP * d,
          character?.name ?? graph.characterId,
          {
            fontSize: `${SPEAKER_NAME_FONT_SIZE * d}px`,
            color: NAME_COLOR,
            fontFamily: FONT,
            fontStyle: "bold",
            stroke: "#000000",
            strokeThickness: 3 * d,
          },
        )
        .setOrigin(0.5);
    }

    this.tapHint = this.add
      .text(
        camW / 2,
        camH - TAP_HINT_BOTTOM_OFFSET * d - SAFE_AREA.bottom * d,
        "Тап для продолжения",
        {
          fontSize: `${TAP_HINT_FONT_SIZE * d}px`,
          color: TAP_HINT_COLOR,
          fontFamily: FONT,
          fontStyle: "italic",
        },
      )
      .setOrigin(0.5)
      .setAlpha(0);

    this.renderCurrentNode();

    // Tap-to-advance only consumes the gesture on `line` nodes — choice/end
    // ignore the tap (handled inside handleTap).
    this.input.on("pointerup", () => this.handleTap());
  }

  // ─── Node rendering ────────────────────────────────────────────────────

  private renderCurrentNode(): void {
    this.cleanupChoices();
    const node = this.runner.current();
    switch (node.type) {
      case "line":
        this.renderLineNode(node);
        return;
      case "choice":
        this.renderChoiceNode(node);
        return;
      case "battle":
        this.handleBattleNode(node);
        return;
      case "end":
        this.handleEndNode(node);
        return;
    }
  }

  private renderLineNode(
    node: Extract<DialogueNode, { type: "line" }>,
  ): void {
    if (this.currentLineIndex >= node.lines.length) {
      // Sequence exhausted — advance to the next node.
      this.currentLineIndex = 0;
      if (node.next) {
        this.runner.advance();
        this.renderCurrentNode();
      } else {
        // Defensive: a line node with no `next` means we are stuck.
        // canAdvance() returned false, but we ran out of lines anyway —
        // this is a content authoring bug.
        console.warn(
          `DialogueScene: line node "${node.id}" has no next pointer`,
        );
      }
      return;
    }
    this.showLine(node.lines[this.currentLineIndex]);
    this.tapHint?.setAlpha(1);
  }

  private showLine(line: DialogueLine): void {
    const camW = this.cameras.main.width;
    const camH = this.cameras.main.height;
    const d = DPR;

    if (this.portrait && line.emotion) {
      this.portrait.setEmotion(line.emotion);
    }

    if (this.speakerNameText) {
      const label = this.resolveSpeakerLabel(line.speaker);
      this.speakerNameText.setText(label);
    }

    if (this.bubble) {
      this.bubble.destroy();
      this.bubble = undefined;
    }

    const text = this.runner.resolveText(line.text);
    this.bubble = new SpeechBubble(
      this,
      camW / 2,
      camH * BUBBLE_CENTER_Y_RATIO,
      {
        text,
        maxWidth: camW * BUBBLE_MAX_WIDTH_RATIO,
        tailDirection: "up",
        highlights: line.highlights,
        fontSize: `${BUBBLE_FONT_SIZE * d}px`,
      },
    );
    void this.bubble.fadeIn(BUBBLE_FADE_MS);
  }

  private renderChoiceNode(
    node: Extract<DialogueNode, { type: "choice" }>,
  ): void {
    const camW = this.cameras.main.width;
    const camH = this.cameras.main.height;
    const d = DPR;

    this.tapHint?.setAlpha(0);

    if (this.bubble) {
      this.bubble.destroy();
      this.bubble = undefined;
    }
    if (node.prompt) {
      this.bubble = new SpeechBubble(
        this,
        camW / 2,
        camH * BUBBLE_CENTER_Y_RATIO,
        {
          text: this.runner.resolveText(node.prompt),
          maxWidth: camW * BUBBLE_MAX_WIDTH_RATIO,
          tailDirection: "none",
          fontSize: `${BUBBLE_PROMPT_FONT_SIZE * d}px`,
        },
      );
      void this.bubble.fadeIn(BUBBLE_FADE_MS);
    }

    const choices = this.runner.getAvailableChoices();
    if (choices.length === 0) {
      console.warn(
        `DialogueScene: choice node "${node.id}" has zero available choices`,
      );
      return;
    }

    const buttonWidth = camW * CHOICE_BUTTON_WIDTH_RATIO;
    const buttonHeight = CHOICE_BUTTON_HEIGHT * d;
    const spacing = CHOICE_BUTTON_SPACING * d;
    const totalH =
      choices.length * buttonHeight + (choices.length - 1) * spacing;
    const startY = camH * CHOICE_BLOCK_CENTER_Y_RATIO - totalH / 2;

    choices.forEach((choice, idx) => {
      const y = startY + idx * (buttonHeight + spacing) + buttonHeight / 2;
      const button = new DialogueChoiceButton(this, camW / 2, y, {
        width: buttonWidth,
        height: buttonHeight,
        text: this.runner.resolveText(choice.text),
        onClick: () => this.handleChoice(choice.id),
      });
      this.choiceButtons.push(button);
    });
  }

  // ─── Node-type handlers ────────────────────────────────────────────────

  private handleChoice(choiceId: string): void {
    if (this.busy) return;
    this.busy = true;
    // Race guard: this synchronous handler advances the runner and may
    // re-render to a new "line" node. The same physical tap then propagates
    // to scene.input.pointerup → handleTap. The flag is cleared on the next
    // update tick so legitimate subsequent taps still work normally.
    this.suppressNextTap = true;
    this.time.delayedCall(0, () => {
      this.suppressNextTap = false;
    });
    try {
      this.runner.selectChoiceById(choiceId);
      this.currentLineIndex = 0;
      this.renderCurrentNode();
    } catch (err) {
      console.error("DialogueScene: selectChoiceById failed", err);
    } finally {
      this.busy = false;
    }
  }

  private handleBattleNode(
    node: Extract<DialogueNode, { type: "battle" }>,
  ): void {
    this.tapHint?.setAlpha(0);
    if (this.bubble) {
      this.bubble.destroy();
      this.bubble = undefined;
    }
    sceneRouter.push(this, "CombatBridgeScene", {
      encounterId: node.encounterId,
      onVictoryNode: node.onVictory,
      onDefeatNode: node.onDefeat,
      returnToDialogueId: this.dialogueId,
    });
  }

  private handleEndNode(
    _node: Extract<DialogueNode, { type: "end" }>,
  ): void {
    this.tapHint?.setAlpha(0);
    this.runner.applyEndEffects();
    this.time.delayedCall(END_NODE_AUTO_POP_MS, () => sceneRouter.pop(this));
  }

  private handleTap(): void {
    if (this.busy) return;
    // Same-tap race guard: handleChoice sets this synchronously and clears
    // it on the next tick. Without it, the pointerup that picked a choice
    // would also fire on scene.input AFTER the child container's handler
    // returned, advancing the freshly-rendered next line node and eating
    // its first line from the player.
    if (this.suppressNextTap) return;
    // Defensive: skip when choice buttons are still on screen — covers any
    // tap that lands on the bubble/portrait/hint while choices are visible.
    if (this.choiceButtons.length > 0) return;
    // Defensive: skip when the runner is on a node that cannot be advanced
    // by tap (choice / battle / end / line-without-next). Catches future
    // content authoring edge cases that the type check below would miss.
    if (!this.runner.canAdvance()) return;

    const node = this.runner.current();
    // Belt-and-suspenders: canAdvance() already implies type === "line", but
    // narrowing the union here keeps renderLineNode strictly-typed.
    if (node.type !== "line") return;

    this.busy = true;
    try {
      this.currentLineIndex += 1;
      this.renderLineNode(node);
    } finally {
      this.busy = false;
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  /**
   * Resolve a `Speaker` token to a display label. Reserved values:
   *  - `"player"` → live player name from SaveData
   *  - `"narrator"` → fixed "Повествование" label
   *  - any other string → look up in CHARACTERS registry, fall back to id
   */
  private resolveSpeakerLabel(speaker: string): string {
    if (speaker === "player") {
      const save = gameState.get();
      return save.player.name || FALLBACK_PLAYER_INITIAL;
    }
    if (speaker === "narrator") {
      return NARRATOR_LABEL;
    }
    const character = CHARACTERS[speaker];
    return character?.name ?? speaker;
  }

  private cleanupChoices(): void {
    for (const button of this.choiceButtons) {
      button.destroy();
    }
    this.choiceButtons = [];
  }
}
