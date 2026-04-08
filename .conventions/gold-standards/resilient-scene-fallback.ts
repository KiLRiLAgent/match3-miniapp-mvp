/**
 * GOLD STANDARD: Resilient scene fallback — never strand the player on a black screen
 *
 * Phase 1C hardened three v2 scenes against missing-data edge cases that
 * previously bricked the player mid-loop: PostCombatScene on missing
 * character/encounter/context, DialogueScene on a choice node where every
 * `requires` condition evaluates false, and LocationScene on a failed
 * background texture load. Any future scene that renders content-driven data
 * MUST follow the same three-rule pattern: **visible fallback UI, navigable
 * continue button, defensive lookup at the failure site**.
 *
 * Authoritative sources:
 *   src/v2/scenes/PostCombatScene.ts   (synthesizedDefeat + errorMessage)
 *   src/v2/scenes/DialogueScene.ts     (empty-choices setRoot + scene.start)
 *   src/v2/scenes/LocationScene.ts     (asset fallback + in-place toast)
 *   DECISIONS.md R2 (setRoot not replace), R3 (toast on destination)
 *
 * 1. RULE 1 — never render a black screen
 *
 *    The player should always see:
 *     (a) A human-readable explanation of what went wrong
 *     (b) A working way to continue (back to Hub, skip epilogue, retry)
 *
 *    The three Phase 1C failure modes all use visible fallback UI:
 *
 *    **PostCombat missing encounter** — renders the synthetic defeat summary
 *    with a red "Ошибка контента" toast ON the destination scene (NOT on
 *    CombatBridge, per R3), plus a working continue button that advances to
 *    the epilogue dialogue node.
 *
 *    **Dialogue empty choices** — renders a `← Вернуться в Hub` button with
 *    subtitle text ("Этот диалог зашёл в тупик") instead of freezing on the
 *    choice prompt.
 *
 *    **Location missing background** — renders a dark purple rectangle with
 *    placeholder text ("загрузка фона...") PLUS an in-place toast on the
 *    same scene. The player can still tap hotspots.
 *
 * 2. RULE 2 — navigable continue button
 *
 *    The player MUST be able to progress without reloading. Two variants:
 *
 *    **Flow-continuation**: when the failure is mid-dialogue (epilogue node
 *    missing, encounter def gone), advance to the closest reachable node.
 *    Example: PostCombatScene with `synthesizedDefeat: true` still shows the
 *    continue button that runs the epilogue branch — the player gets closure
 *    even if the combat never actually resolved.
 *
 *    **Stack-reset**: when the failure makes the current flow fundamentally
 *    broken, RESET the scene stack with `setRoot + scene.start` so the stack
 *    is clean. Per DECISIONS R2:
 *
 *      // DialogueScene.handleChoiceNode — when getAvailableChoices() is []
 *      sceneRouter.setRoot("HubScene");
 *      this.scene.start("HubScene");
 *
 *    **DO NOT use `sceneRouter.replace`** for broken-content recovery.
 *    `replace` mutates only `stack[length-1]` and leaves stale entries below
 *    — the back button will drop the player back into the broken state.
 *    `setRoot` fully resets the stack (same call `HubScene.create()` line 99
 *    already makes, so it's idempotent and safe).
 *
 * 3. RULE 3 — defensive lookup at the failure site
 *
 *    Even with boot-time validation (see `content-validation.ts` gold
 *    standard), runtime lookups can still miss when a save file references a
 *    removed entity or a migration leaves a dangling id. Every lookup that
 *    could return null MUST have a defensive fallback:
 *
 *      // PostCombatScene.create()
 *      const encounter = ENCOUNTERS[result.encounterId];
 *      const character = encounter ? CHARACTERS[encounter.characterId] : null;
 *
 *      // synthesizedDefeat ALWAYS triggers fallback even if the registry
 *      // happens to be populated (defensive — maybe only partial data)
 *      if (!encounter || !character || !encounterContext || synthesizedDefeat) {
 *        this.renderFallback(errorMessage);
 *        return;
 *      }
 *
 *    When formatting display text from a potentially-missing def, use the
 *    nullish coalesce operator with the raw id as the fallback so authors
 *    can at least recognize the broken reference:
 *
 *      const itemName = ITEMS[itemId]?.name ?? itemId;
 *
 * 4. INIT DATA CONTRACT — `synthesizedDefeat` + `errorMessage`
 *
 *    When a source scene detects a failure and routes to a destination scene
 *    for display, the destination gets two optional fields:
 *
 *      interface PostCombatData {
 *        result: CombatResult;
 *        encounterContext: CombatContext | null;
 *        // ... existing fields ...
 *
 *        // Phase 1C resilience
 *        synthesizedDefeat?: boolean;
 *        errorMessage?: string;
 *      }
 *
 *    **`synthesizedDefeat: true`** — the source scene fabricated the result
 *    object (combat never actually ran) and wants the destination to show
 *    the fallback even if the registry lookup succeeds. See DECISIONS R6 for
 *    the "CONTENT_ERROR_FALLBACK" comment that explicitly allows a second
 *    `CombatResult = { ... }` literal in the codebase.
 *
 *    **`errorMessage: string`** — optional human-readable explanation. If
 *    omitted, the destination generates a generic message. Prefer explicit
 *    over generic — the call site knows what went wrong; the destination
 *    only knows "data is missing".
 *
 *      // CombatBridgeScene synthetic-defeat path:
 *      sceneRouter.replace(this, "PostCombatScene", {
 *        result: syntheticResult,
 *        encounterContext: null,
 *        synthesizedDefeat: true,
 *        errorMessage: `Бой '${this.encounterId}' не найден в реестре`,
 *      });
 *
 *      // PostCombatScene.create() reads it:
 *      const { synthesizedDefeat, errorMessage, result } = this.sceneData;
 *      if (synthesizedDefeat) {
 *        const finalMessage =
 *          errorMessage ?? `Ошибка контента: бой '${result.encounterId}' не найден`;
 *        toast.show(this, { message: finalMessage, type: "error", durationMs: 5000 });
 *      }
 *
 * 5. TOAST ON DESTINATION, NOT SOURCE (R3)
 *
 *    The source scene is about to shut down — any toast it creates dies with
 *    the container. The destination MUST show the toast itself where it will
 *    live long enough to be read.
 *
 *    See `.conventions/gold-standards/toast-notifications.ts` §4 for the
 *    full rationale.
 *
 * 6. FALLBACK UI SHAPE — a minimal checklist
 *
 *    Every `renderFallback(message?: string)` helper should:
 *
 *     - Fill the camera with a dark, NON-BLACK rectangle (use the theme's
 *       panel background, e.g. `0x2a1845`). Black screens look like a crash.
 *     - Place a centered title ("Ошибка контента", "Диалог пуст", etc.)
 *     - Place a subtitle with the specific detail (`message ?? "..."`)
 *     - Place at least one `pointerdown`-bound button that navigates away
 *       (Hub, epilogue advance, retry)
 *     - Set container depth above background but below Toast (depth 2000)
 *     - NEVER block pointer input on the whole scene — the fallback UI is
 *       itself the interactive path forward
 *
 * 7. DEFENSIVE PROTOCOL FOR ASSET LOADS
 *
 *    When loading a runtime texture (LocationScene background is the only
 *    current case), always subscribe to the `LOADER_ERROR` event BEFORE
 *    starting the load, and show the fallback on error:
 *
 *      scene.load.once(Phaser.Loader.Events.LOAD_ERROR, (file) => {
 *        this.showBackgroundFallback(`Не удалось загрузить фон '${file.key}'`);
 *        eventBus.emit("assetError", {
 *          source: "location-background",
 *          assetKey: file.key,
 *          detail: file.src,
 *        });
 *      });
 *      scene.load.image(key, path);
 *      scene.load.start();
 *
 *    The `assetError` event is fire-and-forget for telemetry — LocationScene
 *    already shows its own in-place toast, so the EventBus wiring in
 *    `src/v2/index.ts` only logs it (no duplicate toast). See the isolation
 *    check's EventBus section for the contract.
 *
 * 8. ANTI-PATTERNS
 *
 *     - DO NOT use `sceneRouter.replace` for broken-content recovery. Use
 *       `setRoot + scene.start` per R2.
 *     - DO NOT show a toast on the source scene then immediately
 *       transition away — the toast dies with the shutdown (R3).
 *     - DO NOT render a plain black screen or spin forever on a missing
 *       asset. Show a visible fallback.
 *     - DO NOT throw on missing lookup results in a rendering path. Render
 *       the fallback and let the player navigate out.
 *     - DO NOT rely on boot-time validation as the ONLY defense. Validation
 *       catches typos in authored content, but a player's save file can
 *       reference a removed entity after a content refactor — defensive
 *       lookups at the failure site are the second line of defense.
 *     - DO NOT silently skip the fallback branch when `synthesizedDefeat ===
 *       true` just because the registry lookup happens to succeed. The flag
 *       is authoritative; honour it.
 */
