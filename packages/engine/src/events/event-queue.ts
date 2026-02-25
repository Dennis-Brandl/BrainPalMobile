// Serial async event queue -- CRITICAL for preventing race conditions.
// Source: Research Pattern 1, PITFALLS.md Pitfall 5
//
// All engine events (step completions, state changes, resource operations)
// are processed through this FIFO queue one at a time. This prevents
// parallel branch completions from seeing stale state.

import type { EngineEvent } from '../types/events';

interface QueueItem {
  event: EngineEvent;
  resolve: () => void;
  reject: (err: Error) => void;
}

/**
 * Serial async FIFO queue for engine events.
 *
 * When a step completes, the completion event is enqueued. The queue
 * processes events one at a time, fully awaiting the handler (including
 * all SQLite writes and state updates) before dequeuing the next event.
 *
 * Error in handler rejects the enqueue promise but does not stop queue
 * processing -- subsequent events continue to be processed.
 */
export class EngineEventQueue {
  private processing = false;
  private queue: QueueItem[] = [];

  constructor(private handler: (event: EngineEvent) => Promise<void>) {}

  /**
   * Enqueue an event for serial processing.
   * Returns a Promise that resolves when the handler completes for this event,
   * or rejects if the handler throws.
   */
  enqueue(event: EngineEvent): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.queue.push({ event, resolve, reject });
      this.processNext();
    });
  }

  /**
   * Process the next event in the queue.
   * If already processing, returns immediately (the current processing loop
   * will pick up the new event).
   */
  private async processNext(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const { event, resolve, reject } = this.queue.shift()!;
      try {
        await this.handler(event);
        resolve();
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    }

    this.processing = false;
  }

  /**
   * Returns the number of events currently waiting in the queue.
   */
  get pending(): number {
    return this.queue.length;
  }
}
