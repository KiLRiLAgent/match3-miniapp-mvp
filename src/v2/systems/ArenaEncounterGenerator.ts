/**
 * ArenaEncounterGenerator — procedural `EncounterDef` builder for arena runs.
 *
 * Phase 2B rework: 10-boss runs with authored BOSS_CURVE table and per-run
 * difficulty scaling (`difficultyMultiplier = 1.15^totalRunsCompleted`).
 *
 * Stateless singleton — every `generate()` call returns a fresh EncounterDef
 * derived deterministically from the parsed floor + enemyType + multiplier,
 * with a small `Math.random` variance inside `buildLootTable()` only.
 *
 * RISK-8 / R14: pure leaf module. No Phaser, no scene imports, no gameState
 * access. Type-only imports from content/types and game/config so this
 * module stays side-effect free and tree-shakeable.
 *
 * EncounterId format (DECISIONS.md R3):
 *     `arena_floor_${N}_${enemyType}`  where N ∈ [1..10]
 *
 * Scaling contract (Phase 2B — authored BOSS_CURVE):
 *   See BOSS_CURVE table below for layers/hpPerLayer per floor.
 *   difficultyMultiplier applied to HP + physAttack + magAttack (NOT layers).
 *   Chains appear from floor 3, scale with floor. Final boss gets 8 chains.
 *   Rewards scale with floor; final boss gives bonus XP/gold + legendary loot.
 *
 * All generated defs pass `EncounterBuilder.build()` validation
 * (layerCount > 0, baseHpPerLayer > 0, chainBlockedHpRatio ∈ [0..1]).
 */

import type { BossAbilityType } from "../../game/config";
import type { ChainPlacement, EncounterDef } from "../content/types";

/** Total floors in a single arena run. */
export const ARENA_TOTAL_FLOORS = 10;

/** Floors after which ArenaRewardScene (buff pick) is shown. */
export const BUFF_FLOORS: ReadonlySet<number> = new Set([3, 6, 9]);

/** Parsed arena encounterId. */
interface ParsedArenaId {
  floor: number;
  enemyType: string;
}

/**
 * Authored boss curve — 10 entries indexed by floor (1-based).
 * layers × hpPerLayer = total HP before difficulty multiplier.
 */
interface BossCurveEntry {
  layers: number;
  hpPerLayer: number;
}

