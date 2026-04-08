/**
 * Arena enemies — synthetic CharacterDefs for Phase 2A procedural arena.
 *
 * These are NOT story characters. They reuse the existing CharacterDef shape
 * with minimal valid fields:
 *  - `defaultDialogueId: "arena_no_dialogue"` — never resolved at runtime.
 *    Arena flow routes Combat → PostCombatScene → ArenaRunScene without
 *    touching DialogueScene.
 *  - `assets.portraitNeutral` is a placeholder texture key that will NOT
 *    be present in the Phaser texture cache. `CharacterPortrait` falls back
 *    to a colored Arc + initial letter when the texture is missing (see
 *    `src/v2/ui/CharacterPortrait.ts:93-104`).
 *  - `relationshipThresholds: { friendly: 0, romance: 0, hostileViaCynicism: 100 }`
 *    keeps unknown enemies neutral in RelationshipSystem reductions. Arena
 *    combat currently emits no relationship deltas.
 *
 * Registered into `CHARACTERS` via `./index.ts` (spread after lilana) so
 * CombatBridgeScene / RelationshipSystem lookups resolve arena enemies the
 * same way as story characters.
 *
 * Authoritative spec: `.briefs/v2-phase-2a-arena-items.md` (Synthetic enemy
 * CharacterDef pattern) and `DECISIONS.md` R11.
 */

import type { CharacterDef } from "../types";

const arenaBandit: CharacterDef = {
  id: "arena_bandit",
  name: "Бандит",
  pronouns: "he",
  faction: "human",
  archetype: "generic-enemy",
  shortDescription: "Дорожный разбойник из ближайшей деревни.",
  backstory:
    "Один из множества безымянных нарушителей закона, привлечённых деньгами и слабой охраной торговых путей.",
  personality: {
    traits: ["hostile", "opportunistic"],
    voiceGuidelines: "Не используется — арена-враги не имеют диалогов.",
  },
  relationshipThresholds: { friendly: 0, romance: 0, hostileViaCynicism: 100 },
  assets: { portraitNeutral: "placeholder_arena_bandit" },
  defaultDialogueId: "arena_no_dialogue",
};

const arenaDarkMage: CharacterDef = {
  id: "arena_dark_mage",
  name: "Тёмный маг",
  pronouns: "he",
  faction: "demon",
  archetype: "generic-enemy",
  shortDescription: "Колдун-отступник, изучающий запретные искусства.",
  backstory:
    "Изгнан из академии за эксперименты с кровью. Использует магию бомб и щитов, чтобы изматывать противника.",
  personality: {
    traits: ["cold", "calculating"],
    voiceGuidelines: "Не используется — арена-враги не имеют диалогов.",
  },
  relationshipThresholds: { friendly: 0, romance: 0, hostileViaCynicism: 100 },
  assets: { portraitNeutral: "placeholder_arena_dark_mage" },
  defaultDialogueId: "arena_no_dialogue",
};

const arenaWarden: CharacterDef = {
  id: "arena_warden",
  name: "Страж",
  pronouns: "he",
  faction: "human",
  archetype: "generic-enemy",
  shortDescription: "Закалённый ветеран на службе старого ордена.",
  backstory:
    "Тренированный воин с тяжёлой бронёй и щитом. Защищает древние тайны ордена от любого чужака.",
  personality: {
    traits: ["disciplined", "loyal"],
    voiceGuidelines: "Не используется — арена-враги не имеют диалогов.",
  },
  relationshipThresholds: { friendly: 0, romance: 0, hostileViaCynicism: 100 },
  assets: { portraitNeutral: "placeholder_arena_warden" },
  defaultDialogueId: "arena_no_dialogue",
};

const arenaApostate: CharacterDef = {
  id: "arena_apostate",
  name: "Отступник",
  pronouns: "they",
  faction: "demon",
  archetype: "generic-enemy",
  shortDescription: "Бывший студент Университета, переметнувшийся к Падшим.",
  backstory:
    "Узнал слишком много из старых текстов и сменил сторону. Сочетает физическую силу и магию крови.",
  personality: {
    traits: ["volatile", "vengeful"],
    voiceGuidelines: "Не используется — арена-враги не имеют диалогов.",
  },
  relationshipThresholds: { friendly: 0, romance: 0, hostileViaCynicism: 100 },
  assets: { portraitNeutral: "placeholder_arena_apostate" },
  defaultDialogueId: "arena_no_dialogue",
};

const arenaDemon: CharacterDef = {
  id: "arena_demon",
  name: "Демон",
  pronouns: "they",
  faction: "demon",
  archetype: "generic-enemy",
  shortDescription: "Существо из глубин, призванное запретным ритуалом.",
  backstory:
    "Финальный босс арены — мощное демоническое существо с разрушительными атаками. Появляется на 6-м этаже как испытание для самых сильных.",
  personality: {
    traits: ["cruel", "ancient"],
    voiceGuidelines: "Не используется — арена-враги не имеют диалогов.",
  },
  relationshipThresholds: { friendly: 0, romance: 0, hostileViaCynicism: 100 },
  assets: { portraitNeutral: "placeholder_arena_demon" },
  defaultDialogueId: "arena_no_dialogue",
};

export const ARENA_ENEMIES: Record<string, CharacterDef> = {
  arena_bandit: arenaBandit,
  arena_dark_mage: arenaDarkMage,
  arena_warden: arenaWarden,
  arena_apostate: arenaApostate,
  arena_demon: arenaDemon,
};
