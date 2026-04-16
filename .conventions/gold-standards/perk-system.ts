/**
 * GOLD STANDARD: Perk System Pattern (PerkManager + PerkCard)
 *
 * Perk selection triggers at boss HP layer transitions. Player picks
 * one of N perks to upgrade a skill.
 *
 * 1. CONFIG CONSTANTS (config.ts)
 *    - PERK_MAX_LEVEL = 5 — maximum upgrade level per skill
 *    - PERK_CHOICES = 3 — how many perk cards to offer
 *    - PerkManager re-exports as MAX_PERK_LEVEL and PERKS_TO_OFFER
 *
 * 2. PERK MANAGER (src/game/PerkManager.ts)
 *    - Tracks per-skill levels: Record<SkillId, number>
 *    - getRandomPerks(count) — Fisher-Yates shuffle, filters max-level
 *    - applyPerk(skillId) — mutates SKILL_CONFIG directly:
 *
 *      case "powerStrike":
 *        cfg.damage = 100 + level * 20;   // +20% per level
 *        break;
 *
 *    - Each skill has its own upgrade formula in a switch statement
 *    - reset() restores all levels to 0 (for game restart)
 *
 * 3. PERK DEFINITIONS
 *    - PerkDef interface: { skillId, name, icon, descriptions[] }
 *    - descriptions[] has PERK_MAX_LEVEL entries, one per level
 *    - Module-level PERK_DEFS array, not exported (use getRandomPerks)
 *
 * 4. PERK CARD UI (src/ui/PerkCard.ts)
 *    - Extends Phaser.GameObjects.Container (gold standard pattern)
 *    - Centered layout: icon, star rating, description, mana cost
 *    - Star row: filled stars (current), blinking star (next), empty stars
 *    - Per-corner radius on title strip: { tl: r, tr: r, bl: 0, br: 0 }
 *    - Interactive hit area with hover glow effect
 *    - Colors defined as module-level CARD_COLORS constant
 *
 * 5. CARD ANIMATIONS (Promise-based)
 *    - playEntrance(delay) — scale 0->1 with Back.easeOut
 *    - playSelect() — scale up then fade out
 *    - playDismiss() — scale down and fade
 *    - All return Promise<void> for async/await sequencing
 *
 * 6. TRIGGER PATTERN (GameScene)
 *    - Track prevBossLayerIdx
 *    - After damage, check if layer index decreased
 *    - If so, show perk selection overlay with 3 random cards
 *    - On selection: applyPerk(), dismiss others, continue gameplay
 *
 * 7. CLEANUP
 *    - PerkCard.destroy() stops glowTween before super.destroy()
 *    - PerkManager.reset() called on game restart
 *
 * 8. BACKWARD-COMPAT VISUAL OPT-IN (PerkCardOptions.enhancedVisuals)
 *
 *    When a UI component used by multiple call sites needs to evolve
 *    its visual style for ONE caller without changing the others,
 *    add an OPTIONAL boolean prop with a default that preserves the
 *    existing render byte-for-byte. Pattern (PerkCard rework, Task #1):
 *
 *      export interface PerkCardOptions {
 *        width?: number;
 *        height?: number;
 *        // Opt-in flag — default false → identical to pre-rework render.
 *        // Set true at the new call site that wants the upgraded look.
 *        enhancedVisuals?: boolean;
 *      }
 *
 *    Inside the constructor, branch via NAMED multiplier consts (not
 *    inline ternaries) so each visual axis is named and grep-able:
 *
 *      const enhanced = options?.enhancedVisuals ?? false;
 *      const fontMul  = enhanced ? 1.25 : 1.0;
 *      const starMul  = enhanced ? 1.5  : 1.0;
 *      const titleMul = enhanced ? 1.2  : 1.0;
 *      const iconMul  = enhanced ? 1.18 : 1.0;
 *      const manaMul  = enhanced ? 1.7  : 1.0;
 *      // ... use multipliers in fontSize / radius / spacing calcs
 *
 *    Verify backward-compat by reading every existing call site —
 *    they must NOT pass `enhancedVisuals` (or pass `false`). The
 *    code path with all multipliers = 1.0 must be byte-identical to
 *    the pre-opt-in version.
 *
 *    Don't extract the multiplier block to a module-level const —
 *    it's tied to constructor-local `enhanced`, and the named-block
 *    form reads naturally as "this is what enhanced does to each
 *    visual axis". A second mode (e.g., "huge") would extend this
 *    block, not replace it.
 *
 *    Anti-pattern to avoid: per-substring color tricks via BBCode or
 *    Text-stroke. If the new look needs accent text in a different
 *    color (e.g., bright-green ↑ arrows), parse the source string and
 *    render the accent piece as a SEPARATE Phaser.Text at a fixed
 *    position. PerkCard's `splitDescriptionArrows()` is the reference:
 *    pure module-level helper, regex on hard-coded perk descriptions.
 */
