import {
  BOSS_ABILITIES,
  BOSS_ABILITY_PATTERN,
  type BossAbilityType,
} from "./config";

export interface BossAbilityState {
  type: BossAbilityType;
  name: string;
  currentCooldown: number;
  maxCooldown: number;
  isReady: boolean;
}

export class BossAbilityManager {
  private patternIndex = 0;
  private currentCooldown: number;

  constructor() {
    this.currentCooldown = this.getCurrentAbilityCooldown();
  }

  get currentType(): BossAbilityType {
    return BOSS_ABILITY_PATTERN[this.patternIndex];
  }

  get currentAbility() {
    return BOSS_ABILITIES[this.currentType];
  }

  private getCurrentAbilityCooldown(): number {
    return this.currentAbility.cooldown;
  }

  get state(): BossAbilityState {
    return {
      type: this.currentType,
      name: this.currentAbility.name,
      currentCooldown: this.currentCooldown,
      maxCooldown: this.currentAbility.cooldown,
      isReady: this.currentCooldown <= 0,
    };
  }

  tick(): boolean {
    if (this.currentCooldown > 0) {
      this.currentCooldown--;
    }
    return this.currentCooldown <= 0;
  }

  // Добавить ходы к текущему кулдауну (для стана игрока)
  addCooldown(turns: number): void {
    this.currentCooldown += turns;
  }

  getCurrentCooldown(): number {
    return this.currentCooldown;
  }

  advance(): void {
    this.patternIndex = (this.patternIndex + 1) % BOSS_ABILITY_PATTERN.length;
    this.currentCooldown = this.getCurrentAbilityCooldown();
  }

  reset(): void {
    this.patternIndex = 0;
    this.currentCooldown = this.getCurrentAbilityCooldown();
  }
}
