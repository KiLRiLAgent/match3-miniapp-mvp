/**
 * GOLD STANDARD: System dependency injection via setter-provider
 *
 * When two v2 systems need to talk to each other but were authored in parallel
 * tracks (or could be unloaded in tests), use a setter-injected provider
 * function instead of a direct module import. This breaks the import-graph
 * coupling and lets either system load first without an undefined-reference
 * crash on first call.
 *
 * Phase 1B introduced this pattern when ProgressionSystem (task #4) needed
 * equipment-derived stat bonuses from InventorySystem (task #5), with both
 * tasks running on parallel coder threads. A direct
 * `import { inventorySystem } from "./InventorySystem"` would have made the
 * tasks blocked-by each other and crashed the build whenever one side was
 * ahead of the other on a coder's checkout.
 *
 * 1. SHAPE: optional provider, undefined-tolerant default
 *
 *    The consuming system declares a private field for the provider and a
 *    setter that registers it. Methods that read the provider use optional
 *    chaining + nullish coalesce so a missing provider falls back to a
 *    sensible empty result.
 *
 *      // ProgressionSystem.ts
 *      export type InventoryStatsProvider = () => ItemStats;
 *
 *      class ProgressionSystem {
 *        private inventoryProvider?: InventoryStatsProvider;
 *
 *        setInventoryProvider(provider: InventoryStatsProvider | undefined): void {
 *          this.inventoryProvider = provider;
 *        }
 *
 *        computeEffectiveStats(): EffectivePlayerStats {
 *          const base = gameState.get().player.stats;
 *          const bonus: ItemStats = this.inventoryProvider?.() ?? {};
 *          return {
 *            hp: base.hp + (bonus.hp ?? 0),
 *            // ...
 *          };
 *        }
 *      }
 *
 * 2. WIRING: single registration call at boot
 *
 *    The integration layer wires the provider exactly once at v2 boot, before
 *    any scene calls into the consumer. Re-registration is idempotent — the
 *    setter just overwrites the field with the same closure.
 *
 *      // src/v2/index.ts → registerV2Scenes(game)
 *      progressionSystem.setInventoryProvider(() =>
 *        inventorySystem.computeAggregateStats(),
 *      );
 *
 *    The closure captures `inventorySystem` lazily — `computeAggregateStats`
 *    is only invoked when ProgressionSystem actually needs the bonus, which
 *    means an unloaded InventorySystem (e.g. in a unit test that imports only
 *    ProgressionSystem) gracefully degrades to an empty bonus.
 *
 * 3. WHY NOT A DIRECT IMPORT
 *
 *    A direct `import { inventorySystem } from "./InventorySystem"` would:
 *
 *    - Couple parallel coder branches: a task that hadn't merged yet would
 *      break the consumer's build on every other coder's checkout.
 *    - Create a hidden hard dependency in unit tests — importing
 *      ProgressionSystem would drag in InventorySystem and its content
 *      registry transitively.
 *    - Make it harder to mock: the consumer would need a module-level
 *      `vi.mock(...)` call instead of a per-test `setInventoryProvider(...)`
 *      override.
 *
 *    Setter injection costs one extra line at boot and one optional field on
 *    the consumer in exchange for clean parallel-track development and
 *    trivially mockable tests.
 *
 * 4. WHEN TO USE IT
 *
 *    - Two systems need each other but live on parallel implementation tracks
 *    - The dependency is *optional* in the sense that the consumer has a
 *      sensible empty default (e.g. "no equipment bonus" → zero)
 *    - You want unit tests of the consumer to skip loading the provider
 *
 *    DO NOT use it for hard requirements (e.g. ProgressionSystem cannot
 *    function without GameState). Hard requirements stay as direct imports.
 *
 * 5. ANTI-PATTERN: lazy require / dynamic import inside hot paths
 *
 *    Resist the temptation to do `const inv = await import("./InventorySystem")`
 *    inside the consumer method. That introduces an async hop on every call,
 *    breaks ESM static analysis, and tools like vite-plugin-checker can no
 *    longer trace the dep graph. Setter injection at boot is synchronous,
 *    statically typed, and grep-friendly.
 *
 * Reference:
 *   - src/v2/systems/ProgressionSystem.ts (consumer with setter)
 *   - src/v2/systems/InventorySystem.ts (provider — has computeAggregateStats)
 *   - src/v2/index.ts (registerV2Scenes wires the closure once)
 *   - Phase 1B Tasks #4, #5, #6 (parallel-track dependency that motivated this)
 */
