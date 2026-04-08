/**
 * CharacterGalleryScene — Phase 1B gallery of all encountered characters.
 *
 * Shows a grid of `CharacterPortrait` components for every character with an
 * entry in `SaveData.relationships`. Tapping a portrait opens a modal overlay
 * with a large portrait, name, backstory excerpt, `RelationshipMeter`
 * (empathy/dominance/cynicism bars), relationship status label, and a
 * "defeated" indicator driven by `SaveData.story.completedEncounters`.
 *
 * Layout rules (non-zoomed v2 scene — see `.conventions/gold-standards/scene-coordinates.md`):
 *   - Multiply coordinates, sizes, font sizes, and stroke widths by DPR.
 *   - Bottom-anchored controls respect `SAFE_AREA.bottom`; top-anchored
 *     controls respect `SAFE_AREA.top`.
 *   - All interactive elements use `pointerdown` (not `pointerup`) per
 *     v2 input convention.
 *
 * RISK-6 (modal tap propagation):
 *   The modal panel is itself interactive with an empty hit handler so it
 *   "absorbs" pointerdown events. The full-screen backdrop beneath the
 *   modal is a separate interactive rectangle whose `pointerdown` handler
 *   closes the modal. Phaser's input system delivers events to the topmost
 *   interactive object at the pointer position, so taps INSIDE the modal
 *   panel never reach the backdrop, and taps OUTSIDE the panel hit the
 *   backdrop and close the modal. The "Закрыть" button sits on top of the
 *   panel and is its own interactive object.
 *
 * v2-isolation: imports only from `src/v2/*` and `src/game/config` (DPR /
 * SAFE_AREA). No v1 scene imports.
 *
 * Scene registration: handled by task #9 (`src/v2/index.ts`). This scene
 * MUST NOT self-register.
 */

import Phaser from "phaser";
import { DPR, SAFE_AREA } from "../../game/config";
import { gameState } from "../core/GameState";
import { sceneRouter } from "../core/SceneRouter";
import { CHARACTERS } from "../content/characters";
import { ENCOUNTERS } from "../content/encounters";
import { CharacterPortrait } from "../ui/CharacterPortrait";
import { RelationshipMeter } from "../ui/RelationshipMeter";
import type { CharacterDef, Emotion } from "../content/types";
import type { RelationshipState } from "../core/types";

// Palette — mirrors HubScene / PostCombatScene "dark purple" theme.
const BG_COLOR = 0x1a0f2e;
const TITLE_COLOR = "#e6c068";
const SUBTITLE_COLOR = "#9f7fc7";
const FONT = "'Exo 2', Arial, sans-serif";

const BACK_BG = 0x2a1845;
const BACK_BG_HOVER = 0x3a2358;
const BACK_STROKE = 0x9f7fc7;
const BACK_TEXT = "#b8a8d0";
const BACK_TEXT_HOVER = "#e6c068";
const BACK_BUTTON_WIDTH = 180;
const BACK_BUTTON_HEIGHT = 48;

// Grid layout — logical (pre-DPR) units.
const PORTRAIT_SIZE = 96;
const GRID_COLS = 2;
const GRID_ROW_GAP = 48;
const GRID_COL_GAP = 48;
const GRID_TOP_Y = 180;
const LABEL_GAP = 12;
const DEFEATED_BADGE_GAP = 4;

// Modal layout.
const MODAL_BG_COLOR = 0x000000;
const MODAL_BG_ALPHA = 0.78;
const MODAL_PANEL_COLOR = 0x1a0f2e;
const MODAL_PANEL_ALPHA = 0.98;
const MODAL_PANEL_STROKE = 0xe6c068;
const MODAL_PANEL_STROKE_WIDTH = 2;
const MODAL_PANEL_WIDTH_RATIO = 0.86;
const MODAL_PANEL_HEIGHT_RATIO = 0.78;
const MODAL_PORTRAIT_SIZE = 128;
const MODAL_TITLE_COLOR = "#e6c068";
const MODAL_BACKSTORY_COLOR = "#d4b8e8";
const MODAL_SECTION_HEADER_COLOR = "#9f7fc7";
const MODAL_METER_WIDTH_RATIO = 0.82;
const MODAL_METER_ROW_HEIGHT = 14;

const CLOSE_BG = 0x4a2d6e;
const CLOSE_BG_HOVER = 0x6a4a90;
const CLOSE_STROKE = 0xe6c068;
const CLOSE_TEXT = "#f4e4c1";
const CLOSE_TEXT_HOVER = "#ffffff";
const CLOSE_BUTTON_WIDTH = 180;
const CLOSE_BUTTON_HEIGHT = 48;

