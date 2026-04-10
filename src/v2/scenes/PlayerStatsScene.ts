/**
 * PlayerStatsScene — Phase 1B player panel: avatar, level + XP bar,
 * base + equipped stats, equipment slots, and backpack grid.
 *
 * Layout (top → bottom):
 *   1. Title "Статистика"
 *   2. Avatar placeholder circle + player name + "Уровень N"
 *   3. XP bar showing `{xp} / {xpToNext} XP до уровня {N+1}` (or "MAX" at cap)
 *   4. "Базовые статы" section — HP/MP/Физ./Магия/Крит with
 *      "base (+ equip bonus)" format, e.g. "HP: 220 (200 + 20)"
 *   5. "Снаряжение" section — weapon / armor / accessory rows, each
 *      tappable. Tap-to-unequip when occupied; tap-to-auto-equip-first-
 *      compatible when empty.
 *   6. "Рюкзак (N/8)" section — stacked list of backpack items. Tap an item
 *      to equip into its compatible slot (auto-swaps if slot occupied).
 *   7. Back button "← В Hub" at bottom (sceneRouter.pop)
 *
 * Layout rules (non-zoomed v2 scene — see
 * `.conventions/gold-standards/scene-coordinates.md`):
 *   - Multiply coordinates, sizes, font sizes, and stroke widths by DPR.
 *   - Bottom-anchored controls respect `SAFE_AREA.bottom`; top-anchored
 *     controls respect `SAFE_AREA.top`.
 *   - Every interactive element uses `pointerdown` (NOT `pointerup`) per
 *     v2 input convention.
 *
 * Field naming: PlayerStats uses `hp` / `mp` (NOT hpMax / manaMax).
 *
 * v2-isolation: imports only from `src/v2/*` and `src/game/config` (DPR /
 * SAFE_AREA). No v1 scene imports.
 *
 * Re-render strategy: `refresh()` tears down the managed `rootLayer`
 * Container and rebuilds it. Keeps diffs simple and avoids hand-rolled
 * child-update tracking. The `create()` hook draws the immutable
 * background + title, then delegates the rest to `refresh()`.
 *
 * Phase 1C: backpack is paginated at `ITEMS_PER_PAGE = 4` rows per page,
 * with prev/next nav buttons + "Стр. K/N" indicator. Page index lives on
 * the instance (`currentBackpackPage`) so it survives `refresh()` rebuilds
 * but resets when the scene is shut down. After mutations the page is
 * clamped to `[0, totalPages-1]` to handle item-removal edge cases.
 */

import Phaser from "phaser";
import { DPR, SAFE_AREA } from "../../game/config";
import { gameState } from "../core/GameState";
import { sceneRouter } from "../core/SceneRouter";
import { progressionSystem } from "../systems/ProgressionSystem";
import { inventorySystem } from "../systems/InventorySystem";
import { ITEMS } from "../content/items";
import { itemCardModal } from "../ui/ItemCardModal";
import { sellConfirmModal } from "../ui/SellConfirmModal";
import { toast } from "../ui/Toast";
import { getSellPrice } from "../content/items/pricing";
import { createBackButton, createTitle, createSubtitle } from "../ui/SceneChrome";
import {
  RARITY_COLOR_BY_TIER,
  SLOT_LABELS,
  buildStatsSummary,
} from "../ui/itemFormat";
import { V2_COLORS, V2_FONTS } from "../ui/theme";
import type { ItemDef, ItemSlot } from "../content/types";
import type { ItemInstance } from "../core/types";

// Avatar placeholder.
const AVATAR_RADIUS = 36;

// XP bar.
const XP_BAR_BG = 0x222244;
const XP_BAR_FILL = 0x6e4ac8;
const XP_BAR_STROKE = 0xe6c068;
const XP_BAR_WIDTH = 260;
const XP_BAR_HEIGHT = 14;

// Row backgrounds — reuse theme values.
/**
 * Phase 2B widened from 320 → 360 to make room for the inline stats summary
 * column + info icon on equipment and backpack rows. Item-info-display feature.
 */
const ROW_WIDTH = 360;
const ROW_HEIGHT = 40;
const ROW_GAP = 8;

// Phase 2B — info icon layout (logical units, × DPR at render time).
const INFO_ICON_RADIUS = 10;
const INFO_ICON_PADDING_RIGHT = 8;
const INFO_ICON_BG = 0x2a1845;
const INFO_ICON_STROKE = 0xe6c068;
const INFO_ICON_TEXT_COLOR = "#e6c068";
const STATS_SUMMARY_COLOR = "#d4b8e8";
const STATS_SUMMARY_FONT_SIZE = 12;

