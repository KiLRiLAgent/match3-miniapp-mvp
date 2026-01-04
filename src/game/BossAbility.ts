import {
  BOSS_PHYS_ATTACK,
  BOSS_ABILITY_COOLDOWN,
  BOSS_ABILITY_MULTIPLIER,
} from "./config";

export interface BossAbilityConfig {
  name: string;
  maxCooldown: number;
  damage: number;
}

export class BossAbility {
  readonly name: string;
  readonly maxCooldown: number;
  readonly damage: number;
  private _currentCooldown: number;

  constructor(config: BossAbilityConfig) {
    this.name = config.name;
    this.maxCooldown = config.maxCooldown;
    this.damage = config.damage;
    this._currentCooldown = config.maxCooldown;
  }

  get currentCooldown(): number {
    return this._currentCooldown;
  }

  get isReady(): boolean {
    return this._currentCooldown <= 0;
  }

  /**
   * Уменьшает кулдаун на 1. Вызывается после каждого хода игрока.
   * @returns true если способность готова к активации
   */
  tick(): boolean {
    if (this._currentCooldown > 0) {
      this._currentCooldown--;
    }
    return this.isReady;
  }

  /**
   * Сбрасывает кулдаун после использования способности.
   */
  reset(): void {
    this._currentCooldown = this.maxCooldown;
  }

  /**
   * Создаёт способность "Мощный удар" с параметрами из конфига.
   */
  static createPowerStrike(): BossAbility {
    return new BossAbility({
      name: "Мощный удар",
      maxCooldown: BOSS_ABILITY_COOLDOWN,
      damage: BOSS_PHYS_ATTACK * BOSS_ABILITY_MULTIPLIER,
    });
  }
}