const BOSS_CURVE: readonly BossCurveEntry[] = [
  /* floor  1 */ { layers: 2,  hpPerLayer: 100 },  // 200 HP
  /* floor  2 */ { layers: 2,  hpPerLayer: 150 },  // 300 HP
  /* floor  3 */ { layers: 3,  hpPerLayer: 150 },  // 450 HP  → buff pick after
  /* floor  4 */ { layers: 3,  hpPerLayer: 175 },  // 525 HP
  /* floor  5 */ { layers: 4,  hpPerLayer: 175 },  // 700 HP
  /* floor  6 */ { layers: 4,  hpPerLayer: 200 },  // 800 HP  → buff pick after
  /* floor  7 */ { layers: 5,  hpPerLayer: 200 },  // 1000 HP
  /* floor  8 */ { layers: 5,  hpPerLayer: 225 },  // 1125 HP
  /* floor  9 */ { layers: 6,  hpPerLayer: 225 },  // 1350 HP → buff pick after
  /* floor 10 */ { layers: 15, hpPerLayer: 200 },  // 3000 HP (final boss)
];

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
   *
   * @param difficultyMultiplier — `Math.pow(1.15, totalRunsCompleted)`.
   *   Applied to HP and phys/mag attack. NOT applied to layer count.
   *   Defaults to 1.0 (first run, no scaling).
   */
  generate(encounterId: string, difficultyMultiplier = 1): EncounterDef | null {
    const parsed = this.parseArenaId(encounterId);
    if (!parsed) return null;
    const { floor, enemyType } = parsed;
    const isFinal = floor >= ARENA_TOTAL_FLOORS;

    return {
      id: encounterId,
      characterId: enemyType,
      name: ENEMY_NAMES[enemyType] ?? "Враг арены",
      difficulty: Math.min(10, Math.ceil(floor * 1.0)),
      bossStats: this.scaleBossStats(floor, isFinal, difficultyMultiplier),
      bossPattern: ENEMY_PATTERNS[enemyType] ?? ["attack", "attack"],
      chains: floor >= 3 ? this.generateChains(floor, isFinal) : undefined,
      rewards: {
        xp: 80 * floor + (isFinal ? 500 : 0),
        gold: 40 * floor + (isFinal ? 300 : 0),
        loot: this.buildLootTable(floor, isFinal),
      },
    };
  }

  private parseArenaId(encounterId: string): ParsedArenaId | null {
    const match = encounterId.match(/^arena_floor_(\d+)_(.+)$/);
    if (!match) return null;
    const floor = parseInt(match[1], 10);
    if (Number.isNaN(floor) || floor < 1 || floor > ARENA_TOTAL_FLOORS) return null;
    return { floor, enemyType: match[2] };
  }

  /**
   * Boss stats from authored BOSS_CURVE table with per-run difficulty scaling.
   * Layers come from the curve (NOT scaled). HP and attack are multiplied.
   */
  private scaleBossStats(
    floor: number,
    isFinal: boolean,
    mult: number,
  ): EncounterDef["bossStats"] {
    const curve = BOSS_CURVE[floor - 1] ?? BOSS_CURVE[BOSS_CURVE.length - 1];
    const layerCount = curve.layers;
    const baseHpPerLayer = Math.round(curve.hpPerLayer * mult);
    const layerMultipliers = Array.from(
      { length: layerCount },
      (_, i) => 1 + i * 0.1,
    );

    const basePhys = 10 + floor * 2 + (isFinal ? 8 : 0);
    const stats: EncounterDef["bossStats"] = {
      layerCount,
      baseHpPerLayer,
      layerMultipliers,
      physAttack: Math.round(basePhys * mult),
    };
    if (floor >= 3) {
      const baseMag = 6 + floor * 2;
      stats.magAttack = Math.round(baseMag * mult);
    }
    return stats;
  }

  /**
   * Chain placement on the 8x7 board. Chains appear from floor 3 and scale up.
   * Final boss gets 8 chains with hp 4.
   */
  private generateChains(floor: number, isFinal: boolean): EncounterDef["chains"] {
    const count = isFinal
      ? 8
      : Math.min(6, Math.max(1, Math.floor((floor - 1) / 2)));
    const initial: ChainPlacement[] = [];
    for (let i = 0; i < count; i++) {
      initial.push({
        x: (i * 3 + floor) % 8,
        y: (i * 2 + floor) % 7,
        hp: isFinal ? 4 : floor >= 7 ? 3 : 2,
        variant: "iron",
      });
    }
    return {
      initial,
      chainBlockedHpRatio: isFinal ? 0.6 : 0.35,
    };
  }

  /**
   * Loot table per floor. Higher floors give better rarity chances.
   * Final boss has high legendary chance.
   */
  private buildLootTable(
    floor: number,
    isFinal: boolean,
  ): Array<{ itemDefId: string; chance: number }> {
    const pick = (pool: readonly string[]): string =>
      pool[Math.floor(Math.random() * pool.length)];
    if (isFinal) {
      return [
        { itemDefId: pick(LOOT_POOLS.legendary), chance: 0.5 },
        { itemDefId: pick(LOOT_POOLS.epic), chance: 0.7 },
        { itemDefId: pick(LOOT_POOLS.rare), chance: 0.9 },
      ];
    }
    if (floor >= 8) {
      return [
        { itemDefId: pick(LOOT_POOLS.epic), chance: 0.3 },
        { itemDefId: pick(LOOT_POOLS.rare), chance: 0.5 },
        { itemDefId: pick(LOOT_POOLS.common), chance: 0.7 },
      ];
    }
    if (floor >= 5) {
      return [
        { itemDefId: pick(LOOT_POOLS.rare), chance: 0.3 },
        { itemDefId: pick(LOOT_POOLS.common), chance: 0.5 },
      ];
    }
    if (floor >= 3) {
      return [
        { itemDefId: pick(LOOT_POOLS.rare), chance: 0.2 },
        { itemDefId: pick(LOOT_POOLS.common), chance: 0.4 },
      ];
    }
    return [{ itemDefId: pick(LOOT_POOLS.common), chance: 0.4 }];
  }
}

export const arenaEncounterGenerator = new ArenaEncounterGenerator();
