/**
 * GOLD STANDARD: Dialogue system architecture (Phase 1A v2)
 *
 * v2 dialogue separates pure-logic interpretation from Phaser scene rendering.
 * DialogueRunner is a pure-TS class with zero Phaser dependencies — testable
 * in isolation. DialogueScene wraps it with rendering and player input.
 *
 * 1. THREE-LAYER SEPARATION
 *
 *    a) **Content** (`src/v2/content/dialogues/*.ts`):
 *       Pure TS objects matching DialogueGraph interface (from content/types).
 *       Zero behavior — just data. Each act is a separate file
 *       (lilana-act1.ts, lilana-act2.ts, lilana-act4.ts) registered into
 *       a single DIALOGUES record exported from content/dialogues/index.ts.
 *
 *    b) **Runner** (`src/v2/systems/DialogueRunner.ts`):
 *       Pure-logic interpreter with NO Phaser imports. Holds current node
 *       state, applies effects, evaluates conditions, advances on choice
 *       selection. Calls relationshipSystem.applyDelta directly so DialogueScene
 *       never duplicates relationship math (REFINEMENT 6 single source of truth).
 *
 *       Key API:
 *         constructor(graph: DialogueGraph, startNodeId?: DialogueNodeId)
 *         current(): DialogueNode
 *         getAvailableChoices(): DialogueChoice[]   // pre-filtered by conditions
 *         selectChoiceById(id: string): void        // REFINEMENT 5 — id, not index
 *         advance(): void                            // for line-type nodes
 *         resolveText(text: string): string         // {{playerName}}, {{pronoun}}
 *
 *    c) **Scene** (`src/v2/scenes/DialogueScene.ts`):
 *       Phaser layer that renders the current node via SpeechBubble +
 *       CharacterPortrait + DialogueChoiceButton. Owns busy flag for
 *       tap-to-advance debouncing. On battle node → push CombatBridgeScene.
 *       On end node → pop back to LocationScene.
 *
 * 2. RUNNER IS PURE — NO PHASER IMPORTS
 *
 *    DialogueRunner.ts MUST NOT import from `phaser`, `src/scenes/*`,
 *    `src/v2/scenes/*`, or anything UI-related. Allowed runtime imports:
 *      - `relationshipSystem` from `./RelationshipSystem`
 *      - `storyFlags` from `./StoryFlags`
 *      - `gameState` from `../core/GameState` (for resolveText player name)
 *      - `conditionEval` from `./conditionEval` (for choice filtering)
 *
 *    Allowed type imports: `../content/types` (DialogueGraph, DialogueNode,
 *    DialogueChoice, EffectExpr, ConditionExpr).
 *
 *    Verification:
 *      grep "from \"phaser\"" src/v2/systems/DialogueRunner.ts
 *      # Should return empty
 *
 * 3. CHOICE SELECTION via ID, NOT INDEX (REFINEMENT 5)
 *
 *    DialogueChoice.id is REQUIRED. DialogueRunner exposes
 *    `selectChoiceById(id: string)`, NOT `selectChoice(originalIndex: number)`.
 *
 *    Why: future content authors will reorder choices in dialogue files. If
 *    DialogueScene passed an index, save state would silently break on reorder.
 *    With ids, the choice is identified by stable string and the index is
 *    just a render-time concern.
 *
 *    DialogueScene reads `choice.id` from the button click handler:
 *      button.on("pointerup", () => runner.selectChoiceById(choice.id));
 *
 * 4. CONDITIONS via DECLARATIVE ConditionExpr, NOT CALLBACKS
 *
 *    DialogueChoice.requires is a typed `ConditionExpr` object, not a closure:
 *      requires: { empathyGte: 30 }
 *      requires: { flag: "lilana:act1:done", flagEquals: true }
 *      requires: { hasItem: "key-of-light" }
 *
 *    Both DialogueRunner.evaluateCondition and LocationScene.resolveDialogue
 *    call into the same `conditionEval` helper for consistency. This also
 *    keeps content serializable for future Phase 3 AI integration.
 *
 * 5. EFFECTS via DECLARATIVE EffectExpr LIST
 *
 *    Each `end` node may carry an `effects: EffectExpr[]` array. DialogueRunner
 *    applies them in order on transition to that node:
 *      { type: "setFlag", key: "lilana:act1:done", value: true }
 *      { type: "addEmpathy", amount: 5, characterId: "lilana" }
 *      { type: "addItem", key: "lilana-letter" }
 *
 *    NO custom `unlockAct` type — use `setFlag` directly with a structured key
 *    (REFINEMENT removed). Keeps the schema flat and predictable.
 *
 * 6. RUNNER → SCENE COUPLING via constructor injection + startNodeId
 *
 *    DialogueScene receives `dialogueId` (and optional `startNodeId`) via
 *    scene init data. It looks up the graph from DIALOGUES, constructs a
 *    new DialogueRunner, and renders. The optional `startNodeId` enables
 *    PostCombatScene → DialogueScene resume on the post-battle epilogue node:
 *
 *      sceneRouter.replace(this, "DialogueScene", {
 *        dialogueId: this.sceneData.returnToDialogueId,
 *        startNodeId: result.victory ? onVictoryNode : onDefeatNode,
 *      });
 *
 *    DialogueRunner constructor:
 *      constructor(graph: DialogueGraph, startNodeId?: DialogueNodeId) {
 *        this.graph = graph;
 *        this.currentNodeId = startNodeId ?? graph.startNode;
 *      }
 *
 * 7. TEXT TEMPLATING: {{playerName}} and {{pronoun:Он/Она/Они}}
 *
 *    DialogueRunner.resolveText handles substitution at render time. The
 *    cyrillic-friendly regex matches `{{pronoun:X/Y/Z}}` and selects based
 *    on the saved player gender. Player name comes from
 *    `gameState.get().player.name`.
 *
 *    Why at runtime: lets save state determine the rendered text without
 *    baking it into the dialogue graph. Same graph serves all genders.
 *
 * 8. BATTLE NODES OPEN A NEW SCENE
 *
 *    A `battle` type node carries `encounterId`, `onVictory`, `onDefeat`.
 *    On encountering this node, DialogueScene calls:
 *      sceneRouter.push(this, "CombatBridgeScene", {
 *        encounterId: node.encounterId,
 *        onVictoryNode: node.onVictory,
 *        onDefeatNode: node.onDefeat,
 *        returnToDialogueId: this.dialogueId,
 *      });
 *
 *    Note: this is `push`, not `replace` — the dialogue is "above" combat in
 *    the navigation stack, but PostCombatScene returns via `replace` to make
 *    the DialogueScene reappear with the right startNodeId. The stack ends up
 *    with one DialogueScene entry by the time the player resumes.
 *
 * Reference:
 *   - `.claude/teams/feature-v2-lilana/DECISIONS.md` REFINEMENT 5, 6
 *   - `src/v2/systems/DialogueRunner.ts`
 *   - `src/v2/scenes/DialogueScene.ts`
 *   - `src/v2/content/dialogues/lilana-act1.ts`
 */
