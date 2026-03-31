/**
 * GOLD STANDARD: Mid-Cascade Interruption Pattern
 *
 * Perk selection now happens INSIDE the cascade loop, not after it.
 * This lets the player pick a perk immediately when a boss layer
 * transition occurs, then resume the cascade with the perk active.
 *
 * 1. PERK TRIGGER POINT
 *    - applyDamageToBoss() tracks layer transitions via prevBossLayerIdx
 *    - When layers are crossed, pendingPerkCount increments
 *    - Perk selection runs inside the resolveBoard while-loop:
 *
 *      // After applyMatchResults + CRIT waves
 *      while (this.pendingPerkCount > 0 && !this.gameOver) {
 *        this.pendingPerkCount--;
 *        await this.showPerkSelection();
 *      }
 *
 *    - This pauses the cascade: board state is partially resolved
 *    - After perk picked, cascade resumes with new perk effects
 *
 * 2. ORDER WITHIN CASCADE ITERATION
 *    The order inside each resolveBoard loop iteration:
 *
 *      1. computeClearOutcome
 *      2. showCritTexts (before flight)
 *      3. animateClear (tile flight)
 *      4. applyMatchResults (wave 1 damage + mana + heal)
 *      5. CRIT additional waves (damage only, with delay)
 *      6. Perk selection (if layer crossed) ← mid-cascade
 *      7. gameOver check
 *      8. Bomb defuse
 *      9. applyClearOutcome + animateCollapse
 *      10. findMatches for next iteration
 *
 * 3. SAFETY GUARDS
 *    - Always check !this.gameOver in the perk loop condition
 *    - showPerkSelection() is async — cascade is properly paused
 *    - pendingPerkCount supports multi-layer skip (e.g., CRIT damage
 *      crossing 2 layers triggers 2 sequential perk selections)
 *
 * 4. GENERAL PATTERN: Cascade Interruption
 *    - Use async/await to pause the while-loop at any point
 *    - State is consistent: damage applied, tiles cleared, but
 *      collapse not yet run
 *    - Any UI modal can interrupt: perk selection, tips, tutorials
 *    - Always guard with !this.gameOver to prevent post-death UI
 */
