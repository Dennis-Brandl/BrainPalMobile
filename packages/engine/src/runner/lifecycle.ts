// Lifecycle management: creating runtime workflows and cleanup.
// Source: ExecutionEngineSpec.md, Research Pattern 5

import type { MasterWorkflowSpecification } from '../types/master';
import type {
  RuntimeWorkflow,
  RuntimeWorkflowStep,
  WorkflowConnection,
} from '../types/runtime';
import type { IIdGenerator } from '../interfaces/id-generator';
import { SPEC_STEP_TYPE_MAP, type StepType } from '../types/common';
import type {
  IWorkflowRepository,
  IValuePropertyRepository,
  IResourcePoolRepository,
} from '../interfaces/storage';
import type { IExecutionLogger } from '../interfaces/logger';

// ---------------------------------------------------------------------------
// Runtime Workflow Creation Result
// ---------------------------------------------------------------------------

export interface CreateRuntimeWorkflowResult {
  workflow: RuntimeWorkflow;
  steps: RuntimeWorkflowStep[];
  connections: WorkflowConnection[];
}

// ---------------------------------------------------------------------------
// createRuntimeWorkflow
// ---------------------------------------------------------------------------

/**
 * Create a runtime workflow from a master specification.
 *
 * Deep copies the master spec via JSON.parse(JSON.stringify(...)) so that
 * the runtime data is fully independent of the master record. Generates
 * unique instance IDs for the workflow and every step.
 */
export function createRuntimeWorkflow(
  masterSpec: MasterWorkflowSpecification,
  idGenerator: IIdGenerator,
): CreateRuntimeWorkflowResult {
  // Deep copy the master spec so mutations cannot affect the original
  const specCopy: MasterWorkflowSpecification = JSON.parse(
    JSON.stringify(masterSpec),
  );

  const workflowInstanceId = idGenerator.generateId();
  const now = new Date().toISOString();

  // Create RuntimeWorkflow
  const workflow: RuntimeWorkflow = {
    instance_id: workflowInstanceId,
    master_workflow_oid: specCopy.oid,
    master_workflow_version: specCopy.version,
    workflow_state: 'IDLE',
    specification_json: JSON.stringify(specCopy),
    created_at: now,
    started_at: null,
    completed_at: null,
    parent_workflow_instance_id: null,
    parent_step_oid: null,
    last_activity_at: now,
  };

  // Create RuntimeWorkflowStep for each step in the spec
  const steps: RuntimeWorkflowStep[] = (specCopy.steps ?? []).map((masterStep) => {
    const stepInstanceId = idGenerator.generateId();
    // Normalize step_type: real packages may use spaces ("WAIT ALL") instead of underscores ("WAIT_ALL")
    const normalizedType = SPEC_STEP_TYPE_MAP[masterStep.step_type] ?? masterStep.step_type as StepType;
    return {
      instance_id: stepInstanceId,
      workflow_instance_id: workflowInstanceId,
      step_oid: masterStep.oid,
      step_type: normalizedType,
      step_state: 'IDLE',
      step_json: JSON.stringify({ ...masterStep, step_type: normalizedType }),
      resolved_inputs_json: null,
      resolved_outputs_json: null,
      user_inputs_json: null,
      child_workflow_instance_id: null,
      activated_at: null,
      started_at: null,
      completed_at: null,
    };
  });

  // Create WorkflowConnection array from spec connections
  const connections: WorkflowConnection[] = (specCopy.connections ?? []).map((conn) => ({
    workflow_instance_id: workflowInstanceId,
    from_step_oid: conn.from_step_id,
    to_step_oid: conn.to_step_id,
    condition: conn.condition,
    connection_id: conn.connection_id,
    source_handle_id: conn.source_handle_id,
  }));

  return { workflow, steps, connections };
}

// ---------------------------------------------------------------------------
// completeWorkflow
// ---------------------------------------------------------------------------

/**
 * Complete a workflow: set state to COMPLETED, clean up Value Properties,
 * release resources, and log the event.
 */
export async function completeWorkflow(
  workflowInstanceId: string,
  workflowRepo: IWorkflowRepository,
  valuePropertyRepo: IValuePropertyRepository,
  resourcePoolRepo: IResourcePoolRepository,
  executionLogger: IExecutionLogger,
): Promise<void> {
  const now = new Date().toISOString();

  // Update workflow state
  const workflow = await workflowRepo.getById(workflowInstanceId);
  if (workflow) {
    workflow.workflow_state = 'COMPLETED';
    workflow.completed_at = now;
    workflow.last_activity_at = now;
    await workflowRepo.save(workflow);
  }

  // Delete workflow Value Properties (PERS-04)
  await valuePropertyRepo.deleteByWorkflow(workflowInstanceId);

  // Release all workflow resource pools
  const pools = await resourcePoolRepo.getByScope('workflow', workflowInstanceId);
  for (const pool of pools) {
    await resourcePoolRepo.delete(pool.resource_name, 'workflow', workflowInstanceId);
  }

  // Log event
  await executionLogger.log({
    workflow_instance_id: workflowInstanceId,
    event_type: 'WORKFLOW_COMPLETED',
    event_data_json: JSON.stringify({ completed_at: now }),
    timestamp: now,
  });
}

// ---------------------------------------------------------------------------
// abortWorkflow
// ---------------------------------------------------------------------------

/**
 * Abort a workflow: set state to ABORTED, release resources, and log.
 */
export async function abortWorkflow(
  workflowInstanceId: string,
  workflowRepo: IWorkflowRepository,
  valuePropertyRepo: IValuePropertyRepository,
  resourcePoolRepo: IResourcePoolRepository,
  executionLogger: IExecutionLogger,
): Promise<void> {
  const now = new Date().toISOString();

  // Update workflow state
  const workflow = await workflowRepo.getById(workflowInstanceId);
  if (workflow) {
    workflow.workflow_state = 'ABORTED';
    workflow.completed_at = now;
    workflow.last_activity_at = now;
    await workflowRepo.save(workflow);
  }

  // Delete workflow Value Properties
  await valuePropertyRepo.deleteByWorkflow(workflowInstanceId);

  // Release all workflow resource pools
  const pools = await resourcePoolRepo.getByScope('workflow', workflowInstanceId);
  for (const pool of pools) {
    await resourcePoolRepo.delete(pool.resource_name, 'workflow', workflowInstanceId);
  }

  // Log event
  await executionLogger.log({
    workflow_instance_id: workflowInstanceId,
    event_type: 'WORKFLOW_ABORTED',
    event_data_json: JSON.stringify({ aborted_at: now }),
    timestamp: now,
  });
}
