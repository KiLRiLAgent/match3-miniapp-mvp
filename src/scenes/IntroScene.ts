import Phaser from "phaser";
import { ASSET_KEYS } from "../game/assets";
import { GAME_WIDTH, GAME_HEIGHT } from "../game/config";
import { INTRO_ANIMATION, INTRO_EASING } from "../game/animations";
import { SpeechBubble } from "../ui/SpeechBubble";
import { wait, tweenPromise } from "../utils/helpers";

const DIALOGUE = {
  first: "Как ты посмел бросить вызов Сафире?",
  second: "Ты лишь искра, которую я сейчас растопчу",
  final: "Ты сгоришь в пламени Бездны!",
};

export class IntroScene extends Phaser.Scene {
  private background!: Phaser.GameObjects.Image;
  private safira!: Phaser.GameObjects.Image;
  private speechBubble?: SpeechBubble;
  private vsLogo?: Phaser.GameObjects.Image;
  private sceneCenter!: { x: number; y: number };
  private scaleFactor!: number;

  constructor() {
    super("IntroScene");
  }

  create() {
    this.cameras.main.setBackgroundColor("#000000");
    this.sceneCenter = { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2 };
    this.scaleFactor = 1 / INTRO_ANIMATION.initialZoom;

    this.cameras.main.setZoom(INTRO_ANIMATION.initialZoom);
    this.cameras.main.centerOn(this.sceneCenter.x, this.sceneCenter.y);

    this.runIntroSequence();
  }

  private async runIntroSequence() {
    await this.step1_backgroundAppear();
    await this.step2_safiraAppear();
    await this.step3_firstDialogue();
    await this.step4_poseChangeDialogue();
    await this.step5_zoomAndVS();
    await this.step6_transitionToGame();
  }

  private async step1_backgroundAppear(): Promise<void> {
    this.background = this.add.image(this.sceneCenter.x, this.sceneCenter.y, ASSET_KEYS.intro.background);

    const scaleX = (GAME_WIDTH * this.scaleFactor) / this.background.width;
    const scaleY = (GAME_HEIGHT * this.scaleFactor) / this.background.height;
    this.background.setScale(Math.max(scaleX, scaleY));
    this.background.setAlpha(0);
    this.background.setDepth(0);

    return tweenPromise(this, {
      targets: this.background,
      alpha: 1,
      duration: INTRO_ANIMATION.backgroundFadeIn,
      ease: INTRO_EASING.fade,
    });
  }

  private getSafiraTargetScale(): number {
    const targetHeight = GAME_HEIGHT * this.scaleFactor * 0.7;
    return targetHeight / this.safira.height;
  }

  private async step2_safiraAppear(): Promise<void> {
    this.safira = this.add.image(
      this.sceneCenter.x,
      GAME_HEIGHT * this.scaleFactor * 0.45,
      ASSET_KEYS.boss.normal
    );

    const safiraScale = this.getSafiraTargetScale();
    this.safira.setScale(safiraScale * 0.95);
    this.safira.setAlpha(0);
    this.safira.setDepth(1);

    return tweenPromise(this, {
      targets: this.safira,
      alpha: 1,
      scale: safiraScale,
      duration: INTRO_ANIMATION.safiraFadeIn,
      ease: INTRO_EASING.scale,
    });
  }

  private async step3_firstDialogue(): Promise<void> {
    const bubbleY = this.safira.y + this.safira.displayHeight * 0.35;

    this.speechBubble = new SpeechBubble(this, this.sceneCenter.x, bubbleY, {
      text: DIALOGUE.first,
      tailDirection: "up",
      maxWidth: 300,
    });
    this.speechBubble.setDepth(10);

    await this.speechBubble.fadeIn();
    await wait(this, INTRO_ANIMATION.speechBubbleHold);
  }

  private async step4_poseChangeDialogue(): Promise<void> {
    const flash = this.add.rectangle(
      this.sceneCenter.x,
      this.sceneCenter.y,
      GAME_WIDTH * 2,
      GAME_HEIGHT * 2,
      0x000000
    );
    flash.setAlpha(0);
    flash.setDepth(5);

    const halfDuration = INTRO_ANIMATION.poseTransitionDuration / 2;

    await tweenPromise(this, {
      targets: flash,
      alpha: 0.8,
      duration: halfDuration,
      ease: "Quad.easeIn",
    });

    this.safira.setTexture(ASSET_KEYS.boss.battle);
    this.safira.setScale(this.getSafiraTargetScale());
    this.speechBubble?.setText(DIALOGUE.second);

    await tweenPromise(this, {
      targets: flash,
      alpha: 0,
      duration: halfDuration,
      ease: "Quad.easeOut",
    });
    flash.destroy();

    await wait(this, INTRO_ANIMATION.speechBubbleHold);

    if (this.speechBubble) {
      await this.speechBubble.fadeOut();
      this.speechBubble = undefined;
    }
  }

  private async step5_zoomAndVS(): Promise<void> {
    this.vsLogo = this.add.image(this.sceneCenter.x, this.sceneCenter.y, ASSET_KEYS.intro.vsLogo);
    this.vsLogo.setScale(0.8);
    this.vsLogo.setAlpha(0);
    this.vsLogo.setDepth(20);

    const zoomPromise = tweenPromise(this, {
      targets: this.cameras.main,
      zoom: INTRO_ANIMATION.finalZoom,
      duration: INTRO_ANIMATION.cameraZoomDuration,
      ease: INTRO_EASING.zoom,
    });

    await wait(this, 500);

    const vsPromise = tweenPromise(this, {
      targets: this.vsLogo,
      alpha: 1,
      scale: 1,
      duration: INTRO_ANIMATION.vsFadeIn,
      ease: INTRO_EASING.scale,
    });

    await Promise.all([zoomPromise, vsPromise]);

    this.tweens.add({
      targets: this.vsLogo,
      scale: 1.05,
      duration: 300,
      yoyo: true,
      repeat: 2,
      ease: "Sine.easeInOut",
    });

    await wait(this, INTRO_ANIMATION.vsHold);
  }

  private async step6_transitionToGame(): Promise<void> {
    if (this.vsLogo) {
      await tweenPromise(this, {
        targets: this.vsLogo,
        alpha: 0,
        scale: 1.2,
        duration: INTRO_ANIMATION.vsFadeOut,
        ease: INTRO_EASING.fade,
      });
      this.vsLogo.destroy();
    }

    this.scene.start("GameScene", { fromIntro: true, finalDialogue: DIALOGUE.final });
  }
}
