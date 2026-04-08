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
import type { ItemRarity, ItemSlot } from "../content/types";
import type { ItemInstance } from "../core/types";

// Palette — mirrors HubScene / CharacterGalleryScene "dark purple" theme.
const BG_COLOR = 0x1a0f2e;
const TITLE_COLOR = "#e6c068";
const SUBTITLE_COLOR = "#9f7fc7";
const SECTION_HEADER_COLOR = "#9f7fc7";
const BODY_COLOR = "#d4b8e8";
const VALUE_COLOR = "#f4e4c1";
const BONUS_COLOR = "#4caf50";
const EMPTY_SLOT_COLOR = "#8a7ab0";
const FONT = "'Exo 2', Arial, sans-serif";

/**
 * Phase 2A — rarity colour coding for equipment + backpack rows. Applied
 * to the value text (equipped slot) and item name (backpack row). Empty slots
 * keep `EMPTY_SLOT_COLOR`. Order matches Phase 1B → Phase 2A introduction:
 * common → rare → epic → legendary (DECISIONS R6).
 */
const RARITY_COLOR_BY_TIER: Record<ItemRarity, string> = {
  common: "#9f8a7a",
  rare: "#5b8fe6",
  epic: "#a070d8",
  legendary: "#e6c068",
};

// Avatar placeholder.
const AVATAR_RADIUS = 36;
const AVATAR_BG = 0x2a1845;
const AVATAR_STROKE = 0xe6c068;

// XP bar.
const XP_BAR_BG = 0x222244;
const XP_BAR_FILL = 0x6e4ac8;
const XP_BAR_STROKE = 0xe6c068;
const XP_BAR_WIDTH = 260;
const XP_BAR_HEIGHT = 14;

// Row backgrounds.
const ROW_BG = 0x231436;
const ROW_BG_HOVER = 0x33224c;
const ROW_STROKE = 0x4a2d6e;
const ROW_WIDTH = 320;
const ROW_HEIGHT = 40;
const ROW_GAP = 8;

// Back button.
const BACK_BG = 0x2a1845;
const BACK_BG_HOVER = 0x3a2358;
const BACK_STROKE = 0x9f7fc7;
const BACK_TEXT = "#b8a8d0";
const BACK_TEXT_HOVER = "#e6c068";
const BACK_BUTTON_WIDTH = 180;
const BACK_BUTTON_HEIGHT = 48;

// Layout anchors (logical — multiplied by DPR at render time).
const CONTENT_TOP_Y = 160;

// Phase 2A+ drag-scroll: user drags vertically over the content area to scroll
// the rootLayer Container. Replaces Phase 1C pagination — feels more natural
// on mobile. Drag threshold prevents accidental scroll on taps.
const SCROLL_DRAG_THRESHOLD = 6;

