/**
 * HubScene — заглушка v2 hub (Phase 0). Доказывает что lazy loading v2
 * работает и toggle обратно в v1 функционирует. Будет переписан в Phase 1
 * в полноценный экран "кампуса" с точками входа в StoryMap, Inventory,
 * CharacterRoster.
 *
 * Layout uses physical pixel coordinates from `this.cameras.main` (matches
 * BootScene convention). DPR multiplier is applied to font sizes and offsets
 * for crisp rendering on high-DPI screens. GAME_WIDTH/GAME_HEIGHT (CSS pixels)
 * are NOT used here — they don't match the canvas world size.
 */

import Phaser from "phaser";
import { DPR, SAFE_AREA } from "../../game/config";
import { setActiveMode } from "../../game/version";
import { gameState } from "../core/GameState";

const BG_COLOR = 0x1a0f2e;
const TITLE_COLOR = "#e6c068";
const SUBTITLE_COLOR = "#9f7fc7";
const BUTTON_BG = 0x3a2358;
const BUTTON_STROKE = 0xe6c068;
const BUTTON_TEXT = "#f4e4c1";

export class HubScene extends Phaser.Scene {
  constructor() {
    super("HubScene");
  }

  create() {
    const camW = this.cameras.main.width;
    const camH = this.cameras.main.height;
    const cx = camW / 2;
    const cy = camH / 2;
    const d = DPR;

    // Ensure SaveData is loaded — this is the first scene to actually use it
    const save = gameState.ensureLoaded();

    // Gothic-pastel background — fill the entire camera viewport
    this.add.rectangle(0, 0, camW, camH, BG_COLOR).setOrigin(0);

    // Title
    this.add
      .text(cx, cy - 140 * d, "Университет Падших", {
        fontSize: `${36 * d}px`,
        color: TITLE_COLOR,
        fontFamily: "'Exo 2', Arial, sans-serif",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 4 * d,
      })
      .setOrigin(0.5);

    // Beta tag
    this.add
      .text(cx, cy - 90 * d, "v2 · β · инфраструктура", {
        fontSize: `${18 * d}px`,
        color: SUBTITLE_COLOR,
        fontFamily: "'Exo 2', Arial, sans-serif",
        fontStyle: "italic",
      })
      .setOrigin(0.5);

    // Greeting with player name from save
    this.add
      .text(cx, cy - 40 * d, `Добро пожаловать, ${save.player.name}`, {
        fontSize: `${20 * d}px`,
        color: "#d4b8e8",
        fontFamily: "'Exo 2', Arial, sans-serif",
      })
      .setOrigin(0.5);

    // Placeholder body text
    const bodyLines = [
      "Сюжетные локации, диалоги и арки персонажей",
      "появятся в следующих фазах разработки.",
      "",
      "Пока что — только каркас сохранений.",
    ];
    this.add
      .text(cx, cy + 30 * d, bodyLines.join("\n"), {
        fontSize: `${16 * d}px`,
        color: "#b8a8d0",
        fontFamily: "'Exo 2', Arial, sans-serif",
        align: "center",
        lineSpacing: 6 * d,
      })
      .setOrigin(0.5);

    // "Back to v1" button — anchored to bottom of camera, respecting safe area
    this.createBackButton(cx, camH - 80 * d - SAFE_AREA.bottom * d);
  }

  private createBackButton(x: number, y: number) {
    const d = DPR;
    const buttonWidth = 260 * d;
    const buttonHeight = 56 * d;

    const bg = this.add
      .rectangle(x, y, buttonWidth, buttonHeight, BUTTON_BG, 0.95)
      .setStrokeStyle(2 * d, BUTTON_STROKE)
      .setInteractive({ useHandCursor: true });

    const label = this.add
      .text(x, y, "← Вернуться в v1 (Арена)", {
        fontSize: `${18 * d}px`,
        color: BUTTON_TEXT,
        fontFamily: "'Exo 2', Arial, sans-serif",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    bg.on("pointerover", () => {
      bg.setFillStyle(0x4a2d6e, 1);
      label.setColor("#ffffff");
    });
    bg.on("pointerout", () => {
      bg.setFillStyle(BUTTON_BG, 0.95);
      label.setColor(BUTTON_TEXT);
    });
    bg.on("pointerup", () => {
      setActiveMode("v1");
      window.location.reload();
    });
  }
}
