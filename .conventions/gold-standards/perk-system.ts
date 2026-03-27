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
 */