// Phase 2B — sell icon layout (backpack rows only).
const SELL_ICON_RADIUS = 10;
const SELL_ICON_PADDING_RIGHT = 8;
const SELL_ICON_BG = 0x2a4518;
const SELL_ICON_STROKE = 0x6abf2a;
const SELL_ICON_TEXT_COLOR = "#e6c068";

// Back button height (dp).

// Layout anchors (logical — multiplied by DPR at render time).
const CONTENT_TOP_Y = 160;

// Phase 2A+ drag-scroll: user drags vertically over the content area to scroll
// the rootLayer Container. Replaces Phase 1C pagination — feels more natural
// on mobile. Drag threshold prevents accidental scroll on taps.
const SCROLL_DRAG_THRESHOLD = 6;

const SLOT_ORDER: readonly ItemSlot[] = ["weapon", "armor", "accessory"];

interface AggregatedStats {
  hp: number;
  mp: number;
  physAttack: number;
  magAttack: number;
  crit: number;
}

export class PlayerStatsScene extends Phaser.Scene {
  private rootLayer?: Phaser.GameObjects.Container;
  /**
   * Phase 2A+ drag-scroll state. `scrollY` is the current Y offset of
   * `rootLayer` (always ≤ 0). `scrollMinY` is the negative lower bound (the
   * further the user can drag up to reveal bottom content). Recomputed in
   * each `refresh()` once total content height is known.
   *
   * `scrollDraggedThisGesture` is set during a pointermove that crosses the
   * drag threshold — tap handlers on equipment / backpack rows check it to
   * suppress accidental equips during scroll gestures.
   */
  private scrollY = 0;
  private scrollMinY = 0;
  private scrollDraggedThisGesture = false;

  constructor() {
    super("PlayerStatsScene");
  }

