import {
  BOSS_ABILITIES,
  GAME_PARAMS,
  type BossAbilityType,
} from "./config";

export interface BossAbilityState {
  type: BossAbilityType;
  name: string;
  currentCooldown: number;
  maxCooldown: number;
  isReady: boolean;
}

/** Default pool: 3 attacks, 2 bombs, 1 shield, 1 powerStrike */
const DEFAULT_POOL: BossAbilityType[] = [
  "attack", "attack", "attack",
  "bombs", "bombs",
  "shield",
  "powerStrike",
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class BossAbilityManager {
  /** Remaining abilities in current pool (drawn from end) */
  private pool: BossAbilityType[] = [];
  /** Current ability (drawn from pool) */
  private _currentType: BossAbilityType = "attack";
  private currentCooldown: number;

  // v2: stored override pool — typed BossAbilityType[] (REFINEMENT 8: no number conversion)
  private patternOverride?: BossAbilityType[];

  constructor(patternOverride?: BossAbilityType[]) {
    this.patternOverride = patternOverride;
    this.refillPool();
    this.drawNext();
    this.currentCooldown = this.getCurrentAbilityCooldown();
  }

  /** Fill pool from override / config / default, then shuffle */
  private refillPool(): void {
    const configPool = this.getConfigPool();
    this.pool = shuffle(configPool);
  }

  /** Get pool definition from override, GAME_PARAMS.bossPattern, or default */
  private getConfigPool(): BossAbilityType[] {
    // v2: encounter override takes priority over GAME_PARAMS.bossPattern (REFINEMENT 8: typed strings, zero conversion)
    if (this.patternOverride && this.patternOverride.length > 0) {
      return [...this.patternOverride];
    }

    const ABILITY_MAP: Record<number, BossAbilityType> = {
      1: "attack",
      2: "bombs",
      3: "shield",
      4: "powerStrike",
    };

    // Use bossPattern from settings as pool definition
    if (GAME_PARAMS.bossPattern && GAME_PARAMS.bossPattern.length > 0) {
      return GAME_PARAMS.bossPattern.map(n => ABILITY_MAP[n] || "attack");
    }
    return [...DEFAULT_POOL];
  }

  /** Draw next ability from pool. Refill if empty. */
  private drawNext(): void {
    if (this.pool.length === 0) {
      this.refillPool();
    }
    this._currentType = this.pool.pop()!;
  }

  get currentType(): BossAbilityType {
    return this._currentType;
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

  addCooldown(turns: number): void {
    this.currentCooldown += turns;
  }

  getCurrentCooldown(): number {
    return this.currentCooldown;
  }

  advance(): void {
    this.drawNext();
    this.currentCooldown = this.getCurrentAbilityCooldown();
  }

  reset(): void {
    this.pool = [];
    this.refillPool();
    this.drawNext();
    this.currentCooldown = this.getCurrentAbilityCooldown();
  }
}
