// Tests for lifecycle functions: createRuntimeWorkflow, completeWorkflow, abortWorkflow.

import { describe, it, expect, beforeEach } from 'vitest';
import { createRuntimeWorkflow, completeWorkflow, abortWorkflow } from '../../src/runner/lifecycle';
import { makeLinearWorkflow, makeParallelWorkflow } from '../helpers/fixtures';
import { createTestContext } from '../helpers/test-utils';

describe('createRuntimeWorkflow', () => {
  const ctx = createTestContext();

  beforeEach(() => {
    ctx.clearAll();
  });

  it('produces a workflow with unique instance_id', () => {
    const masterSpec = makeLinearWorkflow(1);
    const result = createRuntimeWorkflow(masterSpec, ctx.idGenerator);

    expect(result.workflow.instance_id).toBe('test-id-1');
    expect(result.workflow.workflow_state).toBe('IDLE');
    expect(result.workflow.master_workflow_oid).toBe(masterSpec.oid);
    expect(result.workflow.master_workflow_version).toBe(masterSpec.version);
  });

  it('creates runtime steps with unique instance_ids for each step', () => {
    const masterSpec = makeLinearWorkflow(2);
    const result = createRuntimeWorkflow(masterSpec, ctx.idGenerator);

    // START + 2 UI steps + END = 4 steps
    expect(result.steps).toHaveLength(4);

    // Each step should have a unique instance_id
    const instanceIds = result.steps.map((s) => s.instance_id);
    const uniqueIds = new Set(instanceIds);
    expect(uniqueIds.size).toBe(4);
  });

  it('creates all steps in IDLE state', () => {
    const masterSpec = makeLinearWorkflow(2);
    const result = createRuntimeWorkflow(masterSpec, ctx.idGenerator);

    for (const step of result.steps) {
      expect(step.step_state).toBe('IDLE');
    }
  });

  it('preserves step types from master spec', () => {
    const masterSpec = makeParallelWorkflow();
    const result = createRuntimeWorkflow(masterSpec, ctx.idGenerator);

    const stepTypes = result.steps.map((s) => s.step_type);
    expect(stepTypes).toContain('START');
    expect(stepTypes).toContain('PARALLEL');
    expect(stepTypes).toContain('WAIT_ALL');
    expect(stepTypes).toContain('END');
    expect(stepTypes).toContain('USER_INTERACTION');
  });

  it('deep copies spec so modifications do not affect original', () => {
    const masterSpec = makeLinearWorkflow(1);
    const originalStepOid = masterSpec.steps[0].oid;

    const result = createRuntimeWorkflow(masterSpec, ctx.idGenerator);

    // Modify the runtime step_json
    const stepJsonObj = JSON.parse(result.steps[0].step_json);
    stepJsonObj.oid = 'mutated-oid';

    // Original should be unaffected
    expect(masterSpec.steps[0].oid).toBe(originalStepOid);
  });

  it('copies connections to runtime format', () => {
    const masterSpec = makeLinearWorkflow(2);
    const result = createRuntimeWorkflow(masterSpec, ctx.idGenerator);

    // START -> UI1 -> UI2 -> END = 3 connections
    expect(result.connections).toHaveLength(3);

    // Verify connection fields
    for (const conn of result.connections) {
      expect(conn.workflow_instance_id).toBe(result.workflow.instance_id);
      expect(conn.from_step_oid).toBeTruthy();
      expect(conn.to_step_oid).toBeTruthy();
    }
  });

  it('stores specification_json on the workflow', () => {
    const masterSpec = makeLinearWorkflow(1);
    const result = createRuntimeWorkflow(masterSpec, ctx.idGenerator);

    const storedSpec = JSON.parse(result.workflow.specification_json);
    expect(storedSpec.oid).toBe(masterSpec.oid);
    expect(storedSpec.steps).toHaveLength(masterSpec.steps.length);
  });

  it('sets created_at and last_activity_at timestamps', () => {
    const masterSpec = makeLinearWorkflow(1);
    const result = createRuntimeWorkflow(masterSpec, ctx.idGenerator);

    expect(result.workflow.created_at).toBeTruthy();
    expect(result.workflow.last_activity_at).toBeTruthy();
    // Verify ISO 8601 format
    expect(() => new Date(result.workflow.created_at)).not.toThrow();
  });

  it('sets parent fields to null for top-level workflows', () => {
    const masterSpec = makeLinearWorkflow(1);
    const result = createRuntimeWorkflow(masterSpec, ctx.idGenerator);

    expect(result.workflow.parent_workflow_instance_id).toBeNull();
    expect(result.workflow.parent_step_oid).toBeNull();
  });
});

