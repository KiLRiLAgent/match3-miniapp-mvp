/**
 * ArenaRewardScene — between-fight buff pick screen for Phase 2A arena.
 *
 * Shown after a normal arena floor victory (1..5). Player picks 1 of 3
 * random BuffDefs (or 3 + N when `buff_luck` extraReward stacks are active).
 * Selection calls `arenaSystem.addBuff()` and routes back to ArenaRunScene.
 *
 * No back button — the player must pick to continue. If `activeRun` is null
 * on entry (edge case — race with abort), defensively bounces to ArenaScene.
 *
 * R14 v2-isolation: imports only `src/v2/*` + `src/game/config`.
 */

import Phaser from "phaser";
import { DPR, SAFE_AREA } from "../../game/config";
import { gameState } from "../core/GameState";
import { sceneRouter } from "../core/SceneRouter";
import { arenaSystem } from "../systems/ArenaSystem";
import { buffSystem } from "../systems/BuffSystem";
import { BUFFS } from "../content/buffs";
import type { BuffDef, BuffEffectType } from "../content/types";

/**
 * Effect types with full Phase 2A runtime support. Other BuffDef entries in
 * BUFFS (addMpRegen / damageReduction / reviveOnDeath) are authored for
 * Phase 2B and are stubbed in `BuffSystem.applySingleBuff` — filtering them
 * out of the reward pool prevents "noop" picks that would frustrate the
 * player (architect-backend UX flag, Phase 2A followup).
 *
 * `physPerFightSurvived` and `extraReward` ARE active in Phase 2A: the former
 * via BuffSystem.applyToStats accumulator, the latter via
 * buffSystem.getExtraRewardCount read here and in this scene's choice count.
 */
const PHASE_2A_ACTIVE_EFFECTS: ReadonlySet<BuffEffectType> = new Set<BuffEffectType>([
  "addPhysAttack",
  "addMagAttack",
  "addMaxHp",
  "addMaxMp",
  "addCrit",
  "physPerFightSurvived",
  "extraReward",
]);

const BG_COLOR = 0x1a0f2e;
const TITLE_COLOR = "#e6c068";
const SUBTITLE_COLOR = "#9f7fc7";
const FOOTER_COLOR = "#8a7ab0";
const CARD_BG = 0x231436;
const CARD_BG_HOVER = 0x33224c;
const CARD_NAME_COLOR = "#e6c068";
const CARD_DESC_COLOR = "#d4b8e8";
const FONT = "'Exo 2', Arial, sans-serif";

// Buff-rarity border palette — separate from item rarity (common/rare/epic).
const RARITY_COLORS: Record<string, number> = {
  common: 0x9f8a7a,
  rare: 0x5b8fe6,
  epic: 0xa070d8,
};

const DEFAULT_CHOICE_COUNT = 3;
const MAX_CHOICE_COUNT = 5;
const CARD_WIDTH = 280;
const CARD_HEIGHT = 96;
const CARD_GAP = 14;

export class ArenaRewardScene extends Phaser.Scene {
  constructor() {
    super("ArenaRewardScene");
  }

