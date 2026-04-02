import Phaser from "phaser";
import { ASSET_KEYS } from "../game/assets";
import {
  BOARD_PADDING,
  BOARD_WIDTH,
  BOARD_HEIGHT,
  BOSS_DAMAGED_HP_THRESHOLD,
  CELL_SIZE,
  GAME_HEIGHT,
  GAME_WIDTH,
  PLAYER_MAG_DAMAGE_MULTIPLIER,
  SKILL_CONFIG,
  UI_LAYOUT,
  UI_COLORS,
  INPUT_THRESHOLD,
  DAMAGE_TILES,
  RESOURCE_TILES,
  SAFE_AREA,
  GAME_PARAMS,
  DPR,
  TILE_DISPLAY_SCALE,
  getBossLayerCount,
  getBossLayerHpArray,
  getBossLayerIndex,
  BOSS_LAYER_COLORS,
  CRIT_MULTIPLIERS,
} from "../game/config";
import {
  ANIMATION_DURATIONS,
  ANIMATION_EASING,
  VISUAL_EFFECTS,
  HINT_ANIMATION,
} from "../game/animations";
import type { SkillId } from "../game/config";
import { Match3Board } from "../match3/Board";
import { TileKind } from "../match3/types";
import type { BaseTileKind, Match, Position, PotentialMove, Tile, CountTotals } from "../match3/types";
import { Meter } from "../ui/Meter";
import { LayeredMeter } from "../ui/LayeredMeter";
import { SkillButton } from "../ui/SkillButton";
import { SettingsPanel } from "../ui/SettingsPanel";
import { CooldownIcon } from "../ui/CooldownIcon";
import { showDamageNumber } from "../ui/DamageNumber";
import { BossAbilityManager } from "../game/BossAbility";
import { PerkManager, PERKS_TO_OFFER } from "../game/PerkManager";
import type { PerkDef } from "../game/PerkManager";
import { PerkCard } from "../ui/PerkCard";
import { BOSS_ABILITIES } from "../game/config";
import { flyTilesToTarget } from "../ui/FlyingTile";
import type { FlyTarget } from "../ui/FlyingTile";
import { clamp, wait, waitOrTap, tweenPromise } from "../utils/helpers";
import { isMuted, getVolume, toggleMute } from "../utils/audioSettings";
import { hapticLight, hapticMedium, hapticHeavy, hapticVictory, hapticDefeat } from "../utils/haptics";
import { emitTileParticles } from "../ui/TileParticles";
import { SpeechBubble } from "../ui/SpeechBubble";
import { INTRO_ANIMATION } from "../game/animations";

const SKILL_IDS: SkillId[] = ["powerStrike", "stun", "heal", "hammer"];


// Tutorial: fixed 8x7 board for the first move
// Player must swipe tile at (5,2) DOWN to (5,3) to complete 3 swords in a row at (3..5,3)
const S = TileKind.Sword as BaseTileKind;
const T = TileKind.Star as BaseTileKind;
const M = TileKind.Mana as BaseTileKind;
const H = TileKind.Heal as BaseTileKind;

const TUTORIAL_BOARD: BaseTileKind[][] = [
  //  0  1  2  3  4  5  6  7
  [H, T, M, H, T, M, H, T],  // row 0
  [T, M, H, T, H, T, M, H],  // row 1
  [M, H, T, H, H, S, M, H],  // row 2: sword at (5,2) — swipe DOWN
  [H, T, M, S, S, T, H, T],  // row 3: swords at (3,3),(4,3)
  [T, M, H, T, H, T, M, T],  // row 4
  [M, H, T, H, T, M, H, M],  // row 5
  [H, T, M, T, M, H, T, H],  // row 6
];

// The tile that must be swiped (3rd sword) and where it goes
const TUTORIAL_FROM: Position = { x: 5, y: 2 };
const TUTORIAL_TO: Position = { x: 5, y: 3 };
// All tiles involved in the tutorial match (highlighted above overlay)
const TUTORIAL_HIGHLIGHT: Position[] = [
  { x: 3, y: 3 },
  { x: 4, y: 3 },
  { x: 5, y: 2 }, // this one will be swiped to (5,3)
];

export class GameScene extends Phaser.Scene {
  private board!: Match3Board;
  private tileSprites = new Map<number, Phaser.GameObjects.Image>();
  private tilePositions = new Map<number, Position>();
  private dragStart:
    | { pos: Position; point: Phaser.Math.Vector2 }
    | null = null;
  private busy = false;
  private pendingFinalDialogue?: string;

  private bossHp = 0;
  private playerHp = 0;
  private mana = 0;

  private bossImage?: Phaser.GameObjects.Image;
  private bossImageGlow?: Phaser.GameObjects.Image;
  private bossGlowBrightness?: Phaser.GameObjects.Image;

  /** All boss image layers (front, glow, brightness), filtered to only existing ones */
  private get bossLayers(): Phaser.GameObjects.Image[] {
    return [this.bossImage, this.bossImageGlow, this.bossGlowBrightness].filter(Boolean) as Phaser.GameObjects.Image[];
  }
  private bgImage?: Phaser.GameObjects.Image;
  private bossHpBar?: LayeredMeter;
  private playerHpBar?: Meter;
  private manaBar?: Meter;
  private skillButtons: Partial<Record<SkillId, SkillButton>> = {};
  private skillCooldowns: Record<SkillId, number> = {
    powerStrike: 0,
    stun: 0,
    heal: 0,
    hammer: 0,
  };
  private hammerMode = false;
  private hammerOverlay?: Phaser.GameObjects.Rectangle;
  private hammerHint?: Phaser.GameObjects.Text;
  private settingsOpen = false;

  private bossAbilityManager!: BossAbilityManager;
  private cooldownIcon?: CooldownIcon;
  private playerAvatar?: Phaser.GameObjects.Rectangle;

  private bossShieldDuration = 0;
  private bossShieldOverlay?: Phaser.GameObjects.Image;
  private bossShieldGlowTween?: Phaser.Tweens.Tween;
  private bossShieldText?: Phaser.GameObjects.Text;
  private bombCooldownTexts = new Map<number, Phaser.GameObjects.Text>();
  private tileGlows = new Map<number, Phaser.GameObjects.Image>();
  private bgm?: Phaser.Sound.BaseSound;

  private boardOrigin = { x: 0, y: 0 };
  private currentTurn: "player" | "boss" = "player";
  private gameOver = false;
  // Hint system
  private hintTimer?: Phaser.Time.TimerEvent;
  private hintTweens: (Phaser.Tweens.Tween | Phaser.Tweens.TweenChain)[] = [];
  private hintedSpriteIds: number[] = [];
  private potentialMoves: PotentialMove[] = [];
  private lastHintIndex = -1;

  // Tutorial & tips
  private bombTipShown = false;
  private shieldTipShown = false;
  private activeTip?: SpeechBubble;
  private tutorialActive = false;
  private tutorialOverlay?: Phaser.GameObjects.Rectangle;
  private tutorialBubble?: SpeechBubble;
  private tutorialHand?: Phaser.GameObjects.Image;
  private tutorialHandChain?: Phaser.Tweens.TweenChain;
  private tutorialHandDelay?: Phaser.Time.TimerEvent;
  private tutorialHintOverlays: Phaser.GameObjects.Image[] = [];
  private tutorialHintTweens: (Phaser.Tweens.Tween | Phaser.Tweens.TweenChain)[] = [];

  private cascadeCount = 0;
  private cascadeHitCount = 0;
  private hitCounterText?: Phaser.GameObjects.Text;

  // Hint glow sprites (white silhouette clones)
  private hintOverlays: Phaser.GameObjects.Image[] = [];
  private hintSyncFn?: () => void;
  private hintRects: Phaser.GameObjects.Rectangle[] = [];

  // Press glow (pressed tile only)
  private pressGlow?: Phaser.GameObjects.Image;
  private gridGfx?: Phaser.GameObjects.Graphics;

  // Mute button (task 3)
  private muteButton?: Phaser.GameObjects.Text;

  // Game stats (task 9)
  private stats = {
    totalDamageDealt: 0,
    totalDamageReceived: 0,
    totalHealDone: 0,
    maxCascade: 0,
    turnsPlayed: 0,
    skillsUsed: 0,
    bombsDefused: 0,
  };

  // Red vignette overlay (low HP warning)
  private vignetteGfx?: Phaser.GameObjects.Graphics;
  private vignetteTween?: Phaser.Tweens.Tween;

  // Perk system
  private perkManager!: PerkManager;
  private prevBossLayerIdx = 0;
  private pendingPerkCount = 0;

  constructor() {
    super("GameScene");
  }

  private sfx(key: string, volume = 0.5) {
    if (isMuted()) return;
    if (!this.cache.audio.exists(key)) return;
    const finalVolume = volume * getVolume();
    const mgr = this.sound as Phaser.Sound.WebAudioSoundManager;
    if (mgr.context?.state === "suspended") {
      mgr.context.resume().then(() => this.sound.play(key, { volume: finalVolume }));
      return;
    }
    this.sound.play(key, { volume: finalVolume });
  }

  // Данные о состоянии фона/босса из интро (для плавного перехода)

  create(data?: {
    fromIntro?: boolean;
    finalDialogue?: string;
    startHidden?: boolean;
    bgState?: { x: number; y: number; scale: number };
    bossState?: { x: number; y: number; scale: number };
  }) {
    // Очистить старые ссылки (важно при restart - Phaser переиспользует экземпляр)
    this.bossImage = undefined;
    this.bossImageGlow = undefined;
    this.bossGlowBrightness = undefined;
    this.bossHpBar = undefined;
    this.playerHpBar = undefined;
    this.manaBar = undefined;
    this.cooldownIcon = undefined;
    this.playerAvatar = undefined;
    this.hammerOverlay = undefined;
    this.hammerHint = undefined;
    this.bossShieldOverlay = undefined;
    this.bossShieldGlowTween = undefined;
    this.bossShieldText = undefined;
    this.skillButtons = {};
    this.muteButton = undefined;
    this.vignetteGfx = undefined;
    this.vignetteTween = undefined;
    this.bgm = undefined;

    this.cameras.main.setZoom(DPR);
    this.cameras.main.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    this.cameras.main.setBackgroundColor("#0d0f1a");
    this.boardOrigin = {
      x: UI_LAYOUT.boardOriginX,
      y: UI_LAYOUT.boardOriginY,
    };

    const startHidden = data?.startHidden ?? false;

    this.buildHud(startHidden);
    this.resetState();
    this.buildBoard(startHidden);
    this.buildSkills(startHidden);
    this.setupInputHandlers();
    this.updateHud();

    // BGM starts in IntroScene; on restart, resume if it exists in the global sound manager
    if (!this.bgm) {
      const existing = this.sound.get(ASSET_KEYS.music.bgm);
      if (existing) {
        this.bgm = existing;
      } else if (this.cache.audio.exists(ASSET_KEYS.music.bgm)) {
        try {
          this.bgm = this.sound.add(ASSET_KEYS.music.bgm, { loop: true, volume: 0.3 * getVolume() });
          if (!isMuted()) this.bgm.play();
        } catch { /* audio not available */ }
      }
    }

    // Если не скрыто и есть финальный диалог - показываем сразу
    // При startHidden диалог будет показан после triggerFadeIn()
    if (!startHidden) {
      if (this.tutorialActive) {
        this.pendingFinalDialogue = data?.finalDialogue;
        this.showFirstMoveTutorial();
      } else if (data?.finalDialogue) {
        this.showFinalIntroBubble(data.finalDialogue).then(() => {
          this.startHintTimer();
        });
      } else {
        this.startHintTimer();
      }
    }
  }

  private fadeInUI(): Promise<void> {
    // Собираем все UI элементы кроме босса
    const elementsToFade = this.children.list.filter(
      child => child !== this.bossImage && child !== this.bossImageGlow && (child as any).alpha !== undefined
    );

    return tweenPromise(this, {
      targets: elementsToFade,
      alpha: 1,
      duration: INTRO_ANIMATION.gameElementsFadeIn,
      ease: "Quad.easeOut",
    });
  }

  public async triggerFadeIn(finalDialogue?: string): Promise<void> {
    await this.fadeInUI();
    if (this.tutorialActive) {
      // Save dialogue for after tutorial completes
      this.pendingFinalDialogue = finalDialogue;
      this.showFirstMoveTutorial();
    } else {
      if (finalDialogue) {
        await this.showFinalIntroBubble(finalDialogue);
      }
      this.startHintTimer();
    }
  }

  private async showFinalIntroBubble(text: string) {
    const bubbleY = UI_LAYOUT.bossNameY - 40; // Ниже (было -100)
    const bubble = new SpeechBubble(this, GAME_WIDTH / 2, bubbleY, {
      text,
      tailDirection: "up",
      maxWidth: 320,
      fontSize: "18px", // Меньше (было 22px)
    });
    bubble.setDepth(100);

    await bubble.fadeIn();
    await waitOrTap(this, INTRO_ANIMATION.speechBubbleHold, 101);
    await bubble.fadeOut();
  }

  private resetState() {
    this.stopHintTimer();
    this.bossHp = GAME_PARAMS.boss.hpMax;
    this.playerHp = GAME_PARAMS.player.hpMax;
    this.mana = 0;
    this.currentTurn = "player";
    this.gameOver = false;
    this.busy = false;
    this.settingsOpen = false;
    this.hammerMode = false;
    this.bossShieldDuration = 0;
    this.bossDamageArtActive = false;
    this.skillCooldowns = { powerStrike: 0, stun: 0, heal: 0, hammer: 0 };
    this.bombTipShown = false;
    this.shieldTipShown = false;
    this.activeTip = undefined;
    this.stats = {
      totalDamageDealt: 0, totalDamageReceived: 0, totalHealDone: 0,
      maxCascade: 0, turnsPlayed: 0, skillsUsed: 0, bombsDefused: 0,
    };
    this.tutorialActive = true;
    this.tutorialHandChain = undefined;
    this.tutorialHintOverlays = [];
    this.tutorialHintTweens = [];
    this.board = Match3Board.fromGrid(BOARD_WIDTH, BOARD_HEIGHT, TUTORIAL_BOARD);
    this.bossAbilityManager = new BossAbilityManager();
    this.perkManager = new PerkManager();
    this.perkManager.reset(); // Restore SKILL_CONFIG to baseline values
    this.prevBossLayerIdx = getBossLayerCount();
    this.pendingPerkCount = 0;
    this.tileSprites.clear();
    this.tilePositions.clear();
    this.clearBombCooldownTexts();
    this.clearTileGlows();
    this.rebuildPositionMap();
    this.hideBossShieldOverlay(true);
    this.hideVignette();
  }

  private clearBombCooldownTexts() {
    this.bombCooldownTexts.forEach(text => text.destroy());
    this.bombCooldownTexts.clear();
  }

  private clearTileGlows() {
    this.tileGlows.forEach(glow => {
      this.tweens.killTweensOf(glow);
      glow.destroy();
    });
    this.tileGlows.clear();
  }

  private createBombCooldownText(tileId: number, x: number, y: number, cooldown: number): Phaser.GameObjects.Text {
    const text = this.add.text(x, y, cooldown.toString(), {
      fontSize: "16px",
      fontFamily: "'Exo 2', Arial, sans-serif",
      color: "#ffffff",
      fontStyle: "bold",
      stroke: "#000000",
      strokeThickness: 3,
      resolution: 2,
    }).setOrigin(0.5).setDepth(2);
    this.bombCooldownTexts.set(tileId, text);
    return text;
  }

