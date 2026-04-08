/**
 * SaveManager — единая точка чтения/записи v2 persistent state.
 *
 * Хранит весь прогресс v2 в одном localStorage ключе `match3_save_v2` как
 * JSON. Версионируется через `SaveData.version` — при чтении устаревшего
 * сейва прогоняется цепочка миграций.
 *
 * API:
 * - load()      — читает из localStorage, валидирует, мигрирует. Возвращает
 *                 дефолтный SaveData если ключа нет (первый запуск v2).
 * - save()      — сериализует текущее состояние и пишет в localStorage.
 * - get()       — возвращает текущий SaveData, кидает если не загружено.
 * - patch(fn)   — мутирует SaveData через callback, авто-сохраняет (debounced).
 * - reset()     — полный сброс до дефолтов (newGame button).
 * - exportJson  — для дебага / Phase 4 cloud sync.
 * - importJson  — restore из backup строки.
 *
 * Legacy migration: при первом запуске v2 зеркалит `match3_audio` и
 * `match3_haptic` в SaveData.settings, НЕ удаляя legacy ключи (v1 продолжает
 * их читать).
 *
 * Auto-save debounce: 2000 ms (не чаще раза в 2 секунды). Последний patch
 * всегда flush-ится через beforeunload listener.
 */

import {
  SAVE_KEY,
  SAVE_VERSION,
  type ArenaSave,
  type SaveData,
} from "./types";
import { eventBus } from "./EventBus";

const AUTO_SAVE_DEBOUNCE_MS = 2000;

/**
 * Equipment slot order — must match keys in InventorySave.equipped. Used by
 * importJson to scan/clean orphan equipped references after schema validation.
 * Phase 1C task #8 hoists the same constant inside InventorySystem; we keep an
 * independent copy here to avoid a v2/core → v2/systems dependency edge.
 */
const SLOT_ORDER: readonly ("weapon" | "armor" | "accessory")[] = [
  "weapon",
  "armor",
  "accessory",
];

const LEGACY_AUDIO_KEY = "match3_audio";
const LEGACY_HAPTIC_KEY = "match3_haptic";

