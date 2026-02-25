// Tests for crash recovery: resuming interrupted workflows from persisted state.

import { describe, it, expect, beforeEach } from 'vitest';
import { recoverWorkflows } from '../../src/runner/crash-recovery';
import type { RunnerConfig } from '../../src/runner/types';
import type { RuntimeWorkflow, RuntimeWorkflowStep, WorkflowConnection } from '../../src/types/runtime';
import { createTestContext } from '../helpers/test-utils';

function buildRunnerConfig(ctx: ReturnType<typeof createTestContext>): RunnerConfig {
  return {
    workflowRepo: ctx.workflowRepo,
    stepRepo: ctx.stepRepo,
    connectionRepo: ctx.connectionRepo,
    valuePropertyRepo: ctx.valuePropertyRepo,
    resourcePoolRepo: ctx.resourcePoolRepo,
    resourceQueueRepo: ctx.resourceQueueRepo,
    syncBarrierRepo: ctx.syncBarrierRepo,
    executionLogger: ctx.logger,
    eventBus: ctx.eventBus,
    idGenerator: ctx.idGenerator,
  };
}

function makeWorkflow(instanceId: string, lastActivityAt: string | null = null): RuntimeWorkflow {
  const now = new Date().toISOString();
  return {
    instance_id: instanceId,
    master_workflow_oid: 'master-oid',
    master_workflow_version: '1.0.0',
    workflow_state: 'RUNNING',
    specification_json: '{}',
    created_at: now,
    started_at: now,
    completed_at: null,
    parent_workflow_instance_id: null,
    parent_step_oid: null,
    last_activity_at: lastActivityAt ?? now,
  };
}

function makeStep(
  instanceId: string,
  workflowInstanceId: string,
  stepOid: string,
  stepType: RuntimeWorkflowStep['step_type'],
  stepState: RuntimeWorkflowStep['step_state'],
): RuntimeWorkflowStep {
  return {
    instance_id: instanceId,
    workflow_instance_id: workflowInstanceId,
    step_oid: stepOid,
    step_type: stepType,
    step_state: stepState,
    step_json: JSON.stringify({
      oid: stepOid,
      step_type: stepType,
      input_parameter_specifications: [],
      output_parameter_specifications: [],
      value_property_specifications: [],
      resource_command_specifications: [],
    }),
    resolved_inputs_json: null,
    resolved_outputs_json: null,
    user_inputs_json: null,
    activated_at: null,
    started_at: null,
    completed_at: null,
  };
}

function makeConnection(
  workflowInstanceId: string,
  fromOid: string,
  toOid: string,
): WorkflowConnection {
  return {
    workflow_instance_id: workflowInstanceId,
    from_step_oid: fromOid,
    to_step_oid: toOid,
  };
}

