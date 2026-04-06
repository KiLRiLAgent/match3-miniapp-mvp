/**
 * EventBus — typed pub/sub for cross-scene v2 communication.
 *
 * Use this instead of chaining scene references when a child scene needs to
 * notify an ancestor (e.g., CombatBridgeScene → DialogueScene after battle).
 *
 * Event types are declared in the `V2Events` interface below — extend it as
 * new events appear. All handlers are strongly typed.
 */

export interface V2Events {
  // Phase 0 — no events yet. Examples for future phases:
  // "combat:complete": { encounterId: string; victory: boolean };
  // "dialogue:choice": { dialogueId: string; choiceId: string };
  // "inventory:changed": { slot: "weapon" | "armor" | "accessory" };
  // "relationship:changed": { characterId: string };
  // Placeholder so the type is non-empty until first real event is added:
  "v2:ready": void;
}

type EventName = keyof V2Events;
type Handler<E extends EventName> = V2Events[E] extends void
  ? () => void
  : (payload: V2Events[E]) => void;

class EventBus {
  private handlers: Map<EventName, Set<Handler<EventName>>> = new Map();

  on<E extends EventName>(event: E, handler: Handler<E>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as Handler<EventName>);
    return () => this.off(event, handler);
  }

  off<E extends EventName>(event: E, handler: Handler<E>): void {
    const set = this.handlers.get(event);
    if (!set) return;
    set.delete(handler as Handler<EventName>);
  }

  emit<E extends EventName>(
    event: E,
    ...args: V2Events[E] extends void ? [] : [V2Events[E]]
  ): void {
    const set = this.handlers.get(event);
    if (!set) return;
    const payload = args[0];
    for (const handler of set) {
      try {
        (handler as (p?: unknown) => void)(payload);
      } catch (err) {
        console.error(`EventBus: handler for "${event}" threw`, err);
      }
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}

export const eventBus = new EventBus();
