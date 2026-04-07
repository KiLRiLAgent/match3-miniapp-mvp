/**
 * Lilana — Act 4 encounter — «Серафим Гордыни».
 *
 * Phase 1A vertical-slice boss fight. 9-layer HP via `baseHpPerLayer * 1.0`
 * multipliers (Σ = 540 HP). 8 железных цепей по периметру 8×7 поля —
 * пока хоть одна жива, HP босса не падает ниже 20% от bossHpMax (cm.
 * `chains.chainBlockedHpRatio`). Pattern медленный и тяжёлый: преимущественно
 * `attack` + `shield`, без `bombs` / `powerStrike` (Лилана не призывает
 * мусор, она бьёт прямо).
 *
 * NOTE: `bossStats` не содержит `hpMax` — это поле выводится в
 * `EncounterBuilder.build()` (см. types.ts → EncounterDef).
 */

import type { EncounterDef } from "../types";

export const lilanaAct4Encounter: EncounterDef = {
  id: "lilana-act4",
  characterId: "lilana",
  name: "Серафим Гордыни",
  difficulty: 3,
  bossStats: {
    layerCount: 9,
    baseHpPerLayer: 60,
    layerMultipliers: [1, 1, 1, 1, 1, 1, 1, 1, 1],
    physAttack: 12,
  },
  bossPattern: ["attack", "shield", "attack", "attack", "shield", "attack"],
  chains: {
    initial: [
      { x: 2, y: 0, hp: 2 },
      { x: 5, y: 0, hp: 2 },
      { x: 0, y: 2, hp: 2 },
      { x: 7, y: 2, hp: 2 },
      { x: 0, y: 4, hp: 2 },
      { x: 7, y: 4, hp: 2 },
      { x: 2, y: 6, hp: 2 },
      { x: 5, y: 6, hp: 2 },
    ],
    chainBlockedHpRatio: 0.2,
  },
  rewards: {
    xp: 150,
    gold: 50,
    lootText: "Серебряный кинжал, деревянный клинок или мантия",
    loot: [
      { itemDefId: "silver_dagger", chance: 0.3 },
      { itemDefId: "wooden_blade", chance: 0.5 },
      { itemDefId: "student_robes", chance: 0.7 },
    ],
  },
  relationshipImpact: {
    winDelta: { empathy: 10, dominance: 5 },
    loseDelta: { empathy: -5 },
  },
  returnDialogueId: "lilana-act4",
};
