/**
 * ArenaEncounterGenerator — procedural `EncounterDef` builder for Phase 2A
 * arena runs. Called from `CombatBridgeScene` as a fallback when
 * `ENCOUNTERS[id]` lookup misses (task #10 wires this in).
 *
 * Stateless singleton — every `generate()` call returns a fresh EncounterDef
 * derived deterministically from the parsed floor + enemyType, with a small
 * `Math.random` variance inside `buildLootTable()` only.
 *
 * RISK-8 / R14: pure leaf module. No Phaser, no scene imports, no gameState
 * access. Type-only imports from content/types and game/config so this
 * module stays side-effect free and tree-shakeable.
 *
 * EncounterId format (DECISIONS.md R3):
 *     `arena_floor_${N}_${enemyType}`  where N ∈ [1..6]
 *
 * Scaling contract (brief "Procedural EncounterDef integration"):
 *   layerCount        = 2 + floor           (boss bumps to 4)
 *   baseHpPerLayer    = 30 + floor * 12     (+30 on boss floor)
 *   physAttack        = 8 + floor * 2       (+5 on boss floor)
 *   chains.count      = 0 on floors 1-3, 1 from floor 4, 4 on boss
 *   rewards.xp/gold   = 50*floor / 25*floor (+200/+100 boss)
 *
 * All generated defs pass `EncounterBuilder.build()` validation
 * (layerCount > 0, baseHpPerLayer > 0, chainBlockedHpRatio ∈ [0..1]).
 */

import type { BossAbilityType } from "../../game/config";
import type { ChainPlacement, EncounterDef } from "../content/types";

/** Parsed arena encounterId. */
interface ParsedArenaId {
  floor: number;
  enemyType: string;
}

const ENEMY_NAMES: Record<string, string> = {
  arena_bandit: "Бандит",
  arena_dark_mage: "Тёмный маг",
  arena_warden: "Страж",
  arena_apostate: "Отступник",
  arena_demon: "Демон",
};

const ENEMY_PATTERNS: Record<string, BossAbilityType[]> = {
  arena_bandit: ["attack", "attack", "powerStrike"],
  arena_dark_mage: ["attack", "shield", "bombs"],
  arena_warden: ["attack", "shield", "attack", "powerStrike"],
  arena_apostate: ["attack", "powerStrike", "bombs"],
  arena_demon: ["powerStrike", "bombs", "shield", "powerStrike", "attack"],
};

/** Loot pools grouped by rarity. All ids MUST exist in ITEMS (task #2). */
const LOOT_POOLS = {
  legendary: [
    "dragonslayer",
    "void_reaver",
    "aegis_plate",
    "phoenix_mantle",
    "arcane_orb",
    "eternity_charm",
  ],
  epic: [
    "dawn_blade",
    "phantom_dagger",
    "mage_robes",
    "dragon_scale",
    "mage_circlet",
    "warriors_band",
  ],
  rare: [
    "silver_dagger",
    "padded_cuirass",
    "focus_charm",
    "runed_sword",
    "chainmail_vest",
    "silver_pendant",
  ],
  common: [
    "wooden_blade",
    "student_robes",
    "simple_amulet",
    "iron_blade",
    "linen_tunic",
    "copper_ring",
  ],
} as const;

class ArenaEncounterGenerator {
  /**
   * Return `true` iff the encounterId matches the arena format. Used by
   * CombatBridgeScene to decide whether to call `generate()` as fallback
   * before `handleMissingEncounter()` (DECISIONS.md R3 fallback chain).
   */
  isArenaEncounter(encounterId: string): boolean {
    return this.parseArenaId(encounterId) !== null;
  }