// Status bucket thresholds — derived from character.relationshipThresholds.
interface StatusInfo {
  label: string;
  color: string;
}

// Backstory truncation — modal should not overflow.
const BACKSTORY_MAX_CHARS = 280;

// Empty-state message when the player has not met any characters yet.
const EMPTY_STATE_COLOR = "#8a7ab0";

// Phase 2A+ drag-scroll threshold (tap vs drag disambiguation).
const SCROLL_DRAG_THRESHOLD = 6;

export class CharacterGalleryScene extends Phaser.Scene {
  private modalLayer?: Phaser.GameObjects.Container;
  private completedCharacterIds: Set<string> = new Set();

  /** Scrollable container wrapping the character grid. */
  private gridLayer?: Phaser.GameObjects.Container;
  private scrollY = 0;
  private scrollMinY = 0;
  private scrollDraggedThisGesture = false;

  constructor() {
    super("CharacterGalleryScene");
  }

  create() {
    const camW = this.cameras.main.width;
    const camH = this.cameras.main.height;
    const cx = camW / 2;
    const d = DPR;

    this.add.rectangle(0, 0, camW, camH, BG_COLOR).setOrigin(0);

    this.add
      .text(cx, 96 * d + SAFE_AREA.top * d, "Галерея персонажей", {
        fontSize: `${30 * d}px`,
        color: TITLE_COLOR,
        fontFamily: FONT,
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 3 * d,
      })
      .setOrigin(0.5);

    this.add
      .text(cx, 138 * d + SAFE_AREA.top * d, "Встреченные души", {
        fontSize: `${16 * d}px`,
        color: SUBTITLE_COLOR,
        fontFamily: FONT,
        fontStyle: "italic",
      })
      .setOrigin(0.5);

    this.completedCharacterIds = this.computeCompletedCharacterIds();

    const encountered = this.collectEncounteredCharacters();
    if (encountered.length === 0) {
      this.add
        .text(cx, camH / 2, "Ты ещё никого не встретил...", {
          fontSize: `${18 * d}px`,
          color: EMPTY_STATE_COLOR,
          fontFamily: FONT,
          fontStyle: "italic",
        })
        .setOrigin(0.5);
    } else {
      this.renderGrid(encountered, camW);
    }

    const backY = camH - 70 * d - SAFE_AREA.bottom * d;
    this.createBackButton(cx, backY, () => sceneRouter.pop(this));
  }

  // ───────────────────────────────────────────────────────────────────────
  // Data helpers
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Returns character ids whose relationship entries exist AND whose
   * CharacterDef can be resolved from the content registry. Characters with
   * dangling ids (save references a character that was removed from content)
   * are silently skipped.
   */
  private collectEncounteredCharacters(): Array<{
    def: CharacterDef;
    state: RelationshipState;
  }> {
    const relationships = gameState.get().relationships;
    const result: Array<{ def: CharacterDef; state: RelationshipState }> = [];
    for (const charId of Object.keys(relationships)) {
      const def = CHARACTERS[charId];
      if (!def) continue;
      result.push({ def, state: relationships[charId] });
    }
    return result;
  }

  /**
   * Build the set of character ids the player has defeated at least once.
   * A character is "defeated" if any encounter with matching `characterId`
   * appears in `SaveData.story.completedEncounters`.
   */
  private computeCompletedCharacterIds(): Set<string> {
    const completed = gameState.get().story.completedEncounters;
    const ids = new Set<string>();
    for (const encId of completed) {
      const enc = ENCOUNTERS[encId];
      if (enc) ids.add(enc.characterId);
    }
    return ids;
  }

  /**
   * Compute the relationship status bucket — mirrors the thresholds logic
   * used by CharacterDef.relationshipThresholds. Hostile via cynicism wins
   * over friendly/romance.
   */
  private computeStatus(def: CharacterDef, state: RelationshipState): StatusInfo {
    const thresholds = def.relationshipThresholds;
    if (state.cynicism >= thresholds.hostileViaCynicism) {
      return { label: "Статус: Враг", color: "#c83e3e" };
    }
    const sum = state.empathy + state.dominance;
    if (state.romanced || sum >= thresholds.romance) {
      return { label: "Статус: Роман", color: "#e66ab0" };
    }
    if (sum >= thresholds.friendly) {
      return { label: "Статус: Дружба", color: "#4caf50" };
    }
    return { label: "Статус: Знакомство", color: "#b8a8d0" };
  }

