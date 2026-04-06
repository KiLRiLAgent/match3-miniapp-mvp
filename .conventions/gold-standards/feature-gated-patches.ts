/**
 * GOLD STANDARD: Feature-gated patches in shared modules
 *
 * When a v1 module (like GameScene.ts) needs to support v2 functionality
 * without disturbing v1 behavior, ALL v2-specific code paths MUST be
 * feature-gated behind a runtime check on encounterContext (or equivalent
 * v2 init data) AND tagged with `// v2:` comments for git diff visibility.
 *
 * This convention emerged from Phase 1A Task #6 (the largest patch in the
 * phase) where ~150 lines of v2 logic were added to a 3500-line v1 scene
 * file with ZERO v1 regression.
 *
 * 1. RUNTIME GATE: `if (this.encounterContext)` (or `?? GAME_PARAMS.X` fallback)
 *
 *    Every v2 branch reads from encounterContext.X and falls through to v1
 *    state when undefined. Use the nullish coalesce pattern to keep v1 hot
 *    path single-line:
 *
 *      // v2: effective stat helpers — preserve v1 live-read semantics,
 *      //     v2 stable from frozen encounterContext (MITIGATION-1)
 *      private getEffectivePlayerHpMax(): number {
 *        return this.encounterContext?.playerStats.hpMax ?? GAME_PARAMS.player.hpMax;
 *      }
 *
 *    With encounterContext = undefined (v1), the optional chain short-circuits
 *    and returns GAME_PARAMS.player.hpMax — IDENTICAL to the v1 behavior before
 *    the patch. With encounterContext set (v2), reads from the frozen context.
 *
 *    Zero-allocation per call (just an optional chain + nullish coalesce). No
 *    snapshot field — preserves v1 dev-tester corner case where SettingsPanel
 *    mutates GAME_PARAMS mid-fight.
 *
 * 2. COMMENT TAG: `// v2:` on every modified or added line
 *
 *    git diff visibility is critical for reviewing the patch. Every v2 branch
 *    or replacement carries a `// v2:` comment so reviewers can grep for the
 *    full patch surface area without reading the entire file:
 *
 *      // v2: chain threshold guard — boss HP can't drop below floor while chains active
 *      let effectiveDamage = damage;
 *      if (this.encounterContext && this.board.hasActiveChains) {
 *        // v2: branch body...
 *      }
 *
 *    Acceptance criterion: `grep -c "// v2:" src/scenes/GameScene.ts ≥ 15`.
 *    Phase 1A Task #6 ended at 35 tags.
 *
 * 3. PAIRED MUTATIONS use the SAME getter
 *
 *    When a clamp + setValue pair both reference the same effective max
 *    (e.g., player HP), BOTH calls MUST use the SAME getter to prevent
 *    internal/displayed state divergence. Mixing one path against
 *    GAME_PARAMS and the other against the getter is a subtle bug.
 *
 *      // v2: paired clamp + setValue MUST use SAME getter (MITIGATION-1 critical pairing)
 *      this.playerHp = clamp(this.playerHp - damage, 0, this.getEffectivePlayerHpMax());
 *      this.playerHpBar?.setValue(this.playerHp, this.getEffectivePlayerHpMax());
 *
 *    Reviewer verification: line-by-line audit of paired sites.
 *
 * 4. NO PARAMETER MUTATION: use a local var
 *
 *    When v2 logic conditionally adjusts a value (e.g., chain threshold caps
 *    incoming damage), declare a local `let` and operate on the local — do
 *    NOT mutate the function parameter. Future code that expects the
 *    parameter to hold the original value will read the wrong number.
 *
 *      private applyDamageToBoss(damage: number) {
 *        let effectiveDamage = damage;
 *        if (this.encounterContext && this.board.hasActiveChains) {
 *          // adjust effectiveDamage, NOT damage
 *          effectiveDamage = ...;
 *        }
 *        this.bossHp = Math.max(0, this.bossHp - effectiveDamage);
 *        this.stats.totalDamageDealt += effectiveDamage;
 *      }
 *
 * 5. ZERO RUNTIME IMPORTS from the new layer
 *
 *    The shared module (e.g., GameScene.ts in src/scenes/) MUST NOT add any
 *    runtime imports from the new layer (src/v2/*) — only `import type` is
 *    allowed. This keeps the dependency direction one-way:
 *
 *      // v2: type-only imports — ZERO runtime imports from src/v2/
 *      import type { CombatContext, GameSceneInitData, RawCombatResult } from "../v2/content/types";
 *
 *    EXCEPTION (REFINEMENT 3): when the new layer needs runtime constructor
 *    access (e.g., `new ChainOverlay(...)` inside a sync `create()`), the
 *    target file MUST live in a NEUTRAL location (like `src/ui/`) so the
 *    import doesn't cross the v1↔v2 boundary in either direction. ChainOverlay
 *    sits in `src/ui/ChainOverlay.ts` for exactly this reason — see
 *    `.claude/teams/feature-v2-lilana/DECISIONS.md` REFINEMENT 3.
 *
 *    Verification:
 *      grep "from \"\\.\\./v2/" src/scenes/GameScene.ts | grep -v "^import type"
 *      # Should return empty
 *
 * 6. CALLBACK INJECTION via init data, NOT inside the context object
 *
 *    When v2 needs a callback fired from inside the shared module, the
 *    callback travels in the scene init data ALONGSIDE the context, not as
 *    a field on the context. This keeps the context object pure data
 *    (compatible with `Object.freeze` + `DeepReadonly`) and lets the closure
 *    capture happen at the launch site instead of the context constructor.
 *
 *      // CombatBridgeScene.create() — closure capture at launch site
 *      const initData: GameSceneInitData = {
 *        encounterContext: context,                                    // pure data
 *        onCombatComplete: (raw) => this.handleCombatComplete(raw),    // closure
 *      };
 *      this.scene.launch("GameScene", initData);
 *
 *    See REFINEMENT 1 in DECISIONS.md for the rationale (functions can't be
 *    frozen, so embedding the callback in CombatContext would force `Omit`
 *    workarounds in the DeepReadonly type).
 *
 * 7. ACCEPTANCE CRITERIA for any feature-gated patch
 *
 *    - Build passes strict TS
 *    - `// v2:` tag count ≥ 15 in the patched shared module
 *    - Zero runtime imports from the new layer (only `import type`)
 *    - v1 regression smoke test: clean localStorage, play 3-5 turns, verify
 *      identical behavior to baseline
 *    - All paired sites (clamp + setValue, etc.) use the same getter
 *    - No parameter mutation in patched methods
 *    - All v2 branches behind a feature gate (`if (this.encounterContext)` or
 *      equivalent), never unconditional
 *
 * Reference: DECISIONS.md REFINEMENT 1, REFINEMENT 3, MITIGATION-1, MITIGATION-2,
 *            MITIGATION-4 in `.claude/teams/feature-v2-lilana/`.
 *            Phase 1A Task #6 implementation: src/scenes/GameScene.ts (35 v2 tags).
 */
