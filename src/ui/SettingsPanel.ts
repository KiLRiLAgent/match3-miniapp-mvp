import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT, GAME_PARAMS, SKILL_CONFIG, saveGameParams, SAFE_AREA, ABILITY_NAMES } from "../game/config";
import type { SkillId } from "../game/config";

type ParamRow = {
  label: string;
  getValue: () => number;
  setValue: (v: number) => void;
  min: number;
  max: number;
  step: number;
  isPattern?: boolean; // Для отображения названия способности вместо числа
};

export class SettingsPanel extends Phaser.GameObjects.Container {
  private overlay: Phaser.GameObjects.Rectangle;
  private panel: Phaser.GameObjects.Rectangle;
  private scrollContainer: Phaser.GameObjects.Container;
  private scrollMask: Phaser.GameObjects.Graphics;
  private scrollbar: Phaser.GameObjects.Rectangle | null = null;
  private rows: Array<{
    label: Phaser.GameObjects.Text;
    value: Phaser.GameObjects.Text;
    minus: Phaser.GameObjects.Text;
    minusBg: Phaser.GameObjects.Rectangle;
    plus: Phaser.GameObjects.Text;
    plusBg: Phaser.GameObjects.Rectangle;
    param: ParamRow;
  }> = [];
  private onClose: () => void;
  private scrollY = 0;
  private maxScrollY = 0;
  private scrollAreaTop = 0;
  private scrollAreaHeight = 0;
  private scrollAreaLeft = 0;
  private scrollAreaRight = 0;
  private contentHeight = 0;

  // Для отслеживания скролла
  private dragStartY = 0;
  private scrollStartY = 0;
  private isDragging = false;
  private pointerDownHandler: ((pointer: Phaser.Input.Pointer) => void) | null = null;
  private pointerMoveHandler: ((pointer: Phaser.Input.Pointer) => void) | null = null;
  private pointerUpHandler: ((pointer: Phaser.Input.Pointer) => void) | null = null;
  private wheelHandler: ((pointer: Phaser.Input.Pointer, gameObjects: Phaser.GameObjects.GameObject[], deltaX: number, deltaY: number) => void) | null = null;

  constructor(scene: Phaser.Scene, onClose: () => void) {
    super(scene, 0, 0);
    this.onClose = onClose;

    // Панель на весь экран с небольшими отступами
    const panelWidth = GAME_WIDTH - 24;
    const panelHeight = GAME_HEIGHT - 60 - SAFE_AREA.top - SAFE_AREA.bottom;
    const panelX = 12;
    const panelY = 30 + SAFE_AREA.top;

    // Затемнённый фон — close only on short tap outside panel
    this.overlay = scene.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.85)
      .setOrigin(0)
      .setInteractive();

    this.panel = scene.add
      .rectangle(panelX, panelY, panelWidth, panelHeight, 0x1a1a2e, 0.98)
      .setOrigin(0)
      .setStrokeStyle(2, 0x4a4a6e);

    // Заголовок
    const title = scene.add
      .text(GAME_WIDTH / 2, panelY + 25, "⚙️ Настройки", {
        fontSize: "24px",
        color: "#ffffff",
        fontFamily: "'Exo 2', Arial, sans-serif",
        fontStyle: "bold",
        resolution: 2,
      })
      .setOrigin(0.5);

