import Phaser from "phaser";
import { ASSET_KEYS } from "../game/assets";
import { GAME_WIDTH, GAME_HEIGHT, UI_LAYOUT } from "../game/config";
import { INTRO_ANIMATION, INTRO_EASING } from "../game/animations";
import { SpeechBubble } from "../ui/SpeechBubble";
import { wait, tweenPromise } from "../utils/helpers";

// Диалоги с намеренными переносами строк для акцента
const DIALOGUE = {
  first: "Как ты посмел\nбросить вызов Сафире?",
  second: "Ты лишь искра, которую я сейчас\nрастопчу",
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

  // Сафира КРУПНАЯ для интро диалогов (60% видимой высоты)
  private getIntroPosition(): { x: number; y: number; scale: number; originY: number } {
    const imgHeight = this.textures.get(ASSET_KEYS.boss.normal).getSourceImage().height;
    // Целевая высота: 60% видимой области (с учётом зума)
    const targetHeight = GAME_HEIGHT * this.scaleFactor * 0.6;
    const scale = targetHeight / imgHeight;

    return {
      x: this.sceneCenter.x,
      y: this.sceneCenter.y * 0.8, // Выше центра
      scale,
      originY: 0.5, // Центр по вертикали
    };
  }

  // Сафира в игровой позиции (верх экрана, как в GameScene)
  private getGameplayPosition(): { x: number; y: number; scale: number; originY: number } {
    const L = UI_LAYOUT;
    // Используем battle текстуру — такую же как в GameScene
    const imgWidth = this.textures.get(ASSET_KEYS.boss.battle).getSourceImage().width;
    const imgHeight = this.textures.get(ASSET_KEYS.boss.battle).getSourceImage().height;
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

  // Позиция бабла на уровне груди (40% от верха изображения)
  private getBubbleY(): number {
    return this.safira.y - this.safira.displayHeight * 0.1;
  }

  private async step2_safiraAppear(): Promise<void> {
    // Используем КРУПНУЮ позицию для интро диалогов
    const introPos = this.getIntroPosition();

    this.safira = this.add.image(introPos.x, introPos.y, ASSET_KEYS.boss.normal);
    this.safira.setOrigin(0.5, introPos.originY);
    this.safira.setScale(introPos.scale * 0.95);
    this.safira.setAlpha(0);
    this.safira.setDepth(1);

    return tweenPromise(this, {
      targets: this.safira,
      alpha: 1,
      scale: introPos.scale,
      duration: INTRO_ANIMATION.safiraFadeIn,
      ease: INTRO_EASING.scale,
    });
  }

  private async step3_firstDialogue(): Promise<void> {
    this.speechBubble = new SpeechBubble(this, this.sceneCenter.x, this.getBubbleY(), {
      text: DIALOGUE.first,
      tailDirection: "up",
      maxWidth: 360,
      fontSize: "28px",
    });
    this.speechBubble.setDepth(10);

    await this.speechBubble.fadeIn();
    await wait(this, INTRO_ANIMATION.speechBubbleHold);
  }

  private async step4_poseChangeDialogue(): Promise<void> {
    const halfDuration = INTRO_ANIMATION.poseTransitionDuration / 2;

    // Фейдим ТОЛЬКО Сафиру и бабл
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

    // Меняем позу, но остаёмся в intro позиции (КРУПНАЯ)
    this.safira.setTexture(ASSET_KEYS.boss.battle);
    const introPos = this.getIntroPosition();
    this.safira.setScale(introPos.scale);

    // Новый бабл на уровне груди
    if (this.speechBubble) {
      this.speechBubble.destroy();
    }
    this.speechBubble = new SpeechBubble(this, this.sceneCenter.x, this.getBubbleY(), {
      text: DIALOGUE.second,
      tailDirection: "up",
      maxWidth: 520,
      fontSize: "28px",
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

    if (this.speechBubble) {
      await this.speechBubble.fadeOut();
      this.speechBubble = undefined;
    }
  }

  private async step5_zoomAndVS(): Promise<void> {
    const introPos = this.getIntroPosition();
    const gameplayPos = this.getGameplayPosition();

    // Зум камеры
    const zoomPromise = tweenPromise(this, {
      targets: this.cameras.main,
      zoom: INTRO_ANIMATION.finalZoom,
      duration: INTRO_ANIMATION.cameraZoomDuration,
      ease: INTRO_EASING.zoom,
    });

    // Анимируем Сафиру к игровой позиции параллельно с зумом
    const safiraPromise = new Promise<void>((resolve) => {
      this.tweens.add({
        targets: this.safira,
        x: gameplayPos.x,
        y: gameplayPos.y,
        scale: gameplayPos.scale,
        duration: INTRO_ANIMATION.cameraZoomDuration,
        ease: INTRO_EASING.zoom,
        onUpdate: (tween) => {
          // Плавно интерполируем origin используя прогресс твина
          const progress = tween.progress;
          const newOriginY = Phaser.Math.Linear(introPos.originY, gameplayPos.originY, progress);
          this.safira.setOrigin(0.5, newOriginY);
        },
        onComplete: () => {
          this.safira.setOrigin(0.5, gameplayPos.originY);
          resolve();
        },
      });
    });

    await wait(this, 600);

    // VS контейнер
    this.vsContainer = this.createVSScreen();

    const vsPromise = tweenPromise(this, {
      targets: this.vsContainer,
      alpha: 1,
      duration: INTRO_ANIMATION.vsFadeIn,
      ease: INTRO_EASING.fade,
    });

    await Promise.all([zoomPromise, safiraPromise, vsPromise]);
    await wait(this, INTRO_ANIMATION.vsHold);
  }

  private createVSScreen(): Phaser.GameObjects.Container {
    const container = this.add.container(0, 0);
    container.setDepth(20);
    container.setAlpha(0);

    // Позиции элементов по референсу
    const centerY = GAME_HEIGHT * 0.42;
    const playerFrameY = GAME_HEIGHT * 0.65;

    // Полупрозрачный фон под "Сафира: Пламя Бездны"
    const bossNameBg = this.add.rectangle(GAME_WIDTH / 2, centerY - 60, 320, 44, 0x000000, 0.5);
    bossNameBg.setOrigin(0.5);
    container.add(bossNameBg);

    // Текст "Сафира: Пламя Бездны" - оранжевый
    const bossNameText = this.add.text(GAME_WIDTH / 2, centerY - 60, "Сафира: Пламя Бездны", {
      fontSize: "26px",
      fontFamily: "Arial, sans-serif",
      color: "#ff6b35",
      stroke: "#000000",
      strokeThickness: 4,
      fontStyle: "bold",
    }).setOrigin(0.5);
    container.add(bossNameText);

    // Мечи позади VS
    const swordsImg = this.add.image(GAME_WIDTH / 2, centerY + 30, ASSET_KEYS.intro.swords);
    const swordsScale = 200 / swordsImg.width;
    swordsImg.setScale(swordsScale);
    container.add(swordsImg);

    // VS изображение вместо текста
    const vsImg = this.add.image(GAME_WIDTH / 2, centerY + 30, ASSET_KEYS.intro.vsLogo);
    const vsScale = 120 / vsImg.width;
    vsImg.setScale(vsScale);
    container.add(vsImg);

    // Полупрозрачный фон под "Игрок"
    const playerNameBg = this.add.rectangle(GAME_WIDTH / 2, centerY + 110, 120, 40, 0x000000, 0.5);
    playerNameBg.setOrigin(0.5);
    container.add(playerNameBg);

    // Текст "Игрок" - белый
    const playerNameText = this.add.text(GAME_WIDTH / 2, centerY + 110, "Игрок", {
      fontSize: "24px",
      fontFamily: "Arial, sans-serif",
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 4,
      fontStyle: "bold",
    }).setOrigin(0.5);
    container.add(playerNameText);

    // Жёлтая рамка игрока (из изображения)
    const playerFrame = this.add.image(GAME_WIDTH / 2, playerFrameY, ASSET_KEYS.intro.playerFrame);
    const frameTargetWidth = GAME_WIDTH * 0.85;
    const frameScale = frameTargetWidth / playerFrame.width;
    playerFrame.setScale(frameScale);
    container.add(playerFrame);

    // Аватар игрока - больше и выше, выходит за рамку сверху
    const playerAvatar = this.add.image(GAME_WIDTH / 2, playerFrameY - 30, ASSET_KEYS.player.avatar);
    const frameHeight = playerFrame.displayHeight;
    const avatarScale = (frameHeight * 1.4) / playerAvatar.height;
    playerAvatar.setScale(avatarScale);
    container.add(playerAvatar);

    return container;
  }

  private async step6_transitionToGame(): Promise<void> {
    // Запускаем GameScene со скрытым UI (босс виден с текстурой battle)
    this.scene.launch("GameScene", {
      fromIntro: true,
      finalDialogue: DIALOGUE.final,
      startHidden: true,
    });

    // Даём GameScene время на инициализацию
    await wait(this, 100);

    // ФАЗА 1: Fade out VS (фон и Сафира ОСТАЮТСЯ)
    // Фон не фейдим — в GameScene такой же фон уже есть
    // Fade out все элементы VS контейнера (container.alpha не каскадируется в tween)
    const vsElements = this.vsContainer?.getAll() || [];
    if (vsElements.length > 0) {
      await tweenPromise(this, {
        targets: vsElements,
        alpha: 0,
        duration: 800,
        ease: "Quad.easeInOut",
      });
    }

    // ФАЗА 2: Cross dissolve — fade out IntroScene Safira
    // GameScene Safira уже видна под ней (с battle), UI появляется
    await tweenPromise(this, {
      targets: this.safira,
      alpha: 0,
      duration: 400,
      ease: "Quad.easeInOut",
    });

    this.scene.stop("IntroScene");
  }
}
