import Phaser from "phaser";
import { INTRO_ANIMATION } from "../game/animations";
import { tweenPromise } from "../utils/helpers";

interface TextHighlight {
  word: string;
  color: string;
}

interface SpeechBubbleConfig {
  text: string;
  maxWidth?: number;
  tailDirection?: "down" | "up" | "none";
  backgroundColor?: number;
  textColor?: string;
  fontSize?: string;
  fontFamily?: string;
  fontStyle?: string;
  padding?: number;
  highlights?: TextHighlight[];
}

const DEFAULT_CONFIG = {
  maxWidth: 300,
  tailDirection: "down" as const,
  backgroundColor: 0xffffff,
  textColor: "#222222",
  fontSize: "24px",
  fontFamily: "'Exo 2', Arial, sans-serif",
  fontStyle: "500",
  padding: 18,
};

const CORNER_RADIUS = 12;
const TAIL_SIZE = 12;

export class SpeechBubble extends Phaser.GameObjects.Container {
  private bubble: Phaser.GameObjects.Graphics;
  private textObj: Phaser.GameObjects.Text;
  private config: Required<Omit<SpeechBubbleConfig, "highlights">> & Pick<SpeechBubbleConfig, "highlights">;

  constructor(scene: Phaser.Scene, x: number, y: number, config: SpeechBubbleConfig) {
    super(scene, x, y);

    this.config = { ...DEFAULT_CONFIG, ...config };
    this.bubble = scene.add.graphics();
    this.textObj = scene.add.text(0, 0, this.config.text, {
      fontSize: this.config.fontSize,
      fontFamily: this.config.fontFamily,
      fontStyle: this.config.fontStyle,
      color: this.config.textColor,
      wordWrap: { width: this.config.maxWidth - this.config.padding * 2 },
      align: "center",
    });
    this.textObj.setOrigin(0.5);

    this.drawBubble();
    this.add([this.bubble, this.textObj]);

    if (config.highlights) {
      this.applyHighlights(config.highlights);
    }

    scene.add.existing(this);
    this.setAlpha(0);
  }

  private applyHighlights(highlights: TextHighlight[]): void {
    const fullText = this.config.text;
    const style = this.textObj.style;
    const wrapWidth = this.config.maxWidth - this.config.padding * 2;

    for (const { word, color } of highlights) {
      if (!fullText.includes(word)) continue;

      // Measure with same wrapping to find word position in rendered lines
      const measure = this.scene.add.text(0, 0, fullText, {
        fontSize: style.fontSize,
        fontFamily: style.fontFamily,
        fontStyle: style.fontStyle,
        wordWrap: { width: wrapWidth },
        align: "center",
      }).setOrigin(0.5);

      // Search for the word directly in wrapped lines (avoids \n offset issues)
      const wrapped = measure.getWrappedText(fullText);
      let targetLine = 0;
      let charInLine = 0;
      for (let l = 0; l < wrapped.length; l++) {
        const pos = wrapped[l].indexOf(word);
        if (pos >= 0) {
          targetLine = l;
          charInLine = pos;
          break;
        }
      }

      const lineHeight = measure.height / wrapped.length;
      const lineY = (targetLine - (wrapped.length - 1) / 2) * lineHeight;

      // Measure x offset
      const lineText = wrapped[targetLine];
      const beforeOnLine = lineText.substring(0, charInLine);
      const tempBefore = this.scene.add.text(0, 0, beforeOnLine, {
        fontSize: style.fontSize,
        fontFamily: style.fontFamily,
        fontStyle: style.fontStyle,
      });
      const tempWord = this.scene.add.text(0, 0, word, {
        fontSize: style.fontSize,
        fontFamily: style.fontFamily,
        fontStyle: style.fontStyle,
      });
      const tempLine = this.scene.add.text(0, 0, lineText, {
        fontSize: style.fontSize,
        fontFamily: style.fontFamily,
        fontStyle: style.fontStyle,
      });
      const wordX = -tempLine.width / 2 + tempBefore.width + tempWord.width / 2;

      const overlay = this.scene.add.text(wordX, lineY, word, {
        fontSize: style.fontSize as string,
        fontFamily: style.fontFamily as string,
        fontStyle: style.fontStyle as string,
        color,
      }).setOrigin(0.5);
      this.add(overlay);

      measure.destroy();
      tempBefore.destroy();
      tempWord.destroy();
      tempLine.destroy();
    }
  }

  private drawBubble(): void {
    const { padding, backgroundColor, tailDirection } = this.config;
    const textBounds = this.textObj.getBounds();
    const bubbleWidth = Math.max(textBounds.width + padding * 2, 100);
    const bubbleHeight = textBounds.height + padding * 2;
    const halfWidth = bubbleWidth / 2;
    const halfHeight = bubbleHeight / 2;

    this.bubble.clear();
    this.bubble.fillStyle(backgroundColor, 1);
    this.bubble.lineStyle(2, 0x333333, 0.3);

    this.bubble.fillRoundedRect(-halfWidth, -halfHeight, bubbleWidth, bubbleHeight, CORNER_RADIUS);
    this.bubble.strokeRoundedRect(-halfWidth, -halfHeight, bubbleWidth, bubbleHeight, CORNER_RADIUS);

    // Draw tail pointing up or down (skip if "none")
    if (tailDirection !== "none") {
      this.bubble.fillStyle(backgroundColor, 1);
      const tailY = tailDirection === "down" ? halfHeight : -halfHeight;
      const tailOffset = tailDirection === "down" ? -2 : 2;
      const tailTip = tailDirection === "down" ? TAIL_SIZE : -TAIL_SIZE;

      this.bubble.fillTriangle(
        -TAIL_SIZE / 2, tailY + tailOffset,
        TAIL_SIZE / 2, tailY + tailOffset,
        0, tailY + tailTip
      );
    }
  }

  fadeIn(duration: number = INTRO_ANIMATION.speechBubbleFadeIn): Promise<void> {
    this.setScale(0.8);
    return tweenPromise(this.scene, {
      targets: this,
      alpha: 1,
      scale: 1,
      duration,
      ease: "Back.easeOut",
    });
  }

  async fadeOut(duration: number = INTRO_ANIMATION.speechBubbleFadeIn): Promise<void> {
    await tweenPromise(this.scene, {
      targets: this,
      alpha: 0,
      scale: 0.8,
      duration,
      ease: "Quad.easeIn",
    });
    this.destroy();
  }

}
