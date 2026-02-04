import Phaser from "phaser";
import { ASSET_KEYS } from "../game/assets";
import { GAME_WIDTH, GAME_HEIGHT, UI_LAYOUT } from "../game/config";
import { INTRO_ANIMATION, INTRO_EASING } from "../game/animations";
import { SpeechBubble } from "../ui/SpeechBubble";
import { wait, tweenPromise } from "../utils/helpers";
import { GameScene } from "./GameScene";

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

  constructor() {
    super("IntroScene");
  }

  create() {
    this.cameras.main.setBackgroundColor("#000000");
    this.sceneCenter = { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2 };

    // Без зума камеры — эффект приближения через scale фона
    this.cameras.main.setZoom(1);

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

  // Базовый scale фона чтобы покрыть экран
  private getBackgroundScale(): number {
    const scaleX = GAME_WIDTH / this.background.width;
    const scaleY = GAME_HEIGHT / this.background.height;
    return Math.max(scaleX, scaleY);
  }

  // Настройки фона (общие для интро и боя)
  private readonly BG_OFFSET_Y = 200; // Смещение фона вниз
  private readonly BG_ZOOM_SCALE = 1.3; // Зум при приближении

  private async step1_backgroundAppear(): Promise<void> {
    // Новый фон тронного зала (тот же что в GameScene)
    const bgY = this.sceneCenter.y + this.BG_OFFSET_Y;
    this.background = this.add.image(this.sceneCenter.x, bgY, ASSET_KEYS.game.background);

    // Обычный размер фона
    const baseScale = this.getBackgroundScale();
    this.background.setScale(baseScale);
    this.background.setAlpha(0);
    this.background.setDepth(0);

    return tweenPromise(this, {
      targets: this.background,
      alpha: 1,
      duration: INTRO_ANIMATION.backgroundFadeIn,
      ease: INTRO_EASING.fade,
    });
  }

  // Сафира ДАЛЕКО — маленькая, по центру
  private getFarPosition(): { x: number; y: number; scale: number; originY: number } {
    const imgHeight = this.textures.get(ASSET_KEYS.boss.normal).getSourceImage().height;
    // Размер — 46% высоты экрана (на 15% больше чем было 40%)
    const targetHeight = GAME_HEIGHT * 0.46;
    const scale = targetHeight / imgHeight;

    return {
      x: GAME_WIDTH / 2,
      y: GAME_HEIGHT * 0.50,
      scale,
      originY: 0.5,
    };
  }

  // Сафира БЛИЗКО — игровая позиция (верх экрана)
  // Используем originY 0.5 как и в far позиции для плавной анимации
  private getClosePosition(): { x: number; y: number; scale: number; originY: number } {
    const L = UI_LAYOUT;
    const imgWidth = this.textures.get(ASSET_KEYS.boss.battle).getSourceImage().width;
    const imgHeight = this.textures.get(ASSET_KEYS.boss.battle).getSourceImage().height;
    const scaleX = GAME_WIDTH / imgWidth;
    const scaleY = L.bossImageHeight / imgHeight;
    const scale = Math.max(scaleX, scaleY);

    // С originY 0.5, чтобы верх изображения был у y=0:
    // y = displayHeight / 2 = imgHeight * scale / 2
    const displayHeight = imgHeight * scale;

    return {
      x: GAME_WIDTH / 2,
      y: displayHeight / 2,
      scale,
      originY: 0.5,
    };
  }

  // Позиция бабла — ближе к Сафире
  private getBubbleY(): number {
    return this.safira.y + this.safira.displayHeight * 0.1;
  }

  private async step2_safiraAppear(): Promise<void> {
    // Сафира появляется ДАЛЕКО (маленькая)
    const farPos = this.getFarPosition();

    this.safira = this.add.image(farPos.x, farPos.y, ASSET_KEYS.boss.normal);
    this.safira.setOrigin(0.5, farPos.originY);
    this.safira.setScale(farPos.scale);
    this.safira.setAlpha(0);
    this.safira.setDepth(1);

    return tweenPromise(this, {
      targets: this.safira,
      alpha: 1,
      duration: INTRO_ANIMATION.safiraFadeIn,
      ease: INTRO_EASING.fade,
    });
  }

  private async step3_firstDialogue(): Promise<void> {
    this.speechBubble = new SpeechBubble(this, this.sceneCenter.x, this.getBubbleY(), {
      text: DIALOGUE.first,
      tailDirection: "up",
      maxWidth: 320,
      fontSize: "22px",
    });
    this.speechBubble.setDepth(10);

    await this.speechBubble.fadeIn();
    await wait(this, INTRO_ANIMATION.speechBubbleHold);
  }

  private async step4_poseChangeDialogue(): Promise<void> {
    const halfDuration = INTRO_ANIMATION.poseTransitionDuration / 2;

    // Фейдим Сафиру и бабл
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

    // Меняем только текстуру (позиция та же)
    this.safira.setTexture(ASSET_KEYS.boss.battle);

    // Новый бабл
    if (this.speechBubble) {
      this.speechBubble.destroy();
    }
    this.speechBubble = new SpeechBubble(this, this.sceneCenter.x, this.getBubbleY(), {
      text: DIALOGUE.second,
      tailDirection: "up",
      maxWidth: 380,
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

    if (this.speechBubble) {
      await this.speechBubble.fadeOut();
      this.speechBubble = undefined;
    }
  }

  private async step5_zoomAndVS(): Promise<void> {
    const closePos = this.getClosePosition();

    // Зум фона (scale + смещение для эффекта приближения)
    const zoomedScale = this.getBackgroundScale() * this.BG_ZOOM_SCALE;
    const bgZoomPromise = tweenPromise(this, {
      targets: this.background,
      scale: zoomedScale,
      duration: 1200,
      ease: "Quad.easeInOut",
    });

    // Плавное увеличение Сафиры (origin остаётся 0.5)
    const safiraZoomPromise = tweenPromise(this, {
      targets: this.safira,
      x: closePos.x,
      y: closePos.y,
      scale: closePos.scale,
      duration: 1200,
      ease: "Quad.easeInOut",
    });

    await wait(this, 400);

    // VS контейнер появляется во время зума
    this.vsContainer = this.createVSScreen();
    const vsPromise = tweenPromise(this, {
      targets: this.vsContainer,
      alpha: 1,
      duration: INTRO_ANIMATION.vsFadeIn,
      ease: INTRO_EASING.fade,
    });

    await Promise.all([bgZoomPromise, safiraZoomPromise, vsPromise]);
    await wait(this, INTRO_ANIMATION.vsHold);
  }

  private createVSScreen(): Phaser.GameObjects.Container {
    const container = this.add.container(0, 0);
    container.setDepth(20);
    container.setAlpha(0);

    // Позиции элементов
    const centerY = GAME_HEIGHT * 0.42;
    const playerFrameY = GAME_HEIGHT * 0.68;

    // Полупрозрачный фон под "Сафира: Пламя Бездны"
    const bossNameBg = this.add.rectangle(GAME_WIDTH / 2, centerY - 60, 320, 44, 0x000000, 0.5);
    bossNameBg.setOrigin(0.5);
    container.add(bossNameBg);

    // Текст "Сафира: Пламя Бездны"
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

    // VS изображение
    const vsImg = this.add.image(GAME_WIDTH / 2, centerY + 30, ASSET_KEYS.intro.vsLogo);
    const vsScale = 120 / vsImg.width;
    vsImg.setScale(vsScale);
    container.add(vsImg);

    // Полупрозрачный фон под "Игрок"
    const playerNameBg = this.add.rectangle(GAME_WIDTH / 2, centerY + 110, 120, 40, 0x000000, 0.5);
    playerNameBg.setOrigin(0.5);
    container.add(playerNameBg);

    // Текст "Игрок"
    const playerNameText = this.add.text(GAME_WIDTH / 2, centerY + 110, "Игрок", {
      fontSize: "24px",
      fontFamily: "Arial, sans-serif",
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 4,
      fontStyle: "bold",
    }).setOrigin(0.5);
    container.add(playerNameText);

    // Жёлтая рамка игрока
    const playerFrame = this.add.image(GAME_WIDTH / 2, playerFrameY, ASSET_KEYS.intro.playerFrame);
    const frameTargetWidth = GAME_WIDTH * 0.85;
    const frameScale = frameTargetWidth / playerFrame.width;
    playerFrame.setScale(frameScale);
    container.add(playerFrame);

    // Аватар игрока
    const playerAvatar = this.add.image(GAME_WIDTH / 2, playerFrameY - 30, ASSET_KEYS.player.avatar);
    const frameHeight = playerFrame.displayHeight;
    const avatarScale = (frameHeight * 1.4) / playerAvatar.height;
    playerAvatar.setScale(avatarScale);
    container.add(playerAvatar);

    return container;
  }

  private async step6_transitionToGame(): Promise<void> {
    // 1. Сначала fade out VS (пока GameScene не запущена)
    if (this.vsContainer) {
      await tweenPromise(this, {
        targets: this.vsContainer,
        alpha: 0,
        duration: 800,
        ease: "Quad.easeInOut",
      });
    }

    // 2. Теперь запускаем GameScene (она рендерится поверх IntroScene)
    this.scene.launch("GameScene", {
      fromIntro: true,
      startHidden: true,
    });

    await wait(this, 100);

    // 3. Показываем игровое поле с финальным диалогом
    const gameScene = this.scene.get("GameScene") as GameScene;
    await gameScene.triggerFadeIn(DIALOGUE.final);

    // 4. Останавливаем IntroScene
    this.scene.stop("IntroScene");
  }
}
