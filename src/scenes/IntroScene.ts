import Phaser from "phaser";
import { ASSET_KEYS } from "../game/assets";
import { GAME_WIDTH, GAME_HEIGHT, UI_LAYOUT } from "../game/config";
import { INTRO_ANIMATION, INTRO_EASING } from "../game/animations";
import { SpeechBubble } from "../ui/SpeechBubble";
import { wait, tweenPromise } from "../utils/helpers";

// Диалоги с намеренными переносами строк для акцента
const DIALOGUE = {
  first: "Как ты посмел\nбросить вызов Сафире?",
  second: "Ты лишь искра,\nкоторую я сейчас растопчу",
  final: "Ты сгоришь в пламени Бездны!",
};

export class IntroScene extends Phaser.Scene {
  private background!: Phaser.GameObjects.Image;
  private safira!: Phaser.GameObjects.Image;
  private speechBubble?: SpeechBubble;
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

  // Сафира сразу в игровой позиции (верх экрана, как в GameScene)
  private getGameplayPosition(): { x: number; y: number; scale: number; originY: number } {
    const L = UI_LAYOUT;
    // В GameScene босс: x = GAME_WIDTH/2, y = 0, origin(0.5, 0)
    // scale = max(GAME_WIDTH/width, bossImageHeight/height) для cover
    const imgWidth = this.textures.get(ASSET_KEYS.boss.normal).getSourceImage().width;
    const imgHeight = this.textures.get(ASSET_KEYS.boss.normal).getSourceImage().height;
    const scaleX = GAME_WIDTH / imgWidth;
    const scaleY = L.bossImageHeight / imgHeight;
    const scale = Math.max(scaleX, scaleY);

    return {
      x: GAME_WIDTH / 2,
      y: 0,
      scale,
      originY: 0,
    };
  }

  private async step2_safiraAppear(): Promise<void> {
    // Сафира сразу в игровой позиции
    const gameplayPos = this.getGameplayPosition();

    this.safira = this.add.image(gameplayPos.x, gameplayPos.y, ASSET_KEYS.boss.normal);
    this.safira.setOrigin(0.5, gameplayPos.originY);
    this.safira.setScale(gameplayPos.scale * 0.95);
    this.safira.setAlpha(0);
    this.safira.setDepth(1);

    return tweenPromise(this, {
      targets: this.safira,
      alpha: 1,
      scale: gameplayPos.scale,
      duration: INTRO_ANIMATION.safiraFadeIn,
      ease: INTRO_EASING.scale,
    });
  }

  private async step3_firstDialogue(): Promise<void> {
    // Позиция бабла - под Сафирой (с учетом зума)
    const bubbleY = this.safira.y + this.safira.displayHeight + 40;

    // Первый бабл - меньший размер (короткая фраза)
    this.speechBubble = new SpeechBubble(this, this.sceneCenter.x, bubbleY, {
      text: DIALOGUE.first,
      tailDirection: "up",
      maxWidth: 280,
      fontSize: "22px",
    });
    this.speechBubble.setDepth(10);

    await this.speechBubble.fadeIn();
    await wait(this, INTRO_ANIMATION.speechBubbleHold);
  }

  private async step4_poseChangeDialogue(): Promise<void> {
    const halfDuration = INTRO_ANIMATION.poseTransitionDuration / 2;

    // Фейдим ТОЛЬКО Сафиру и бабл, не весь экран
    await Promise.all([
      tweenPromise(this, {
        targets: this.safira,
        alpha: 0,
        duration: halfDuration,
        ease: "Quad.easeIn",
      }),
      this.speechBubble ? tweenPromise(this, {
        targets: this.speechBubble,
        alpha: 0,
        duration: halfDuration,
        ease: "Quad.easeIn",
      }) : Promise.resolve(),
    ]);

    // Меняем позу
    this.safira.setTexture(ASSET_KEYS.boss.battle);
    const gameplayPos = this.getGameplayPosition();
    this.safira.setScale(gameplayPos.scale);

    // Обновляем текст бабла (второй бабл - больший размер для длинной фразы)
    if (this.speechBubble) {
      this.speechBubble.destroy();
    }
    const bubbleY = this.safira.y + this.safira.displayHeight + 40;
    this.speechBubble = new SpeechBubble(this, this.sceneCenter.x, bubbleY, {
      text: DIALOGUE.second,
      tailDirection: "up",
      maxWidth: 320,
      fontSize: "22px",
    });
    this.speechBubble.setDepth(10);
    this.speechBubble.setAlpha(0);

    // Фейдим обратно
    await Promise.all([
      tweenPromise(this, {
        targets: this.safira,
        alpha: 1,
        duration: halfDuration,
        ease: "Quad.easeOut",
      }),
      tweenPromise(this, {
        targets: this.speechBubble,
        alpha: 1,
        scale: 1,
        duration: halfDuration,
        ease: "Quad.easeOut",
      }),
    ]);

    await wait(this, INTRO_ANIMATION.speechBubbleHold);

    // Убираем бабл
    if (this.speechBubble) {
      await this.speechBubble.fadeOut();
      this.speechBubble = undefined;
    }
  }

