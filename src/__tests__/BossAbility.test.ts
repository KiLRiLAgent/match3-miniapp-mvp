import { describe, it, expect, beforeEach } from "vitest";
import { BossAbilityManager } from "../game/BossAbility";

describe("BossAbilityManager", () => {
  let manager: BossAbilityManager;

  beforeEach(() => {
    manager = new BossAbilityManager();
  });

  describe("initialization", () => {
    it("should start at pattern index 0", () => {
      expect(manager.currentType).toBe("attack");
    });

    it("should have initial cooldown based on first ability", () => {
      const state = manager.state;
      expect(state.currentCooldown).toBe(state.maxCooldown);
    });

    it("should not be ready initially if cooldown > 0", () => {
      const state = manager.state;
      if (state.maxCooldown > 0) {
        expect(state.isReady).toBe(false);
      }
    });
  });

  describe("tick", () => {
    it("should decrement cooldown", () => {
      const initialCooldown = manager.state.currentCooldown;
      manager.tick();
      expect(manager.state.currentCooldown).toBe(initialCooldown - 1);
    });

    it("should return false while cooldown > 0", () => {
      const initialCooldown = manager.state.currentCooldown;
      if (initialCooldown > 1) {
        expect(manager.tick()).toBe(false);
      }
    });

    it("should return true when cooldown reaches 0", () => {
      // Tick until ready
      while (manager.state.currentCooldown > 0) {
        manager.tick();
      }
      // One more tick should still be ready (or already was)
      expect(manager.state.isReady).toBe(true);
    });

    it("should not go below 0", () => {
      // Tick many times
      for (let i = 0; i < 10; i++) {
        manager.tick();
      }
      expect(manager.state.currentCooldown).toBe(0);
    });
  });

  describe("advance", () => {
    it("should move to next ability in pattern", () => {
      expect(manager.currentType).toBe("attack"); // First type
      manager.advance();
      // Pattern is [attack, bombs, attack, shield, attack, powerStrike]
      // After first attack should be bombs
      expect(manager.currentType).toBe("bombs");
    });

    it("should reset cooldown to new ability cooldown", () => {
      manager.advance();
      const state = manager.state;
      expect(state.currentCooldown).toBe(state.maxCooldown);
    });

    it("should cycle through entire pattern", () => {
      const types: string[] = [];
      for (let i = 0; i < 6; i++) {
        types.push(manager.currentType);
        manager.advance();
      }

      // Should have gone through: attack, bombs, attack, shield, attack, powerStrike
      expect(types).toEqual([
        "attack",
        "bombs",
        "attack",
        "shield",
        "attack",
        "powerStrike",
      ]);
    });

    it("should wrap around pattern", () => {
      // Advance through entire pattern
      for (let i = 0; i < 6; i++) {
        manager.advance();
      }
      // Should be back to first ability
      expect(manager.currentType).toBe("attack");
    });
  });

  describe("addCooldown", () => {
    it("should add turns to current cooldown", () => {
      const initialCooldown = manager.getCurrentCooldown();
      manager.addCooldown(2);
      expect(manager.getCurrentCooldown()).toBe(initialCooldown + 2);
    });

    it("should work with zero cooldown", () => {
      // Tick until cooldown is 0
      while (manager.state.currentCooldown > 0) {
        manager.tick();
      }

      manager.addCooldown(3);
      expect(manager.getCurrentCooldown()).toBe(3);
    });
  });

  describe("getCurrentCooldown", () => {
    it("should return current cooldown value", () => {
      const fromState = manager.state.currentCooldown;
      const fromMethod = manager.getCurrentCooldown();
      expect(fromMethod).toBe(fromState);
    });
  });

  describe("reset", () => {
    it("should reset to pattern start", () => {
      // Advance several times
      manager.advance();
      manager.advance();
      manager.advance();

      manager.reset();

      expect(manager.currentType).toBe("attack");
    });

    it("should reset cooldown", () => {
      // Tick down cooldown
      manager.tick();
      manager.tick();

      manager.reset();

      const state = manager.state;
      expect(state.currentCooldown).toBe(state.maxCooldown);
    });
  });

  describe("state", () => {
    it("should return complete state object", () => {
      const state = manager.state;

      expect(state).toHaveProperty("type");
      expect(state).toHaveProperty("name");
      expect(state).toHaveProperty("currentCooldown");
      expect(state).toHaveProperty("maxCooldown");
      expect(state).toHaveProperty("isReady");
    });

    it("should have correct ability name", () => {
      const state = manager.state;
      expect(state.name).toBe("Атака"); // First ability is "attack"
    });

    it("should update isReady based on cooldown", () => {
      // Tick until ready
      while (manager.state.currentCooldown > 0) {
        expect(manager.state.isReady).toBe(false);
        manager.tick();
      }
      expect(manager.state.isReady).toBe(true);
    });
  });

  describe("currentAbility", () => {
    it("should return ability config for current type", () => {
      const ability = manager.currentAbility;
      expect(ability).toHaveProperty("name");
      expect(ability).toHaveProperty("cooldown");
    });

    it("should change when advancing", () => {
      const firstAbility = manager.currentAbility;
      manager.advance();
      const secondAbility = manager.currentAbility;

      // Abilities should be different (attack vs bombs)
      expect(firstAbility.name).not.toBe(secondAbility.name);
    });
  });

  describe("pattern cycling behavior", () => {
    it("should handle multiple full cycles", () => {
      const pattern = ["attack", "bombs", "attack", "shield", "attack", "powerStrike"];

      for (let cycle = 0; cycle < 3; cycle++) {
        for (let i = 0; i < pattern.length; i++) {
          expect(manager.currentType).toBe(pattern[i]);
          manager.advance();
        }
      }
    });
  });
});
