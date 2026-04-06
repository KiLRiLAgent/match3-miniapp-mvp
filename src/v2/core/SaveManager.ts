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

import { SAVE_KEY, SAVE_VERSION, type SaveData } from "./types";

const AUTO_SAVE_DEBOUNCE_MS = 2000;

const LEGACY_AUDIO_KEY = "match3_audio";
const LEGACY_HAPTIC_KEY = "match3_haptic";

function generateId(): string {
  // lightweight pseudo-uuid for player.id — no external deps
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
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
 * Add new migrations here as the schema evolves:
 *   MIGRATIONS[N] = (old) => ({ ...old, newField: defaultValue, version: N + 1 });
 */
const MIGRATIONS: Record<number, (data: any) => any> = {
  // Currently no migrations — v1 is the initial schema.
  // Example for future use:
  // 1: (old) => ({ ...old, newFeature: { enabled: false }, version: 2 }),
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
    } catch (err) {
      console.error("SaveManager: save failed", err);
    }
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
   * Restore save from a JSON string. Validates through migration chain.
   * Returns true on success, false on parse/migration error.
   */
  importJson(json: string): boolean {
    try {
      const parsed = JSON.parse(json);
      this.data = migrate(parsed);
      this.save();
      return true;
    } catch (err) {
      console.error("SaveManager: importJson failed", err);
      return false;
    }
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
}

export const saveManager = new SaveManager();
