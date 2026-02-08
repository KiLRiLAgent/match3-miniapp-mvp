import Phaser from "phaser";
import { ASSET_KEYS } from "../game/assets";
import { GAME_WIDTH, GAME_HEIGHT, GAME_PARAMS } from "../game/config";
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

  // Scale фона для покрытия всего экрана (начало интро)
  private getInitialScale(): number {
    return Math.max(GAME_WIDTH / this.background.width, GAME_HEIGHT / this.background.height);
  }

  // Scale фона по ширине (для расчёта зумнутого состояния)
  private getWidthScale(): number {
    return GAME_WIDTH / this.background.width;
  }

  private async step1_backgroundAppear(): Promise<void> {
    // Фон начинает от верхней грани (offsetY применяется при зуме)
    this.background = this.add.image(GAME_WIDTH / 2, 0, ASSET_KEYS.game.background);
    this.background.setOrigin(0.5, 0);

    const baseScale = this.getInitialScale();
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

  // Сафира ДАЛЕКО — привязана к фону (до зума)
  private getFarPosition(): { x: number; y: number; scale: number; originY: number } {
    const bgScale = this.getInitialScale();
    const bgDisplayHeight = this.background.height * bgScale;

    // Позиция босса относительно верха фона (без offsetY — он применяется при зуме)
    const yOffset = GAME_PARAMS.background.introBossYOffset ?? 0;
    const bossY = (GAME_PARAMS.background.bossOnBgY + yOffset) * bgDisplayHeight;
    const bossScale = bgScale * GAME_PARAMS.background.bossScale * (GAME_PARAMS.background.introBossMultiplier ?? 1);

    return {
      x: GAME_WIDTH / 2,
      y: bossY,
      scale: bossScale,
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

    // Меняем текстуру (позиция остаётся — привязана к фону через onUpdate)
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
    const startScale = this.background.scale;
    const zoomedScale = this.getWidthScale() * GAME_PARAMS.background.zoomScale;
    const introMult = GAME_PARAMS.background.introBossMultiplier ?? 1;
    const introYOffset = GAME_PARAMS.background.introBossYOffset ?? 0;

    // Зум фона — Сафира привязана через onUpdate (без дрейфа)
    const bgZoomPromise = tweenPromise(this, {
      targets: this.background,
      scale: zoomedScale,
      y: GAME_PARAMS.background.offsetY,
      duration: 1200,
      ease: "Quad.easeInOut",
      onUpdate: () => {
        const s = this.background.scale;
        const bgY = this.background.y;
        const h = this.background.height * s;
        // Плавно уменьшаем introMult до 1.0 по мере зума
        const t = (s - startScale) / (zoomedScale - startScale);
        const mult = introMult + t * (1.0 - introMult);
        const yOff = introYOffset * (1 - t);
        this.safira.setPosition(GAME_WIDTH / 2, bgY + (GAME_PARAMS.background.bossOnBgY + yOff) * h);
        this.safira.setScale(s * GAME_PARAMS.background.bossScale * mult);
      },
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

    await Promise.all([bgZoomPromise, vsPromise]);
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

    // 2. Запускаем GameScene (bg/boss рендерятся поверх IntroScene на тех же координатах)
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
