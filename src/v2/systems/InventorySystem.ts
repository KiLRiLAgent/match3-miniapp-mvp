/**
 * InventorySystem — single source of truth for player inventory mutations.
 * All writes go through `gameState.patch` so persistence is guaranteed and
 * downstream consumers (PlayerStatsScene, EncounterBuilder, ItemSlotPanel)
 * never touch SaveData fields directly.
 *
 * Mirrors the singleton pattern of RelationshipSystem (Phase 1A). Pure logic
 * — NO Phaser imports. Allowed runtime imports: `../core/GameState` and the
 * `ITEMS` registry. Allowed type imports: `../core/types`, `../content/types`.
 *
 * Field naming: stat fields are `hp` / `mp`, matching `ItemStats` in
 * `core/types.ts` (NOT `hpMax` / `manaMax`).
 */

import { gameState } from "../core/GameState";
import type { ItemInstance, ItemStats } from "../core/types";
import type { ItemSlot } from "../content/types";
import { ITEMS } from "../content/items";

/** Hard cap on backpack size. Excess `add()` calls return `null`. */
const MAX_BACKPACK_SLOTS = 8;

/**
 * Canonical iteration order over equipment slots (DECISIONS R7). Single source
 * of truth — `computeAggregateStats` and `removeItem` both iterate this array
 * instead of redefining `["weapon", "armor", "accessory"]` locally.
 */
const SLOT_ORDER: readonly ItemSlot[] = ["weapon", "armor", "accessory"];

/**
 * Generate a unique instance id. Includes a random suffix because two items
 * added in the same millisecond would otherwise collide on `Date.now()` alone.
 */
function generateInstanceId(defId: string): string {
  return `${defId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

class InventorySystem {
  /**
   * Add an item to the backpack. Returns the created `ItemInstance` on
   * success, or `null` if the def is unknown or the backpack is full.
   * Items start unequipped — caller must invoke `equip` separately.
   */
  add(itemDefId: string): ItemInstance | null {
    const def = ITEMS[itemDefId];
    if (!def) return null;

    const save = gameState.get();
    if (save.inventory.items.length >= MAX_BACKPACK_SLOTS) return null;

    const instance: ItemInstance = {
      id: generateInstanceId(itemDefId),
      itemDefId,
    };

    gameState.patch((s) => {
      s.inventory.items.push(instance);
    });

    return instance;
  }

  /**
   * Equip an existing backpack item into the matching slot. Validates that
   * the instance exists and that its def's slot matches the requested slot.
   * Auto-replaces any item already in that slot. Returns true on success.
   */
  equip(slot: ItemSlot, instanceId: string): boolean {
    const save = gameState.get();
    const instance = save.inventory.items.find((it) => it.id === instanceId);
    if (!instance) return false;

    const def = ITEMS[instance.itemDefId];
    if (!def || def.slot !== slot) return false;

    gameState.patch((s) => {
      s.inventory.equipped[slot] = instanceId;
    });
    return true;
  }

  /** Clear the given slot. Returns true if a slot was cleared. */
  unequip(slot: ItemSlot): boolean {
    const save = gameState.get();
    if (!save.inventory.equipped[slot]) return false;

    gameState.patch((s) => {
      delete s.inventory.equipped[slot];
    });
    return true;
  }

  /**
   * Remove an item from the backpack by instance id. Automatically clears any
   * equipped slot that was pointing at this item, so callers cannot leave the
   * `equipped` map referencing a deleted instance. Returns true if the item
   * was found and removed, false otherwise.
   *
   * Atomic — both the filter and the equipped-cleanup happen in a single
   * `gameState.patch` call so persistence sees a consistent post-state.
   *
   * Use this instead of mutating `inventory.items` directly — it is the only
   * v2 entry point that guarantees inventory invariants stay coherent.
   */
  removeItem(instanceId: string): boolean {
    const save = gameState.get();
    const exists = save.inventory.items.some((it) => it.id === instanceId);
    if (!exists) return false;

    gameState.patch((s) => {
      s.inventory.items = s.inventory.items.filter((it) => it.id !== instanceId);
      for (const slot of SLOT_ORDER) {
        if (s.inventory.equipped[slot] === instanceId) {
          delete s.inventory.equipped[slot];
        }
      }
    });
    return true;
  }

  /**
   * Sum of `baseStats` (and any `rolledStats`) across all currently-equipped
   * items. Returns a fully-populated `ItemStats` with zeros for missing
   * fields. Pure read — never mutates SaveData.
   */
  computeAggregateStats(): ItemStats {
    const totals: Required<ItemStats> = {
      hp: 0,
      mp: 0,
      physAttack: 0,
      magAttack: 0,
      crit: 0,
    };

    for (const slot of SLOT_ORDER) {
      const instance = this.getEquipped(slot);
      if (!instance) continue;

      const def = ITEMS[instance.itemDefId];
      if (!def) continue;

      const base = def.baseStats;
      totals.hp += base.hp ?? 0;
      totals.mp += base.mp ?? 0;
      totals.physAttack += base.physAttack ?? 0;
      totals.magAttack += base.magAttack ?? 0;
      totals.crit += base.crit ?? 0;

      const rolled = instance.rolledStats;
      if (rolled) {
        totals.hp += rolled.hp ?? 0;
        totals.mp += rolled.mp ?? 0;
        totals.physAttack += rolled.physAttack ?? 0;
        totals.magAttack += rolled.magAttack ?? 0;
        totals.crit += rolled.crit ?? 0;
      }
    }

    return totals;
  }

  /** Look up the `ItemInstance` currently bound to a slot, if any. */
  getEquipped(slot: ItemSlot): ItemInstance | null {
    const save = gameState.get();
    const instanceId = save.inventory.equipped[slot];
    if (!instanceId) return null;
    return save.inventory.items.find((it) => it.id === instanceId) ?? null;
  }

  /**
   * Snapshot of the backpack — returns a fresh array reference so callers
   * can iterate without risk of mutating SaveData. Items themselves are LIVE
   * references, however; do not mutate fields like `level` directly.
   */
  getBackpackItems(): ItemInstance[] {
    const save = gameState.get();
    return [...save.inventory.items];
  }
}

export const inventorySystem = new InventorySystem();
