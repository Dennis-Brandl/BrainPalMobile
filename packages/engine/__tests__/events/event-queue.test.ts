import { describe, it, expect, vi } from 'vitest';
import { EngineEventQueue } from '../../src/events/event-queue';
import type { EngineEvent } from '../../src/types/events';

function makeEvent(type: string, workflowInstanceId: string): EngineEvent {
  return { type: 'WORKFLOW_STARTED', workflowInstanceId } as EngineEvent;
}

describe('EngineEventQueue', () => {
  it('should process a single event through the handler', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const queue = new EngineEventQueue(handler);

    const event = makeEvent('WORKFLOW_STARTED', 'wf-1');
    await queue.enqueue(event);

    expect(handler).toHaveBeenCalledWith(event);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should process events serially (second waits for first)', async () => {
    const executionOrder: string[] = [];
    let resolveFirst: (() => void) | null = null;

    const handler = vi.fn().mockImplementation(async (event: EngineEvent) => {
      const id = (event as { workflowInstanceId: string }).workflowInstanceId;
      executionOrder.push(`start-${id}`);

      if (id === 'wf-1') {
        // First handler blocks until we explicitly resolve
        await new Promise<void>((resolve) => {
          resolveFirst = resolve;
        });
      }

      executionOrder.push(`end-${id}`);
    });

    const queue = new EngineEventQueue(handler);

    // Enqueue two events
    const promise1 = queue.enqueue(makeEvent('WORKFLOW_STARTED', 'wf-1'));
    const promise2 = queue.enqueue(makeEvent('WORKFLOW_STARTED', 'wf-2'));

    // Give the queue a tick to start processing
    await new Promise((r) => setTimeout(r, 10));

    // First event started, second should NOT have started yet
    expect(executionOrder).toEqual(['start-wf-1']);

    // Resolve first event
    resolveFirst!();
    await promise1;
    await promise2;

    // Both events processed in FIFO order
    expect(executionOrder).toEqual([
      'start-wf-1',
      'end-wf-1',
      'start-wf-2',
      'end-wf-2',
    ]);
  });

  it('should reject the enqueue promise when handler throws', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('handler failed'));
    const queue = new EngineEventQueue(handler);

    await expect(queue.enqueue(makeEvent('WORKFLOW_STARTED', 'wf-1'))).rejects.toThrow(
      'handler failed',
    );
  });

  it('should continue processing after handler error', async () => {
    let callCount = 0;
    const handler = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error('first failed');
      }
      // Second event succeeds
    });

    const queue = new EngineEventQueue(handler);

    // First event should reject
    const promise1 = queue.enqueue(makeEvent('WORKFLOW_STARTED', 'wf-1'));
    const promise2 = queue.enqueue(makeEvent('WORKFLOW_STARTED', 'wf-2'));

    await expect(promise1).rejects.toThrow('first failed');
    await promise2; // Should resolve successfully

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('should resolve concurrent enqueue calls in FIFO order', async () => {
    const processedOrder: string[] = [];

    const handler = vi.fn().mockImplementation(async (event: EngineEvent) => {
      const id = (event as { workflowInstanceId: string }).workflowInstanceId;
      // Small delay to simulate async work
      await new Promise((r) => setTimeout(r, 5));
      processedOrder.push(id);
    });

    const queue = new EngineEventQueue(handler);

    // Enqueue 5 events concurrently
    const promises = [
      queue.enqueue(makeEvent('WORKFLOW_STARTED', 'wf-1')),
      queue.enqueue(makeEvent('WORKFLOW_STARTED', 'wf-2')),
      queue.enqueue(makeEvent('WORKFLOW_STARTED', 'wf-3')),
      queue.enqueue(makeEvent('WORKFLOW_STARTED', 'wf-4')),
      queue.enqueue(makeEvent('WORKFLOW_STARTED', 'wf-5')),
    ];

    await Promise.all(promises);

    expect(processedOrder).toEqual(['wf-1', 'wf-2', 'wf-3', 'wf-4', 'wf-5']);
  });

  it('should report pending count correctly', async () => {
    let resolveHandler: (() => void) | null = null;

    const handler = vi.fn().mockImplementation(async () => {
      await new Promise<void>((resolve) => {
        resolveHandler = resolve;
      });
    });

    const queue = new EngineEventQueue(handler);

    expect(queue.pending).toBe(0);

    // Enqueue events without awaiting
    const p1 = queue.enqueue(makeEvent('WORKFLOW_STARTED', 'wf-1'));
    const p2 = queue.enqueue(makeEvent('WORKFLOW_STARTED', 'wf-2'));

    // Give queue a tick to start processing first event
    await new Promise((r) => setTimeout(r, 5));

    // First event is being processed (removed from queue), second is pending
    expect(queue.pending).toBe(1);

    // Resolve first event
    resolveHandler!();
    await new Promise((r) => setTimeout(r, 5));

    // Second event is now being processed
    resolveHandler!();
    await p1;
    await p2;

    expect(queue.pending).toBe(0);
  });
});