  private buildHud(startHidden = false) {
    const L = UI_LAYOUT;
    const initialAlpha = startHidden ? 0 : 1;

    // === ФОН (всегда из конфига — единый источник правды) ===
    this.bgImage = this.add.image(0, 0, ASSET_KEYS.game.background);
    this.bgImage.setOrigin(0.5, 0);
    this.bgImage.setDepth(-2);
    const bgBaseScale = GAME_WIDTH / this.bgImage.width;
    const bgScale = bgBaseScale * GAME_PARAMS.background.zoomScale;
    this.bgImage.setScale(bgScale);
    this.bgImage.setPosition(GAME_WIDTH / 2, GAME_PARAMS.background.offsetY);

    // === ИЗОБРАЖЕНИЕ БОССА (двухслойное: glow + solid) ===
    const bossY = GAME_PARAMS.background.offsetY + GAME_PARAMS.background.bossOnBgY * this.bgImage.displayHeight;
    const bossScale = bgScale * GAME_PARAMS.background.bossScale;

    this.bossImageGlow = this.add
      .image(0, 0, ASSET_KEYS.boss.mainBack)
      .setOrigin(0.5, 0.5)
      .setDepth(-0.1)
      .setAlpha(1);
    this.bossImageGlow.setPosition(GAME_WIDTH / 2, bossY);
    this.bossImageGlow.setScale(bossScale);

    // Additive brightness overlay — only increases brightness, never dims base
    this.bossGlowBrightness = this.add
      .image(0, 0, ASSET_KEYS.boss.mainBack)
      .setOrigin(0.5, 0.5)
      .setDepth(-0.05)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0);
    this.bossGlowBrightness.setPosition(GAME_WIDTH / 2, bossY);
    this.bossGlowBrightness.setScale(bossScale);

    // Crop the brightness overlay so it doesn't bleed below boss name area
    const glowTexH = this.bossGlowBrightness.texture.getSourceImage().height;
    const maxBottomY = L.bossNameY - bossY + (glowTexH * bossScale) / 2;
    const cropH = Math.max(0, Math.min(glowTexH, maxBottomY / bossScale));
    if (cropH < glowTexH) {
      this.bossGlowBrightness.setCrop(0, 0, this.bossGlowBrightness.texture.getSourceImage().width, cropH);
    }

    this.tweens.add({
      targets: this.bossGlowBrightness,
      alpha: { from: 0, to: VISUAL_EFFECTS.bossGlowPulseMax },
      duration: 1500,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });

    this.bossImage = this.add
      .image(0, 0, ASSET_KEYS.boss.main)
      .setOrigin(0.5, 0.5)
      .setDepth(0);
    this.bossImage.setPosition(GAME_WIDTH / 2, bossY);
    this.bossImage.setScale(bossScale);

    // === НАЗВАНИЕ БОССА ===
    this.add
      .text(L.bossHpBarX, L.bossNameY, "Сафира: Пламя Бездны", {
        fontSize: "16px",
        color: "#ffffff",
        fontFamily: "'Exo 2', Arial, sans-serif",
        stroke: "#000000",
        strokeThickness: 4,
        resolution: 2,
      })
      .setOrigin(0, 0.5)
      .setDepth(4)
      .setAlpha(initialAlpha);

    // === HP БАР БОССА (layered, с trailing delta) ===
    const bossBarHeight = L.hpBarHeight + 8;
    this.bossHpBar = new LayeredMeter(
      this, L.bossHpBarX, L.bossHpBarY - 2,
      L.hpBarWidth, bossBarHeight,
      getBossLayerHpArray(), [...BOSS_LAYER_COLORS]
    ).setDepth(4).setAlpha(initialAlpha);

    // === ИКОНКА КУЛДАУНА ===
    this.cooldownIcon = new CooldownIcon(this, L.cooldownIconX, L.cooldownIconY, L.cooldownIconSize);
    this.cooldownIcon.setDepth(4).setAlpha(initialAlpha);

    // === АВАТАР ИГРОКА (изображение с золотой рамкой и маской) ===
    // Золотая рамка
    const frameGraphics = this.add.graphics();
    const framePadding = 4;
    frameGraphics.fillStyle(0x4caf50, 1);
    frameGraphics.fillRoundedRect(
      L.avatarX - L.avatarWidth / 2 - framePadding,
      L.avatarY - L.avatarHeight / 2 - framePadding,
      L.avatarWidth + framePadding * 2,
      L.avatarHeight + framePadding * 2,
      6
    );
    frameGraphics.setDepth(3).setAlpha(initialAlpha);

    // Тёмный фон под аватаром
    this.add
      .rectangle(L.avatarX, L.avatarY, L.avatarWidth, L.avatarHeight, 0x1a1a2e)
      .setDepth(3)
      .setAlpha(initialAlpha);

    // Изображение аватара
    const playerAvatarImg = this.add
      .image(L.avatarX, L.avatarY, ASSET_KEYS.player.avatar)
      .setDepth(4)
      .setAlpha(initialAlpha);
    const avatarScaleX = L.avatarWidth / playerAvatarImg.width;
    const avatarScaleY = L.avatarHeight / playerAvatarImg.height;
    const avatarScale = Math.max(avatarScaleX, avatarScaleY) * 0.95;
    playerAvatarImg.setScale(avatarScale);

    // Маска для обрезки аватара по рамке
    const avatarMask = this.add.graphics();
    avatarMask.fillStyle(0xffffff);
    avatarMask.fillRect(
      L.avatarX - L.avatarWidth / 2,
      L.avatarY - L.avatarHeight / 2,
      L.avatarWidth,
      L.avatarHeight
    );
    avatarMask.setVisible(false);
    playerAvatarImg.setMask(avatarMask.createGeometryMask());

    // Невидимый прямоугольник как таргет для анимаций
    this.playerAvatar = this.add
      .rectangle(L.avatarX, L.avatarY, L.avatarWidth, L.avatarHeight, 0x000000, 0)
      .setDepth(3);

    // === HP БАР ИГРОКА (always green + heal icon + trailing delta) ===
    this.playerHpBar = new Meter(
      this, L.playerHpBarX, L.playerHpBarY,
      L.playerBarWidth, L.playerBarHeight, "", UI_COLORS.playerHp, true,
      { alwaysGreen: true, trailingDelta: true, iconKey: ASSET_KEYS.tiles[TileKind.Heal], iconSize: L.playerBarHeight * 1.75 }
    ).setDepth(4).setAlpha(initialAlpha);

    // === MANA БАР ИГРОКА (mana icon) ===
    this.manaBar = new Meter(
      this, L.playerHpBarX, L.playerMpBarY,
      L.playerBarWidth, L.playerBarHeight, "", UI_COLORS.playerMana, false,
      { iconKey: ASSET_KEYS.tiles[TileKind.Mana], iconSize: L.playerBarHeight * 1.75 }
    ).setDepth(4).setAlpha(initialAlpha);

