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
  saveGameParams,
  GAME_PARAMS,
  DPR,
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
import type { Match, Position, PotentialMove, Tile, CountTotals } from "../match3/types";
import { Meter } from "../ui/Meter";
import { SkillButton } from "../ui/SkillButton";
import { SettingsPanel } from "../ui/SettingsPanel";
import { CooldownIcon } from "../ui/CooldownIcon";
import { showDamageNumber } from "../ui/DamageNumber";
import { BossAbilityManager } from "../game/BossAbility";
import { BOSS_ABILITIES } from "../game/config";
import { ShieldIcon } from "../ui/ShieldIcon";
import { flyTilesToTarget } from "../ui/FlyingTile";
import type { FlyTarget } from "../ui/FlyingTile";
import { clamp, wait, tweenPromise } from "../utils/helpers";
import { SpeechBubble } from "../ui/SpeechBubble";
import { INTRO_ANIMATION } from "../game/animations";

const SKILL_TUTORIAL = [
  { id: "powerStrike" as SkillId, text: "⚡ Мощный удар\nНаноси урон, когда\nу босса нет щита!" },
  { id: "stun" as SkillId,        text: "⏳ Стан\nЗадержи атаку босса\nперед его мощным ударом!" },
  { id: "heal" as SkillId,        text: "💚 Хил\nВосстанавливай HP,\nкогда здоровье на исходе!" },
  { id: "hammer" as SkillId,      text: "🔨 Молоток\nУдали любую фишку с поля\n— полезно в трудный момент" },
];


export class GameScene extends Phaser.Scene {
  private board!: Match3Board;
  private tileSprites = new Map<number, Phaser.GameObjects.Image>();
  private tilePositions = new Map<number, Position>();
  private dragStart:
    | { pos: Position; point: Phaser.Math.Vector2 }
    | null = null;
  private busy = false;

  private bossHp = 0;
  private playerHp = 0;
  private mana = 0;

  private bossImage?: Phaser.GameObjects.Image;
  private bgImage?: Phaser.GameObjects.Image;
  private bgDebugMode = false; // Режим настройки фона
  private bossHpBar?: Meter;
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
  private shieldIcon?: ShieldIcon;
  private playerAvatar?: Phaser.GameObjects.Rectangle;

  private bossShieldDuration = 0;
  private bossShieldOverlay?: Phaser.GameObjects.Image;
  private bossShieldGlowTween?: Phaser.Tweens.Tween;
  private bombCooldownTexts = new Map<number, Phaser.GameObjects.Text>();

  private boardOrigin = { x: 0, y: 0 };
  private currentTurn: "player" | "boss" = "player";
  private gameOver = false;
  private turnText?: Phaser.GameObjects.Text;

  // Hint system
  private hintTimer?: Phaser.Time.TimerEvent;
  private hintTweens: (Phaser.Tweens.Tween | Phaser.Tweens.TweenChain)[] = [];
  private hintedSpriteIds: number[] = [];
  private potentialMoves: PotentialMove[] = [];
  private hintIndex = 0;

  // Tutorial & tips
  private bombTipShown = false;
  private shieldTipShown = false;
  private manaTipShown = false;
  private activeTip?: SpeechBubble;

  private cascadeCount = 0;

  constructor() {
    super("GameScene");
  }

  private sfx(key: string, volume = 0.5) {
    const mgr = this.sound as Phaser.Sound.WebAudioSoundManager;
    if (mgr.context?.state === "suspended") {
      mgr.context.resume().then(() => this.sound.play(key, { volume }));
      return;
    }
    this.sound.play(key, { volume });
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
    this.bossHpBar = undefined;
    this.playerHpBar = undefined;
    this.manaBar = undefined;
    this.cooldownIcon = undefined;
    this.shieldIcon = undefined;
    this.playerAvatar = undefined;
    this.turnText = undefined;
    this.hammerOverlay = undefined;
    this.hammerHint = undefined;
    this.bossShieldOverlay = undefined;
    this.bossShieldGlowTween = undefined;
    this.skillButtons = {};

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

    // Если не скрыто и есть финальный диалог - показываем сразу
    // При startHidden диалог будет показан после triggerFadeIn()
    if (!startHidden) {
      if (data?.finalDialogue) {
        this.showFinalIntroBubble(data.finalDialogue).then(() => {
          this.maybeShowSkillTutorial().then(() => this.startHintTimer());
        });
      } else {
        this.maybeShowSkillTutorial().then(() => this.startHintTimer());
      }
    }
  }

  private async fadeInUI(): Promise<void> {
    const elementsToFade: Phaser.GameObjects.GameObject[] = [];

    // Собираем все UI элементы кроме босса
    this.children.list.forEach(child => {
      if (child !== this.bossImage && (child as any).alpha !== undefined) {
        elementsToFade.push(child);
      }
    });

    // Fade in игровых элементов
    return new Promise(resolve => {
      this.tweens.add({
        targets: elementsToFade,
        alpha: 1,
        duration: INTRO_ANIMATION.gameElementsFadeIn,
        ease: "Quad.easeOut",
        onComplete: () => resolve(),
      });
    });
  }

