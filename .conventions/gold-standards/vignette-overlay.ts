/**
 * GOLD STANDARD: Conditional Vignette Overlay Pattern
 *
 * Red vignette appears at low HP to warn the player. Disappears on heal.
 *
 * 1. STATE MANAGEMENT
 *    - Optional Graphics + optional Tween fields:
 *
 *      private vignetteGfx?: Phaser.GameObjects.Graphics;
 *      private vignetteTween?: Phaser.Tweens.Tween;
 *
 *    - updateVignette() checks threshold and shows/hides:
 *
 *      private updateVignette() {
 *        const hpRatio = this.playerHp / GAME_PARAMS.player.hpMax;
 *        if (hpRatio < this.VIGNETTE_HP_THRESHOLD && this.playerHp > 0) {
 *          this.showVignette();
 *        } else {
 *          this.hideVignette();
 *        }
 *      }
 *
 * 2. THRESHOLD CONSTANTS (class-level readonly)
 *    - VIGNETTE_HP_THRESHOLD = 0.3 (show below 30% HP)
 *    - VIGNETTE_ALPHA_MIN = 0.25 (pulse minimum)
 *    - VIGNETTE_ALPHA_MAX = 0.5 (pulse maximum)
 *    - VIGNETTE_DEPTH = 5.5 (above HUD, below combat text)
 *
 * 3. GRADIENT EDGE TECHNIQUE
 *    - Use fillGradientStyle() with varying alpha per corner:
 *
 *      // Top: opaque at top, transparent at bottom
 *      gfx.fillGradientStyle(0xff0000, 0xff0000, 0xff0000, 0xff0000, 0.8, 0.8, 0, 0);
 *      gfx.fillRect(0, 0, w, edgeSize);
 *
 *    - 4 edge rectangles (top, bottom, left, right)
 *    - edgeSize = 25% of screen minimum dimension
 *    - Creates a vignette (dark edges) without a texture
 *
 * 4. PULSE ANIMATION
 *    - Alpha pulse between min and max with yoyo + infinite repeat
 *    - Ease: Sine.easeInOut for smooth breathing effect
 *    - Duration: ~1200ms per cycle
 *
 * 5. HP BAR SYNC PULSE
 *    - When vignette is active, playerHpBar alpha pulses in sync:
 *
 *      private hpBarPulseTween?: Phaser.Tweens.Tween;
 *
 *    - Start in showVignette() after vignette tween:
 *
 *      this.hpBarPulseTween = this.tweens.add({
 *        targets: this.playerHpBar,
 *        alpha: { from: 1.0, to: 0.5 },
 *        duration: 1200,       // same as vignette pulse
 *        ease: "Sine.easeInOut",
 *        yoyo: true,
 *        repeat: -1,
 *      });
 *
 *    - Stop in hideVignette() and restore alpha to 1.0
 *
 * 6. CLEANUP ON HIDE
 *    - Stop vignette tween + HP bar pulse tween, clear references
 *    - Destroy graphics, clear reference
 *    - Restore playerHpBar alpha to 1.0
 *    - Guard: early return if already hidden
 *
 *      private hideVignette() {
 *        if (!this.vignetteGfx) return;
 *        if (this.vignetteTween) {
 *          this.vignetteTween.stop();
 *          this.vignetteTween = undefined;
 *        }
 *        this.vignetteGfx.destroy();
 *        this.vignetteGfx = undefined;
 *        if (this.hpBarPulseTween) {
 *          this.hpBarPulseTween.stop();
 *          this.hpBarPulseTween = undefined;
 *          this.playerHpBar?.setAlpha(1);
 *        }
 *      }
 *
 * 7. CALL SITES
 *    - After applyMatchResults() (damage applied)
 *    - After heal skill used
 *    - On game reset: hideVignette() in resetState()
 *
 * 8. GENERAL PATTERN: Conditional Overlays
 *    - Optional field (undefined = inactive)
 *    - Show: guard against double-create, create + start tween
 *    - Hide: guard against already hidden, stop tween + destroy
 *    - Update: threshold check at state change points
 */
