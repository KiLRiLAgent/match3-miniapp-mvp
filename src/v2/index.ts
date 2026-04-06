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
import { StoryMapScene } from "./scenes/StoryMapScene";
import { LocationScene } from "./scenes/LocationScene";
import { DialogueScene } from "./scenes/DialogueScene";
import { CombatBridgeScene } from "./scenes/CombatBridgeScene";
import { PostCombatScene } from "./scenes/PostCombatScene";

/**
 * Register all v2 scenes into the game. Called from BootScene AFTER
 * `await import("../v2")`. Idempotent — duplicate-key check guards against
 * Phaser warnings if somehow called twice.
 *
 * Phase 1A registers all 6 scenes that make up the v2 vertical slice:
 * Hub (greeting/menu) → StoryMap (campus locations) → Location (NPC hotspots)
 * → Dialogue (acts) → CombatBridge (assemble + launch GameScene) → PostCombat
 * (display result + return to dialogue epilogue node).
 *
 * `false` second arg = don't auto-start; BootScene explicitly invokes
 * `scene.start("HubScene")` after registration.
 */
export function registerV2Scenes(game: Phaser.Game): void {
  const scenes: ReadonlyArray<{ key: string; scene: new () => Phaser.Scene }> = [
    { key: "HubScene", scene: HubScene },
    { key: "StoryMapScene", scene: StoryMapScene },
    { key: "LocationScene", scene: LocationScene },
    { key: "DialogueScene", scene: DialogueScene },
    { key: "CombatBridgeScene", scene: CombatBridgeScene },
    { key: "PostCombatScene", scene: PostCombatScene },
  ];

  for (const { key, scene } of scenes) {
    if (!game.scene.getScene(key)) {
      game.scene.add(key, scene, false);
    }
  }
}
