/**
 * Game mode flag — v1 (arena boss fight) vs v2 (Fallen University story mode).
 *
 * Persisted in localStorage under ACTIVE_MODE_KEY. Default is "v1" so existing
 * players see the classic experience without disruption. v2 is opt-in through
 * the SettingsPanel toggle followed by a page reload.
 *
 * Query param `?mode=v1|v2` overrides the persisted value for the current
 * session only — used by QA/dev to quickly switch without mutating user state.
 */

export type GameMode = "v1" | "v2";

export const ACTIVE_MODE_KEY = "match3_active_mode";
const DEFAULT_MODE: GameMode = "v1";

function parseMode(value: string | null | undefined): GameMode | null {
  return value === "v1" || value === "v2" ? value : null;
}

function readQueryOverride(): GameMode | null {
  if (typeof window === "undefined") return null;
  try {
    const params = new URLSearchParams(window.location.search);
    return parseMode(params.get("mode"));
  } catch {
    return null;
  }
}

function readStoredMode(): GameMode | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return parseMode(localStorage.getItem(ACTIVE_MODE_KEY));
  } catch {
    return null;
  }
}

/**
 * Returns the currently active game mode. Priority:
 * 1. `?mode=v1|v2` query param (session-only override — never written back)
 * 2. localStorage ACTIVE_MODE_KEY value
 * 3. Default "v1"
 */
export function getActiveMode(): GameMode {
  return readQueryOverride() ?? readStoredMode() ?? DEFAULT_MODE;
}

/**
 * Persists the selected mode to localStorage. Caller is responsible for
 * triggering `window.location.reload()` afterwards — BootScene reads the flag
 * during startup, so a reload is required for the change to take effect.
 */
export function setActiveMode(mode: GameMode): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(ACTIVE_MODE_KEY, mode);
  } catch {
    // localStorage may be unavailable in private browsing or restricted contexts
  }
}
