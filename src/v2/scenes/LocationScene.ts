/**
 * LocationScene — отображение конкретной локации с её NPC hotspot'ами.
 *
 * Получает `locationId` через `init(data)`, читает `LocationDef` из реестра
 * `LOCATIONS`, рендерит placeholder фон (цветной прямоугольник + label) и
 * расставляет hotspot'ы по нормализованным координатам `position {x, y}`
 * (0..1 относительно camera viewport).
 *
 * Resolution диалога для NPC hotspot:
 *   1. Фильтруем `hotspot.dialogues` по `condition` через `conditionEval`.
 *   2. Сортируем по `priority` desc (REFINEMENT 4).
 *   3. Берём первую опцию, push в DialogueScene с её `dialogueId`.
 *   4. Если ничего не подошло — показываем "нечего сказать" toast.
 *
 * NPC hotspot рендерится через `CharacterPortrait` placeholder (круг с
 * первой буквой имени), под ним подпись label.
 *
 * v2-isolation: импорты только из `src/v2/*` + `src/game/config`.
 */

import Phaser from "phaser";
import { DPR, SAFE_AREA } from "../../game/config";
import { sceneRouter } from "../core/SceneRouter";
import { gameState } from "../core/GameState";
import { storyFlags } from "../systems/StoryFlags";
import { conditionEval } from "../systems/conditionEval";
import { LOCATIONS } from "../content/locations";
import { CHARACTERS } from "../content/characters";
import { CharacterPortrait } from "../ui/CharacterPortrait";
import type { LocationHotspot } from "../content/types";

const FONT = "'Exo 2', Arial, sans-serif";
const TITLE_COLOR = "#e6c068";
const DESC_COLOR = "#b8a8d0";
const HOTSPOT_LABEL_COLOR = "#f4e4c1";
const TOAST_COLOR = "#9f7fc7";
const FALLBACK_BG_COLOR = 0x222244;

const BACK_BG = 0x2a1845;
const BACK_BG_HOVER = 0x3a2358;
const BACK_STROKE = 0x9f7fc7;
const BACK_TEXT = "#b8a8d0";
const BACK_BUTTON_WIDTH = 200;
const BACK_BUTTON_HEIGHT = 48;

const HOTSPOT_PORTRAIT_SIZE = 100;
const HOTSPOT_HALO_RADIUS = 64;
const HOTSPOT_HALO_FILL = 0x6e4ac8;
const HOTSPOT_HALO_FILL_HOVER = 0x9f7fc7;
const HOTSPOT_HALO_STROKE = 0xffffff;

const TOAST_DURATION_MS = 1500;
const TOAST_FADE_MS = 300;

/** Placeholder location background colors per LocationDef.id. */
const LOCATION_BG_COLORS: Record<string, number> = {
  atrium: 0x2a1f4e,
};

interface LocationSceneData {
  locationId?: string;
}

export class LocationScene extends Phaser.Scene {
  private locationId = "";

  constructor() {
    super("LocationScene");
  }

  init(data?: LocationSceneData) {
    this.locationId = data?.locationId ?? "";
  }

  create() {
    const loc = LOCATIONS[this.locationId];
    if (!loc) {
      console.error(`LocationScene: unknown locationId "${this.locationId}"`);
      sceneRouter.pop(this);
      return;
    }

    storyFlags.markLocationVisited(this.locationId);

    const camW = this.cameras.main.width;
    const camH = this.cameras.main.height;
    const cx = camW / 2;
    const d = DPR;

    const bgColor = LOCATION_BG_COLORS[loc.id] ?? FALLBACK_BG_COLOR;
    this.add.rectangle(0, 0, camW, camH, bgColor).setOrigin(0);

    this.add
      .text(cx, 70 * d + SAFE_AREA.top * d, loc.name, {
        fontSize: `${28 * d}px`,
        color: TITLE_COLOR,
        fontFamily: FONT,
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 3 * d,
      })
      .setOrigin(0.5);

    this.add
      .text(cx, 116 * d + SAFE_AREA.top * d, loc.description, {
        fontSize: `${14 * d}px`,
        color: DESC_COLOR,
        fontFamily: FONT,
        fontStyle: "italic",
        align: "center",
        wordWrap: { width: camW - 60 * d },
      })
      .setOrigin(0.5, 0);

    for (const hotspot of loc.hotspots) {
      this.createHotspot(hotspot, camW, camH);
    }

    const backY = camH - 70 * d - SAFE_AREA.bottom * d;
    this.createBackButton(cx, backY, () => sceneRouter.pop(this));
  }