  /**
   * Pick a portrait emotion that reflects the current relationship state.
   * Keeps the gallery expressive without requiring authored emotion per
   * status bucket.
   */
  private pickEmotion(def: CharacterDef, state: RelationshipState): Emotion {
    const thresholds = def.relationshipThresholds;
    if (state.cynicism >= thresholds.hostileViaCynicism) return "angry";
    const sum = state.empathy + state.dominance;
    if (state.romanced || sum >= thresholds.romance) return "seductive";
    if (sum >= thresholds.friendly) return "happy";
    return "neutral";
  }

  /**
   * Truncate long backstory text so the modal content stays within a
   * single visible panel. Keeps trailing ellipsis when cut.
   */
  private truncateBackstory(text: string): string {
    if (text.length <= BACKSTORY_MAX_CHARS) return text;
    return text.slice(0, BACKSTORY_MAX_CHARS).trimEnd() + "…";
  }

  // ───────────────────────────────────────────────────────────────────────
  // Grid
  // ───────────────────────────────────────────────────────────────────────

  private renderGrid(
    entries: Array<{ def: CharacterDef; state: RelationshipState }>,
    camW: number,
  ): void {
    const d = DPR;
    const cellW = PORTRAIT_SIZE * d;
    const colGap = GRID_COL_GAP * d;
    const rowGap = GRID_ROW_GAP * d;

    // Phase 2A+: wrap the grid in a scrollable Container so galleries with
    // many characters (Phase 2B+) scroll vertically instead of overflowing
    // below the back button.
    const layer = this.add.container(0, 0);
    this.gridLayer = layer;

    // Center the whole grid horizontally. Width = cols * cell + (cols-1) * gap.
    const gridWidth = GRID_COLS * cellW + (GRID_COLS - 1) * colGap;
    const startX = (camW - gridWidth) / 2 + cellW / 2;
    const startY = GRID_TOP_Y * d + SAFE_AREA.top * d + cellW / 2;
    const rowHeight = cellW + rowGap + 36 * d;

    let lastRowY = startY;
    entries.forEach((entry, idx) => {
      const col = idx % GRID_COLS;
      const row = Math.floor(idx / GRID_COLS);
      const x = startX + col * (cellW + colGap);
      const y = startY + row * rowHeight;
      lastRowY = Math.max(lastRowY, y);
      this.createGridEntry(entry.def, entry.state, x, y, layer);
    });

    // Compute scroll bounds — overflow between last grid row bottom and the
    // viewport bottom (above the back button) becomes the negative Y range.
    const camH = this.cameras.main.height;
    const viewportBottom = camH - 110 * d - SAFE_AREA.bottom * d;
    const contentBottom = lastRowY + cellW / 2 + 36 * d;
    const overflow = Math.max(0, contentBottom - viewportBottom);
    this.scrollMinY = -overflow;
    this.scrollY = Phaser.Math.Clamp(this.scrollY, this.scrollMinY, 0);
    layer.setY(this.scrollY);

    this.setupScroll();
  }

