/**
 * itemFormat — pure data helpers for rendering item metadata.
 *
 * Shared by `PlayerStatsScene` (inline rows + info icon) and `ItemCardModal`
 * (full detail modal). Zero Phaser imports — only type imports from
 * `content/types` + `core/types`. Every function is pure and testable in
 * isolation.
 *
 * Phase 2B — item-info-display feature (task #1).
 */

import type { ItemDef, ItemRarity, ItemSlot } from "../content/types";
import type { ItemStats } from "../core/types";

/**
 * Rarity → hex color string. Mirrors `RARITY_COLORS` in `ShopScene.ts` and
 * `RARITY_COLOR_BY_TIER` in `PlayerStatsScene.ts`. Reuse — do NOT invent new
 * colors.
 */
export const RARITY_COLOR_BY_TIER: Record<ItemRarity, string> = {
  common: "#9f8a7a",
  rare: "#5b8fe6",
  epic: "#a070d8",
  legendary: "#e6c068",
};

/** Human-readable Russian rarity label for the info modal. */
export const RARITY_LABEL: Record<ItemRarity, string> = {
  common: "Обычный",
  rare: "Редкий",
  epic: "Эпический",
  legendary: "Легендарный",
};

/** Human-readable Russian slot label — matches ShopScene's SLOT_LABELS. */
export const SLOT_LABELS: Record<ItemSlot, string> = {
  weapon: "Оружие",
  armor: "Броня",
  accessory: "Аксессуар",
};

/**
 * Compact single-line stats summary for item rows — e.g. `"+10 физ, +5 HP"`.
 *
 * KEEP IN SYNC with `src/v2/scenes/ShopScene.ts:buildStatsSummary()` until
 * Phase 2B dedup sprint replaces ShopScene's local copy with an import from
 * here. Any format change here MUST also be applied to ShopScene manually.
 * Tracked as Phase 2B dedup candidate — see DECISIONS R2B-2 (task #3 updates
 * `.conventions/` with the drift guard).
 *
 * Order is fixed: hp → mp → physAttack → magAttack → crit. Zero-valued stats
 * are omitted entirely (no `"+0 крит"` lines) per RISK-4/EDIT 1. `crit` is
 * shown last so the eye lands on big legendary affordances (same rationale
 * as ShopScene).
 */
export function buildStatsSummary(item: ItemDef): string {
  const parts: string[] = [];
  const s = item.baseStats;
  if (s.hp) parts.push(`+${s.hp} HP`);
  if (s.mp) parts.push(`+${s.mp} MP`);
  if (s.physAttack) parts.push(`+${s.physAttack} физ`);
  if (s.magAttack) parts.push(`+${s.magAttack} маг`);
  if (s.crit) parts.push(`+${s.crit} крит`);
  return parts.join(", ");
}

/**
 * Single stat row entry used by the modal's full breakdown.
 *
 * `label` is the long-form Russian label (`"Физ. атака"`), `value` is the raw
 * (non-zero) stat amount. Zero stats are omitted from the returned list.
 */
export interface StatRow {
  label: string;
  value: number;
}

/** Full long-form labels for the modal breakdown. */
const FULL_STAT_LABELS: Record<keyof ItemStats, string> = {
  hp: "Здоровье",
  mp: "Мана",
  physAttack: "Физ. атака",
  magAttack: "Маг. атака",
  crit: "Крит",
};

/**
 * Fixed iteration order over `ItemStats` keys. Matches `buildStatsSummary`
 * so that modal rows and compact summary appear in identical sequence.
 */
const STAT_ORDER: ReadonlyArray<keyof ItemStats> = [
  "hp",
  "mp",
  "physAttack",
  "magAttack",
  "crit",
];

/**
 * Multi-row breakdown for the modal body. Zero-valued (or undefined) stats
 * are omitted entirely — callers get only rows worth rendering. Rows are
 * returned in display order (`STAT_ORDER`).
 *
 * Takes `ItemStats` directly — every field on `ItemStats` is already
 * optional so a `Partial<>` wrapper adds no type information.
 */
