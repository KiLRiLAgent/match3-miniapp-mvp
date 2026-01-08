import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT, GAME_PARAMS, SKILL_CONFIG, saveGameParams, SAFE_AREA } from "../game/config";
import type { SkillId } from "../game/config";

type ParamRow = {
  label: string;
  getValue: () => number;
  setValue: (v: number) => void;
  min: number;
  max: number;
  step: number;
};

export class SettingsPanel extends Phaser.GameObjects.Container {
  private overlay: Phaser.GameObjects.Rectangle;
  private panel: Phaser.GameObjects.Rectangle;
  private scrollContainer: Phaser.GameObjects.Container;
  private scrollMask: Phaser.GameObjects.Graphics;
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
  private isDragging = false;
  private dragStartY = 0;
  private scrollStartY = 0;

  constructor(scene: Phaser.Scene, onClose: () => void) {
    super(scene, 0, 0);
    this.onClose = onClose;

    // Панель на весь экран с небольшими отступами
    const panelWidth = GAME_WIDTH - 24;
    const panelHeight = GAME_HEIGHT - 60 - SAFE_AREA.top - SAFE_AREA.bottom;
    const panelX = 12;
    const panelY = 30 + SAFE_AREA.top;

    // Затемнённый фон
    this.overlay = scene.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.85)
      .setOrigin(0)
      .setInteractive()
      .on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        const inPanel = pointer.x >= panelX && pointer.x <= panelX + panelWidth &&
                        pointer.y >= panelY && pointer.y <= panelY + panelHeight;
        if (!inPanel) {
          this.close();
        }
      });

    this.panel = scene.add
      .rectangle(panelX, panelY, panelWidth, panelHeight, 0x1a1a2e, 0.98)
      .setOrigin(0)
      .setStrokeStyle(2, 0x4a4a6e);

    // Заголовок
    const title = scene.add
      .text(GAME_WIDTH / 2, panelY + 25, "⚙️ Настройки", {
        fontSize: "24px",
        color: "#ffffff",
        fontFamily: "Arial, sans-serif",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    // Кнопка закрыть
    const closeBtn = scene.add
      .text(panelX + panelWidth - 20, panelY + 15, "✕", {
        fontSize: "28px",
        color: "#ff6666",
        fontFamily: "Arial, sans-serif",
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.close());

    this.add([this.overlay, this.panel, title, closeBtn]);

    // Параметры для редактирования
    const params: ParamRow[] = [
      // Игрок
      { label: "❤️ HP игрока", getValue: () => GAME_PARAMS.player.hpMax, setValue: (v) => GAME_PARAMS.player.hpMax = v, min: 50, max: 1000, step: 10 },
      { label: "💧 MP игрока", getValue: () => GAME_PARAMS.player.manaMax, setValue: (v) => GAME_PARAMS.player.manaMax = v, min: 50, max: 500, step: 10 },
      { label: "⚔️ Физ. атака", getValue: () => GAME_PARAMS.player.physAttack, setValue: (v) => GAME_PARAMS.player.physAttack = v, min: 1, max: 50, step: 1 },
      { label: "✨ Маг. атака", getValue: () => GAME_PARAMS.player.magAttack, setValue: (v) => GAME_PARAMS.player.magAttack = v, min: 1, max: 50, step: 1 },
      // Босс
      { label: "👿 HP босса", getValue: () => GAME_PARAMS.boss.hpMax, setValue: (v) => GAME_PARAMS.boss.hpMax = v, min: 100, max: 2000, step: 50 },
      { label: "👊 Атака босса", getValue: () => GAME_PARAMS.boss.physAttack, setValue: (v) => GAME_PARAMS.boss.physAttack = v, min: 1, max: 50, step: 1 },
      // Тайлы
      { label: "💚 HP за тайл", getValue: () => GAME_PARAMS.tiles.hpPerTile, setValue: (v) => GAME_PARAMS.tiles.hpPerTile = v, min: 1, max: 50, step: 1 },
      { label: "💙 MP за тайл", getValue: () => GAME_PARAMS.tiles.mpPerTile, setValue: (v) => GAME_PARAMS.tiles.mpPerTile = v, min: 1, max: 50, step: 1 },
      { label: "🗡️ Урон меча", getValue: () => GAME_PARAMS.tiles.swordDamage, setValue: (v) => GAME_PARAMS.tiles.swordDamage = v, min: 1, max: 50, step: 1 },
      { label: "⭐ Урон звезды", getValue: () => GAME_PARAMS.tiles.starDamage, setValue: (v) => GAME_PARAMS.tiles.starDamage = v, min: 1, max: 50, step: 1 },
      // Скиллы босса
      { label: "🔴 Урон атаки", getValue: () => GAME_PARAMS.bossAbilities.attackDamage, setValue: (v) => GAME_PARAMS.bossAbilities.attackDamage = v, min: 10, max: 200, step: 10 },
      { label: "💣 Кол-во бомб", getValue: () => GAME_PARAMS.bossAbilities.bombCount, setValue: (v) => GAME_PARAMS.bossAbilities.bombCount = v, min: 1, max: 10, step: 1 },
      { label: "⏱️ Таймер бомб", getValue: () => GAME_PARAMS.bossAbilities.bombCooldown, setValue: (v) => GAME_PARAMS.bossAbilities.bombCooldown = v, min: 1, max: 10, step: 1 },
      { label: "💥 Урон бомбы", getValue: () => GAME_PARAMS.bossAbilities.bombDamage, setValue: (v) => GAME_PARAMS.bossAbilities.bombDamage = v, min: 10, max: 200, step: 10 },
      { label: "🛡️ Длит. щита", getValue: () => GAME_PARAMS.bossAbilities.shieldDuration, setValue: (v) => GAME_PARAMS.bossAbilities.shieldDuration = v, min: 1, max: 10, step: 1 },
      { label: "⚡ Мощн. удар", getValue: () => GAME_PARAMS.bossAbilities.powerStrikeDamage, setValue: (v) => GAME_PARAMS.bossAbilities.powerStrikeDamage = v, min: 50, max: 500, step: 25 },
      { label: "🌀 Слив маны", getValue: () => GAME_PARAMS.bossAbilities.powerStrikeManaDrain, setValue: (v) => GAME_PARAMS.bossAbilities.powerStrikeManaDrain = v, min: 0, max: 100, step: 10 },
    ];

    // Добавляем параметры скиллов
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
    const scrollAreaTop = panelY + headerHeight;
    const scrollAreaHeight = panelHeight - headerHeight - footerHeight;

    // Создаём маску для скролла
    this.scrollMask = scene.add.graphics();
    this.scrollMask.fillStyle(0xffffff);
    this.scrollMask.fillRect(panelX, scrollAreaTop, panelWidth, scrollAreaHeight);

    // Контейнер для скроллируемого контента
    this.scrollContainer = scene.add.container(0, 0);
    this.scrollContainer.setMask(new Phaser.Display.Masks.GeometryMask(scene, this.scrollMask));

    // Создаём строки с увеличенными размерами
    const rowHeight = 44;
    const buttonSize = 36;
    const startY = scrollAreaTop + 10;

    params.forEach((param, idx) => {
      const y = startY + idx * rowHeight;

      const label = scene.add
        .text(panelX + 15, y, param.label, {
          fontSize: "16px",
          color: "#ffffff",
          fontFamily: "Arial, sans-serif",
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
          fontFamily: "Arial, sans-serif",
          fontStyle: "bold",
        })
        .setOrigin(0.5);

      const value = scene.add
        .text(panelX + panelWidth - 65, y, param.getValue().toString(), {
          fontSize: "16px",
          color: "#ffffff",
          fontFamily: "Arial, sans-serif",
          fontStyle: "bold",
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
          fontFamily: "Arial, sans-serif",
          fontStyle: "bold",
        })
        .setOrigin(0.5);

      this.rows.push({ label, value, minus, minusBg, plus, plusBg, param });
      this.scrollContainer.add([label, minusBg, minus, value, plusBg, plus]);
    });

    // Вычисляем максимальный скролл
    const contentHeight = params.length * rowHeight + 20;
    this.maxScrollY = Math.max(0, contentHeight - scrollAreaHeight);

    this.add(this.scrollContainer);

    // Обработка скролла через drag
    const scrollZone = scene.add
      .rectangle(panelX, scrollAreaTop, panelWidth, scrollAreaHeight, 0x000000, 0)
      .setOrigin(0)
      .setInteractive({ draggable: true });

    scrollZone.on("dragstart", (_pointer: Phaser.Input.Pointer) => {
      this.isDragging = true;
      this.dragStartY = _pointer.y;
      this.scrollStartY = this.scrollY;
    });

    scrollZone.on("drag", (_pointer: Phaser.Input.Pointer) => {
      if (this.isDragging) {
        const deltaY = _pointer.y - this.dragStartY;
        this.scrollY = Phaser.Math.Clamp(this.scrollStartY - deltaY, 0, this.maxScrollY);
        this.updateScrollPosition();
      }
    });

    scrollZone.on("dragend", () => {
      this.isDragging = false;
    });

    // Колесо мыши для десктопа
    scene.input.on("wheel", (_pointer: Phaser.Input.Pointer, _gameObjects: Phaser.GameObjects.GameObject[], _deltaX: number, deltaY: number) => {
      if (this.visible) {
        this.scrollY = Phaser.Math.Clamp(this.scrollY + deltaY * 0.5, 0, this.maxScrollY);
        this.updateScrollPosition();
      }
    });

    this.add(scrollZone);

    // Индикатор скролла (полоса справа)
    if (this.maxScrollY > 0) {
      const scrollbarHeight = (scrollAreaHeight / contentHeight) * scrollAreaHeight;
      const scrollbar = scene.add
        .rectangle(panelX + panelWidth - 4, scrollAreaTop, 3, scrollbarHeight, 0x666666, 0.5)
        .setOrigin(0.5, 0);
      this.add(scrollbar);

      // Обновление позиции скроллбара
      scene.events.on("update", () => {
        if (this.active) {
          const scrollProgress = this.scrollY / this.maxScrollY;
          scrollbar.y = scrollAreaTop + scrollProgress * (scrollAreaHeight - scrollbarHeight);
        }
      });
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
        fontFamily: "Arial, sans-serif",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    this.add([applyBtnBg, applyBtn]);
    scene.add.existing(this);
    this.setDepth(100);
  }

  private updateScrollPosition() {
    this.scrollContainer.y = -this.scrollY;
  }

  private adjustParam(param: ParamRow, direction: number) {
    const current = param.getValue();
    const newVal = Phaser.Math.Clamp(current + param.step * direction, param.min, param.max);
    param.setValue(newVal);
    this.updateValues();
  }

  private updateValues() {
    this.rows.forEach((row) => {
      row.value.setText(row.param.getValue().toString());
    });
  }

  private applyAndRestart() {
    saveGameParams();
    this.scene.scene.restart();
  }

  private close() {
    this.destroy();
    this.onClose();
  }
}
