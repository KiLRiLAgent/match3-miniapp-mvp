/**
 * modalChrome — shared modal backdrop / panel / close-button factories.
 *
 * Phase 2B R2B-2 dedup — extracted from the ItemCardModal + CharacterGallery
 * modal pattern. Provides the reusable scaffolding described in gold standard
 * §12 (backdrop closes, panel absorbs) so future modals (SellConfirmModal,
 * perk selection, etc.) do not duplicate the same 30+ lines of backdrop +
 * panel + close-button wiring.
 *
 * NOTE: ItemCardModal itself is NOT migrated to use this module in Phase 2B —
 * migration deferred to Phase 2C per architect consensus. This file only
 * EXTRACTS the pattern; consumers opt in.
 *
 * v2-isolation: imports from `phaser`, `../../game/config` (DPR), `./theme`.
 */

import Phaser from "phaser";
import { DPR } from "../../game/config";
import { V2_COLORS, V2_FONTS } from "./theme";

// ─── Constants ───────────────────────────────────────────────────────────────

const BACKDROP_COLOR = 0x000000;
const BACKDROP_ALPHA = 0.78;

const PANEL_COLOR = 0x1a0f2e;
const PANEL_ALPHA = 0.98;
const PANEL_STROKE_COLOR = 0xe6c068;
const PANEL_STROKE_WIDTH = 2;

const CLOSE_BUTTON_WIDTH = 180;
const CLOSE_BUTTON_HEIGHT = 44;

// ─── Backdrop ────────────────────────────────────────────────────────────────

/**
 * Full-screen interactive backdrop. Pointerdown fires `onClose` and calls
 * `event.stopPropagation()` per gold standard §12 / §7 (prevents scene-level
 * POINTER_DOWN from priming drag state after the modal has already closed).
 *
 * Caller adds the returned Rectangle to a Container (the modal layer).
 */
export function createModalBackdrop(
  scene: Phaser.Scene,
  onClose: () => void,
): Phaser.GameObjects.Rectangle {
  const camW = scene.cameras.main.width;
  const camH = scene.cameras.main.height;

  const backdrop = scene.add
    .rectangle(0, 0, camW, camH, BACKDROP_COLOR, BACKDROP_ALPHA)
    .setOrigin(0)
    .setInteractive({ useHandCursor: false });

  backdrop.on(
    "pointerdown",
    (
      _p: Phaser.Input.Pointer,
      _x: number,
      _y: number,
      event: Phaser.Types.Input.EventData,
    ) => {
      event.stopPropagation();
      onClose();
    },
  );

  return backdrop;
}

// ─── Panel ───────────────────────────────────────────────────────────────────

export interface ModalPanelOptions {
  /** Panel width in physical pixels. */
  width: number;
  /** Panel height in physical pixels. */
  height: number;
}

/**
 * Interactive panel rectangle that absorbs pointerdown (no-op handler) so
 * taps inside the panel do not bubble to the backdrop's close handler.
 * Stroke matches the gold V2 palette.
 *
 * Caller adds the returned Rectangle to the modal Container, ABOVE the
 * backdrop.
 */
export function createModalPanel(
  scene: Phaser.Scene,
  cx: number,
  cy: number,
  opts: ModalPanelOptions,
): Phaser.GameObjects.Rectangle {
  const d = DPR;
  const panel = scene.add
    .rectangle(cx, cy, opts.width, opts.height, PANEL_COLOR, PANEL_ALPHA)
    .setStrokeStyle(PANEL_STROKE_WIDTH * d, PANEL_STROKE_COLOR)
    .setInteractive({ useHandCursor: false });

  // Intentional no-op — absorbs pointerdown so it does not reach backdrop.
  // stopPropagation for consistency with close-path handlers (§7).
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

  return panel;
}

// ─── Close button ────────────────────────────────────────────────────────────

/**
 * "Закрыть" close button — primary-styled (gold accent). Returns `{ bg, text }`
 * so the caller can add both to the modal Container.
 *
 * The button's pointerdown handler calls `onClose` with stopPropagation per §7.
 */
export function createModalCloseButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  onClose: () => void,
  opts?: { label?: string; widthDp?: number; heightDp?: number },
): { bg: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text } {
  const d = DPR;
  const label = opts?.label ?? "Закрыть";
  const width = (opts?.widthDp ?? CLOSE_BUTTON_WIDTH) * d;
  const height = (opts?.heightDp ?? CLOSE_BUTTON_HEIGHT) * d;

  const bg = scene.add
    .rectangle(x, y, width, height, V2_COLORS.primaryBg, 0.95)
    .setStrokeStyle(2 * d, V2_COLORS.primaryStroke)
    .setInteractive({ useHandCursor: true });

  const text = scene.add
    .text(x, y, label, {
      fontSize: `${18 * d}px`,
      color: V2_COLORS.primaryText,
      fontFamily: V2_FONTS.primary,
      fontStyle: "bold",
    })
    .setOrigin(0.5);

  bg.on("pointerover", () => {
    bg.setFillStyle(V2_COLORS.primaryBgHover, 1);
    text.setColor(V2_COLORS.primaryTextHover);
  });
  bg.on("pointerout", () => {
    bg.setFillStyle(V2_COLORS.primaryBg, 0.95);
    text.setColor(V2_COLORS.primaryText);
  });
  bg.on(
    "pointerdown",
    (
      _p: Phaser.Input.Pointer,
      _x: number,
      _y: number,
      event: Phaser.Types.Input.EventData,
    ) => {
      event.stopPropagation();
      onClose();
    },
  );

  return { bg, text };
}
