/**
 * GameState — singleton-фасад над SaveManager + EventBus.
 *
 * Единая точка чтения/записи v2 state из сцен и систем. Прячет детали
 * SaveManager API за удобными методами (ensureLoaded / save / patch).
 * Сцены импортируют только `gameState`, не касаются SaveManager напрямую.
 */

import { saveManager } from "./SaveManager";
import { eventBus } from "./EventBus";
import type { SaveData } from "./types";

class GameState {
  private loaded = false;

  /** Ensure save is loaded from localStorage. Safe to call multiple times. */
  ensureLoaded(): SaveData {
    if (!this.loaded) {
      saveManager.load();
      this.loaded = true;
    }
    return saveManager.get();
  }

  get(): SaveData {
    return this.ensureLoaded();
  }

  patch(mutator: (data: SaveData) => void): void {
    this.ensureLoaded();
    saveManager.patch(mutator);
  }

  /** Force-flush any pending debounced save. */
  flush(): void {
    saveManager.flush();
  }

  /** Hard reset — wipe save and start fresh (New Game button). */
  reset(): SaveData {
    const data = saveManager.reset();
    this.loaded = true;
    eventBus.clear();
    return data;
  }
}

export const gameState = new GameState();
