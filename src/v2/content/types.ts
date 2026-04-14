/**
 * v2 Content Schema — single source of truth for all content-driven types in
 * "Fallen University" plus the combat-bridge contract with v1 GameScene.
 *
 * RISK-8 hardening (MITIGATION-6): PURE LEAF MODULE. Every import MUST be
 * `import type`. Allowed sources: `../core/types`, `../../game/config`,
 * `../../match3/types` (canonical `ChainVariant` per REFINEMENT 7) — no
 * `../systems/*`, `../scenes/*`, `../ui/*` (would create runtime cycles).
 *
 * Authoritative spec: `.claude/teams/feature-v2-lilana/DECISIONS.md`
 * (FINAL REFINEMENTS + RISK MITIGATIONS sections). DECISIONS.md wins on conflict.
 */

import type { BossAbilityType } from "../../game/config";
import type { ChainVariant } from "../../match3/types";
import type { ItemStats, RelationshipDelta, RelationshipState } from "../core/types";

// ─────────────────────────────────────────────────────────────────────────────
// Primitives
// ─────────────────────────────────────────────────────────────────────────────

/** Pronoun set used to substitute `{{pronoun:Он/Она/Они}}` in dialogue text. */
export type Pronouns = "he" | "she" | "they";

/** High-level affiliation of a character — drives faction-specific writing. */
export type Faction = "fallen-angel" | "demon" | "human" | "hybrid";

/** Portrait emotion — selects a sprite slot on `CharacterDef.assets`. */
export type Emotion =
  | "neutral"
  | "cold"
  | "angry"
  | "surprised"
  | "seductive"
  | "happy"
  | "sad";

/**
 * Speaker identifier on a dialogue line. Two reserved values:
 *  - `"player"` — render with the player's saved name.
 *  - `"narrator"` — render as out-of-character narration.
 * Any other string is treated as a `CharacterDef.id`.
 */
export type Speaker = "player" | "narrator" | string;

/**
 * Recursively-readonly mapped type — marks `CombatContext` immutable at the
 * type level so v1 GameScene cannot mutate frozen v2-owned data. Functions
 * pass through unchanged (callbacks live on `GameSceneInitData`, REFINEMENT 1).
 */
export type DeepReadonly<T> = T extends Function
  ? T
  : T extends ReadonlyArray<infer U>
    ? ReadonlyArray<DeepReadonly<U>>
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

// ─────────────────────────────────────────────────────────────────────────────
// Character
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Static profile of a romanceable / fightable character. Authored once,
 * never mutated at runtime — runtime state lives in
 * `SaveData.relationships[characterId]`.
 */
