/**
 * ItemCardModal — scene-bound modal showing a full item detail card.
 *
 * Phase 2B — first reusable modal component in `src/v2/ui/`.
 *
 * Follows the gold standard "backdrop closes, panel absorbs" pattern
 * (`.conventions/gold-standards/ui-component.ts §12`):
 *
 *   - A full-screen interactive backdrop listens for `pointerdown` and closes
 *     the modal.
 *   - The panel drawn above the backdrop is ALSO interactive but its
 *     `pointerdown` handler is a no-op. Phaser's topmost-interactive routing
 *     delivers pointerdowns landing inside the panel to the panel, so they
 *     never reach the backdrop's close handler.
 *   - Content inside the panel (close button, stat rows, etc.) is stacked on
 *     top of the panel and remains interactive as usual.
 *
 * Depth = 2100 — above Toast at 2000. Per item-info-display DECISIONS R2B-1:
 * Toast (2000) = non-blocking notifications; modals (≥2100) = blocking
 * overlays. Task #3 updates Toast's docstring and CLAUDE.md depth map to
 * match this convention.
 *
 * Scene-bound lifecycle: a single instance manages one modal at a time. The
 * singleton `itemCardModal` mirrors the `toast` pattern — callers import the
 * instance and call `itemCardModal.open(scene, opts)`. Re-opening while a
 * prior modal is visible is idempotent: the previous layer is destroyed
 * first. A SHUTDOWN handler installed in `open()` is a safety net for the
 * host scene tearing down mid-modal.
 *
 * v2-isolation: imports only from `phaser`, `../../game/config` (DPR),
 * `../content/types` (type-only), and `./itemFormat`. No scene imports.
 */

import Phaser from "phaser";
import { DPR } from "../../game/config";
import type { ItemDef } from "../content/types";
import {
  RARITY_COLOR_BY_TIER,
  RARITY_LABEL,
  SLOT_LABELS,
  buildUnifiedStatView,
} from "./itemFormat";

// ─────────────────────────────────────────────────────────────────────────────
// Constants — reuse existing v2 palette; do NOT invent new colors.
// ─────────────────────────────────────────────────────────────────────────────

const FONT = "'Exo 2', Arial, sans-serif";

const BODY_COLOR = "#d4b8e8";
const SECTION_HEADER_COLOR = "#9f7fc7";
const SUBTITLE_COLOR = "#9f7fc7";
const POSITIVE_DELTA_COLOR = "#4caf50";
const NEGATIVE_DELTA_COLOR = "#e64a4a";

const BACKDROP_COLOR = 0x000000;
const BACKDROP_ALPHA = 0.78;

const PANEL_COLOR = 0x1a0f2e;
const PANEL_ALPHA = 0.98;
const PANEL_STROKE_COLOR = 0xe6c068;
const PANEL_STROKE_WIDTH = 2;
const PANEL_WIDTH_RATIO = 0.86;
const PANEL_MAX_HEIGHT_RATIO = 0.78;

const MODAL_DEPTH = 2100;

// Close button palette mirrors CharacterGalleryScene.createCloseButton.
const CLOSE_BG = 0x4a2d6e;
const CLOSE_BG_HOVER = 0x6a4a90;
const CLOSE_STROKE = 0xe6c068;
const CLOSE_TEXT = "#f4e4c1";
const CLOSE_TEXT_HOVER = "#ffffff";
const CLOSE_BUTTON_WIDTH = 180;
const CLOSE_BUTTON_HEIGHT = 44;

// Layout spacing — logical (pre-DPR) units.
const PADDING_X = 24;
const PADDING_TOP = 28;
const PADDING_BOTTOM = 16;
const TITLE_GAP = 10;
const SUBTITLE_GAP = 22;
const STATS_HEADER_GAP = 12;
const STAT_ROW_GAP = 22;
/** Vertical gap between the stats block and the "── Описание ──" header. */
const STATS_TO_DESCRIPTION_GAP = 6;
/** Vertical gap between the description header and the description body. */
const DESCRIPTION_HEADER_GAP = 12;
const DESCRIPTION_GAP = 18;

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export interface ItemCardModalOptions {
  item: ItemDef;
  /** If provided, render comparison deltas against this equipped item. */
  comparisonBase?: ItemDef;
  /** Called after `close()` completes its teardown. */
  onClose?: () => void;
}

