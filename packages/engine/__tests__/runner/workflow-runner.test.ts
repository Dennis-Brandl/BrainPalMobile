// Integration tests for WorkflowRunner: the culmination of the engine.
// Tests linear workflow execution, parallel branching, SELECT 1 conditions,
// event queue serialization, execution logging, abort, and pause/resume.

import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowRunner } from '../../src/runner/workflow-runner';
import type { RunnerConfig } from '../../src/runner/types';
import type { EngineEventMap } from '../../src/types/events';
import { makeLinearWorkflow, makeParallelWorkflow, makeSelect1Workflow, makeWorkflowProxyWorkflow, CHILD_WORKFLOW_STEP_OIDS } from '../helpers/fixtures';
import { createTestContext, waitForEvent } from '../helpers/test-utils';

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

describe('WorkflowRunner', () => {
  let ctx: ReturnType<typeof createTestContext>;
  let runner: WorkflowRunner;

  beforeEach(() => {
    ctx = createTestContext();
    ctx.clearAll();
    runner = new WorkflowRunner(buildRunnerConfig(ctx));
  });

  // -----------------------------------------------------------------------
  // Test 1: Linear workflow execution (START -> USER_INTERACTION -> END)
  // -----------------------------------------------------------------------
  describe('linear workflow execution', () => {
    it('executes START -> USER_INTERACTION -> END to completion', async () => {
      const spec = makeLinearWorkflow(1);
      const wfId = await runner.createWorkflow(spec);

      // Start the workflow
      await runner.startWorkflow(wfId);

      // After starting, the START step should have auto-completed.
      // The USER_INTERACTION step should be in EXECUTING (waiting for input).
      const steps = await ctx.stepRepo.getByWorkflow(wfId);
      const startStep = steps.find((s) => s.step_type === 'START')!;
      const uiStep = steps.find((s) => s.step_type === 'USER_INTERACTION')!;
      const endStep = steps.find((s) => s.step_type === 'END')!;

      expect(startStep.step_state).toBe('COMPLETED');
      expect(uiStep.step_state).toBe('EXECUTING');
      expect(endStep.step_state).toBe('IDLE');

      // Submit user input
      await runner.submitUserInput(uiStep.instance_id, { 'input-1': 'hello' });

      // After user input, USER_INTERACTION should complete, then END auto-completes.
      const stepsAfter = await ctx.stepRepo.getByWorkflow(wfId);
      const uiStepAfter = stepsAfter.find((s) => s.step_type === 'USER_INTERACTION')!;
      const endStepAfter = stepsAfter.find((s) => s.step_type === 'END')!;

      expect(uiStepAfter.step_state).toBe('COMPLETED');
      expect(endStepAfter.step_state).toBe('COMPLETED');

      // Workflow should be COMPLETED
      const workflow = await ctx.workflowRepo.getById(wfId);
      expect(workflow?.workflow_state).toBe('COMPLETED');
    });

    it('stores user input on the step', async () => {
      const spec = makeLinearWorkflow(1);
      const wfId = await runner.createWorkflow(spec);
      await runner.startWorkflow(wfId);

      const steps = await ctx.stepRepo.getByWorkflow(wfId);
      const uiStep = steps.find((s) => s.step_type === 'USER_INTERACTION')!;

      await runner.submitUserInput(uiStep.instance_id, { 'input-1': 'test data' });

      const updatedStep = await ctx.stepRepo.getById(uiStep.instance_id);
      expect(updatedStep?.user_inputs_json).toBeTruthy();
      const inputs = JSON.parse(updatedStep!.user_inputs_json!);
      expect(inputs['input-1']).toBe('test data');
    });

    it('deletes workflow Value Properties after completion (PERS-04)', async () => {
      const spec = makeLinearWorkflow(1);
      // Add a value property to the spec
      spec.value_property_specifications = [
        { name: 'TestProp', entries: [{ name: 'Value', value: 'initial' }] },
      ];

      const wfId = await runner.createWorkflow(spec);

      // Verify property was initialized
      const propBefore = await ctx.valuePropertyRepo.getWorkflowProperty(wfId, 'TestProp');
      expect(propBefore).not.toBeNull();

      await runner.startWorkflow(wfId);

      const steps = await ctx.stepRepo.getByWorkflow(wfId);
      const uiStep = steps.find((s) => s.step_type === 'USER_INTERACTION')!;
      await runner.submitUserInput(uiStep.instance_id, { 'input-1': 'done' });

      // After completion, value properties should be deleted
      const propAfter = await ctx.valuePropertyRepo.getWorkflowProperty(wfId, 'TestProp');
      expect(propAfter).toBeNull();
    });

    it('emits USER_INPUT_REQUIRED event when step waits for input', async () => {
      const spec = makeLinearWorkflow(1);
      const wfId = await runner.createWorkflow(spec);

      let userInputEvent: EngineEventMap['USER_INPUT_REQUIRED'] | null = null;
      ctx.eventBus.on('USER_INPUT_REQUIRED', (data) => {
        userInputEvent = data;
      });

      await runner.startWorkflow(wfId);

      expect(userInputEvent).not.toBeNull();
      expect(userInputEvent!.workflowInstanceId).toBe(wfId);
    });

    it('transitions START step through IDLE -> WAITING -> STARTING -> EXECUTING -> COMPLETING -> COMPLETED', async () => {
      const spec = makeLinearWorkflow(1);
      const wfId = await runner.createWorkflow(spec);

      // Track state changes
      const stateChanges: Array<{ stepOid: string; fromState: string; toState: string }> = [];
      ctx.eventBus.on('STEP_STATE_CHANGED', (data) => {
        stateChanges.push({
          stepOid: data.stepOid,
          fromState: data.fromState,
          toState: data.toState,
        });
      });

      await runner.startWorkflow(wfId);

      // Find START step state changes
      const startChanges = stateChanges.filter((c) => c.stepOid === 'step-start');
      const startStates = startChanges.map((c) => c.toState);
      expect(startStates).toContain('WAITING');
      expect(startStates).toContain('STARTING');
      expect(startStates).toContain('EXECUTING');
      expect(startStates).toContain('COMPLETING');
      expect(startStates).toContain('COMPLETED');
    });
  });

  // -----------------------------------------------------------------------
  // Test 2: Parallel workflow execution
  // -----------------------------------------------------------------------
  describe('parallel workflow execution', () => {
    it('executes PARALLEL fork and WAIT_ALL join', async () => {
      const spec = makeParallelWorkflow();
      const wfId = await runner.createWorkflow(spec);
      await runner.startWorkflow(wfId);

      // After start, START and PARALLEL should auto-complete.
      // Both branch A step 1 and branch B step 1 should be in EXECUTING.
      const steps = await ctx.stepRepo.getByWorkflow(wfId);
      const stepA1 = steps.find((s) => s.step_oid === 'step-a1')!;
      const stepB1 = steps.find((s) => s.step_oid === 'step-b1')!;
      const waitAll = steps.find((s) => s.step_oid === 'step-wait-all')!;

      expect(stepA1.step_state).toBe('EXECUTING');
      expect(stepB1.step_state).toBe('EXECUTING');
      expect(waitAll.step_state).toBe('IDLE');

      // Complete branch A step 1
      await runner.submitUserInput(stepA1.instance_id, {});

      // Branch A step 2 should now be EXECUTING
      const stepsAfterA1 = await ctx.stepRepo.getByWorkflow(wfId);
      const stepA2 = stepsAfterA1.find((s) => s.step_oid === 'step-a2')!;
      expect(stepA2.step_state).toBe('EXECUTING');

      // WAIT_ALL should still be IDLE (branch B not done)
      const waitAllMid = stepsAfterA1.find((s) => s.step_oid === 'step-wait-all')!;
      expect(waitAllMid.step_state).toBe('IDLE');

      // Complete branch A step 2
      await runner.submitUserInput(stepA2.instance_id, {});

      // WAIT_ALL still not activated (branch B still executing)
      const stepsAfterA2 = await ctx.stepRepo.getByWorkflow(wfId);
      const waitAllAfterA2 = stepsAfterA2.find((s) => s.step_oid === 'step-wait-all')!;
      expect(waitAllAfterA2.step_state).toBe('IDLE');

      // Complete branch B step 1
      await runner.submitUserInput(stepB1.instance_id, {});

      // NOW WAIT_ALL should activate and auto-complete, followed by END
      const stepsAfterB1 = await ctx.stepRepo.getByWorkflow(wfId);
      const waitAllFinal = stepsAfterB1.find((s) => s.step_oid === 'step-wait-all')!;
      const endStep = stepsAfterB1.find((s) => s.step_oid === 'step-end')!;

      expect(waitAllFinal.step_state).toBe('COMPLETED');
      expect(endStep.step_state).toBe('COMPLETED');

      // Workflow should be COMPLETED
      const workflow = await ctx.workflowRepo.getById(wfId);
      expect(workflow?.workflow_state).toBe('COMPLETED');
    });

    it('activates BOTH parallel branches simultaneously', async () => {
      const spec = makeParallelWorkflow();
      const wfId = await runner.createWorkflow(spec);

      const activatedSteps: string[] = [];
      ctx.eventBus.on('USER_INPUT_REQUIRED', (data) => {
        activatedSteps.push(data.stepOid);
      });

      await runner.startWorkflow(wfId);

      // Both branch steps should have been activated
      expect(activatedSteps).toContain('step-a1');
      expect(activatedSteps).toContain('step-b1');
    });
  });

  // -----------------------------------------------------------------------
  // Test 3: SELECT 1 branching
  // -----------------------------------------------------------------------
  describe('SELECT 1 branching', () => {
    it('follows the correct branch based on condition evaluation', async () => {
      const spec = makeSelect1Workflow(3);
      const wfId = await runner.createWorkflow(spec);
      await runner.startWorkflow(wfId);

      // START auto-completes, then step-input (USER_INTERACTION) waits
      const steps = await ctx.stepRepo.getByWorkflow(wfId);
      const inputStep = steps.find((s) => s.step_oid === 'step-input')!;
      expect(inputStep.step_state).toBe('EXECUTING');

      // Submit input that should match the SECOND condition (value "2")
      await runner.submitUserInput(inputStep.instance_id, { 'user-choice': '2' });

      // The SELECT_1 step should have evaluated and followed branch 2
      const stepsAfterSelect = await ctx.stepRepo.getByWorkflow(wfId);

      const branch1 = stepsAfterSelect.find((s) => s.step_oid === 'step-branch-1')!;
      const branch2 = stepsAfterSelect.find((s) => s.step_oid === 'step-branch-2')!;
      const branch3 = stepsAfterSelect.find((s) => s.step_oid === 'step-branch-3')!;

      // Branch 2 should be EXECUTING (activated), others should be IDLE (not activated)
      expect(branch2.step_state).toBe('EXECUTING');
      expect(branch1.step_state).toBe('IDLE');
      expect(branch3.step_state).toBe('IDLE');
    });
  });

  // -----------------------------------------------------------------------
  // Test 4: Event queue serialization (race condition prevention)
  // -----------------------------------------------------------------------
  describe('event queue serialization', () => {
    it('prevents double-activation of WAIT_ALL when parallel branches complete', async () => {
      const spec = makeParallelWorkflow();
      const wfId = await runner.createWorkflow(spec);
      await runner.startWorkflow(wfId);

      // Get branch steps
      const steps = await ctx.stepRepo.getByWorkflow(wfId);
      const stepA1 = steps.find((s) => s.step_oid === 'step-a1')!;
      const stepA2 = steps.find((s) => s.step_oid === 'step-a2')!;
      const stepB1 = steps.find((s) => s.step_oid === 'step-b1')!;

      // Complete branch A (both steps)
      await runner.submitUserInput(stepA1.instance_id, {});
      await runner.submitUserInput(stepA2.instance_id, {});

      // Complete branch B
      await runner.submitUserInput(stepB1.instance_id, {});

      // WAIT_ALL should have been activated exactly once.
      // Verify by checking it reached COMPLETED (if double-activated, the
      // second activation would throw because the step is no longer IDLE).
      const stepsAfter = await ctx.stepRepo.getByWorkflow(wfId);
      const waitAll = stepsAfter.find((s) => s.step_oid === 'step-wait-all')!;
      expect(waitAll.step_state).toBe('COMPLETED');

      // Verify workflow completed successfully (would fail if double-activation caused error)
      const workflow = await ctx.workflowRepo.getById(wfId);
      expect(workflow?.workflow_state).toBe('COMPLETED');
    });
  });

  // -----------------------------------------------------------------------
  // Test 5: Execution logging completeness
  // -----------------------------------------------------------------------
  describe('execution logging', () => {
    it('captures all major events for a complete workflow run', async () => {
      const spec = makeLinearWorkflow(1);
      const wfId = await runner.createWorkflow(spec);
      await runner.startWorkflow(wfId);

      const steps = await ctx.stepRepo.getByWorkflow(wfId);
      const uiStep = steps.find((s) => s.step_type === 'USER_INTERACTION')!;
      await runner.submitUserInput(uiStep.instance_id, { 'input-1': 'test' });

      const logs = await ctx.logger.getByWorkflow(wfId);
      const eventTypes = logs.map((l) => l.event_type);

      expect(eventTypes).toContain('WORKFLOW_CREATED');
      expect(eventTypes).toContain('WORKFLOW_STARTED');
      expect(eventTypes).toContain('STEP_STATE_CHANGED');
      expect(eventTypes).toContain('SCHEDULER_ACTIVATED_STEPS');
      expect(eventTypes).toContain('WORKFLOW_COMPLETED');
    });

    it('logs USER_INPUT_SUBMITTED with form data', async () => {
      const spec = makeLinearWorkflow(1);
      const wfId = await runner.createWorkflow(spec);
      await runner.startWorkflow(wfId);

      const steps = await ctx.stepRepo.getByWorkflow(wfId);
      const uiStep = steps.find((s) => s.step_type === 'USER_INTERACTION')!;
      await runner.submitUserInput(uiStep.instance_id, { 'input-1': 'test data' });

      const logs = await ctx.logger.getByWorkflow(wfId);
      const userInputLog = logs.find((l) => l.event_type === 'USER_INPUT_SUBMITTED');

      expect(userInputLog).toBeTruthy();
      const data = JSON.parse(userInputLog!.event_data_json);
      expect(data['input-1']).toBe('test data');
    });

    it('logs have ISO 8601 timestamps', async () => {
      const spec = makeLinearWorkflow(1);
      const wfId = await runner.createWorkflow(spec);
      await runner.startWorkflow(wfId);

      const logs = await ctx.logger.getByWorkflow(wfId);
      expect(logs.length).toBeGreaterThan(0);

      for (const log of logs) {
        const date = new Date(log.timestamp);
        expect(date.getTime()).not.toBeNaN();
        // ISO 8601 check: should contain T and Z or timezone offset
        expect(log.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Test 6: Abort workflow
  // -----------------------------------------------------------------------
  describe('abort workflow', () => {
    it('aborts active steps and sets workflow state to ABORTED', async () => {
      const spec = makeLinearWorkflow(1);
      const wfId = await runner.createWorkflow(spec);
      await runner.startWorkflow(wfId);

      // UI step should be in EXECUTING
      const stepsBefore = await ctx.stepRepo.getByWorkflow(wfId);
      const uiStep = stepsBefore.find((s) => s.step_type === 'USER_INTERACTION')!;
      expect(uiStep.step_state).toBe('EXECUTING');

      // Abort
      await runner.abort(wfId);

      // UI step should be ABORTED
      const stepsAfter = await ctx.stepRepo.getByWorkflow(wfId);
      const uiStepAfter = stepsAfter.find((s) => s.step_type === 'USER_INTERACTION')!;
      expect(uiStepAfter.step_state).toBe('ABORTED');

      // Workflow should be ABORTED
      const workflow = await ctx.workflowRepo.getById(wfId);
      expect(workflow?.workflow_state).toBe('ABORTED');
    });

    it('emits WORKFLOW_ABORTED event', async () => {
      const spec = makeLinearWorkflow(1);
      const wfId = await runner.createWorkflow(spec);
      await runner.startWorkflow(wfId);

      let abortedEvent: EngineEventMap['WORKFLOW_ABORTED'] | null = null;
      ctx.eventBus.on('WORKFLOW_ABORTED', (data) => {
        abortedEvent = data;
      });

      await runner.abort(wfId);

      expect(abortedEvent).not.toBeNull();
      expect(abortedEvent!.workflowInstanceId).toBe(wfId);
    });
  });

  // -----------------------------------------------------------------------
  // Test 7: Pause and resume
  // -----------------------------------------------------------------------
  describe('pause and resume', () => {
    it('pauses EXECUTING steps and resumes them', async () => {
      const spec = makeLinearWorkflow(1);
      const wfId = await runner.createWorkflow(spec);
      await runner.startWorkflow(wfId);

      // UI step should be EXECUTING
      const stepsBefore = await ctx.stepRepo.getByWorkflow(wfId);
      const uiStep = stepsBefore.find((s) => s.step_type === 'USER_INTERACTION')!;
      expect(uiStep.step_state).toBe('EXECUTING');

      // Pause
      await runner.pauseWorkflow(wfId);

      const stepsAfterPause = await ctx.stepRepo.getByWorkflow(wfId);
      const uiStepPaused = stepsAfterPause.find((s) => s.step_type === 'USER_INTERACTION')!;
      expect(uiStepPaused.step_state).toBe('PAUSED');

      // Workflow should be PAUSED
      const workflowPaused = await ctx.workflowRepo.getById(wfId);
      expect(workflowPaused?.workflow_state).toBe('PAUSED');

      // Resume
      await runner.resumeWorkflow(wfId);

      const stepsAfterResume = await ctx.stepRepo.getByWorkflow(wfId);
      const uiStepResumed = stepsAfterResume.find((s) => s.step_type === 'USER_INTERACTION')!;
      expect(uiStepResumed.step_state).toBe('EXECUTING');

      // Workflow should be RUNNING again
      const workflowResumed = await ctx.workflowRepo.getById(wfId);
      expect(workflowResumed?.workflow_state).toBe('RUNNING');
    });
  });

  // -----------------------------------------------------------------------
  // Additional: Multi-step linear workflow
  // -----------------------------------------------------------------------
  describe('multi-step linear workflow', () => {
    it('executes through multiple user interaction steps', async () => {
      const spec = makeLinearWorkflow(3);
      const wfId = await runner.createWorkflow(spec);
      await runner.startWorkflow(wfId);

      for (let i = 1; i <= 3; i++) {
        const steps = await ctx.stepRepo.getByWorkflow(wfId);
        const uiStep = steps.find((s) => s.step_oid === `step-ui-${i}`)!;
        expect(uiStep.step_state).toBe('EXECUTING');

        await runner.submitUserInput(uiStep.instance_id, { [`input-${i}`]: `value-${i}` });
      }

      const workflow = await ctx.workflowRepo.getById(wfId);
      expect(workflow?.workflow_state).toBe('COMPLETED');
    });
  });

  // -----------------------------------------------------------------------
  // Test 8: WORKFLOW_PROXY execution
  // -----------------------------------------------------------------------
  describe('WORKFLOW_PROXY execution', () => {
    it('creates child workflow and completes parent on child completion', async () => {
      const spec = makeWorkflowProxyWorkflow();
      const parentWfId = await runner.createWorkflow(spec);
      await runner.startWorkflow(parentWfId);

      // After starting, START auto-completes, WORKFLOW_PROXY enters EXECUTING.
      // The child workflow is created and started, reaching its USER_INTERACTION step.
      const parentSteps = await ctx.stepRepo.getByWorkflow(parentWfId);
      const proxyStep = parentSteps.find((s) => s.step_type === 'WORKFLOW_PROXY')!;
      expect(proxyStep.step_state).toBe('EXECUTING');
      expect(proxyStep.child_workflow_instance_id).not.toBeNull();

      // Verify child workflow was created with parent references
      const childWfId = proxyStep.child_workflow_instance_id!;
      const childWorkflow = await ctx.workflowRepo.getById(childWfId);
      expect(childWorkflow).not.toBeNull();
      expect(childWorkflow!.parent_workflow_instance_id).toBe(parentWfId);
      expect(childWorkflow!.parent_step_oid).toBe('step-proxy');
      expect(childWorkflow!.workflow_state).toBe('RUNNING');

      // Find the child workflow's USER_INTERACTION step
      const childSteps = await ctx.stepRepo.getByWorkflow(childWfId);
      const childUiStep = childSteps.find((s) => s.step_oid === CHILD_WORKFLOW_STEP_OIDS.userInteraction)!;
      expect(childUiStep.step_state).toBe('EXECUTING');

      // Submit user input for the child's USER_INTERACTION step
      await runner.submitUserInput(childUiStep.instance_id, { 'child-input': 'child data' });

      // Verify child workflow is COMPLETED
      const childWorkflowAfter = await ctx.workflowRepo.getById(childWfId);
      expect(childWorkflowAfter!.workflow_state).toBe('COMPLETED');

      // Verify parent WORKFLOW_PROXY step is now COMPLETED
      const proxyStepAfter = await ctx.stepRepo.getById(proxyStep.instance_id);
      expect(proxyStepAfter!.step_state).toBe('COMPLETED');

      // Verify parent END step ran and parent workflow is COMPLETED
      const parentStepsAfter = await ctx.stepRepo.getByWorkflow(parentWfId);
      const parentEnd = parentStepsAfter.find((s) => s.step_type === 'END')!;
      expect(parentEnd.step_state).toBe('COMPLETED');

      const parentWorkflow = await ctx.workflowRepo.getById(parentWfId);
      expect(parentWorkflow!.workflow_state).toBe('COMPLETED');
    });

    it('propagates pause to child workflow and resume back', async () => {
      const spec = makeWorkflowProxyWorkflow();
      const parentWfId = await runner.createWorkflow(spec);
      await runner.startWorkflow(parentWfId);

      // Child should be running with USER_INTERACTION in EXECUTING
      const parentSteps = await ctx.stepRepo.getByWorkflow(parentWfId);
      const proxyStep = parentSteps.find((s) => s.step_type === 'WORKFLOW_PROXY')!;
      const childWfId = proxyStep.child_workflow_instance_id!;

      // Verify child is running
      const childWorkflow = await ctx.workflowRepo.getById(childWfId);
      expect(childWorkflow!.workflow_state).toBe('RUNNING');

      // Pause parent
      await runner.pauseWorkflow(parentWfId);

      // Verify child workflow is PAUSED
      const childWorkflowPaused = await ctx.workflowRepo.getById(childWfId);
      expect(childWorkflowPaused!.workflow_state).toBe('PAUSED');

      // Verify child USER_INTERACTION step is PAUSED
      const childStepsPaused = await ctx.stepRepo.getByWorkflow(childWfId);
      const childUiPaused = childStepsPaused.find((s) => s.step_oid === CHILD_WORKFLOW_STEP_OIDS.userInteraction)!;
      expect(childUiPaused.step_state).toBe('PAUSED');

      // Resume parent
      await runner.resumeWorkflow(parentWfId);

      // Verify child workflow is RUNNING again
      const childWorkflowResumed = await ctx.workflowRepo.getById(childWfId);
      expect(childWorkflowResumed!.workflow_state).toBe('RUNNING');

      // Verify child USER_INTERACTION step is EXECUTING again
      const childStepsResumed = await ctx.stepRepo.getByWorkflow(childWfId);
      const childUiResumed = childStepsResumed.find((s) => s.step_oid === CHILD_WORKFLOW_STEP_OIDS.userInteraction)!;
      expect(childUiResumed.step_state).toBe('EXECUTING');
    });

    it('propagates abort to child workflow', async () => {
      const spec = makeWorkflowProxyWorkflow();
      const parentWfId = await runner.createWorkflow(spec);
      await runner.startWorkflow(parentWfId);

      // Get child workflow ID
      const parentSteps = await ctx.stepRepo.getByWorkflow(parentWfId);
      const proxyStep = parentSteps.find((s) => s.step_type === 'WORKFLOW_PROXY')!;
      const childWfId = proxyStep.child_workflow_instance_id!;

      // Abort parent
      await runner.abort(parentWfId);

      // Verify child workflow is ABORTED
      const childWorkflowAborted = await ctx.workflowRepo.getById(childWfId);
      expect(childWorkflowAborted!.workflow_state).toBe('ABORTED');

      // Verify parent workflow is ABORTED
      const parentWorkflow = await ctx.workflowRepo.getById(parentWfId);
      expect(parentWorkflow!.workflow_state).toBe('ABORTED');
    });
  });
});