  create(): void {
    const camW = this.cameras.main.width;
    const camH = this.cameras.main.height;
    const cx = camW / 2;
    const d = DPR;

    gameState.ensureLoaded();
    const run = arenaSystem.getActiveRun();
    if (!run) {
      // Defensive bounce — reward scene makes no sense without a run.
      sceneRouter.replace(this, "ArenaScene");
      return;
    }

    this.add.rectangle(0, 0, camW, camH, BG_COLOR).setOrigin(0);

    this.add
      .text(cx, 90 * d + SAFE_AREA.top * d, "Выбери баф", {
        fontSize: `${30 * d}px`,
        color: TITLE_COLOR,
        fontFamily: FONT,
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 4 * d,
      })
      .setOrigin(0.5);

    this.add
      .text(cx, 130 * d + SAFE_AREA.top * d, `Этаж ${run.floor}/6`, {
        fontSize: `${14 * d}px`,
        color: SUBTITLE_COLOR,
        fontFamily: FONT,
        fontStyle: "italic",
      })
      .setOrigin(0.5);

    // Choice count: base 3 + buff_luck stacks (clamped so layout fits).
    const extra = buffSystem.getExtraRewardCount();
    const count = Math.min(MAX_CHOICE_COUNT, DEFAULT_CHOICE_COUNT + extra);
    const choices = this.rollChoices(count);

    // Render cards vertically centered within the scene.
    const cardH = CARD_HEIGHT * d;
    const gap = CARD_GAP * d;
    const totalH = choices.length * cardH + (choices.length - 1) * gap;
    const startY = (camH - totalH) / 2 + cardH / 2;

    choices.forEach((def, idx) => {
      const cy = startY + idx * (cardH + gap);
      this.createBuffCard(cx, cy, def);
    });

    const footerY = camH - 48 * d - SAFE_AREA.bottom * d;
    this.add
      .text(cx, footerY, "После выбора начнётся следующий бой", {
        fontSize: `${12 * d}px`,
        color: FOOTER_COLOR,
        fontFamily: FONT,
        fontStyle: "italic",
      })
      .setOrigin(0.5);
  }

  /**
   * Roll `count` unique BuffDefs from the BUFFS registry. Rarity weighting:
   * common ×3, rare ×2, epic ×1 (early-game balance — common buffs appear
   * more often, epics are standout picks). Falls back gracefully if the pool
   * is smaller than `count`.
   */
  private rollChoices(count: number): BuffDef[] {
    // Filter to Phase 2A active effects so players never pick a noop buff
    // (architect-backend UX flag). Phase 2B will drop this filter once the
    // stubbed effect types gain runtime hooks.
    const all = Object.values(BUFFS).filter((b) =>
      PHASE_2A_ACTIVE_EFFECTS.has(b.effectType),
    );
    const weighted: BuffDef[] = [];
    for (const b of all) {
      const w = b.rarity === "common" ? 3 : b.rarity === "rare" ? 2 : 1;
      for (let i = 0; i < w; i++) weighted.push(b);
    }
    const picked: BuffDef[] = [];
    const used = new Set<string>();
    const target = Math.min(count, all.length);
    let attempts = 0;
    while (picked.length < target && attempts < 200) {
      attempts++;
      const idx = Math.floor(Math.random() * weighted.length);
      const candidate = weighted[idx];
      if (used.has(candidate.id)) continue;
      used.add(candidate.id);
      picked.push(candidate);
    }
    return picked;
  }

  private createBuffCard(cx: number, cy: number, def: BuffDef): void {
    const d = DPR;
    const w = CARD_WIDTH * d;
    const h = CARD_HEIGHT * d;
    const borderColor = RARITY_COLORS[def.rarity] ?? RARITY_COLORS.common;

    const bg = this.add
      .rectangle(cx, cy, w, h, CARD_BG, 0.95)
      .setStrokeStyle(2 * d, borderColor)
      .setInteractive({ useHandCursor: true });

    this.add
      .text(cx, cy - 22 * d, def.name, {
        fontSize: `${18 * d}px`,
        color: CARD_NAME_COLOR,
        fontFamily: FONT,
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    this.add
      .text(cx, cy + 14 * d, def.description, {
        fontSize: `${12 * d}px`,
        color: CARD_DESC_COLOR,
        fontFamily: FONT,
        wordWrap: { width: w - 24 * d },
        align: "center",
      })
      .setOrigin(0.5);

    bg.on("pointerover", () => bg.setFillStyle(CARD_BG_HOVER, 1));
    bg.on("pointerout", () => bg.setFillStyle(CARD_BG, 0.95));
    bg.on("pointerdown", () => this.selectBuff(def.id));
  }

  private selectBuff(buffDefId: string): void {
    arenaSystem.addBuff(buffDefId);
    sceneRouter.replace(this, "ArenaRunScene");
  }
}
