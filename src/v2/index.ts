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
import { validateContent } from "./content/validate";
import { eventBus } from "./core/EventBus";
import { HubScene } from "./scenes/HubScene";
import { StoryMapScene } from "./scenes/StoryMapScene";
import { LocationScene } from "./scenes/LocationScene";
import { DialogueScene } from "./scenes/DialogueScene";
import { CombatBridgeScene } from "./scenes/CombatBridgeScene";
import { PostCombatScene } from "./scenes/PostCombatScene";
import { PlayerStatsScene } from "./scenes/PlayerStatsScene";
import { CharacterGalleryScene } from "./scenes/CharacterGalleryScene";
import { ArenaScene } from "./scenes/ArenaScene";
import { ArenaRunScene } from "./scenes/ArenaRunScene";
import { ArenaRewardScene } from "./scenes/ArenaRewardScene";
import { ShopScene } from "./scenes/ShopScene";
import { progressionSystem } from "./systems/ProgressionSystem";
import { inventorySystem } from "./systems/InventorySystem";
import { toast } from "./ui/Toast";

/**
 * Module-level idempotency guard for Toast wiring (RISK-1: Vite HMR may
 * double-instantiate scenes during dev hot reload, causing duplicate eventBus
 * subscriptions). The wiring runs at-most-once per page load — production
 * unaffected (no HMR), dev gets clean re-renders.
 */
let toastWired = false;

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
  // Content validation — fail fast if any cross-reference is broken. Catches
  // author typos in node.next, choice.next, encounter characterId, loot
  // itemDefId, location dialogue ids BEFORE the player encounters them.
  // Throws on errors so BootScene's `await import("../v2")` rejects and the
  // failure surfaces in console — better than silently broken content.
  // Warnings are non-blocking and logged via console.warn.
  const validation = validateContent();
  for (const warning of validation.warnings) {
    console.warn(`v2 content validation: ${warning}`);
  }
  if (!validation.ok) {
    const message =
      "v2 content validation failed:\n" +
      validation.errors.map((e) => `  - ${e}`).join("\n");
    throw new Error(message);
  }

  const scenes: ReadonlyArray<{ key: string; scene: new () => Phaser.Scene }> = [
    { key: "HubScene", scene: HubScene },
    { key: "StoryMapScene", scene: StoryMapScene },
    { key: "LocationScene", scene: LocationScene },
    { key: "DialogueScene", scene: DialogueScene },
    { key: "CombatBridgeScene", scene: CombatBridgeScene },
    { key: "PostCombatScene", scene: PostCombatScene },
    { key: "PlayerStatsScene", scene: PlayerStatsScene },
    { key: "CharacterGalleryScene", scene: CharacterGalleryScene },
    // Phase 2A — arena flow + magazin
    { key: "ArenaScene", scene: ArenaScene },
    { key: "ArenaRunScene", scene: ArenaRunScene },
    { key: "ArenaRewardScene", scene: ArenaRewardScene },
    { key: "ShopScene", scene: ShopScene },
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

  wireToastSubscriptions(game);
}

/**
 * Phase 1C: bridge eventBus error events → Toast on the active scene.
 *
 * Each handler reads the topmost active v2 scene at emit time and routes the
 * toast there. Scene-aware delivery means the toast lives long enough to be
 * read (R3 / R4) and dies on scene shutdown automatically.
 *
 * Idempotency: guarded by module-level `toastWired` flag. Re-running
 * `registerV2Scenes` (Vite HMR, future v1↔v2 mode switch) WILL NOT stack
 * subscriptions.
 *
 * `assetError` is logged but NOT toasted here — LocationScene already shows
 * its own toast at the failure site (per Task #12). Double-toast would be
 * noisy and potentially overlap.
 */
function wireToastSubscriptions(game: Phaser.Game): void {
  if (toastWired) return;
  toastWired = true;

  eventBus.on("saveError", (payload) => {
    const scene = getActiveV2Scene(game);
    if (!scene) return;
    const message =
      payload.reason === "quota"
        ? "Не удаётся сохранить — память переполнена"
        : "Ошибка сохранения. Попробуйте позже";
    toast.show(scene, { message, type: "error", durationMs: 5000 });
  });

  eventBus.on("contentError", (payload) => {
    const scene = getActiveV2Scene(game);
    if (!scene) return;
    toast.show(scene, {
      message: `Ошибка контента: ${payload.source}`,
      type: "warn",
    });
  });

  eventBus.on("assetError", (payload) => {
    // LocationScene shows its own toast at the failure site — don't double-toast
    // here. Just log for monitoring / future telemetry.
    console.warn(`Asset error: ${payload.assetKey} (${payload.detail})`);
  });
}

/**
 * Find the topmost active v2 scene at the moment an error fires. Order is
 * most-recently-pushed first so the toast lands on whatever the player is
 * actually looking at (e.g. PlayerStats over Hub when player has the stats
 * panel open). Returns null if no v2 scene is active — error is silently
 * dropped, console.warn from emitters still gives dev visibility.
 *
 * Local helper per DECISIONS R14 — NOT exported, NOT in SceneRouter (we are
 * not refactoring SceneRouter — out of brief scope).
 */
function getActiveV2Scene(game: Phaser.Game): Phaser.Scene | null {
  // Order: most-recently-pushed first. Phase 2A scenes (Arena*, Shop) sit
  // above the Phase 1A flow because they are reached via push from Hub and
  // can be active simultaneously with the older scene stack.
  const v2Keys = [
    "ArenaRewardScene",
    "ArenaRunScene",
    "ArenaScene",
    "ShopScene",
    "PlayerStatsScene",
    "CharacterGalleryScene",
    "PostCombatScene",
    "CombatBridgeScene",
    "DialogueScene",
    "LocationScene",
    "StoryMapScene",
    "HubScene",
  ];
  for (const key of v2Keys) {
    const scene = game.scene.getScene(key);
    if (scene && scene.scene.isActive()) return scene;
  }
  return null;
}
