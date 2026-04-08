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
 * Scaling contract (Phase 2A+ 4x difficulty bump per player feedback):
 *   layerCount        = min(5, 2 + floor)   (boss bumps to 6)
 *   baseHpPerLayer    = 120 + floor * 48    (+120 on boss floor) [was 30+12*floor]
 *   physAttack        = 14 + floor * 3      (+8 on boss floor)   [was 8+2*floor]
 *   chains.count      = 1 from floor 2, 2 from floor 4, 6 on boss
 *   chainBlockedHpRatio = 0.35 normal / 0.6 boss                  [was 0.3 / 0.5]
 *   rewards.xp/gold   = 100*floor / 50*floor (+400/+200 boss)     [was 50/25]
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
      // Phase 2A+: chains appear from floor 2 (was floor 4). Boss gets 6 chains.
      chains: floor >= 2 ? this.generateChains(floor, isBoss) : undefined,
      rewards: {
        // Phase 2A+ rewards 2x to compensate 4x fight length
        xp: 100 * floor + (isBoss ? 400 : 0),
        gold: 50 * floor + (isBoss ? 200 : 0),
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

  /**
   * NOTE: Brief specified `layerCount = 2 + floor` but that gives ~8 layers
   * on the boss (floor 6) which exceeds playable fight length. Capped at 3
   * for normal floors (1→2→3 across floors 1-2 / 3-4 / 5) and fixed 4 for
   * the boss to keep arena run pacing playable. `EncounterBuilder.build()`
   * validation (`layerCount > 0`) still passes for every floor.
   *
   * `magAttack` is intentionally omitted on floors 1-2 — early arena enemies
   * are physical-only so the boss kit ramps in from floor 3+.
   */
  private scaleBossStats(floor: number, isBoss: boolean): EncounterDef["bossStats"] {
    // Phase 2A+ 4x difficulty bump (player feedback: runs felt too easy).
    // HP scales ~4x (was 30+12*floor, now 120+48*floor) → boss TTK ~4x longer.
    // physAttack scales ~1.75x (was 8+2*floor, now 14+3*floor) → player takes
    // more damage per hit without being one-shot. magAttack scales ~1.5x.
    // layerCount grows faster (up to 5 normal / 6 boss) so late floors need
    // more sustained offense.
    const layerCount = isBoss ? 6 : Math.min(5, 2 + floor);
    const baseHpPerLayer = 120 + floor * 48 + (isBoss ? 120 : 0);
    const layerMultipliers = Array.from(
      { length: layerCount },
      (_, i) => 1 + i * 0.15,
    );
    const stats: EncounterDef["bossStats"] = {
      layerCount,
      baseHpPerLayer,
      layerMultipliers,
      physAttack: 14 + floor * 3 + (isBoss ? 8 : 0),
    };
    if (floor >= 3) {
      stats.magAttack = 8 + floor * 2;
    }
    return stats;
  }

  /**
   * Deterministic chain placement on the 8×7 board (x ∈ [0..7], y ∈ [0..6]).
   * Count rises with floor: 1 chain at floor 4-5, 4 chains on boss floor 6.
   */
  private generateChains(floor: number, isBoss: boolean): EncounterDef["chains"] {
    // Phase 2A+: chains appear from floor 2 (was floor 4). Ramp is steeper to
    // contribute to the 4x difficulty target. Boss places 6 chains (was 4).
    const count = isBoss ? 6 : Math.max(1, Math.floor(floor / 2) + (floor >= 4 ? 1 : 0));
    const initial: ChainPlacement[] = [];
    for (let i = 0; i < count; i++) {
      initial.push({
        x: (i * 3 + floor) % 8,
        y: (i * 2 + floor) % 7,
        hp: isBoss ? 4 : floor >= 4 ? 3 : 2,
        variant: "iron",
      });
    }
    return {
      initial,
      chainBlockedHpRatio: isBoss ? 0.6 : 0.35,
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
