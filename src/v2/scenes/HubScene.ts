/**
 * HubScene — главный экран v2 «Университет Падших».
 *
 * Phase 1A: полноценная реализация поверх Phase 0 stub. Греет SaveData,
 * показывает приветствие игроку и две основные кнопки:
 *   1. «К карте кампуса» → StoryMapScene
 *   2. «← Вернуться в v1 (Арена)» → setActiveMode("v1") + reload
 *
 * Layout правила (унаследованы из Phase 0 fix 20b70c4):
 * — Использовать `this.cameras.main.width / height`, НЕ `GAME_WIDTH/HEIGHT`.
 * — DPR-множитель только на font sizes / offsets / strokes, не на координаты.
 * — Bottom-anchored controls респектят `SAFE_AREA.bottom`.
 *
 * v2-isolation: импорты только из `src/v2/*` + `src/game/config` (DPR/SAFE_AREA)
 * + `src/game/version` (setActiveMode). НИКАКИХ импортов из `src/scenes/*`,
 * `src/match3/*`, `src/ui/*` — это нарушит границу.
 */

import Phaser from "phaser";
import { DPR, SAFE_AREA } from "../../game/config";
import { setActiveMode } from "../../game/version";
import { gameState } from "../core/GameState";
import { sceneRouter } from "../core/SceneRouter";

const BG_COLOR = 0x1a0f2e;
const TITLE_COLOR = "#e6c068";
const SUBTITLE_COLOR = "#9f7fc7";
const GREETING_COLOR = "#d4b8e8";
const FONT = "'Exo 2', Arial, sans-serif";

const PRIMARY_BG = 0x4a2d6e;
const PRIMARY_BG_HOVER = 0x6a4a90;
const PRIMARY_STROKE = 0xe6c068;
const PRIMARY_TEXT = "#f4e4c1";
const PRIMARY_TEXT_HOVER = "#ffffff";

const SECONDARY_BG = 0x2a1845;
const SECONDARY_BG_HOVER = 0x3a2358;
const SECONDARY_STROKE = 0x9f7fc7;
const SECONDARY_TEXT = "#b8a8d0";
const SECONDARY_TEXT_HOVER = "#e6c068";

const PRIMARY_BUTTON_WIDTH = 320;
const PRIMARY_BUTTON_HEIGHT = 72;
const SECONDARY_BUTTON_WIDTH = 260;
const SECONDARY_BUTTON_HEIGHT = 52;

export class HubScene extends Phaser.Scene {
  constructor() {
    super("HubScene");
  }

  create() {
    const camW = this.cameras.main.width;
    const camH = this.cameras.main.height;
    const cx = camW / 2;
    const d = DPR;

    const save = gameState.ensureLoaded();

    this.add.rectangle(0, 0, camW, camH, BG_COLOR).setOrigin(0);

    this.add
      .text(cx, 110 * d + SAFE_AREA.top * d, "Университет Падших", {
        fontSize: `${36 * d}px`,
        color: TITLE_COLOR,
        fontFamily: FONT,
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 4 * d,
      })
      .setOrigin(0.5);

    this.add
      .text(cx, 158 * d + SAFE_AREA.top * d, "v2 · β", {
        fontSize: `${16 * d}px`,
        color: SUBTITLE_COLOR,
        fontFamily: FONT,
        fontStyle: "italic",
      })
      .setOrigin(0.5);

    this.add
      .text(cx, 220 * d + SAFE_AREA.top * d, `Добро пожаловать, ${save.player.name}`, {
        fontSize: `${22 * d}px`,
        color: GREETING_COLOR,
        fontFamily: FONT,
      })
      .setOrigin(0.5);

    const primaryY = camH * 0.55;
    this.createPrimaryButton(cx, primaryY, "К карте кампуса", () => {
      sceneRouter.push(this, "StoryMapScene");
    });

    const secondaryY = camH - 80 * d - SAFE_AREA.bottom * d;
    this.createSecondaryButton(cx, secondaryY, "← Вернуться в v1 (Арена)", () => {
      setActiveMode("v1");
      window.location.reload();
    });
  }

  private createPrimaryButton(
    x: number,
    y: number,
    label: string,
    onClick: () => void,
  ): void {
    const d = DPR;
    const width = PRIMARY_BUTTON_WIDTH * d;
    const height = PRIMARY_BUTTON_HEIGHT * d;

    const bg = this.add
      .rectangle(x, y, width, height, PRIMARY_BG, 0.95)
      .setStrokeStyle(3 * d, PRIMARY_STROKE)
      .setInteractive({ useHandCursor: true });

    const text = this.add
      .text(x, y, label, {
        fontSize: `${24 * d}px`,
        color: PRIMARY_TEXT,
        fontFamily: FONT,
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    bg.on("pointerover", () => {
      bg.setFillStyle(PRIMARY_BG_HOVER, 1);
      text.setColor(PRIMARY_TEXT_HOVER);
    });
    bg.on("pointerout", () => {
      bg.setFillStyle(PRIMARY_BG, 0.95);
      text.setColor(PRIMARY_TEXT);
    });
    bg.on("pointerdown", onClick);
  }

  private createSecondaryButton(
    x: number,
    y: number,
    label: string,
    onClick: () => void,
  ): void {
    const d = DPR;
    const width = SECONDARY_BUTTON_WIDTH * d;
    const height = SECONDARY_BUTTON_HEIGHT * d;

    const bg = this.add
      .rectangle(x, y, width, height, SECONDARY_BG, 0.95)
      .setStrokeStyle(2 * d, SECONDARY_STROKE)
      .setInteractive({ useHandCursor: true });

    const text = this.add
      .text(x, y, label, {
        fontSize: `${18 * d}px`,
        color: SECONDARY_TEXT,
        fontFamily: FONT,
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    bg.on("pointerover", () => {
      bg.setFillStyle(SECONDARY_BG_HOVER, 1);
      text.setColor(SECONDARY_TEXT_HOVER);
    });
    bg.on("pointerout", () => {
      bg.setFillStyle(SECONDARY_BG, 0.95);
      text.setColor(SECONDARY_TEXT);
    });
    bg.on("pointerdown", onClick);
  }
}
