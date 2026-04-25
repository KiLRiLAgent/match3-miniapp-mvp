/**
 * GOLD STANDARD: Param-Derived UI Display (Live Preview Block)
 *
 * When a settings panel exposes inputs that drive *computed downstream
 * values* (per-layer HP from base × multipliers, total mana from base +
 * bonuses, encounter difficulty curves, etc.), the editor MUST render
 * the computed array LIVE — not just the inputs.
 *
 * Authoritative reference: `src/ui/SettingsPanel.ts` after T1 ivan-batch-1
 * (commit `06066d3`). Pre-T1, the panel showed an editable «Баз. HP слоя =
 * 1000» field plus K1..K10 multipliers; total HP (= sum of layer HPs) was
 * computed silently inside `recalcBossHpMax`. Иван set base = 1000 + K1=1.1
 * and saw the total «15500» elsewhere in HUD, then mistook it for "layer 1
 * HP = 15500" and reported a bug. The formula was correct; the UI hid the
 * derivation chain.
 *
 * Rule: if a single input drives N derived outputs, render the N outputs.
 *
 * 1. RENDER-FROM-STATE PATTERN (no caching, no memoization)
 *
 *    The preview block is a pure function of the current input values.
 *    Don't cache its computed text — recompute every time `adjustParam`
 *    fires:
 *
 *      private renderHpPreview(): void {
 *        if (!this.hpPreviewText) return;
 *        const arr = getBossLayerHpArray();
 *        const sum = arr.reduce((a, b) => a + b, 0);
 *        const lines = arr.map((hp, i) => `Полоска ${i + 1}: ${hp} HP`);
 *        this.hpPreviewText.setText([...lines, `Итого: ${sum}`].join("\n"));
 *      }
 *
 *      private adjustParam(idx: number, delta: number): void {
 *        const param = this.params[idx];
 *        param.value = clamp(param.value + delta, param.min, param.max);
 *        this.applyParamToConfig(param);
 *        this.renderHpPreview();          // ← rebuild on every change
 *      }
 *
 *    WHY no caching: the preview block is a few lines of text. Reduce
 *    + map + setText takes microseconds. Caching would invite stale-state
 *    bugs (forgot to invalidate after one of the inputs changed) for zero
 *    perceptible win.
 *
 * 2. PLACEMENT — RIGHT BELOW THE INPUTS THAT DRIVE IT
 *
 *    The preview goes immediately under the cluster of inputs that feeds
 *    it. The user reads top-to-bottom: «I changed K3 to 1.5» → eye drops
 *    one row → «Полоска 3: 1500 HP, итого: 16100». No mental jumping.
 *
 *    Don't park the preview at the bottom of a scrollable panel where
 *    the user has to scroll past unrelated inputs to see the consequence
 *    of their edit.
 *
 * 3. UNAMBIGUOUS LABELS ON THE INPUTS THEMSELVES
 *
 *    The other half of T1: rename ambiguous input labels.
 *
 *      Before: "👿 Баз. HP слоя"          // "base layer HP" — ambiguous
 *      After:  "👿 ХП одной полоски (база)"  // "ONE layer's HP (base)" — clear
 *
 *    The preview block helps disambiguate retrospectively, but a clear
 *    label prevents the misread in the first place. Both fixes ship
 *    together — they're complementary, not redundant.
 *
 * 4. WHEN TO ADD A PREVIEW
 *
 *    Add a derived-value preview when ANY of these are true:
 *    - The output is a sum / product of multiple inputs (composite).
 *    - The output is non-monotonic in any single input (e.g., a curve
 *      with thresholds).
 *    - The output is what the user actually CARES about, but the input
 *      is a parameter inside the formula that produces it.
 *
 *    Skip the preview when:
 *    - The input *is* the output (no transformation).
 *    - The output is rendered live elsewhere on the same screen (e.g.,
 *      the actual HP bar — but Settings is opened over the game, so the
 *      HP bar is hidden; not the same screen).
 *
 * 5. TEXT VS. CHART
 *
 *    Plain multi-line text is sufficient for arrays up to ~20 entries.
 *    Don't reach for a Phaser chart helper for a 10-element layer list.
 *    A `Phaser.GameObjects.Text` with `\n`-separated lines is fast,
 *    pixel-aligned, and readable on iOS at any zoom level.
 *
 *    For longer arrays or non-monotonic curves, a horizontal bar chart
 *    rendered with `Graphics` is appropriate — but stick to text first
 *    and only escalate when the user can't read the textual form.
 *
 * 6. NaN / INFINITE GUARDS
 *
 *    Inputs come from `localStorage`. A user (or a dev with a busted
 *    state file) can land on `NaN` or `Infinity` for a parameter, which
 *    then poisons every downstream computation and renders «Полоска 1:
 *    NaN HP, итого: NaN». Guard each input on read, not on render:
 *
 *      const safeValue = Number.isFinite(parsed) ? parsed : param.default;
 *
 *    See ivan-batch-1 logic-reviewer F2 — the guard belongs in
 *    `adjustParam` (or `loadGameParams` for the boot path), not in the
 *    preview render. Bad data should never enter the state machine.
 *
 * 7. RELATED PATTERNS
 *
 *    - For UI that VALIDATES inputs (red-on-invalid, disable-apply when
 *      out of range), see the "form validation" patterns. Live preview
 *      is for VISUALISING the consequence of valid input; validation
 *      is for catching invalid input.
 *
 *    - For computed values that drive game state (not UI), the source
 *      of truth lives in `src/game/config.ts` helpers like
 *      `getBossLayerHpArray()` and `recalcBossHpMax()`. The preview
 *      MUST call those same helpers — don't reimplement the formula
 *      in the panel, or one will drift from the other.
 *
 * Reference: `src/ui/SettingsPanel.ts`, `src/game/config.ts`
 *   `getBossLayerHpArray` / `recalcBossHpMax`. Feature: ivan-batch-1
 *   T1 (commits `06066d3`, `fa02077`, `c9aea12`).
 */
