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
  /**
   * Optional emotion → texture key mapping. If a key is provided AND the
   * texture exists in Phaser cache, the portrait renders the real Image
   * (with aspect-preserving scale). Missing emotions fall back to neutral.
   * If no textures map is provided, falls back to placeholder Arc + letter.
   */
  textures?: Partial<Record<Emotion, string>>;
}

/**
 * Character portrait component. Two render modes:
 *  - **Image mode**: real PNG portrait via `textures` map. Each emotion swap
 *    re-textures the same Image GameObject (cheap).
 *  - **Placeholder mode**: colored Arc + initial letter. Used when no
 *    `textures` map is provided OR when the requested texture is missing
 *    from the Phaser cache.
 *
 * Render mode is locked at construction time — switching mid-life is not
 * supported (it would require destroying and re-creating children).
 *
 * Container-based, children created via `new Phaser.GameObjects.X(scene, ...)`
 * per .conventions/gold-standards/ui-component.ts.
 */
export class CharacterPortrait extends Phaser.GameObjects.Container {
  private readonly portraitSize: number;
  private readonly textureMap?: Partial<Record<Emotion, string>>;
  private circle?: Phaser.GameObjects.Arc;
  private letter?: Phaser.GameObjects.Text;
  private image?: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, x: number, y: number, opts: CharacterPortraitOptions) {
    super(scene, x, y);
    this.portraitSize = opts.size;
    this.textureMap = opts.textures;

    const initialEmotion = opts.emotion ?? "neutral";
    const initialTexture = this.resolveTexture(initialEmotion);

    if (initialTexture) {
      this.createImage(initialTexture);
    } else {
      this.createPlaceholder(opts.initial, initialEmotion);
    }

    scene.add.existing(this);
  }

  setEmotion(emotion: Emotion): void {
    if (this.image) {
      const textureKey = this.resolveTexture(emotion);
      if (textureKey) {
        this.image.setTexture(textureKey);
        this.applyImageScale(textureKey);
      }
      return;
    }
    if (this.circle) {
      const color = EMOTION_COLORS[emotion] ?? EMOTION_COLORS.neutral;
      this.circle.setFillStyle(color);
    }
  }

  /**
   * Resolve an emotion to an actually-loaded texture key. Returns undefined
   * if no texture map is provided OR if neither the requested emotion nor
   * the neutral fallback exists in the Phaser cache.
   */
  private resolveTexture(emotion: Emotion): string | undefined {
    if (!this.textureMap) return undefined;
    const requested = this.textureMap[emotion];
    if (requested && this.scene.textures.exists(requested)) {
      return requested;
    }
    const fallback = this.textureMap.neutral;
    if (fallback && this.scene.textures.exists(fallback)) {
      return fallback;
    }
    return undefined;
  }

  private createImage(textureKey: string): void {
    this.image = new Phaser.GameObjects.Image(this.scene, 0, 0, textureKey);
    this.applyImageScale(textureKey);
    this.add(this.image);
  }

  /**
   * Aspect-preserving fit into a square `portraitSize` box. Uses the larger
   * dimension as the divisor so the image is contained, never cropped.
   */
  private applyImageScale(textureKey: string): void {
    if (!this.image) return;
    const tex = this.scene.textures.get(textureKey);
    const src = tex.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
    const longest = Math.max(src.width, src.height);
    if (longest <= 0) return;
    const scale = this.portraitSize / longest;
    this.image.setScale(scale);
  }

  private createPlaceholder(initial: string, emotion: Emotion): void {
    const radius = this.portraitSize / 2;
    const color = EMOTION_COLORS[emotion];

    this.circle = new Phaser.GameObjects.Arc(
      this.scene,
      0,
      0,
      radius,
      0,
      360,
      false,
      color,
      1,
    );
    this.circle.setStrokeStyle(STROKE_WIDTH * DPR, STROKE_COLOR, STROKE_ALPHA);

    this.letter = new Phaser.GameObjects.Text(this.scene, 0, 0, initial, {
      fontSize: `${Math.floor(this.portraitSize * LETTER_SIZE_RATIO)}px`,
      color: LETTER_COLOR,
      fontFamily: LETTER_FONT,
      fontStyle: "bold",
    });
    this.letter.setOrigin(0.5);

    this.add([this.circle, this.letter]);
  }
}
