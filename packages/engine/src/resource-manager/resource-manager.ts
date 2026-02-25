// Resource manager: handles resource acquisition, release, FIFO queuing,
// deadlock prevention, and SYNC barriers.
// Source: ExecutionEngineSpec.md Section 8, Research Pitfall and Open Question 2

import type {
  IResourcePoolRepository,
  IResourceQueueRepository,
  ISyncBarrierRepository,
} from '../interfaces/storage';
import type { ResourcePropertySpecification } from '../types/master';
import type { ResourceQueueEntry } from '../types/runtime';
import type { IIdGenerator } from '../interfaces/id-generator';
import type {
  ResourceRequest,
  AcquireResult,
  ReleaseResult,
  SyncBarrierRequest,
  SyncBarrierResult,
} from './types';

/**
 * Manages resource pools, acquisition/release with FIFO queuing,
 * deadlock prevention via alphabetical ordering, and SYNC barriers.
 */
export class ResourceManager {
  constructor(
    private readonly poolRepo: IResourcePoolRepository,
    private readonly queueRepo: IResourceQueueRepository,
    private readonly syncBarrierRepo: ISyncBarrierRepository,
    private readonly idGenerator: IIdGenerator,
  ) {}

  // ---------------------------------------------------------------------------
  // Pool initialization and cleanup
  // ---------------------------------------------------------------------------

  /**
   * Initialize resource pools from specifications.
   * Creates pool entries in the repository for each spec.
   */
  async initializePools(
    scope: 'workflow' | 'environment',
    scopeId: string,
    specs: ResourcePropertySpecification[],
  ): Promise<void> {
    for (const spec of specs) {
      const capacity = this.getCapacity(spec);
      await this.poolRepo.create({
        resource_name: spec.name,
        scope,
        scope_id: scopeId,
        resource_type: spec.resource_type,
        capacity,
        current_usage: 0,
        named_instances: spec.names?.map((name) => ({ name, acquired_by: undefined })),
      });
    }
  }

  /**
   * Destroy all resource pools for a given scope.
   */
  async destroyPools(
    scope: 'workflow' | 'environment',
    scopeId: string,
  ): Promise<void> {
    const pools = await this.poolRepo.getByScope(scope, scopeId);
    for (const pool of pools) {
      await this.poolRepo.delete(pool.resource_name, scope, scopeId);
    }
  }

  // ---------------------------------------------------------------------------
  // Resource acquisition and release
  // ---------------------------------------------------------------------------

  /**
   * Attempt to acquire a resource.
   *
   * If capacity allows, increments usage and returns acquired: true.
   * If capacity is full, enqueues the request (FIFO) and returns waitQueued: true.
   */
  async acquire(request: ResourceRequest): Promise<AcquireResult> {
    const pools = await this.poolRepo.getByScope(request.scope, request.scope_id);
    const pool = pools.find((p) => p.resource_name === request.resource_name);

    if (!pool) {
      // Pool not found -- cannot acquire a nonexistent resource
      return { acquired: false, waitQueued: false };
    }

    if (pool.current_usage + request.amount <= pool.capacity) {
      // Capacity available -- acquire immediately
      await this.poolRepo.updateUsage(
        pool.resource_name,
        pool.scope,
        pool.scope_id,
        pool.current_usage + request.amount,
      );
      return { acquired: true, waitQueued: false };
    }

    // No capacity -- enqueue the request (FIFO)
    const entry: ResourceQueueEntry = {
      step_instance_id: request.step_instance_id,
      workflow_instance_id: request.workflow_instance_id,
      command_type: request.command_type,
      resource_name: request.resource_name,
      amount: request.amount,
      requested_at: new Date().toISOString(),
    };
    await this.queueRepo.enqueue(entry);

    return { acquired: false, waitQueued: true };
  }

  /**
   * Acquire multiple resources for a step, sorted alphabetically by
   * resource name to prevent deadlocks.
   *
   * Returns true only if ALL resources were acquired. If any resource
   * could not be acquired, the step is queued for that resource.
   */
  async acquireAll(requests: ResourceRequest[]): Promise<{
    allAcquired: boolean;
    results: Map<string, AcquireResult>;
  }> {
    // Sort by resource name for deadlock prevention
    const sorted = [...requests].sort((a, b) =>
      a.resource_name.localeCompare(b.resource_name),
    );

    const results = new Map<string, AcquireResult>();
    let allAcquired = true;

    for (const request of sorted) {
      const result = await this.acquire(request);
      results.set(request.resource_name, result);
      if (!result.acquired) {
        allAcquired = false;
        // Stop acquiring further resources -- the step needs to wait
        break;
      }
    }

    return { allAcquired, results };
  }

