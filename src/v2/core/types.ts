/**
 * SaveData — single source of truth for v2 persistent state.
 *
 * Stored in localStorage under SAVE_KEY as a JSON blob. Versioned via
 * `version` field — SaveManager runs migration functions on load when the
 * stored version is lower than SAVE_VERSION.
 *
 * v1 localStorage keys (`match3_params`, `match3_audio`, `match3_haptic`) are
 * NOT touched by SaveManager. On first v2 launch, the audio and haptic values
 * are mirrored into `SaveData.settings` so v2 can read them without importing
 * v1 utilities. Legacy keys remain intact — v1 code still reads them.
 */

export const SAVE_KEY = "match3_save_v2";
export const SAVE_VERSION = 5;

/** Basic combat stats attached to the player avatar (before inventory). */
export interface PlayerStats {
  hp: number;
  mp: number;
  physAttack: number;
  magAttack: number;
  crit: number;
}

/**
 * Fully-materialized player stats after applying equipment bonuses on top of
 * `SaveData.player.stats`. All fields required (unlike `ItemStats` which is
 * partial). Computed by InventorySystem/ProgressionSystem on demand — NEVER
 * stored in SaveData.
 */
export interface EffectivePlayerStats {
  hp: number;
  mp: number;
  physAttack: number;
  magAttack: number;
  crit: number;
}

/** Per-stat point allocation — tracks how many points were allocated to each stat. */
export interface AllocatedStats {
  hp: number;
  mp: number;
  physAttack: number;
  magAttack: number;
}

export interface PlayerSave {
  id: string;
  name: string;
  gender: "male" | "female" | "nb";
  avatarKey: string;
  level: number;
  xp: number;
  xpToNext: number;
  stats: PlayerStats;
  /** Points already distributed and saved permanently. */
  allocatedStats?: AllocatedStats;
  /** Unspent stat points available for distribution. */
  pendingStatPoints?: number;
}

/** Stat contribution from a single item instance. */
export interface ItemStats {
  hp?: number;
  mp?: number;
  physAttack?: number;
  magAttack?: number;
  crit?: number;
}

export interface ItemInstance {
  id: string;            // unique instance id (generated)
  itemDefId: string;     // reference into ItemDatabase
  level?: number;
  rolledStats?: ItemStats;
}

export interface InventorySave {
  gold: number;
  items: ItemInstance[];
  equipped: {
    weapon?: string;     // ItemInstance id
    armor?: string;
    accessory?: string;
  };
}

export interface DialogueHistoryEntry {
  dialogueId: string;
  nodeId: string;
  ts: number;
}

export interface StorySave {
  currentLocationId: string;
  visitedLocations: string[];
  completedEncounters: string[];
  activeQuestId?: string;
  flags: Record<string, boolean | number | string>;
  dialogueHistory: DialogueHistoryEntry[];
}

export interface RelationshipDelta {
  empathy?: number;
  dominance?: number;
  cynicism?: number;
}

export interface DecisionLogEntry {
  ts: number;
  kind: "dialogue" | "combat" | "ai-chat";
  ref: string;            // dialogueId | encounterId | messageId
  summary: string;        // short description, ≤120 chars, used in AI prompts
  delta: RelationshipDelta;
}

export interface RelationshipState {
  empathy: number;        // 0..100
  dominance: number;      // 0..100
  cynicism: number;       // 0..100
  affinity: number;       // derived overall score 0..100
  romanced: boolean;
  metAt?: number;
  lastInteraction?: number;
  decisionLog: DecisionLogEntry[];
}

export type RelationshipMap = Record<string, RelationshipState>;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  ts: number;
}

/** Phase 3 — AI romance chat state. */
export interface AISave {
  apiCreditsLeft: number;
  monthlyResetAt: number;
  conversationsByCharId: Record<string, ChatMessage[]>;
}

export interface AudioSettings {
  muted: boolean;
  volume: number;
}

export interface HapticSettings {
  enabled: boolean;
}

export interface SettingsSave {
  audio: AudioSettings;
  haptic: HapticSettings;
  language: "ru" | "en";
}

export interface StatsSave {
  totalPlayTimeSec: number;
  combatsWon: number;
  combatsLost: number;
  dialoguesCompleted: number;
}

/**
 * Phase 2A — Arena roguelike (Archero-style run state).
 *
 * A single active run carries the player through 5 normal fights + 1 boss
 * fight (floors 1..6). Picked buffs live in `activeRun.activeBuffs` and are
 * applied only while the run is in progress — BuffSystem.applyToStats
 * returns the base stats unchanged when `activeRun === null`.
 *
 * Accumulated rewards (xp/gold/items) are applied to the persistent save
 * when the run completes OR is aborted (defeat). Rewards reflect cleared
 * floors only — the current floor's lost fight does not contribute. On
 * defeat, `activeRun` is reset to null after pending rewards are flushed
 * (see DECISIONS R5, task #5 state machine).
 */
export interface ActiveBuff {
  buffDefId: string;
  sourceFightFloor: number;
}

export interface ArenaRunState {
  floor: number;              // 1..6 (6 = boss)
  enemyType: string;          // characterId of next enemy (arena_bandit | ...)
  activeBuffs: ActiveBuff[];
  accumulatedRewards: {
    xp: number;
    gold: number;
    items: string[];          // itemDefIds queued to hand out on run completion
  };
  startedAt: number;          // unix ms
  /**
   * Phase 2A+ Archero map — characterIds of all 6 planned floors, pre-rolled
   * at `startNewRun` so ArenaRunScene can display the full upcoming path.
   * Optional for backward compat with pre-fix mid-run saves; ArenaSystem
   * lazily fills it on first read when missing.
   */
  plannedEnemies?: string[];
  /** Phase 2B perk progression — skill perk levels accumulated during this run. */
  perkLevels?: Record<string, number>;
  /** Phase 2B perk progression — IDs of one-time passive perks taken this run. */
  takenPassives?: string[];
  /** Phase 2B perk progression — stat perk pick counts accumulated this run. */
  statPerkCounts?: Record<string, number>;
  /** v2: arena cooldown persistence — skill cooldowns carried over between fights. */
  skillCooldowns?: Record<string, number>;
  /** v2: arena HP carry-over — remaining HP after last fight (undefined = full). */
  carriedHp?: number;
  /** v2: arena mana carry-over — remaining mana after last fight (undefined = 0 + bonuses). */
  carriedMana?: number;
}

export interface ArenaSave {
  activeRun: ArenaRunState | null;
  bestScore: number;          // highest floor cleared (0..6)
  totalRunsCompleted: number;
  totalRunsFailed: number;
}

export interface SaveData {
  version: number;
  schemaCreatedAt: number;
  lastSavedAt: number;
  player: PlayerSave;
  inventory: InventorySave;
  story: StorySave;
  relationships: RelationshipMap;
  ai: AISave;
  settings: SettingsSave;
  stats: StatsSave;
  arena: ArenaSave;
}