  public async triggerFadeIn(finalDialogue?: string): Promise<void> {
    await this.fadeInUI();
    if (finalDialogue) {
      await this.showFinalIntroBubble(finalDialogue);
    }
    await this.maybeShowSkillTutorial();
    this.startHintTimer();
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
    await wait(this, INTRO_ANIMATION.speechBubbleHold);
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
    this.skillCooldowns = { powerStrike: 0, stun: 0, heal: 0, hammer: 0 };
    this.bombTipShown = false;
    this.shieldTipShown = false;
    this.manaTipShown = false;
    this.activeTip = undefined;
    this.board = new Match3Board(BOARD_WIDTH, BOARD_HEIGHT);
    this.bossAbilityManager = new BossAbilityManager();
    this.tileSprites.clear();
    this.tilePositions.clear();
    this.clearBombCooldownTexts();
    this.rebuildPositionMap();
    this.shieldIcon?.hide();
    this.hideBossShieldOverlay(true);
  }

  private clearBombCooldownTexts() {
    this.bombCooldownTexts.forEach(text => text.destroy());
    this.bombCooldownTexts.clear();
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

    // === ИЗОБРАЖЕНИЕ БОССА (всегда из конфига) ===
    this.bossImage = this.add
      .image(0, 0, ASSET_KEYS.boss.battle)
      .setOrigin(0.5, 0.5)
      .setDepth(0);
    const bossY = GAME_PARAMS.background.offsetY + GAME_PARAMS.background.bossOnBgY * this.bgImage.displayHeight;
    this.bossImage.setPosition(GAME_WIDTH / 2, bossY);
    const bossScale = bgScale * GAME_PARAMS.background.bossScale;
    this.bossImage.setScale(bossScale);

    // === НАЗВАНИЕ БОССА ===
    this.add
      .text(L.bossHpBarX, L.bossNameY, "Сафира: Пламя Бездны", {
        fontSize: "16px",
        color: "#ffffff",
        fontFamily: "Arial, sans-serif",
      })
      .setOrigin(0, 0.5)
      .setDepth(4)
      .setAlpha(initialAlpha);

    // === HP БАР БОССА ===
    this.bossHpBar = new Meter(
      this, L.bossHpBarX, L.bossHpBarY,
      L.hpBarWidth, L.hpBarHeight, "", UI_COLORS.bossHp
    ).setDepth(4).setAlpha(initialAlpha);

    // === ИКОНКА КУЛДАУНА ===
    this.cooldownIcon = new CooldownIcon(this, L.cooldownIconX, L.cooldownIconY, L.cooldownIconSize);
    this.cooldownIcon.setDepth(4).setAlpha(initialAlpha);

    // === ИКОНКА ЩИТА ===
    this.shieldIcon = new ShieldIcon(this, GAME_WIDTH / 2, L.bossHpBarY - 30, 40);
    this.shieldIcon.setDepth(4).setAlpha(initialAlpha);

    // === АВАТАР ИГРОКА (изображение с золотой рамкой и маской) ===
    // Золотая рамка
    const frameGraphics = this.add.graphics();
    const framePadding = 4;
    frameGraphics.fillStyle(0xc9a227, 1);
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

    // === HP БАР ИГРОКА ===
    this.playerHpBar = new Meter(
      this, L.playerHpBarX, L.playerHpBarY,
      L.playerBarWidth, L.playerBarHeight, "", UI_COLORS.playerHp
    ).setDepth(4).setAlpha(initialAlpha);

    // === MANA БАР ИГРОКА ===
    this.manaBar = new Meter(
      this, L.playerHpBarX, L.playerMpBarY,
      L.playerBarWidth, L.playerBarHeight, "", UI_COLORS.playerMana
    ).setDepth(4).setAlpha(initialAlpha);

    // Текст хода (скрыт, не нужен по референсу)
    this.turnText = this.add
      .text(GAME_WIDTH - 16, L.bossNameY, "", { fontSize: "14px", color: "#ffffff", fontFamily: "Arial, sans-serif" })
      .setOrigin(1, 0.5)
      .setDepth(4)
      .setVisible(false);

    // === КНОПКА НАСТРОЕК ===
    this.add
      .text(GAME_WIDTH - 35, 65 + SAFE_AREA.top, "⚙️", {
        fontSize: "26px",
        fontFamily: "Arial, sans-serif",
      })
      .setOrigin(0.5)
      .setDepth(5)
      .setAlpha(initialAlpha)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.openSettings());

    // === SPINE POC (Spineboy idle) ===
    try {
      if (this.add.spine) {
        const spineboy = this.add.spine(
          L.avatarX,
          L.avatarY + L.avatarHeight / 2,
          "spineboy",
          "idle",
          true
        );
        spineboy.setScale(0.08);
        spineboy.setDepth(5);
        spineboy.setAlpha(initialAlpha);
      }
    } catch {
      // Spine plugin not loaded — skip silently
    }

