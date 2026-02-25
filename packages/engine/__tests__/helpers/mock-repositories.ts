// In-memory implementations of all repository interfaces for testing.
// These are used by all subsequent engine plan tests.

import type { IWorkflowRepository } from '../../src/interfaces/storage';
import type { IStepRepository } from '../../src/interfaces/storage';
import type { IConnectionRepository } from '../../src/interfaces/storage';
import type { IValuePropertyRepository } from '../../src/interfaces/storage';
import type { IMasterWorkflowRepository } from '../../src/interfaces/storage';
import type { IMasterEnvironmentRepository } from '../../src/interfaces/storage';
import type { IMasterActionRepository } from '../../src/interfaces/storage';
import type { IImageRepository, PackageImage } from '../../src/interfaces/storage';
import type { IResourcePoolRepository } from '../../src/interfaces/storage';
import type { IResourceQueueRepository } from '../../src/interfaces/storage';
import type { ISyncBarrierRepository } from '../../src/interfaces/storage';
import type { IExecutionLogger } from '../../src/interfaces/logger';
import type { IIdGenerator } from '../../src/interfaces/id-generator';

import type { RuntimeWorkflow } from '../../src/types/runtime';
import type { RuntimeWorkflowStep } from '../../src/types/runtime';
import type { WorkflowConnection } from '../../src/types/runtime';
import type { RuntimeValueProperty } from '../../src/types/runtime';
import type { ResourcePool } from '../../src/types/runtime';
import type { ResourceQueueEntry } from '../../src/types/runtime';
import type { SyncBarrierEntry } from '../../src/types/runtime';
import type { MasterWorkflowSpecification } from '../../src/types/master';
import type { MasterEnvironmentLibrary } from '../../src/types/master';
import type { MasterActionLibrary } from '../../src/types/master';
import type { PropertySpecification } from '../../src/types/master';
import type { ExecutionLogEntry } from '../../src/types/events';
import type { StepState, WorkflowState } from '../../src/types/common';

// ---------------------------------------------------------------------------
// InMemoryWorkflowRepository
// ---------------------------------------------------------------------------

export class InMemoryWorkflowRepository implements IWorkflowRepository {
  private workflows = new Map<string, RuntimeWorkflow>();

  async getById(instanceId: string): Promise<RuntimeWorkflow | null> {
    return this.workflows.get(instanceId) ?? null;
  }

  async save(workflow: RuntimeWorkflow): Promise<void> {
    this.workflows.set(workflow.instance_id, { ...workflow });
  }

  async updateState(instanceId: string, state: WorkflowState): Promise<void> {
    const wf = this.workflows.get(instanceId);
    if (wf) {
      wf.workflow_state = state;
    }
  }

  async getActive(): Promise<RuntimeWorkflow[]> {
    return Array.from(this.workflows.values()).filter(
      (wf) => wf.workflow_state === 'RUNNING' || wf.workflow_state === 'PAUSED',
    );
  }

  async delete(instanceId: string): Promise<void> {
    this.workflows.delete(instanceId);
  }

  async updateLastActivity(instanceId: string, timestamp: string): Promise<void> {
    const wf = this.workflows.get(instanceId);
    if (wf) {
      wf.last_activity_at = timestamp;
    }
  }

  clear(): void {
    this.workflows.clear();
  }
}

// ---------------------------------------------------------------------------
// InMemoryStepRepository
// ---------------------------------------------------------------------------

export class InMemoryStepRepository implements IStepRepository {
  private steps = new Map<string, RuntimeWorkflowStep>();

  async getByWorkflow(workflowInstanceId: string): Promise<RuntimeWorkflowStep[]> {
    return Array.from(this.steps.values()).filter(
      (s) => s.workflow_instance_id === workflowInstanceId,
    );
  }

  async getById(instanceId: string): Promise<RuntimeWorkflowStep | null> {
    return this.steps.get(instanceId) ?? null;
  }

  async updateState(instanceId: string, state: StepState): Promise<void> {
    const step = this.steps.get(instanceId);
    if (step) {
      step.step_state = state;
    }
  }

  async save(step: RuntimeWorkflowStep): Promise<void> {
    this.steps.set(step.instance_id, { ...step });
  }

  async saveMany(steps: RuntimeWorkflowStep[]): Promise<void> {
    for (const step of steps) {
      this.steps.set(step.instance_id, { ...step });
    }
  }

  async updateUserInputs(instanceId: string, userInputsJson: string): Promise<void> {
    const step = this.steps.get(instanceId);
    if (step) {
      step.user_inputs_json = userInputsJson;
    }
  }

  async updateResolvedOutputs(instanceId: string, resolvedOutputsJson: string): Promise<void> {
    const step = this.steps.get(instanceId);
    if (step) {
      step.resolved_outputs_json = resolvedOutputsJson;
    }
  }

  clear(): void {
    this.steps.clear();
  }
}

// ---------------------------------------------------------------------------
// InMemoryConnectionRepository
// ---------------------------------------------------------------------------

export class InMemoryConnectionRepository implements IConnectionRepository {
  private connections = new Map<string, WorkflowConnection[]>();