  /**
   * Release a resource and check the FIFO queue for waiting requests.
   *
   * If a queued request can now be fulfilled (capacity allows), dequeues it
   * and returns its step_instance_id so the runner can resume that step.
   */
  async release(
    stepInstanceId: string,
    resourceName: string,
    scope: 'workflow' | 'environment',
    scopeId: string,
    amount: number = 1,
  ): Promise<ReleaseResult> {
    const pools = await this.poolRepo.getByScope(scope, scopeId);
    const pool = pools.find((p) => p.resource_name === resourceName);

    if (!pool) {
      return { grantedStepInstanceIds: [] };
    }

    // Decrement usage
    const newUsage = Math.max(0, pool.current_usage - amount);
    await this.poolRepo.updateUsage(resourceName, scope, scopeId, newUsage);

    // Check queue for waiting requests
    const grantedStepInstanceIds: string[] = [];
    let currentUsage = newUsage;

    // Keep granting from queue while capacity allows
    while (true) {
      const queued = await this.queueRepo.dequeue(resourceName, scope, scopeId);
      if (!queued) break;

      if (currentUsage + queued.amount <= pool.capacity) {
        // Grant the resource
        currentUsage += queued.amount;
        await this.poolRepo.updateUsage(resourceName, scope, scopeId, currentUsage);
        grantedStepInstanceIds.push(queued.step_instance_id);
      } else {
        // Cannot grant yet -- re-enqueue and stop
        await this.queueRepo.enqueue(queued);
        break;
      }
    }

    return { grantedStepInstanceIds };
  }

  /**
   * Release all resources held by any step in a workflow.
   * Used during workflow completion/abort cleanup.
   */
  async releaseAll(
    scope: 'workflow' | 'environment',
    scopeId: string,
  ): Promise<void> {
    const pools = await this.poolRepo.getByScope(scope, scopeId);
    for (const pool of pools) {
      await this.poolRepo.updateUsage(pool.resource_name, scope, scopeId, 0);
    }
  }

  // ---------------------------------------------------------------------------
  // SYNC barriers
  // ---------------------------------------------------------------------------

  /**
   * Register a SYNC barrier entry (Synchronize, Send, or Receive).
   *
   * For Synchronize: looks for another unmatched Synchronize on the same resource.
   * For Send: looks for an unmatched Receive on the same resource (and vice versa).
   *
   * If a compatible partner is found, both are matched and the result indicates
   * the partner's step instance ID.
   */
  async registerSync(request: SyncBarrierRequest): Promise<SyncBarrierResult> {
    const compatibleType = this.getCompatibleCommandType(request.command_type);

    // Check for an unmatched compatible entry
    const partner = await this.syncBarrierRepo.getUnmatched(
      request.resource_name,
      compatibleType,
      request.workflow_instance_id,
    );

    // Register this entry
    const entryId = this.idGenerator.generateId();
    await this.syncBarrierRepo.register({
      id: entryId,
      resource_name: request.resource_name,
      command_type: request.command_type,
      step_instance_id: request.step_instance_id,
      workflow_instance_id: request.workflow_instance_id,
      registered_at: new Date().toISOString(),
    });

    if (partner) {
      // Match both entries
      await this.syncBarrierRepo.match(partner.id, request.step_instance_id);
      await this.syncBarrierRepo.match(entryId, partner.step_instance_id);

      return {
        matched: true,
        partnerId: partner.step_instance_id,
      };
    }

    // No partner yet -- waiting for match
    return { matched: false };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Get the compatible command type for SYNC barrier matching.
   * Synchronize matches with Synchronize.
   * Send matches with Receive.
   * Receive matches with Send.
   */
  private getCompatibleCommandType(commandType: 'Synchronize' | 'Send' | 'Receive'): string {
    switch (commandType) {
      case 'Synchronize':
        return 'Synchronize';
      case 'Send':
        return 'Receive';
      case 'Receive':
        return 'Send';
    }
  }

  /**
   * Determine capacity from a resource specification.
   */
  private getCapacity(spec: ResourcePropertySpecification): number {
    switch (spec.resource_type) {
      case 'binary exclusive use':
        return 1;
      case 'binary shared use with pool limits':
        return spec.use_limit ?? 1;
      case 'countable use with pool limits':
        return spec.use_limit ?? 1;
      case 'named pool':
        return spec.names?.length ?? 0;
      case 'sync':
        return 0; // Sync resources don't use capacity-based tracking
      default:
        return 1;
    }
  }
}
