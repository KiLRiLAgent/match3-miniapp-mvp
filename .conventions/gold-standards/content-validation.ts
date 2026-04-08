/**
 * GOLD STANDARD: Boot-time content validation — fail-fast cross-reference checks
 *
 * Content-driven v2 (dialogues, encounters, locations, items) is authored as
 * plain TS objects in `src/v2/content/`. Authors (humans today, AI in Phase 3)
 * will inevitably typo `choice.next`, `encounterId`, or `itemDefId` values.
 * Without validation, the mistake surfaces only when a player walks the
 * broken path — 30 minutes into a playtest — and the game silently freezes or
 * crashes mid-dialogue.
 *
 * Phase 1C introduced a runtime validator (`src/v2/content/validate.ts`) that
 * runs once at `registerV2Scenes` and throws with an aggregated list of
 * dangling references BEFORE any scene is registered. Future cross-reference
 * checks MUST be added to this validator — do NOT scatter per-scene defensive
 * `if (!ENCOUNTERS[id]) return` checks as the primary defense.
 *
 * Authoritative source: `src/v2/content/validate.ts`,
 * `src/v2/index.ts` `registerV2Scenes`, DECISIONS R5 / R11.
 *
 * 1. SHAPE: extended `ValidationResult`
 *
 *    The validator returns a single aggregated result with THREE fields:
 *
 *      export interface ValidationResult {
 *        ok: boolean;        // false IFF errors.length > 0
 *        errors: string[];   // THROW blockers — game cannot start
 *        warnings: string[]; // console.warn smells — game starts anyway
 *      }
 *
 *    `warnings` is informational only and NEVER affects `ok`. Keep the split
 *    clean: things that break gameplay → errors; things that hint at content
 *    smells but leave the game playable → warnings (orphan nodes, duplicate
 *    choice ids).
 *
 * 2. AGGREGATION: never fail-fast
 *
 *    Collect ALL errors and ALL warnings in arrays, then return. Do not
 *    short-circuit on first failure — authors want to see the full list so
 *    they can fix 10 typos in one pass instead of boot-retry-fix-boot.
 *
 *      export function validateContent(): ValidationResult {
 *        const errors: string[] = [];
 *        const warnings: string[] = [];
 *
 *        for (const graph of Object.values(DIALOGUES)) {
 *          validateDialogueGraph(graph, errors, warnings);
 *        }
 *        for (const encounter of Object.values(ENCOUNTERS)) {
 *          validateEncounter(encounter, errors);
 *        }
 *        for (const location of Object.values(LOCATIONS)) {
 *          validateLocation(location, errors);
 *        }
 *        for (const item of Object.values(ITEMS)) {
 *          validateItem(item, errors);
 *        }
 *
 *        return { ok: errors.length === 0, errors, warnings };
 *      }
 *
 * 3. ERROR FORMAT: specific, with the full reference chain
 *
 *    Every error string MUST include the registry name, the parent entity
 *    id, the leaf id (if applicable), and the broken target. Authors should
 *    be able to locate the problem in <10 seconds.
 *
 *      // GOOD — can grep / jump straight to the file
 *      "DialogueGraph 'lilana-act1': choice 'empathy_path' on node 'choices_intro' references missing node 'branch_xyz'"
 *      "DialogueGraph 'lilana-act4': startNode 'intro' not in graph.nodes"
 *      "EncounterDef 'lilana-act4': loot itemDefId 'silver_swrod' not in ITEMS registry"
 *      "LocationDef 'atrium': hotspot 'lilana_corner' dialogue id 'lilana-act999' not in DIALOGUES registry"
 *      "ItemDef 'broken_sword': invalid slot 'sword' (expected weapon|armor|accessory)"
 *
 *      // BAD — forces the author to grep the whole repo
 *      "missing node"
 *      "invalid encounter"
 *
 * 4. INVOCATION: FIRST statement of `registerV2Scenes`
 *
 *    Validation MUST run before scene registration AND before any
 *    `setInventoryProvider` / `setXProvider` wiring. Throwing the top of the
 *    function ensures BootScene's dynamic `await import("../v2")` rejects
 *    cleanly and nothing starts partially initialised.
 *
 *      // src/v2/index.ts
 *      export function registerV2Scenes(game: Phaser.Game): void {
 *        const validation = validateContent();
 *        for (const warning of validation.warnings) {
 *          console.warn(`v2 content validation: ${warning}`);
 *        }
 *        if (!validation.ok) {
 *          const message =
 *            "v2 content validation failed:\n" +
 *            validation.errors.map((e) => `  - ${e}`).join("\n");
 *          throw new Error(message);
 *        }
 *
 *        // ... scene loop + setInventoryProvider + wireToastSubscriptions ...
 *      }
 *
 *    The `console.warn` loop runs BEFORE the error check so authors see BOTH
 *    warnings AND errors on the same failing boot — if the warn loop were
 *    after the throw, warnings would be invisible during an error.
 *
 * 5. PURE LEAF MODULE — type-only imports from content
 *
 *    `src/v2/content/validate.ts` imports types via `import type` and the
 *    REGISTRIES (CHARACTERS, DIALOGUES, ENCOUNTERS, ITEMS, LOCATIONS) via
 *    direct value imports. It has ZERO Phaser dependencies, ZERO side
 *    effects, and ZERO runtime cycles back into content definitions. Do NOT
 *    import any `src/v2/systems/*`, `src/v2/scenes/*`, or `src/v2/ui/*` — the
 *    validator must be safe to call at any time during boot.
 *
 *      // allowed
 *      import { CHARACTERS } from "./characters";
 *      import type { DialogueGraph, EncounterDef } from "./types";
 *
 *      // forbidden
 *      import { gameState } from "../core/GameState";          // NO
 *      import { inventorySystem } from "../systems/...";       // NO
 *      import Phaser from "phaser";                            // NO
 *
 * 6. ERRORS vs WARNINGS — what goes where
 *
 *    ERROR (throw blockers) — anything that will crash, freeze, or deadlock
 *    the player if they walk the broken path:
 *     - `graph.startNode` not in `graph.nodes`
 *     - `node.next` / `choice.next` / `battle.onVictory` / `battle.onDefeat`
 *       references a missing node
 *     - `battle.encounterId` not in ENCOUNTERS
 *     - `encounter.characterId` not in CHARACTERS
 *     - `encounter.rewards.loot[].itemDefId` not in ITEMS
 *     - `location.hotspot.dialogues[].dialogueId` not in DIALOGUES
 *     - `item.slot` not in `{"weapon", "armor", "accessory"}` (defensive)
 *
 *    WARNING (log only, do not throw) — smells that don't break gameplay but
 *    authors should know about:
 *     - orphan dialogue nodes (defined but not reachable from any ref)
 *     - duplicate choice ids within one choice node (first wins per
 *       REFINEMENT 5, but flag it so authors notice the shadowed choice)
 *
 *    When in doubt: will the player reach this state? → ERROR. Is the state
 *    mere content bloat? → WARNING.
 *
 * 7. DISCRIMINATED UNION NARROWING
 *
 *    `DialogueNode` is a discriminated union (`line` | `choice` | `battle` |
 *    `end`). Validators MUST use exhaustive `switch (node.type)` so TypeScript
 *    will force the validator to be updated when a new node type appears in
 *    Phase 2+. Do NOT use `if (node.type === "line")` chains — the compiler
 *    will not catch a forgotten branch.
 *
 * 8. PHASE 2+ TECH DEBT (documented, not fixed)
 *
 *    The validator ships in the v2 chunk (~1.4 KB compressed) per R11. When
 *    the content registry exceeds ~50 dialogues, gate validation behind
 *    `import.meta.env.DEV` so production tree-shakes the validator out.
 *    Leave a `// Phase 2+ tech-debt:` TODO comment near the `validateContent`
 *    export as a reminder. Do NOT gate early — the current TypeScript strict
 *    + runtime validation combo is the single strongest defense against
 *    content drift.
 *
 * 9. ANTI-PATTERNS
 *
 *     - DO NOT add per-scene `if (!ENCOUNTERS[id])` defensive branches as the
 *       PRIMARY defense. Defensive branches are the LAST line (in case a
 *       save file references a removed encounter). The validator is the
 *       FIRST line.
 *     - DO NOT silently `console.error` a broken content reference without
 *       throwing — the game will continue into a half-initialized state.
 *     - DO NOT build a Vite plugin for compile-time validation in Phase 1C.
 *       Runtime validation is simpler, ships with equivalent guarantees for a
 *       single-bundle app, and lets authors iterate in the browser without a
 *       custom build step.
 */