const SLOT_ORDER: readonly ItemSlot[] = ["weapon", "armor", "accessory"];
const SLOT_LABELS: Record<ItemSlot, string> = {
  weapon: "Оружие",
  armor: "Броня",
  accessory: "Аксессуар",
};

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

    this.add.rectangle(0, 0, camW, camH, BG_COLOR).setOrigin(0);

    this.add
      .text(cx, 96 * d + SAFE_AREA.top * d, "Статистика", {
        fontSize: `${30 * d}px`,
        color: TITLE_COLOR,
        fontFamily: FONT,
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 3 * d,
      })
      .setOrigin(0.5);

    this.add
      .text(cx, 138 * d + SAFE_AREA.top * d, "Уровень, снаряжение, рюкзак", {
        fontSize: `${16 * d}px`,
        color: SUBTITLE_COLOR,
        fontFamily: FONT,
        fontStyle: "italic",
      })
      .setOrigin(0.5);

    const backY = camH - 70 * d - SAFE_AREA.bottom * d;
    this.createBackButton(cx, backY, () => sceneRouter.pop(this));

    this.setupScroll();
    this.refresh();
  }

  /**
   * Install scene-wide pointer drag handlers for vertical scroll of
   * `rootLayer`. Uses a movement threshold so short taps on backpack/slot
   * rows still fire their own `pointerdown` handlers cleanly.
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

    const avatarBg = this.add.circle(avatarCx, avatarCy, radius, AVATAR_BG, 0.95);
    avatarBg.setStrokeStyle(2 * d, AVATAR_STROKE);
    layer.add(avatarBg);

    const initial = (player.name || "?").charAt(0).toUpperCase();
    const avatarText = this.add
      .text(avatarCx, avatarCy, initial, {
        fontSize: `${32 * d}px`,
        color: TITLE_COLOR,
        fontFamily: FONT,
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    layer.add(avatarText);

    const nameY = avatarCy + radius + 12 * d;
    const nameText = this.add
      .text(cx, nameY, player.name || "Безымянный", {
        fontSize: `${20 * d}px`,
        color: VALUE_COLOR,
        fontFamily: FONT,
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0);
    layer.add(nameText);

    const level = progressionSystem.getCurrentLevel();
    const levelY = nameY + 28 * d;
    const levelText = this.add
      .text(cx, levelY, `Уровень ${level}`, {
        fontSize: `${16 * d}px`,
        color: SUBTITLE_COLOR,
        fontFamily: FONT,
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
        color: BODY_COLOR,
        fontFamily: FONT,
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
        color: SECTION_HEADER_COLOR,
        fontFamily: FONT,
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
      const color = bonus > 0 ? BONUS_COLOR : VALUE_COLOR;
      const line = this.add
        .text(cx, currentY, text, {
          fontSize: `${14 * d}px`,
          color,
          fontFamily: FONT,
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
      .rectangle(rowCx, rowCy, width, height, ROW_BG, 0.95)
      .setStrokeStyle(1 * d, ROW_STROKE)
      .setInteractive({ useHandCursor: true });
    layer.add(bg);

    const equipped = inventorySystem.getEquipped(slot);
    const equippedDef = equipped ? ITEMS[equipped.itemDefId] : undefined;
    const slotLabel = SLOT_LABELS[slot];
    const valueText = equipped
      ? equippedDef?.name ?? equipped.itemDefId
      : "пусто";
    // Phase 2A: rarity colour for equipped item, EMPTY_SLOT_COLOR otherwise.
    // Falls back to common colour if a stale itemDefId points at a missing def.
    const valueColor = equipped
      ? RARITY_COLOR_BY_TIER[equippedDef?.rarity ?? "common"]
      : EMPTY_SLOT_COLOR;

    const labelText = this.add
      .text(rowCx - width / 2 + 14 * d, rowCy, slotLabel, {
        fontSize: `${14 * d}px`,
        color: BODY_COLOR,
        fontFamily: FONT,
      })
      .setOrigin(0, 0.5);
    layer.add(labelText);

    const value = this.add
      .text(rowCx + width / 2 - 14 * d, rowCy, valueText, {
        fontSize: `${14 * d}px`,
        color: valueColor,
        fontFamily: FONT,
        fontStyle: equipped ? "bold" : "italic",
      })
      .setOrigin(1, 0.5);
    layer.add(value);

    bg.on("pointerover", () => bg.setFillStyle(ROW_BG_HOVER, 1));
    bg.on("pointerout", () => bg.setFillStyle(ROW_BG, 0.95));
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
        color: BODY_COLOR,
        fontFamily: FONT,
      })
      .setOrigin(0.5, 0);
    layer.add(headerText);

    let currentY = y + 20 * d;
    if (items.length === 0) {
      const emptyText = this.add
        .text(cx, currentY, "Пусто. Награды выпадают после боёв.", {
          fontSize: `${13 * d}px`,
          color: EMPTY_SLOT_COLOR,
          fontFamily: FONT,
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
      .rectangle(rowCx, rowCy, width, height, ROW_BG, 0.95)
      .setStrokeStyle(1 * d, ROW_STROKE)
      .setInteractive({ useHandCursor: true });
    layer.add(bg);

    const isEquipped = equippedIds.has(instance.id);
    // Phase 2A: backpack item name uses the def's rarity colour.
    const nameColor = RARITY_COLOR_BY_TIER[def.rarity];
    const nameText = this.add
      .text(rowCx - width / 2 + 14 * d, rowCy, def.name, {
        fontSize: `${14 * d}px`,
        color: nameColor,
        fontFamily: FONT,
        fontStyle: "bold",
      })
      .setOrigin(0, 0.5);
    layer.add(nameText);

    const suffix = isEquipped ? "надето" : SLOT_LABELS[def.slot];
    const suffixColor = isEquipped ? BONUS_COLOR : SUBTITLE_COLOR;
    const suffixText = this.add
      .text(rowCx + width / 2 - 14 * d, rowCy, suffix, {
        fontSize: `${12 * d}px`,
        color: suffixColor,
        fontFamily: FONT,
        fontStyle: "italic",
      })
      .setOrigin(1, 0.5);
    layer.add(suffixText);

    bg.on("pointerover", () => bg.setFillStyle(ROW_BG_HOVER, 1));
    bg.on("pointerout", () => bg.setFillStyle(ROW_BG, 0.95));
    bg.on("pointerdown", () => this.handleBackpackTap(instance));
  }

  // ───────────────────────────────────────────────────────────────────────
  // Interactions
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Slot row tap:
   *  - occupied → unequip the current item
   *  - empty → auto-equip the first backpack item matching this slot, if any
   */
  private handleSlotTap(slot: ItemSlot): void {
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
   */
  private handleBackpackTap(instance: ItemInstance): void {
    if (this.scrollDraggedThisGesture) return;
    const def = ITEMS[instance.itemDefId];
    if (!def) return;
    const currentlyEquipped = inventorySystem.getEquipped(def.slot);
    if (currentlyEquipped?.id === instance.id) return;
    if (inventorySystem.equip(def.slot, instance.id)) {
      this.refresh();
    }
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
