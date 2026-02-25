// Repository interfaces for the engine's storage layer.
// The engine defines these contracts; the platform layer implements them.
// Source: Research Pattern 3 (Interface-Based Dependency Injection)

import type {
  RuntimeWorkflow,
  RuntimeWorkflowStep,
  WorkflowConnection,
  RuntimeValueProperty,
  ResourcePool,
  ResourceQueueEntry,
  SyncBarrierEntry,
} from '../types/runtime';
import type {
  MasterWorkflowSpecification,
  MasterEnvironmentLibrary,
  MasterActionLibrary,
  PropertySpecification,
} from '../types/master';
import type { StepState, WorkflowState } from '../types/common';

// ---------------------------------------------------------------------------
// Master Data Repositories (read-only data from imported packages)
// ---------------------------------------------------------------------------

export interface IMasterWorkflowRepository {
  getAll(): Promise<MasterWorkflowSpecification[]>;
  getByOid(oid: string): Promise<MasterWorkflowSpecification | null>;
  save(spec: MasterWorkflowSpecification): Promise<void>;
  deleteByOid(oid: string): Promise<void>;
  replaceByOid(oid: string, spec: MasterWorkflowSpecification): Promise<void>;
}

export interface IMasterEnvironmentRepository {
  getByWorkflowOid(workflowOid: string): Promise<MasterEnvironmentLibrary[]>;
  save(workflowOid: string, lib: MasterEnvironmentLibrary): Promise<void>;
  deleteByWorkflowOid(workflowOid: string): Promise<void>;
}

export interface IMasterActionRepository {
  getByEnvironmentOid(environmentOid: string): Promise<MasterActionLibrary[]>;
  save(environmentOid: string, lib: MasterActionLibrary): Promise<void>;
  deleteByEnvironmentOid(environmentOid: string): Promise<void>;
}

export interface IImageRepository {
  getByWorkflowOid(workflowOid: string): Promise<PackageImage[]>;
  save(workflowOid: string, image: PackageImage): Promise<void>;
  deleteByWorkflowOid(workflowOid: string): Promise<void>;
}

/**
 * Represents a stored image from a workflow package.
 */
export interface PackageImage {
  filename: string;
  mime_type: string;
  data: Uint8Array;
}

// ---------------------------------------------------------------------------
// Runtime Repositories (mutable execution state)
// ---------------------------------------------------------------------------

export interface IWorkflowRepository {
  getById(instanceId: string): Promise<RuntimeWorkflow | null>;
  save(workflow: RuntimeWorkflow): Promise<void>;
  updateState(instanceId: string, state: WorkflowState): Promise<void>;
  getActive(): Promise<RuntimeWorkflow[]>;
  delete(instanceId: string): Promise<void>;
  updateLastActivity(instanceId: string, timestamp: string): Promise<void>;
}

export interface IStepRepository {
  getByWorkflow(workflowInstanceId: string): Promise<RuntimeWorkflowStep[]>;
  getById(instanceId: string): Promise<RuntimeWorkflowStep | null>;
  updateState(instanceId: string, state: StepState): Promise<void>;
  save(step: RuntimeWorkflowStep): Promise<void>;
  saveMany(steps: RuntimeWorkflowStep[]): Promise<void>;
  updateUserInputs(instanceId: string, userInputsJson: string): Promise<void>;
  updateResolvedOutputs(instanceId: string, resolvedOutputsJson: string): Promise<void>;
}

export interface IConnectionRepository {
  getByWorkflow(workflowInstanceId: string): Promise<WorkflowConnection[]>;
  saveMany(workflowInstanceId: string, connections: WorkflowConnection[]): Promise<void>;
}

export interface IValuePropertyRepository {
  getWorkflowProperty(
    workflowInstanceId: string,
    name: string,
  ): Promise<RuntimeValueProperty | null>;
  getEnvironmentProperty(
    envOid: string,
    name: string,
  ): Promise<RuntimeValueProperty | null>;
  upsertEntry(
    scope: 'workflow' | 'environment',
    scopeId: string,
    propertyName: string,
    entryName: string,
    value: string,
  ): Promise<void>;
  deleteByWorkflow(workflowInstanceId: string): Promise<void>;
  initializeFromSpec(
    scope: 'workflow' | 'environment',
    scopeId: string,
    specs: PropertySpecification[],
  ): Promise<void>;
  getAllByWorkflow(workflowInstanceId: string): Promise<RuntimeValueProperty[]>;
}

// ---------------------------------------------------------------------------
// Resource Repositories
// ---------------------------------------------------------------------------

export interface IResourcePoolRepository {
  create(pool: ResourcePool): Promise<void>;
  getByScope(scope: string, scopeId: string): Promise<ResourcePool[]>;
  updateUsage(
    resourceName: string,
    scope: string,
    scopeId: string,
    currentUsage: number,
  ): Promise<void>;
  delete(resourceName: string, scope: string, scopeId: string): Promise<void>;
}

export interface IResourceQueueRepository {
  enqueue(entry: ResourceQueueEntry): Promise<void>;
  dequeue(resourceName: string, scope: string, scopeId: string): Promise<ResourceQueueEntry | null>;
  getByPool(resourceName: string, scope: string, scopeId: string): Promise<ResourceQueueEntry[]>;
}

export interface ISyncBarrierRepository {
  register(entry: SyncBarrierEntry): Promise<void>;
  match(entryId: string, matchedWithStepInstanceId: string): Promise<void>;
  getUnmatched(
    resourceName: string,
    compatibleCommandType: string,
    workflowInstanceId: string,
  ): Promise<SyncBarrierEntry | null>;
}