export interface CharacterDef {
  id: string;
  name: string;
  age?: number;
  pronouns: Pronouns;
  faction: Faction;
  archetype: string;
  shortDescription: string;
  /** Long-form lore — fed verbatim into Phase 3 AI prompts. */
  backstory: string;
  personality: {
    traits: string[];
    voiceGuidelines: string;
    forbiddenTopics?: string[];
  };
  /**
   * Per-character thresholds — all POSITIVE numbers. `hostileViaCynicism`
   * replaces the legacy negative `hostile` field (REFINEMENT — section 17).
   */
  relationshipThresholds: {
    /** empathy + dominance ≥ this → friendly bucket. */
    friendly: number;
    /** empathy + dominance ≥ this → romance bucket. */
    romance: number;
    /** cynicism ≥ this → hostile bucket (overrides friendly/romance). */
    hostileViaCynicism: number;
  };
  /**
   * Asset key registry. Phase 1A uses placeholder strings — CharacterPortrait
   * falls back to a Graphics circle if the texture is missing.
   */
  assets: {
    portraitNeutral: string;
    portraitCold?: string;
    portraitAngry?: string;
    portraitSurprised?: string;
    portraitSeductive?: string;
    portraitHappy?: string;
    portraitSad?: string;
    fullbody?: string;
    demonForm?: string;
  };
  /** First dialogue shown when the player meets this character. */
  defaultDialogueId: string;
  /** Optional greeting phrases for inter-boss transitions (brief §30-31). */
  greetings?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Dialogue
// ─────────────────────────────────────────────────────────────────────────────

/** Stable identifier of a node within a `DialogueGraph.nodes` map. */
export type DialogueNodeId = string;

/**
 * A single rendered line within a `line` node. Supports interpolation tokens
 * resolved by DialogueRunner: `{{playerName}}` and `{{pronoun:Он/Она/Они}}`
 * (Cyrillic forms separated by `/`).
 */
export interface DialogueLine {
  speaker: Speaker;
  emotion?: Emotion;
  text: string;
  /** Words to highlight inside SpeechBubble (color overrides default text). */
  highlights?: Array<{ word: string; color: string }>;
}

/**
 * One selectable option on a `choice` node. Addressed by `id`, NEVER by index
 * — indices are unstable across content edits (REFINEMENT 5).
 */
export interface DialogueChoice {
  /** Stable identifier — required. Used by `DialogueRunner.selectChoiceById`. */
  id: string;
  text: string;
  /** Hide the choice if this condition does not evaluate to `true`. */
  requires?: ConditionExpr;
  /** Relationship delta applied via RelationshipSystem when picked. */
  delta: RelationshipDelta;
  /** Next node id to advance to after the choice is taken. */
  next: DialogueNodeId;
}

/**
 * Discriminated union of all node kinds. `line` advances sequentially,
 * `choice` branches by player input, `battle` hands off to CombatBridgeScene,
 * `end` terminates the graph (optional effects fire on entry).
 */
export type DialogueNode =
  | { type: "line"; id: DialogueNodeId; lines: DialogueLine[]; next?: DialogueNodeId }
  | { type: "choice"; id: DialogueNodeId; prompt?: string; choices: DialogueChoice[] }
  | {
      type: "battle";
      id: DialogueNodeId;
      encounterId: string;
      onVictory: DialogueNodeId;
      onDefeat: DialogueNodeId;
    }
  | { type: "end"; id: DialogueNodeId; effects?: EffectExpr[] };

/** Authored dialogue graph — pure data, loaded into DialogueRunner. */
export interface DialogueGraph {
  id: string;
  /** Optional owning character — drives RelationshipSystem.applyDelta routing. */
  characterId?: string;
  startNode: DialogueNodeId;
  nodes: Record<DialogueNodeId, DialogueNode>;
}

/**
 * Declarative condition — evaluated against SaveData by `conditionEval`
 * (shared by DialogueRunner and LocationScene). All fields optional and
 * AND-combined; an empty expression is `true`.
 */
export interface ConditionExpr {
  /** Story flag key — present (non-undefined) → matches. */
  flag?: string;
  /** When set together with `flag`, requires the flag to deeply equal this. */
  flagEquals?: unknown;
  empathyGte?: number;
  dominanceGte?: number;
  cynicismGte?: number;
  hasItem?: string;
}

/**
 * Declarative effect mutating SaveData. Applied by DialogueRunner on `end`
 * node entry (or future effect slots). NO `"unlockAct"` type — use `setFlag`
 * with a namespaced key like `"lilana:act1:done"` (REFINEMENT — section 16).
 */
export interface EffectExpr {
  type:
    | "setFlag"
    | "addEmpathy"
    | "addDominance"
    | "addCynicism"
    | "addItem"
    | "removeItem"
    | "addXp"
    | "addGold";
  /** Used by `setFlag` (flag key) and `addItem`/`removeItem` (item def id). */
  key?: string;
  /** Used by `setFlag` — payload value (boolean | number | string). */
  value?: unknown;
  /** Used by stat-delta and reward effects. */
  amount?: number;
  /** Disambiguates target character when an effect needs to override the dialogue owner. */
  characterId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Inventory / Progression (Phase 1B)
// ─────────────────────────────────────────────────────────────────────────────

/** Equipment slot for an item — matches `InventorySave.equipped` keys. */
export type ItemSlot = "weapon" | "armor" | "accessory";

/**
 * Rarity tier — drives UI color, drop weighting, and shop pricing.
 * Phase 2A: extended with `"legendary"` (R6). Legendary items ALWAYS contain a
 * `crit` stat field per DECISIONS.md. Existing Phase 1B items (common/rare)
 * are untouched.
 */
export type ItemRarity = "common" | "rare" | "epic" | "legendary";

/**
 * Authored item definition — pure data, lives in `ItemDatabase` (Phase 1B).
 * `ItemInstance.itemDefId` references `ItemDef.id`. Runtime state (level,
 * rolledStats) lives on the `ItemInstance`, never on the def.
 */
export interface ItemDef {
  id: string;
  name: string;
  description: string;
  slot: ItemSlot;
  rarity: ItemRarity;
  /** Base stat contribution — additive with `ItemInstance.rolledStats`. */
  baseStats: Partial<ItemStats>;
  /** Optional sprite/icon asset key — falls back to placeholder if missing. */
  iconKey?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Arena buffs (Phase 2A) — run-only modifiers picked between fights.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Buff effect type — enumerates HOW a buff modifies player state during an
 * arena run. Phase 2A scope is intentionally narrow: the first five effect
 * types (`addPhysAttack`, `addMagAttack`, `addMaxHp`, `addMaxMp`, `addCrit`)
 * are applied via `BuffSystem.applyToStats()` hook in `EncounterBuilder.build`
 * and have full runtime support. The remainder are content-only definitions
 * shipped for Phase 2B follow-up — `BuffSystem` may stub or partially handle
 * them (e.g. `extraReward` is a simple counter check in ArenaRewardScene).
 */
export type BuffEffectType =
  | "addPhysAttack"
  | "addMagAttack"
  | "addMaxHp"
  | "addMaxMp"
  | "addCrit"
  | "addMpRegen"
  | "damageReduction"
  | "physPerFightSurvived"
  | "extraReward"
  | "reviveOnDeath";

/**
 * Authored buff definition — pure data, lives in `BUFFS` registry. `value`
 * is the magnitude (units depend on `effectType`: integer stat for stat-adds,
 * percent for `damageReduction` / `addCrit`). `rarity` here is the BUFF rarity
 * (drives reward-scene weighting), distinct from `ItemRarity`.
 */
export interface BuffDef {
  id: string;
  name: string;
  description: string;
  effectType: BuffEffectType;
  value: number;
  rarity: "common" | "rare" | "epic";
  /** When true, multiple instances stack (e.g. `physPerFightSurvived`). */
  stackable?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Encounter
// ─────────────────────────────────────────────────────────────────────────────

/** Authored placement of one chain on the 8×7 board. */
export interface ChainPlacement {
  x: number;
  y: number;
  hp: number;
  /** Defaults to `"iron"` at placement time inside GameScene's mapping step. */
  variant?: ChainVariant;
}

/**
 * Authored encounter — pure data. Boss `hpMax` is intentionally NOT a direct
 * field; it is DERIVED in `EncounterBuilder.build()` from
 * `baseHpPerLayer * layerMultipliers[i]` and exposed via
 * `CombatContext.derived.bossHpMax` / `bossLayerHpArray`.
 */
export interface EncounterDef {
  id: string;
  characterId: string;
  name: string;
  /** Free-form difficulty tag (1–10) — used for sorting / display. */
  difficulty: number;
  bossStats: {
    layerCount: number;
    baseHpPerLayer: number;
    layerMultipliers: number[];
    physAttack: number;
    magAttack?: number;
  };
  /**
   * Boss ability rotation as typed strings (REFINEMENT 6). Passed directly
   * to `BossAbilityManager` via its `patternOverride` constructor parameter
   * — no numeric conversion needed (REFINEMENT 8).
   */
  bossPattern: BossAbilityType[];
  /**
   * Optional chain mechanic. While ≥1 chain is alive, boss HP cannot fall
   * below `chainBlockedHpRatio * bossHpMax` — GameScene shows
   * "BLOCKED BY CHAINS" floating text on attempts.
   */
  chains?: {
    initial: ChainPlacement[];
    /** Range [0..1] — validated by EncounterBuilder.build. */
    chainBlockedHpRatio: number;
  };
  rewards: {
    xp: number;
    gold: number;
    /** Phase 1A loot is text-only — kept for backward compat with legacy encounters. */
    lootText?: string;
    /**
     * Phase 1B item loot drops. Each entry is an `ItemDef.id` reference plus a
     * drop chance in range [0..1]. Rolled by `EncounterBuilder.applyResult()`
     * on victory — results surfaced on `CombatResult.lootedItems`.
     */
    loot?: Array<{ itemDefId: string; chance: number }>;
  };
  relationshipImpact?: {
    winDelta: RelationshipDelta;
    loseDelta: RelationshipDelta;
  };
  /** If set, PostCombatScene → DialogueScene resumes here on Continue. */
  returnDialogueId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Combat bridge — v2 ↔ GameScene contract
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Player combat stats projected from `SaveData.player.stats`. Note the rename
 * `hp → hpMax` / `mp → manaMax` — SaveData keeps the legacy short names, but
 * CombatContext uses the unambiguous *_Max suffix (DECISIONS section 18).
 */
export interface PlayerCombatStats {
  hpMax: number;
  manaMax: number;
  physAttack: number;
  magAttack: number;
  crit: number;
  /** Phase 2B: starting mana override from stat_start_mp perks + mana_surge passive. */
  manaStart?: number;
  /** v2: arena HP carry-over — starting HP for this fight (undefined = full). */
  carriedHp?: number;
  /** v2: arena mana carry-over — starting mana for this fight (undefined = 0 + bonuses). */
  carriedMana?: number;
}

/**
 * Frozen pure-data snapshot passed from CombatBridgeScene to GameScene via
 * `GameSceneInitData.encounterContext`. Entire shape is `DeepReadonly` —
 * GameScene MUST NOT mutate it (use `getEffective*` getters instead).
 * REFINEMENT 1: NO `onComplete` here; callback lives on `GameSceneInitData`.
 */
export interface CombatContext {
  encounterId: string;
  characterId: string;
  encounterDef: DeepReadonly<EncounterDef>;
  playerStats: DeepReadonly<PlayerCombatStats>;
  derived: DeepReadonly<{
    bossHpMax: number;
    bossLayerHpArray: readonly number[];
  }>;
  relationshipSnapshot: DeepReadonly<RelationshipState>;
}

/**
 * Init data accepted by `GameScene.init()`. Legacy v1 fields preserved so the
 * IntroScene → GameScene flow is unaffected; v2-only fields appended below.
 * `onCombatComplete` is the SOLE channel for the RawCombatResult emitted back
 * to CombatBridgeScene; closure carries `encounterDef`/`context` (MITIGATION-2).
 */
/**
 * Arena perk skill stats — shape mirrors ArenaPerkApplicator.EffectiveSkillStats
 * but declared here as a standalone type to avoid runtime import from v2/systems/
 * in GameScene (gold standard §5). CombatBridgeScene maps between them.
 */
export interface ArenaSkillOverride {
  unlocked: boolean;
  level: number;
  cost: number;
  cooldown: number;
  damage?: number;
  heal?: number;
  stunTurns?: number;
  hammerPattern?: "single" | "cross" | "square";
}

/**
 * Arena passive effects snapshot — shape mirrors ArenaPerkApplicator.PassiveSnapshot.
 * Declared here to keep GameScene free of runtime v2 imports.
 */
export interface ArenaPassiveSnapshot {
  lifestealPercent: number;
  rageDmgMult: number;
  rageHpThreshold: number;
  critBonus: number;
  bombDmgBonus: number;
  shieldBreakChance: number;
  reflectPercent: number;
  regenPerTurn: number;
  manaBonusAtStart: number;
  startMpBonus: number;
  skillCostReduction: number;
  hasDefuser: boolean;
  hasQuickDraw: boolean;
  hasExplosiveMagic: boolean;
}

export interface GameSceneInitData {
  fromIntro?: boolean;
  finalDialogue?: string;
  startHidden?: boolean;
  bgState?: { x: number; y: number; scale: number };
  bossState?: { x: number; y: number; scale: number };
  // v2 additions
  encounterContext?: CombatContext;
  onCombatComplete?: (raw: RawCombatResult) => void;
  // v2: arena perk system — injected from CombatBridgeScene (gold standard §6)
  arenaPerksEnabled?: boolean;
  /** Live getter — returns current effective skill stats for a given skill id. */
  arenaSkillStats?: (id: string) => ArenaSkillOverride;
  /** Live getter — returns current passive perk snapshot. */
  arenaPassives?: () => ArenaPassiveSnapshot;
  /** Perk modal controller — opens a blocking modal, resolves when player picks. */
  arenaPerkModal?: { open(scene: unknown): Promise<void> };
  /** v2: arena cooldown persistence — carry over skill cooldowns between arena fights. */
  arenaSkillCooldowns?: Record<string, number>;
}

/**
 * Raw combat result emitted by GameScene on victory/defeat. GameScene knows
 * nothing about XP/gold/relationship deltas — those fields live on
 * `CombatResult` and are populated by `EncounterBuilder.applyResult()` inside
 * CombatBridgeScene (REFINEMENT 2).
 */
export interface RawCombatResult {
  encounterId: string;
  characterId: string;
  victory: boolean;
  damageDealt: number;
  damageReceived: number;
  chainsBroken: number;
  turnsPlayed: number;
  /** v2: arena cooldown persistence — final skill cooldowns at end of fight. */
  finalSkillCooldowns?: Record<string, number>;
  /** v2: arena HP carry-over — player HP remaining at end of fight. */
  remainingHp?: number;
  /** v2: arena mana carry-over — player mana remaining at end of fight. */
  remainingMana?: number;
}

/**
 * Enriched combat result — `RawCombatResult` + rewards/delta from
 * `EncounterBuilder.applyResult()`. PostCombatScene displays this shape
 * purely; it never mutates SaveData itself.
 */
export interface CombatResult extends RawCombatResult {
  appliedDelta: RelationshipDelta;
  xpGained: number;
  goldGained: number;
  /** Phase 1B — true when the player crossed an XP threshold this encounter. */
  leveledUp?: boolean;
  /** Phase 1B — player level AFTER this encounter (only set when leveledUp). */
  newLevel?: number;
  /** Phase 1B — ItemDef ids rolled from `EncounterDef.rewards.loot`. */
  lootedItems?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Location
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One option on `LocationHotspot.dialogues`. LocationScene filters by
 * `condition`, sorts by `priority` descending, picks the first match. If all
 * `priority` are undefined, array order is preserved (REFINEMENT 4).
 */
export interface HotspotDialogueOption {
  dialogueId: string;
  condition?: ConditionExpr;
  /** Higher value picked first; ties or undefined → array order. */
  priority?: number;
}

/**
 * One interactive NPC slot on a location background. The `dialogues` array is
 * declarative (no callback) so Phase 3 AI integration can serialize the gating
 * logic to JSON without losing semantics (REFINEMENT — section 15).
 */
export interface LocationHotspot {
  id: string;
  label: string;
  characterId?: string;
  dialogues: HotspotDialogueOption[];
  /** Position in normalized 0..1 coordinates relative to background. */
  position: { x: number; y: number };
}

/** Authored location definition — pure data, loaded into LocationScene. */
export interface LocationDef {
  id: string;
  name: string;
  description: string;
  /** ASSET_KEYS entry, or a Phase-1A placeholder string. */
  backgroundKey: string;
  hotspots: LocationHotspot[];
  /** If true, location is visible from the start of a new save. */
  unlockedByDefault?: boolean;
}