  private createHotspot(
    hotspot: LocationHotspot,
    camW: number,
    camH: number,
  ): void {
    const d = DPR;
    const x = hotspot.position.x * camW;
    const y = hotspot.position.y * camH;
    const haloRadius = HOTSPOT_HALO_RADIUS * d;

    const halo = this.add
      .circle(x, y, haloRadius, HOTSPOT_HALO_FILL, 0.45)
      .setStrokeStyle(2 * d, HOTSPOT_HALO_STROKE, 0.8)
      .setInteractive({ useHandCursor: true });

    const character = hotspot.characterId ? CHARACTERS[hotspot.characterId] : undefined;
    const initial = character?.name.charAt(0) ?? hotspot.label.charAt(0);
    const portrait = new CharacterPortrait(this, x, y, {
      size: HOTSPOT_PORTRAIT_SIZE * d,
      initial,
      emotion: "neutral",
    });

    const label = this.add
      .text(x, y + haloRadius + 18 * d, hotspot.label, {
        fontSize: `${18 * d}px`,
        color: HOTSPOT_LABEL_COLOR,
        fontFamily: FONT,
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    halo.on("pointerover", () => {
      halo.setFillStyle(HOTSPOT_HALO_FILL_HOVER, 0.6);
      label.setColor("#ffffff");
    });
    halo.on("pointerout", () => {
      halo.setFillStyle(HOTSPOT_HALO_FILL, 0.45);
      label.setColor(HOTSPOT_LABEL_COLOR);
    });
    halo.on("pointerup", () => this.handleHotspotTap(hotspot));

    // Portrait sits on top of halo — make it non-interactive so all taps land on halo.
    portrait.setDepth(halo.depth + 0.1);
  }

  private handleHotspotTap(hotspot: LocationHotspot): void {
    const dialogueId = this.resolveDialogueId(hotspot);
    if (!dialogueId) {
      this.showNoDialogueToast();
      return;
    }
    sceneRouter.push(this, "DialogueScene", { dialogueId });
  }

  /**
   * Declarative resolution per REFINEMENT 4 / DECISIONS section 15.
   *
   * Filter `hotspot.dialogues` by `condition` (using `conditionEval` against
   * the live SaveData snapshot), sort by `priority` descending, return the
   * first match. Returns null if no option satisfies its gate.
   */
  private resolveDialogueId(hotspot: LocationHotspot): string | null {
    const save = gameState.get();
    const characterId = hotspot.characterId;
    const matching = hotspot.dialogues.filter(
      (opt) => !opt.condition || conditionEval(opt.condition, save, characterId),
    );
    if (matching.length === 0) return null;
    matching.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    return matching[0].dialogueId;
  }

  private showNoDialogueToast(): void {
    const camW = this.cameras.main.width;
    const camH = this.cameras.main.height;
    const d = DPR;
    const text = this.add
      .text(camW / 2, camH / 2, "Сейчас здесь нечего сказать.", {
        fontSize: `${20 * d}px`,
        color: TOAST_COLOR,
        fontFamily: FONT,
        fontStyle: "italic",
        backgroundColor: "#1a0f2e",
        padding: { x: 18 * d, y: 12 * d },
      })
      .setOrigin(0.5)
      .setAlpha(0);

    this.tweens.add({
      targets: text,
      alpha: 1,
      duration: TOAST_FADE_MS,
      yoyo: true,
      hold: TOAST_DURATION_MS,
      onComplete: () => text.destroy(),
    });
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
      .text(x, y, "← На карту", {
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
    bg.on("pointerup", onClick);
  }
}