  create() {
    const camW = this.cameras.main.width;
    const camH = this.cameras.main.height;
    const cx = camW / 2;
    const d = DPR;

    this.add.rectangle(0, 0, camW, camH, V2_COLORS.bg).setOrigin(0);

    createTitle(this, cx, 96 * d + SAFE_AREA.top * d, "Статистика");

    createSubtitle(this, cx, 138 * d + SAFE_AREA.top * d, "Уровень, снаряжение, рюкзак");

    const backY = camH - 70 * d - SAFE_AREA.bottom * d;
    createBackButton(this, cx, backY, "← В Hub", () => sceneRouter.pop(this));

    this.setupScroll();
    this.refresh();

    // Scene-level safety net: if the user pops this scene while the info
    // modal is open, close it so the layer cannot leak into a subsequent
    // scene. Task #1 EDIT 7 also installs a modal-level SHUTDOWN handler
    // as layered defense — `.once()` on both sides means whichever fires
    // first is a no-op for the other.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (itemCardModal.isOpen()) itemCardModal.close();
      if (sellConfirmModal.isOpen()) sellConfirmModal.close();
    });
  }

  /**
   * Install scene-wide pointer drag handlers for vertical scroll of
   * `rootLayer`. Uses a movement threshold so short taps on backpack/slot
   * rows still fire their own `pointerdown` handlers cleanly.
   *
   * `dragStartRecorded` gates pointermove against gestures where
   * pointerdown was halted by `event.stopPropagation()` on a modal-internal
   * interactive GameObject (backdrop, panel, close button). Without this
   * guard, a backdrop tap-and-slide that closes the modal would leave
   * `dragStartY = 0` (initial closure value) — the subsequent pointermove
   * in the same gesture would compute `delta = p.y - 0 = p.y` (a large
   * absolute screen Y), cross the SCROLL_DRAG_THRESHOLD, and set
   * `scrollDraggedThisGesture = true` stale, suppressing the next info
   * icon tap (first-tap-ignored UX regression). Pointer events do NOT
   * cancel across event types — stopPropagation on pointerdown does not
   * stop subsequent pointermove events for the same gesture, so we need
   * an explicit gate here. `dragStartRecorded` is also reset on pointerup
   * so a finger-lift between gestures invalidates the record even if the
   * next pointerdown is itself stopPropagation'd.
   */
  private setupScroll(): void {
    let dragStartY = 0;
    let dragStartScrollY = 0;
    let dragging = false;
    // BUG-2 hardening (see JSDoc above for full rationale): set in the
    // scene-level pointerdown handler after the modal-open bail; cleared
    // on pointerup. Gates pointermove against gestures whose pointerdown
    // was stopPropagation'd by modal-internal handlers.
    let dragStartRecorded = false;

    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      // EDIT 10 (RISK-3 mitigation) — reset scrollDraggedThisGesture FIRST,
      // UNCONDITIONALLY, before the modal bail. This ensures the flag is
      // always fresh at the start of a new gesture, even if the prior
      // gesture was suppressed by a modal-open state. Without this, a stale
      // `true` from BEFORE the modal opened would persist and suppress the
      // first post-close tap on the info icon.
      this.scrollDraggedThisGesture = false;

      // EDIT 4 — do not start a drag while a modal is open. The
      // modal's backdrop is the topmost interactive element and absorbs
      // pointerdown via BUG-2 fix stopPropagation anyway, but this guard
      // prevents the drag-start state from being primed for the subsequent
      // pointermove stream.
      if (itemCardModal.isOpen() || sellConfirmModal.isOpen()) return;

      dragStartY = p.y;
      dragStartScrollY = this.scrollY;
      dragging = false;
      dragStartRecorded = true;
    });

    this.input.on("pointerup", () => {
      dragStartRecorded = false;
    });

    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      // EDIT 4 — do not scroll the background scene underneath an open
      // modal. Without this bail, dragging over the modal backdrop would
      // still feed delta into `rootLayer.setY`, visually confusing and
      // leaving `scrollDraggedThisGesture` in a stale state after close.
      if (itemCardModal.isOpen() || sellConfirmModal.isOpen()) return;
      // BUG-2 hardening: ignore pointermove for gestures whose scene-level
      // pointerdown was cancelled by stopPropagation (backdrop / close
      // button / panel close paths). Covers the tap-and-slide-to-close
      // edge case where pointermove fires on an unprimed drag state.
      if (!dragStartRecorded) return;
      if (!p.isDown || !this.rootLayer) return;
      const delta = p.y - dragStartY;
      if (!dragging && Math.abs(delta) < SCROLL_DRAG_THRESHOLD) return;
      dragging = true;
      this.scrollDraggedThisGesture = true;
      const newY = Phaser.Math.Clamp(dragStartScrollY + delta, this.scrollMinY, 0);
      this.scrollY = newY;
      this.rootLayer.setY(newY);
    });
  }

  // ───────────────────────────────────────────────────────────────────────
  // Re-render
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Tear down the managed root layer and rebuild it from current state.
   * Called on first render and after every inventory mutation.
   */
  private refresh(): void {
    if (this.rootLayer) {
      this.rootLayer.destroy();
      this.rootLayer = undefined;
    }

    const camW = this.cameras.main.width;
    const camH = this.cameras.main.height;
    const cx = camW / 2;
    const d = DPR;

    const layer = this.add.container(0, 0);
    this.rootLayer = layer;

    let y = CONTENT_TOP_Y * d + SAFE_AREA.top * d;

    y = this.renderAvatarAndLevel(layer, cx, y);
    y += 16 * d;

    y = this.renderXpBar(layer, cx, y);
    y += 24 * d;

    y = this.renderSectionHeader(layer, cx, y, "── Базовые статы ──");
    y = this.renderBaseStats(layer, cx, y);
    y += 20 * d;

    y = this.renderSectionHeader(layer, cx, y, "── Снаряжение ──");
    y = this.renderEquipmentSlots(layer, cx, y);
    y += 20 * d;

    y = this.renderSectionHeader(layer, cx, y, `── Рюкзак ──`);
    y = this.renderBackpack(layer, cx, y);

    // Compute scroll bounds: viewport is between the fixed title block and
    // the fixed back button. If content overflows the viewport bottom we
    // allow dragging up by the overflow delta. A small padding below the
    // last row keeps the final item readable when fully scrolled.
    const viewportBottom = camH - 100 * d - SAFE_AREA.bottom * d;
    const contentBottom = y + 24 * d;
    const overflow = Math.max(0, contentBottom - viewportBottom);
    this.scrollMinY = -overflow;
    this.scrollY = Phaser.Math.Clamp(this.scrollY, this.scrollMinY, 0);
    layer.setY(this.scrollY);
  }

  // ───────────────────────────────────────────────────────────────────────
  // Data helpers
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Full stat breakdown: base PlayerStats, equipment-derived bonuses, and
   * the totals. `progressionSystem.computeEffectiveStats()` is aware of the
   * inventory provider when wired (task #6). We compute bonus = effective -
   * base so the UI can display the split even when no provider is wired.
   */
  private computeStatBreakdown(): {
    base: AggregatedStats;
    bonus: AggregatedStats;
    total: AggregatedStats;
  } {
    const base: AggregatedStats = { ...gameState.get().player.stats };
    const effective = progressionSystem.computeEffectiveStats();
    const total: AggregatedStats = {
      hp: effective.hp,
      mp: effective.mp,
      physAttack: effective.physAttack,
      magAttack: effective.magAttack,
      crit: effective.crit,
    };
    const bonus: AggregatedStats = {
      hp: total.hp - base.hp,
      mp: total.mp - base.mp,
      physAttack: total.physAttack - base.physAttack,
      magAttack: total.magAttack - base.magAttack,
      crit: total.crit - base.crit,
    };
    return { base, bonus, total };
  }

  // ───────────────────────────────────────────────────────────────────────
  // Sections
  // ───────────────────────────────────────────────────────────────────────

  private renderAvatarAndLevel(
    layer: Phaser.GameObjects.Container,
    cx: number,
    y: number,
  ): number {
    const d = DPR;
    const player = gameState.get().player;
    const radius = AVATAR_RADIUS * d;
    const avatarCx = cx;
    const avatarCy = y + radius;

    const avatarBg = this.add.circle(avatarCx, avatarCy, radius, V2_COLORS.avatarBg, 0.95);
    avatarBg.setStrokeStyle(2 * d, V2_COLORS.avatarStroke);
    layer.add(avatarBg);

    const initial = (player.name || "?").charAt(0).toUpperCase();
    const avatarText = this.add
      .text(avatarCx, avatarCy, initial, {
        fontSize: `${32 * d}px`,
        color: V2_COLORS.titleColor,
        fontFamily: V2_FONTS.primary,
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    layer.add(avatarText);

    const nameY = avatarCy + radius + 12 * d;
    const nameText = this.add
      .text(cx, nameY, player.name || "Безымянный", {
        fontSize: `${20 * d}px`,
        color: V2_COLORS.valueColor,
        fontFamily: V2_FONTS.primary,
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0);
    layer.add(nameText);

    const level = progressionSystem.getCurrentLevel();
    const levelY = nameY + 28 * d;
    const levelText = this.add
      .text(cx, levelY, `Уровень ${level}`, {
        fontSize: `${16 * d}px`,
        color: V2_COLORS.subtitleColor,
        fontFamily: V2_FONTS.primary,
      })
      .setOrigin(0.5, 0);
    layer.add(levelText);

    return levelY + 22 * d;
  }

  private renderXpBar(
    layer: Phaser.GameObjects.Container,
    cx: number,
    y: number,
  ): number {
    const d = DPR;
    const player = gameState.get().player;
    const level = progressionSystem.getCurrentLevel();
    const xpToNext = progressionSystem.getXpToNextLevel();

    // Bar rail.
    const barWidth = XP_BAR_WIDTH * d;
    const barHeight = XP_BAR_HEIGHT * d;
    const barX = cx - barWidth / 2;
    const barBg = this.add.rectangle(barX, y, barWidth, barHeight, XP_BAR_BG, 0.9).setOrigin(0);
    barBg.setStrokeStyle(1 * d, XP_BAR_STROKE, 0.8);
    layer.add(barBg);

    // Fill ratio measures progress *within the current level*, not against
    // the absolute zero baseline. We get level-entry XP from ProgressionSystem
    // (cumulative XP that was required to reach the current level) and divide
    // earned-this-level by the level span. At MAX level we show a full bar.
    let fillRatio = 1;
    let label = "МАКС";
    if (xpToNext > 0) {
      const levelEntryXp = progressionSystem.getLevelEntryXp();
      const levelProgress = Math.max(0, player.xp - levelEntryXp);
      const levelSpan = levelProgress + xpToNext;
      fillRatio = levelSpan > 0 ? Math.max(0, Math.min(1, levelProgress / levelSpan)) : 0;
      label = `${levelProgress} / ${levelSpan} XP до ${level + 1} уровня`;
    }

    if (fillRatio > 0) {
      const fillWidth = Math.max(1, barWidth * fillRatio);
      const fill = this.add
        .rectangle(barX, y, fillWidth, barHeight, XP_BAR_FILL, 0.95)
        .setOrigin(0);
      layer.add(fill);
    }

    const labelText = this.add
      .text(cx, y + barHeight + 4 * d, label, {
        fontSize: `${12 * d}px`,
        color: V2_COLORS.bodyColor,
        fontFamily: V2_FONTS.primary,
        fontStyle: "italic",
      })
      .setOrigin(0.5, 0);
    layer.add(labelText);

    return y + barHeight + 20 * d;
  }

  private renderSectionHeader(
    layer: Phaser.GameObjects.Container,
    cx: number,
    y: number,
    label: string,
  ): number {
    const d = DPR;
    const header = this.add
      .text(cx, y, label, {
        fontSize: `${14 * d}px`,
        color: V2_COLORS.subtitleColor,
        fontFamily: V2_FONTS.primary,
      })
      .setOrigin(0.5, 0);
    layer.add(header);
    return y + 24 * d;
  }

  private renderBaseStats(
    layer: Phaser.GameObjects.Container,
    cx: number,
    y: number,
  ): number {
    const d = DPR;
    const breakdown = this.computeStatBreakdown();

    const rows: Array<{ label: string; key: keyof AggregatedStats }> = [
      { label: "HP", key: "hp" },
      { label: "MP", key: "mp" },
      { label: "Физ. атака", key: "physAttack" },
      { label: "Маг. атака", key: "magAttack" },
      { label: "Крит", key: "crit" },
    ];

    let currentY = y;
    rows.forEach((row) => {
      const base = breakdown.base[row.key];
      const bonus = breakdown.bonus[row.key];
      const total = breakdown.total[row.key];
      const text =
        bonus > 0
          ? `${row.label}: ${total} (${base} + ${bonus})`
          : `${row.label}: ${total}`;
      const color = bonus > 0 ? V2_COLORS.bonusColor : V2_COLORS.valueColor;
      const line = this.add
        .text(cx, currentY, text, {
          fontSize: `${14 * d}px`,
          color,
          fontFamily: V2_FONTS.primary,
        })
        .setOrigin(0.5, 0);
      layer.add(line);
      currentY += 20 * d;
    });

    return currentY;
  }

  private renderEquipmentSlots(
    layer: Phaser.GameObjects.Container,
    cx: number,
    y: number,
  ): number {
    const d = DPR;
    let currentY = y;
    for (const slot of SLOT_ORDER) {
      this.renderEquipmentRow(layer, cx, currentY, slot);
      currentY += ROW_HEIGHT * d + ROW_GAP * d;
    }
    return currentY;
  }

  private renderEquipmentRow(
    layer: Phaser.GameObjects.Container,
    cx: number,
    y: number,
    slot: ItemSlot,
  ): void {
    const d = DPR;
    const width = ROW_WIDTH * d;
    const height = ROW_HEIGHT * d;
    const rowCx = cx;
    const rowCy = y + height / 2;

    const bg = this.add
      .rectangle(rowCx, rowCy, width, height, V2_COLORS.rowBg, 0.95)
      .setStrokeStyle(1 * d, V2_COLORS.rowStroke)
      .setInteractive({ useHandCursor: true });
    layer.add(bg);

    const equipped = inventorySystem.getEquipped(slot);
    const equippedDef = equipped ? ITEMS[equipped.itemDefId] : undefined;
    const slotLabel = SLOT_LABELS[slot];

    // Left-aligned slot label (e.g. "Оружие").
    const labelText = this.add
      .text(rowCx - width / 2 + 14 * d, rowCy, slotLabel, {
        fontSize: `${14 * d}px`,
        color: V2_COLORS.bodyColor,
        fontFamily: V2_FONTS.primary,
      })
      .setOrigin(0, 0.5);
    layer.add(labelText);

    if (!equipped || !equippedDef) {
      // Empty-slot path: right-aligned "пусто" placeholder, no stats, no icon.
      const emptyText = this.add
        .text(rowCx + width / 2 - 14 * d, rowCy, "пусто", {
          fontSize: `${14 * d}px`,
          color: V2_COLORS.emptySlotColor,
          fontFamily: V2_FONTS.primary,
          fontStyle: "italic",
        })
        .setOrigin(1, 0.5);
      layer.add(emptyText);
    } else {
      // Occupied slot: name (center-left, rarity colour) + stats summary
      // (right of name, smaller font) + info icon on the far right.
      const nameColor = RARITY_COLOR_BY_TIER[equippedDef.rarity];
      const nameX = rowCx - width / 2 + 86 * d;
      const nameText = this.add
        .text(nameX, rowCy, equippedDef.name, {
          fontSize: `${14 * d}px`,
          color: nameColor,
          fontFamily: V2_FONTS.primary,
          fontStyle: "bold",
        })
        .setOrigin(0, 0.5);
      layer.add(nameText);

      const summary = buildStatsSummary(equippedDef);
      if (summary.length > 0) {
        const summaryX =
          rowCx + width / 2 - (INFO_ICON_RADIUS * 2 + INFO_ICON_PADDING_RIGHT * 2) * d;
        const summaryText = this.add
          .text(summaryX, rowCy, summary, {
            fontSize: `${STATS_SUMMARY_FONT_SIZE * d}px`,
            color: STATS_SUMMARY_COLOR,
            fontFamily: V2_FONTS.primary,
          })
          .setOrigin(1, 0.5);
        layer.add(summaryText);
      }

      const iconX =
        rowCx + width / 2 - (INFO_ICON_PADDING_RIGHT + INFO_ICON_RADIUS) * d;
      // Equipment row info icon — no comparison base (already equipped).
      this.createInfoIcon(layer, iconX, rowCy, () =>
        this.openItemInfoModal(equippedDef),
      );
    }

    bg.on("pointerover", () => bg.setFillStyle(V2_COLORS.rowBgHover, 1));
    bg.on("pointerout", () => bg.setFillStyle(V2_COLORS.rowBg, 0.95));
    bg.on("pointerdown", () => this.handleSlotTap(slot));
  }

  private renderBackpack(
    layer: Phaser.GameObjects.Container,
    cx: number,
    y: number,
  ): number {
    const d = DPR;
    const items = inventorySystem.getBackpackItems();
    const equippedIds = this.collectEquippedIds();

    const headerText = this.add
      .text(cx, y, `Рюкзак: ${items.length} / 8`, {
        fontSize: `${13 * d}px`,
        color: V2_COLORS.bodyColor,
        fontFamily: V2_FONTS.primary,
      })
      .setOrigin(0.5, 0);
    layer.add(headerText);

    let currentY = y + 20 * d;
    if (items.length === 0) {
      const emptyText = this.add
        .text(cx, currentY, "Пусто. Награды выпадают после боёв.", {
          fontSize: `${13 * d}px`,
          color: V2_COLORS.emptySlotColor,
          fontFamily: V2_FONTS.primary,
          fontStyle: "italic",
        })
        .setOrigin(0.5, 0);
      layer.add(emptyText);
      return currentY + 20 * d;
    }

    // Phase 2A+: render ALL items (no pagination). Drag-scroll handles
    // overflow via setupScroll() + rootLayer.setY in refresh().
    for (const instance of items) {
      this.renderBackpackRow(layer, cx, currentY, instance, equippedIds);
      currentY += ROW_HEIGHT * d + ROW_GAP * d;
    }
    return currentY;
  }

  private renderBackpackRow(
    layer: Phaser.GameObjects.Container,
    cx: number,
    y: number,
    instance: ItemInstance,
    equippedIds: Set<string>,
  ): void {
    const d = DPR;
    const def = ITEMS[instance.itemDefId];
    if (!def) return;

    const width = ROW_WIDTH * d;
    const height = ROW_HEIGHT * d;
    const rowCx = cx;
    const rowCy = y + height / 2;

    const bg = this.add
      .rectangle(rowCx, rowCy, width, height, V2_COLORS.rowBg, 0.95)
      .setStrokeStyle(1 * d, V2_COLORS.rowStroke)
      .setInteractive({ useHandCursor: true });
    layer.add(bg);

    const isEquipped = equippedIds.has(instance.id);
    // Phase 2A: backpack item name uses the def's rarity colour.
    const nameColor = RARITY_COLOR_BY_TIER[def.rarity];
    const nameText = this.add
      .text(rowCx - width / 2 + 14 * d, rowCy, def.name, {
        fontSize: `${14 * d}px`,
        color: nameColor,
        fontFamily: V2_FONTS.primary,
        fontStyle: "bold",
      })
      .setOrigin(0, 0.5);
    layer.add(nameText);

    // Right-side layout: info icon is always rightmost, then sell icon for
    // non-equipped rows, then suffix. Non-equipped rows hide suffix to make
    // room for the sell icon.
    const infoIconX =
      rowCx + width / 2 - (INFO_ICON_PADDING_RIGHT + INFO_ICON_RADIUS) * d;

    if (isEquipped) {
      // Equipped rows: "надето" suffix + info icon (no sell icon).
      const suffixX =
        rowCx + width / 2 - (INFO_ICON_RADIUS * 2 + INFO_ICON_PADDING_RIGHT * 2) * d;
      const suffixText = this.add
        .text(suffixX, rowCy, "надето", {
          fontSize: `${12 * d}px`,
          color: V2_COLORS.bonusColor,
          fontFamily: V2_FONTS.primary,
          fontStyle: "italic",
        })
        .setOrigin(1, 0.5);
      layer.add(suffixText);

      const summary = buildStatsSummary(def);
      if (summary.length > 0) {
        const summaryX = suffixText.x - suffixText.width - 8 * d;
        const summaryText = this.add
          .text(summaryX, rowCy, summary, {
            fontSize: `${STATS_SUMMARY_FONT_SIZE * d}px`,
            color: STATS_SUMMARY_COLOR,
            fontFamily: V2_FONTS.primary,
          })
          .setOrigin(1, 0.5);
        layer.add(summaryText);
      }
    } else {
      // Non-equipped rows: sell icon sits left of info icon, suffix hidden.
      const sellIconX =
        infoIconX - INFO_ICON_RADIUS * d - SELL_ICON_PADDING_RIGHT * d - SELL_ICON_RADIUS * d;
      this.createSellIcon(layer, sellIconX, rowCy, () =>
        this.handleSellTap(instance, def),
      );

      const summary = buildStatsSummary(def);
      if (summary.length > 0) {
        const summaryX = sellIconX - SELL_ICON_RADIUS * d - 8 * d;
        const summaryText = this.add
          .text(summaryX, rowCy, summary, {
            fontSize: `${STATS_SUMMARY_FONT_SIZE * d}px`,
            color: STATS_SUMMARY_COLOR,
            fontFamily: V2_FONTS.primary,
          })
          .setOrigin(1, 0.5);
        layer.add(summaryText);
      }
    }

    // Backpack row info icon — comparison base is the currently-equipped
    // item in the SAME slot, EXCEPT when the backpack item IS that equipped
    // item (edge case — an equipped item still lives in the backpack list).
    const equippedInSlot = inventorySystem.getEquipped(def.slot);
    const equippedDef = equippedInSlot ? ITEMS[equippedInSlot.itemDefId] : undefined;
    const comparisonBase =
      equippedInSlot && equippedInSlot.id !== instance.id ? equippedDef : undefined;

    this.createInfoIcon(layer, infoIconX, rowCy, () =>
      this.openItemInfoModal(def, comparisonBase),
    );

    bg.on("pointerover", () => bg.setFillStyle(V2_COLORS.rowBgHover, 1));
    bg.on("pointerout", () => bg.setFillStyle(V2_COLORS.rowBg, 0.95));
    bg.on("pointerdown", () => this.handleBackpackTap(instance));
  }

  // ───────────────────────────────────────────────────────────────────────
  // Interactions
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Slot row tap:
   *  - occupied → unequip the current item
   *  - empty → auto-equip the first backpack item matching this slot, if any
   *
   * Modal-open guard (§8 / EDIT 3): if the info modal is currently open we
   * do not mutate inventory state, even though the modal backdrop at depth
   * 2100 already intercepts pointer events at much higher priority than row
   * bgs. Two-line defensive guard future-proofs against modal depth changes.
   */
  private handleSlotTap(slot: ItemSlot): void {
    if (itemCardModal.isOpen() || sellConfirmModal.isOpen()) return;
    if (this.scrollDraggedThisGesture) return;
    const equipped = inventorySystem.getEquipped(slot);
    if (equipped) {
      if (inventorySystem.unequip(slot)) {
        this.refresh();
      }
      return;
    }

    const items = inventorySystem.getBackpackItems();
    for (const instance of items) {
      const def = ITEMS[instance.itemDefId];
      if (def && def.slot === slot) {
        if (inventorySystem.equip(slot, instance.id)) {
          this.refresh();
        }
        return;
      }
    }
  }

  /**
   * Backpack row tap: equip into the matching slot. If the slot is already
   * taken, the existing item is auto-replaced by `equip()` (InventorySystem
   * overwrites on re-assignment). No-op if the tapped item is already in its
   * slot — avoids a redundant rebuild.
   *
   * Modal-open guard (§8 / EDIT 3): same rationale as `handleSlotTap`.
   */
  private handleBackpackTap(instance: ItemInstance): void {
    if (itemCardModal.isOpen() || sellConfirmModal.isOpen()) return;
    if (this.scrollDraggedThisGesture) return;
    const def = ITEMS[instance.itemDefId];
    if (!def) return;
    const currentlyEquipped = inventorySystem.getEquipped(def.slot);
    if (currentlyEquipped?.id === instance.id) return;
    if (inventorySystem.equip(def.slot, instance.id)) {
      this.refresh();
    }
  }

  /**
   * Open the item info modal for a given def, with an optional comparison
   * base (currently-equipped item in the same slot). Backpack rows pass
   * the comparison; equipment rows pass no comparison base.
   */
  private openItemInfoModal(def: ItemDef, comparisonBase?: ItemDef): void {
    itemCardModal.open(this, {
      item: def,
      comparisonBase,
    });
  }

  /**
   * Open sell confirmation modal for a backpack item. On confirm, executes
   * the atomic removeItemAndRefund, shows a toast, and refreshes the scene.
   */
  private handleSellTap(instance: ItemInstance, def: ItemDef): void {
    const sellPrice = getSellPrice(def.rarity);
    sellConfirmModal.open(this, {
      item: def,
      sellPrice,
      onConfirm: () => {
        const result = inventorySystem.removeItemAndRefund(instance.id);
        if (result.ok) {
          toast.show(this, {
            message: `Продано: ${result.sold} (+${result.gold}g)`,
            type: "info",
          });
          this.refresh();
        }
      },
    });
  }

  /**
   * Create a small circular sell icon (green tint). Same hit-area pattern
   * as createInfoIcon — separate interactive, respects scrollDraggedThisGesture.
   */
  private createSellIcon(
    layer: Phaser.GameObjects.Container,
    x: number,
    y: number,
    onTap: () => void,
  ): void {
    const d = DPR;
    const radius = SELL_ICON_RADIUS * d;

    const bg = this.add.circle(x, y, radius, SELL_ICON_BG, 0.95);
    bg.setStrokeStyle(1 * d, SELL_ICON_STROKE);
    bg.setInteractive(
      new Phaser.Geom.Circle(0, 0, radius),
      Phaser.Geom.Circle.Contains,
    );
    layer.add(bg);

    const text = this.add
      .text(x, y, "$", {
        fontSize: `${14 * d}px`,
        color: SELL_ICON_TEXT_COLOR,
        fontFamily: V2_FONTS.primary,
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    layer.add(text);

    bg.on(
      "pointerdown",
      (_pointer: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
        // stopPropagation prevents the row bg's pointerdown from firing on
        // the same tap — without it Phaser delivers the event to BOTH the
        // sell icon AND the row rectangle, causing an equip instead of sell.
        event.stopPropagation();
        if (this.scrollDraggedThisGesture) return;
        if (itemCardModal.isOpen() || sellConfirmModal.isOpen()) return;
        onTap();
      },
    );

    layer.bringToTop(bg);
    layer.bringToTop(text);
  }

  /**
   * Create a small circular info icon with its OWN interactive hit-area.
   *
   * Phaser's `input.topOnly = true` default delivers pointerdown to the
   * topmost interactive object at the pointer position — so an icon drawn
   * AFTER the row bg naturally intercepts taps before they reach the row.
   * EDIT 9 (RISK-4 mitigation): we ALSO call `layer.bringToTop(icon)` as
   * belt-and-suspenders — Phaser's InputPlugin internal list can drift if
   * objects are re-parented, and `bringToTop` guarantees the icon is
   * topmost for hit testing regardless of internal ordering.
   *
   * The icon's `pointerdown` handler respects `scrollDraggedThisGesture`
   * so a drag-scroll gesture ending over an info icon does not trigger
   * the modal open.
   */
  private createInfoIcon(
    layer: Phaser.GameObjects.Container,
    x: number,
    y: number,
    onTap: () => void,
  ): void {
    const d = DPR;
    const radius = INFO_ICON_RADIUS * d;

    const bg = this.add.circle(x, y, radius, INFO_ICON_BG, 0.95);
    bg.setStrokeStyle(1 * d, INFO_ICON_STROKE);
    bg.setInteractive(
      new Phaser.Geom.Circle(0, 0, radius),
      Phaser.Geom.Circle.Contains,
    );
    layer.add(bg);

    const text = this.add
      .text(x, y, "i", {
        fontSize: `${14 * d}px`,
        color: INFO_ICON_TEXT_COLOR,
        fontFamily: V2_FONTS.primary,
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    layer.add(text);

    // Info icon does NOT stopPropagation — we want scene-level POINTER_DOWN
    // to keep firing for icon taps so EDIT 10's `scrollDraggedThisGesture`
    // reset in setupScroll() can do its job. If we halted the cascade here,
    // a prior drag-true flag would persist and starve every subsequent icon
    // tap until the user taps a non-icon area. The BUG-2 race (stopPropagation
    // on backdrop/panel/close-button in ItemCardModal) is about events AFTER
    // the modal has closed, not BEFORE it opens — opening the modal via an
    // icon tap is race-free because handleSlotTap/handleBackpackTap already
    // guard on itemCardModal.isOpen() and the recorded dragStart from scene
    // POINTER_DOWN is benign while the modal is up.
    bg.on("pointerdown", () => {
      if (this.scrollDraggedThisGesture) return;
      onTap();
    });

    // EDIT 9 (RISK-4 mitigation) — explicit bringToTop serves two
    // distinct purposes per child:
    //   (1) bg: HIT-TEST priority. `bg` is the interactive object, and
    //       Phaser's input.topOnly dispatches pointerdown to whichever
    //       interactive GO is topmost in display order. Belt-and-suspenders
    //       against future refactors that might add children after the icon.
    //   (2) text: VISUAL rendering correctness. `text` is NOT interactive
    //       (no setInteractive call) so it has zero effect on hit test,
    //       but it must render AFTER bg to show the "i" glyph ABOVE the
    //       circle background. bringToTop ensures subsequent row children
    //       added to the layer do not visually occlude the icon text.
    layer.bringToTop(bg);
    layer.bringToTop(text);
  }

  /** Build a set of all currently-equipped ItemInstance ids across slots. */
  private collectEquippedIds(): Set<string> {
    const ids = new Set<string>();
    for (const slot of SLOT_ORDER) {
      const instance = inventorySystem.getEquipped(slot);
      if (instance) ids.add(instance.id);
    }
    return ids;
  }

}
