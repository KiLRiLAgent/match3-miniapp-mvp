import Phaser from "phaser";
import { ASSET_KEYS } from "../game/assets";
import { GAME_WIDTH, GAME_HEIGHT, GAME_PARAMS, DPR } from "../game/config";
import { INTRO_ANIMATION, INTRO_EASING } from "../game/animations";
import { SpeechBubble } from "../ui/SpeechBubble";
import { wait, waitOrTap, tweenPromise } from "../utils/helpers";
import { isMuted, getVolume } from "../utils/audioSettings";
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
  private safiraGlow!: Phaser.GameObjects.Image;
  private speechBubble?: SpeechBubble;
  private vsContainer?: Phaser.GameObjects.Container;
  private sceneCenter!: { x: number; y: number };

  constructor() {
    super("IntroScene");
  }

  create() {
    this.cameras.main.setBackgroundColor("#000000");
    this.sceneCenter = { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2 };

    this.cameras.main.setZoom(DPR);
    this.cameras.main.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);

    // Start background music from the intro (destroy existing on retry)
    if (this.cache.audio.exists(ASSET_KEYS.music.bgm)) {
      try {
        const existing = this.sound.get(ASSET_KEYS.music.bgm);
        if (existing) existing.destroy();
        const bgm = this.sound.add(ASSET_KEYS.music.bgm, { loop: true, volume: 1 * getVolume() });
        if (!isMuted()) bgm.play();
      } catch { /* audio not available */ }
    }

    this.runIntroSequence();
  }

  private skipRequested = false;

  private async runIntroSequence() {
    await document.fonts.ready;

    // Tap anywhere to skip entire intro
    const skipZone = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0)
      .setOrigin(0, 0)
      .setDepth(999)
      .setInteractive();
    skipZone.once("pointerdown", () => {
      this.skipRequested = true;
      skipZone.destroy();
    });

    await this.step1_backgroundAppear();
    if (this.skipRequested) { await this.step6_transitionToGame(); return; }
    await this.step2_safiraAppear();
    if (this.skipRequested) { await this.step6_transitionToGame(); return; }
    await this.step3_firstDialogue();
    if (this.skipRequested) { await this.step6_transitionToGame(); return; }
    await this.step4_poseChangeDialogue();
    if (this.skipRequested) { await this.step6_transitionToGame(); return; }
    await this.step5_zoomAndVS();
    if (this.skipRequested) { await this.step6_transitionToGame(); return; }
    await this.step6_transitionToGame();
    skipZone.destroy();
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

    this.safiraGlow = this.add.image(farPos.x, farPos.y, ASSET_KEYS.boss.introBack);
    this.safiraGlow.setOrigin(0.5, farPos.originY);
    this.safiraGlow.setScale(farPos.scale);
    this.safiraGlow.setAlpha(0);
    this.safiraGlow.setDepth(0.9);

    this.safira = this.add.image(farPos.x, farPos.y, ASSET_KEYS.boss.intro);
    this.safira.setOrigin(0.5, farPos.originY);
    this.safira.setScale(farPos.scale);
    this.safira.setAlpha(0);
    this.safira.setDepth(1);

    return tweenPromise(this, {
      targets: [this.safiraGlow, this.safira],
      alpha: 1,
      duration: INTRO_ANIMATION.safiraFadeIn,
      ease: INTRO_EASING.fade,
    });
  }

  private getBubbleFontSize(): string {
    return Math.round(22 * GAME_WIDTH / 480) + "px";
  }

  private getBubbleMaxWidth(): number {
    return Math.round(GAME_WIDTH * 0.92);
  }

  private async step3_firstDialogue(): Promise<void> {
    this.speechBubble = new SpeechBubble(this, this.sceneCenter.x, this.getBubbleY(), {
      text: DIALOGUE.first,
      tailDirection: "up",
      maxWidth: this.getBubbleMaxWidth(),
      fontSize: this.getBubbleFontSize(),
    });
    this.speechBubble.setDepth(10);

    await this.speechBubble.fadeIn();
    await waitOrTap(this, INTRO_ANIMATION.speechBubbleHold, 11);
  }

  private async step4_poseChangeDialogue(): Promise<void> {
    const duration = INTRO_ANIMATION.poseTransitionDuration;

    // Создаём новую Сафиру (glow + solid) поверх старой
    const newSafiraGlow = this.add.image(this.safira.x, this.safira.y, ASSET_KEYS.boss.mainBack);
    newSafiraGlow.setOrigin(this.safira.originX, this.safira.originY);
    newSafiraGlow.setScale(this.safira.scale);
    newSafiraGlow.setDepth(0.9);
    newSafiraGlow.setAlpha(0);

    const newSafira = this.add.image(this.safira.x, this.safira.y, ASSET_KEYS.boss.main);
    newSafira.setOrigin(this.safira.originX, this.safira.originY);
    newSafira.setScale(this.safira.scale);
    newSafira.setDepth(this.safira.depth);
    newSafira.setAlpha(0);

    // Новый бабл
    if (this.speechBubble) {
      this.speechBubble.destroy();
    }
    this.speechBubble = new SpeechBubble(this, this.sceneCenter.x, this.getBubbleY(), {
      text: DIALOGUE.second,
      tailDirection: "up",
      maxWidth: this.getBubbleMaxWidth(),
      fontSize: this.getBubbleFontSize(),
    });
    this.speechBubble.setDepth(10);
    this.speechBubble.setAlpha(0);

    // Кроссфейд: старая уходит, новая проявляется + бабл появляется
    await Promise.all([
      tweenPromise(this, {
        targets: [this.safira, this.safiraGlow],
        alpha: 0,
        duration,
        ease: "Quad.easeInOut",
      }),
      tweenPromise(this, {
        targets: [newSafira, newSafiraGlow],
        alpha: 1,
        duration,
        ease: "Quad.easeInOut",
      }),
      tweenPromise(this, {
        targets: this.speechBubble,
        alpha: 1,
        scale: 1,
        duration,
        ease: "Quad.easeOut",
      }),
    ]);

    this.safira.destroy();
    this.safiraGlow.destroy();
    this.safira = newSafira;
    this.safiraGlow = newSafiraGlow;

    await waitOrTap(this, INTRO_ANIMATION.speechBubbleHold, 11);

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
        const bossPos = { x: GAME_WIDTH / 2, y: bgY + (GAME_PARAMS.background.bossOnBgY + yOff) * h };
        const bossScl = s * GAME_PARAMS.background.bossScale * mult;
        this.safira.setPosition(bossPos.x, bossPos.y);
        this.safira.setScale(bossScl);
        this.safiraGlow.setPosition(bossPos.x, bossPos.y);
        this.safiraGlow.setScale(bossScl);
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
    await waitOrTap(this, INTRO_ANIMATION.vsHold, 21);
  }

  private createVSScreen(): Phaser.GameObjects.Container {
    const container = this.add.container(0, 0);
    container.setDepth(20);
    container.setAlpha(0);

    // Позиции элементов
    const centerY = GAME_HEIGHT * 0.42;
    const playerFrameY = GAME_HEIGHT - 196;

    // Мечи — базовый размер (+20%)
    const swordsTargetWidth = GAME_WIDTH * 0.6;
    const swordsImg = this.add.image(GAME_WIDTH / 2, centerY + 30, ASSET_KEYS.intro.swords);
    const swordsScale = swordsTargetWidth / swordsImg.width;
    swordsImg.setScale(swordsScale);

    // Огненное свечение поверх мечей — оригинальный цвет
    const gloomImg = this.add.image(GAME_WIDTH / 2, centerY + 30, ASSET_KEYS.intro.swordsGloom);
    gloomImg.setScale(swordsScale);
    gloomImg.setAlpha(0.6);

    // Мечи снизу, огонь сверху
    container.add(swordsImg);
    container.add(gloomImg);

    // Пульсация: +5% scale + alpha 0.6→0.8
    this.tweens.add({
      targets: gloomImg,
      scaleX: swordsScale * 1.05,
      scaleY: swordsScale * 1.05,
      alpha: 0.8,
      duration: 1200,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });

    // Полупрозрачный фон под "Сафира: Пламя Бездны" — поверх мечей
    const bossNameBg = this.add.rectangle(GAME_WIDTH / 2, centerY - 30, 320, 44, 0x000000, 0.5);
    bossNameBg.setOrigin(0.5);
    container.add(bossNameBg);

    // Текст "Сафира: Пламя Бездны" — золотистый градиент
    const bossNameText = this.add.text(GAME_WIDTH / 2, centerY - 30, "Сафира: Пламя Бездны", {
      fontSize: "26px",
      fontFamily: "'Exo 2', Arial, sans-serif",
      stroke: "#6b4c00",
      strokeThickness: 5,
      fontStyle: "600",
    }).setOrigin(0.5);
    this.applyGoldGradient(bossNameText);
    container.add(bossNameText);

    // Полупрозрачный фон под "Игрок" — поверх мечей
    const playerNameBg = this.add.rectangle(GAME_WIDTH / 2, centerY + 100, 120, 40, 0x000000, 0.5);
    playerNameBg.setOrigin(0.5);
    container.add(playerNameBg);

    // Текст "Игрок" — золотистый градиент
    const playerNameText = this.add.text(GAME_WIDTH / 2, centerY + 100, "Игрок", {
      fontSize: "24px",
      fontFamily: "'Exo 2', Arial, sans-serif",
      stroke: "#6b4c00",
      strokeThickness: 4,
      fontStyle: "600",
    }).setOrigin(0.5);
    this.applyGoldGradient(playerNameText);
    container.add(playerNameText);

    // Жёлтая рамка игрока — тонирована в тёплое золото
    const playerFrame = this.add.image(GAME_WIDTH / 2, playerFrameY, ASSET_KEYS.intro.playerFrame);
    const frameTargetWidth = GAME_WIDTH * 0.92;
    const frameScale = frameTargetWidth / playerFrame.width;
    playerFrame.setScale(frameScale);
    playerFrame.setTint(0xf5c842);

    // Свечение под рамкой игрока — золотистое, без ADD чтобы сохранить цвет
    const playerGloom = this.add.image(GAME_WIDTH / 2, playerFrameY, ASSET_KEYS.intro.playerGloom);
    playerGloom.setScale(frameScale);
    container.add(playerGloom);
    container.add(playerFrame);

    // Белое свечение поверх рамки (по принципу тайлового glow, в половину слабее)
    const playerWhiteGlow = this.add.image(GAME_WIDTH / 2, playerFrameY, ASSET_KEYS.intro.playerFrame);
    playerWhiteGlow.setScale(frameScale);
    playerWhiteGlow.setTintFill(0xffffff);
    playerWhiteGlow.setAlpha(0);
    container.add(playerWhiteGlow);

    this.tweens.add({
      targets: playerWhiteGlow,
      alpha: 0.25,
      duration: 1200,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });

    // Плавная пульсация: alpha засвет + scale +3%
    playerGloom.setAlpha(0.5);
    this.tweens.add({
      targets: playerGloom,
      scaleX: playerGloom.scaleX * 1.03,
      scaleY: playerGloom.scaleY * 1.03,
      alpha: 0.65,
      duration: 1200,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });

    // Аватар игрока — origin снизу, чтобы уменьшение не сдвигало нижнюю границу
    const playerAvatar = this.add.image(GAME_WIDTH / 2 + 15, playerFrameY - 70, ASSET_KEYS.player.avatar);
    playerAvatar.setOrigin(0.5, 1);
    const frameHeight = playerFrame.displayHeight;
    const baseAvatarScale = (frameHeight * 1.26) / playerAvatar.height;
    const avatarScale = baseAvatarScale * 0.95;
    playerAvatar.setScale(avatarScale);
    // Сдвиг Y: origin теперь внизу, компенсируем чтобы низ остался на месте
    const halfOldHeight = (baseAvatarScale * playerAvatar.height) / 2;
    playerAvatar.setY(playerFrameY - 70 + halfOldHeight);
    container.add(playerAvatar);

    return container;
  }

  private applyGoldGradient(text: Phaser.GameObjects.Text): void {
    const canvas = text.canvas;
    const ctx = text.context;
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, "#fff4c1");   // Светлое золото сверху
    gradient.addColorStop(0.3, "#ffd700"); // Яркое золото
    gradient.addColorStop(0.6, "#d4a520"); // Классическое золото
    gradient.addColorStop(1, "#b8860b");   // Тёмное золото снизу
    text.setFill(gradient);
  }

  private async step6_transitionToGame(): Promise<void> {
    // 1. Запускаем GameScene первой (bg/boss рендерятся за vsContainer)
    this.scene.launch("GameScene", {
      fromIntro: true,
      startHidden: true,
    });

    await wait(this, 100);

    // 2. Одновременно: fade out VS + fade in GameScene
    const gameScene = this.scene.get("GameScene") as GameScene;
    const fadeOutVS = this.vsContainer
      ? tweenPromise(this, {
          targets: this.vsContainer,
          alpha: 0,
          duration: 800,
          ease: "Quad.easeInOut",
        })
      : Promise.resolve();

    const fadeInGame = gameScene.triggerFadeIn(DIALOGUE.final);

    await Promise.all([fadeOutVS, fadeInGame]);

    // 3. Останавливаем IntroScene
    this.scene.stop("IntroScene");
  }
}