  async getByWorkflow(workflowInstanceId: string): Promise<WorkflowConnection[]> {
    return this.connections.get(workflowInstanceId) ?? [];
  }

  async saveMany(workflowInstanceId: string, conns: WorkflowConnection[]): Promise<void> {
    this.connections.set(workflowInstanceId, [...conns]);
  }

  clear(): void {
    this.connections.clear();
  }
}

// ---------------------------------------------------------------------------
// InMemoryValuePropertyRepository
// ---------------------------------------------------------------------------

export class InMemoryValuePropertyRepository implements IValuePropertyRepository {
  private properties: RuntimeValueProperty[] = [];

  async getWorkflowProperty(
    workflowInstanceId: string,
    name: string,
  ): Promise<RuntimeValueProperty | null> {
    return (
      this.properties.find(
        (p) => p.scope === 'workflow' && p.scope_id === workflowInstanceId && p.property_name === name,
      ) ?? null
    );
  }

  async getEnvironmentProperty(
    envOid: string,
    name: string,
  ): Promise<RuntimeValueProperty | null> {
    return (
      this.properties.find(
        (p) => p.scope === 'environment' && p.scope_id === envOid && p.property_name === name,
      ) ?? null
    );
  }

  async upsertEntry(
    scope: 'workflow' | 'environment',
    scopeId: string,
    propertyName: string,
    entryName: string,
    value: string,
  ): Promise<void> {
    let prop = this.properties.find(
      (p) => p.scope === scope && p.scope_id === scopeId && p.property_name === propertyName,
    );
    if (!prop) {
      prop = { scope, scope_id: scopeId, property_name: propertyName, entries: [] };
      this.properties.push(prop);
    }
    const entry = prop.entries.find((e) => e.name === entryName);
    if (entry) {
      entry.value = value;
    } else {
      prop.entries.push({ name: entryName, value });
    }
    prop.last_modified = new Date().toISOString();
  }

  async deleteByWorkflow(workflowInstanceId: string): Promise<void> {
    this.properties = this.properties.filter(
      (p) => !(p.scope === 'workflow' && p.scope_id === workflowInstanceId),
    );
  }

  async initializeFromSpec(
    scope: 'workflow' | 'environment',
    scopeId: string,
    specs: PropertySpecification[],
  ): Promise<void> {
    for (const spec of specs) {
      this.properties.push({
        scope,
        scope_id: scopeId,
        property_name: spec.name,
        entries: spec.entries.map((e) => ({ name: e.name, value: e.value })),
      });
    }
  }

  async getAllByWorkflow(workflowInstanceId: string): Promise<RuntimeValueProperty[]> {
    return this.properties.filter(
      (p) => p.scope === 'workflow' && p.scope_id === workflowInstanceId,
    );
  }

  clear(): void {
    this.properties = [];
  }
}

// ---------------------------------------------------------------------------
// InMemoryMasterWorkflowRepository
// ---------------------------------------------------------------------------

export class InMemoryMasterWorkflowRepository implements IMasterWorkflowRepository {
  private specs = new Map<string, MasterWorkflowSpecification>();

  async getAll(): Promise<MasterWorkflowSpecification[]> {
    return Array.from(this.specs.values());
  }

  async getByOid(oid: string): Promise<MasterWorkflowSpecification | null> {
    return this.specs.get(oid) ?? null;
  }

  async save(spec: MasterWorkflowSpecification): Promise<void> {
    this.specs.set(spec.oid, spec);
  }

  async deleteByOid(oid: string): Promise<void> {
    this.specs.delete(oid);
  }

  async replaceByOid(oid: string, spec: MasterWorkflowSpecification): Promise<void> {
    this.specs.set(oid, spec);
  }

  clear(): void {
    this.specs.clear();
  }
}

// ---------------------------------------------------------------------------
// InMemoryMasterEnvironmentRepository
// ---------------------------------------------------------------------------

export class InMemoryMasterEnvironmentRepository implements IMasterEnvironmentRepository {
  private envs = new Map<string, MasterEnvironmentLibrary[]>();

  async getByWorkflowOid(workflowOid: string): Promise<MasterEnvironmentLibrary[]> {
    return this.envs.get(workflowOid) ?? [];
  }

  async save(workflowOid: string, lib: MasterEnvironmentLibrary): Promise<void> {
    const existing = this.envs.get(workflowOid) ?? [];
    existing.push(lib);
    this.envs.set(workflowOid, existing);
  }

  async deleteByWorkflowOid(workflowOid: string): Promise<void> {
    this.envs.delete(workflowOid);
  }

  clear(): void {
    this.envs.clear();
  }
}

// ---------------------------------------------------------------------------
// InMemoryMasterActionRepository
// ---------------------------------------------------------------------------

export class InMemoryMasterActionRepository implements IMasterActionRepository {
  private actions = new Map<string, MasterActionLibrary[]>();

  async getByEnvironmentOid(environmentOid: string): Promise<MasterActionLibrary[]> {
    return this.actions.get(environmentOid) ?? [];
  }

  async save(environmentOid: string, lib: MasterActionLibrary): Promise<void> {
    const existing = this.actions.get(environmentOid) ?? [];
    existing.push(lib);
    this.actions.set(environmentOid, existing);
  }

