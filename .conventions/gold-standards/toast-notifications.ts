/**
 * GOLD STANDARD: Toast notifications — non-blocking, scene-bound UX feedback
 *
 * Phase 1C introduced a `Toast` component as the shared channel for surfacing
 * save errors, content authoring mistakes, asset-load failures, and empty-state
 * fallbacks to the player without blocking input. Any future "show a transient
 * message" need MUST use this pattern — do NOT create a second notification
 * system, do NOT use `alert()` / `console.warn()` as the only signal, do NOT
 * pipe error messages through modal overlays.
 *
 * Authoritative source: `src/v2/ui/Toast.ts` + `src/v2/index.ts`
 * `wireToastSubscriptions` + DECISIONS R4 / R14.
 *
 * 1. SHAPE: singleton manager, no constructor
 *
 *    Export a single `ToastManager` instance called `toast`. Callers do NOT
 *    instantiate — they import and call `toast.show(scene, options)`. The
 *    manager tracks live toasts per-scene via `WeakMap<Scene, LiveToast[]>`
 *    so stacking offsets are computed automatically, and so a scene shutdown
 *    drops tracking without leaking memory.
 *
 *      // src/v2/ui/Toast.ts — end of file
 *      class ToastManager { ... }
 *      export const toast = new ToastManager();
 *
 * 2. LIFECYCLE: scene-bound, never global
 *
 *    Every toast MUST:
 *     - be created via `scene.add.existing(container)` (Phaser auto-destroys on
 *       scene shutdown)
 *     - use `scene.tweens.add(...)` for fade-in / fade-out (scene-local,
 *       killed by `scene.shutdown`)
 *     - NEVER use `window.setTimeout`, `globalTimer`, or the Phaser global
 *       TweenManager singleton
 *     - subscribe to `Phaser.Scenes.Events.SHUTDOWN` to drop tracking entries
 *
 *    Verification: `grep "globalTimer\|window\.setTimeout" src/v2/ui/Toast.ts`
 *    MUST return nothing. CI check enforces this (DECISIONS R4).
 *
 * 3. DEPTH: reserved layer 2000 — non-blocking notification layer
 *
 *    Toast containers call `setDepth(2000)` — non-blocking notification layer.
 *    Above cutscenes (≥500 used by GameScene) and legacy modals (1000), but
 *    BELOW blocking modal overlays which reserve depth 2100+ (e.g.
 *    ItemCardModal per R2B-3). If a blocking modal is open when a Toast event
 *    fires, the toast renders underneath the modal backdrop — user sees it
 *    after closing the modal. This matches blocking-overlay UX expectations:
 *    a blocking modal demands the user's attention first, and transient
 *    notifications wait their turn.
 *
 *    Do not invent new depth values; reuse 2000 for notifications and 2100
 *    for blocking modals. See CLAUDE.md depth layer map + DECISIONS R2B-3 +
 *    `./item-card-modal.ts` §2 for the full convention.
 *
 *    Legacy: CharacterGalleryScene.openModal still uses depth 1000 (Phase
 *    2B will align it to 2100 per R2B-2 #4). For feature-item-info-display,
 *    this legacy value is intentionally left in place — brief exclusion.
 *
 * 4. DELIVERY AT SOURCE, NOT DESTINATION
 *
 *    Emit the toast ON the scene where the user will READ it, not on the scene
 *    that detected the error. Phase 1C fixed a bug where CombatBridgeScene
 *    called `toast.show(this, ...)` immediately before
 *    `sceneRouter.replace(this, "PostCombatScene")` — the toast died on
 *    shutdown before the player saw it.
 *
 *    Approved pattern: pass a flag (e.g. `synthesizedDefeat: true`) in init
 *    data to the destination scene and let the destination's `create()`
 *    trigger the toast where it will live long enough to be read.
 *
 *      // CombatBridgeScene (source — DO NOT toast here):
 *      sceneRouter.replace(this, "PostCombatScene", {
 *        result: syntheticResult,
 *        synthesizedDefeat: true,  // <-- destination reads this
 *      });
 *
 *      // PostCombatScene.create() (destination — toast lives here):
 *      if (this.sceneData.synthesizedDefeat) {
 *        toast.show(this, {
 *          message: `Ошибка контента: бой '${id}' не найден`,
 *          type: "error",
 *          durationMs: 5000,
 *        });
 *      }
 *
 * 5. EVENTBUS BRIDGE: one wiring point, idempotent
 *
 *    Systems (SaveManager, DialogueRunner) do NOT import `toast` directly —
 *    they `eventBus.emit("saveError" | "contentError", payload)`, and
 *    `src/v2/index.ts` `wireToastSubscriptions(game)` subscribes ONCE at boot
 *    to route each event to the currently-active v2 scene via a local
 *    `getActiveV2Scene(game)` helper.
 *
 *    Idempotency is enforced by a module-level `toastWired` flag so Vite HMR
 *    and future v1↔v2 mode switches cannot stack duplicate subscriptions
 *    (DECISIONS RISK-1).
 *
 *      // src/v2/index.ts
 *      let toastWired = false;
 *
 *      function wireToastSubscriptions(game: Phaser.Game): void {
 *        if (toastWired) return;
 *        toastWired = true;
 *
 *        eventBus.on("saveError", (payload) => {
 *          const scene = getActiveV2Scene(game);
 *          if (!scene) return;
 *          toast.show(scene, {
 *            message: payload.reason === "quota"
 *              ? "Не удаётся сохранить — память переполнена"
 *              : "Ошибка сохранения. Попробуйте позже",
 *            type: "error",
 *            durationMs: 5000,
 *          });
 *        });
 *        // ... contentError, assetError
 *      }
 *
 * 6. ACTIVE SCENE LOOKUP: local helper, NOT in SceneRouter
 *
 *    `getActiveV2Scene(game)` iterates v2 scene keys in most-recently-pushed
 *    order (PlayerStats before Hub, etc.) and returns the first `isActive()`
 *    match. This helper MUST live as a non-exported function in
 *    `src/v2/index.ts` — do NOT add it to SceneRouter (we explicitly do not
 *    refactor SceneRouter beyond the `setRoot()` hot-fix). DECISIONS R14.
 *
 *      function getActiveV2Scene(game: Phaser.Game): Phaser.Scene | null {
 *        const v2Keys = [
 *          "PlayerStatsScene", "CharacterGalleryScene", "PostCombatScene",
 *          "CombatBridgeScene", "DialogueScene", "LocationScene",
 *          "StoryMapScene", "HubScene",
 *        ];
 *        for (const key of v2Keys) {
 *          const scene = game.scene.getScene(key);
 *          if (scene && scene.scene.isActive()) return scene;
 *        }
 *        return null;
 *      }
 *
 * 7. MESSAGE POLICY
 *
 *     - `info` (neutral): successful-but-noteworthy events. Rare.
 *     - `warn` (amber): content smells (`dialogue-empty-choices`, dangling
 *       dialogue effect). Player should continue but the dev should notice.
 *     - `error` (red): actionable player-facing failures (save quota, missing
 *       encounter). Always `durationMs: 5000` for errors so the player has
 *       time to read.
 *
 *    Never use `toast.show` for gameplay celebration / damage numbers — those
 *    are `DamageNumber` / `FlyingTile` concerns. Toast is strictly for
 *    non-gameplay signalling.
 *
 * 8. ANTI-PATTERNS
 *
 *     - DO NOT subscribe to eventBus error events from inside a scene's
 *       `create()`. Use the single `wireToastSubscriptions(game)` call in
 *       `src/v2/index.ts` instead — per-scene subscriptions duplicate handlers
 *       on Vite HMR.
 *     - DO NOT show a toast and then immediately call `sceneRouter.replace`
 *       on the same scene. The toast dies with the shutdown — see §4 above.
 *     - DO NOT set `depth` to anything other than 2000.
 *     - DO NOT store the toast instance in scene fields — `toast.show` is
 *       fire-and-forget; tracking is owned by the manager's WeakMap.
 */
