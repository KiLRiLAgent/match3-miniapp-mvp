/**
 * StoryMapScene — карта кампуса. Показывает все разблокированные локации
 * (`LocationDef.unlockedByDefault === true` ИЛИ story-flag `location:<id>:unlocked`).
 *
 * Phase 1A: единственная локация — Атриум, по центру экрана. В Phase 1B+
 * добавятся новые локации, и `computeLocationPosition` выложит их по
 * сетке/органике. Координаты позиции считаются динамически — никаких
 * hardcoded карт.
 *
 * Tap на location node → LocationScene с переданным `locationId`.
 *
 * v2-isolation: импорты только из `src/v2/*` + `src/game/config`. Никаких
 * v1 scene imports. Reads LOCATIONS / story flags чисто.
 */

import Phaser from "phaser";
import { DPR, SAFE_AREA } from "../../game/config";
import { sceneRouter } from "../core/SceneRouter";
import { storyFlags } from "../systems/StoryFlags";
import { LOCATIONS } from "../content/locations";
import type { LocationDef } from "../content/types";

const BG_COLOR = 0x0d0820;
const TITLE_COLOR = "#e6c068";
const SUBTITLE_COLOR = "#8a7ab0";
const FONT = "'Exo 2', Arial, sans-serif";

const NODE_FILL = 0x4a2d6e;
const NODE_FILL_HOVER = 0x6a4a90;
const NODE_STROKE = 0xe6c068;
const NODE_LABEL_COLOR = "#f4e4c1";
const NODE_RADIUS = 64;

const BACK_BG = 0x2a1845;
const BACK_BG_HOVER = 0x3a2358;
const BACK_STROKE = 0x9f7fc7;
const BACK_TEXT = "#b8a8d0";
const BACK_BUTTON_WIDTH = 180;
const BACK_BUTTON_HEIGHT = 48;

export class StoryMapScene extends Phaser.Scene {
  constructor() {
    super("StoryMapScene");
  }

  create() {
    const camW = this.cameras.main.width;
    const camH = this.cameras.main.height;
    const cx = camW / 2;
    const d = DPR;

    this.add.rectangle(0, 0, camW, camH, BG_COLOR).setOrigin(0);

    this.add
      .text(cx, 90 * d + SAFE_AREA.top * d, "Карта кампуса", {
        fontSize: `${30 * d}px`,
        color: TITLE_COLOR,
        fontFamily: FONT,
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 3 * d,
      })
      .setOrigin(0.5);

    this.add
      .text(cx, 134 * d + SAFE_AREA.top * d, "Выбери место, куда хочешь пойти", {
        fontSize: `${16 * d}px`,
        color: SUBTITLE_COLOR,
        fontFamily: FONT,
        fontStyle: "italic",
      })
      .setOrigin(0.5);

    const unlocked = Object.values(LOCATIONS).filter((loc) => this.isUnlocked(loc));

    if (unlocked.length === 0) {
      this.add
        .text(cx, camH / 2, "Нет доступных локаций", {
          fontSize: `${20 * d}px`,
          color: "#9f7fc7",
          fontFamily: FONT,
        })
        .setOrigin(0.5);
    } else {
      unlocked.forEach((loc, idx) => {
        const pos = this.computeLocationPosition(idx, unlocked.length, camW, camH);
        this.createLocationNode(loc, pos.x, pos.y);
      });
    }

    const backY = camH - 70 * d - SAFE_AREA.bottom * d;
    this.createBackButton(cx, backY, () => sceneRouter.pop(this));
  }

  /**
   * Проверка разблокировки — `unlockedByDefault` ИЛИ story flag
   * `location:<id>:unlocked`. В Phase 1B новые локации будут разблокироваться
   * через флаги по результатам сюжетных триггеров.
   */
  private isUnlocked(loc: LocationDef): boolean {
    if (loc.unlockedByDefault) return true;
    return storyFlags.has(`location:${loc.id}:unlocked`);
  }

  /**
   * Раскладка локаций. Phase 1A: 1 location → центр. Phase 1B+: горизонтальная
   * раскладка с равным шагом по X, центрированная по высоте экрана.
   */
  private computeLocationPosition(
    idx: number,
    total: number,
    camW: number,
    camH: number,
  ): { x: number; y: number } {
    const cy = camH / 2;
    if (total === 1) {
      return { x: camW / 2, y: cy };
    }
    const margin = camW * 0.15;
    const usable = camW - margin * 2;
    const step = usable / (total - 1);
    return { x: margin + step * idx, y: cy };
  }

  private createLocationNode(loc: LocationDef, x: number, y: number): void {
    const d = DPR;
    const radius = NODE_RADIUS * d;

    const circle = this.add
      .circle(x, y, radius, NODE_FILL, 0.95)
      .setStrokeStyle(3 * d, NODE_STROKE)
      .setInteractive({ useHandCursor: true });

    const label = this.add
      .text(x, y, loc.name, {
        fontSize: `${18 * d}px`,
        color: NODE_LABEL_COLOR,
        fontFamily: FONT,
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    const visited = storyFlags.has(`location:${loc.id}:unlocked`) || loc.unlockedByDefault;
    if (visited) {
      this.add
        .text(x, y + radius + 16 * d, this.buildProgressLabel(loc), {
          fontSize: `${13 * d}px`,
          color: SUBTITLE_COLOR,
          fontFamily: FONT,
          fontStyle: "italic",
        })
        .setOrigin(0.5);
    }

    circle.on("pointerover", () => {
      circle.setFillStyle(NODE_FILL_HOVER, 1);
      label.setColor("#ffffff");
    });
    circle.on("pointerout", () => {
      circle.setFillStyle(NODE_FILL, 0.95);
      label.setColor(NODE_LABEL_COLOR);
    });
    circle.on("pointerdown", () => {
      sceneRouter.push(this, "LocationScene", { locationId: loc.id });
    });
  }

  /**
   * Подпись прогресса под локацией. Phase 1A читает только Lilana-флаги,
   * потому что Атриум — единственная локация. Это намеренно простое решение
   * — Phase 1B заменит универсальным реестром (LocationDef → progress key).
   */
  private buildProgressLabel(loc: LocationDef): string {
    if (loc.id !== "atrium") return "";
    if (storyFlags.get<boolean>("lilana:act4:done", false)) return "Лилана: арка завершена";
    if (storyFlags.get<boolean>("lilana:act2:done", false)) return "Лилана: 2/3 актов";
    if (storyFlags.get<boolean>("lilana:act1:done", false)) return "Лилана: 1/3 актов";
    return "";
  }

  private createBackButton(x: number, y: number, onClick: () => void): void {
    const d = DPR;
    const width = BACK_BUTTON_WIDTH * d;
    const height = BACK_BUTTON_HEIGHT * d;

    const bg = this.add
      .rectangle(x, y, width, height, BACK_BG, 0.95)
      .setStrokeStyle(2 * d, BACK_STROKE)
      .setInteractive({ useHandCursor: true });

    const text = this.add
      .text(x, y, "← В Hub", {
        fontSize: `${18 * d}px`,
        color: BACK_TEXT,
        fontFamily: FONT,
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    bg.on("pointerover", () => {
      bg.setFillStyle(BACK_BG_HOVER, 1);
      text.setColor("#e6c068");
    });
    bg.on("pointerout", () => {
      bg.setFillStyle(BACK_BG, 0.95);
      text.setColor(BACK_TEXT);
    });
    bg.on("pointerdown", onClick);
  }
}
