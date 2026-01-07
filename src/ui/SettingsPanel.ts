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
  private rows: Array<{
    label: Phaser.GameObjects.Text;
    value: Phaser.GameObjects.Text;
    minus: Phaser.GameObjects.Text;
    plus: Phaser.GameObjects.Text;
    param: ParamRow;
  }> = [];
  private onClose: () => void;

  constructor(scene: Phaser.Scene, onClose: () => void) {
    super(scene, 0, 0);
    this.onClose = onClose;

    // Панель (определяем размеры сначала для проверки в overlay)
    const panelWidth = GAME_WIDTH - 40;
    const panelHeight = GAME_HEIGHT - 100 - SAFE_AREA.top - SAFE_AREA.bottom;
    const panelX = 20;
    const panelY = 50 + SAFE_AREA.top;

    // Затемнённый фон - закрывает только при клике ВНЕ панели
    this.overlay = scene.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.8)
      .setOrigin(0)
      .setInteractive()
      .on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        // Закрываем только если клик вне панели
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
      .text(GAME_WIDTH / 2, panelY + 20, "⚙️ Настройки", {
        fontSize: "20px",
        color: "#ffffff",
        fontFamily: "Arial, sans-serif",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    // Кнопка закрыть
    const closeBtn = scene.add
      .text(panelX + panelWidth - 15, panelY + 10, "✕", {
        fontSize: "24px",
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
      { label: "HP игрока", getValue: () => GAME_PARAMS.player.hpMax, setValue: (v) => GAME_PARAMS.player.hpMax = v, min: 50, max: 1000, step: 10 },
      { label: "MP игрока", getValue: () => GAME_PARAMS.player.manaMax, setValue: (v) => GAME_PARAMS.player.manaMax = v, min: 50, max: 500, step: 10 },
      { label: "Физ. атака", getValue: () => GAME_PARAMS.player.physAttack, setValue: (v) => GAME_PARAMS.player.physAttack = v, min: 1, max: 50, step: 1 },
      { label: "Маг. атака", getValue: () => GAME_PARAMS.player.magAttack, setValue: (v) => GAME_PARAMS.player.magAttack = v, min: 1, max: 50, step: 1 },
      // Босс
      { label: "HP босса", getValue: () => GAME_PARAMS.boss.hpMax, setValue: (v) => GAME_PARAMS.boss.hpMax = v, min: 100, max: 2000, step: 50 },
      { label: "Атака босса", getValue: () => GAME_PARAMS.boss.physAttack, setValue: (v) => GAME_PARAMS.boss.physAttack = v, min: 1, max: 50, step: 1 },
      // Тайлы
      { label: "HP за тайл", getValue: () => GAME_PARAMS.tiles.hpPerTile, setValue: (v) => GAME_PARAMS.tiles.hpPerTile = v, min: 1, max: 50, step: 1 },
      { label: "MP за тайл", getValue: () => GAME_PARAMS.tiles.mpPerTile, setValue: (v) => GAME_PARAMS.tiles.mpPerTile = v, min: 1, max: 50, step: 1 },
      { label: "Урон меча", getValue: () => GAME_PARAMS.tiles.swordDamage, setValue: (v) => GAME_PARAMS.tiles.swordDamage = v, min: 1, max: 50, step: 1 },
      { label: "Урон звезды", getValue: () => GAME_PARAMS.tiles.starDamage, setValue: (v) => GAME_PARAMS.tiles.starDamage = v, min: 1, max: 50, step: 1 },
    ];

    // Добавляем параметры скиллов
    const skillIds: SkillId[] = ["powerStrike", "stun", "heal", "hammer"];
    skillIds.forEach((id) => {
      const cfg = SKILL_CONFIG[id];
      params.push({
        label: `${cfg.icon} стоимость`,
        getValue: () => cfg.cost,
        setValue: (v) => (cfg as { cost: number }).cost = v,
        min: 0,
        max: 200,
        step: 5,
      });
    });

    // Создаём строки
    const rowHeight = 32;
    const startY = panelY + 55;

    params.forEach((param, idx) => {
      const y = startY + idx * rowHeight;

      const label = scene.add
        .text(panelX + 15, y, param.label, {
          fontSize: "14px",
          color: "#cccccc",
          fontFamily: "Arial, sans-serif",
        })
        .setOrigin(0, 0.5);

      const minus = scene.add
        .text(panelX + panelWidth - 100, y, "−", {
          fontSize: "20px",
          color: "#ff8888",
          fontFamily: "Arial, sans-serif",
          fontStyle: "bold",
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => this.adjustParam(param, -1));

      const value = scene.add
        .text(panelX + panelWidth - 60, y, param.getValue().toString(), {
          fontSize: "14px",
          color: "#ffffff",
          fontFamily: "Arial, sans-serif",
          fontStyle: "bold",
        })
        .setOrigin(0.5);

      const plus = scene.add
        .text(panelX + panelWidth - 20, y, "+", {
          fontSize: "20px",
          color: "#88ff88",
          fontFamily: "Arial, sans-serif",
          fontStyle: "bold",
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => this.adjustParam(param, 1));

      this.rows.push({ label, value, minus, plus, param });
      this.add([label, minus, value, plus]);
    });

    // Кнопка "Применить и перезапустить"
    const applyBtn = scene.add
      .text(GAME_WIDTH / 2, panelY + panelHeight - 30, "💾 Применить и перезапустить", {
        fontSize: "16px",
        color: "#88ff88",
        fontFamily: "Arial, sans-serif",
        fontStyle: "bold",
        backgroundColor: "#2a3a2e",
        padding: { x: 15, y: 8 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.applyAndRestart());

    this.add(applyBtn);
    scene.add.existing(this);
    this.setDepth(100);
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
