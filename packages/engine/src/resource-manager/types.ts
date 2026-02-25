// Resource manager types for resource acquisition, release, and SYNC barriers.

import type { ResourceCommandType, ResourceType } from '../types/common';

/**
 * Request to acquire or release a resource.
 */
export interface ResourceRequest {
  step_instance_id: string;
  workflow_instance_id: string;
  command_type: ResourceCommandType;
  resource_name: string;
  scope: 'workflow' | 'environment';
  scope_id: string;
  amount: number;
}

/**
 * Result of an acquire attempt.
 */
export interface AcquireResult {
  /** Whether the resource was successfully acquired */
  acquired: boolean;
  /** Whether the request was queued for later fulfillment */
  waitQueued: boolean;
}

/**
 * Result of a release that may trigger dequeue.
 */
export interface ReleaseResult {
  /** Step instance IDs that were dequeued and granted resources */
  grantedStepInstanceIds: string[];
}

/**
 * Entry for registering a SYNC barrier operation.
 */
export interface SyncBarrierRequest {
  resource_name: string;
  step_instance_id: string;
  workflow_instance_id: string;
  command_type: 'Synchronize' | 'Send' | 'Receive';
}

/**
 * Result of registering a SYNC barrier.
 */
export interface SyncBarrierResult {
  /** Whether a matching partner was found */
  matched: boolean;
  /** The step instance ID of the partner, if matched */
  partnerId?: string;
}
