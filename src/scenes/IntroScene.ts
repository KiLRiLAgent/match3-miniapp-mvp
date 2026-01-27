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
  private vsContainer?: Phaser.GameObjects.Container;
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
    // Позиция бабла ближе к талии Сафиры (выше чем раньше)
    const bubbleY = this.safira.y + this.safira.displayHeight * 0.05;

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
    // Создаём контейнер для VS экрана
    this.vsContainer = this.add.container(this.sceneCenter.x, this.sceneCenter.y);
    this.vsContainer.setDepth(20);
    this.vsContainer.setAlpha(0);

    // Текст "Сафира: Пламя Бездны" сверху
    const bossNameText = this.add.text(0, -120, "Сафира: Пламя Бездны", {
      fontSize: "24px",
      fontFamily: "Arial, sans-serif",
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 4,
    }).setOrigin(0.5);

    // VS логотип (меньше размером)
    this.vsLogo = this.add.image(0, -40, ASSET_KEYS.intro.vsLogo);
    this.vsLogo.setScale(0.5);

    // Текст "Игрок" под VS
    const playerNameText = this.add.text(0, 30, "Игрок", {
      fontSize: "22px",
      fontFamily: "Arial, sans-serif",
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 4,
    }).setOrigin(0.5);

    // Золотая рамка для игрока
    const frameWidth = 140;
    const frameHeight = 180;
    const frameY = 160;

    // Золотой фон рамки
    const frameBg = this.add.graphics();
    frameBg.fillStyle(0xc9a227, 1);
    frameBg.fillRoundedRect(-frameWidth / 2 - 6, frameY - frameHeight / 2 - 6, frameWidth + 12, frameHeight + 12, 8);
    frameBg.fillStyle(0x1a1a2e, 1);
    frameBg.fillRoundedRect(-frameWidth / 2, frameY - frameHeight / 2, frameWidth, frameHeight, 6);

    // Аватар игрока
    const playerAvatar = this.add.image(0, frameY, ASSET_KEYS.player.avatar);
    const avatarScale = Math.min(
      (frameWidth - 16) / playerAvatar.width,
      (frameHeight - 16) / playerAvatar.height
    );
    playerAvatar.setScale(avatarScale);

    // Добавляем всё в контейнер
    this.vsContainer.add([frameBg, bossNameText, this.vsLogo, playerNameText, playerAvatar]);

    // Зум камеры
    const zoomPromise = tweenPromise(this, {
      targets: this.cameras.main,
      zoom: INTRO_ANIMATION.finalZoom,
      duration: INTRO_ANIMATION.cameraZoomDuration,
      ease: INTRO_EASING.zoom,
    });

    await wait(this, 500);

    // Показываем VS контейнер
    const vsPromise = tweenPromise(this, {
      targets: this.vsContainer,
      alpha: 1,
      duration: INTRO_ANIMATION.vsFadeIn,
      ease: INTRO_EASING.fade,
    });

    await Promise.all([zoomPromise, vsPromise]);

    // Пульсация VS лого
    this.tweens.add({
      targets: this.vsLogo,
      scale: 0.55,
      duration: 300,
      yoyo: true,
      repeat: 2,
      ease: "Sine.easeInOut",
    });

    await wait(this, INTRO_ANIMATION.vsHold);
  }

  private async step6_transitionToGame(): Promise<void> {
    if (this.vsContainer) {
      await tweenPromise(this, {
        targets: this.vsContainer,
        alpha: 0,
        duration: INTRO_ANIMATION.vsFadeOut,
        ease: INTRO_EASING.fade,
      });
      this.vsContainer.destroy();
    }

    this.scene.start("GameScene", { fromIntro: true, finalDialogue: DIALOGUE.final });
  }
}
