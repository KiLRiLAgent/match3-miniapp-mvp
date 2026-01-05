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
  private cooldown: number;

  constructor(config: BossAbilityConfig) {
    this.name = config.name;
    this.maxCooldown = config.maxCooldown;
    this.damage = config.damage;
    this.cooldown = config.maxCooldown;
  }

  get currentCooldown(): number {
    return this.cooldown;
  }

  get isReady(): boolean {
    return this.cooldown <= 0;
  }

  tick(): boolean {
    if (this.cooldown > 0) this.cooldown--;
    return this.isReady;
  }

  reset(): void {
    this.cooldown = this.maxCooldown;
  }

  static createPowerStrike(): BossAbility {
    return new BossAbility({
      name: "Мощный удар",
      maxCooldown: BOSS_ABILITY_COOLDOWN,
      damage: BOSS_PHYS_ATTACK * BOSS_ABILITY_MULTIPLIER,
    });
  }
}
