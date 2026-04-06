import Phaser from "phaser";
import { DPR } from "../../game/config";

const BTN_BG = 0x2a2358;
const BTN_BG_HOVER = 0x3a3078;
const BTN_STROKE = 0x6e4ac8;
const BTN_STROKE_WIDTH = 2;
const BTN_BG_ALPHA = 0.95;
const BTN_TEXT_COLOR = "#e6d4ff";
const BTN_TEXT_FONT_SIZE = 16;
const BTN_TEXT_FONT = "'Exo 2', Arial, sans-serif";
const BTN_TEXT_PADDING = 20;

export interface DialogueChoiceButtonOptions {
  width: number;
  height: number;
  text: string;
  onClick: () => void;
}

/**
 * Container-based button for dialogue choices. Children created via
 * `new Phaser.GameObjects.X(scene, ...)` (NOT `scene.add.*`) per spec —
 * keeps all rendering owned by the Container, no orphan scene-level objects.
 * Interactive area uses an explicit Rectangle hitArea (gold-standards/ui-component.ts).
 */
export class DialogueChoiceButton extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, x: number, y: number, opts: DialogueChoiceButtonOptions) {
    super(scene, x, y);

    const d = DPR;
    this.bg = new Phaser.GameObjects.Rectangle(
      scene,
      0,
      0,
      opts.width,
      opts.height,
      BTN_BG,
      BTN_BG_ALPHA,
    );
    this.bg.setStrokeStyle(BTN_STROKE_WIDTH * d, BTN_STROKE);

    const label = new Phaser.GameObjects.Text(scene, 0, 0, opts.text, {
      fontSize: `${BTN_TEXT_FONT_SIZE * d}px`,
      color: BTN_TEXT_COLOR,
      fontFamily: BTN_TEXT_FONT,
      fontStyle: "bold",
      align: "center",
      wordWrap: { width: opts.width - BTN_TEXT_PADDING * d },
    });
    label.setOrigin(0.5);

    this.add([this.bg, label]);
    scene.add.existing(this);

    // Make the bg Rectangle directly interactive — covers the full visible
    // area without relying on Container-local hitArea translation, which
    // can mis-detect taps near edges on some Phaser/DPR combinations.
    this.setSize(opts.width, opts.height);
    this.bg.setInteractive({ useHandCursor: true });
    this.bg.on("pointerover", () => this.bg.setFillStyle(BTN_BG_HOVER, BTN_BG_ALPHA));
    this.bg.on("pointerout", () => this.bg.setFillStyle(BTN_BG, BTN_BG_ALPHA));
    this.bg.on("pointerdown", () => opts.onClick());
  }
}
