/**
 * ArenaRunScene — active arena run UI (Phase 2A).
 *
 * Shows current floor, next enemy portrait+name, active buffs list, and
 * accumulated rewards. "В бой" launches CombatBridgeScene with the
 * procedurally-generated arena encounterId; PostCombatScene's arena branch
 * handles routing back here (or to ArenaRewardScene / ArenaScene).
 *
 * Defensive bounce: if `arenaSystem.getActiveRun()` is null on entry (run
 * was lost between scene transitions), replace to ArenaScene instead of
 * crashing.
 */

import Phaser from "phaser";
import { DPR, SAFE_AREA } from "../../game/config";
import { gameState } from "../core/GameState";
import { sceneRouter } from "../core/SceneRouter";
import { arenaSystem } from "../systems/ArenaSystem";
import { buffSystem } from "../systems/BuffSystem";
import { CHARACTERS } from "../content/characters";
import { BUFFS } from "../content/buffs";
import { CharacterPortrait } from "../ui/CharacterPortrait";
import type { ArenaRunState, PlayerStats } from "../core/types";
import type { BuffEffectType } from "../content/types";
import { ARENA_TOTAL_FLOORS } from "../systems/ArenaEncounterGenerator";

const TOTAL_FLOORS = ARENA_TOTAL_FLOORS;

/** Emoji prefix per stat for the stats-preview panel + buff list. */
const STAT_EMOJI: Record<keyof PlayerStats, string> = {
  hp: "❤",
  mp: "💧",
  physAttack: "⚔",
  magAttack: "✨",
  crit: "💥",
};

/** Map BuffEffectType → the stat icon shown in the buff list row. */
const BUFF_EFFECT_EMOJI: Record<BuffEffectType, string> = {
  addPhysAttack: "⚔",
  addMagAttack: "✨",
  addMaxHp: "❤",
  addMaxMp: "💧",
  addCrit: "💥",
  addMpRegen: "💧",
  damageReduction: "🛡",
  physPerFightSurvived: "⚔",
  extraReward: "🎲",
  reviveOnDeath: "🔥",
};

import { createPrimaryButton, createSecondaryButton } from "../ui/SceneChrome";
import { V2_COLORS, V2_FONTS } from "../ui/theme";

const BOSS_COLOR = "#c83e3e";

export class ArenaRunScene extends Phaser.Scene {
  constructor() {
    super("ArenaRunScene");
  }