describe('completeWorkflow', () => {
  const ctx = createTestContext();

  beforeEach(() => {
    ctx.clearAll();
  });

  it('sets workflow state to COMPLETED with completed_at timestamp', async () => {
    const masterSpec = makeLinearWorkflow(1);
    const result = createRuntimeWorkflow(masterSpec, ctx.idGenerator);
    await ctx.workflowRepo.save(result.workflow);

    await completeWorkflow(
      result.workflow.instance_id,
      ctx.workflowRepo,
      ctx.valuePropertyRepo,
      ctx.resourcePoolRepo,
      ctx.logger,
    );

    const workflow = await ctx.workflowRepo.getById(result.workflow.instance_id);
    expect(workflow?.workflow_state).toBe('COMPLETED');
    expect(workflow?.completed_at).toBeTruthy();
  });

  it('deletes workflow Value Properties (PERS-04)', async () => {
    const masterSpec = makeLinearWorkflow(1);
    const result = createRuntimeWorkflow(masterSpec, ctx.idGenerator);
    await ctx.workflowRepo.save(result.workflow);

    // Initialize a value property
    await ctx.valuePropertyRepo.initializeFromSpec('workflow', result.workflow.instance_id, [
      { name: 'TestProp', entries: [{ name: 'Value', value: 'test' }] },
    ]);

    // Verify it exists
    const propBefore = await ctx.valuePropertyRepo.getWorkflowProperty(result.workflow.instance_id, 'TestProp');
    expect(propBefore).not.toBeNull();

    // Complete workflow
    await completeWorkflow(
      result.workflow.instance_id,
      ctx.workflowRepo,
      ctx.valuePropertyRepo,
      ctx.resourcePoolRepo,
      ctx.logger,
    );

    // Value properties should be deleted
    const propAfter = await ctx.valuePropertyRepo.getWorkflowProperty(result.workflow.instance_id, 'TestProp');
    expect(propAfter).toBeNull();
  });

  it('logs WORKFLOW_COMPLETED event', async () => {
    const masterSpec = makeLinearWorkflow(1);
    const result = createRuntimeWorkflow(masterSpec, ctx.idGenerator);
    await ctx.workflowRepo.save(result.workflow);

    await completeWorkflow(
      result.workflow.instance_id,
      ctx.workflowRepo,
      ctx.valuePropertyRepo,
      ctx.resourcePoolRepo,
      ctx.logger,
    );

    const logs = await ctx.logger.getByWorkflow(result.workflow.instance_id);
    const completedLog = logs.find((l) => l.event_type === 'WORKFLOW_COMPLETED');
    expect(completedLog).toBeTruthy();
  });
});

describe('abortWorkflow', () => {
  const ctx = createTestContext();

  beforeEach(() => {
    ctx.clearAll();
  });

  it('sets workflow state to ABORTED', async () => {
    const masterSpec = makeLinearWorkflow(1);
    const result = createRuntimeWorkflow(masterSpec, ctx.idGenerator);
    await ctx.workflowRepo.save(result.workflow);

    await abortWorkflow(
      result.workflow.instance_id,
      ctx.workflowRepo,
      ctx.valuePropertyRepo,
      ctx.resourcePoolRepo,
      ctx.logger,
    );

    const workflow = await ctx.workflowRepo.getById(result.workflow.instance_id);
    expect(workflow?.workflow_state).toBe('ABORTED');
  });

  it('logs WORKFLOW_ABORTED event', async () => {
    const masterSpec = makeLinearWorkflow(1);
    const result = createRuntimeWorkflow(masterSpec, ctx.idGenerator);
    await ctx.workflowRepo.save(result.workflow);

    await abortWorkflow(
      result.workflow.instance_id,
      ctx.workflowRepo,
      ctx.valuePropertyRepo,
      ctx.resourcePoolRepo,
      ctx.logger,
    );

    const logs = await ctx.logger.getByWorkflow(result.workflow.instance_id);
    const abortedLog = logs.find((l) => l.event_type === 'WORKFLOW_ABORTED');
    expect(abortedLog).toBeTruthy();
  });
});