    // === КНОПКА MUTE ===
    this.muteButton = this.add
      .text(GAME_WIDTH - 70, 65 + SAFE_AREA.top, isMuted() ? "🔇" : "🔊", {
        fontSize: "26px",
        fontFamily: "'Exo 2', Arial, sans-serif",
        resolution: 2,
      })
      .setOrigin(0.5)
      .setDepth(5)
      .setAlpha(initialAlpha)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => {
        const nowMuted = toggleMute();
        this.muteButton?.setText(nowMuted ? "🔇" : "🔊");
        if (this.bgm) {
          if (nowMuted) this.bgm.pause();
          else this.bgm.resume();
        }
      });

    // === КНОПКА НАСТРОЕК ===
    this.add
      .text(GAME_WIDTH - 35, 65 + SAFE_AREA.top, "⚙️", {
        fontSize: "26px",
        fontFamily: "'Exo 2', Arial, sans-serif",
        resolution: 2,
      })
      .setOrigin(0.5)
      .setDepth(5)
      .setAlpha(initialAlpha)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.openSettings());
  }

  private openSettings() {
    if (this.settingsOpen || this.busy) return;
    this.settingsOpen = true;
    new SettingsPanel(this, () => {
      this.settingsOpen = false;
    });
  }

  private buildBoard(startHidden = false) {
    const initialAlpha = startHidden ? 0 : 1;

    const widthPx = BOARD_WIDTH * CELL_SIZE;
    const heightPx = BOARD_HEIGHT * CELL_SIZE;
    const bg = this.add
      .rectangle(
        this.boardOrigin.x - BOARD_PADDING,
        this.boardOrigin.y - BOARD_PADDING,
        widthPx + BOARD_PADDING * 2,
        heightPx + BOARD_PADDING * 2,
        UI_COLORS.boardBg,
        0.9
      )
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0xffffff, 0.15)
      .setAlpha(initialAlpha);
    // Depth 0.5 чтобы закрывать Сафиру (0), но быть под тайлами (1)
    bg.setDepth(0.5);

    // Semi-transparent grid lines
    this.gridGfx = this.add.graphics();
    this.gridGfx.lineStyle(1, 0xffffff, 0.15);
    for (let col = 1; col < BOARD_WIDTH; col++) {
      const lx = this.boardOrigin.x + col * CELL_SIZE;
      this.gridGfx.moveTo(lx, this.boardOrigin.y);
      this.gridGfx.lineTo(lx, this.boardOrigin.y + heightPx);
    }
    for (let row = 1; row < BOARD_HEIGHT; row++) {
      const ly = this.boardOrigin.y + row * CELL_SIZE;
      this.gridGfx.moveTo(this.boardOrigin.x, ly);
      this.gridGfx.lineTo(this.boardOrigin.x + widthPx, ly);
    }
    this.gridGfx.strokePath();
    this.gridGfx.setDepth(0.6).setAlpha(initialAlpha);

    for (let y = 0; y < BOARD_HEIGHT; y++) {
      for (let x = 0; x < BOARD_WIDTH; x++) {
        const tile = this.board.getTile({ x, y });
        if (tile) {
          this.spawnTileSprite(tile, { x, y }, initialAlpha);
        }
      }
    }
  }

  private buildSkills(startHidden = false) {
    const L = UI_LAYOUT;
    const btnSize = L.skillButtonSize;
    const spacing = L.skillButtonSpacing;
    const startX = L.skillButtonsStartX;
    const y = L.skillButtonsY;
    const initialAlpha = startHidden ? 0 : 1;

    // Create all 4 buttons in locked state, positioned left-to-right
    SKILL_IDS.forEach((id, idx) => {
      const cfg = SKILL_CONFIG[id];
      const btn = new SkillButton(
        this,
        startX + idx * (btnSize + spacing),
        y,
        btnSize,
        cfg.icon,
        cfg.cost,
        () => this.activateSkill(id),
        cfg.iconTexture
      );
      btn.setDepth(2).setAlpha(initialAlpha);
      this.skillButtons[id] = btn;
    });

    // Initially all locked — updateHud will position unlocked ones
    this.repositionSkillButtons();
  }

  /** Reposition skill buttons: unlocked left-to-right, locked as empty circles */
  private repositionSkillButtons() {
    const L = UI_LAYOUT;
    const btnSize = L.skillButtonSize;
    const spacing = L.skillButtonSpacing;
    const startX = L.skillButtonsStartX;
    const y = L.skillButtonsY;

    const unlocked = this.perkManager?.unlockedOrder ?? [];

    // Position unlocked skills left-to-right
    unlocked.forEach((id, idx) => {
      const btn = this.skillButtons[id];
      if (btn) {
        btn.setPosition(startX + idx * (btnSize + spacing), y);
        btn.setVisible(true);
      }
    });

    // Show locked skills as empty circles after unlocked ones
    let slotIdx = unlocked.length;
    SKILL_IDS.forEach((id) => {
      if (!unlocked.includes(id)) {
        const btn = this.skillButtons[id];
        if (btn) {
          btn.setPosition(startX + slotIdx * (btnSize + spacing), y);
          btn.setVisible(true);
          btn.applyState({ enabled: false, ready: false, locked: true });
          slotIdx++;
        }
      }
    });
  }

  private clearPressGlow() {
    this.pressGlow?.destroy();
    this.pressGlow = undefined;
  }

  private setupInputHandlers() {
    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      this.clearPressGlow();

      const start = this.dragStart;
      this.dragStart = null;

      if (!start || !this.canPlayerAct()) return;

      const dx = pointer.x - start.point.x;
      const dy = pointer.y - start.point.y;
      const isTap = Math.abs(dx) < INPUT_THRESHOLD.tapDistance && Math.abs(dy) < INPUT_THRESHOLD.tapDistance;

      if (isTap) {
        // Tap does nothing — no special tiles to activate
      } else {
        const dir = this.getSwipeDirection(dx, dy);
        const target = { x: start.pos.x + dir.x, y: start.pos.y + dir.y };
        this.attemptSwap(start.pos, target);
      }
    });

    this.input.on("pointerupoutside", () => {
      this.clearPressGlow();
    });
  }

  private canPlayerAct(): boolean {
    return !this.busy && !this.gameOver && this.currentTurn === "player" && this.playerHp > 0 && this.bossHp > 0;
  }

  private getSwipeDirection(dx: number, dy: number): Position {
    return Math.abs(dx) > Math.abs(dy)
      ? { x: Math.sign(dx), y: 0 }
      : { x: 0, y: Math.sign(dy) };
  }

  private attemptSwap(a: Position, b: Position) {
    this.clearPressGlow();
    if (!this.board.inBounds(a) || !this.board.inBounds(b)) return;
    const tileA = this.board.getTile(a);
    const tileB = this.board.getTile(b);
    if (!tileA || !tileB) return;

    // Бомбы нельзя перемещать
    if (tileA.kind === TileKind.Bomb || tileB.kind === TileKind.Bomb) return;

    // Tutorial: only allow the specific swap
    if (this.tutorialActive) {
      const correctFwd = a.x === TUTORIAL_FROM.x && a.y === TUTORIAL_FROM.y &&
                          b.x === TUTORIAL_TO.x && b.y === TUTORIAL_TO.y;
      const correctBwd = b.x === TUTORIAL_FROM.x && b.y === TUTORIAL_FROM.y &&
                          a.x === TUTORIAL_TO.x && a.y === TUTORIAL_TO.y;
      if (!correctFwd && !correctBwd) return;
    }

    this.stopHintTimer();
    this.busy = true;

    // Clear tutorial before swap animation so tiles restore depth
    const wasTutorial = this.tutorialActive;
    if (wasTutorial) {
      this.clearTutorial();
      // Show pending dialogue after tutorial
      if (this.pendingFinalDialogue) {
        const dialogue = this.pendingFinalDialogue;
        this.pendingFinalDialogue = undefined;
        this.showFinalIntroBubble(dialogue);
      }
    }

    this.board.swap(a, b);
    this.rebuildPositionMap();
    this.animateSwap(tileA.id, tileB.id)
      .then(() => {
        const matches = this.board.findMatches();
        if (!matches.length) {
          // invalid swap, revert
          this.sfx(ASSET_KEYS.sfx.gemSwipe);
          this.board.swap(a, b);
          this.rebuildPositionMap();
          return this.animateSwap(tileA.id, tileB.id);
        }
        return this.resolveBoard(matches, [a, b], true, "player");
      })
      .finally(() => {
        if (!this.gameOver && this.currentTurn === "player") {
          this.busy = false;
          this.startHintTimer();
        }
      });
  }

  private async resolveBoard(
    matches: Match[],
    swapTargets: Position[],
    endTurnAfter = false,
    actor: "player" | "boss" = "player"
  ) {
    let loopMatches = matches;
    this.cascadeCount = 0;
    this.cascadeHitCount = 0;

    while (loopMatches.length) {
      const outcome = this.board.computeClearOutcome(
        loopMatches,
        swapTargets
      );
      if (!outcome.cleared.length && !outcome.transforms.length) break;

      this.sfx(ASSET_KEYS.sfx.gemDestroy);
      this.cascadeCount++;

      // Haptic for first match / cascades
      if (this.cascadeCount === 1) hapticMedium();
      else hapticHeavy();

      // Track max cascade for stats
      this.stats.maxCascade = Math.max(this.stats.maxCascade, this.cascadeCount);

      // Show cascade counter (x2, x3, ...)
      if (this.cascadeCount >= 2) {
        this.showCascadeCounter(this.cascadeCount);
      }

      // Show CRIT floating text BEFORE tiles fly (at collapse moment)
      this.showCritTexts(outcome.transforms);

      // Determine CRIT wave count from transforms
      const maxMultiplier = outcome.transforms.reduce(
        (max, t) => Math.max(max, t.multiplier ?? 1), 1
      );

      await this.animateClear(outcome, actor);

      // Wave 1: apply full results (damage + mana + heal)
      this.applyMatchResults(outcome.counts, actor);

      // Track hit counter for boss damage during cascades (skip if shielded)
      const didDamage = actor === "player" && this.computeDamageFromCounts(outcome.counts) > 0 && this.bossShieldDuration <= 0;
      if (didDamage) {
        this.cascadeHitCount++;
        if (this.cascadeHitCount >= 2) {
          this.updateHitCounter(this.cascadeHitCount);
        }
      }

      // Additional CRIT waves: apply only damage with delay between hits
      if (maxMultiplier > 1 && !this.gameOver) {
        const baseDamage = this.computeDamageFromCounts(outcome.counts);
        for (let wave = 1; wave < maxMultiplier && !this.gameOver; wave++) {
          await wait(this, ANIMATION_DURATIONS.critWaveDelay);
          this.applyCritWaveDamage(baseDamage, actor);
          if (actor === "player" && baseDamage > 0 && this.bossShieldDuration <= 0) {
            this.cascadeHitCount++;
            this.updateHitCounter(this.cascadeHitCount);
          }
        }
      }

      // Perk selection mid-cascade (pause cascade for perk pick)
      while (this.pendingPerkCount > 0 && !this.gameOver) {
        this.pendingPerkCount--;
        await this.showPerkSelection();
      }

      // Если игра закончилась - прекращаем цикл
      if (this.gameOver) break;

      // Проверяем бомбы рядом с очищенными И трансформированными позициями
      // (трансформация = матч произошёл, бомба рядом должна обезвреживаться)
      const clearedPositions = outcome.cleared.map(c => c.pos);
      const transformPositions = outcome.transforms.map(t => t.pos);
      const allMatchPositions = [...clearedPositions, ...transformPositions];
      const adjacentBombs = this.board.getAdjacentBombs(allMatchPositions);
      if (adjacentBombs.length > 0) {
        await this.defuseBombs(adjacentBombs);
      }

      const collapse = this.board.applyClearOutcome(outcome);
      this.rebuildPositionMap();
      await this.animateCollapse(collapse);

      loopMatches = this.board.findMatches();
      swapTargets = [];
    }

    // Fade out hit counter after cascades
    this.fadeOutHitCounter();

    // Crossfade damage art back to idle after all cascades finish
    if (!this.gameOver) {
      await this.restoreBossArtFromDamage();
    } else {
      this.bossDamageArtActive = false;
    }

    // Drain accumulated HP deltas after all cascades
    this.bossHpBar?.drainDelta();
    this.playerHpBar?.drainDelta();

    // Check for deadlock after cascades settle
    if (!this.gameOver) {
      await this.checkAndReshuffle();
    }

    if (endTurnAfter && !this.gameOver) {
      await this.finishPlayerTurn();
    }
  }

  private applyMatchResults(totals: CountTotals, actor: "player" | "boss") {
    const physDamage = totals[TileKind.Sword] * GAME_PARAMS.tiles.swordDamage;
    const magDamage = totals[TileKind.Star] * GAME_PARAMS.tiles.starDamage;
    const damage = physDamage + Math.floor(magDamage * PLAYER_MAG_DAMAGE_MULTIPLIER);
    const manaGain = totals[TileKind.Mana] * GAME_PARAMS.tiles.mpPerTile;
    const healGain = totals[TileKind.Heal] * GAME_PARAMS.tiles.hpPerTile;

    if (actor === "player") {
      this.applyDamageToBoss(damage);
      this.applyManaToPlayer(manaGain);
      this.applyHealToPlayer(healGain);
    } else {
      this.applyDamageToPlayer(damage);
      this.applyHealToBoss(healGain);
    }

    this.updateHud();
    this.checkGameOver();
  }

  private computeDamageFromCounts(totals: CountTotals): number {
    const physDamage = totals[TileKind.Sword] * GAME_PARAMS.tiles.swordDamage;
    const magDamage = totals[TileKind.Star] * GAME_PARAMS.tiles.starDamage;
    return physDamage + Math.floor(magDamage * PLAYER_MAG_DAMAGE_MULTIPLIER);
  }

  private applyCritWaveDamage(damage: number, actor: "player" | "boss") {
    if (damage <= 0) return;
    if (actor === "player") {
      this.applyDamageToBoss(damage);
    } else {
      this.applyDamageToPlayer(damage);
    }
    this.updateHud();
    this.checkGameOver();
  }

  private showCritTexts(transforms: Array<{ pos: Position; multiplier?: number }>) {
    for (const t of transforms) {
      if (!t.multiplier || t.multiplier <= 1) continue;
      const world = this.toWorld(t.pos);
      const isMega = t.multiplier >= CRIT_MULTIPLIERS.match5;
      const label = isMega ? `MEGA CRIT! x${t.multiplier}` : `CRIT! x${t.multiplier}`;
      const text = this.add
        .text(world.x, world.y - CELL_SIZE * 0.8, label, {
          fontSize: isMega ? "28px" : "24px",
          color: "#ffd700",
          fontFamily: "'Exo 2', Arial, sans-serif",
          fontStyle: "bold",
          stroke: "#000000",
          strokeThickness: 5,
          resolution: 2,
        })
        .setOrigin(0.5)
        .setDepth(100)
        .setScale(0.5);

      this.tweens.add({
        targets: text,
        scale: 1,
        duration: 200,
        ease: "Back.easeOut",
      });
      this.tweens.add({
        targets: text,
        y: text.y - 50,
        alpha: 0,
        duration: 800,
        delay: 300,
        ease: "Quad.easeOut",
        onComplete: () => text.destroy(),
      });
    }
  }

  // --- Red vignette (low HP warning) ---

  private readonly VIGNETTE_HP_THRESHOLD = 0.3;
  private readonly VIGNETTE_ALPHA_MIN = 0.25;
  private readonly VIGNETTE_ALPHA_MAX = 0.5;
  private readonly VIGNETTE_DEPTH = 5.5;
  private hpBarPulseTween?: Phaser.Tweens.Tween;

  private updateVignette() {
    const hpRatio = this.playerHp / GAME_PARAMS.player.hpMax;
    if (hpRatio < this.VIGNETTE_HP_THRESHOLD && this.playerHp > 0) {
      this.showVignette();
    } else {
      this.hideVignette();
    }
  }

  private showVignette() {
    if (this.vignetteGfx) return; // already visible

    const gfx = this.add.graphics();
    gfx.setDepth(this.VIGNETTE_DEPTH);

    // Draw red gradient edges (4 edge rects with alpha gradient via fillGradientStyle)
    const w = GAME_WIDTH;
    const h = GAME_HEIGHT;
    const edgeSize = Math.min(w, h) * 0.25;

    // Top edge
    gfx.fillGradientStyle(0xff0000, 0xff0000, 0xff0000, 0xff0000, 0.8, 0.8, 0, 0);
    gfx.fillRect(0, 0, w, edgeSize);
    // Bottom edge
    gfx.fillGradientStyle(0xff0000, 0xff0000, 0xff0000, 0xff0000, 0, 0, 0.8, 0.8);
    gfx.fillRect(0, h - edgeSize, w, edgeSize);
    // Left edge
    gfx.fillGradientStyle(0xff0000, 0xff0000, 0xff0000, 0xff0000, 0.6, 0, 0.6, 0);
    gfx.fillRect(0, 0, edgeSize, h);
    // Right edge
    gfx.fillGradientStyle(0xff0000, 0xff0000, 0xff0000, 0xff0000, 0, 0.6, 0, 0.6);
    gfx.fillRect(w - edgeSize, 0, edgeSize, h);

    gfx.setAlpha(this.VIGNETTE_ALPHA_MIN);
    this.vignetteGfx = gfx;

    this.vignetteTween = this.tweens.add({
      targets: gfx,
      alpha: { from: this.VIGNETTE_ALPHA_MIN, to: this.VIGNETTE_ALPHA_MAX },
      duration: 1200,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });

    // Sync HP bar pulse — scale up slightly (looks "brighter"/more intense)
    if (this.playerHpBar && !this.hpBarPulseTween) {
      this.hpBarPulseTween = this.tweens.add({
        targets: this.playerHpBar,
        scaleX: { from: 1.0, to: 1.06 },
        scaleY: { from: 1.0, to: 1.06 },
        duration: 600,
        ease: "Sine.easeInOut",
        yoyo: true,
        repeat: -1,
      });
    }
  }

  private hideVignette() {
    if (!this.vignetteGfx) return;
    if (this.vignetteTween) {
      this.vignetteTween.stop();
      this.vignetteTween = undefined;
    }
    this.vignetteGfx.destroy();
    this.vignetteGfx = undefined;

    // Stop HP bar pulse and restore normal scale
    if (this.hpBarPulseTween) {
      this.hpBarPulseTween.stop();
      this.hpBarPulseTween = undefined;
      this.playerHpBar?.setScale(1);
    }
  }

  // --- Perk selection UI ---

  private async showPerkSelection(): Promise<void> {
    const perks = this.perkManager.getRandomPerks(PERKS_TO_OFFER);
    if (perks.length === 0) return;

    this.busy = true;

    // "Уровень повышен" — black text on yellow banner
    const bannerY = GAME_HEIGHT * 0.26;
    const bannerW = GAME_WIDTH * 0.7;
    const bannerH = 40;
    const bannerGfx = this.add.graphics().setDepth(201).setAlpha(0);
    bannerGfx.fillStyle(0xffd700, 1);
    bannerGfx.fillRoundedRect(GAME_WIDTH / 2 - bannerW / 2, bannerY - bannerH / 2, bannerW, bannerH, 6);

    const levelText = this.add
      .text(GAME_WIDTH / 2, bannerY, "Уровень повышен", {
        fontSize: "26px",
        color: "#000000",
        fontFamily: "'Exo 2', Arial, sans-serif",
        fontStyle: "bold",
        resolution: 2,
      })
      .setOrigin(0.5)
      .setDepth(201)
      .setAlpha(0);

    // "Выбери новую способность!" — gold text on semi-transparent black
    const subY = bannerY + bannerH / 2 + 24;
    const subW = GAME_WIDTH * 0.8;
    const subH = 32;
    const subBgGfx = this.add.graphics().setDepth(201).setAlpha(0);
    subBgGfx.fillStyle(0x000000, 0.6);
    subBgGfx.fillRoundedRect(GAME_WIDTH / 2 - subW / 2, subY - subH / 2, subW, subH, 4);

    const subtitleText = this.add
      .text(GAME_WIDTH / 2, subY, "Выбери новую способность!", {
        fontSize: "18px",
        color: "#ffd700",
        fontFamily: "'Exo 2', Arial, sans-serif",
        fontStyle: "bold",
        resolution: 2,
      })
      .setOrigin(0.5)
      .setDepth(201)
      .setAlpha(0);

    // Dark overlay
    const overlay = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7)
      .setOrigin(0, 0)
      .setDepth(200)
      .setAlpha(0);

    // Show "Уровень повышен" banner first (without overlay)
    await tweenPromise(this, {
      targets: [bannerGfx, levelText],
      alpha: 1,
      duration: 300,
      ease: "Quad.easeOut",
    });

    // Brief pause to let player read
    await wait(this, 600);

    // Then darken screen + show subtitle
    await tweenPromise(this, {
      targets: overlay,
      alpha: 1,
      duration: 200,
      ease: "Quad.easeOut",
    });
    await tweenPromise(this, {
      targets: [subBgGfx, subtitleText],
      alpha: 1,
      duration: 200,
      ease: "Quad.easeOut",
    });

    // Create perk cards — adaptive size to fit screen
    const cardSpacing = 8;
    const sidePadding = 16;
    const cardWidth = Math.floor((GAME_WIDTH - sidePadding * 2 - cardSpacing * (perks.length - 1)) / perks.length);
    const cardHeight = Math.min(220, Math.floor(GAME_HEIGHT * 0.32));
    const totalWidth = perks.length * cardWidth + (perks.length - 1) * cardSpacing;
    const startX = GAME_WIDTH / 2 - totalWidth / 2 + cardWidth / 2;
    const cardY = GAME_HEIGHT * 0.32 + cardHeight / 2 + 20;

    const selectedPerk = await new Promise<PerkDef>((resolve) => {
      const cards: PerkCard[] = [];

      perks.forEach((perk, i) => {
        const x = startX + i * (cardWidth + cardSpacing);
        const level = this.perkManager.getLevel(perk.skillId);
        const manaCost = this.perkManager.getManaCost(perk.skillId);
        const desc = this.perkManager.getNextDescription(perk.skillId);

        const card = new PerkCard(
          this,
          x,
          cardY,
          perk,
          level,
          manaCost,
          desc,
          async () => {
            // Selected card scales up and fades
            await card.playSelect();
            // Dismiss other cards
            await Promise.all(
              cards.filter((c) => c !== card).map((c) => c.playDismiss())
            );
            // Cleanup
            cards.forEach((c) => c.destroy());
            resolve(perk);
          },
          { width: cardWidth, height: cardHeight },
        );
        card.setDepth(202);
        cards.push(card);
      });

      // Entrance animations
      cards.forEach((card, i) => {
        card.playEntrance(i * 100);
      });
    });

    // Apply perk
    const result = this.perkManager.applyPerk(selectedPerk.skillId);

    // Reposition buttons if new skill unlocked
    if (result.isNewUnlock) {
      this.repositionSkillButtons();
    }

    // Update skill button UI with new costs/values
    this.updateHud();

    // Fade out overlay and level text
    await Promise.all([
      tweenPromise(this, {
        targets: overlay,
        alpha: 0,
        duration: 200,
        ease: "Quad.easeIn",
      }),
      tweenPromise(this, {
        targets: [bannerGfx, levelText, subBgGfx, subtitleText],
        alpha: 0,
        duration: 200,
        ease: "Quad.easeIn",
      }),
    ]);

    overlay.destroy();
    bannerGfx.destroy();
    levelText.destroy();
    subBgGfx.destroy();
    subtitleText.destroy();

    this.busy = false;
  }

  private applyDamageToBoss(damage: number, skipSlash = false) {
    if (damage <= 0) return;

    // Проверка щита
    if (this.bossShieldDuration > 0) {
      this.sfx(ASSET_KEYS.sfx.enemyShield);
      if (this.bossShieldOverlay) {
        showDamageNumber(this, this.bossShieldOverlay.x, this.bossShieldOverlay.y, 0, "shield");
      }
      if (this.bossImage) {
        this.shakeTarget(this.bossLayers, VISUAL_EFFECTS.damageShakeOffset * 0.3);
      }
      return;
    }

    this.bossHp = Math.max(0, this.bossHp - damage);
    this.stats.totalDamageDealt += damage;
    this.sfx(ASSET_KEYS.sfx.gemDestroy);
    hapticMedium();
    this.bossHpBar?.setValue(this.bossHp, GAME_PARAMS.boss.hpMax);
    this.bossHpBar?.flash();
    if (this.bossImage) {
      const dmgTarget = this.bossTarget;
      showDamageNumber(this, dmgTarget.x, dmgTarget.y, damage, "damage");
      this.flashBoss(); // fire-and-forget: instant texture swap + white flash + shake
      if (!skipSlash) this.showSlashEffect(this.bossTarget, false);
    }

    // Track boss layer transition for perk system
    const newLayerIdx = getBossLayerIndex(this.bossHp);
    if (newLayerIdx < this.prevBossLayerIdx && newLayerIdx > 0) {
      // Count how many layers were crossed (supports multi-layer skip from CRIT)
      this.pendingPerkCount += this.prevBossLayerIdx - newLayerIdx;
    }
    this.prevBossLayerIdx = newLayerIdx;
  }

  private applyDamageToPlayer(damage: number) {
    if (damage <= 0) return;

    this.sfx(ASSET_KEYS.sfx.gemDestroy);
    hapticHeavy();
    this.stats.totalDamageReceived += damage;
    this.playerHp = clamp(this.playerHp - damage, 0, GAME_PARAMS.player.hpMax);
    this.playerHpBar?.setValue(this.playerHp, GAME_PARAMS.player.hpMax);
    this.playerHpBar?.flash();
    if (this.playerAvatar) {
      showDamageNumber(this, this.playerAvatar.x, this.playerAvatar.y - 30, damage, "damage");
    }
    this.updateVignette();
  }

  private applyManaToPlayer(manaGain: number) {
    if (manaGain <= 0) return;

    const oldMana = this.mana;
    this.mana = clamp(this.mana + manaGain, 0, GAME_PARAMS.player.manaMax);
    const actualGain = this.mana - oldMana;

    if (actualGain > 0) {
      this.sfx(ASSET_KEYS.sfx.gemDestroy, 0.3);
      this.manaBar?.setValue(this.mana, GAME_PARAMS.player.manaMax);
      this.manaBar?.flash();
      if (this.playerAvatar) {
        showDamageNumber(this, this.playerAvatar.x, this.playerAvatar.y - 20, actualGain, "mana");
      }
    }

  }

  private applyHealToPlayer(healGain: number) {
    if (healGain <= 0) return;

    const oldHp = this.playerHp;
    this.playerHp = clamp(this.playerHp + healGain, 0, GAME_PARAMS.player.hpMax);
    const actualHeal = this.playerHp - oldHp;

    if (actualHeal > 0) {
      this.stats.totalHealDone += actualHeal;
      this.sfx(ASSET_KEYS.sfx.gemDestroy);
      this.playerHpBar?.setValue(this.playerHp, GAME_PARAMS.player.hpMax);
      this.playerHpBar?.flash();
      if (this.playerAvatar) {
        showDamageNumber(this, this.playerAvatar.x, this.playerAvatar.y - 40, actualHeal, "heal");
      }
      this.updateVignette();
    }
  }

  private applyHealToBoss(healGain: number) {
    if (healGain <= 0) return;
    this.bossHp = clamp(this.bossHp + healGain, 0, GAME_PARAMS.boss.hpMax);
  }

  private shakeTarget(target: Phaser.GameObjects.Image | (Phaser.GameObjects.Image | undefined)[], offset: number) {
    const targets = (Array.isArray(target) ? target.filter(Boolean) : [target]) as Phaser.GameObjects.Image[];
    const saved = targets.map(t => t.x);
    this.tweens.add({
      targets,
      x: `+=${offset}`,
      duration: ANIMATION_DURATIONS.shakeDuration,
      yoyo: true,
      repeat: 2,
      onComplete: () => targets.forEach((t, i) => { if (t.scene) t.x = saved[i]; }),
    });
  }

  private bossDamageArtActive = false;

  private async flashBoss() {
    if (!this.bossImage) return;
    // Always show white flash even during active shake (rapid cascade hits)
    this.flashBossWhite();

    // Switch to damage texture on first hit, keep it for entire cascade
    if (!this.bossDamageArtActive) {
      this.bossDamageArtActive = true;
      this.bossImage.setTexture(ASSET_KEYS.boss.damage);
      this.bossImageGlow?.setTexture(ASSET_KEYS.boss.damageBack);
      this.bossGlowBrightness?.setTexture(ASSET_KEYS.boss.damageBack);
    }

    // Always shake on every hit
    const layers = this.bossLayers;
    const savedPositions = layers.map(t => ({ x: t.x, y: t.y }));
    await tweenPromise(this, {
      targets: layers,
      x: `+=${VISUAL_EFFECTS.damageShakeOffset}`,
      duration: ANIMATION_DURATIONS.shakeDuration,
      yoyo: true,
      repeat: 2,
    });

    // Restore exact positions (shake may leave offset)
    layers.forEach((t, i) => {
      if (t.scene) t.setPosition(savedPositions[i].x, savedPositions[i].y);
    });
  }

  /** Crossfade from damage art back to idle art. Called at end of resolveBoard. */
  private async restoreBossArtFromDamage() {
    if (!this.bossDamageArtActive || !this.bossImage || this.gameOver) return;
    this.bossDamageArtActive = false;

    // Crossfade all 3 boss layers: fade out damage art, switch texture, fade back in
    const layers = this.bossLayers;
    await tweenPromise(this, { targets: layers, alpha: 0, duration: 150 });
    this.updateBossArt();
    await tweenPromise(this, { targets: layers, alpha: 1, duration: 150 });
    this.startBossGlowPulse();
  }

  private flashBossWhite() {
    if (!this.bossImage) return;
    const flash = this.add.image(this.bossImage.x, this.bossImage.y, this.bossImage.texture.key)
      .setOrigin(this.bossImage.originX, this.bossImage.originY)
      .setScale(this.bossImage.scaleX, this.bossImage.scaleY)
      .setTintFill(0xffffff)
      .setAlpha(0.8)
      .setDepth(0.05);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 150,
      ease: "Quad.easeOut",
      onComplete: () => flash.destroy(),
    });
  }

  private checkGameOver() {
    if (this.bossHp <= 0) {
      this.showVictory();
    } else if (this.playerHp <= 0) {
      this.showDefeat();
    }
  }

  private getTileTexture(tile: Tile) {
    return ASSET_KEYS.tiles[tile.kind] ?? tile.kind;
  }

  private createTileGlow(sprite: Phaser.GameObjects.Image, alpha: number) {
    const tileSize = Math.round(CELL_SIZE * TILE_DISPLAY_SCALE);
    return this.add
      .image(sprite.x, sprite.y, sprite.texture.key)
      .setDisplaySize(tileSize, tileSize)
      .setTintFill(0xffffff)
      .setAlpha(alpha)
      .setDepth(1.5);
  }

  private spawnTileSprite(tile: Tile, pos: Position, startYOrAlpha?: number, initialAlpha?: number) {
    const world = this.toWorld(pos);
    // Если передан startY как число > 1, это Y-координата. Иначе это alpha.
    const startY = (startYOrAlpha !== undefined && startYOrAlpha > 1) ? startYOrAlpha : undefined;
    const alpha = initialAlpha ?? ((startYOrAlpha !== undefined && startYOrAlpha <= 1) ? startYOrAlpha : 1);

    const scale = tile.kind === TileKind.Bomb ? 1.0 : TILE_DISPLAY_SCALE;
    const tileSize = Math.round(CELL_SIZE * scale);
    const sprite = this.add
      .image(world.x, startY ?? world.y, this.getTileTexture(tile))
      .setDisplaySize(tileSize, tileSize)
      .setAlpha(alpha)
      .setInteractive({ useHandCursor: true });
    sprite.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      // Режим молотка — удаляем фишку
      if (this.hammerMode) {
        const current = this.tilePositions.get(tile.id) ?? pos;
        this.removeWithHammer(current);
        return;
      }

      if (this.busy || this.bossHp <= 0) return;

      // Бомбы нельзя перемещать
      if (tile.kind === TileKind.Bomb) return;

      const current = this.tilePositions.get(tile.id) ?? pos;

      // Tutorial: only allow dragging the specific tile
      if (this.tutorialActive) {
        if (current.x !== TUTORIAL_FROM.x || current.y !== TUTORIAL_FROM.y) return;
      }
      this.dragStart = {
        pos: { ...current },
        point: new Phaser.Math.Vector2(pointer.x, pointer.y),
      };

      // Press glow: highlight only the pressed tile
      this.clearPressGlow();
      this.pressGlow = this.createTileGlow(sprite, 0.5);
    });
    sprite.setDepth(1);
    this.tileSprites.set(tile.id, sprite);

    return sprite;
  }

  private rebuildPositionMap() {
    this.tilePositions.clear();
    for (let y = 0; y < BOARD_HEIGHT; y++) {
      for (let x = 0; x < BOARD_WIDTH; x++) {
        const tile = this.board.getTile({ x, y });
        if (tile) {
          this.tilePositions.set(tile.id, { x, y });
        }
      }
    }
  }

  private animateSwap(idA: number, idB: number): Promise<void> {
    const spriteA = this.tileSprites.get(idA);
    const spriteB = this.tileSprites.get(idB);
    const posA = spriteA ? this.tilePositions.get(idA) : null;
    const posB = spriteB ? this.tilePositions.get(idB) : null;

    if (!spriteA || !spriteB || !posA || !posB) {
      return Promise.resolve();
    }

    this.sfx(ASSET_KEYS.sfx.gemSwipe);
    hapticLight();
    const targetA = this.toWorld(posA);
    const targetB = this.toWorld(posB);

    // Move enhanced tile glows along with sprites
    const glowA = this.tileGlows.get(idA);
    if (glowA) {
      this.tweens.add({ targets: glowA, x: targetA.x, y: targetA.y, duration: ANIMATION_DURATIONS.swap, ease: ANIMATION_EASING.swap });
    }
    const glowB = this.tileGlows.get(idB);
    if (glowB) {
      this.tweens.add({ targets: glowB, x: targetB.x, y: targetB.y, duration: ANIMATION_DURATIONS.swap, ease: ANIMATION_EASING.swap });
    }

    return Promise.all([
      this.createTween(spriteA, targetA, ANIMATION_DURATIONS.swap, ANIMATION_EASING.swap),
      this.createTween(spriteB, targetB, ANIMATION_DURATIONS.swap, ANIMATION_EASING.swap),
    ]).then(() => {
      this.clearPressGlow();
    });
  }

  private animateClear(
    outcome: {
      cleared: Array<{ pos: Position; tile: Tile }>;
      transforms: Array<{ tile: Tile | null; kind: TileKind; pos: Position; multiplier?: number }>;
    },
    actor: "player" | "boss" = "player"
  ) {
    const tweens: Promise<void>[] = [];

    // transforms are informational only (for CRIT text) — tiles are in cleared list

    const { tilesToBoss, tilesToPlayer } = this.groupTilesByTarget(outcome.cleared, tweens, actor);

    if (tilesToBoss.length > 0) {
      tweens.push(flyTilesToTarget(this, tilesToBoss, this.bossTarget, ANIMATION_DURATIONS.tileFly));
    }
    if (tilesToPlayer.length > 0) {
      tweens.push(flyTilesToTarget(this, tilesToPlayer, this.playerTarget, ANIMATION_DURATIONS.tileFly));
    }

    return Promise.all(tweens);
  }


  private groupTilesByTarget(
    cleared: Array<{ pos: Position; tile: Tile }>,
    tweens: Promise<void>[],
    actor: "player" | "boss" = "player"
  ): {
    tilesToBoss: Array<{ x: number; y: number; kind: TileKind }>;
    tilesToPlayer: Array<{ x: number; y: number; kind: TileKind }>;
  } {
    const tilesToBoss: Array<{ x: number; y: number; kind: TileKind }> = [];
    const tilesToPlayer: Array<{ x: number; y: number; kind: TileKind }> = [];
    const toOpponent = actor === "player" ? tilesToBoss : tilesToPlayer;
    const toSelf = actor === "player" ? tilesToPlayer : tilesToBoss;

    cleared.forEach(({ pos, tile }) => {
      const sprite = this.tileSprites.get(tile.id);
      if (!sprite) return;

      // Clean up bomb cooldown text if this tile was a bomb
      if (tile.kind === TileKind.Bomb) {
        const text = this.bombCooldownTexts.get(tile.id);
        text?.destroy();
        this.bombCooldownTexts.delete(tile.id);
      }

      const worldPos = this.toWorld(pos);
      const tileData = { x: worldPos.x, y: worldPos.y, kind: tile.kind };

      // Particle effect on tile clear
      emitTileParticles(this, worldPos.x, worldPos.y, tile.kind);

      // Damage tiles fly to opponent, resource tiles fly to self
      if (DAMAGE_TILES.includes(tile.base as typeof DAMAGE_TILES[number])) {
        toOpponent.push(tileData);
      } else if (RESOURCE_TILES.includes(tile.base as typeof RESOURCE_TILES[number])) {
        toSelf.push(tileData);
      }

      tweens.push(this.fadeOutTile(sprite, tile.id));
    });

    return { tilesToBoss, tilesToPlayer };
  }

  private fadeOutTile(sprite: Phaser.GameObjects.Image, tileId: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const baseScale = sprite.scaleX;
      this.tweens.add({
        targets: sprite,
        alpha: VISUAL_EFFECTS.tileFadeAlpha,
        scaleX: baseScale * VISUAL_EFFECTS.tileScaleReduction,
        scaleY: baseScale * VISUAL_EFFECTS.tileScaleReduction,
        duration: ANIMATION_DURATIONS.tileFade,
        ease: ANIMATION_EASING.fade,
        onComplete: () => {
          sprite.destroy();
          this.tileSprites.delete(tileId);
          // Destroy enhanced tile glow
          const glow = this.tileGlows.get(tileId);
          if (glow) {
            this.tweens.killTweensOf(glow);
            glow.destroy();
            this.tileGlows.delete(tileId);
          }
          resolve();
        },
      });
    });
  }

  private animateCollapse(collapse: {
    moves: Array<{ tile: Tile; to: Position }>;
    newTiles: Array<{ tile: Tile; pos: Position }>;
  }) {
    if (collapse.moves.length > 0 || collapse.newTiles.length > 0) {
      this.sfx(ASSET_KEYS.sfx.gemFalldown, 0.3);
    }
    const tweens: Promise<void>[] = [];

    collapse.moves.forEach(({ tile, to }) => {
      const sprite = this.tileSprites.get(tile.id);
      if (!sprite) return;
      const target = this.toWorld(to);
      tweens.push(this.createTween(sprite, target, ANIMATION_DURATIONS.tileCollapse));

      // Animate bomb cooldown text along with sprite
      const cooldownText = this.bombCooldownTexts.get(tile.id);
      if (cooldownText) {
        this.tweens.add({
          targets: cooldownText,
          x: target.x,
          y: target.y,
          duration: ANIMATION_DURATIONS.tileCollapse,
          ease: ANIMATION_EASING.collapse,
        });
      }

      // Animate enhanced tile glow along with sprite
      const glow = this.tileGlows.get(tile.id);
      if (glow) {
        this.tweens.add({
          targets: glow,
          x: target.x,
          y: target.y,
          duration: ANIMATION_DURATIONS.tileCollapse,
          ease: ANIMATION_EASING.collapse,
        });
      }
    });

    collapse.newTiles.forEach(({ tile, pos }) => {
      const target = this.toWorld(pos);
      const sprite = this.spawnTileSprite(tile, pos, this.boardOrigin.y - CELL_SIZE);
      sprite.setPosition(target.x, this.boardOrigin.y - CELL_SIZE);
      tweens.push(this.createTween(sprite, target, ANIMATION_DURATIONS.newTileDrop));
    });

    return Promise.all(tweens);
  }

  private createTween(
    target: Phaser.GameObjects.Image,
    position: { x: number; y: number },
    duration: number,
    ease: string = ANIMATION_EASING.collapse
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      this.tweens.add({
        targets: target,
        x: position.x,
        y: position.y,
        duration,
        ease,
        onComplete: () => resolve(),
      });
    });
  }

  private updateHud() {
    this.bossHpBar?.setValue(this.bossHp, GAME_PARAMS.boss.hpMax);
    this.playerHpBar?.setValue(this.playerHp, GAME_PARAMS.player.hpMax);
    this.manaBar?.setValue(this.mana, GAME_PARAMS.player.manaMax);
    this.updateBossArt();

    // Обновляем иконку кулдауна босса (показываем тип следующей атаки)
    const abilityState = this.bossAbilityManager.state;
    this.cooldownIcon?.setAbility(abilityState.type, abilityState.currentCooldown);

    // Обновляем состояние скилов: unlocked = нормальный UI, locked = пустой круг
    const unlocked = this.perkManager?.unlockedOrder ?? [];
    SKILL_IDS.forEach((id) => {
      const btn = this.skillButtons[id];
      if (!btn) return;
      if (!unlocked.includes(id)) {
        btn.applyState({ enabled: false, ready: false, locked: true });
        return;
      }
      const cfg = SKILL_CONFIG[id];
      const cooldown = this.skillCooldowns[id];
      const canUse = cooldown === 0 && this.mana >= cfg.cost && this.currentTurn === "player" && !this.busy;
      btn.applyState({
        enabled: canUse,
        ready: canUse,
        cooldown,
        info: `${cfg.cost}`,
      });
    });
  }

  private updateBossArt() {
    if (!this.bossImage || this.bossDamageArtActive) return;
    const ratio = this.bossHp / GAME_PARAMS.boss.hpMax;
    const isBattle = ratio >= BOSS_DAMAGED_HP_THRESHOLD;
    const backKey = isBattle ? ASSET_KEYS.boss.mainBack : ASSET_KEYS.boss.lowhpBack;
    this.bossImage.setTexture(isBattle ? ASSET_KEYS.boss.main : ASSET_KEYS.boss.lowhp);
    this.bossImageGlow?.setTexture(backKey);
    this.bossGlowBrightness?.setTexture(backKey);
  }

  private startBossGlowPulse() {
    if (!this.bossGlowBrightness) return;
    // Don't restart if already pulsing — avoids visible brightness jump
    if (this.tweens.getTweensOf(this.bossGlowBrightness).length > 0) return;
    this.bossGlowBrightness.setAlpha(0);
    this.tweens.add({
      targets: this.bossGlowBrightness,
      alpha: { from: 0, to: VISUAL_EFFECTS.bossGlowPulseMax },
      duration: 1500,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });
  }

  private activateSkill(id: SkillId) {
    if (!this.canPlayerAct()) return;
    if (!this.perkManager?.isUnlocked(id)) return;
    this.stopHintTimer();

    const cfg = SKILL_CONFIG[id];

    // Проверяем кулдаун
    if (this.skillCooldowns[id] > 0) return;
    // Проверяем ману
    if (this.mana < cfg.cost) return;

    this.mana -= cfg.cost;
    this.manaBar?.setValue(this.mana, GAME_PARAMS.player.manaMax);
    this.manaBar?.flash();
    this.skillCooldowns[id] = cfg.cooldown; // Ставим на кулдаун
    this.stats.skillsUsed++;

    // Звук общий для всех скиллов
    this.sfx(ASSET_KEYS.sfx.gemTap);
    hapticMedium();

    // Обработка разных скиллов
    if (id === "powerStrike") {
      this.showSlashEffect(this.bossTarget, true);
      this.applyDamageToBoss(cfg.damage, true);
      // Restore boss art after skill damage — delay so damage art is visible
      this.time.delayedCall(500, () => {
        this.restoreBossArtFromDamage();
        this.bossHpBar?.drainDelta();
      });
    } else if (id === "stun" && cfg.stunTurns) {
      // Добавляем ходы к кулдауну босса
      this.bossAbilityManager.addCooldown(cfg.stunTurns);
      this.cooldownIcon?.setCooldown(this.bossAbilityManager.getCurrentCooldown());
    } else if (id === "heal") {
      this.applyHealToPlayer(cfg.heal);
    } else if (id === "hammer") {
      this.enterHammerMode();
      return; // Не обновляем HUD пока не выбрана фишка
    }

    this.updateHud();

    // Process pending perks from skill damage (layer transition)
    if (this.pendingPerkCount > 0 && !this.gameOver && this.bossHp > 0) {
      const processPerks = async () => {
        while (this.pendingPerkCount > 0 && !this.gameOver) {
          this.pendingPerkCount--;
          await this.showPerkSelection();
        }
        this.updateHud();
      };
      processPerks();
    }

    if (this.bossHp <= 0) {
      this.showVictory();
      return;
    }
    // Скилл НЕ заканчивает ход - игрок может ещё сделать match
    this.startHintTimer();
  }

  private enterHammerMode() {
    this.hammerMode = true;
    this.busy = true;

    // Затемнить экран (но не поле)
    this.hammerOverlay = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.6)
      .setOrigin(0)
      .setDepth(8);

    // Подсказка
    this.hammerHint = this.add
      .text(GAME_WIDTH / 2, UI_LAYOUT.boardOriginY - 30, "Нажмите на фишку чтобы убрать её!", {
        fontSize: "16px",
        color: "#ffffff",
        fontFamily: "'Exo 2', Arial, sans-serif",
        stroke: "#000000",
        strokeThickness: 3,
        resolution: 2,
      })
      .setOrigin(0.5)
      .setDepth(12);

    // Поле остаётся интерактивным поверх оверлея
    this.tileSprites.forEach((sprite) => sprite.setDepth(10));
  }

  private exitHammerMode() {
    this.hammerMode = false;
    this.busy = false;
    this.hammerOverlay?.destroy();
    this.hammerHint?.destroy();
    this.hammerOverlay = undefined;
    this.hammerHint = undefined;

    // Вернуть спрайты на обычный depth
    this.tileSprites.forEach((sprite) => sprite.setDepth(1));
  }

  /** Get positions to destroy based on hammer pattern */
  private getHammerPositions(center: Position): Position[] {
    const pattern = SKILL_CONFIG.hammer.hammerPattern ?? "single";
    const positions: Position[] = [{ ...center }];

    if (pattern === "cross") {
      // 5 tiles: center + 4 adjacent (cross/plus shape)
      const offsets = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }];
      for (const o of offsets) {
        const p = { x: center.x + o.x, y: center.y + o.y };
        if (p.x >= 0 && p.x < BOARD_WIDTH && p.y >= 0 && p.y < BOARD_HEIGHT) {
          positions.push(p);
        }
      }
    } else if (pattern === "square") {
      // 9 tiles: 3x3 square
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue; // center already added
          const p = { x: center.x + dx, y: center.y + dy };
          if (p.x >= 0 && p.x < BOARD_WIDTH && p.y >= 0 && p.y < BOARD_HEIGHT) {
            positions.push(p);
          }
        }
      }
    }

    return positions;
  }

  private async removeWithHammer(pos: Position) {
    const positions = this.getHammerPositions(pos);

    this.sfx(ASSET_KEYS.sfx.gemTap);

    // Remove all tiles in pattern
    for (const p of positions) {
      const tile = this.board.getTile(p);
      if (!tile) continue;

      this.board.removeTile(p);
      const sprite = this.tileSprites.get(tile.id);
      sprite?.destroy();
      this.tileSprites.delete(tile.id);

      this.bombCooldownTexts.get(tile.id)?.destroy();
      this.bombCooldownTexts.delete(tile.id);

      const glow = this.tileGlows.get(tile.id);
      if (glow) {
        this.tweens.killTweensOf(glow);
        glow.destroy();
        this.tileGlows.delete(tile.id);
      }
    }

    // Выйти из режима молотка
    this.exitHammerMode();

    // Collapse + refill
    const collapse = this.board.collapseGrid();
    this.rebuildPositionMap();
    await this.animateCollapse(collapse);

    // Проверить каскадные матчи
    const matches = this.board.findMatches();
    if (matches.length > 0) {
      await this.resolveBoard(matches, [], false, "player");
    }

    this.updateHud();
    this.startHintTimer();
  }

  private tickSkillCooldowns() {
    for (const id of SKILL_IDS) {
      if (this.skillCooldowns[id] > 0) {
        this.skillCooldowns[id]--;
      }
    }
  }

  private showVictory() {
    if (this.gameOver) return;
    this.stopHintTimer();
    this.gameOver = true;
    this.busy = true;
    this.sfx(ASSET_KEYS.sfx.gemDestroy);
    hapticVictory();
    this.showGameEndModal("Victory!", "#44ff66", "Restart", true);
  }

  private toWorld(pos: Position) {
    return {
      x: this.boardOrigin.x + pos.x * CELL_SIZE + CELL_SIZE / 2,
      y: this.boardOrigin.y + pos.y * CELL_SIZE + CELL_SIZE / 2 + 2,
    };
  }

  private get boardCenter(): { x: number; y: number } {
    return {
      x: this.boardOrigin.x + (BOARD_WIDTH * CELL_SIZE) / 2,
      y: this.boardOrigin.y + (BOARD_HEIGHT * CELL_SIZE) / 2,
    };
  }

  private get bossTarget(): FlyTarget {
    if (!this.bossImage) return { x: GAME_WIDTH / 2, y: 150 };
    // Босс origin (0.5, 0.5) — цель в верхней трети изображения
    return {
      x: this.bossImage.x,
      y: this.bossImage.y - this.bossImage.displayHeight * 0.3,
    };
  }

  private get playerTarget(): FlyTarget {
    return this.playerAvatar
      ? { x: this.playerAvatar.x, y: this.playerAvatar.y }
      : { x: GAME_WIDTH - 60, y: GAME_HEIGHT - 175 };
  }

  private startHintTimer() {
    this.stopHintTimer();
    this.potentialMoves = this.board.findPotentialMoves();
    if (this.potentialMoves.length === 0) return;
    this.lastHintIndex = -1;

    // First hint after 3s, then every 5s
    this.hintTimer = this.time.addEvent({
      delay: 3000,
      callback: () => {
        this.showNextHint();
        this.hintTimer = this.time.addEvent({
          delay: HINT_ANIMATION.idleDelay,
          loop: true,
          callback: () => this.showNextHint(),
        });
      },
    });
  }

  private stopHintTimer() {
    if (this.hintTimer) {
      this.hintTimer.destroy();
      this.hintTimer = undefined;
    }
    this.clearHintVisuals();
  }

  private clearHintVisuals() {
    for (const tween of this.hintTweens) {
      tween.stop();
    }
    this.hintTweens = [];

    // Remove glow sync listener
    if (this.hintSyncFn) {
      this.events.off("update", this.hintSyncFn);
      this.hintSyncFn = undefined;
    }

    // Kill tweens and restore positions for hinted sprites + their glows
    for (const id of this.hintedSpriteIds) {
      const sprite = this.tileSprites.get(id);
      if (sprite?.scene) {
        this.tweens.killTweensOf(sprite);
        const pos = this.tilePositions.get(id);
        if (pos) {
          const world = this.toWorld(pos);
          sprite.setPosition(world.x, world.y);
          // Restore enhanced tile glow position too
          const glow = this.tileGlows.get(id);
          if (glow?.scene) glow.setPosition(world.x, world.y);
        }
      }
    }
    this.hintedSpriteIds = [];

    // Destroy glow sprites and hint rectangles immediately (no fade)
    for (const obj of [...this.hintOverlays, ...this.hintRects]) {
      if (obj.scene) {
        this.tweens.killTweensOf(obj);
        obj.destroy();
      }
    }
    this.hintOverlays = [];
    this.hintRects = [];
  }

  private showNextHint() {
    this.clearHintVisuals();
    if (this.potentialMoves.length === 0) return;

    // Pick random move, avoiding repeat
    let idx = Math.floor(Math.random() * this.potentialMoves.length);
    if (this.potentialMoves.length > 1 && idx === this.lastHintIndex) {
      idx = (idx + 1) % this.potentialMoves.length;
    }
    this.lastHintIndex = idx;
    const move = this.potentialMoves[idx];

    // Highlight only tiles of the same kind as the moving tile
    const fromTile = this.board.getTile(move.from);
    if (!fromTile) return;
    const hintKind = fromTile.base;
    const fromSprite = this.tileSprites.get(fromTile.id);
    if (!fromSprite) return;

    // White silhouette glow: clone sprite with tintFill, pulse alpha
    let fromGlow: Phaser.GameObjects.Image | undefined;
    const allHintPositions = [move.from, ...move.matchPositions];
    for (const pos of allHintPositions) {
      const tile = this.board.getTile(pos);
      if (!tile || tile.base !== hintKind) continue;
      const sprite = this.tileSprites.get(tile.id);
      if (!sprite) continue;

      this.hintedSpriteIds.push(tile.id);

      const glow = this.createTileGlow(sprite, HINT_ANIMATION.glowBaseAlpha);
      this.hintOverlays.push(glow);

      // Track the glow for the from tile
      if (tile.id === fromTile.id) {
        fromGlow = glow;
      }
    }

    // Single unified yellow outline rectangle around match result tiles (4+ only)
    if (move.maxMatchLength >= 4) {
      const matchResultPositions = [move.to, ...move.matchPositions];
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const pos of matchResultPositions) {
        const t = this.board.getTile(pos);
        if (!t) continue;
        // move.to will contain the correct tile after swap — don't filter by kind
        const isDestination = pos.x === move.to.x && pos.y === move.to.y;
        if (!isDestination && t.base !== hintKind) continue;
        const w = this.toWorld(pos);
        minX = Math.min(minX, w.x - CELL_SIZE / 2);
        minY = Math.min(minY, w.y - CELL_SIZE / 2);
        maxX = Math.max(maxX, w.x + CELL_SIZE / 2);
        maxY = Math.max(maxY, w.y + CELL_SIZE / 2);
      }
      if (minX !== Infinity) {
        const pad = 3;
        const rect = this.add
          .rectangle(
            minX - pad,
            minY - pad,
            maxX - minX + pad * 2,
            maxY - minY + pad * 2,
          )
          .setOrigin(0, 0)
          .setFillStyle()
          .setStrokeStyle(2, 0xffdd44, 1)
          .setAlpha(0)
          .setDepth(0.7);
        // Fade in the rectangle independently
        const rectTween = this.tweens.add({
          targets: rect,
          alpha: 0.8,
          duration: 250,
          ease: "Quad.easeOut",
        });
        this.hintTweens.push(rectTween);
        this.hintRects.push(rect);
      }
    }

    const dx = move.to.x - move.from.x;
    const dy = move.to.y - move.from.y;
    const dist = HINT_ANIMATION.shakeDistance;

    // Use grid position as base (not sprite.x/y) to prevent drift
    const world = this.toWorld(move.from);
    fromSprite.setPosition(world.x, world.y);

    // Sync glow position + alpha to shake progress every frame
    if (fromGlow) {
      const syncFn = () => {
        if (this.hintOverlays.length === 0) return;
        if (!fromGlow.scene || !fromSprite.scene) return;

        // Sync from-glow position to sprite
        fromGlow.setPosition(fromSprite.x, fromSprite.y);

        // Calculate progress: 0 = at origin, 1 = at max displacement
        const offsetX = fromSprite.x - world.x;
        const offsetY = fromSprite.y - world.y;
        const currentDist = Math.sqrt(offsetX * offsetX + offsetY * offsetY);
        const progress = Math.min(currentDist / dist, 1);

        // Apply alpha to all glow overlays (from + partners)
        const glowAlpha = HINT_ANIMATION.glowBaseAlpha +
          progress * (HINT_ANIMATION.glowPeakAlpha - HINT_ANIMATION.glowBaseAlpha);
        for (const g of this.hintOverlays) {
          g.setAlpha(glowAlpha);
        }

        // Sync enhanced tile glow sprites with shaking tile positions
        for (const id of this.hintedSpriteIds) {
          const s = this.tileSprites.get(id);
          const tg = this.tileGlows.get(id);
          if (s?.scene && tg?.scene) {
            tg.setPosition(s.x, s.y);
          }
        }
      };
      this.events.on("update", syncFn);
      this.hintSyncFn = syncFn;
    }

    // Asymmetric shake: fast snap forward, slow ease back
    const fwdDuration = HINT_ANIMATION.shakeDuration * 0.35;
    const bwdDuration = HINT_ANIMATION.shakeDuration * 0.65;
    const fwd = {
      targets: fromSprite,
      x: world.x + dx * dist,
      y: world.y + dy * dist,
      duration: fwdDuration,
      ease: "Quart.easeIn",
    };
    const bwd = {
      targets: fromSprite,
      x: world.x,
      y: world.y,
      duration: bwdDuration,
      ease: "Sine.easeOut",
    };
    const chainTweens = [];
    for (let i = 0; i < HINT_ANIMATION.shakeRepeat; i++) {
      chainTweens.push({ ...fwd }, { ...bwd });
    }
    const chainGlows = [...this.hintOverlays];
    const chainRects = [...this.hintRects];
    const chain = this.tweens.chain({
      tweens: chainTweens,
      onComplete: () => {
        if (this.hintSyncFn) {
          this.events.off("update", this.hintSyncFn);
          this.hintSyncFn = undefined;
        }
        // Fade out glows and rects after animation completes
        for (const g of chainGlows) {
          if (g.scene && this.hintOverlays.includes(g)) {
            this.tweens.add({
              targets: g,
              alpha: 0,
              duration: HINT_ANIMATION.glowFadeOut,
              ease: "Quad.easeOut",
              onComplete: () => { if (g.scene) g.destroy(); },
            });
          }
        }
        for (const r of chainRects) {
          if (r.scene && this.hintRects.includes(r)) {
            this.tweens.add({
              targets: r,
              alpha: 0,
              duration: HINT_ANIMATION.glowFadeOut,
              ease: "Quad.easeOut",
              onComplete: () => { if (r.scene) r.destroy(); },
            });
          }
        }
      },
    });
    this.hintTweens.push(chain);
  }

  // ===== First-Move Tutorial =====

  private showFirstMoveTutorial() {
    this.tutorialActive = true;

    // Dark overlay over entire screen (above all UI, below highlighted tiles)
    this.tutorialOverlay = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 1)
      .setOrigin(0, 0)
      .setAlpha(0.7)
      .setDepth(99)
      .setInteractive();

    // Ensure grid is visible (may be alpha 0 from startHidden intro)
    if (this.gridGfx) this.gridGfx.setAlpha(1);

    // Bump highlighted sword tiles + swap target above the overlay (depth 99)
    const highlightedPositions = [...TUTORIAL_HIGHLIGHT, TUTORIAL_TO];
    for (const pos of highlightedPositions) {
      const tile = this.board.getTile(pos);
      if (tile) {
        const sprite = this.tileSprites.get(tile.id);
        if (sprite) sprite.setDepth(99.1);
      }
    }

    // Hint glow overlays on highlighted tiles
    const allGlows: Phaser.GameObjects.Image[] = [];
    for (const pos of TUTORIAL_HIGHLIGHT) {
      const tile = this.board.getTile(pos);
      if (!tile) continue;
      const sprite = this.tileSprites.get(tile.id);
      if (!sprite) continue;
      const glow = this.createTileGlow(sprite, HINT_ANIMATION.glowBaseAlpha);
      glow.setDepth(99.2);
      allGlows.push(glow);
      this.tutorialHintOverlays.push(glow);
    }

    // Speech bubble at screen center, shifted up 30px
    const bubbleY = GAME_HEIGHT / 2 - 30;
    const bubbleMaxW = Math.min(GAME_WIDTH - 40, 360);
    this.tutorialBubble = new SpeechBubble(this, GAME_WIDTH / 2, bubbleY, {
      text: "Составь комбинацию из МЕЧЕЙ,\nчтобы атаковать!",
      tailDirection: "down",
      maxWidth: bubbleMaxW,
      fontSize: `${Math.min(22, Math.floor(GAME_WIDTH / 22))}px`,
      highlights: [{ word: "МЕЧЕЙ,", color: "#ff4444" }],
    });
    this.tutorialBubble.setDepth(100);
    this.tutorialBubble.fadeIn(200);

    // Hand arrow: slides from source tile to target tile in a loop
    const fromWorld = this.toWorld(TUTORIAL_FROM);
    const toWorld = this.toWorld(TUTORIAL_TO);
    const handOffX = 38;
    const handOffY = 40;
    this.tutorialHand = this.add
      .image(fromWorld.x + handOffX, fromWorld.y + handOffY, ASSET_KEYS.ui.handArrow)
      .setDisplaySize(86, 94)
      .setDepth(100)
      .setAlpha(0);

    // Looping slide animation: delayed 600ms, then fade in -> slide -> fade out -> loop
    const hand = this.tutorialHand;
    this.tutorialHandDelay = this.time.delayedCall(600, () => {
      if (!hand.scene || !this.tutorialActive) return;
      const slideChain = this.tweens.chain({
        tweens: [
          // Fade in at source
          { targets: hand, alpha: 1, duration: 500, ease: "Quad.easeOut",
            onStart: () => { if (hand.scene) hand.setPosition(fromWorld.x + handOffX, fromWorld.y + handOffY); } },
          // Hold briefly
          { targets: hand, alpha: 1, duration: 150 },
          // Slide to target
          { targets: hand, x: toWorld.x + handOffX, y: toWorld.y + handOffY, duration: 400, ease: "Quad.easeInOut" },
          // Hold at target
          { targets: hand, alpha: 1, duration: 150 },
          // Fade out
          { targets: hand, alpha: 0, duration: 200, ease: "Quad.easeIn" },
          // Pause before next loop
          { targets: hand, alpha: 0, duration: 300 },
        ],
        loop: -1,
      });
      this.tutorialHandChain = slideChain;
    });

    // Pulse glows in sync with hand slide
    const glowPulse = this.tweens.chain({
      tweens: [
        { targets: allGlows, alpha: HINT_ANIMATION.glowBaseAlpha, duration: 400 },
        { targets: allGlows, alpha: HINT_ANIMATION.glowPeakAlpha, duration: 400, ease: "Sine.easeInOut" },
        { targets: allGlows, alpha: HINT_ANIMATION.glowBaseAlpha, duration: 350, ease: "Sine.easeOut" },
        { targets: allGlows, alpha: HINT_ANIMATION.glowBaseAlpha, duration: 500 },
      ],
      loop: -1,
    });
    this.tutorialHintTweens.push(glowPulse);
  }

  private clearTutorial() {
    // Fade out overlay
    if (this.tutorialOverlay?.scene) {
      const overlay = this.tutorialOverlay;
      this.tweens.add({
        targets: overlay,
        alpha: 0,
        duration: 200,
        ease: "Quad.easeOut",
        onComplete: () => { if (overlay.scene) overlay.destroy(); },
      });
      this.tutorialOverlay = undefined;
    }
    if (this.tutorialBubble?.scene) {
      this.tutorialBubble.fadeOut(150);
      this.tutorialBubble = undefined;
    }
    if (this.tutorialHandDelay) {
      this.tutorialHandDelay.destroy();
      this.tutorialHandDelay = undefined;
    }
    if (this.tutorialHandChain) {
      this.tutorialHandChain.stop();
      this.tutorialHandChain = undefined;
    }
    if (this.tutorialHand?.scene) {
      this.tutorialHand.destroy();
      this.tutorialHand = undefined;
    }
    // Clean up hint glow animations
    for (const tween of this.tutorialHintTweens) {
      tween.stop();
    }
    this.tutorialHintTweens = [];
    for (const glow of this.tutorialHintOverlays) {
      if (glow.scene) {
        this.tweens.killTweensOf(glow);
        glow.destroy();
      }
    }
    this.tutorialHintOverlays = [];
    // Restore all tile depths to normal
    for (const [, sprite] of this.tileSprites) {
      if (sprite.scene) sprite.setDepth(1);
    }
    this.tutorialActive = false;
  }

  // ===== Tutorial & Tips =====

  private async showTip(text: string, duration = 2000, centered = false, customY?: number): Promise<void> {
    // Don't show tips during busy animations or if a tip is already active
    if (this.activeTip) return;

    // Stop hint animations while tip is visible
    this.stopHintTimer();

    const bubbleY = customY ?? (centered ? GAME_HEIGHT / 2 : UI_LAYOUT.boardOriginY + UI_LAYOUT.boardHeight + 5);
    const bubble = new SpeechBubble(this, GAME_WIDTH / 2, bubbleY, {
      text,
      tailDirection: centered ? "none" : "up",
      maxWidth: 280,
      fontSize: "15px",
    });
    bubble.setDepth(100);
    this.activeTip = bubble;

    await bubble.fadeIn(200);

    // Auto-dismiss after duration, or tap to dismiss early
    await new Promise<void>(resolve => {
      let resolved = false;
      const tapZone = this.add
        .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0)
        .setOrigin(0, 0)
        .setDepth(101)
        .setInteractive();

      const cleanup = () => {
        if (resolved) return;
        resolved = true;
        tapZone.destroy();
        resolve();
      };

      const timer = this.time.delayedCall(duration, cleanup);
      tapZone.once("pointerdown", () => {
        timer.destroy();
        cleanup();
      });
    });

    if (bubble.scene) {
      await bubble.fadeOut(150);
    }
    this.activeTip = undefined;

    // Restart hints if it's player's turn
    if (!this.gameOver && this.currentTurn === "player" && !this.busy) {
      this.startHintTimer();
    }
  }

  private async finishPlayerTurn() {
    if (this.gameOver) return;
    this.stats.turnsPlayed++;

    // Тикаем кулдауны скиллов игрока
    this.tickSkillCooldowns();

    this.checkGameOver();
    if (this.gameOver) return;

    // Тикаем щит босса
    if (this.bossShieldDuration > 0) {
      this.bossShieldDuration--;
      if (this.bossShieldText) {
        this.bossShieldText.setText(this.bossShieldDuration.toString());
        if (this.bossShieldDuration === 1) {
          this.bossShieldText.setColor("#ffaa44");
        }
        // Pulse on decrement
        this.tweens.add({
          targets: this.bossShieldText,
          scale: { from: 1.3, to: 1 },
          duration: 250,
          ease: "Back.easeOut",
        });
      }
      if (this.bossShieldDuration <= 0) {
        this.hideBossShieldOverlay();
      }
    }

    // Тикаем бомбы на поле
    await this.processBombTick();
    if (this.gameOver) return;

    // Тикаем кулдаун абилки босса
    const abilityReady = this.bossAbilityManager.tick();
    this.updateHud();

    if (abilityReady) {
      this.currentTurn = "boss";
      this.busy = true;
      this.updateHud();
      await wait(this, 200);

      await this.executeBossAbility();
      this.bossAbilityManager.advance();
      this.updateHud();

      if (this.playerHp <= 0) {
        this.showDefeat();
        return;
      }

      await wait(this, 300);
    }

    this.currentTurn = "player";
    this.busy = false;
    this.updateHud();
    this.startHintTimer();
  }

  private async processBombTick() {
    const result = this.board.tickBombs();

    this.updateBombCooldownTexts(result.remaining);

    if (result.exploded.length > 0) {
      await this.handleBombExplosions(result.exploded);
    }
  }

  private updateBombCooldownTexts(remaining: Tile[]) {
    remaining.forEach(tile => {
      const text = this.bombCooldownTexts.get(tile.id);
      if (text && tile.cooldown !== undefined) {
        text.setText(tile.cooldown.toString());
      }
    });
  }

  private async handleBombExplosions(exploded: Array<{ pos: Position; tile: Tile }>) {
    // Process bombs one by one with delay, each deals damage separately
    for (const { pos, tile } of exploded) {
      // Verify bomb still exists at this position (might have been cleared by booster)
      const currentTile = this.board.getTile(pos);
      if (!currentTile || currentTile.id !== tile.id) {
        continue;
      }

      // Animate bomb flying to player
      await this.animateSingleBombExplode(tile);

      // Clean up sprite and text
      this.removeBombSprite(tile.id);

      // Remove from grid
      this.board.removeTile(pos);

      // Apply damage
      this.applyDamageToPlayer(BOSS_ABILITIES.bombs.bombDamage);
      this.playerHpBar?.drainDelta();
      this.updateHud();
      this.checkGameOver();
      if (this.gameOver) return;

      await wait(this, 150);
    }

    // Collapse and refill after all bombs processed
    const collapse = this.board.collapseGrid();
    this.rebuildPositionMap();
    await this.animateCollapse(collapse);

    // Check for cascade matches after bomb explosions (player benefits)
    const matches = this.board.findMatches();
    if (matches.length > 0) {
      await this.resolveBoard(matches, [], false, "player");
    }
  }

  private removeBombSprite(tileId: number, animated = false): Promise<void> {
    const sprite = this.tileSprites.get(tileId);
    const text = this.bombCooldownTexts.get(tileId);

    if (!animated) {
      sprite?.destroy();
      this.tileSprites.delete(tileId);
      text?.destroy();
      this.bombCooldownTexts.delete(tileId);
      const bombGlow = this.tileGlows.get(tileId);
      if (bombGlow) {
        this.tweens.killTweensOf(bombGlow);
        bombGlow.destroy();
        this.tileGlows.delete(tileId);
      }
      return Promise.resolve();
    }

    const promises: Promise<void>[] = [];

    if (sprite) {
      promises.push(new Promise<void>(resolve => {
        this.tweens.add({
          targets: sprite,
          scale: 1.5,
          alpha: 0,
          duration: 300,
          ease: "Quad.easeOut",
          onComplete: () => {
            sprite.destroy();
            this.tileSprites.delete(tileId);
            resolve();
          },
        });
      }));
    }

    if (text) {
      this.tweens.add({
        targets: text,
        alpha: 0,
        duration: 200,
        onComplete: () => text.destroy(),
      });
      this.bombCooldownTexts.delete(tileId);
    }

    const glowSprite = this.tileGlows.get(tileId);
    if (glowSprite) {
      this.tweens.killTweensOf(glowSprite);
      glowSprite.destroy();
      this.tileGlows.delete(tileId);
    }

    return Promise.all(promises).then(() => {});
  }

  private cancelFlashBoss() {
    if (!this.bossDamageArtActive) return;

    // Kill shake tweens and restore positions
    const layers = this.bossLayers;
    for (const t of layers) this.tweens.killTweensOf(t);

    // Restore canonical position (shake may have offset them)
    const bossY = GAME_PARAMS.background.offsetY + GAME_PARAMS.background.bossOnBgY * (this.bgImage?.displayHeight ?? 0);
    for (const t of layers) t.setPosition(GAME_WIDTH / 2, bossY);

    this.bossDamageArtActive = false;
    this.updateBossArt();
    this.bossImage?.setAlpha(1);
    this.bossImageGlow?.setAlpha(1);
    this.startBossGlowPulse();
  }

  private async executeBossAbility() {
    this.cancelFlashBoss();
    const abilityType = this.bossAbilityManager.currentType;

    switch (abilityType) {
      case "attack":
        await this.executeAttack();
        break;
      case "bombs":
        await this.executeBombs();
        break;
      case "shield":
        await this.executeShield();
        break;
      case "powerStrike":
        await this.executePowerStrike();
        break;
    }
  }

  private async executeAttack() {
    const config = BOSS_ABILITIES.attack;

    if (!this.bossImage) return;

    // Сохранить текущий масштаб и позицию
    const savedScale = this.bossImage.scaleX;
    const savedX = this.bossImage.x;
    const savedY = this.bossImage.y;

    // Hide brightness overlay during attack transition
    if (this.bossGlowBrightness) {
      this.tweens.killTweensOf(this.bossGlowBrightness);
      this.bossGlowBrightness.setAlpha(0);
    }

    // Helper: dissolve boss + glow to target alpha
    const dissolveBoss = (alpha: number) => {
      const targets = [this.bossImage, this.bossImageGlow].filter(Boolean);
      return tweenPromise(this, { targets, alpha, duration: 200 });
    };

    // 1. Dissolve out current boss sprite
    await dissolveBoss(0);

    // 2. Switch to attack texture + scale to screen width
    this.bossImage.setTexture(ASSET_KEYS.boss.attack);
    this.bossImageGlow?.setTexture(ASSET_KEYS.boss.attackBack);
    this.bossGlowBrightness?.setTexture(ASSET_KEYS.boss.attackBack);

    const aspectRatio = this.bossImage.height / this.bossImage.width;
    const attackDisplayH = GAME_WIDTH * aspectRatio;
    const attackY = Math.max(savedY, attackDisplayH / 2);

    for (const layer of this.bossLayers) {
      layer.setDisplaySize(GAME_WIDTH, attackDisplayH);
      layer.setPosition(GAME_WIDTH / 2, attackY);
    }

    // 3. Dissolve in attack sprite
    await dissolveBoss(1);

    // 4. NOW apply damage (after attack sprite is visible)
    this.sfx(ASSET_KEYS.sfx.enemyAttack);
    this.cameras.main.shake(200, 0.015 / DPR);
    this.applyDamageToPlayer(config.damage);
    this.flashPlayerAvatar();
    this.showSlashEffect(this.boardCenter, false);
    // Update only bars, NOT updateBossArt() which would reset the attack texture
    this.bossHpBar?.setValue(this.bossHp, GAME_PARAMS.boss.hpMax);
    this.playerHpBar?.setValue(this.playerHp, GAME_PARAMS.player.hpMax);
    this.manaBar?.setValue(this.mana, GAME_PARAMS.player.manaMax);
    this.playerHpBar?.drainDelta();

    await wait(this, 1500);

    // Dissolve out attack sprite
    await dissolveBoss(0);

    // Restore normal sprite, scale, and position
    this.updateBossArt();
    for (const layer of this.bossLayers) {
      layer.setScale(savedScale);
      layer.setPosition(savedX, savedY);
    }

    // Dissolve in + restart brightness pulse
    await dissolveBoss(1);
    this.startBossGlowPulse();
  }

  private async withCutscene(abilityName: string, logic: () => Promise<void>, bossTextureKey?: string, bossBackTextureKey?: string) {
    // Fade out base boss art to avoid two copies visible simultaneously
    const bossLayers = [this.bossImage, this.bossImageGlow, this.bossGlowBrightness].filter(Boolean) as Phaser.GameObjects.Image[];
    if (this.bossGlowBrightness) this.tweens.killTweensOf(this.bossGlowBrightness);
    await tweenPromise(this, { targets: bossLayers, alpha: 0, duration: 200 });

    const { overlay, fullscreenBack, fullscreenBoss, abilityText } = this.createAbilityCutscene(abilityName, bossTextureKey, bossBackTextureKey);
    await this.showAbilityCutscene(overlay, fullscreenBack, fullscreenBoss, abilityText);
    await wait(this, 600);
    // Start fade-out, then run logic once art is mostly gone
    const hidePromise = this.hideAbilityCutscene(overlay, fullscreenBack, fullscreenBoss, abilityText);
    await wait(this, 270);
    await logic();
    await hidePromise;

    // Fade base boss art back in
    await tweenPromise(this, { targets: bossLayers, alpha: 1, duration: 200 });
    this.startBossGlowPulse();
  }

  private async executeBombs() {
    const config = BOSS_ABILITIES.bombs;

    // Manual cutscene: show boss art BEFORE bombs drop (not after)
    const bossLayers = [this.bossImage, this.bossImageGlow, this.bossGlowBrightness].filter(Boolean) as Phaser.GameObjects.Image[];
    if (this.bossGlowBrightness) this.tweens.killTweensOf(this.bossGlowBrightness);
    await tweenPromise(this, { targets: bossLayers, alpha: 0, duration: 200 });

    const { overlay, fullscreenBack, fullscreenBoss, abilityText } = this.createAbilityCutscene(config.name);
    await this.showAbilityCutscene(overlay, fullscreenBack, fullscreenBoss, abilityText);
    await wait(this, 600);

    // Hide cutscene and restore boss art BEFORE placing bombs
    await this.hideAbilityCutscene(overlay, fullscreenBack, fullscreenBoss, abilityText);
    await tweenPromise(this, { targets: bossLayers, alpha: 1, duration: 200 });
    this.startBossGlowPulse();

    // Now place and animate bombs with boss visible
    const { placed, replaced } = this.board.placeBombs(config.bombCount, config.bombCooldown);
    replaced.forEach(({ tile }) => {
      const sprite = this.tileSprites.get(tile.id);
      sprite?.destroy();
      this.tileSprites.delete(tile.id);
      const replGlow = this.tileGlows.get(tile.id);
      if (replGlow) {
        this.tweens.killTweensOf(replGlow);
        replGlow.destroy();
        this.tileGlows.delete(tile.id);
      }
    });

    this.rebuildPositionMap();
    await this.animateBombsAppear(placed);

    if (!this.bombTipShown) {
      this.bombTipShown = true;
      await this.showTip("Собирай тайлы рядом\nс бомбами, чтобы обезвредить!", 2000, true);
    }
  }

  private async executeShield() {
    const config = BOSS_ABILITIES.shield;
    await this.withCutscene(config.name, async () => {
      this.sfx(ASSET_KEYS.sfx.enemyShield);
      this.bossShieldDuration = config.shieldDuration;

      // Show shield image appearing during cutscene
      this.showBossShieldOverlay();
    });

    if (!this.shieldTipShown) {
      this.shieldTipShown = true;
      const shieldTipY = this.bossShieldOverlay
        ? this.bossShieldOverlay.y + this.bossShieldOverlay.displayHeight / 2 + 30
        : UI_LAYOUT.bossHpBarY + 30;
      await this.showTip("Босс под щитом!\nУрон заблокирован", 2000, false, shieldTipY);
    }
  }

  private async executePowerStrike() {
    const config = BOSS_ABILITIES.powerStrike;
    await this.withCutscene(config.name, async () => {
      this.sfx(ASSET_KEYS.sfx.enemyAttack);
      this.cameras.main.shake(300, 0.02 / DPR);
      this.applyDamageToPlayer(config.damage);
      this.flashPlayerAvatar();
      this.showSlashEffect(this.boardCenter, true);
      this.playerHpBar?.drainDelta();

      const manaDrain = Math.min(this.mana, config.manaDrain);
      if (manaDrain > 0) {
        this.sfx(ASSET_KEYS.sfx.enemyAttack);
        this.mana -= manaDrain;
        this.manaBar?.setValue(this.mana, GAME_PARAMS.player.manaMax);
        this.manaBar?.flash();
        if (this.playerAvatar) {
          showDamageNumber(this, this.playerAvatar.x, this.playerAvatar.y - 10, manaDrain, "mana_loss");
        }
      }
      this.updateHud();
    }, ASSET_KEYS.boss.ulta, ASSET_KEYS.boss.ultaBack);
  }

  private async animateBombsAppear(bombs: Array<{ pos: Position; tile: Tile }>) {
    this.sfx(ASSET_KEYS.sfx.enemyBombs);
    const tweens: Promise<void>[] = [];

    bombs.forEach(({ pos, tile }) => {
      const worldPos = this.toWorld(pos);
      const startY = this.boardOrigin.y - CELL_SIZE;

      // Create bomb sprite
      const sprite = this.spawnTileSprite(tile, pos, startY);
      sprite.setPosition(worldPos.x, startY);

      // Create cooldown text (positioned at start Y, will animate down)
      const cooldownText = this.createBombCooldownText(tile.id, worldPos.x, startY, tile.cooldown ?? 0);

      // Animate drop
      tweens.push(
        new Promise<void>(resolve => {
          this.tweens.add({
            targets: sprite,
            y: worldPos.y,
            duration: 400,
            ease: "Bounce.easeOut",
            onComplete: () => resolve(),
          });
          this.tweens.add({
            targets: cooldownText,
            y: worldPos.y,
            duration: 400,
            ease: "Bounce.easeOut",
          });
        })
      );
    });

    await Promise.all(tweens);
  }

  private async animateSingleBombExplode(tile: Tile): Promise<void> {
    const sprite = this.tileSprites.get(tile.id);
    if (!sprite) return;

    // Also animate the cooldown text to fly with the bomb
    const cooldownText = this.bombCooldownTexts.get(tile.id);
    const target = this.playerTarget;

    return new Promise<void>(resolve => {
      this.tweens.add({
        targets: sprite,
        x: target.x,
        y: target.y,
        scale: 0.5,
        duration: 350,
        ease: "Quad.easeIn",
        onComplete: () => {
          this.sfx(ASSET_KEYS.sfx.enemyBombs);
          this.cameras.main.shake(120, 0.012 / DPR);
          this.flashPlayerAvatar();
          resolve();
        },
      });

      // Animate cooldown text along with sprite (fade out during flight)
      if (cooldownText) {
        this.tweens.add({
          targets: cooldownText,
          x: target.x,
          y: target.y,
          alpha: 0,
          duration: 350,
          ease: "Quad.easeIn",
        });
      }
    });
  }

  private async defuseBombs(bombPositions: Position[]) {
    const tweens: Promise<void>[] = [];
    this.stats.bombsDefused += bombPositions.length;

    bombPositions.forEach(pos => {
      const tile = this.board.getTile(pos);
      if (!tile) return;

      this.board.removeTile(pos);
      tweens.push(this.removeBombSprite(tile.id, true));
      this.animateBombDefused(pos);
    });

    await Promise.all(tweens);
  }

  private animateBombDefused(pos: Position) {
    this.sfx(ASSET_KEYS.sfx.gemDestroy);
    const worldPos = this.toWorld(pos);
    const flash = this.add.circle(worldPos.x, worldPos.y, CELL_SIZE / 2, UI_COLORS.defusedFlash, 0.8)
      .setDepth(100);

    this.tweens.add({
      targets: flash,
      scale: 1.5,
      alpha: 0,
      duration: ANIMATION_DURATIONS.abilityFadeOut,
      ease: ANIMATION_EASING.fade,
      onComplete: () => flash.destroy(),
    });
  }

  private createAbilityCutscene(abilityName: string, bossTextureKey?: string, bossBackTextureKey?: string) {
    const overlay = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH * 2, GAME_HEIGHT * 2, 0x000000, 1)
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(500);

    const mainKey = bossTextureKey ?? ASSET_KEYS.boss.attack;
    const backKey = bossBackTextureKey ?? ASSET_KEYS.boss.attackBack;

    // Back (glow) layer
    const fullscreenBack = this.add
      .image(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 35, backKey)
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(500.5);
    const fitScale = GAME_WIDTH / fullscreenBack.width;
    fullscreenBack.setScale(fitScale);

    // Main (solid) layer
    const fullscreenBoss = this.add
      .image(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 35, mainKey)
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(501);
    fullscreenBoss.setScale(fitScale);

    const abilityText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 120, abilityName, {
        fontSize: "32px",
        fontFamily: "'Exo 2', Arial, sans-serif",
        color: "#ff4444",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 4,
        resolution: 2,
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(502);

    return { overlay, fullscreenBack, fullscreenBoss, abilityText };
  }

  private showAbilityCutscene(
    overlay: Phaser.GameObjects.Rectangle,
    fullscreenBack: Phaser.GameObjects.Image,
    fullscreenBoss: Phaser.GameObjects.Image,
    abilityText: Phaser.GameObjects.Text
  ): Promise<void> {
    this.sfx(ASSET_KEYS.sfx.enemyAttack);
    return new Promise<void>((resolve) => {
      this.tweens.add({
        targets: overlay,
        alpha: 0.6,
        duration: ANIMATION_DURATIONS.abilityOverlay,
        ease: ANIMATION_EASING.ability,
      });
      this.tweens.add({
        targets: [fullscreenBack, fullscreenBoss, abilityText],
        alpha: 1,
        duration: ANIMATION_DURATIONS.abilityFadeIn,
        delay: 100,
        ease: ANIMATION_EASING.ability,
        onComplete: () => resolve(),
      });
    });
  }

  private hideAbilityCutscene(
    overlay: Phaser.GameObjects.Rectangle,
    fullscreenBack: Phaser.GameObjects.Image,
    fullscreenBoss: Phaser.GameObjects.Image,
    abilityText: Phaser.GameObjects.Text
  ): Promise<void> {
    const elements = [overlay, fullscreenBack, fullscreenBoss, abilityText];
    return new Promise<void>((resolve) => {
      this.tweens.add({
        targets: elements,
        alpha: 0,
        duration: ANIMATION_DURATIONS.abilityFadeOut,
        ease: ANIMATION_EASING.fade,
        onComplete: () => {
          for (const el of elements) if (el.scene) el.destroy();
          resolve();
        },
      });
    });
  }

  private showBossShieldOverlay() {
    this.hideBossShieldOverlay(true);
    if (!this.bossImage) return;

    const shieldY = this.bossImage.y - this.bossImage.displayHeight * 0.15;
    const img = this.add.image(this.bossImage.x, shieldY, ASSET_KEYS.boss.shield);
    const targetHeight = this.bossImage.displayHeight * 0.2;
    const scale = targetHeight / img.height;
    img.setScale(scale);
    img.setDepth(0.4);
    img.setAlpha(0);
    this.bossShieldOverlay = img;

    // Duration text on the shield
    const shieldColor = this.bossShieldDuration <= 1 ? "#ffaa44" : "#ffffff";
    this.bossShieldText = this.add.text(img.x, img.y + 2, this.bossShieldDuration.toString(), {
      fontSize: "28px",
      fontFamily: "'Exo 2', Arial, sans-serif",
      color: shieldColor,
      fontStyle: "700",
      stroke: "#003366",
      strokeThickness: 5,
      resolution: 2,
    }).setOrigin(0.5).setDepth(0.5).setAlpha(0);

    // Fade in + alpha pulse (no preFX — safe on Android)
    this.tweens.add({
      targets: this.bossShieldText,
      alpha: 1,
      duration: 300,
      ease: "Quad.easeOut",
    });

    this.bossShieldGlowTween = this.tweens.add({
      targets: img,
      alpha: { from: 0.7, to: 1 },
      duration: HINT_ANIMATION.glowPulseDuration,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  private hideBossShieldOverlay(immediate = false) {
    if (this.bossShieldGlowTween) {
      this.bossShieldGlowTween.stop();
      this.bossShieldGlowTween = undefined;
    }
    if (!this.bossShieldOverlay) return;

    if (immediate) {
      this.bossShieldOverlay.destroy();
      this.bossShieldOverlay = undefined;
      this.bossShieldText?.destroy();
      this.bossShieldText = undefined;
      return;
    }

    const img = this.bossShieldOverlay;
    const txt = this.bossShieldText;
    this.bossShieldOverlay = undefined;
    this.bossShieldText = undefined;
    this.tweens.add({
      targets: [img, txt].filter(Boolean),
      alpha: 0,
      duration: 400,
      ease: "Quad.easeIn",
      onComplete: () => {
        img.destroy();
        txt?.destroy();
      },
    });
  }

  private flashPlayerAvatar() {
    if (!this.playerAvatar) return;

    this.playerAvatar.setFillStyle(0xffffff, 1);
    this.time.delayedCall(ANIMATION_DURATIONS.flashDuration, () => {
      this.playerAvatar?.setFillStyle(0x000000, 0);
    });
  }

  /** Show slash overlay on target. strong=true uses double slash texture. */
  private showSlashEffect(target: FlyTarget, strong: boolean) {
    const key = strong ? ASSET_KEYS.effects.slashDouble : ASSET_KEYS.effects.slash;
    if (!this.textures.exists(key)) return;

    const slash = this.add.image(target.x, target.y, key)
      .setDepth(4.5)
      .setAlpha(0)
      .setAngle(-10 + Math.random() * 20);

    // Scale to cover a large area (~350px for normal, ~400px for strong)
    const targetSize = strong ? 400 : 350;
    const scale = targetSize / Math.max(slash.width, slash.height);
    slash.setScale(scale);

    this.tweens.add({
      targets: slash,
      alpha: { from: 0, to: 1 },
      scale: scale * 1.3,
      duration: 180,
      ease: "Quad.easeOut",
      yoyo: true,
      onComplete: () => { if (slash.scene) slash.destroy(); },
    });
  }

  private showDefeat() {
    if (this.gameOver) return;
    this.stopHintTimer();
    this.gameOver = true;
    this.busy = true;
    this.sfx(ASSET_KEYS.sfx.gemDestroy);
    hapticDefeat();
    this.showGameEndModal("Defeat", "#ff6666", "Retry", false);
  }

  private showGameEndModal(message: string, textColor: string, buttonText: string, isVictory: boolean) {
    const font = "'Exo 2', Arial, sans-serif";

    // Screen flash
    const flashColor = isVictory ? 0xffff44 : 0xff4444;
    const flash = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, flashColor, 0.6)
      .setOrigin(0, 0)
      .setDepth(998);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 400,
      onComplete: () => flash.destroy(),
    });

    // Dark overlay with fade in
    const overlay = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0)
      .setOrigin(0, 0)
      .setDepth(999);
    this.tweens.add({ targets: overlay, alpha: 0.75, duration: 400 });

    // Title glow layer (blurred shadow)
    const titleGlow = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 110, message, {
        fontSize: "48px",
        color: textColor,
        fontFamily: font,
        fontStyle: "700",
        stroke: textColor,
        strokeThickness: 12,
        resolution: 2,
      })
      .setOrigin(0.5)
      .setDepth(1000)
      .setAlpha(0)
      .setScale(0);

    // Title sharp layer
    const title = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 110, message, {
        fontSize: "48px",
        color: "#ffffff",
        fontFamily: font,
        fontStyle: "700",
        stroke: textColor,
        strokeThickness: 6,
        resolution: 2,
      })
      .setOrigin(0.5)
      .setDepth(1000)
      .setScale(0);

    this.tweens.add({
      targets: [titleGlow, title],
      scale: 1,
      duration: 400,
      ease: "Back.easeOut",
      delay: 200,
    });
    this.tweens.add({
      targets: titleGlow,
      alpha: 0.3,
      duration: 400,
      delay: 200,
    });

    // Stats data: [emoji + label, value, color]
    const statRows: [string, string, string][] = [
      ["⚔  Урон нанесён", `${this.stats.totalDamageDealt}`, "#ff6666"],
      ["💔  Урон получен", `${this.stats.totalDamageReceived}`, "#ff88aa"],
      ["💚  Исцеление", `${this.stats.totalHealDone}`, "#44ff66"],
      ["🔥  Макс. каскад", `x${this.stats.maxCascade}`, "#ffdd44"],
      ["🎯  Ходов", `${this.stats.turnsPlayed}`, "#aaaaaa"],
      ["⚡  Скиллов", `${this.stats.skillsUsed}`, "#66bbff"],
      ["💣  Бомб обезврежено", `${this.stats.bombsDefused}`, "#44ff66"],
    ];

    const rowSpacing = 30;
    const panelPadX = 30;
    const panelWidth = GAME_WIDTH - panelPadX * 2;
    const panelHeight = statRows.length * rowSpacing + 24;
    const panelY = GAME_HEIGHT / 2 - 60;

    // Stats panel background
    const panelBg = this.add.graphics().setDepth(1000).setAlpha(0);
    panelBg.fillStyle(0x0a0c16, 0.85);
    panelBg.fillRoundedRect(panelPadX, panelY, panelWidth, panelHeight, 12);
    panelBg.lineStyle(1, 0x334466, 0.7);
    panelBg.strokeRoundedRect(panelPadX, panelY, panelWidth, panelHeight, 12);
    this.tweens.add({ targets: panelBg, alpha: 1, duration: 300, delay: 400 });

    const statsBaseY = panelY + 18;
    // Defer stat row creation to avoid frame spike from 14+ text objects at once
    statRows.forEach(([label, value, color], i) => {
      const rowDelay = 500 + i * 80;
      this.time.delayedCall(Math.max(0, rowDelay - 50), () => {
        const labelText = this.add
          .text(panelPadX + 16, statsBaseY + i * rowSpacing, label, {
            fontSize: "17px",
            color: "#cccccc",
            fontFamily: font,
            resolution: 2,
          })
          .setOrigin(0, 0.5)
          .setDepth(1000)
          .setAlpha(0);

        const valueText = this.add
          .text(panelPadX + panelWidth - 16, statsBaseY + i * rowSpacing, value, {
            fontSize: "17px",
            color,
            fontFamily: font,
            fontStyle: "700",
            resolution: 2,
          })
          .setOrigin(1, 0.5)
          .setDepth(1000)
          .setAlpha(0);

        this.tweens.add({
          targets: [labelText, valueText],
          alpha: 1,
          duration: 200,
          delay: 50,
        });
      });
    });

    // Button
    const btnY = panelY + panelHeight + 30;
    const btnW = 160;
    const btnH = 44;
    const btnColor = isVictory ? 0x2d5bff : 0xcc3333;

    const btnBg = this.add.graphics().setDepth(1000).setAlpha(0);
    btnBg.fillStyle(btnColor, 1);
    btnBg.fillRoundedRect(GAME_WIDTH / 2 - btnW / 2, btnY - btnH / 2, btnW, btnH, 10);
    btnBg.lineStyle(2, 0xffffff, 0.3);
    btnBg.strokeRoundedRect(GAME_WIDTH / 2 - btnW / 2, btnY - btnH / 2, btnW, btnH, 10);

    const btnText = this.add
      .text(GAME_WIDTH / 2, btnY, buttonText, {
        fontSize: "20px",
        color: "#ffffff",
        fontFamily: font,
        fontStyle: "700",
        resolution: 2,
      })
      .setOrigin(0.5)
      .setDepth(1000)
      .setAlpha(0);

    // Invisible hit area for the button
    const btnHit = this.add
      .rectangle(GAME_WIDTH / 2, btnY, btnW, btnH, 0x000000, 0)
      .setDepth(1001)
      .setInteractive({ useHandCursor: true })
      .on("pointerover", () => {
        btnBg.setScale(1.05);
        btnText.setScale(1.05);
      })
      .on("pointerout", () => {
        btnBg.setScale(1);
        btnText.setScale(1);
      })
      .on("pointerdown", () => {
        this.scene.stop("GameScene");
        this.scene.start("IntroScene");
      });
    btnHit.setAlpha(0);

    const btnDelay = 500 + statRows.length * 80 + 200;
    this.tweens.add({
      targets: [btnBg, btnText, btnHit],
      alpha: { value: 1, duration: 300, delay: btnDelay },
    });

    // Particles
    if (this.textures.exists(ASSET_KEYS.particle)) {
      if (isVictory) {
        // Confetti for victory
        const confetti = this.add.particles(GAME_WIDTH / 2, -10, ASSET_KEYS.particle, {
          x: { min: -GAME_WIDTH / 2, max: GAME_WIDTH / 2 },
          speed: { min: 60, max: 160 },
          angle: { min: 70, max: 110 },
          scale: { start: 1.2, end: 0.4 },
          alpha: { start: 1, end: 0 },
          lifespan: 2500,
          tint: [0xff4444, 0x44ff44, 0x4488ff, 0xffff44, 0xff44ff],
          frequency: 60,
          quantity: 3,
        });
        confetti.setDepth(1001);
        this.time.delayedCall(3000, () => {
          confetti.stop();
          this.time.delayedCall(2500, () => confetti.destroy());
        });
      } else {
        // Dark particles for defeat
        const darkParticles = this.add.particles(GAME_WIDTH / 2, GAME_HEIGHT + 10, ASSET_KEYS.particle, {
          x: { min: -GAME_WIDTH / 2, max: GAME_WIDTH / 2 },
          speed: { min: 20, max: 60 },
          angle: { min: 250, max: 290 },
          scale: { start: 1.0, end: 0.2 },
          alpha: { start: 0.5, end: 0 },
          lifespan: 3000,
          tint: [0x440000, 0x661111, 0x330000],
          frequency: 100,
          quantity: 2,
        });
        darkParticles.setDepth(1001);
        this.time.delayedCall(4000, () => {
          darkParticles.stop();
          this.time.delayedCall(3000, () => darkParticles.destroy());
        });
      }
    }
  }

  private showCascadeCounter(count: number): void {
    const fontSize = Math.min(36 + (count - 2) * 10, 64);
    const center = this.boardCenter;
    const text = this.add
      .text(center.x, center.y, `x${count}`, {
        fontSize: `${fontSize}px`,
        color: "#ffdd44",
        fontFamily: "'Exo 2', Arial, sans-serif",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 4,
        resolution: 2,
      })
      .setOrigin(0.5)
      .setDepth(100)
      .setScale(0);

    this.tweens.add({
      targets: text,
      scale: 1,
      duration: 250,
      ease: "Back.easeOut",
      onComplete: () => {
        this.tweens.add({
          targets: text,
          y: text.y - 40,
          alpha: 0,
          duration: 500,
          delay: 200,
          ease: "Quad.easeOut",
          onComplete: () => text.destroy(),
        });
      },
    });
  }

  private updateHitCounter(count: number): void {
    const L = UI_LAYOUT;
    const x = L.bossHpBarX + L.hpBarWidth;
    const y = L.bossNameY - 16;

    if (this.hitCounterText) {
      this.hitCounterText.setText(`${count} Hits!`);
      // Scale bounce on update
      this.hitCounterText.setScale(0.8);
      this.tweens.add({
        targets: this.hitCounterText,
        scale: 1,
        duration: 150,
        ease: "Back.easeOut",
      });
      return;
    }

    this.hitCounterText = this.add
      .text(x, y, `${count} Hits!`, {
        fontSize: "22px",
        color: "#ffd700",
        fontFamily: "'Exo 2', Arial, sans-serif",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 4,
        resolution: 2,
      })
      .setOrigin(1, 0.5)
      .setDepth(100)
      .setScale(0);

    this.tweens.add({
      targets: this.hitCounterText,
      scale: 1,
      duration: 200,
      ease: "Back.easeOut",
    });
  }

  private fadeOutHitCounter(): void {
    if (!this.hitCounterText) return;
    const text = this.hitCounterText;
    this.hitCounterText = undefined;
    this.tweens.add({
      targets: text,
      alpha: 0,
      y: text.y - 20,
      duration: 400,
      ease: "Quad.easeOut",
      onComplete: () => text.destroy(),
    });
  }

  private async checkAndReshuffle(): Promise<void> {
    let attempts = 0;
    while (this.board.findPotentialMoves().length === 0 && attempts < 10) {
      attempts++;
      this.board.shuffleBaseTiles();

      // Show reshuffle text
      const center = this.boardCenter;
      const text = this.add
        .text(center.x, center.y, "Перемешиваю!", {
          fontSize: "24px",
          color: "#ffffff",
          fontFamily: "'Exo 2', Arial, sans-serif",
          fontStyle: "bold",
          stroke: "#000000",
          strokeThickness: 3,
          resolution: 2,
        })
        .setOrigin(0.5)
        .setDepth(100);

      // Rebuild all tile sprites
      this.rebuildAllSprites();
      await wait(this, 600);
      text.destroy();

      // Check for accidental matches after shuffle and resolve them
      const matches = this.board.findMatches();
      if (matches.length > 0) {
        await this.resolveBoard(matches, [], false, "player");
      }
    }
  }

  private rebuildAllSprites(): void {
    // Destroy all current tile sprites
    this.tileSprites.forEach((sprite) => sprite.destroy());
    this.tileSprites.clear();
    this.clearBombCooldownTexts();
    this.clearTileGlows();

    // Rebuild from board state
    for (let y = 0; y < BOARD_HEIGHT; y++) {
      for (let x = 0; x < BOARD_WIDTH; x++) {
        const tile = this.board.getTile({ x, y });
        if (tile) {
          this.spawnTileSprite(tile, { x, y });
          // Recreate bomb cooldown texts
          if (tile.kind === TileKind.Bomb && tile.cooldown !== undefined) {
            const worldPos = this.toWorld({ x, y });
            this.createBombCooldownText(tile.id, worldPos.x, worldPos.y, tile.cooldown);
          }
        }
      }
    }
    this.rebuildPositionMap();
  }
}