    // Кнопка закрыть
    const closeBtn = scene.add
      .text(panelX + panelWidth - 20, panelY + 15, "✕", {
        fontSize: "28px",
        color: "#ff6666",
        fontFamily: "'Exo 2', Arial, sans-serif",
        resolution: 2,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.close());

    this.add([this.overlay, this.panel, title, closeBtn]);

    // Параметры для редактирования
    const params: ParamRow[] = [
      // === ИГРОК ===
      { label: "❤️ HP игрока", getValue: () => GAME_PARAMS.player.hpMax, setValue: (v) => GAME_PARAMS.player.hpMax = v, min: 50, max: 1000, step: 10 },
      { label: "💧 MP игрока", getValue: () => GAME_PARAMS.player.manaMax, setValue: (v) => GAME_PARAMS.player.manaMax = v, min: 50, max: 500, step: 10 },
      { label: "⚔️ Физ. атака", getValue: () => GAME_PARAMS.player.physAttack, setValue: (v) => GAME_PARAMS.player.physAttack = v, min: 1, max: 50, step: 1 },
      { label: "✨ Маг. атака", getValue: () => GAME_PARAMS.player.magAttack, setValue: (v) => GAME_PARAMS.player.magAttack = v, min: 1, max: 50, step: 1 },

      // === БОСС ===
      { label: "👿 HP босса", getValue: () => GAME_PARAMS.boss.hpMax, setValue: (v) => { GAME_PARAMS.boss.hpMax = v; GAME_PARAMS.boss.hpPerLayer = Math.ceil(v / GAME_PARAMS.boss.layerCount); }, min: 100, max: 20000, step: 50 },
      { label: "🔢 Кол-во слоёв", getValue: () => GAME_PARAMS.boss.layerCount, setValue: (v) => { GAME_PARAMS.boss.layerCount = v; GAME_PARAMS.boss.hpPerLayer = Math.ceil(GAME_PARAMS.boss.hpMax / v); }, min: 1, max: 20, step: 1 },
      { label: "👊 Атака босса", getValue: () => GAME_PARAMS.boss.physAttack, setValue: (v) => GAME_PARAMS.boss.physAttack = v, min: 1, max: 50, step: 1 },

      // === ТАЙЛЫ ===
      { label: "💚 HP за тайл", getValue: () => GAME_PARAMS.tiles.hpPerTile, setValue: (v) => GAME_PARAMS.tiles.hpPerTile = v, min: 1, max: 50, step: 1 },
      { label: "💙 MP за тайл", getValue: () => GAME_PARAMS.tiles.mpPerTile, setValue: (v) => GAME_PARAMS.tiles.mpPerTile = v, min: 1, max: 50, step: 1 },
      { label: "🗡️ Урон меча", getValue: () => GAME_PARAMS.tiles.swordDamage, setValue: (v) => GAME_PARAMS.tiles.swordDamage = v, min: 1, max: 50, step: 1 },
      { label: "⭐ Урон звезды", getValue: () => GAME_PARAMS.tiles.starDamage, setValue: (v) => GAME_PARAMS.tiles.starDamage = v, min: 1, max: 50, step: 1 },

      // === СПОСОБНОСТИ БОССА ===
      { label: "🔴 Урон атаки", getValue: () => GAME_PARAMS.bossAbilities.attackDamage, setValue: (v) => GAME_PARAMS.bossAbilities.attackDamage = v, min: 10, max: 200, step: 10 },
      { label: "🔴 КД атаки", getValue: () => GAME_PARAMS.bossAbilities.attackCooldown, setValue: (v) => GAME_PARAMS.bossAbilities.attackCooldown = v, min: 1, max: 10, step: 1 },
      { label: "💣 Кол-во бомб", getValue: () => GAME_PARAMS.bossAbilities.bombCount, setValue: (v) => GAME_PARAMS.bossAbilities.bombCount = v, min: 1, max: 10, step: 1 },
      { label: "💣 Таймер бомб", getValue: () => GAME_PARAMS.bossAbilities.bombCooldown, setValue: (v) => GAME_PARAMS.bossAbilities.bombCooldown = v, min: 1, max: 10, step: 1 },
      { label: "💣 Урон бомбы", getValue: () => GAME_PARAMS.bossAbilities.bombDamage, setValue: (v) => GAME_PARAMS.bossAbilities.bombDamage = v, min: 10, max: 200, step: 10 },
      { label: "💣 КД бомб", getValue: () => GAME_PARAMS.bossAbilities.bombsAbilityCooldown, setValue: (v) => GAME_PARAMS.bossAbilities.bombsAbilityCooldown = v, min: 1, max: 10, step: 1 },
      { label: "🛡️ Длит. щита", getValue: () => GAME_PARAMS.bossAbilities.shieldDuration, setValue: (v) => GAME_PARAMS.bossAbilities.shieldDuration = v, min: 1, max: 10, step: 1 },
      { label: "🛡️ КД щита", getValue: () => GAME_PARAMS.bossAbilities.shieldCooldown, setValue: (v) => GAME_PARAMS.bossAbilities.shieldCooldown = v, min: 1, max: 10, step: 1 },
      { label: "⚡ Мощн. удар", getValue: () => GAME_PARAMS.bossAbilities.powerStrikeDamage, setValue: (v) => GAME_PARAMS.bossAbilities.powerStrikeDamage = v, min: 50, max: 500, step: 25 },
      { label: "⚡ КД удара", getValue: () => GAME_PARAMS.bossAbilities.powerStrikeCooldown, setValue: (v) => GAME_PARAMS.bossAbilities.powerStrikeCooldown = v, min: 1, max: 10, step: 1 },
      { label: "🌀 Слив маны", getValue: () => GAME_PARAMS.bossAbilities.powerStrikeManaDrain, setValue: (v) => GAME_PARAMS.bossAbilities.powerStrikeManaDrain = v, min: 0, max: 100, step: 10 },

      // === ПАТТЕРН БОССА (1=Атака, 2=Бомбы, 3=Щит, 4=Удар) ===
      { label: "📋 Слот 1", getValue: () => GAME_PARAMS.bossPattern[0], setValue: (v) => GAME_PARAMS.bossPattern[0] = v, min: 1, max: 4, step: 1, isPattern: true },
      { label: "📋 Слот 2", getValue: () => GAME_PARAMS.bossPattern[1], setValue: (v) => GAME_PARAMS.bossPattern[1] = v, min: 1, max: 4, step: 1, isPattern: true },
      { label: "📋 Слот 3", getValue: () => GAME_PARAMS.bossPattern[2], setValue: (v) => GAME_PARAMS.bossPattern[2] = v, min: 1, max: 4, step: 1, isPattern: true },
      { label: "📋 Слот 4", getValue: () => GAME_PARAMS.bossPattern[3], setValue: (v) => GAME_PARAMS.bossPattern[3] = v, min: 1, max: 4, step: 1, isPattern: true },
      { label: "📋 Слот 5", getValue: () => GAME_PARAMS.bossPattern[4], setValue: (v) => GAME_PARAMS.bossPattern[4] = v, min: 1, max: 4, step: 1, isPattern: true },
      { label: "📋 Слот 6", getValue: () => GAME_PARAMS.bossPattern[5], setValue: (v) => GAME_PARAMS.bossPattern[5] = v, min: 1, max: 4, step: 1, isPattern: true },
    ];

    // Добавляем параметры скиллов игрока
    const skillIds: SkillId[] = ["powerStrike", "stun", "heal", "hammer"];
    skillIds.forEach((id) => {
      const cfg = SKILL_CONFIG[id];
      params.push({
        label: `${cfg.icon} ${cfg.name}`,
        getValue: () => cfg.cost,
        setValue: (v) => (cfg as { cost: number }).cost = v,
        min: 0,
        max: 200,
        step: 5,
      });
    });

    // Размеры для скролла
    const headerHeight = 55;
    const footerHeight = 70;
    this.scrollAreaTop = panelY + headerHeight;
    this.scrollAreaHeight = panelHeight - headerHeight - footerHeight;
    this.scrollAreaLeft = panelX;
    this.scrollAreaRight = panelX + panelWidth;

    // Создаём маску для скролла
    this.scrollMask = scene.add.graphics();
    this.scrollMask.fillStyle(0xffffff);
    this.scrollMask.fillRect(panelX, this.scrollAreaTop, panelWidth, this.scrollAreaHeight);

    // Контейнер для скроллируемого контента
    this.scrollContainer = scene.add.container(0, 0);
    this.scrollContainer.setMask(new Phaser.Display.Masks.GeometryMask(scene, this.scrollMask));

    // Создаём строки с увеличенными размерами
    const rowHeight = 44;
    const buttonSize = 36;
    const startY = this.scrollAreaTop + 10;

    params.forEach((param, idx) => {
      const y = startY + idx * rowHeight;

      const label = scene.add
        .text(panelX + 15, y, param.label, {
          fontSize: "16px",
          color: "#ffffff",
          fontFamily: "'Exo 2', Arial, sans-serif",
          resolution: 2,
        })
        .setOrigin(0, 0.5);

      // Кнопка минус с фоном
      const minusBg = scene.add
        .rectangle(panelX + panelWidth - 115, y, buttonSize, buttonSize, 0x442222, 1)
        .setOrigin(0.5)
        .setStrokeStyle(1, 0x663333)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => this.adjustParam(param, -1))
        .on("pointerover", () => minusBg.setFillStyle(0x553333))
        .on("pointerout", () => minusBg.setFillStyle(0x442222));

      const minus = scene.add
        .text(panelX + panelWidth - 115, y, "−", {
          fontSize: "24px",
          color: "#ff8888",
          fontFamily: "'Exo 2', Arial, sans-serif",
          fontStyle: "bold",
          resolution: 2,
        })
        .setOrigin(0.5);

      // Для паттерна показываем название способности
      const displayValue = param.isPattern
        ? ABILITY_NAMES[param.getValue()] || param.getValue().toString()
        : param.getValue().toString();

      const value = scene.add
        .text(panelX + panelWidth - 65, y, displayValue, {
          fontSize: param.isPattern ? "12px" : "16px",
          color: "#ffffff",
          fontFamily: "'Exo 2', Arial, sans-serif",
          fontStyle: "bold",
          resolution: 2,
        })
        .setOrigin(0.5);

      // Кнопка плюс с фоном
      const plusBg = scene.add
        .rectangle(panelX + panelWidth - 20, y, buttonSize, buttonSize, 0x224422, 1)
        .setOrigin(0.5)
        .setStrokeStyle(1, 0x336633)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => this.adjustParam(param, 1))
        .on("pointerover", () => plusBg.setFillStyle(0x335533))
        .on("pointerout", () => plusBg.setFillStyle(0x224422));

      const plus = scene.add
        .text(panelX + panelWidth - 20, y, "+", {
          fontSize: "24px",
          color: "#88ff88",
          fontFamily: "'Exo 2', Arial, sans-serif",
          fontStyle: "bold",
          resolution: 2,
        })
        .setOrigin(0.5);

      this.rows.push({ label, value, minus, minusBg, plus, plusBg, param });
      this.scrollContainer.add([label, minusBg, minus, value, plusBg, plus]);
    });

    // Вычисляем максимальный скролл
    this.contentHeight = params.length * rowHeight + 20;
    this.maxScrollY = Math.max(0, this.contentHeight - this.scrollAreaHeight);

    this.add(this.scrollContainer);

    // Обработка скролла через scene input (не блокирует кнопки)
    this.setupScrollHandlers(scene);

    // Индикатор скролла (полоса справа)
    if (this.maxScrollY > 0) {
      const scrollbarHeight = (this.scrollAreaHeight / this.contentHeight) * this.scrollAreaHeight;
      this.scrollbar = scene.add
        .rectangle(panelX + panelWidth - 4, this.scrollAreaTop, 3, scrollbarHeight, 0x666666, 0.5)
        .setOrigin(0.5, 0);
      this.add(this.scrollbar);
    }

    // Кнопка "Применить и перезапустить"
    const applyBtnBg = scene.add
      .rectangle(GAME_WIDTH / 2, panelY + panelHeight - 35, panelWidth - 40, 50, 0x2a4a2e, 1)
      .setOrigin(0.5)
      .setStrokeStyle(2, 0x4a8a4e)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.applyAndRestart())
      .on("pointerover", () => applyBtnBg.setFillStyle(0x3a5a3e))
      .on("pointerout", () => applyBtnBg.setFillStyle(0x2a4a2e));

    const applyBtn = scene.add
      .text(GAME_WIDTH / 2, panelY + panelHeight - 35, "💾 Сохранить и перезапустить", {
        fontSize: "18px",
        color: "#88ff88",
        fontFamily: "'Exo 2', Arial, sans-serif",
        fontStyle: "bold",
        resolution: 2,
      })
      .setOrigin(0.5);

    this.add([applyBtnBg, applyBtn]);
    scene.add.existing(this);
    this.setDepth(100);
  }

  private setupScrollHandlers(scene: Phaser.Scene) {
    const panelX = this.scrollAreaLeft;
    const panelRight = this.scrollAreaRight;
    const panelTop = this.scrollAreaTop - 55;
    const panelBottom = this.scrollAreaTop + this.scrollAreaHeight + 70;
    let dragMoved = false;

    const isInPanel = (x: number, y: number) =>
      x >= panelX && x <= panelRight && y >= panelTop && y <= panelBottom;

    // Start drag anywhere on screen
    this.pointerDownHandler = (pointer: Phaser.Input.Pointer) => {
      if (!this.visible) return;
      this.isDragging = true;
      this.dragStartY = pointer.y;
      this.scrollStartY = this.scrollY;
      dragMoved = false;
    };

    // Scroll on drag
    this.pointerMoveHandler = (pointer: Phaser.Input.Pointer) => {
      if (!this.visible || !this.isDragging) return;
      const deltaY = pointer.y - this.dragStartY;
      if (Math.abs(deltaY) > 5) dragMoved = true;
      this.scrollY = Phaser.Math.Clamp(this.scrollStartY - deltaY, 0, this.maxScrollY);
      this.updateScrollPosition();
    };

    // On release: just stop dragging (close only via X button)
    this.pointerUpHandler = (_pointer: Phaser.Input.Pointer) => {
      this.isDragging = false;
      dragMoved = false;
    };

    // Mouse wheel
    this.wheelHandler = (_pointer: Phaser.Input.Pointer, _gameObjects: Phaser.GameObjects.GameObject[], _deltaX: number, deltaY: number) => {
      if (!this.visible) return;
      this.scrollY = Phaser.Math.Clamp(this.scrollY + deltaY * 0.5, 0, this.maxScrollY);
      this.updateScrollPosition();
    };

    scene.input.on("pointerdown", this.pointerDownHandler);
    scene.input.on("pointermove", this.pointerMoveHandler);
    scene.input.on("pointerup", this.pointerUpHandler);
    scene.input.on("wheel", this.wheelHandler);
  }

  private updateScrollPosition() {
    this.scrollContainer.y = -this.scrollY;

    // Обновляем позицию скроллбара
    if (this.scrollbar && this.maxScrollY > 0) {
      const scrollbarHeight = (this.scrollAreaHeight / this.contentHeight) * this.scrollAreaHeight;
      const scrollProgress = this.scrollY / this.maxScrollY;
      this.scrollbar.y = this.scrollAreaTop + scrollProgress * (this.scrollAreaHeight - scrollbarHeight);
    }
  }

  private adjustParam(param: ParamRow, direction: number) {
    const current = param.getValue();
    const newVal = Phaser.Math.Clamp(current + param.step * direction, param.min, param.max);
    param.setValue(newVal);
    this.updateValues();
  }

  private updateValues() {
    this.rows.forEach((row) => {
      const val = row.param.getValue();
      // Для паттерна показываем название способности
      if (row.param.isPattern) {
        row.value.setText(ABILITY_NAMES[val] || val.toString());
      } else {
        row.value.setText(val.toString());
      }
    });
  }

  private applyAndRestart() {
    saveGameParams();
    const sceneRef = this.scene;
    this.close();
    sceneRef.scene.stop("GameScene");
    sceneRef.scene.start("IntroScene");
  }

  private close() {
    // Удаляем обработчики скролла
    if (this.pointerDownHandler) {
      this.scene.input.off("pointerdown", this.pointerDownHandler);
    }
    if (this.pointerMoveHandler) {
      this.scene.input.off("pointermove", this.pointerMoveHandler);
    }
    if (this.pointerUpHandler) {
      this.scene.input.off("pointerup", this.pointerUpHandler);
    }
    if (this.wheelHandler) {
      this.scene.input.off("wheel", this.wheelHandler);
    }

    this.destroy();
    this.onClose();
  }
}