  /**
   * Install scene-wide pointer handlers for drag-scroll of `gridLayer`.
   * Tap-on-portrait opens the modal; drag scrolls instead.
   */
  private setupScroll(): void {
    let dragStartY = 0;
    let dragStartScrollY = 0;
    let dragging = false;

    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      dragStartY = p.y;
      dragStartScrollY = this.scrollY;
      dragging = false;
      this.scrollDraggedThisGesture = false;
    });

    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (!p.isDown || !this.gridLayer) return;
      const delta = p.y - dragStartY;
      if (!dragging && Math.abs(delta) < SCROLL_DRAG_THRESHOLD) return;
      dragging = true;
      this.scrollDraggedThisGesture = true;
      const newY = Phaser.Math.Clamp(
        dragStartScrollY + delta,
        this.scrollMinY,
        0,
      );
      this.scrollY = newY;
      this.gridLayer.setY(newY);
    });
  }

  private createGridEntry(
    def: CharacterDef,
    state: RelationshipState,
    x: number,
    y: number,
    layer: Phaser.GameObjects.Container,
  ): void {
    const d = DPR;
    const portraitSize = PORTRAIT_SIZE * d;
    const emotion = this.pickEmotion(def, state);

    const portrait = new CharacterPortrait(this, x, y, {
      size: portraitSize,
      initial: def.name.charAt(0),
      emotion,
      textures: {
        neutral: def.assets.portraitNeutral,
        cold: def.assets.portraitCold,
        angry: def.assets.portraitAngry,
        surprised: def.assets.portraitSurprised,
        seductive: def.assets.portraitSeductive,
        happy: def.assets.portraitHappy,
        sad: def.assets.portraitSad,
      },
    });
    portrait.setSize(portraitSize, portraitSize);
    portrait.setInteractive(
      new Phaser.Geom.Rectangle(
        -portraitSize / 2,
        -portraitSize / 2,
        portraitSize,
        portraitSize,
      ),
      Phaser.Geom.Rectangle.Contains,
    );
    portrait.on("pointerdown", () => {
      if (this.scrollDraggedThisGesture) return;
      this.openModal(def, state);
    });

    // Name label below the portrait.
    const nameText = this.add
      .text(x, y + portraitSize / 2 + LABEL_GAP * d, def.name, {
        fontSize: `${16 * d}px`,
        color: "#f4e4c1",
        fontFamily: FONT,
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    layer.add([portrait, nameText]);

    if (this.completedCharacterIds.has(def.id)) {
      const badge = this.add
        .text(
          x,
          y + portraitSize / 2 + LABEL_GAP * d + 18 * d + DEFEATED_BADGE_GAP * d,
          "Побеждена ✓",
          {
            fontSize: `${12 * d}px`,
            color: "#4caf50",
            fontFamily: FONT,
            fontStyle: "italic",
          },
        )
        .setOrigin(0.5);
      layer.add(badge);
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // Modal
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Open the detail modal. Only one modal is shown at a time — re-opening
   * destroys the prior layer first.
   */
  private openModal(def: CharacterDef, state: RelationshipState): void {
    this.closeModal();

    const camW = this.cameras.main.width;
    const camH = this.cameras.main.height;
    const cx = camW / 2;
    const cy = camH / 2;
    const d = DPR;

    const layer = this.add.container(0, 0);
    layer.setDepth(1000);
    this.modalLayer = layer;

    // Backdrop — full screen, closes the modal on pointerdown. This is the
    // LOWEST interactive object in the modal stack; the panel above it will
    // absorb taps that land on the panel itself.
    const backdrop = this.add
      .rectangle(0, 0, camW, camH, MODAL_BG_COLOR, MODAL_BG_ALPHA)
      .setOrigin(0)
      .setInteractive({ useHandCursor: false });
    backdrop.on("pointerdown", () => this.closeModal());
    layer.add(backdrop);

    const panelWidth = camW * MODAL_PANEL_WIDTH_RATIO;
    const panelHeight = camH * MODAL_PANEL_HEIGHT_RATIO;

    // Panel — drawn ABOVE the backdrop, marked interactive with no handler
    // so Phaser delivers pointerdowns here instead of the backdrop. This is
    // the RISK-6 mitigation: tapping inside the panel area never reaches
    // the backdrop's close handler.
    const panel = this.add
      .rectangle(cx, cy, panelWidth, panelHeight, MODAL_PANEL_COLOR, MODAL_PANEL_ALPHA)
      .setStrokeStyle(MODAL_PANEL_STROKE_WIDTH * d, MODAL_PANEL_STROKE)
      .setInteractive({ useHandCursor: false });
    // Intentional no-op: absorbs pointerdown so it does not bubble to backdrop.
    panel.on("pointerdown", () => {});
    layer.add(panel);

    // Content coordinates — relative to panel top.
    const panelTopY = cy - panelHeight / 2;
    let y = panelTopY + 40 * d;

    // Big portrait.
    const modalPortrait = new CharacterPortrait(this, cx, y + (MODAL_PORTRAIT_SIZE * d) / 2, {
      size: MODAL_PORTRAIT_SIZE * d,
      initial: def.name.charAt(0),
      emotion: this.pickEmotion(def, state),
      textures: {
        neutral: def.assets.portraitNeutral,
        cold: def.assets.portraitCold,
        angry: def.assets.portraitAngry,
        surprised: def.assets.portraitSurprised,
        seductive: def.assets.portraitSeductive,
        happy: def.assets.portraitHappy,
        sad: def.assets.portraitSad,
      },
    });
    layer.add(modalPortrait);
    y += MODAL_PORTRAIT_SIZE * d + 16 * d;

    // Name.
    const nameText = this.add
      .text(cx, y, def.name, {
        fontSize: `${24 * d}px`,
        color: MODAL_TITLE_COLOR,
        fontFamily: FONT,
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 3 * d,
      })
      .setOrigin(0.5, 0);
    layer.add(nameText);
    y += 36 * d;

    // Defeated badge.
    if (this.completedCharacterIds.has(def.id)) {
      const defeatedText = this.add
        .text(cx, y, "Побеждена ✓", {
          fontSize: `${14 * d}px`,
          color: "#4caf50",
          fontFamily: FONT,
          fontStyle: "italic",
        })
        .setOrigin(0.5, 0);
      layer.add(defeatedText);
      y += 22 * d;
    }

    // Backstory.
    const backstoryWidth = panelWidth - 48 * d;
    const backstoryText = this.add
      .text(cx, y, this.truncateBackstory(def.backstory), {
        fontSize: `${13 * d}px`,
        color: MODAL_BACKSTORY_COLOR,
        fontFamily: FONT,
        fontStyle: "italic",
        wordWrap: { width: backstoryWidth },
        align: "center",
      })
      .setOrigin(0.5, 0);
    layer.add(backstoryText);
    y += backstoryText.height + 18 * d;

    // Section header.
    const sectionHeader = this.add
      .text(cx, y, "── Отношения ──", {
        fontSize: `${14 * d}px`,
        color: MODAL_SECTION_HEADER_COLOR,
        fontFamily: FONT,
      })
      .setOrigin(0.5, 0);
    layer.add(sectionHeader);
    y += 24 * d;

    // Relationship meter.
    const meterWidth = panelWidth * MODAL_METER_WIDTH_RATIO;
    const meter = new RelationshipMeter(
      this,
      cx - meterWidth / 2,
      y,
      meterWidth,
      MODAL_METER_ROW_HEIGHT * d,
    );
    meter.setValues({
      empathy: state.empathy,
      dominance: state.dominance,
      cynicism: state.cynicism,
    });
    layer.add(meter);
    // RelationshipMeter internal ROW_GAP = 6 is in physical px (not DPR-scaled
    // by the component). rowHeight passed in is already DPR-scaled. So total
    // height = (rowHeight * d) * 3 + 6 * 2. Do NOT apply `* d` to the gap.
    y += MODAL_METER_ROW_HEIGHT * d * 3 + 6 * 2 + 18 * d;

    // Status line.
    const status = this.computeStatus(def, state);
    const statusText = this.add
      .text(cx, y, status.label, {
        fontSize: `${16 * d}px`,
        color: status.color,
        fontFamily: FONT,
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0);
    layer.add(statusText);

    // Close button — bottom of panel.
    const closeY = cy + panelHeight / 2 - 48 * d;
    const closeButton = this.createCloseButton(cx, closeY);
    layer.add(closeButton.bg);
    layer.add(closeButton.text);
  }

  private closeModal(): void {
    if (this.modalLayer) {
      this.modalLayer.destroy();
      this.modalLayer = undefined;
    }
  }

  private createCloseButton(
    x: number,
    y: number,
  ): { bg: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text } {
    const d = DPR;
    const width = CLOSE_BUTTON_WIDTH * d;
    const height = CLOSE_BUTTON_HEIGHT * d;

    const bg = this.add
      .rectangle(x, y, width, height, CLOSE_BG, 0.95)
      .setStrokeStyle(2 * d, CLOSE_STROKE)
      .setInteractive({ useHandCursor: true });

    const text = this.add
      .text(x, y, "Закрыть", {
        fontSize: `${18 * d}px`,
        color: CLOSE_TEXT,
        fontFamily: FONT,
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    bg.on("pointerover", () => {
      bg.setFillStyle(CLOSE_BG_HOVER, 1);
      text.setColor(CLOSE_TEXT_HOVER);
    });
    bg.on("pointerout", () => {
      bg.setFillStyle(CLOSE_BG, 0.95);
      text.setColor(CLOSE_TEXT);
    });
    bg.on("pointerdown", () => this.closeModal());

    return { bg, text };
  }

  // ───────────────────────────────────────────────────────────────────────
  // Back button
  // ───────────────────────────────────────────────────────────────────────

  private createBackButton(x: number, y: number, onClick: () => void): void {
    const d = DPR;
    const width = BACK_BUTTON_WIDTH * d;
    const height = BACK_BUTTON_HEIGHT * d;

    const bg = this.add
      .rectangle(x, y, width, height, BACK_BG, 0.95)
      .setStrokeStyle(2 * d, BACK_STROKE)
      .setInteractive({ useHandCursor: true });

    const text = this.add
      .text(x, y, "← В Hub", {
        fontSize: `${18 * d}px`,
        color: BACK_TEXT,
        fontFamily: FONT,
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    bg.on("pointerover", () => {
      bg.setFillStyle(BACK_BG_HOVER, 1);
      text.setColor(BACK_TEXT_HOVER);
    });
    bg.on("pointerout", () => {
      bg.setFillStyle(BACK_BG, 0.95);
      text.setColor(BACK_TEXT);
    });
    bg.on("pointerdown", onClick);
  }
}
