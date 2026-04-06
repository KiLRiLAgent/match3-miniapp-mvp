/**
 * v2 lazy entry point.
 *
 * Imported on demand from BootScene when `getActiveMode() === "v2"`. Registers
 * all v2 scenes into the Phaser game instance at runtime (Phaser 3 does not
 * pick up scenes added after `new Phaser.Game(...)` automatically, so we use
 * `game.scene.add(key, SceneClass, false)`).
 *
 * This file is the **only** cross-boundary import from v1 into v2. v1 code
 * must not touch any other module under `src/v2/`.
 */

import type Phaser from "phaser";
import { HubScene } from "./scenes/HubScene";

/**
 * Register v2 scenes into the game. Call from BootScene AFTER
 * `await import("../v2")`. Idempotent — safe to call twice (second call is a
 * no-op because Phaser warns on duplicate keys).
 */
export function registerV2Scenes(game: Phaser.Game): void {
  // `false` = don't auto-start; BootScene will explicitly call scene.start.
  // Check first to avoid Phaser warning if somehow called twice.
  if (!game.scene.getScene("HubScene")) {
    game.scene.add("HubScene", HubScene, false);
  }
}
