import { describe, it, expect, beforeEach } from 'vitest';
import { ResourceManager } from '../../src/resource-manager/resource-manager';
import {
  InMemoryResourcePoolRepository,
  InMemoryResourceQueueRepository,
  InMemorySyncBarrierRepository,
  TestIdGenerator,
} from '../helpers/mock-repositories';
import type { ResourceRequest } from '../../src/resource-manager/types';
import type { ResourcePropertySpecification } from '../../src/types/master';

describe('ResourceManager', () => {
  let poolRepo: InMemoryResourcePoolRepository;
  let queueRepo: InMemoryResourceQueueRepository;
  let syncBarrierRepo: InMemorySyncBarrierRepository;
  let idGenerator: TestIdGenerator;
  let manager: ResourceManager;

  beforeEach(() => {
    poolRepo = new InMemoryResourcePoolRepository();
    queueRepo = new InMemoryResourceQueueRepository();
    syncBarrierRepo = new InMemorySyncBarrierRepository();
    idGenerator = new TestIdGenerator();
    manager = new ResourceManager(poolRepo, queueRepo, syncBarrierRepo, idGenerator);
  });

  function makeRequest(overrides: Partial<ResourceRequest> = {}): ResourceRequest {
    return {
      step_instance_id: 'step-1',
      workflow_instance_id: 'wf-1',
      command_type: 'Acquire',
      resource_name: 'TestResource',
      scope: 'workflow',
      scope_id: 'wf-1',
      amount: 1,
      ...overrides,
    };
  }

  // ---------------------------------------------------------------------------
  // Pool initialization
  // ---------------------------------------------------------------------------

  describe('initializePools', () => {
    it('should create pools from specifications', async () => {
      const specs: ResourcePropertySpecification[] = [
        { name: 'Lock', resource_type: 'binary exclusive use' },
        { name: 'Workers', resource_type: 'countable use with pool limits', use_limit: 3 },
      ];

      await manager.initializePools('workflow', 'wf-1', specs);

      const pools = await poolRepo.getByScope('workflow', 'wf-1');
      expect(pools).toHaveLength(2);
      expect(pools.find((p) => p.resource_name === 'Lock')?.capacity).toBe(1);
      expect(pools.find((p) => p.resource_name === 'Workers')?.capacity).toBe(3);
    });

    it('should set named pool capacity from names array length', async () => {
      const specs: ResourcePropertySpecification[] = [
        { name: 'Machines', resource_type: 'named pool', names: ['M1', 'M2', 'M3'] },
      ];

      await manager.initializePools('workflow', 'wf-1', specs);

      const pools = await poolRepo.getByScope('workflow', 'wf-1');
      expect(pools[0].capacity).toBe(3);
    });
  });

  // ---------------------------------------------------------------------------
  // Binary exclusive resource (capacity=1)
  // ---------------------------------------------------------------------------

  describe('acquire - binary exclusive', () => {
    beforeEach(async () => {
      await manager.initializePools('workflow', 'wf-1', [
        { name: 'Lock', resource_type: 'binary exclusive use' },
      ]);
    });

    it('should acquire successfully when resource is free', async () => {
      const result = await manager.acquire(makeRequest({ resource_name: 'Lock' }));
      expect(result.acquired).toBe(true);
      expect(result.waitQueued).toBe(false);
    });

    it('should queue when resource is already acquired', async () => {
      // First acquire succeeds
      await manager.acquire(makeRequest({ resource_name: 'Lock', step_instance_id: 'step-1' }));

      // Second acquire should be queued
      const result = await manager.acquire(makeRequest({
        resource_name: 'Lock',
        step_instance_id: 'step-2',
      }));
      expect(result.acquired).toBe(false);
      expect(result.waitQueued).toBe(true);
    });

    it('should return acquired=false and waitQueued=false for nonexistent pool', async () => {
      const result = await manager.acquire(makeRequest({ resource_name: 'NonExistent' }));
      expect(result.acquired).toBe(false);
      expect(result.waitQueued).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Release triggers dequeue
  // ---------------------------------------------------------------------------

  describe('release', () => {
    beforeEach(async () => {
      await manager.initializePools('workflow', 'wf-1', [
        { name: 'Lock', resource_type: 'binary exclusive use' },
      ]);
    });

    it('should dequeue waiting step after release', async () => {
      // Step 1 acquires
      await manager.acquire(makeRequest({ resource_name: 'Lock', step_instance_id: 'step-1' }));
      // Step 2 queued
      await manager.acquire(makeRequest({ resource_name: 'Lock', step_instance_id: 'step-2' }));

      // Step 1 releases
      const result = await manager.release('step-1', 'Lock', 'workflow', 'wf-1');

      expect(result.grantedStepInstanceIds).toContain('step-2');
    });

    it('should return empty grantedStepInstanceIds when no one is queued', async () => {
      await manager.acquire(makeRequest({ resource_name: 'Lock', step_instance_id: 'step-1' }));

      const result = await manager.release('step-1', 'Lock', 'workflow', 'wf-1');

      expect(result.grantedStepInstanceIds).toHaveLength(0);
    });

    it('should maintain FIFO ordering when dequeuing', async () => {
      // Acquire the resource
      await manager.acquire(makeRequest({ resource_name: 'Lock', step_instance_id: 'step-1' }));

      // Queue step-2 then step-3
      await manager.acquire(makeRequest({ resource_name: 'Lock', step_instance_id: 'step-2' }));
      await manager.acquire(makeRequest({ resource_name: 'Lock', step_instance_id: 'step-3' }));

      // Release step-1 -- should grant to step-2 (first in queue)
      const result1 = await manager.release('step-1', 'Lock', 'workflow', 'wf-1');
      expect(result1.grantedStepInstanceIds).toEqual(['step-2']);

      // Release step-2 -- should grant to step-3
      const result2 = await manager.release('step-2', 'Lock', 'workflow', 'wf-1');
      expect(result2.grantedStepInstanceIds).toEqual(['step-3']);
    });
  });

  // ---------------------------------------------------------------------------
  // Pool with capacity > 1
  // ---------------------------------------------------------------------------

  describe('acquire - countable pool', () => {
    beforeEach(async () => {
      await manager.initializePools('workflow', 'wf-1', [
        { name: 'Workers', resource_type: 'countable use with pool limits', use_limit: 3 },
      ]);
    });

    it('should allow multiple acquisitions up to capacity', async () => {
      const r1 = await manager.acquire(makeRequest({ resource_name: 'Workers', step_instance_id: 's1' }));
      const r2 = await manager.acquire(makeRequest({ resource_name: 'Workers', step_instance_id: 's2' }));
      const r3 = await manager.acquire(makeRequest({ resource_name: 'Workers', step_instance_id: 's3' }));

      expect(r1.acquired).toBe(true);
      expect(r2.acquired).toBe(true);
      expect(r3.acquired).toBe(true);
    });

    it('should queue when capacity is exhausted', async () => {
      // Exhaust capacity
      await manager.acquire(makeRequest({ resource_name: 'Workers', step_instance_id: 's1' }));
      await manager.acquire(makeRequest({ resource_name: 'Workers', step_instance_id: 's2' }));
      await manager.acquire(makeRequest({ resource_name: 'Workers', step_instance_id: 's3' }));

      // 4th should be queued
      const r4 = await manager.acquire(makeRequest({ resource_name: 'Workers', step_instance_id: 's4' }));
      expect(r4.acquired).toBe(false);
      expect(r4.waitQueued).toBe(true);
    });

    it('should grant queued request when capacity opens up', async () => {
      await manager.acquire(makeRequest({ resource_name: 'Workers', step_instance_id: 's1' }));
      await manager.acquire(makeRequest({ resource_name: 'Workers', step_instance_id: 's2' }));
      await manager.acquire(makeRequest({ resource_name: 'Workers', step_instance_id: 's3' }));
      await manager.acquire(makeRequest({ resource_name: 'Workers', step_instance_id: 's4' }));

      // Release one -- should grant to s4
      const result = await manager.release('s1', 'Workers', 'workflow', 'wf-1');
      expect(result.grantedStepInstanceIds).toEqual(['s4']);
    });
  });

  // ---------------------------------------------------------------------------
  // Deadlock prevention via alphabetical ordering
  // ---------------------------------------------------------------------------

  describe('acquireAll - deadlock prevention', () => {
    beforeEach(async () => {
      await manager.initializePools('workflow', 'wf-1', [
        { name: 'Zebra', resource_type: 'binary exclusive use' },
        { name: 'Alpha', resource_type: 'binary exclusive use' },
        { name: 'Middle', resource_type: 'binary exclusive use' },
      ]);
    });

    it('should acquire resources in alphabetical order', async () => {
      // Track the order of acquisitions
      const acquireOrder: string[] = [];
      const origAcquire = manager.acquire.bind(manager);
      manager.acquire = async (req: ResourceRequest) => {
        acquireOrder.push(req.resource_name);
        return origAcquire(req);
      };

      const requests: ResourceRequest[] = [
        makeRequest({ resource_name: 'Zebra', step_instance_id: 'step-1' }),
        makeRequest({ resource_name: 'Alpha', step_instance_id: 'step-1' }),
        makeRequest({ resource_name: 'Middle', step_instance_id: 'step-1' }),
      ];

      await manager.acquireAll(requests);

      // Should be sorted alphabetically
      expect(acquireOrder).toEqual(['Alpha', 'Middle', 'Zebra']);
    });

    it('should return allAcquired=true when all resources available', async () => {
      const requests: ResourceRequest[] = [
        makeRequest({ resource_name: 'Alpha', step_instance_id: 'step-1' }),
        makeRequest({ resource_name: 'Zebra', step_instance_id: 'step-1' }),
      ];

      const { allAcquired } = await manager.acquireAll(requests);
      expect(allAcquired).toBe(true);
    });

    it('should stop acquiring and return allAcquired=false when one is unavailable', async () => {
      // Pre-acquire Alpha so it's unavailable
      await manager.acquire(makeRequest({ resource_name: 'Alpha', step_instance_id: 'step-0' }));

      const requests: ResourceRequest[] = [
        makeRequest({ resource_name: 'Zebra', step_instance_id: 'step-1' }),
        makeRequest({ resource_name: 'Alpha', step_instance_id: 'step-1' }),
      ];

      const { allAcquired, results } = await manager.acquireAll(requests);
      expect(allAcquired).toBe(false);
      // Alpha should have been attempted first (alphabetical) and queued
      expect(results.get('Alpha')?.acquired).toBe(false);
      // Zebra should NOT have been attempted since Alpha failed
      expect(results.has('Zebra')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // SYNC barriers
  // ---------------------------------------------------------------------------

  describe('registerSync', () => {
    it('should register and wait when no partner exists (Synchronize)', async () => {
      const result = await manager.registerSync({
        resource_name: 'SyncPoint',
        step_instance_id: 'step-1',
        workflow_instance_id: 'wf-1',
        command_type: 'Synchronize',
      });

      expect(result.matched).toBe(false);
      expect(result.partnerId).toBeUndefined();
    });

    it('should match two Synchronize entries on the same resource', async () => {
      // First step registers
      const result1 = await manager.registerSync({
        resource_name: 'SyncPoint',
        step_instance_id: 'step-1',
        workflow_instance_id: 'wf-1',
        command_type: 'Synchronize',
      });
      expect(result1.matched).toBe(false);

      // Second step registers -- should match with first
      const result2 = await manager.registerSync({
        resource_name: 'SyncPoint',
        step_instance_id: 'step-2',
        workflow_instance_id: 'wf-1',
        command_type: 'Synchronize',
      });
      expect(result2.matched).toBe(true);
      expect(result2.partnerId).toBe('step-1');
    });

    it('should match Send with Receive', async () => {
      // Send registers
      const sendResult = await manager.registerSync({
        resource_name: 'Channel',
        step_instance_id: 'sender',
        workflow_instance_id: 'wf-1',
        command_type: 'Send',
      });
      expect(sendResult.matched).toBe(false);

      // Receive registers -- should match with Send
      const receiveResult = await manager.registerSync({
        resource_name: 'Channel',
        step_instance_id: 'receiver',
        workflow_instance_id: 'wf-1',
        command_type: 'Receive',
      });
      expect(receiveResult.matched).toBe(true);
      expect(receiveResult.partnerId).toBe('sender');
    });

    it('should match Receive with Send (reverse order)', async () => {
      // Receive registers first
      const receiveResult = await manager.registerSync({
        resource_name: 'Channel',
        step_instance_id: 'receiver',
        workflow_instance_id: 'wf-1',
        command_type: 'Receive',
      });
      expect(receiveResult.matched).toBe(false);

      // Send registers -- should match with Receive
      const sendResult = await manager.registerSync({
        resource_name: 'Channel',
        step_instance_id: 'sender',
        workflow_instance_id: 'wf-1',
        command_type: 'Send',
      });
      expect(sendResult.matched).toBe(true);
      expect(sendResult.partnerId).toBe('receiver');
    });

    it('should not match Send with Send', async () => {
      await manager.registerSync({
        resource_name: 'Channel',
        step_instance_id: 'sender-1',
        workflow_instance_id: 'wf-1',
        command_type: 'Send',
      });

      const result = await manager.registerSync({
        resource_name: 'Channel',
        step_instance_id: 'sender-2',
        workflow_instance_id: 'wf-1',
        command_type: 'Send',
      });

      // Send does NOT match with Send (only with Receive)
      expect(result.matched).toBe(false);
    });

    it('should not match across different resource names', async () => {
      await manager.registerSync({
        resource_name: 'ChannelA',
        step_instance_id: 'step-1',
        workflow_instance_id: 'wf-1',
        command_type: 'Synchronize',
      });

      const result = await manager.registerSync({
        resource_name: 'ChannelB',
        step_instance_id: 'step-2',
        workflow_instance_id: 'wf-1',
        command_type: 'Synchronize',
      });

      expect(result.matched).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // releaseAll
  // ---------------------------------------------------------------------------

  describe('releaseAll', () => {
    it('should reset all pool usages to 0', async () => {
      await manager.initializePools('workflow', 'wf-1', [
        { name: 'ResourceA', resource_type: 'binary exclusive use' },
        { name: 'ResourceB', resource_type: 'countable use with pool limits', use_limit: 5 },
      ]);

      // Acquire some resources
      await manager.acquire(makeRequest({ resource_name: 'ResourceA', step_instance_id: 's1' }));
      await manager.acquire(makeRequest({ resource_name: 'ResourceB', step_instance_id: 's2' }));
      await manager.acquire(makeRequest({ resource_name: 'ResourceB', step_instance_id: 's3' }));

      // Release all
      await manager.releaseAll('workflow', 'wf-1');

      // Verify pools are reset
      const pools = await poolRepo.getByScope('workflow', 'wf-1');
      for (const pool of pools) {
        expect(pool.current_usage).toBe(0);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // destroyPools
  // ---------------------------------------------------------------------------

  describe('destroyPools', () => {
    it('should remove all pools for scope', async () => {
      await manager.initializePools('workflow', 'wf-1', [
        { name: 'R1', resource_type: 'binary exclusive use' },
        { name: 'R2', resource_type: 'binary exclusive use' },
      ]);

      await manager.destroyPools('workflow', 'wf-1');

      const pools = await poolRepo.getByScope('workflow', 'wf-1');
      expect(pools).toHaveLength(0);
    });
  });
});