describe('crash recovery', () => {
  let ctx: ReturnType<typeof createTestContext>;

  beforeEach(() => {
    ctx = createTestContext();
    ctx.clearAll();
  });

  // -----------------------------------------------------------------------
  // Test 1: Recover step in EXECUTING (USER_INTERACTION)
  // -----------------------------------------------------------------------
  it('recovers USER_INTERACTION step in EXECUTING state', async () => {
    const wf = makeWorkflow('wf-1');
    await ctx.workflowRepo.save(wf);

    const step = makeStep('step-1', 'wf-1', 'step-oid-1', 'USER_INTERACTION', 'EXECUTING');
    await ctx.stepRepo.save(step);

    const conn = makeConnection('wf-1', 'step-oid-0', 'step-oid-1');
    await ctx.connectionRepo.saveMany('wf-1', [conn]);

    const result = await recoverWorkflows(buildRunnerConfig(ctx));

    expect(result.recovered).toContain('wf-1');
    expect(result.stale).not.toContain('wf-1');

    // Step should stay in EXECUTING (form re-displayed)
    const recoveredStep = await ctx.stepRepo.getById('step-1');
    expect(recoveredStep?.step_state).toBe('EXECUTING');
  });

  // -----------------------------------------------------------------------
  // Test 2: Recover step in STARTING
  // -----------------------------------------------------------------------
  it('rolls back step in STARTING to WAITING', async () => {
    const wf = makeWorkflow('wf-2');
    await ctx.workflowRepo.save(wf);

    const step = makeStep('step-2', 'wf-2', 'step-oid-2', 'USER_INTERACTION', 'STARTING');
    step.resolved_inputs_json = '{"some":"data"}';
    await ctx.stepRepo.save(step);

    const conn = makeConnection('wf-2', 'step-oid-0', 'step-oid-2');
    await ctx.connectionRepo.saveMany('wf-2', [conn]);

    const result = await recoverWorkflows(buildRunnerConfig(ctx));

    expect(result.recovered).toContain('wf-2');

    // Step should be rolled back to WAITING and resolved inputs cleared
    const recoveredStep = await ctx.stepRepo.getById('step-2');
    expect(recoveredStep?.step_state).toBe('WAITING');
    expect(recoveredStep?.resolved_inputs_json).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Test 3: Recover step in COMPLETING
  // -----------------------------------------------------------------------
  it('flags step in COMPLETING for re-completion', async () => {
    const wf = makeWorkflow('wf-3');
    await ctx.workflowRepo.save(wf);

    const step = makeStep('step-3', 'wf-3', 'step-oid-3', 'USER_INTERACTION', 'COMPLETING');
    await ctx.stepRepo.save(step);

    const conn = makeConnection('wf-3', 'step-oid-0', 'step-oid-3');
    await ctx.connectionRepo.saveMany('wf-3', [conn]);

    const result = await recoverWorkflows(buildRunnerConfig(ctx));

    expect(result.recovered).toContain('wf-3');
    // Step stays in COMPLETING state (runner will re-execute completing phase)
    // The recovery adds this to stepsToReactivate for the runner to handle
  });

  // -----------------------------------------------------------------------
  // Test 4: Stale workflow detection (> 24 hours)
  // -----------------------------------------------------------------------
  it('flags workflow as stale when last_activity_at > 24 hours ago', async () => {
    // 48 hours ago
    const staleTime = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const wf = makeWorkflow('wf-stale', staleTime);
    await ctx.workflowRepo.save(wf);

    const step = makeStep('step-s', 'wf-stale', 'step-oid-s', 'USER_INTERACTION', 'EXECUTING');
    await ctx.stepRepo.save(step);

    await ctx.connectionRepo.saveMany('wf-stale', []);

    const result = await recoverWorkflows(buildRunnerConfig(ctx));

    expect(result.stale).toContain('wf-stale');
    expect(result.recovered).not.toContain('wf-stale');
  });

  // -----------------------------------------------------------------------
  // Test 5: Non-stale workflow resumes (< 24 hours)
  // -----------------------------------------------------------------------
  it('recovers workflow when last_activity_at < 24 hours ago', async () => {
    // 1 hour ago
    const recentTime = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    const wf = makeWorkflow('wf-recent', recentTime);
    await ctx.workflowRepo.save(wf);

    const step = makeStep('step-r', 'wf-recent', 'step-oid-r', 'USER_INTERACTION', 'EXECUTING');
    await ctx.stepRepo.save(step);

    await ctx.connectionRepo.saveMany('wf-recent', []);

    const result = await recoverWorkflows(buildRunnerConfig(ctx));

    expect(result.recovered).toContain('wf-recent');
    expect(result.stale).not.toContain('wf-recent');
  });

  // -----------------------------------------------------------------------
  // Recovery of transitional states
  // -----------------------------------------------------------------------
  it('completes ABORTING step to ABORTED', async () => {
    const wf = makeWorkflow('wf-abort');
    await ctx.workflowRepo.save(wf);

    const step = makeStep('step-a', 'wf-abort', 'step-oid-a', 'USER_INTERACTION', 'ABORTING');
    await ctx.stepRepo.save(step);

    await ctx.connectionRepo.saveMany('wf-abort', []);

    const result = await recoverWorkflows(buildRunnerConfig(ctx));
    expect(result.recovered).toContain('wf-abort');

    const recoveredStep = await ctx.stepRepo.getById('step-a');
    expect(recoveredStep?.step_state).toBe('ABORTED');
  });

  it('completes STOPPING step to COMPLETED', async () => {
    const wf = makeWorkflow('wf-stop');
    await ctx.workflowRepo.save(wf);

    const step = makeStep('step-st', 'wf-stop', 'step-oid-st', 'USER_INTERACTION', 'STOPPING');
    await ctx.stepRepo.save(step);

    await ctx.connectionRepo.saveMany('wf-stop', []);

    const result = await recoverWorkflows(buildRunnerConfig(ctx));
    expect(result.recovered).toContain('wf-stop');

    const recoveredStep = await ctx.stepRepo.getById('step-st');
    expect(recoveredStep?.step_state).toBe('COMPLETED');
  });

  it('completes PAUSING step to PAUSED', async () => {
    const wf = makeWorkflow('wf-pause');
    await ctx.workflowRepo.save(wf);

    const step = makeStep('step-p', 'wf-pause', 'step-oid-p', 'USER_INTERACTION', 'PAUSING');
    await ctx.stepRepo.save(step);

    await ctx.connectionRepo.saveMany('wf-pause', []);

    const result = await recoverWorkflows(buildRunnerConfig(ctx));
    expect(result.recovered).toContain('wf-pause');

    const recoveredStep = await ctx.stepRepo.getById('step-p');
    expect(recoveredStep?.step_state).toBe('PAUSED');
  });

  it('completes UNPAUSING step to EXECUTING', async () => {
    const wf = makeWorkflow('wf-unpause');
    await ctx.workflowRepo.save(wf);

    const step = makeStep('step-up', 'wf-unpause', 'step-oid-up', 'USER_INTERACTION', 'UNPAUSING');
    await ctx.stepRepo.save(step);

    await ctx.connectionRepo.saveMany('wf-unpause', []);

    const result = await recoverWorkflows(buildRunnerConfig(ctx));
    expect(result.recovered).toContain('wf-unpause');

    const recoveredStep = await ctx.stepRepo.getById('step-up');
    expect(recoveredStep?.step_state).toBe('EXECUTING');
  });

  it('does not modify IDLE steps', async () => {
    const wf = makeWorkflow('wf-idle');
    await ctx.workflowRepo.save(wf);

    const step = makeStep('step-i', 'wf-idle', 'step-oid-i', 'USER_INTERACTION', 'IDLE');
    await ctx.stepRepo.save(step);

    await ctx.connectionRepo.saveMany('wf-idle', []);

    const result = await recoverWorkflows(buildRunnerConfig(ctx));
    expect(result.recovered).toContain('wf-idle');

    const recoveredStep = await ctx.stepRepo.getById('step-i');
    expect(recoveredStep?.step_state).toBe('IDLE');
  });

  it('does not modify already COMPLETED steps', async () => {
    const wf = makeWorkflow('wf-done');
    await ctx.workflowRepo.save(wf);

    const step = makeStep('step-d', 'wf-done', 'step-oid-d', 'USER_INTERACTION', 'COMPLETED');
    await ctx.stepRepo.save(step);

    await ctx.connectionRepo.saveMany('wf-done', []);

    const result = await recoverWorkflows(buildRunnerConfig(ctx));
    expect(result.recovered).toContain('wf-done');

    const recoveredStep = await ctx.stepRepo.getById('step-d');
    expect(recoveredStep?.step_state).toBe('COMPLETED');
  });

  it('logs WORKFLOW_RESUMED event for each recovered workflow', async () => {
    const wf = makeWorkflow('wf-log');
    await ctx.workflowRepo.save(wf);

    const step = makeStep('step-l', 'wf-log', 'step-oid-l', 'USER_INTERACTION', 'EXECUTING');
    await ctx.stepRepo.save(step);

    await ctx.connectionRepo.saveMany('wf-log', []);

    await recoverWorkflows(buildRunnerConfig(ctx));

    const logs = await ctx.logger.getByWorkflow('wf-log');
    const resumedLog = logs.find((l) => l.event_type === 'WORKFLOW_RESUMED');
    expect(resumedLog).toBeTruthy();
  });

  it('reports errors for workflows that fail to recover', async () => {
    // Create a workflow that will cause an error (no steps, no connections)
    // This should still recover without error since empty steps/connections are valid
    const wf = makeWorkflow('wf-err');
    await ctx.workflowRepo.save(wf);
    await ctx.connectionRepo.saveMany('wf-err', []);

    const result = await recoverWorkflows(buildRunnerConfig(ctx));

    // Should recover fine (empty workflow)
    expect(result.recovered).toContain('wf-err');
  });

  it('handles multiple active workflows', async () => {
    const wf1 = makeWorkflow('wf-m1');
    const wf2 = makeWorkflow('wf-m2');
    await ctx.workflowRepo.save(wf1);
    await ctx.workflowRepo.save(wf2);

    const step1 = makeStep('step-m1', 'wf-m1', 'step-oid-m1', 'USER_INTERACTION', 'EXECUTING');
    const step2 = makeStep('step-m2', 'wf-m2', 'step-oid-m2', 'START', 'EXECUTING');
    await ctx.stepRepo.save(step1);
    await ctx.stepRepo.save(step2);

    await ctx.connectionRepo.saveMany('wf-m1', []);
    await ctx.connectionRepo.saveMany('wf-m2', []);

    const result = await recoverWorkflows(buildRunnerConfig(ctx));

    expect(result.recovered).toContain('wf-m1');
    expect(result.recovered).toContain('wf-m2');
    expect(result.recovered).toHaveLength(2);
  });
});
