/**
 * Toast — non-blocking notification component for v2.
 *
 * Used by SaveManager (save errors), DialogueRunner (failed effects),
 * CombatBridgeScene (missing encounter), LocationScene (asset errors),
 * DialogueScene (empty choices fallback).
 *
 * Lifecycle is scene-bound: every toast is created on the *currently active*
 * scene via `scene.add.existing(container)`, and uses `scene.tweens.add(...)`
 * for fade in/out — both die automatically on `scene.shutdown` so toasts
 * cannot leak across scene transitions (R4 / RISK-1).
 *
 * No global JS timers and no Phaser global TweenManager singleton — only
 * scene-bound `scene.tweens.add` is used. Per R4 in DECISIONS.md.
 *
 * Multiple active toasts on the same scene stack vertically: the manager
 * tracks live toasts per-scene and offsets each new one a fixed gap below
 * the previous live toast's bottom edge.
 *
 * Container child pattern follows the v2 gold standard:
 *   .conventions/gold-standards/ui-component.ts §9
 *
 * Depth = 2000 — non-blocking notification layer. Above cutscenes (≥500
 * used by GameScene) and legacy modals (1000), but BELOW blocking modal
 * overlays which reserve depth 2100+ (e.g. ItemCardModal per R2B-3). If a
 * blocking modal is open when a Toast event fires, the toast renders
 * underneath the modal backdrop — user sees it after closing the modal.
 * Matches blocking-overlay UX expectations. See CLAUDE.md depth layer map,
 * `.conventions/gold-standards/toast-notifications.ts` §3, and DECISIONS R4
 * (original) + R2B-3 (Phase 2B convention revision).
 */

import Phaser from "phaser";
import { DPR, SAFE_AREA } from "../../game/config";

export type ToastType = "info" | "warn" | "error";

export interface ToastOptions {
  message: string;
  type?: ToastType;
  durationMs?: number;
}

interface ToastPalette {
  bg: number;
  text: string;
  stroke: number;
}

const PALETTE: Record<ToastType, ToastPalette> = {
  info: { bg: 0x2a1845, text: "#e6c068", stroke: 0xe6c068 },
  warn: { bg: 0x6e4a1a, text: "#ffeac0", stroke: 0xffeac0 },
  error: { bg: 0x6e1a1a, text: "#ffd0d0", stroke: 0xffd0d0 },
};

const DEFAULT_DURATION_MS = 3000;
const FADE_MS = 200;
const DEPTH = 2000;

const FONT_SIZE = 14;
const FONT_FAMILY = "'Exo 2', Arial, sans-serif";
const PADDING_X = 18;
const PADDING_Y = 10;
const RADIUS = 14;
const BG_ALPHA = 0.94;
const STROKE_WIDTH = 2;
const STROKE_ALPHA = 0.85;
const MAX_WIDTH_RATIO = 0.8;
const MIN_WIDTH_RATIO = 0.35;

const TOP_OFFSET = 12;
const STACK_GAP = 6;
const SHIFT_DURATION_MS = 150;

// TODO Phase 2: cap message length at ~120 chars or truncate with ellipsis to
// avoid tall multi-line toasts swallowing the screen on small devices when
// 3+ errors stack simultaneously.

interface LiveToast {
  container: Phaser.GameObjects.Container;
  height: number;
}

class ToastManager {
  /** scene → live toasts (vertical stack) */
  private readonly active = new WeakMap<Phaser.Scene, LiveToast[]>();

  /**
   * Show a toast in the given scene. Non-blocking — returns immediately.
   * Auto-destroys after `durationMs` (default 3000) via scene-bound tweens.
   */
  show(scene: Phaser.Scene, options: ToastOptions): void {
    if (!scene || !scene.sys || !scene.add) return;

    const type = options.type ?? "info";
    const duration = Math.max(FADE_MS * 2 + 100, options.durationMs ?? DEFAULT_DURATION_MS);
    const palette = PALETTE[type];
    const d = DPR;

    const camW = scene.cameras.main.width;
    const maxTextWidth = camW * MAX_WIDTH_RATIO - PADDING_X * 2 * d;

    const text = new Phaser.GameObjects.Text(scene, 0, 0, options.message, {
      fontSize: `${FONT_SIZE * d}px`,
      color: palette.text,
      fontFamily: FONT_FAMILY,
      fontStyle: "bold",
      align: "center",
      wordWrap: { width: maxTextWidth },
    });
    text.setOrigin(0.5);

    const widthPx = Math.max(
      camW * MIN_WIDTH_RATIO,
      Math.min(camW * MAX_WIDTH_RATIO, text.width + PADDING_X * 2 * d),
    );
    const heightPx = text.height + PADDING_Y * 2 * d;

    const bg = new Phaser.GameObjects.Graphics(scene);
    bg.fillStyle(palette.bg, BG_ALPHA);
    bg.fillRoundedRect(-widthPx / 2, -heightPx / 2, widthPx, heightPx, RADIUS * d);
    bg.lineStyle(STROKE_WIDTH * d, palette.stroke, STROKE_ALPHA);
    bg.strokeRoundedRect(-widthPx / 2, -heightPx / 2, widthPx, heightPx, RADIUS * d);

    const cx = camW / 2;
    const baseTopY = SAFE_AREA.top * d + TOP_OFFSET * d + heightPx / 2;
    const stackOffset = this.computeStackOffset(scene, d);

    const container = new Phaser.GameObjects.Container(scene, cx, baseTopY + stackOffset);
    container.add([bg, text]);
    container.setDepth(DEPTH);
    container.setAlpha(0);
    scene.add.existing(container);

    const live: LiveToast = { container, height: heightPx };
    const list = this.active.get(scene) ?? [];
    list.push(live);
    this.active.set(scene, list);

    // Cleanup hook: when the scene shuts down, drop our live tracking so a
    // re-entered scene starts with a fresh stack offset.
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.active.delete(scene);
    });

    const holdMs = duration - FADE_MS * 2;

    scene.tweens.add({
      targets: container,
      alpha: 1,
      duration: FADE_MS,
      ease: "Quad.easeOut",
      onComplete: () => {
        scene.tweens.add({
          targets: container,
          alpha: 0,
          delay: holdMs,
          duration: FADE_MS,
          ease: "Quad.easeIn",
          onComplete: () => {
            this.removeLive(scene, live);
            container.destroy();
          },
        });
      },
    });
  }

  private computeStackOffset(scene: Phaser.Scene, d: number): number {
    const list = this.active.get(scene);
    if (!list || list.length === 0) return 0;
    let offset = 0;
    for (const t of list) {
      offset += t.height + STACK_GAP * d;
    }
    return offset;
  }

  private removeLive(scene: Phaser.Scene, live: LiveToast): void {
    const list = this.active.get(scene);
    if (!list) return;
    const idx = list.indexOf(live);
    if (idx < 0) return;
    list.splice(idx, 1);

    // Shift the toasts that were stacked BELOW the removed one upward by the
    // freed slot's height + gap, so subsequent show() calls computeStackOffset
    // doesn't drop new toasts on top of survivors.
    const shiftAmount = live.height + STACK_GAP * DPR;
    for (let i = idx; i < list.length; i++) {
      const target = list[i].container;
      if (!target.scene) continue; // already destroyed
      scene.tweens.add({
        targets: target,
        y: target.y - shiftAmount,
        duration: SHIFT_DURATION_MS,
        ease: "Quad.easeOut",
      });
    }

    if (list.length === 0) this.active.delete(scene);
  }
}

export const toast = new ToastManager();
