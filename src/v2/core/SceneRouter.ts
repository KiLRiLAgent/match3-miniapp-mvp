/**
 * SceneRouter — тонкий helper поверх Phaser `scene.start/launch/stop`.
 *
 * Не Scene, не синглтон Phaser. Обычный TS класс, используется как singleton
 * через экспортированный `sceneRouter`. Ведёт стек переходов, позволяет
 * открывать модальные сцены (Inventory поверх Dialogue) и возвращаться к ним.
 *
 * Phase 0: минимальная реализация — push/replace/clear. Модальная логика
 * (launch + pause/resume) добавляется в Phase 2 когда появятся модалки.
 */

import type Phaser from "phaser";

interface StackEntry {
  key: string;
  data?: object;
}

class SceneRouter {
  private stack: StackEntry[] = [];

  /**
   * Replace current scene with a new one (no pause — full transition).
   * Pushes the new entry onto the stack.
   */
  push(scene: Phaser.Scene, target: string, data?: object): void {
    this.stack.push({ key: target, data });
    scene.scene.start(target, data);
  }

  /**
   * Replace the current stack top without growing the history.
   * Use for "go to X" transitions where back-nav isn't meaningful.
   */
  replace(scene: Phaser.Scene, target: string, data?: object): void {
    if (this.stack.length > 0) {
      this.stack[this.stack.length - 1] = { key: target, data };
    } else {
      this.stack.push({ key: target, data });
    }
    scene.scene.start(target, data);
  }

  /**
   * Pop the current scene and return to the previous one.
   * No-op if stack has ≤ 1 entry (can't pop root).
   */
  pop(scene: Phaser.Scene): void {
    if (this.stack.length <= 1) return;
    this.stack.pop();
    const prev = this.stack[this.stack.length - 1];
    scene.scene.start(prev.key, prev.data);
  }

  /** Reset the navigation stack (used on New Game / mode switch). */
  clear(): void {
    this.stack = [];
  }

  /** Inspect current stack (debugging). */
  getStack(): ReadonlyArray<StackEntry> {
    return this.stack;
  }
}

export const sceneRouter = new SceneRouter();
