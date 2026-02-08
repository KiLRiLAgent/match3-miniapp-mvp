import Phaser from "phaser";
import { INTRO_ANIMATION } from "../game/animations";
import { tweenPromise } from "../utils/helpers";

export interface SpeechBubbleConfig {
  text: string;
  maxWidth?: number;
  tailDirection?: "down" | "up";
  backgroundColor?: number;
  textColor?: string;
  fontSize?: string;
  fontStyle?: string;
  padding?: number;
}

const DEFAULT_CONFIG = {
  maxWidth: 300,
  tailDirection: "down" as const,
  backgroundColor: 0xffffff,
  textColor: "#222222",
  fontSize: "24px",
  fontStyle: "500",
  padding: 18,
};

const CORNER_RADIUS = 12;
const TAIL_SIZE = 12;

export class SpeechBubble extends Phaser.GameObjects.Container {
  private bubble: Phaser.GameObjects.Graphics;
  private textObj: Phaser.GameObjects.Text;
  private config: Required<SpeechBubbleConfig>;

  constructor(scene: Phaser.Scene, x: number, y: number, config: SpeechBubbleConfig) {
    super(scene, x, y);

    this.config = { ...DEFAULT_CONFIG, ...config };
    this.bubble = scene.add.graphics();
    this.textObj = scene.add.text(0, 0, this.config.text, {
      fontSize: this.config.fontSize,
      fontFamily: "Arial, sans-serif",
      fontStyle: this.config.fontStyle,
      color: this.config.textColor,
      wordWrap: { width: this.config.maxWidth - this.config.padding * 2 },
      align: "center",
    });
    this.textObj.setOrigin(0.5);

    this.drawBubble();
    this.add([this.bubble, this.textObj]);

    scene.add.existing(this);
    this.setAlpha(0);
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

    // Draw tail pointing up or down
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

  setText(text: string): void {
    this.config.text = text;
    this.textObj.setText(text);
    this.drawBubble();
  }
}
