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
import { CharacterPortrait } from "../ui/CharacterPortrait";

const FONT = "'Exo 2', Arial, sans-serif";
const BG_COLOR = 0x1a0f2e;
const TITLE_COLOR = "#e6c068";
const SUBTITLE_COLOR = "#9f7fc7";
const VALUE_COLOR = "#f4e4c1";
const BODY_COLOR = "#d4b8e8";
const EMPTY_COLOR = "#8a7ab0";
const BOSS_COLOR = "#c83e3e";

const PRIMARY_BG = 0x4a2d6e;
const PRIMARY_BG_HOVER = 0x6a4a90;
const PRIMARY_STROKE = 0xe6c068;
const SECONDARY_BG = 0x2a1845;
const SECONDARY_BG_HOVER = 0x3a2358;
const SECONDARY_STROKE = 0x9f7fc7;

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

    this.add.rectangle(0, 0, camW, camH, BG_COLOR).setOrigin(0);

    // Title — floor counter with boss banner.
    const isBoss = arenaSystem.isBossFloor(run.floor);
    this.add
      .text(cx, 80 * d + SAFE_AREA.top * d, `Этаж ${run.floor}/6`, {
        fontSize: `${28 * d}px`,
        color: isBoss ? BOSS_COLOR : TITLE_COLOR,
        fontFamily: FONT,
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    if (isBoss) {
      this.add
        .text(cx, 116 * d + SAFE_AREA.top * d, "ФИНАЛЬНЫЙ БОСС", {
          fontSize: `${15 * d}px`,
          color: BOSS_COLOR,
          fontFamily: FONT,
          fontStyle: "italic bold",
        })
        .setOrigin(0.5);
    }

    // Enemy portrait + name.
    const enemy = CHARACTERS[run.enemyType];
    const enemyName = enemy?.name ?? "Враг арены";
    const portraitY = 200 * d + SAFE_AREA.top * d;
    const portrait = new CharacterPortrait(this, cx, portraitY, {
      size: 80 * d,
      initial: enemyName.charAt(0),
      emotion: "angry",
    });
    this.add.existing(portrait);
    this.add
      .text(cx, portraitY + 60 * d, enemyName, {
        fontSize: `${18 * d}px`,
        color: VALUE_COLOR,
        fontFamily: FONT,
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    // Active buffs section.
    const buffsY = 320 * d + SAFE_AREA.top * d;
    this.add
      .text(cx, buffsY, "Активные бафы", {
        fontSize: `${14 * d}px`,
        color: SUBTITLE_COLOR,
        fontFamily: FONT,
      })
      .setOrigin(0.5);
    const buffs = buffSystem.getActiveBuffsForDisplay();
    if (buffs.length === 0) {
      this.add
        .text(cx, buffsY + 22 * d, "Нет активных бафов", {
          fontSize: `${12 * d}px`,
          color: EMPTY_COLOR,
          fontFamily: FONT,
          fontStyle: "italic",
        })
        .setOrigin(0.5);
    } else {
      buffs.forEach((b, idx) => {
        this.add
          .text(cx, buffsY + 22 * d + idx * 16 * d, `• ${b.name}`, {
            fontSize: `${12 * d}px`,
            color: BODY_COLOR,
            fontFamily: FONT,
          })
          .setOrigin(0.5);
      });
    }

    // Accumulated rewards.
    const rewardsY = camH * 0.62;
    this.add
      .text(cx, rewardsY, "Накоплено за run", {
        fontSize: `${14 * d}px`,
        color: SUBTITLE_COLOR,
        fontFamily: FONT,
      })
      .setOrigin(0.5);
    this.add
      .text(
        cx,
        rewardsY + 22 * d,
        `XP: ${run.accumulatedRewards.xp}  ·  Золото: ${run.accumulatedRewards.gold}  ·  Предметов: ${run.accumulatedRewards.items.length}`,
        {
          fontSize: `${13 * d}px`,
          color: VALUE_COLOR,
          fontFamily: FONT,
        },
      )
      .setOrigin(0.5);

    // Primary CTA — launch the next fight via CombatBridgeScene. The arena
    // encounterId pattern (`arena_floor_N_<enemyType>`) is parsed by
    // arenaEncounterGenerator on the receiving side.
    const fightY = camH - 180 * d - SAFE_AREA.bottom * d;
    this.createButton(
      cx,
      fightY,
      300,
      64,
      24,
      "⚔ В бой",
      PRIMARY_BG,
      PRIMARY_BG_HOVER,
      PRIMARY_STROKE,
      3,
      () => {
        sceneRouter.push(this, "CombatBridgeScene", {
          encounterId: `arena_floor_${run.floor}_${run.enemyType}`,
          onVictoryNode: "arena_victory",
          onDefeatNode: "arena_defeat",
          returnToDialogueId: "",
        });
      },
    );

    // Secondary — abort the run (rewards from cleared floors are still flushed).
    const abortY = camH - 90 * d - SAFE_AREA.bottom * d;
    this.createButton(
      cx,
      abortY,
      240,
      48,
      16,
      "← Прервать run",
      SECONDARY_BG,
      SECONDARY_BG_HOVER,
      SECONDARY_STROKE,
      2,
      () => {
        arenaSystem.abortRun();
        sceneRouter.replace(this, "ArenaScene");
      },
    );
  }

  /**
   * Inline button factory — duplicates the ArenaScene pattern by design.
   * Task #18 will hoist both into `src/v2/ui/SceneChrome.ts`.
   */
  private createButton(
    x: number,
    y: number,
    widthDp: number,
    heightDp: number,
    fontDp: number,
    label: string,
    bgColor: number,
    bgHover: number,
    strokeColor: number,
    strokeDp: number,
    onClick: () => void,
  ): void {
    const d = DPR;
    const bg = this.add
      .rectangle(x, y, widthDp * d, heightDp * d, bgColor, 0.95)
      .setStrokeStyle(strokeDp * d, strokeColor)
      .setInteractive({ useHandCursor: true });
    const text = this.add
      .text(x, y, label, {
        fontSize: `${fontDp * d}px`,
        color: "#f4e4c1",
        fontFamily: FONT,
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    bg.on("pointerover", () => {
      bg.setFillStyle(bgHover, 1);
      text.setColor("#ffffff");
    });
    bg.on("pointerout", () => {
      bg.setFillStyle(bgColor, 0.95);
      text.setColor("#f4e4c1");
    });
    bg.on("pointerdown", onClick);
  }
}
