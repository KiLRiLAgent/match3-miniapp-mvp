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
export const SAVE_VERSION = 1;

/** Basic combat stats attached to the player avatar (before inventory). */
export interface PlayerStats {
  hp: number;
  mp: number;
  physAttack: number;
  magAttack: number;
  crit: number;
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
}
