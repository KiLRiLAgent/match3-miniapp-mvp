/**
 * StoryFlags — typed accessor for `SaveData.story.flags` (boolean / number /
 * string keys) plus convenience helpers for the two adjacent string-set
 * fields `visitedLocations` and `completedEncounters`. All writes go through
 * `gameState.patch` — no module ever touches `localStorage` directly.
 *
 * Flag key conventions:
 *  - Namespaced with colons: `"lilana:act1:done"`, `"lilana:diary:found"`.
 *  - Boolean for one-shot story beats; numeric for counters; string for
 *    enum-like state machines.
 *
 * RISK-8 hardening: this module has zero content/* dependencies — flag keys
 * are arbitrary strings authored by content/dialogue files, not enums.
 */

import { gameState } from "../core/GameState";

/** Allowed flag value types — keeps SaveData JSON-safe and bounded. */
export type StoryFlagValue = boolean | number | string;

class StoryFlagsService {
  /** Set a flag to a value, overwriting any existing entry. */
  set(key: string, value: StoryFlagValue): void {
    gameState.patch((save) => {
      save.story.flags[key] = value;
    });
  }

  /**
   * Read a flag with an optional fallback. Returns `fallback` (or `undefined`)
   * if the stored value is missing OR has an unexpected type — defensive
   * against corrupted SaveData (manual edits, partial JSON writes, version
   * skew). The generic `T` lets callers narrow the return type when they
   * know the storage shape, e.g. `storyFlags.get<number>("lilana:meetings", 0)`.
   */
  get<T extends StoryFlagValue = boolean>(key: string, fallback?: T): T | undefined {
    const save = gameState.get();
    const value = save.story.flags[key];
    if (value === undefined) return fallback;
    if (
      typeof value !== "boolean" &&
      typeof value !== "number" &&
      typeof value !== "string"
    ) {
      // Corrupted SaveData fell outside StoryFlagValue — fall back instead
      // of lying through `as T`.
      return fallback;
    }
    return value as T;
  }

  /** Check whether a flag has been set (regardless of value). */
  has(key: string): boolean {
    const save = gameState.get();
    return save.story.flags[key] !== undefined;
  }

  /**
   * Increment a numeric flag, initializing to 0 if missing. Returns the new
   * value so callers can chain conditional logic without a follow-up `get`.
   * Non-numeric existing values are coerced to 0 first.
   */
  inc(key: string, amount = 1): number {
    let result = 0;
    gameState.patch((save) => {
      const current = save.story.flags[key];
      const base = typeof current === "number" ? current : 0;
      result = base + amount;
      save.story.flags[key] = result;
    });
    return result;
  }

  /** Idempotently mark a location as visited. */
  markLocationVisited(locationId: string): void {
    gameState.patch((save) => {
      if (!save.story.visitedLocations.includes(locationId)) {
        save.story.visitedLocations.push(locationId);
      }
    });
  }

  /** Idempotently mark an encounter as completed. */
  markEncounterCompleted(encounterId: string): void {
    gameState.patch((save) => {
      if (!save.story.completedEncounters.includes(encounterId)) {
        save.story.completedEncounters.push(encounterId);
      }
    });
  }
}

export const storyFlags = new StoryFlagsService();
