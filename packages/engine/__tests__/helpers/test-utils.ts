// Common test helpers for engine tests.
// Provides one-liner setup for test context and event utilities.

import { EngineEventBus } from '../../src/events/event-bus';
import { EngineEventQueue } from '../../src/events/event-queue';
import type { EngineEvent, EngineEventMap } from '../../src/types/events';
import {
  InMemoryWorkflowRepository,
  InMemoryStepRepository,
  InMemoryConnectionRepository,
  InMemoryValuePropertyRepository,
  InMemoryMasterWorkflowRepository,
  InMemoryMasterEnvironmentRepository,
  InMemoryMasterActionRepository,
  InMemoryImageRepository,
  InMemoryResourcePoolRepository,
  InMemoryResourceQueueRepository,
  InMemorySyncBarrierRepository,
  InMemoryExecutionLogger,
  TestIdGenerator,
} from './mock-repositories';

/**
 * Creates a complete test context with all mock repositories, event bus,
 * event queue, test ID generator, and execution logger.
 */
export function createTestContext() {
  const eventBus = new EngineEventBus();
  const idGenerator = new TestIdGenerator();
  const logger = new InMemoryExecutionLogger();

  const workflowRepo = new InMemoryWorkflowRepository();
  const stepRepo = new InMemoryStepRepository();
  const connectionRepo = new InMemoryConnectionRepository();
  const valuePropertyRepo = new InMemoryValuePropertyRepository();
  const masterWorkflowRepo = new InMemoryMasterWorkflowRepository();
  const masterEnvironmentRepo = new InMemoryMasterEnvironmentRepository();
  const masterActionRepo = new InMemoryMasterActionRepository();
  const imageRepo = new InMemoryImageRepository();
  const resourcePoolRepo = new InMemoryResourcePoolRepository();
  const resourceQueueRepo = new InMemoryResourceQueueRepository();
  const syncBarrierRepo = new InMemorySyncBarrierRepository();

  // Event queue with a default no-op handler (tests can replace via constructor)
  const eventQueue = new EngineEventQueue(async () => {});

  return {
    eventBus,
    eventQueue,
    idGenerator,
    logger,
    workflowRepo,
    stepRepo,
    connectionRepo,
    valuePropertyRepo,
    masterWorkflowRepo,
    masterEnvironmentRepo,
    masterActionRepo,
    imageRepo,
    resourcePoolRepo,
    resourceQueueRepo,
    syncBarrierRepo,
    /** Clear all repositories and reset ID generator. */
    clearAll() {
      workflowRepo.clear();
      stepRepo.clear();
      connectionRepo.clear();
      valuePropertyRepo.clear();
      masterWorkflowRepo.clear();
      masterEnvironmentRepo.clear();
      masterActionRepo.clear();
      imageRepo.clear();
      resourcePoolRepo.clear();
      resourceQueueRepo.clear();
      syncBarrierRepo.clear();
      logger.clear();
      idGenerator.reset();
      eventBus.removeAllListeners();
    },
  };
}

/**
 * Returns a Promise that resolves with the event data on the next emit
 * of the specified event.
 */
export function waitForEvent<K extends keyof EngineEventMap>(
  bus: EngineEventBus,
  eventName: K,
): Promise<EngineEventMap[K]> {
  return new Promise<EngineEventMap[K]>((resolve) => {
    const unsub = bus.on(eventName, (data) => {
      unsub();
      resolve(data);
    });
  });
}

/**
 * Helper to ensure all queued events in a queue have been processed.
 * Enqueues a sentinel event and waits for it to be processed.
 */
export async function drainQueue(queue: EngineEventQueue): Promise<void> {
  // Enqueue a no-op sentinel event. Once it resolves, all prior events
  // have been processed since the queue is FIFO.
  const sentinel: EngineEvent = {
    type: 'EXECUTION_LOG',
    entry: {
      workflow_instance_id: '__drain__',
      event_type: 'ENGINE_ERROR',
      event_data_json: '{}',
      timestamp: new Date().toISOString(),
    },
  };
  await queue.enqueue(sentinel);
}