export function buildStatsRows(stats: ItemStats): StatRow[] {
  const rows: StatRow[] = [];
  for (const key of STAT_ORDER) {
    const value = stats[key];
    if (value === undefined || value === 0) continue;
    rows.push({ label: FULL_STAT_LABELS[key], value });
  }
  return rows;
}

/**
 * Comparison delta row — `delta > 0` means the candidate item improves the
 * stat relative to the currently equipped item; `delta < 0` means it is a
 * downgrade. Zero deltas are NEVER emitted (see `buildStatsDeltas`).
 */
export interface StatDelta {
  label: string;
  delta: number;
}

/**
 * Compare `next` against `current` (the currently equipped item in the same
 * slot) and return per-stat deltas.
 *
 * Rules (per task #1 spec, EDIT 1 + EDIT 6):
 * - Iteration order follows `STAT_ORDER` so rows line up with `buildStatsRows`.
 * - Undefined/missing stat fields on either side are treated as 0.
 * - Only **non-zero** deltas are returned. Identical-value stats silently
 *   drop out — no `"+0"` noise.
 * - Empty slot (`current === undefined`): every non-zero stat on `next`
 *   becomes a positive delta row.
 * - Legendary vs common: 4-5 non-zero delta rows all pass through.
 * - Negative deltas (candidate removes a stat) are preserved and rendered
 *   red by the modal.
 */
export function buildStatsDeltas(
  next: ItemDef,
  current?: ItemDef,
): StatDelta[] {
  const deltas: StatDelta[] = [];
  const nextStats = next.baseStats;
  const currentStats = current?.baseStats ?? {};

  for (const key of STAT_ORDER) {
    const n = nextStats[key] ?? 0;
    const c = currentStats[key] ?? 0;
    const delta = n - c;
    if (delta === 0) continue;
    deltas.push({ label: FULL_STAT_LABELS[key], delta });
  }

  return deltas;
}

/**
 * Unified modal row combining the candidate item's own value with the
 * comparison delta (if a `current` base is provided). Produced in a single
 * pass over `STAT_ORDER` so rendering order is STABLE regardless of which
 * stats are kept vs lost between `current` and `next`.
 *
 * `value` is the candidate's raw stat (0 if `next` no longer has this stat
 * at all — i.e. the stat is being "lost"). `delta` is set only when
 * `current !== undefined` AND the delta is non-zero. A row is emitted when
 * EITHER `value !== 0` OR `delta` is non-zero — a stat that is unchanged
 * and absent from `next` produces no row.
 */
export interface UnifiedStatRow {
  label: string;
  value: number;
  delta?: number;
}

/**
 * Single-pass view over `STAT_ORDER` for the modal body. Combines the
 * candidate item's own stats with deltas against an optional current base,
 * returning rows in stable STAT_ORDER (hp → mp → physAttack → magAttack →
 * crit). Used by ItemCardModal to render a merged stats list that does not
 * reorder rows when a stat is lost vs kept.
 *
 * Contract:
 * - No `current` → row per non-zero `next` stat, `delta` undefined.
 * - With `current` → row emitted when `next` has a non-zero value OR the
 *   delta is non-zero (stat kept, stat gained, or stat lost).
 * - Stats unchanged AND absent from `next` produce no row (no clutter).
 * - Lost stats have `value === 0` and a negative `delta` — the modal
 *   renders only the delta in red for those rows.
 */
export function buildUnifiedStatView(
  next: ItemDef,
  current?: ItemDef,
): UnifiedStatRow[] {
  const rows: UnifiedStatRow[] = [];
  const nextStats = next.baseStats;
  const currentStats = current?.baseStats ?? {};

  for (const key of STAT_ORDER) {
    const n = nextStats[key] ?? 0;
    const c = currentStats[key] ?? 0;
    const delta = n - c;
    const include = n !== 0 || delta !== 0;
    if (!include) continue;
    const row: UnifiedStatRow = { label: FULL_STAT_LABELS[key], value: n };
    if (current !== undefined && delta !== 0) row.delta = delta;
    rows.push(row);
  }

  return rows;
}
