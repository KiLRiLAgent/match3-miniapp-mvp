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
import { PlayerStatsScene } from "./scenes/PlayerStatsScene";
import { CharacterGalleryScene } from "./scenes/CharacterGalleryScene";
import { progressionSystem } from "./systems/ProgressionSystem";
import { inventorySystem } from "./systems/InventorySystem";

/**
 * Register all v2 scenes into the game. Called from BootScene AFTER
 * `await import("../v2")`. Idempotent — duplicate-key check guards against
 * Phaser warnings if somehow called twice.
 *
 * Phase 1A registers the 6 scenes that make up the v2 vertical slice:
 * Hub (greeting/menu) → StoryMap (campus locations) → Location (NPC hotspots)
 * → Dialogue (acts) → CombatBridge (assemble + launch GameScene) → PostCombat
 * (display result + return to dialogue epilogue node).
 *
 * Phase 1B adds PlayerStatsScene (task #7) and CharacterGalleryScene
 * (task #8, wired by task #9 alongside the HubScene 4-button reorganize).
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
    { key: "PlayerStatsScene", scene: PlayerStatsScene },
    { key: "CharacterGalleryScene", scene: CharacterGalleryScene },
  ];

  for (const { key, scene } of scenes) {
    if (!game.scene.getScene(key)) {
      game.scene.add(key, scene, false);
    }
  }

  // Wire the ProgressionSystem ↔ InventorySystem edge once at v2 boot, before
  // any scene calls computeEffectiveStats(). Idempotent — re-registration on
  // subsequent registerV2Scenes calls overwrites with the same closure.
  progressionSystem.setInventoryProvider(() =>
    inventorySystem.computeAggregateStats(),
  );
}
