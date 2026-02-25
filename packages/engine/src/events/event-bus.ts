// Typed event bus -- the engine's output channel for state changes and notifications.
// Source: Research Pattern 4, ExecutionEngineSpec.md Section 9
// Zero external dependencies. Uses Map<string, Set<Function>> internally.

import type { EngineEventMap } from '../types/events';

/**
 * A lightweight typed EventEmitter for engine-to-external communication.
 * All event subscriptions are strongly typed via EngineEventMap.
 */
export class EngineEventBus {
  private handlers = new Map<string, Set<Function>>();

  /**
   * Subscribe to a typed engine event.
   * @returns An unsubscribe function.
   */
  on<K extends keyof EngineEventMap>(
    event: K,
    handler: (data: EngineEventMap[K]) => void,
  ): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
    return () => {
      this.handlers.get(event)?.delete(handler);
    };
  }

  /**
   * Emit a typed engine event to all subscribers.
   */
  emit<K extends keyof EngineEventMap>(event: K, data: EngineEventMap[K]): void {
    this.handlers.get(event)?.forEach((fn) => fn(data));
  }

  /**
   * Remove all event listeners.
   */
  removeAllListeners(): void {
    this.handlers.clear();
  }
}