  async deleteByEnvironmentOid(environmentOid: string): Promise<void> {
    this.actions.delete(environmentOid);
  }

  clear(): void {
    this.actions.clear();
  }
}

// ---------------------------------------------------------------------------
// InMemoryImageRepository
// ---------------------------------------------------------------------------

export class InMemoryImageRepository implements IImageRepository {
  private images = new Map<string, PackageImage[]>();

  async getByWorkflowOid(workflowOid: string): Promise<PackageImage[]> {
    return this.images.get(workflowOid) ?? [];
  }

  async save(workflowOid: string, image: PackageImage): Promise<void> {
    const existing = this.images.get(workflowOid) ?? [];
    existing.push(image);
    this.images.set(workflowOid, existing);
  }

  async deleteByWorkflowOid(workflowOid: string): Promise<void> {
    this.images.delete(workflowOid);
  }

  clear(): void {
    this.images.clear();
  }
}

// ---------------------------------------------------------------------------
// InMemoryResourcePoolRepository
// ---------------------------------------------------------------------------

export class InMemoryResourcePoolRepository implements IResourcePoolRepository {
  private pools: ResourcePool[] = [];

  async create(pool: ResourcePool): Promise<void> {
    this.pools.push({ ...pool });
  }

  async getByScope(scope: string, scopeId: string): Promise<ResourcePool[]> {
    return this.pools.filter((p) => p.scope === scope && p.scope_id === scopeId);
  }

  async updateUsage(
    resourceName: string,
    scope: string,
    scopeId: string,
    currentUsage: number,
  ): Promise<void> {
    const pool = this.pools.find(
      (p) => p.resource_name === resourceName && p.scope === scope && p.scope_id === scopeId,
    );
    if (pool) {
      pool.current_usage = currentUsage;
    }
  }

  async delete(resourceName: string, scope: string, scopeId: string): Promise<void> {
    this.pools = this.pools.filter(
      (p) => !(p.resource_name === resourceName && p.scope === scope && p.scope_id === scopeId),
    );
  }

  clear(): void {
    this.pools = [];
  }
}

// ---------------------------------------------------------------------------
// InMemoryResourceQueueRepository
// ---------------------------------------------------------------------------

export class InMemoryResourceQueueRepository implements IResourceQueueRepository {
  private entries: ResourceQueueEntry[] = [];

  async enqueue(entry: ResourceQueueEntry): Promise<void> {
    this.entries.push({ ...entry });
  }

  async dequeue(
    resourceName: string,
    scope: string,
    scopeId: string,
  ): Promise<ResourceQueueEntry | null> {
    const idx = this.entries.findIndex(
      (e) => e.resource_name === resourceName,
    );
    if (idx === -1) return null;
    return this.entries.splice(idx, 1)[0];
  }

  async getByPool(
    resourceName: string,
    scope: string,
    scopeId: string,
  ): Promise<ResourceQueueEntry[]> {
    return this.entries.filter((e) => e.resource_name === resourceName);
  }

  clear(): void {
    this.entries = [];
  }
}

// ---------------------------------------------------------------------------
// InMemorySyncBarrierRepository
// ---------------------------------------------------------------------------

export class InMemorySyncBarrierRepository implements ISyncBarrierRepository {
  private barriers: SyncBarrierEntry[] = [];

  async register(entry: SyncBarrierEntry): Promise<void> {
    this.barriers.push({ ...entry });
  }

  async match(entryId: string, matchedWithStepInstanceId: string): Promise<void> {
    const barrier = this.barriers.find((b) => b.id === entryId);
    if (barrier) {
      barrier.matched_with = matchedWithStepInstanceId;
    }
  }

  async getUnmatched(
    resourceName: string,
    compatibleCommandType: string,
    workflowInstanceId: string,
  ): Promise<SyncBarrierEntry | null> {
    return (
      this.barriers.find(
        (b) =>
          b.resource_name === resourceName &&
          b.command_type === compatibleCommandType &&
          b.workflow_instance_id === workflowInstanceId &&
          !b.matched_with,
      ) ?? null
    );
  }

  clear(): void {
    this.barriers = [];
  }
}

// ---------------------------------------------------------------------------
// InMemoryExecutionLogger
// ---------------------------------------------------------------------------

export class InMemoryExecutionLogger implements IExecutionLogger {
  private entries: ExecutionLogEntry[] = [];

  async log(entry: ExecutionLogEntry): Promise<void> {
    this.entries.push({ ...entry });
  }

  async getByWorkflow(workflowInstanceId: string): Promise<ExecutionLogEntry[]> {
    return this.entries.filter((e) => e.workflow_instance_id === workflowInstanceId);
  }

  getAll(): ExecutionLogEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
  }
}

// ---------------------------------------------------------------------------
// TestIdGenerator
// ---------------------------------------------------------------------------

export class TestIdGenerator implements IIdGenerator {
  private counter = 0;

  generateId(): string {
    this.counter++;
    return `test-id-${this.counter}`;
  }

  reset(): void {
    this.counter = 0;
  }
}