function generateId(): string {
  // lightweight pseudo-uuid for player.id — no external deps
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Default Phase 2A arena state — empty run slot, zeroed stats. Shared between
 * `createDefaultSaveData` (fresh save) and `migrateV1ToV2` (existing Phase 1B/1C
 * saves being upgraded to SAVE_VERSION 2).
 */
function createDefaultArenaSave(): ArenaSave {
  return {
    activeRun: null,
    bestScore: 0,
    totalRunsCompleted: 0,
    totalRunsFailed: 0,
  };
}

function createDefaultSaveData(): SaveData {
  const now = Date.now();
  return {
    version: SAVE_VERSION,
    schemaCreatedAt: now,
    lastSavedAt: now,
    player: {
      id: generateId(),
      name: "Падший",
      gender: "nb",
      avatarKey: "player_default",
      level: 1,
      xp: 0,
      xpToNext: 100,
      stats: { hp: 200, mp: 100, physAttack: 10, magAttack: 10, crit: 0 },
    },
    inventory: {
      gold: 0,
      items: [],
      equipped: {},
    },
    story: {
      currentLocationId: "atrium",
      visitedLocations: [],
      completedEncounters: [],
      flags: {},
      dialogueHistory: [],
    },
    relationships: {},
    ai: {
      apiCreditsLeft: 0,
      monthlyResetAt: 0,
      conversationsByCharId: {},
    },
    settings: {
      audio: { muted: false, volume: 0.5 },
      haptic: { enabled: true },
      language: "ru",
    },
    stats: {
      totalPlayTimeSec: 0,
      combatsWon: 0,
      combatsLost: 0,
      dialoguesCompleted: 0,
    },
    arena: createDefaultArenaSave(),
  };
}

/**
 * Mirror legacy v1 settings (match3_audio, match3_haptic) into fresh
 * SaveData.settings. Runs only on first v2 launch (when no SaveData exists).
 * Legacy keys are NOT deleted — v1 continues to read them.
 */
function mirrorLegacySettings(data: SaveData): void {
  if (typeof localStorage === "undefined") return;
  try {
    const rawAudio = localStorage.getItem(LEGACY_AUDIO_KEY);
    if (rawAudio) {
      const parsed = JSON.parse(rawAudio);
      if (typeof parsed?.muted === "boolean") data.settings.audio.muted = parsed.muted;
      if (typeof parsed?.volume === "number") data.settings.audio.volume = parsed.volume;
    }
  } catch {
    // ignore malformed legacy data
  }
  try {
    const rawHaptic = localStorage.getItem(LEGACY_HAPTIC_KEY);
    if (rawHaptic !== null) {
      const parsed = JSON.parse(rawHaptic);
      if (typeof parsed === "boolean") data.settings.haptic.enabled = parsed;
    }
  } catch {
    // ignore
  }
}

/**
 * Migration chain from older SaveData versions to SAVE_VERSION.
 * Each entry takes the previous version and returns the next version.
 *
 * PURE FORWARD contract (DECISIONS R1): migrations ONLY add new fields,
 * NEVER mutate existing ones. Existing Phase 1B/1C saves must load cleanly.
 *
 * Add new migrations here as the schema evolves:
 *   MIGRATIONS[N] = (old) => ({ ...old, newField: defaultValue, version: N + 1 });
 */
const MIGRATIONS: Record<number, (data: any) => any> = {
  // v1 → v2 (Phase 2A): add `arena` field with defaults. No existing fields
  // touched — Phase 1B/1C saves load as-is with fresh arena state.
  1: (old) => ({
    ...old,
    arena: old.arena ?? createDefaultArenaSave(),
    version: 2,
  }),
};

function migrate(raw: unknown): SaveData {
  if (!raw || typeof raw !== "object") {
    throw new Error("SaveManager: raw data is not an object");
  }
  let data = raw as any;
  let v = typeof data.version === "number" ? data.version : 0;
  while (v < SAVE_VERSION) {
    const migrator = MIGRATIONS[v];
    if (!migrator) {
      throw new Error(`SaveManager: no migration from version ${v}`);
    }
    data = migrator(data);
    v = data.version;
  }
  return data as SaveData;
}

class SaveManager {
  private data: SaveData | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private beforeUnloadHandler: (() => void) | null = null;
  /**
   * True after the last save attempt threw (quota exceeded, IO error, etc).
   * Reset to false on the next successful save. Subscribers should treat this
   * as a hint, not a definitive state — the eventBus `saveError` payload is
   * the authoritative one-shot signal.
   */
  private saveFailed = false;

  /**
   * Read SaveData from localStorage. If no save exists, creates a fresh
   * default and mirrors legacy v1 audio/haptic settings. Runs migrations
   * if the stored version is older than SAVE_VERSION.
   */
  load(): SaveData {
    if (typeof localStorage === "undefined") {
      this.data = createDefaultSaveData();
      return this.data;
    }

    let raw: string | null = null;
    try {
      raw = localStorage.getItem(SAVE_KEY);
    } catch {
      raw = null;
    }

    if (!raw) {
      this.data = createDefaultSaveData();
      mirrorLegacySettings(this.data);
      this.attachBeforeUnload();
      return this.data;
    }

    try {
      const parsed = JSON.parse(raw);
      this.data = migrate(parsed);
    } catch (err) {
      console.error("SaveManager: failed to parse save, resetting to defaults", err);
      this.data = createDefaultSaveData();
      mirrorLegacySettings(this.data);
    }

    this.attachBeforeUnload();
    return this.data;
  }

  /** Synchronously persist current data to localStorage. */
  save(): void {
    if (!this.data || typeof localStorage === "undefined") return;
    this.data.lastSavedAt = Date.now();
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
      this.saveFailed = false;
    } catch (err) {
      this.saveFailed = true;
      const isQuota =
        err instanceof DOMException &&
        (err.name === "QuotaExceededError" ||
          err.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
          // some browsers report by code, not name
          err.code === 22 ||
          err.code === 1014);
      const message = err instanceof Error ? err.message : String(err);
      eventBus.emit("saveError", {
        reason: isQuota ? "quota" : "unknown",
        error: message,
      });
      console.error("SaveManager: save failed", err);
    }
  }

  /**
   * Returns true if the last save attempt threw (quota exceeded, IO error).
   * Cleared on the next successful save. Use this as a hint when deciding
   * whether to prompt the user to export/clear before further play.
   */
  isSaveFailed(): boolean {
    return this.saveFailed;
  }

  /** Returns the current SaveData. Throws if load() was not called. */
  get(): SaveData {
    if (!this.data) {
      throw new Error("SaveManager: get() called before load()");
    }
    return this.data;
  }

  /**
   * Mutate SaveData through a callback. Triggers a debounced auto-save.
   * Use this instead of directly mutating `get()` results so persistence
   * is guaranteed.
   */
  patch(mutator: (data: SaveData) => void): void {
    const data = this.get();
    mutator(data);
    this.scheduleAutoSave();
  }

  /** Immediately flush any pending debounced save. */
  flush(): void {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.save();
  }

  /** Wipe save state and return a fresh default (used for "New Game"). */
  reset(): SaveData {
    this.data = createDefaultSaveData();
    this.save();
    return this.data;
  }

  /** Serialize current data to a JSON string (for backups / cloud sync). */
  exportJson(): string {
    return JSON.stringify(this.get(), null, 2);
  }

  /**
   * Restore save from a JSON string. Per DECISIONS.md R8 / R9:
   *  1. Parse JSON (TypeError-safe)
   *  2. Shallow shape validation via {@link validateSaveShape}
   *  3. Auto-clean orphan equipped slots (forgiving — drop the slot, keep the save)
   *  4. Clamp `lastSavedAt` if it's in the future (clock-skew defense)
   *  5. Run module-level migrate() in its own try-catch
   *
   * Returns a discriminated union — callers MUST narrow on `ok` before reading
   * `error` (R8 — zero existing call sites confirmed pre-Phase 1C).
   */
  importJson(json: string): { ok: true } | { ok: false; error: string } {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `Invalid JSON: ${message}` };
    }

    const shape = this.validateSaveShape(parsed);
    if (!shape.ok) {
      return shape;
    }

    // Shape passed — narrow to a SaveData-shaped record. Field-level types are
    // not deeply validated (R9 — overkill for Phase 1C), so use Record indirection
    // for the loose mutations below.
    const parsedData = parsed as SaveData;

    // (a) Auto-clean orphan equipped slots BEFORE migrate. Forgiving cleanup —
    // a stale equipped reference is a UX papercut, not a save-rejecting error.
    const itemIds = new Set(parsedData.inventory.items.map((it) => it.id));
    const equippedRecord = parsedData.inventory.equipped as Record<
      string,
      string | undefined
    >;
    for (const slot of SLOT_ORDER) {
      const equippedId = equippedRecord[slot];
      if (equippedId && !itemIds.has(equippedId)) {
        delete equippedRecord[slot];
        console.warn(
          `SaveManager.importJson: cleaned orphan equipped[${slot}] -> ${equippedId}`,
        );
      }
    }

    // (b) Clamp future lastSavedAt — corruption defense without rewriting valid
    // history. Per R9: forgiving over rejecting.
    if (
      typeof parsedData.lastSavedAt === "number" &&
      parsedData.lastSavedAt > Date.now()
    ) {
      console.warn(
        `SaveManager.importJson: clamping future lastSavedAt ${parsedData.lastSavedAt} -> now`,
      );
      parsedData.lastSavedAt = Date.now();
    }

    // (c) Migration in its own try-catch — separate from parse/shape errors so
    // a migration failure surfaces a distinct user-facing reason.
    let migrated: SaveData;
    try {
      migrated = migrate(parsedData);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `Migration failed: ${message}` };
    }

    this.data = migrated;
    this.save();
    return { ok: true };
  }

  /**
   * Shallow schema check — verifies the top-level SaveData skeleton exists
   * with the expected primitive types. Does NOT recurse into items[] / stats
   * fields (R9 — accepted edge case: a malformed item field will surface as
   * a runtime error at first read, not at import).
   *
   * Public consumers should use {@link importJson} instead — this method is
   * an implementation detail.
   */
  private validateSaveShape(
    data: unknown,
  ): { ok: true } | { ok: false; error: string } {
    if (!data || typeof data !== "object") {
      return { ok: false, error: "save data is not an object" };
    }
    const d = data as Record<string, unknown>;

    if (typeof d.version !== "number") {
      return { ok: false, error: "version missing or not a number" };
    }
    if (d.version > SAVE_VERSION) {
      return {
        ok: false,
        error: `save version ${d.version} > current ${SAVE_VERSION}`,
      };
    }

    const player = d.player as Record<string, unknown> | undefined;
    if (!player || typeof player !== "object") {
      return { ok: false, error: "player missing" };
    }
    if (!player.stats || typeof player.stats !== "object") {
      return { ok: false, error: "player.stats missing" };
    }
    if (typeof player.level !== "number") {
      return { ok: false, error: "player.level missing or not a number" };
    }
    if (typeof player.xp !== "number") {
      return { ok: false, error: "player.xp missing or not a number" };
    }
    if (typeof player.xpToNext !== "number") {
      return { ok: false, error: "player.xpToNext missing or not a number" };
    }

    const inventory = d.inventory as Record<string, unknown> | undefined;
    if (!inventory || typeof inventory !== "object") {
      return { ok: false, error: "inventory missing" };
    }
    if (!Array.isArray(inventory.items)) {
      return { ok: false, error: "inventory.items not an array" };
    }
    if (!inventory.equipped || typeof inventory.equipped !== "object") {
      return { ok: false, error: "inventory.equipped not an object" };
    }

    const story = d.story as Record<string, unknown> | undefined;
    if (!story || typeof story !== "object") {
      return { ok: false, error: "story missing" };
    }
    if (!story.flags || typeof story.flags !== "object") {
      return { ok: false, error: "story.flags not an object" };
    }
    if (!Array.isArray(story.completedEncounters)) {
      return { ok: false, error: "story.completedEncounters not an array" };
    }

    if (!d.relationships || typeof d.relationships !== "object") {
      return { ok: false, error: "relationships missing" };
    }

    const settings = d.settings as Record<string, unknown> | undefined;
    if (!settings || typeof settings !== "object") {
      return { ok: false, error: "settings missing" };
    }
    if (!settings.audio || typeof settings.audio !== "object") {
      return { ok: false, error: "settings.audio missing" };
    }
    if (!settings.haptic || typeof settings.haptic !== "object") {
      return { ok: false, error: "settings.haptic missing" };
    }

    if (!d.stats || typeof d.stats !== "object") {
      return { ok: false, error: "stats missing" };
    }

    // Phase 2A: arena field is required AFTER migration runs. Imported saves
    // at v1 won't have it yet — the migrate() pass adds it. We still accept
    // undefined here so validateSaveShape doesn't reject pre-migration v1
    // JSON during importJson. Post-migration correctness is enforced by the
    // TypeScript SaveData type and runtime ArenaSystem/BuffSystem read paths.
    if (d.arena !== undefined && (typeof d.arena !== "object" || d.arena === null)) {
      return { ok: false, error: "arena present but not an object" };
    }

    return { ok: true };
  }

  private scheduleAutoSave(): void {
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.save();
    }, AUTO_SAVE_DEBOUNCE_MS);
  }

  private attachBeforeUnload(): void {
    if (this.beforeUnloadHandler || typeof window === "undefined") return;
    this.beforeUnloadHandler = () => this.flush();
    window.addEventListener("beforeunload", this.beforeUnloadHandler);
  }

  /**
   * Cleanup hook for v1↔v2 mode switches and tests. Removes the
   * `beforeunload` listener and cancels any pending debounced save. Idempotent
   * — safe to call multiple times. Does NOT touch `this.data` so a subsequent
   * `load()` call works without re-initialising.
   *
   * Phase 1C addition (DECISIONS.md task #4 part D). Currently exposed for
   * future use — no production callers yet.
   */
  dispose(): void {
    if (this.beforeUnloadHandler && typeof window !== "undefined") {
      window.removeEventListener("beforeunload", this.beforeUnloadHandler);
      this.beforeUnloadHandler = null;
    }
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
  }
}

export const saveManager = new SaveManager();