  /**
   * Build a synthetic EncounterDef for an arena fight. Returns `null` when
   * the encounterId is NOT in arena format — caller should fall through
   * to the non-arena handler.
   */
  generate(encounterId: string): EncounterDef | null {
    const parsed = this.parseArenaId(encounterId);
    if (!parsed) return null;
    const { floor, enemyType } = parsed;
    const isBoss = floor >= 6;

    return {
      id: encounterId,
      characterId: enemyType,
      name: ENEMY_NAMES[enemyType] ?? "Враг арены",
      difficulty: Math.min(10, Math.ceil(floor * 1.5)),
      bossStats: this.scaleBossStats(floor, isBoss),
      bossPattern: ENEMY_PATTERNS[enemyType] ?? ["attack", "attack"],
      chains: floor >= 4 ? this.generateChains(floor, isBoss) : undefined,
      rewards: {
        xp: 50 * floor + (isBoss ? 200 : 0),
        gold: 25 * floor + (isBoss ? 100 : 0),
        loot: this.buildLootTable(floor, isBoss),
      },
      // No relationshipImpact: arena fights do not update relationships.
      // No returnDialogueId: arena routes via PostCombatScene → ArenaRunScene.
    };
  }

  private parseArenaId(encounterId: string): ParsedArenaId | null {
    const match = encounterId.match(/^arena_floor_(\d+)_(.+)$/);
    if (!match) return null;
    const floor = parseInt(match[1], 10);
    if (Number.isNaN(floor) || floor < 1 || floor > 6) return null;
    return { floor, enemyType: match[2] };
  }

  private scaleBossStats(floor: number, isBoss: boolean): EncounterDef["bossStats"] {
    const layerCount = isBoss ? 4 : Math.min(3, 1 + Math.floor(floor / 2));
    const baseHpPerLayer = 30 + floor * 12 + (isBoss ? 30 : 0);
    const layerMultipliers = Array.from(
      { length: layerCount },
      (_, i) => 1 + i * 0.15,
    );
    const stats: EncounterDef["bossStats"] = {
      layerCount,
      baseHpPerLayer,
      layerMultipliers,
      physAttack: 8 + floor * 2 + (isBoss ? 5 : 0),
    };
    if (floor >= 3) {
      stats.magAttack = 5 + floor;
    }
    return stats;
  }

  /**
   * Deterministic chain placement on the 8×7 board (x ∈ [0..7], y ∈ [0..6]).
   * Count rises with floor: 1 chain at floor 4-5, 4 chains on boss floor 6.
   */
  private generateChains(floor: number, isBoss: boolean): EncounterDef["chains"] {
    const count = isBoss ? 4 : 1 + Math.floor((floor - 4) / 2);
    const initial: ChainPlacement[] = [];
    for (let i = 0; i < count; i++) {
      initial.push({
        x: (i * 3 + floor) % 8,
        y: (i * 2 + floor) % 7,
        hp: isBoss ? 3 : 2,
        variant: "iron",
      });
    }
    return {
      initial,
      chainBlockedHpRatio: isBoss ? 0.5 : 0.3,
    };
  }

  /**
   * Deterministic-ish loot table: per-floor tier mix, random pick inside each
   * tier. `EncounterBuilder.applyResult()` walks the table and stops on the
   * first successful roll (Phase 1B spec). Loot ids are validated at author
   * time against ITEMS registry (task #2).
   */
  private buildLootTable(
    floor: number,
    isBoss: boolean,
  ): Array<{ itemDefId: string; chance: number }> {
    const pick = (pool: readonly string[]): string =>
      pool[Math.floor(Math.random() * pool.length)];
    if (isBoss) {
      return [
        { itemDefId: pick(LOOT_POOLS.legendary), chance: 0.5 },
        { itemDefId: pick(LOOT_POOLS.epic), chance: 0.7 },
        { itemDefId: pick(LOOT_POOLS.rare), chance: 0.9 },
      ];
    }
    if (floor >= 5) {
      return [
        { itemDefId: pick(LOOT_POOLS.epic), chance: 0.3 },
        { itemDefId: pick(LOOT_POOLS.rare), chance: 0.5 },
        { itemDefId: pick(LOOT_POOLS.common), chance: 0.7 },
      ];
    }
    if (floor >= 3) {
      return [
        { itemDefId: pick(LOOT_POOLS.rare), chance: 0.3 },
        { itemDefId: pick(LOOT_POOLS.common), chance: 0.5 },
      ];
    }
    return [{ itemDefId: pick(LOOT_POOLS.common), chance: 0.4 }];
  }
}

export const arenaEncounterGenerator = new ArenaEncounterGenerator();