  create(): void {
    const camW = this.cameras.main.width;
    const camH = this.cameras.main.height;
    const cx = camW / 2;
    const d = DPR;

    gameState.ensureLoaded();
    const run = arenaSystem.getActiveRun();
    if (!run) {
      sceneRouter.replace(this, "ArenaScene");
      return;
    }

    this.add.rectangle(0, 0, camW, camH, V2_COLORS.bg).setOrigin(0);

    // Title — floor counter with boss banner.
    const isBoss = arenaSystem.isBossFloor(run.floor);
    this.add
      .text(cx, 70 * d + SAFE_AREA.top * d, `Этаж ${run.floor}/${TOTAL_FLOORS}`, {
        fontSize: `${24 * d}px`,
        color: isBoss ? BOSS_COLOR : V2_COLORS.titleColor,
        fontFamily: V2_FONTS.primary,
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    if (isBoss) {
      this.add
        .text(cx, 100 * d + SAFE_AREA.top * d, "ФИНАЛЬНЫЙ БОСС", {
          fontSize: `${13 * d}px`,
          color: BOSS_COLOR,
          fontFamily: V2_FONTS.primary,
          fontStyle: "italic bold",
        })
        .setOrigin(0.5);
    }

    // Phase 2A+ Archero map — vertical path on right half of screen.
    this.drawPathMap(run, camW, camH);

    // Phase 2A+ stats preview panel — effective stats with buff deltas on
    // the left half of the screen. THIS is what fixes the user's "skills
    // reset between fights" perception: they see concrete +deltas.
    const leftX = camW * 0.28;
    const panelTopY = 150 * d + SAFE_AREA.top * d;
    const afterStatsY = this.renderStatsPanel(leftX, panelTopY);
    // v2: arena HP/mana carry-over — show current HP/mana status between fights.
    const afterCarriedY = this.renderCarriedStats(leftX, afterStatsY + 12 * d, run);
    this.renderBuffList(leftX, afterCarriedY + 12 * d);

    // Accumulated rewards — small strip below left column.
    const rewardsY = camH - 220 * d - SAFE_AREA.bottom * d;
    this.add
      .text(
        leftX,
        rewardsY,
        `Накоплено:  XP ${run.accumulatedRewards.xp}  ·  💰 ${run.accumulatedRewards.gold}  ·  📦 ${run.accumulatedRewards.items.length}`,
        {
          fontSize: `${11 * d}px`,
          color: V2_COLORS.subtitleColor,
          fontFamily: V2_FONTS.primary,
          fontStyle: "italic",
        },
      )
      .setOrigin(0.5);

    // Primary CTA — launch the next fight via CombatBridgeScene. The arena
    // encounterId pattern (`arena_floor_N_<enemyType>`) is parsed by
    // arenaEncounterGenerator on the receiving side.
    const fightY = camH - 150 * d - SAFE_AREA.bottom * d;
    createPrimaryButton(this, cx, fightY, "⚔ В бой", () => {
      sceneRouter.push(this, "CombatBridgeScene", {
        encounterId: `arena_floor_${run.floor}_${run.enemyType}`,
        onVictoryNode: "arena_victory",
        onDefeatNode: "arena_defeat",
        returnToDialogueId: "",
      });
    });

    // Secondary — abort the run (rewards from cleared floors are still flushed).
    const abortY = camH - 90 * d - SAFE_AREA.bottom * d;
    createSecondaryButton(this, cx, abortY, "← Прервать run", () => {
      arenaSystem.abortRun();
      sceneRouter.replace(this, "ArenaScene");
    }, { widthDp: 240, heightDp: 48, fontDp: 16 });
  }

  /**
   * Phase 2A+ Archero map — vertical path of 6 floor nodes on the right
   * half of the screen. Bottom = floor 1, top = floor 6 (boss). Past floors
   * are dimmed with ✓, current floor is highlighted + pulsing, future floors
   * are smaller and faded. Path line connects node centers.
   */
  private drawPathMap(
    run: ArenaRunState,
    camW: number,
    camH: number,
  ): void {
    const d = DPR;
    const plannedEnemies = arenaSystem.getPlannedEnemies();
    const columnX = camW * 0.72;
    const topY = 150 * d + SAFE_AREA.top * d;
    const bottomY = camH - 230 * d - SAFE_AREA.bottom * d;
    const span = bottomY - topY;
    // Floor 1 at bottom, floor 6 at top — invert Y.
    const nodeYForFloor = (floor: number): number =>
      bottomY - ((floor - 1) / (TOTAL_FLOORS - 1)) * span;

    // Path line — drawn first so node circles overlay it.
    const lineGfx = this.add.graphics();
    lineGfx.lineStyle(3 * d, 0xe6c068, 0.5);
    lineGfx.beginPath();
    lineGfx.moveTo(columnX, nodeYForFloor(1));
    for (let f = 2; f <= TOTAL_FLOORS; f++) {
      lineGfx.lineTo(columnX, nodeYForFloor(f));
    }
    lineGfx.strokePath();

    // Render nodes from bottom to top (1..6).
    for (let f = 1; f <= TOTAL_FLOORS; f++) {
      const nodeY = nodeYForFloor(f);
      const enemyId = plannedEnemies[f - 1] ?? "arena_demon";
      const enemy = CHARACTERS[enemyId];
      const enemyName = enemy?.name ?? "?";
      const initial = enemyName.charAt(0);
      const isCurrent = f === run.floor;
      const isPast = f < run.floor;
      const isBossNode = f === TOTAL_FLOORS;

      // Size / alpha / emotion vary by state.
      let size: number;
      let alpha: number;
      let emotion: "neutral" | "angry" | "happy" = "angry";
      if (isCurrent) {
        size = 72 * d;
        alpha = 1;
        emotion = "angry";
      } else if (isPast) {
        size = 34 * d;
        alpha = 0.35;
        emotion = "neutral";
      } else {
        size = isBossNode ? 52 * d : 40 * d;
        alpha = 0.7;
        emotion = "angry";
      }

      const portrait = new CharacterPortrait(this, columnX, nodeY, {
        size,
        initial,
        emotion,
      });
      portrait.setAlpha(alpha);
      this.add.existing(portrait);

      // Current-floor pulsing glow ring.
      if (isCurrent) {
        const glow = this.add
          .circle(columnX, nodeY, size / 2 + 6 * d, 0xe6c068, 0)
          .setStrokeStyle(3 * d, 0xe6c068, 1);
        this.tweens.add({
          targets: glow,
          scale: { from: 1, to: 1.15 },
          alpha: { from: 1, to: 0.4 },
          duration: 900,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
      }

      // Boss-floor red ring.
      if (isBossNode && !isCurrent) {
        this.add
          .circle(columnX, nodeY, size / 2 + 4 * d, 0xc83e3e, 0)
          .setStrokeStyle(2 * d, 0xc83e3e, 0.8);
      }

      // Past-floor ✓ badge.
      if (isPast) {
        this.add
          .text(columnX, nodeY, "✓", {
            fontSize: `${16 * d}px`,
            color: "#4caf50",
            fontFamily: V2_FONTS.primary,
            fontStyle: "bold",
          })
          .setOrigin(0.5);
      }

      // Floor number badge — small label to the left of the node.
      const labelColor = isCurrent
        ? V2_COLORS.titleColor
        : isBossNode
          ? BOSS_COLOR
          : V2_COLORS.subtitleColor;
      this.add
        .text(columnX - size / 2 - 14 * d, nodeY, `${f}`, {
          fontSize: `${12 * d}px`,
          color: labelColor,
          fontFamily: V2_FONTS.primary,
          fontStyle: "bold",
        })
        .setOrigin(1, 0.5);

      // Current-floor enemy name below the portrait.
      if (isCurrent) {
        this.add
          .text(columnX, nodeY + size / 2 + 14 * d, enemyName, {
            fontSize: `${13 * d}px`,
            color: V2_COLORS.valueColor,
            fontFamily: V2_FONTS.primary,
            fontStyle: "bold",
          })
          .setOrigin(0.5);
      }
    }
  }

  /**
   * Phase 2A+ stats preview panel — shows base stats → effective stats with
   * gold-highlighted deltas. THIS fixes the user's "skills reset between
   * fights" perception by giving concrete numerical proof of progression.
   *
   * Returns the bottom Y of the panel so the caller can chain renderBuffList.
   */
  private renderStatsPanel(cx: number, topY: number): number {
    const d = DPR;
    const base = gameState.get().player.stats;
    const effective = buffSystem.applyToStats(base);

    this.add
      .text(cx, topY, "Твои силы", {
        fontSize: `${13 * d}px`,
        color: V2_COLORS.subtitleColor,
        fontFamily: V2_FONTS.primary,
        fontStyle: "italic",
      })
      .setOrigin(0.5, 0);

    const rows: Array<{
      key: keyof PlayerStats;
      label: string;
      suffix?: string;
    }> = [
      { key: "physAttack", label: "Физ атака" },
      { key: "magAttack", label: "Маг атака" },
      { key: "hp", label: "Здоровье" },
      { key: "mp", label: "Мана" },
      { key: "crit", label: "Крит", suffix: "%" },
    ];

    let y = topY + 22 * d;
    const rowH = 18 * d;
    for (const row of rows) {
      const baseVal = base[row.key];
      const effVal = effective[row.key];
      const delta = effVal - baseVal;
      const muted = delta === 0;

      const emoji = STAT_EMOJI[row.key];
      const sfx = row.suffix ?? "";
      const leftText = `${emoji} ${row.label}`;
      const rightText =
        delta > 0
          ? `${baseVal}${sfx} → ${effVal}${sfx}`
          : `${effVal}${sfx}`;

      this.add
        .text(cx - 90 * d, y, leftText, {
          fontSize: `${12 * d}px`,
          color: muted ? V2_COLORS.emptySlotColor : V2_COLORS.bodyColor,
          fontFamily: V2_FONTS.primary,
        })
        .setOrigin(0, 0.5);

      this.add
        .text(cx + 60 * d, y, rightText, {
          fontSize: `${12 * d}px`,
          color: muted ? V2_COLORS.emptySlotColor : V2_COLORS.valueColor,
          fontFamily: V2_FONTS.primary,
          fontStyle: muted ? "normal" : "bold",
        })
        .setOrigin(1, 0.5);

      if (delta > 0) {
        this.add
          .text(cx + 90 * d, y, `+${delta}${sfx}`, {
            fontSize: `${12 * d}px`,
            color: V2_COLORS.titleColor,
            fontFamily: V2_FONTS.primary,
            fontStyle: "bold",
          })
          .setOrigin(1, 0.5);
      }

      y += rowH;
    }
    return y;
  }

  /**
   * v2: arena HP/mana carry-over — show HP and mana status between fights.
   * First fight shows "Полное здоровье", subsequent fights show carried values
   * with simple bar visualization. Returns the bottom Y for layout chaining.
   */
  private renderCarriedStats(cx: number, topY: number, run: ArenaRunState): number {
    const d = DPR;
    const base = gameState.get().player.stats;
    const effective = buffSystem.applyToStats(base);

    const hpMax = effective.hp;
    const mpMax = effective.mp;
    const currentHp = run.carriedHp !== undefined ? Math.min(run.carriedHp, hpMax) : hpMax;
    const currentMp = run.carriedMana !== undefined ? run.carriedMana : 0;
    const isFirstFight = run.carriedHp === undefined;

    this.add
      .text(cx, topY, "Состояние", {
        fontSize: `${13 * d}px`,
        color: V2_COLORS.subtitleColor,
        fontFamily: V2_FONTS.primary,
        fontStyle: "italic",
      })
      .setOrigin(0.5, 0);

    let y = topY + 20 * d;

    if (isFirstFight) {
      this.add
        .text(cx, y, "❤ Полное здоровье", {
          fontSize: `${12 * d}px`,
          color: "#4caf50",
          fontFamily: V2_FONTS.primary,
          fontStyle: "bold",
        })
        .setOrigin(0.5, 0);
      y += 18 * d;
    } else {
      // HP bar
      const barW = 140 * d;
      const barH = 10 * d;
      const barX = cx - barW / 2;

      this.add
        .text(cx - barW / 2 - 4 * d, y + barH / 2, "❤", {
          fontSize: `${11 * d}px`,
          color: "#4caf50",
          fontFamily: V2_FONTS.primary,
        })
        .setOrigin(1, 0.5);

      // HP background
      this.add.rectangle(barX + barW / 2, y + barH / 2, barW, barH, 0x333333).setOrigin(0.5);
      // HP fill
      const hpRatio = hpMax > 0 ? currentHp / hpMax : 0;
      const hpColor = hpRatio > 0.5 ? 0x4caf50 : hpRatio > 0.25 ? 0xffa000 : 0xc83e3e;
      if (hpRatio > 0) {
        this.add.rectangle(barX + (barW * hpRatio) / 2, y + barH / 2, barW * hpRatio, barH, hpColor).setOrigin(0.5);
      }
      // HP text
      this.add
        .text(cx + barW / 2 + 6 * d, y + barH / 2, `${currentHp}/${hpMax}`, {
          fontSize: `${10 * d}px`,
          color: V2_COLORS.valueColor,
          fontFamily: V2_FONTS.primary,
        })
        .setOrigin(0, 0.5);
      y += barH + 8 * d;

      // Mana bar
      this.add
        .text(cx - barW / 2 - 4 * d, y + barH / 2, "💧", {
          fontSize: `${11 * d}px`,
          color: "#3b82f6",
          fontFamily: V2_FONTS.primary,
        })
        .setOrigin(1, 0.5);

      this.add.rectangle(barX + barW / 2, y + barH / 2, barW, barH, 0x333333).setOrigin(0.5);
      const mpRatio = mpMax > 0 ? Math.min(currentMp / mpMax, 1) : 0;
      if (mpRatio > 0) {
        this.add.rectangle(barX + (barW * mpRatio) / 2, y + barH / 2, barW * mpRatio, barH, 0x3b82f6).setOrigin(0.5);
      }
      this.add
        .text(cx + barW / 2 + 6 * d, y + barH / 2, `${currentMp}/${mpMax}`, {
          fontSize: `${10 * d}px`,
          color: V2_COLORS.valueColor,
          fontFamily: V2_FONTS.primary,
        })
        .setOrigin(0, 0.5);
      y += barH + 8 * d;
    }

    return y;
  }

  /**
   * Phase 2A+ enhanced buff list with emoji prefixes and stacking counts.
   * Groups identical buffDefIds so stackable buffs show as "⚔ Сила ×3".
   */
  private renderBuffList(cx: number, topY: number): void {
    const d = DPR;
    const run = arenaSystem.getActiveRun();
    if (!run) return;

    // Group activeBuffs by buffDefId to show ×N stack counts.
    const counts = new Map<string, number>();
    for (const b of run.activeBuffs) {
      counts.set(b.buffDefId, (counts.get(b.buffDefId) ?? 0) + 1);
    }

    this.add
      .text(cx, topY, "Активные навыки", {
        fontSize: `${13 * d}px`,
        color: V2_COLORS.subtitleColor,
        fontFamily: V2_FONTS.primary,
        fontStyle: "italic",
      })
      .setOrigin(0.5, 0);

    let y = topY + 22 * d;
    if (counts.size === 0) {
      this.add
        .text(cx, y, "— пока никаких —", {
          fontSize: `${11 * d}px`,
          color: V2_COLORS.emptySlotColor,
          fontFamily: V2_FONTS.primary,
          fontStyle: "italic",
        })
        .setOrigin(0.5, 0);
      return;
    }

    for (const [buffDefId, count] of counts) {
      const def = BUFFS[buffDefId];
      if (!def) continue;
      const emoji = BUFF_EFFECT_EMOJI[def.effectType] ?? "•";
      const label =
        count > 1 ? `${emoji} ${def.name} ×${count}` : `${emoji} ${def.name}`;
      this.add
        .text(cx, y, label, {
          fontSize: `${12 * d}px`,
          color: V2_COLORS.bodyColor,
          fontFamily: V2_FONTS.primary,
        })
        .setOrigin(0.5, 0);
      y += 16 * d;
    }
  }

}
