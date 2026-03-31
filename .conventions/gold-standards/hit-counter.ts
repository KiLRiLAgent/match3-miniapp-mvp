/**
 * GOLD STANDARD: Cascade Hit Counter Pattern
 *
 * Shows cumulative "N Hits!" text near boss during multi-hit cascades.
 *
 * 1. STATE FIELDS
 *
 *      private cascadeHitCount = 0;
 *      private hitCounterText?: Phaser.GameObjects.Text;
 *
 * 2. LIFECYCLE
 *    - Reset at start of resolveBoard: cascadeHitCount = 0
 *    - Increment after each applyMatchResults if damage was dealt:
 *
 *      if (actor === "player" && this.computeDamageFromCounts(outcome.counts) > 0) {
 *        this.cascadeHitCount++;
 *        if (this.cascadeHitCount >= 2) {
 *          this.updateHitCounter(this.cascadeHitCount);
 *        }
 *      }
 *
 *    - Fade out after cascade loop ends (before restoreBossArtFromDamage)
 *
 * 3. DISPLAY
 *    - Position: right-aligned near boss HP bar area
 *    - Style: gold (#ffd700), bold, 22px, black stroke, resolution: 2
 *    - Depth: 100 (same as combat text)
 *    - Origin: (1, 0.5) for right-alignment
 *    - Only shown when cascadeHitCount >= 2 (single hits don't show)
 *
 * 4. ANIMATION
 *    - First appearance: scale 0 -> 1 with Back.easeOut (200ms)
 *    - Update: scale 0.8 -> 1 bounce on each count increment (150ms)
 *    - Fade out: alpha -> 0, y -= 20, 400ms Quad.easeOut, then destroy
 *
 * 5. UPDATE vs CREATE PATTERN
 *    - updateHitCounter() reuses existing text object if present
 *    - Updates text content and does a small bounce
 *    - Creates new text only if hitCounterText is undefined
 *    - fadeOutHitCounter() clears the reference before tweening
 *
 * 6. GENERAL PATTERN: Temporary Cascade UI
 *    - Optional field (undefined = inactive)
 *    - Reset counter at cascade start
 *    - Update/create inside loop
 *    - Fade out + destroy after loop ends
 *    - Clear reference immediately (not in onComplete) to prevent
 *      stale reference if next cascade starts before fade completes
 */
