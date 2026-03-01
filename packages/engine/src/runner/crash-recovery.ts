// Crash recovery: resumes interrupted workflows from persisted state.
// Queries active workflows, rebuilds state machines at their persisted states,
// and applies per-state recovery actions.

import type { StepState, StateEvent } from '../types/common';
import type { RuntimeWorkflowStep } from '../types/runtime';
import type { RunnerConfig, RecoveryResult, RecoveredWorkflowData, WorkflowRunnerState } from './types';
import { StateMachine } from '../state-machine/state-machine';
import { ISA88_OBSERVABLE_TRANSITIONS } from '../state-machine/isa88-config';
import { Scheduler } from '../scheduler/scheduler';
import { ACTIVE_STATES } from '../types/common';

// Stale threshold: 24 hours in milliseconds
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

/**
 * Recover all active workflows after a crash/restart.
 *
 * Queries active workflows from the repository, rebuilds in-memory state,
 * and applies per-state recovery actions for each step.
 *
 * @returns RecoveryResult with lists of recovered, stale, and errored workflows.
 */
export async function recoverWorkflows(
  config: RunnerConfig,
): Promise<RecoveryResult> {
  const result: RecoveryResult = {
    recovered: [],
    stale: [],
    errors: [],
  };

  // Query active workflows (RUNNING or PAUSED)
  const activeWorkflows = await config.workflowRepo.getActive();

  for (const workflow of activeWorkflows) {
    try {
      // Check stale threshold
      const lastActivity = workflow.last_activity_at
        ? new Date(workflow.last_activity_at).getTime()
        : new Date(workflow.created_at).getTime();
      const now = Date.now();

      if (now - lastActivity > STALE_THRESHOLD_MS) {
        result.stale.push(workflow.instance_id);
        continue;
      }

      // Load steps and connections
      const steps = await config.stepRepo.getByWorkflow(workflow.instance_id);
      const connections = await config.connectionRepo.getByWorkflow(workflow.instance_id);

      // Build scheduler adjacency lists
      const scheduler = new Scheduler();
      const { outgoing, incoming } = scheduler.buildAdjacencyLists(connections);

      // Build step maps
      const stepsMap = new Map<string, RuntimeWorkflowStep>();
      const stepOidToInstanceId = new Map<string, string>();
      const stepInstanceIdToOid = new Map<string, string>();

      for (const step of steps) {
        stepsMap.set(step.step_oid, step);
        stepOidToInstanceId.set(step.step_oid, step.instance_id);
        stepInstanceIdToOid.set(step.instance_id, step.step_oid);
      }

      // Create StateMachine instances initialized to their persisted state
      const stateMachines = new Map<string, StateMachine<StepState, StateEvent>>();
      for (const step of steps) {
        const sm = createRecoveredStateMachine(step.step_state);
        stateMachines.set(step.step_oid, sm);
      }

      // Apply per-state recovery for each non-terminal step
      const stepsToReactivate: RecoveredWorkflowData['stepsToReactivate'] = [];

      for (const step of steps) {
        const recoveryAction = getRecoveryAction(step);
        const sm = stateMachines.get(step.step_oid)!;
        const instanceId = stepOidToInstanceId.get(step.step_oid)!;

        switch (recoveryAction) {
          case 'none':
            break;

          case 'reactivate':
            // Step was in WAITING -- re-enter WAITING for resource re-acquisition
            stepsToReactivate.push({ stepOid: step.step_oid, stepInstanceId: instanceId, action: 'reactivate' });
            break;

          case 'rollback-to-waiting':
            // Step was in STARTING -- roll back to WAITING for re-resolution
            step.step_state = 'WAITING';
            step.resolved_inputs_json = null;
            await config.stepRepo.save(step);
            // Create a new SM at WAITING
            stateMachines.set(step.step_oid, createRecoveredStateMachine('WAITING'));
            stepsToReactivate.push({ stepOid: step.step_oid, stepInstanceId: instanceId, action: 'reactivate' });
            break;

          case 'stay-executing':
            // USER_INTERACTION/YES_NO/WORKFLOW_PROXY in EXECUTING -- re-display form / wait for child
            // No state change needed, the step is already at EXECUTING
            break;

          case 're-execute':
            // Auto-complete step types in EXECUTING -- re-execute
            stepsToReactivate.push({ stepOid: step.step_oid, stepInstanceId: instanceId, action: 're-execute' });
            break;

          case 're-complete':
            // Step was in COMPLETING -- re-execute completing phase
            stepsToReactivate.push({ stepOid: step.step_oid, stepInstanceId: instanceId, action: 're-complete' });
            break;

          case 'complete-pause':
            // Was in PAUSING -> complete to PAUSED
            if (sm.canSend('SC')) {
              sm.send('SC');
            }
            step.step_state = 'PAUSED';
            await config.stepRepo.save(step);
            stateMachines.set(step.step_oid, createRecoveredStateMachine('PAUSED'));
            break;

          case 'complete-unpause':
            // Was in UNPAUSING -> complete to EXECUTING
            if (sm.canSend('SC')) {
              sm.send('SC');
            }
            step.step_state = 'EXECUTING';
            await config.stepRepo.save(step);
            stateMachines.set(step.step_oid, createRecoveredStateMachine('EXECUTING'));
            break;

          case 'complete-abort':
            // Was in ABORTING -> complete to ABORTED
            if (sm.canSend('SC')) {
              sm.send('SC');
            }
            step.step_state = 'ABORTED';
            await config.stepRepo.save(step);
            stateMachines.set(step.step_oid, createRecoveredStateMachine('ABORTED'));
            break;

          case 'complete-stop':
            // Was in STOPPING -> complete to COMPLETED
            if (sm.canSend('SC')) {
              sm.send('SC');
            }
            step.step_state = 'COMPLETED';
            step.completed_at = new Date().toISOString();
            await config.stepRepo.save(step);
            stateMachines.set(step.step_oid, createRecoveredStateMachine('COMPLETED'));
            break;
        }

        // Update the step map with current state
        stepsMap.set(step.step_oid, step);
      }

      // Sort stepsToReactivate by priority: reactivate (WAITING) < re-execute < re-complete
      const actionPriority: Record<string, number> = { 'reactivate': 0, 're-execute': 1, 're-complete': 2 };
      stepsToReactivate.sort((a, b) => actionPriority[a.action] - actionPriority[b.action]);

      // Build runner state
      const runnerState: WorkflowRunnerState = {
        workflowInstanceId: workflow.instance_id,
        masterWorkflowOid: workflow.master_workflow_oid,
        stateMachines,
        schedulerContext: { outgoing, incoming, steps: stepsMap, connections },
        stepOidToInstanceId,
        stepInstanceIdToOid,
      };

      result.recovered.push({
        workflowInstanceId: workflow.instance_id,
        runnerState,
        stepsToReactivate,
      });

      // Log recovery
      await config.executionLogger.log({
        workflow_instance_id: workflow.instance_id,
        event_type: 'WORKFLOW_RESUMED',
        event_data_json: JSON.stringify({
          recoveredSteps: steps.length,
          stepsToReactivate: stepsToReactivate.length,
        }),
        timestamp: new Date().toISOString(),
      });

    } catch (err) {
      result.errors.push({
        workflowId: workflow.instance_id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Recovery Action Types
// ---------------------------------------------------------------------------

type RecoveryAction =
  | 'none'
  | 'reactivate'
  | 'rollback-to-waiting'
  | 'stay-executing'
  | 're-execute'
  | 're-complete'
  | 'complete-pause'
  | 'complete-unpause'
  | 'complete-abort'
  | 'complete-stop';

/**
 * Determine the recovery action for a step based on its persisted state.
 */
function getRecoveryAction(step: RuntimeWorkflowStep): RecoveryAction {
  switch (step.step_state) {
    case 'IDLE':
    case 'COMPLETED':
    case 'ABORTED':
      return 'none';

    case 'WAITING':
      return 'reactivate';

    case 'STARTING':
      return 'rollback-to-waiting';

    case 'EXECUTING':
      // User interaction steps and WORKFLOW_PROXY stay in EXECUTING
      // (re-display form / wait for child workflow)
      if (step.step_type === 'USER_INTERACTION' || step.step_type === 'YES_NO' || step.step_type === 'WORKFLOW_PROXY') {
        return 'stay-executing';
      }
      // Auto-complete step types re-execute
      return 're-execute';

    case 'COMPLETING':
      return 're-complete';

    case 'PAUSING':
      return 'complete-pause';

    case 'PAUSED':
      return 'none'; // Already paused

    case 'UNPAUSING':
      return 'complete-unpause';

    case 'HOLDING':
    case 'HELD':
    case 'UNHOLDING':
      return 'none'; // Stay in current state

    case 'ABORTING':
      return 'complete-abort';

    case 'STOPPING':
      return 'complete-stop';

    default:
      return 'none';
  }
}

/**
 * Create a StateMachine initialized to the given persisted state.
 * Uses a factory pattern to skip the IDLE initial state.
 */
function createRecoveredStateMachine(
  persistedState: StepState,
): StateMachine<StepState, StateEvent> {
  // Create SM at IDLE then advance to persisted state via a direct approach.
  // Since we can't set state directly on StateMachine, we create one at IDLE
  // and then use the transition table to advance it.
  // For recovery, we create a new SM class that starts at the persisted state.
  return new StateMachine<StepState, StateEvent>({
    initialState: persistedState,
    transitions: ISA88_OBSERVABLE_TRANSITIONS,
  });
}
