/**
 * ShopSystem — singleton, manages the in-Hub shop assortment and purchases.
 *
 * Phase 2A scope: deterministic-per-day rotating list of 6 items, gated by
 * player level (epic at L3+, legendary at L5+). Prices are FIXED per rarity
 * tier — there is no per-item override. Purchase flow validates gold and
 * backpack space, then routes the actual mutation through `InventorySystem.add`
 * and a single `gameState.patch` for the gold deduction (R9 — fully-atomic
 * single-patch is Phase 2B polish).
 *
 * RISK-8 hardening: pure logic, no Phaser imports. Allowed runtime imports:
 * `../core/GameState`, `./InventorySystem`, `./ProgressionSystem`,
 * `../content/items`. Allowed type imports: `../content/types`.
 *
 * Daily seed: rotation cycles by UTC date. Within a single calendar day every
 * call to `getCurrentAssortment()` returns the same offers. Phase 2B may add
 * a manual reroll-for-gold UI affordance.
 */

import { gameState } from "../core/GameState";
import { inventorySystem } from "./InventorySystem";
import { progressionSystem } from "./ProgressionSystem";
import { ITEMS } from "../content/items";
import type { ItemDef, ItemRarity } from "../content/types";

/** Number of offers shown in ShopScene at one time. */
const SHOP_SLOTS = 6;

/**
 * Fixed gold price per rarity tier. Authoring rule: legendary ≈ 20× common,
 * epic ≈ 8× common, rare ≈ 3× common — keeps the progression curve consistent
 * with arena gold rewards from `ArenaEncounterGenerator`.
 */
const PRICE_BY_RARITY: Record<ItemRarity, number> = {
  common: 50,
  rare: 150,
  epic: 400,
  legendary: 1000,
};

/** Player level at which epic items begin to appear in the shop. */
const MIN_LEVEL_FOR_EPIC = 3;
/** Player level at which legendary items begin to appear in the shop. */
const MIN_LEVEL_FOR_LEGENDARY = 5;

/** Safety cap on rejection-sampling loop in `getCurrentAssortment`. */
const ASSORTMENT_PICK_ATTEMPTS = 100;

export interface ShopOffer {
  item: ItemDef;
  price: number;
}

/**
 * Discriminated union return for `purchase`. UI maps the English `reason`
 * codes to localised toast messages — keeping codes here in English avoids
 * coupling system code to copy.
 */
export type PurchaseResult =
  | { ok: true; item: ItemDef }
  | {
      ok: false;
      reason: "not_enough_gold" | "backpack_full" | "unknown_item";
    };

class ShopSystem {
  /**
   * Compute the current shop assortment. Deterministic per UTC day and
   * filtered by player level. Lower-rarity items remain eligible at high
   * levels for variety; higher-rarity items are gated to avoid trivialising
   * early gameplay (epic ≥ L3, legendary ≥ L5).
   */
  getCurrentAssortment(): ShopOffer[] {
    const level = progressionSystem.getCurrentLevel();
    const seed = this.getDailySeed();
    const rng = this.makeSeededRng(seed);

    const eligible: ItemDef[] = [];
    for (const item of Object.values(ITEMS)) {
      if (item.rarity === "legendary" && level < MIN_LEVEL_FOR_LEGENDARY) continue;
      if (item.rarity === "epic" && level < MIN_LEVEL_FOR_EPIC) continue;
      eligible.push(item);
    }

    const offers: ShopOffer[] = [];
    const used = new Set<string>();
    let attempts = 0;
    while (offers.length < SHOP_SLOTS && attempts < ASSORTMENT_PICK_ATTEMPTS) {
      attempts++;
      if (eligible.length === 0) break;
      const idx = Math.floor(rng() * eligible.length);
      const item = eligible[idx];
      if (used.has(item.id)) continue;
      used.add(item.id);
      offers.push({ item, price: PRICE_BY_RARITY[item.rarity] });
    }
    return offers;
  }

  /**
   * Attempt to buy an item by def id. Validation order: def lookup → gold
   * check → InventorySystem.add (which handles backpack-full). On success,
   * deducts gold via gameState.patch and returns the item. Two patches per
   * purchase is acceptable for Phase 2A per R9 — Phase 2B polish may merge
   * them into a single transaction.
   */
  purchase(itemDefId: string): PurchaseResult {
    const item = ITEMS[itemDefId];
    if (!item) return { ok: false, reason: "unknown_item" };

    const price = PRICE_BY_RARITY[item.rarity];
    const save = gameState.get();
    if (save.inventory.gold < price) {
      return { ok: false, reason: "not_enough_gold" };
    }

    // InventorySystem.add returns null when the backpack is full. The gold
    // deduction is intentionally sequenced AFTER the add so a full backpack
    // costs the player nothing — the partial first patch only appended an
    // item that we know succeeded.
    const instance = inventorySystem.add(itemDefId);
    if (!instance) return { ok: false, reason: "backpack_full" };

    gameState.patch((s) => {
      s.inventory.gold -= price;
    });
    return { ok: true, item };
  }

  /** Public price lookup so UI rows render the same number purchase enforces. */
  getPrice(rarity: ItemRarity): number {
    return PRICE_BY_RARITY[rarity];
  }

  /**
   * UTC day-of-year integer used as RNG seed. Same day → same assortment;
   * day rollover at UTC midnight cycles the offers. Robust against device
   * timezone changes within a session — both calls during one day return
   * the same value regardless of timezone offset.
   */
  private getDailySeed(): number {
    const now = new Date();
    const startOfYear = Date.UTC(now.getUTCFullYear(), 0, 0);
    const utcNow = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    );
    const dayOfYear = Math.floor((utcNow - startOfYear) / (24 * 60 * 60 * 1000));
    return now.getUTCFullYear() * 1000 + dayOfYear;
  }

  /**
   * Linear congruential generator (Numerical Recipes constants). Deterministic
   * given a fixed seed, no external dependencies, fast enough for a 6-slot
   * shop. Quality is sufficient for cosmetic rotation — not used for combat
   * RNG or anything player-facing as a "fairness" guarantee.
   */
  private makeSeededRng(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      // Divisor is 2^31 (NOT 2^31 - 1) so the result is strictly in [0, 1).
      // Using 0x7fffffff as the divisor would let `state === 0x7fffffff` map
      // to exactly 1.0, which `Math.floor(rng() * length)` then turns into an
      // out-of-bounds index. Probability is ~5e-10 per call, but textbook
      // LCG convention uses the half-open form to eliminate it entirely.
      return state / 0x80000000;
    };
  }
}

export const shopSystem = new ShopSystem();