  private async step5_zoomAndVS(): Promise<void> {
    // Зум камеры (Сафира уже в игровой позиции, не двигается)
    const zoomPromise = tweenPromise(this, {
      targets: this.cameras.main,
      zoom: INTRO_ANIMATION.finalZoom,
      duration: INTRO_ANIMATION.cameraZoomDuration,
      ease: INTRO_EASING.zoom,
    });

    // Ждем немного, потом показываем VS
    await wait(this, 600);

    // Создаём VS контейнер
    this.vsContainer = this.createVSScreen();

    // Показываем VS с фейдом
    const vsPromise = tweenPromise(this, {
      targets: this.vsContainer,
      alpha: 1,
      duration: INTRO_ANIMATION.vsFadeIn,
      ease: INTRO_EASING.fade,
    });

    await Promise.all([zoomPromise, vsPromise]);

    await wait(this, INTRO_ANIMATION.vsHold);
  }

  private createVSScreen(): Phaser.GameObjects.Container {
    const container = this.add.container(0, 0);
    container.setDepth(20);
    container.setAlpha(0);

    // Затемнение за текстом (полупрозрачный прямоугольник по центру)
    const darkOverlay = this.add.rectangle(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2 + 20,
      GAME_WIDTH,
      280,
      0x000000,
      0.7
    );
    container.add(darkOverlay);

    // Текст "Сафира: Пламя Бездны" сверху (над мечами)
    const bossNameText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 70, "Сафира: Пламя Бездны", {
      fontSize: "22px",
      fontFamily: "Arial, sans-serif",
      color: "#ff6b35",
      stroke: "#000000",
      strokeThickness: 4,
      fontStyle: "bold",
    }).setOrigin(0.5);
    container.add(bossNameText);

    // Изображение мечей позади VS
    const swordsImg = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, ASSET_KEYS.intro.swords);
    // Масштабируем мечи до нужного размера
    const swordsScale = 180 / swordsImg.width;
    swordsImg.setScale(swordsScale);
    container.add(swordsImg);

    // VS текст по центру поверх мечей
    const vsText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, "VS", {
      fontSize: "48px",
      fontFamily: "Arial Black, sans-serif",
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 6,
    }).setOrigin(0.5);
    container.add(vsText);

    // Текст "Игрок" под VS
    const playerNameText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 50, "Игрок", {
      fontSize: "18px",
      fontFamily: "Arial, sans-serif",
      color: "#4fc3f7",
      stroke: "#000000",
      strokeThickness: 3,
      fontStyle: "bold",
    }).setOrigin(0.5);
    container.add(playerNameText);

    // Большой аватар игрока с золотой рамкой
    const frameWidth = 120;
    const frameHeight = 150;
    const frameY = GAME_HEIGHT / 2 + 150;

    // Золотой фон рамки
    const frameBg = this.add.graphics();
    frameBg.fillStyle(0xc9a227, 1);
    frameBg.fillRoundedRect(
      GAME_WIDTH / 2 - frameWidth / 2 - 5,
      frameY - frameHeight / 2 - 5,
      frameWidth + 10,
      frameHeight + 10,
      8
    );
    frameBg.fillStyle(0x1a1a2e, 1);
    frameBg.fillRoundedRect(
      GAME_WIDTH / 2 - frameWidth / 2,
      frameY - frameHeight / 2,
      frameWidth,
      frameHeight,
      6
    );
    container.add(frameBg);

    // Аватар игрока (большой)
    const playerAvatar = this.add.image(GAME_WIDTH / 2, frameY, ASSET_KEYS.player.avatar);
    const avatarScale = Math.min(
      (frameWidth - 16) / playerAvatar.width,
      (frameHeight - 16) / playerAvatar.height
    );
    playerAvatar.setScale(avatarScale);
    container.add(playerAvatar);

    return container;
  }

  private async step6_transitionToGame(): Promise<void> {
    // Фейдим ТОЛЬКО VS элементы (Сафира остается на месте!)
    if (this.vsContainer) {
      await tweenPromise(this, {
        targets: this.vsContainer,
        alpha: 0,
        duration: INTRO_ANIMATION.vsFadeOut,
        ease: INTRO_EASING.fade,
      });
      this.vsContainer.destroy();
    }

    // БЕЗ черного перехода - сразу запускаем GameScene
    // Сафира уже в правильной позиции
    this.scene.start("GameScene", { fromIntro: true, finalDialogue: DIALOGUE.final });
  }
}