/**
 * Scene-bound modal instance. Only one modal at a time — re-opening closes
 * the prior modal first. Call via the exported `itemCardModal` singleton.
 *
 * Deliberate state minimization: we do NOT store a separate scene reference
 * as a field. The layer's implicit scene binding (`layer.scene`) is the
 * single source of truth, checked by `isOpen()`. Keeping fewer fields makes
 * the close/isOpen state machine simpler and avoids a stale-reference race
 * during scene shutdown.
 */
export class ItemCardModal {
  private layer?: Phaser.GameObjects.Container;
  private onCloseCb?: () => void;

  /**
   * Open the modal. Idempotent re-open: any prior modal is closed first.
   * Installs a one-shot SHUTDOWN handler on the host scene as a safety net
   * so a scene tear-down mid-modal cannot leak the container reference.
   *
   * `opts.onClose` is invoked by user-driven close paths (backdrop tap,
   * close button tap) and by the SHUTDOWN safety-net handler. NOTE: if the
   * host scene has already torn down the layer by the time `close()` runs,
   * the defensive `isOpen()` cleanup may short-circuit and the callback
   * will NOT fire. Consumers that need strong "always fires" semantics
   * should not rely on `onClose` for teardown-critical work.
   */
  open(scene: Phaser.Scene, opts: ItemCardModalOptions): void {
    // Idempotent re-open: close any prior modal first.
    if (this.isOpen()) this.close();

    this.onCloseCb = opts.onClose;

    const d = DPR;
    const camW = scene.cameras.main.width;
    const camH = scene.cameras.main.height;
    const cx = camW / 2;
    const cy = camH / 2;

    const layer = scene.add.container(0, 0);
    layer.setDepth(MODAL_DEPTH);

    // Backdrop — full screen, closes modal on pointerdown. This is the
    // LOWEST interactive object in the modal stack; the panel above absorbs
    // taps that land inside the panel rect.
    const backdrop = scene.add
      .rectangle(0, 0, camW, camH, BACKDROP_COLOR, BACKDROP_ALPHA)
      .setOrigin(0)
      .setInteractive({ useHandCursor: false });
    // BUG-2 fix (event propagation race): stopPropagation halts the
    // Phaser dispatch cascade at GAMEOBJECT_POINTER_DOWN (step 1) so the
    // scene-global POINTER_DOWN (step 3) never fires. Without this,
    // scene-level pointerdown handlers in the HOST scene would still
    // receive the tap AFTER close() has already torn down state — they
    // would see `isOpen() = false`, skip their modal-open bail, and
    // record a stale dragStart from the backdrop tap. See tech-lead
    // Task #2 review round 2 for the full trace.
    backdrop.on(
      "pointerdown",
      (
        _p: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation();
        this.close();
      },
    );
    layer.add(backdrop);

    const panelWidth = camW * PANEL_WIDTH_RATIO;
    const maxPanelHeight = camH * PANEL_MAX_HEIGHT_RATIO;
    const innerWidth = panelWidth - PADDING_X * 2 * d;

    // Content container — children rendered at absolute scene coordinates,
    // then the panel rectangle is sized to fit around them. We create the
    // content first so we can read `.height` on wrapped text before locking
    // the panel dimensions (EDIT 8 — read-after-create, no 2-pass layout).
    const contentLayer = scene.add.container(0, 0);
    layer.add(contentLayer);

    let y = cy - maxPanelHeight / 2 + PADDING_TOP * d;
    const panelTopY = y - PADDING_TOP * d;

    // Local text factory — one shared implementation for all ~10 text
    // objects in this modal. Smaller bundle than 10 inline style object
    // literals. Every caller composes a partial style object that
    // extends the shared defaults (FONT family, BODY_COLOR). Origin is
    // `(0.5, 0)` by default; explicit overrides via the `originX` arg.
    const mkText = (
      x: number,
      ty: number,
      str: string,
      style: Partial<Phaser.Types.GameObjects.Text.TextStyle>,
      originX = 0.5,
      originY = 0,
    ): Phaser.GameObjects.Text => {
      const t = scene.add
        .text(x, ty, str, {
          fontFamily: FONT,
          color: BODY_COLOR,
          ...style,
        })
        .setOrigin(originX, originY);
      contentLayer.add(t);
      return t;
    };

    // Title — item name in rarity color.
    const rarityColor = RARITY_COLOR_BY_TIER[opts.item.rarity];
    const titleText = mkText(cx, y, opts.item.name, {
      fontSize: `${20 * d}px`,
      color: rarityColor,
      fontStyle: "bold",
      stroke: "#000000",
      strokeThickness: 3 * d,
      align: "center",
      wordWrap: { width: innerWidth },
    });
    y += titleText.height + TITLE_GAP * d;

    // Slot + rarity subtitle.
    const subtitle = `${SLOT_LABELS[opts.item.slot]} • ${RARITY_LABEL[opts.item.rarity]}`;
    const subtitleText = mkText(cx, y, subtitle, {
      fontSize: `${14 * d}px`,
      color: SUBTITLE_COLOR,
      fontStyle: "italic",
    });
    y += subtitleText.height + SUBTITLE_GAP * d;

    // ── Статы ── section.
    const statsHeader = mkText(cx, y, "── Статы ──", {
      fontSize: `${14 * d}px`,
      color: SECTION_HEADER_COLOR,
    });
    y += statsHeader.height + STATS_HEADER_GAP * d;

    // Stat rows — single pass over `buildUnifiedStatView` which merges the
    // item's own stats with the comparison deltas and returns rows in the
    // fixed STAT_ORDER (hp → mp → physAttack → magAttack → crit).
    //
    // A row with `value === 0` represents a "lost" stat (the candidate no
    // longer carries it) — rendered with only the red delta, no "+0" noise.
    // A row with `delta` undefined is the non-comparison path (viewing an
    // equipped item's own stats, no comparisonBase provided).
    const unifiedRows = buildUnifiedStatView(opts.item, opts.comparisonBase);
    const rowStyle: Partial<Phaser.Types.GameObjects.Text.TextStyle> = {
      fontSize: `${14 * d}px`,
    };
    const valueStyle: Partial<Phaser.Types.GameObjects.Text.TextStyle> = {
      fontSize: `${14 * d}px`,
      color: rarityColor,
      fontStyle: "bold",
    };

    if (unifiedRows.length === 0) {
      const emptyStatsText = mkText(cx, y, "нет статов", {
        fontSize: `${13 * d}px`,
        fontStyle: "italic",
      });
      y += emptyStatsText.height + 8 * d;
    } else {
      const labelX = cx - innerWidth / 2 + 8 * d;
      const valueX = cx + innerWidth / 2 - 8 * d;
      for (const row of unifiedRows) {
        mkText(labelX, y, row.label, rowStyle, 0);

        if (row.delta !== undefined) {
          // Render delta FIRST at valueX (right edge) so we know its width,
          // then right-align the value text to `valueX - deltaWidth - gap`.
          const deltaStr = `(${row.delta >= 0 ? "+" : ""}${row.delta})`;
          const deltaText = mkText(
            valueX,
            y,
            deltaStr,
            {
              fontSize: `${13 * d}px`,
              color: row.delta >= 0 ? POSITIVE_DELTA_COLOR : NEGATIVE_DELTA_COLOR,
              fontStyle: "bold",
            },
            1,
          );

          // Only render the value column when the candidate still carries
          // this stat. For lost stats (value === 0) the red delta alone
          // conveys the loss — no misleading "+0" printed.
          if (row.value > 0) {
            mkText(valueX - deltaText.width - 6 * d, y, `+${row.value}`, valueStyle, 1);
          }
        } else {
          mkText(valueX, y, `+${row.value}`, valueStyle, 1);
        }

        y += STAT_ROW_GAP * d;
      }
    }

    y += STATS_TO_DESCRIPTION_GAP * d;

    // ── Описание ── section.
    const descriptionHeader = mkText(cx, y, "── Описание ──", {
      fontSize: `${14 * d}px`,
      color: SECTION_HEADER_COLOR,
    });
    y += descriptionHeader.height + DESCRIPTION_HEADER_GAP * d;

    const descriptionText = mkText(cx, y, opts.item.description, {
      fontSize: `${13 * d}px`,
      fontStyle: "italic",
      wordWrap: { width: innerWidth },
      align: "center",
    });
    y += descriptionText.height + DESCRIPTION_GAP * d;

    // Close button position (bottom of content).
    const closeButtonY = y + (CLOSE_BUTTON_HEIGHT * d) / 2;
    y = closeButtonY + (CLOSE_BUTTON_HEIGHT * d) / 2 + PADDING_BOTTOM * d;

    // Compute final panel height from measured content, clamped to max.
    // TODO Phase 2B: dynamic panel centering (align panel midline to the
    // content midpoint) for short content, OR scrollable content area for
    // legendary-with-long-description overflow past maxPanelHeight.
    const measuredHeight = y - panelTopY;
    const panelHeight = Math.min(measuredHeight, maxPanelHeight);
    const panelFinalCenterY = panelTopY + panelHeight / 2;

    // Panel — drawn ABOVE the backdrop, marked interactive with no handler
    // so Phaser delivers pointerdowns here instead of the backdrop.
    const panel = scene.add
      .rectangle(cx, panelFinalCenterY, panelWidth, panelHeight, PANEL_COLOR, PANEL_ALPHA)
      .setStrokeStyle(PANEL_STROKE_WIDTH * d, PANEL_STROKE_COLOR)
      .setInteractive({ useHandCursor: false });
    // Absorbs taps that land on the panel area (prevents the backdrop
    // below from receiving them). BUG-2 fix: ALSO stopPropagation so the
    // scene-global POINTER_DOWN cascade is halted — otherwise host-scene
    // pointerdown handlers would fire for panel-area taps even though the
    // panel "absorbed" them at the GameObject event layer.
    panel.on(
      "pointerdown",
      (
        _p: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation();
      },
    );
    // Insert panel BETWEEN backdrop and content so content renders on top.
    layer.addAt(panel, 1);

    // Close button — rounded rect + label, stacked above the content.
    const closeButton = this.createCloseButton(scene, cx, closeButtonY);
    layer.add(closeButton.bg);
    layer.add(closeButton.text);

    this.layer = layer;

    // Safety net: if the host scene shuts down while the modal is open,
    // close() ourselves. Task #2 will also install a scene-level SHUTDOWN
    // handler in PlayerStatsScene — having BOTH is correct layered defense.
    // `.once` auto-removes after firing.
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.close();
    });
  }

  /**
   * Close the modal. Idempotent — safe to call when already closed. Snapshot
   * the onClose callback BEFORE clearing state so it can't observe a
   * half-torn-down instance. Any callback throw is caught and logged so a
   * bad consumer cannot leak the modal's state refs.
   */
  close(): void {
    if (!this.isOpen()) return;
    // Snapshot callback BEFORE clearing state so it can't access torn-down fields.
    const cb = this.onCloseCb;
    // layer may already be dead if the scene destroyed it; destroy is a
    // no-op in that case but we still need to clear our refs.
    try {
      this.layer?.destroy(true);
    } catch {
      /* layer already dead */
    }
    this.layer = undefined;
    this.onCloseCb = undefined;
    // Invoke callback AFTER full state reset; catch so bad callbacks don't
    // leak state or corrupt the modal instance for the next open().
    try {
      cb?.();
    } catch (e) {
      console.warn("[ItemCardModal] onClose callback threw", e);
    }
  }

  /**
   * Defensive open-check: if the layer reference exists but its scene is
   * gone or the layer was destroyed by Phaser's shutdown pass
   * (`active === false`), treat as closed and silently clean up the
   * dangling reference.
   */
  isOpen(): boolean {
    if (!this.layer) return false;
    if (!this.layer.scene || !this.layer.active) {
      this.layer = undefined;
      this.onCloseCb = undefined;
      return false;
    }
    return true;
  }

  /**
   * Builds the "Закрыть" button. Mirrors CharacterGalleryScene's close
   * button so the two modals look identical; duplicated locally to keep
   * ItemCardModal fully self-contained (no scene imports).
   */
  private createCloseButton(
    scene: Phaser.Scene,
    x: number,
    y: number,
  ): { bg: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text } {
    const d = DPR;
    const width = CLOSE_BUTTON_WIDTH * d;
    const height = CLOSE_BUTTON_HEIGHT * d;

    const bg = scene.add
      .rectangle(x, y, width, height, CLOSE_BG, 0.95)
      .setStrokeStyle(2 * d, CLOSE_STROKE)
      .setInteractive({ useHandCursor: true });

    const text = scene.add
      .text(x, y, "Закрыть", {
        fontSize: `${16 * d}px`,
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
    // BUG-2 fix (event propagation race): same rationale as backdrop and
    // panel handlers. Without stopPropagation, tapping "Закрыть" fires
    // the close() path, then cascades to the scene-global POINTER_DOWN
    // which records a spurious dragStart after the modal is gone.
    bg.on(
      "pointerdown",
      (
        _p: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation();
        this.close();
      },
    );

    return { bg, text };
  }
}

/** Singleton instance — mirrors `toast` from `./Toast`. */
export const itemCardModal = new ItemCardModal();