    // Режим настройки фона
    if (this.bgDebugMode) {
      this.buildBgDebugUI();
    }
  }

  private buildBgDebugUI() {
    const container = this.add.container(0, 0);
    container.setDepth(100);

    // Панель с кнопками
    const panelY = 120;
    const panelBg = this.add.rectangle(GAME_WIDTH / 2, panelY, 280, 100, 0x000000, 0.8);
    panelBg.setStrokeStyle(2, 0xffffff, 0.5);
    container.add(panelBg);

    // Текст с текущим значением
    const offsetText = this.add.text(GAME_WIDTH / 2, panelY - 30, `Смещение: ${GAME_PARAMS.background.offsetY}`, {
      fontSize: "18px",
      color: "#ffffff",
      fontFamily: "Arial, sans-serif",
    }).setOrigin(0.5);
    container.add(offsetText);

    // Кнопка ВВЕРХ
    const btnUp = this.add.text(GAME_WIDTH / 2 - 80, panelY + 5, "▲ Вверх", {
      fontSize: "16px",
      color: "#ffffff",
      backgroundColor: "#333333",
      padding: { x: 12, y: 8 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    btnUp.on("pointerdown", () => {
      GAME_PARAMS.background.offsetY -= 20;
      this.updateBgPosition();
      offsetText.setText(`Смещение: ${GAME_PARAMS.background.offsetY}`);
    });
    container.add(btnUp);

    // Кнопка ВНИЗ
    const btnDown = this.add.text(GAME_WIDTH / 2 + 80, panelY + 5, "▼ Вниз", {
      fontSize: "16px",
      color: "#ffffff",
      backgroundColor: "#333333",
      padding: { x: 12, y: 8 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    btnDown.on("pointerdown", () => {
      GAME_PARAMS.background.offsetY += 20;
      this.updateBgPosition();
      offsetText.setText(`Смещение: ${GAME_PARAMS.background.offsetY}`);
    });
    container.add(btnDown);

    // Кнопка СОХРАНИТЬ
    const btnSave = this.add.text(GAME_WIDTH / 2, panelY + 35, "💾 Сохранить", {
      fontSize: "16px",
      color: "#00ff00",
      backgroundColor: "#004400",
      padding: { x: 16, y: 8 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    btnSave.on("pointerdown", () => {
      saveGameParams();
      offsetText.setText(`Смещение: ${GAME_PARAMS.background.offsetY} ✓`);
    });
    container.add(btnSave);
  }

  private updateBgPosition() {
    if (this.bgImage) {
      this.bgImage.setY(GAME_PARAMS.background.offsetY);
    }
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
      .setStrokeStyle(2, 0xffffff, 0.08)
      .setAlpha(initialAlpha);
    // Depth 0.5 чтобы закрывать Сафиру (0), но быть под тайлами (1)
    bg.setDepth(0.5);

    // Semi-transparent grid lines
    const gridGfx = this.add.graphics();
    gridGfx.lineStyle(1, 0xffffff, 0.08);
    for (let col = 1; col < BOARD_WIDTH; col++) {
      const lx = this.boardOrigin.x + col * CELL_SIZE;
      gridGfx.moveTo(lx, this.boardOrigin.y);
      gridGfx.lineTo(lx, this.boardOrigin.y + heightPx);
    }
    for (let row = 1; row < BOARD_HEIGHT; row++) {
      const ly = this.boardOrigin.y + row * CELL_SIZE;
      gridGfx.moveTo(this.boardOrigin.x, ly);
      gridGfx.lineTo(this.boardOrigin.x + widthPx, ly);
    }
    gridGfx.strokePath();
    gridGfx.setDepth(0.6).setAlpha(initialAlpha);

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

    const skillIds: SkillId[] = ["powerStrike", "stun", "heal", "hammer"];

    skillIds.forEach((id, idx) => {
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
  }

  private setupInputHandlers() {
    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      const start = this.dragStart;
      this.dragStart = null;

      if (!start || !this.canPlayerAct()) return;

      const dx = pointer.x - start.point.x;
      const dy = pointer.y - start.point.y;
      const isTap = Math.abs(dx) < INPUT_THRESHOLD.tapDistance && Math.abs(dy) < INPUT_THRESHOLD.tapDistance;

      if (isTap) {
        this.handleTap(start.pos);
      } else {
        const dir = this.getSwipeDirection(dx, dy);
        const target = { x: start.pos.x + dir.x, y: start.pos.y + dir.y };
        this.attemptSwap(start.pos, target);
      }
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

  private handleTap(pos: Position) {
    const tile = this.board.getTile(pos);
    if (!tile || !this.board.isSpecial(tile.kind)) return;

    this.sfx(ASSET_KEYS.sfx.specialActivate);
    this.stopHintTimer();
    this.busy = true;
    this.resolveBoard([], [pos], [], true, "player").finally(() => {
      if (!this.gameOver && this.currentTurn === "player") {
        this.busy = false;
      }
    });
  }

  private attemptSwap(a: Position, b: Position) {
    if (!this.board.inBounds(a) || !this.board.inBounds(b)) return;
    const tileA = this.board.getTile(a);
    const tileB = this.board.getTile(b);
    if (!tileA || !tileB) return;

    // Бомбы нельзя перемещать
    if (tileA.kind === TileKind.Bomb || tileB.kind === TileKind.Bomb) return;

    this.stopHintTimer();
    this.busy = true;

    this.board.swap(a, b);
    this.rebuildPositionMap();
    this.animateSwap(tileA.id, tileB.id)
      .then(() => {
        const specials: Position[] = [];
        const tileAfterA = this.board.getTile(a);
        const tileAfterB = this.board.getTile(b);
        if (tileAfterA && this.board.isSpecial(tileAfterA.kind)) {
          specials.push({ ...a });
        }
        if (tileAfterB && this.board.isSpecial(tileAfterB.kind)) {
          specials.push({ ...b });
        }
        const matches = this.board.findMatches();
        if (!matches.length && !specials.length) {
          // invalid swap, revert
          this.sfx(ASSET_KEYS.sfx.swapFail);
          this.board.swap(a, b);
          this.rebuildPositionMap();
          return this.animateSwap(tileA.id, tileB.id);
        }
        return this.resolveBoard(matches, specials, [a, b], true, "player");
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
    manualSpecials: Position[],
    swapTargets: Position[],
    endTurnAfter = false,
    actor: "player" | "boss" = "player"
  ) {
    let loopMatches = matches;
    let loopSpecials = manualSpecials;
    this.cascadeCount = 0;

    while (loopMatches.length || loopSpecials.length) {
      const outcome = this.board.computeClearOutcome(
        loopMatches,
        loopSpecials,
        swapTargets
      );
      if (!outcome.cleared.length && !outcome.transforms.length) break;

      this.sfx(this.cascadeCount === 0 ? ASSET_KEYS.sfx.match : ASSET_KEYS.sfx.cascade);
      this.cascadeCount++;

      await this.animateClear(outcome, actor);

      // Применяем эффекты СРАЗУ после полёта фишек (не в конце!)
      this.applyMatchResults(outcome.counts, actor);

      // Если игра закончилась - прекращаем цикл
      if (this.gameOver) break;

      // Проверяем бомбы рядом с очищенными позициями
      const clearedPositions = outcome.cleared.map(c => c.pos);
      const adjacentBombs = this.board.getAdjacentBombs(clearedPositions);
      if (adjacentBombs.length > 0) {
        await this.defuseBombs(adjacentBombs);
      }

      const collapse = this.board.applyClearOutcome(outcome);
      this.rebuildPositionMap();
      await this.animateCollapse(collapse);

      loopMatches = this.board.findMatches();
      loopSpecials = [];
      swapTargets = [];
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

  private applyDamageToBoss(damage: number) {
    if (damage <= 0) return;

    // Проверка щита
    if (this.bossShieldDuration > 0) {
      this.sfx(ASSET_KEYS.sfx.shieldBlock);
      if (this.shieldIcon) {
        showDamageNumber(this, this.shieldIcon.x, this.shieldIcon.y, 0, "shield");
      }
      if (this.bossImage) {
        this.shakeTarget(this.bossImage, VISUAL_EFFECTS.damageShakeOffset * 0.3);
      }
      return;
    }

    this.bossHp = Math.max(0, this.bossHp - damage);
    this.sfx(ASSET_KEYS.sfx.bossHit);
    if (this.bossImage) {
      this.flashBoss();
      showDamageNumber(this, this.bossImage.x, this.bossImage.y + 60, damage, "damage");
      this.shakeTarget(this.bossImage, VISUAL_EFFECTS.damageShakeOffset);
    }
  }

  private applyDamageToPlayer(damage: number) {
    if (damage <= 0) return;

    this.sfx(ASSET_KEYS.sfx.playerHit);
    this.playerHp = clamp(this.playerHp - damage, 0, GAME_PARAMS.player.hpMax);
    if (this.playerAvatar) {
      showDamageNumber(this, this.playerAvatar.x, this.playerAvatar.y - 30, damage, "damage");
    }
  }

  private applyManaToPlayer(manaGain: number) {
    if (manaGain <= 0) return;

    const oldMana = this.mana;
    this.mana = clamp(this.mana + manaGain, 0, GAME_PARAMS.player.manaMax);
    const actualGain = this.mana - oldMana;

    if (actualGain > 0) {
      this.sfx(ASSET_KEYS.sfx.mana, 0.3);
      if (this.playerAvatar) {
        showDamageNumber(this, this.playerAvatar.x, this.playerAvatar.y - 20, actualGain, "mana");
      }
    }

    // Tip: first time mana is enough for cheapest skill
    if (!this.manaTipShown) {
      const minCost = Math.min(...Object.values(SKILL_CONFIG).map(s => s.cost));
      if (this.mana >= minCost) {
        this.manaTipShown = true;
        // Show asynchronously, don't block game flow
        this.time.delayedCall(500, () => this.showTip("Достаточно маны!\nИспользуй скил внизу"));
      }
    }
  }

  private applyHealToPlayer(healGain: number) {
    if (healGain <= 0) return;

    const oldHp = this.playerHp;
    this.playerHp = clamp(this.playerHp + healGain, 0, GAME_PARAMS.player.hpMax);
    const actualHeal = this.playerHp - oldHp;

    if (actualHeal > 0) {
      this.sfx(ASSET_KEYS.sfx.heal);
      if (this.playerAvatar) {
        showDamageNumber(this, this.playerAvatar.x, this.playerAvatar.y - 40, actualHeal, "heal");
      }
    }
  }

  private applyHealToBoss(healGain: number) {
    if (healGain <= 0) return;
    this.bossHp = clamp(this.bossHp + healGain, 0, GAME_PARAMS.boss.hpMax);
  }

  private shakeTarget(target: Phaser.GameObjects.Image, offset: number) {
    this.tweens.add({
      targets: target,
      x: target.x + offset,
      duration: ANIMATION_DURATIONS.shakeDuration,
      yoyo: true,
      repeat: 2,
    });
  }

  private flashBoss() {
    if (!this.bossImage) return;
    this.bossImage.setTint(0xffffff);
    this.time.delayedCall(ANIMATION_DURATIONS.flashDuration, () => {
      this.bossImage?.clearTint();
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

  private spawnTileSprite(tile: Tile, pos: Position, startYOrAlpha?: number, initialAlpha?: number) {
    const world = this.toWorld(pos);
    // Если передан startY как число > 1, это Y-координата. Иначе это alpha.
    const startY = (startYOrAlpha !== undefined && startYOrAlpha > 1) ? startYOrAlpha : undefined;
    const alpha = initialAlpha ?? ((startYOrAlpha !== undefined && startYOrAlpha <= 1) ? startYOrAlpha : 1);

    const sprite = this.add
      .image(world.x, startY ?? world.y, this.getTileTexture(tile))
      .setDisplaySize(CELL_SIZE - 2, CELL_SIZE - 2)
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
      this.dragStart = {
        pos: { ...current },
        point: new Phaser.Math.Vector2(pointer.x, pointer.y),
      };
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

    this.sfx(ASSET_KEYS.sfx.swap);
    return Promise.all([
      this.createTween(spriteA, this.toWorld(posA), ANIMATION_DURATIONS.swap, ANIMATION_EASING.swap),
      this.createTween(spriteB, this.toWorld(posB), ANIMATION_DURATIONS.swap, ANIMATION_EASING.swap),
    ]).then(() => {});
  }

  private animateClear(
    outcome: {
      cleared: Array<{ pos: Position; tile: Tile }>;
      transforms: Array<{ tile: Tile | null; kind: TileKind; pos: Position }>;
    },
    actor: "player" | "boss" = "player"
  ) {
    const tweens: Promise<void>[] = [];

    this.animateTransforms(outcome.transforms);

    const { tilesToBoss, tilesToPlayer } = this.groupTilesByTarget(outcome.cleared, tweens, actor);

    if (tilesToBoss.length > 0) {
      tweens.push(flyTilesToTarget(this, tilesToBoss, this.bossTarget, ANIMATION_DURATIONS.tileFly));
    }
    if (tilesToPlayer.length > 0) {
      tweens.push(flyTilesToTarget(this, tilesToPlayer, this.playerTarget, ANIMATION_DURATIONS.tileFly));
    }

    return Promise.all(tweens);
  }

  private animateTransforms(transforms: Array<{ tile: Tile | null; kind: TileKind; pos: Position }>) {
    if (transforms.length > 0) {
      this.sfx(ASSET_KEYS.sfx.specialCreate);
    }
    transforms.forEach((transform) => {
      // Получаем тайл на позиции (ещё не трансформирован в Board)
      const tile = this.board.getTile(transform.pos);
      if (!tile) return;
      const sprite = this.tileSprites.get(tile.id);
      if (sprite) {
        // Используем kind из transform, а не из tile (tile ещё не обновлён)
        const textureKey = ASSET_KEYS.tiles[transform.kind] ?? transform.kind;
        sprite.setTexture(textureKey);
        // ВАЖНО: пересчитываем размер после смены текстуры
        sprite.setDisplaySize(CELL_SIZE - 2, CELL_SIZE - 2);
        const baseScale = sprite.scaleX;
        this.tweens.add({
          targets: sprite,
          scaleX: baseScale * VISUAL_EFFECTS.transformScaleFactor,
          scaleY: baseScale * VISUAL_EFFECTS.transformScaleFactor,
          duration: 150,
          yoyo: true,
          ease: ANIMATION_EASING.scale,
        });
      }
    });
  }

  private isDamageTile(kind: TileKind): boolean {
    return DAMAGE_TILES.includes(kind as typeof DAMAGE_TILES[number]);
  }

  private isResourceTile(kind: TileKind): boolean {
    return RESOURCE_TILES.includes(kind as typeof RESOURCE_TILES[number]);
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

      const isDamage = this.isDamageTile(tile.base);
      const isResource = this.isResourceTile(tile.base);

      // Damage tiles fly to opponent, resource tiles fly to self
      const toOpponent = actor === "player" ? tilesToBoss : tilesToPlayer;
      const toSelf = actor === "player" ? tilesToPlayer : tilesToBoss;

      if (isDamage) {
        toOpponent.push(tileData);
      } else if (isResource) {
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
      this.sfx(ASSET_KEYS.sfx.tileCollapse, 0.3);
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

    if (this.turnText) {
      const isPlayerTurn = this.currentTurn === "player";
      this.turnText.setText(isPlayerTurn ? "Ваш ход" : "Ход босса");
      this.turnText.setColor(isPlayerTurn ? UI_COLORS.playerTurnText : UI_COLORS.bossTurnText);
    }

    // Обновляем состояние всех 4 кнопок способностей
    const skillIds: SkillId[] = ["powerStrike", "stun", "heal", "hammer"];
    skillIds.forEach((id) => {
      const cfg = SKILL_CONFIG[id];
      const cooldown = this.skillCooldowns[id];
      const canUse = cooldown === 0 && this.mana >= cfg.cost && this.currentTurn === "player" && !this.busy;
      this.skillButtons[id]?.applyState({
        enabled: canUse,
        ready: canUse,
        cooldown,
        info: `${cfg.cost} MP`,
      });
    });
  }

  private updateBossArt() {
    if (!this.bossImage) return;
    const ratio = this.bossHp / GAME_PARAMS.boss.hpMax;
    // Используем battle (не normal) для синхронизации с интро
    const key = ratio >= BOSS_DAMAGED_HP_THRESHOLD ? ASSET_KEYS.boss.battle : ASSET_KEYS.boss.damaged;
    this.bossImage.setTexture(key);
  }

  private activateSkill(id: SkillId) {
    if (!this.canPlayerAct()) return;
    this.stopHintTimer();

    const cfg = SKILL_CONFIG[id];

    // Проверяем кулдаун
    if (this.skillCooldowns[id] > 0) return;
    // Проверяем ману
    if (this.mana < cfg.cost) return;

    this.mana -= cfg.cost;
    this.skillCooldowns[id] = cfg.cooldown; // Ставим на кулдаун

    // Звук общий для всех скиллов
    this.sfx(ASSET_KEYS.sfx.skill);

    // Обработка разных скиллов
    if (id === "powerStrike") {
      this.applyDamageToBoss(cfg.damage);
      this.flashBoss();
      if (this.bossImage) {
        this.shakeTarget(this.bossImage, VISUAL_EFFECTS.bossShakeOffset);
      }
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
        fontFamily: "Arial, sans-serif",
        stroke: "#000000",
        strokeThickness: 3,
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

  private async removeWithHammer(pos: Position) {
    const tile = this.board.getTile(pos);
    if (!tile) return;

    // Удалить фишку без эффекта
    this.sfx(ASSET_KEYS.sfx.hammer);
    this.board.removeTile(pos);
    const sprite = this.tileSprites.get(tile.id);
    sprite?.destroy();
    this.tileSprites.delete(tile.id);

    // Убрать текст бомбы если была
    this.bombCooldownTexts.get(tile.id)?.destroy();
    this.bombCooldownTexts.delete(tile.id);

    // Выйти из режима молотка
    this.exitHammerMode();

    // Collapse + refill
    const collapse = this.board.collapseGrid();
    this.rebuildPositionMap();
    await this.animateCollapse(collapse);

    // Проверить каскадные матчи
    const matches = this.board.findMatches();
    if (matches.length > 0) {
      await this.resolveBoard(matches, [], [], false, "player");
    }

    this.updateHud();
    this.startHintTimer();
  }

  private tickSkillCooldowns() {
    const skillIds: SkillId[] = ["powerStrike", "stun", "heal", "hammer"];
    for (const id of skillIds) {
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
    this.sfx(ASSET_KEYS.sfx.victory);
    this.showGameEndModal("Victory!", "#44ff66", "Restart");
  }

  private toWorld(pos: Position) {
    return {
      x: this.boardOrigin.x + pos.x * CELL_SIZE + CELL_SIZE / 2,
      y: this.boardOrigin.y + pos.y * CELL_SIZE + CELL_SIZE / 2,
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
    this.hintIndex = 0;

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
      if (tween.isPlaying()) tween.stop();
    }
    this.hintTweens = [];

    for (const id of this.hintedSpriteIds) {
      const sprite = this.tileSprites.get(id);
      if (sprite) {
        sprite.preFX?.clear();
        const pos = this.tilePositions.get(id);
        if (pos) {
          const world = this.toWorld(pos);
          sprite.setPosition(world.x, world.y);
        }
      }
    }
    this.hintedSpriteIds = [];
  }

  private showNextHint() {
    this.clearHintVisuals();
    if (this.potentialMoves.length === 0) return;

    const move = this.potentialMoves[this.hintIndex % this.potentialMoves.length];
    this.hintIndex++;

    // Glow all match tiles + from tile
    const allHintPositions = [...move.matchPositions, move.from];
    for (const pos of allHintPositions) {
      const tile = this.board.getTile(pos);
      if (!tile) continue;
      const sprite = this.tileSprites.get(tile.id);
      if (!sprite || !sprite.preFX) continue;
      const glow = sprite.preFX.addGlow(HINT_ANIMATION.glowColor, 0);
      const tween = this.tweens.add({
        targets: glow,
        outerStrength: HINT_ANIMATION.glowMaxStrength,
        duration: HINT_ANIMATION.glowPulseDuration,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
      this.hintTweens.push(tween);
      this.hintedSpriteIds.push(tile.id);
    }

    // Shake the "from" tile in the swipe direction
    const fromTile = this.board.getTile(move.from);
    if (!fromTile) return;
    const fromSprite = this.tileSprites.get(fromTile.id);
    if (!fromSprite) return;

    const dx = move.to.x - move.from.x;
    const dy = move.to.y - move.from.y;
    const dist = HINT_ANIMATION.shakeDistance;

    // Use grid position as base (not sprite.x/y) to prevent drift
    const world = this.toWorld(move.from);
    fromSprite.setPosition(world.x, world.y);

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
    const tweens = [];
    for (let i = 0; i <= HINT_ANIMATION.shakeRepeat; i++) {
      tweens.push({ ...fwd }, { ...bwd });
    }
    const chain = this.tweens.chain({ tweens });
    this.hintTweens.push(chain);
  }

  // ===== Tutorial & Tips =====

  private async maybeShowSkillTutorial(): Promise<void> {
    this.busy = true;

    // Create overlay (fillAlpha=1, gameObject alpha tweened 0→0.6)
    const overlay = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 1)
      .setOrigin(0, 0)
      .setDepth(200)
      .setAlpha(0)
      .setInteractive();

    await tweenPromise(this, {
      targets: overlay,
      alpha: 0.6,
      duration: 200,
    });

    for (let i = 0; i < SKILL_TUTORIAL.length; i++) {
      const step = SKILL_TUTORIAL[i];
      const btn = this.skillButtons[step.id];
      if (!btn) continue;

      // Raise button above overlay
      btn.setDepth(201);

      // Pulse button
      const pulseTween = this.tweens.add({
        targets: btn,
        scaleX: 1.15,
        scaleY: 1.15,
        duration: 500,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });

      // Speech bubble centered above skill buttons, no tail
      const bubbleY = btn.y - UI_LAYOUT.skillButtonSize / 2 - 60;
      const bubble = new SpeechBubble(this, GAME_WIDTH / 2, bubbleY, {
        text: step.text,
        tailDirection: "none",
        maxWidth: 260,
        fontSize: "15px",
      });
      bubble.setDepth(202);
      await bubble.fadeIn(200);

      // Wait for tap
      await this.waitForTap(overlay);

      // Clean up step
      await bubble.fadeOut(150);
      pulseTween.stop();
      btn.setScale(1);
      btn.setDepth(2);
    }

    // Hide overlay
    await tweenPromise(this, {
      targets: overlay,
      alpha: 0,
      duration: 200,
    });
    overlay.destroy();

    this.busy = false;
  }

  private waitForTap(target: Phaser.GameObjects.GameObject): Promise<void> {
    return new Promise(resolve => {
      target.once("pointerdown", resolve);
    });
  }

  private async showTip(text: string, duration = 2000): Promise<void> {
    // Don't show tips during busy animations or if a tip is already active
    if (this.activeTip) return;

    // Stop hint animations while tip is visible
    this.stopHintTimer();

    const bubbleY = UI_LAYOUT.boardOriginY + UI_LAYOUT.boardHeight + 5;
    const bubble = new SpeechBubble(this, GAME_WIDTH / 2, bubbleY, {
      text,
      tailDirection: "up",
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

    // Тикаем кулдауны скиллов игрока
    this.tickSkillCooldowns();

    this.checkGameOver();
    if (this.gameOver) return;

    // Тикаем щит босса
    if (this.bossShieldDuration > 0) {
      this.bossShieldDuration--;
      this.shieldIcon?.updateDuration(this.bossShieldDuration);
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
      this.updateHud();
      this.checkGameOver();
      if (this.gameOver) return;

      await wait(this, 150);
    }

    // Collapse and refill after all bombs processed
    const collapse = this.board.collapseGrid();
    this.rebuildPositionMap();
    await this.animateCollapse(collapse);

    // Check for cascade matches (boss's turn)
    const matches = this.board.findMatches();
    if (matches.length > 0) {
      await this.resolveBoard(matches, [], [], false, "boss");
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

    return Promise.all(promises).then(() => {});
  }

  private async executeBossAbility() {
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
    this.sfx(ASSET_KEYS.sfx.bossAttack);
    this.cameras.main.shake(200, 0.015 / DPR);
    this.applyDamageToPlayer(config.damage);
    this.flashPlayerAvatar();
    this.updateHud();
    await wait(this, 300);
  }

  private async withCutscene(abilityName: string, logic: () => Promise<void>, bossTextureKey?: string) {
    const { overlay, fullscreenBoss, abilityText } = this.createAbilityCutscene(abilityName, bossTextureKey);
    await this.showAbilityCutscene(overlay, fullscreenBoss, abilityText);
    await wait(this, 600);
    await logic();
    await wait(this, 400);
    await this.hideAbilityCutscene(overlay, fullscreenBoss, abilityText);
  }

  private async executeBombs() {
    const config = BOSS_ABILITIES.bombs;
    await this.withCutscene(config.name, async () => {
      const { placed, replaced } = this.board.placeBombs(config.bombCount, config.bombCooldown);

      // Удаляем спрайты замененных тайлов
      replaced.forEach(({ tile }) => {
        const sprite = this.tileSprites.get(tile.id);
        sprite?.destroy();
        this.tileSprites.delete(tile.id);
      });

      this.rebuildPositionMap();
      await this.animateBombsAppear(placed);
    });

    if (!this.bombTipShown) {
      this.bombTipShown = true;
      await this.showTip("Собирай тайлы рядом\nс бомбами, чтобы обезвредить!");
    }
  }

  private async executeShield() {
    const config = BOSS_ABILITIES.shield;
    await this.withCutscene(config.name, async () => {
      this.sfx(ASSET_KEYS.sfx.shieldActivate);
      this.bossShieldDuration = config.shieldDuration;
      this.shieldIcon?.show(this.bossShieldDuration);
      if (this.shieldIcon) {
        showDamageNumber(this, this.shieldIcon.x, this.shieldIcon.y, 0, "shield");
      }

      // Show shield image appearing during cutscene
      this.showBossShieldOverlay();
    }, ASSET_KEYS.boss.battle);

    if (!this.shieldTipShown) {
      this.shieldTipShown = true;
      await this.showTip("Босс под щитом!\nУрон заблокирован");
    }
  }

  private async executePowerStrike() {
    const config = BOSS_ABILITIES.powerStrike;
    await this.withCutscene(config.name, async () => {
      this.sfx(ASSET_KEYS.sfx.bossAttack);
      this.cameras.main.shake(300, 0.02 / DPR);
      this.applyDamageToPlayer(config.damage);
      this.flashPlayerAvatar();

      const manaDrain = Math.min(this.mana, config.manaDrain);
      if (manaDrain > 0) {
        this.sfx(ASSET_KEYS.sfx.manaDrain);
        this.mana -= manaDrain;
        if (this.playerAvatar) {
          showDamageNumber(this, this.playerAvatar.x, this.playerAvatar.y - 10, manaDrain, "mana_loss");
        }
      }
      this.updateHud();
    });
  }

  private async animateBombsAppear(bombs: Array<{ pos: Position; tile: Tile }>) {
    this.sfx(ASSET_KEYS.sfx.bombPlace);
    const tweens: Promise<void>[] = [];

    bombs.forEach(({ pos, tile }) => {
      const worldPos = this.toWorld(pos);
      const startY = this.boardOrigin.y - CELL_SIZE;

      // Create bomb sprite
      const sprite = this.spawnTileSprite(tile, pos, startY);
      sprite.setPosition(worldPos.x, startY);

      // Create cooldown text (positioned at cell center since toWorld returns center)
      const cooldownText = this.add.text(
        worldPos.x,
        startY,
        tile.cooldown?.toString() ?? "",
        {
          fontSize: "16px",
          fontFamily: "Arial, sans-serif",
          color: "#ffffff",
          fontStyle: "bold",
          stroke: "#000000",
          strokeThickness: 3,
        }
      ).setOrigin(0.5).setDepth(2);
      this.bombCooldownTexts.set(tile.id, cooldownText);

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
          this.sfx(ASSET_KEYS.sfx.bombExplode);
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
    this.sfx(ASSET_KEYS.sfx.bombDefuse);
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

  private createAbilityCutscene(abilityName: string, bossTextureKey?: string) {
    const overlay = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0)
      .setOrigin(0, 0)
      .setDepth(500);

    const fullscreenBoss = this.add
      .image(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 35, bossTextureKey ?? ASSET_KEYS.boss.ulta)
      .setDisplaySize(588, 588)
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(501);

    const abilityText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 120, abilityName, {
        fontSize: "32px",
        fontFamily: "Arial, sans-serif",
        color: "#ff4444",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(501);

    return { overlay, fullscreenBoss, abilityText };
  }

  private showAbilityCutscene(
    overlay: Phaser.GameObjects.Rectangle,
    fullscreenBoss: Phaser.GameObjects.Image,
    abilityText: Phaser.GameObjects.Text
  ): Promise<void> {
    this.sfx(ASSET_KEYS.sfx.abilityAnnounce);
    return new Promise<void>((resolve) => {
      this.tweens.add({
        targets: overlay,
        alpha: 0.7,
        duration: ANIMATION_DURATIONS.abilityOverlay,
        ease: ANIMATION_EASING.ability,
      });
      this.tweens.add({
        targets: [fullscreenBoss, abilityText],
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
    fullscreenBoss: Phaser.GameObjects.Image,
    abilityText: Phaser.GameObjects.Text
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      this.tweens.add({
        targets: [overlay, fullscreenBoss, abilityText],
        alpha: 0,
        duration: ANIMATION_DURATIONS.abilityFadeOut,
        ease: ANIMATION_EASING.fade,
        onComplete: () => {
          if (overlay.scene) overlay.destroy();
          if (fullscreenBoss.scene) fullscreenBoss.destroy();
          if (abilityText.scene) abilityText.destroy();
          resolve();
        },
      });
    });
  }

  private showBossShieldOverlay() {
    this.hideBossShieldOverlay(true);
    if (!this.bossImage) return;

    const img = this.add.image(this.bossImage.x, this.bossImage.y, ASSET_KEYS.boss.shield);
    const targetHeight = this.bossImage.displayHeight * 0.4;
    const scale = targetHeight / img.height;
    img.setScale(scale);
    img.setDepth(0.4);
    img.setAlpha(0);
    this.bossShieldOverlay = img;

    // Add white glow effect (same as hint tiles)
    const glow = img.preFX?.addGlow(HINT_ANIMATION.glowColor, 0);

    // Fade in
    this.tweens.add({
      targets: img,
      alpha: 1,
      duration: 300,
      ease: "Quad.easeOut",
    });

    // Pulse glow
    if (glow) {
      this.bossShieldGlowTween = this.tweens.add({
        targets: glow,
        outerStrength: HINT_ANIMATION.glowMaxStrength,
        duration: HINT_ANIMATION.glowPulseDuration,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
  }

  private hideBossShieldOverlay(immediate = false) {
    if (this.bossShieldGlowTween) {
      this.bossShieldGlowTween.stop();
      this.bossShieldGlowTween = undefined;
    }
    if (!this.bossShieldOverlay) return;

    this.bossShieldOverlay.preFX?.clear();

    if (immediate) {
      this.bossShieldOverlay.destroy();
      this.bossShieldOverlay = undefined;
      return;
    }

    const img = this.bossShieldOverlay;
    this.bossShieldOverlay = undefined;
    this.tweens.add({
      targets: img,
      alpha: 0,
      duration: 400,
      ease: "Quad.easeIn",
      onComplete: () => img.destroy(),
    });
  }

  private flashPlayerAvatar() {
    if (!this.playerAvatar) return;

    this.playerAvatar.setFillStyle(0xffffff, 1);
    this.time.delayedCall(ANIMATION_DURATIONS.flashDuration, () => {
      this.playerAvatar?.setFillStyle(UI_COLORS.playerHp, 0.8);
    });
  }

  private showDefeat() {
    if (this.gameOver) return;
    this.stopHintTimer();
    this.gameOver = true;
    this.busy = true;
    this.sfx(ASSET_KEYS.sfx.defeat);
    this.showGameEndModal("Defeat", "#ff6666", "Retry");
  }

  private showGameEndModal(message: string, textColor: string, buttonText: string) {
    const overlay = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7)
      .setOrigin(0, 0)
      .setDepth(999);

    const text = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40, message, {
        fontSize: "36px",
        color: textColor,
        fontFamily: "Arial, sans-serif",
      })
      .setOrigin(0.5)
      .setDepth(999);

    const btn = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 20, buttonText, {
        fontSize: "20px",
        backgroundColor: "#2d5bff",
        padding: { x: 16, y: 8 },
        color: "#ffffff",
        fontFamily: "Arial, sans-serif",
      })
      .setOrigin(0.5)
      .setDepth(999)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => {
        this.scene.stop("GameScene");
        this.scene.start("IntroScene");
      });

    this.add.container(0, 0, [overlay, text, btn]).setDepth(999);
  }
}
