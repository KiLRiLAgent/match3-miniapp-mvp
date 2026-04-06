import Phaser from "phaser";
import { DPR } from "../../game/config";
import type { Emotion } from "../content/types";

const EMOTION_COLORS: Record<Emotion, number> = {
  neutral: 0x6e6e8e,
  cold: 0x4a6e8e,
  angry: 0x8e3e3e,
  surprised: 0xc8a868,
  seductive: 0x8e3e8e,
  happy: 0x6e8e4a,
  sad: 0x4a4a6e,
};

const STROKE_WIDTH = 3;
const STROKE_COLOR = 0xffffff;
const STROKE_ALPHA = 0.8;
const LETTER_SIZE_RATIO = 0.45;
const LETTER_COLOR = "#ffffff";
const LETTER_FONT = "'Exo 2', Arial, sans-serif";

export interface CharacterPortraitOptions {
  size: number;
  initial: string;
  emotion?: Emotion;
}

/**
 * Placeholder character portrait — colored circle with a single initial.
 * Phase 1A uses Graphics-only placeholders (no PNG assets). Container-based,
 * children via `new GameObject(scene, ...)` pattern.
 */
export class CharacterPortrait extends Phaser.GameObjects.Container {
  private circle: Phaser.GameObjects.Arc;
  private letter: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, x: number, y: number, opts: CharacterPortraitOptions) {
    super(scene, x, y);
    const radius = opts.size / 2;
    const color = EMOTION_COLORS[opts.emotion ?? "neutral"];

    this.circle = new Phaser.GameObjects.Arc(scene, 0, 0, radius, 0, 360, false, color, 1);
    this.circle.setStrokeStyle(STROKE_WIDTH * DPR, STROKE_COLOR, STROKE_ALPHA);

    this.letter = new Phaser.GameObjects.Text(scene, 0, 0, opts.initial, {
      fontSize: `${Math.floor(opts.size * LETTER_SIZE_RATIO)}px`,
      color: LETTER_COLOR,
      fontFamily: LETTER_FONT,
      fontStyle: "bold",
    });
    this.letter.setOrigin(0.5);

    this.add([this.circle, this.letter]);
    scene.add.existing(this);
  }

  setEmotion(emotion: Emotion): void {
    const color = EMOTION_COLORS[emotion] ?? EMOTION_COLORS.neutral;
    this.circle.setFillStyle(color);
  }
}
