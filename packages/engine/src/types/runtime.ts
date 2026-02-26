// Runtime Execution System types -- created and mutated during workflow execution.
// Source: DataModelSpec.md Sections 3-4, ExecutionEngineSpec.md

import type { StepState, StepType, WorkflowState } from './common';

// ---------------------------------------------------------------------------
// Runtime Workflow
// ---------------------------------------------------------------------------

/**
 * A runtime workflow instance. Created as a deep copy of a MasterWorkflowSpecification.
 * The specification_json field stores the full deep-copied master spec for crash recovery.
 */
export interface RuntimeWorkflow {
  instance_id: string;
  master_workflow_oid: string;
  master_workflow_version: string;
  workflow_state: WorkflowState;
  specification_json: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  parent_workflow_instance_id: string | null;
  parent_step_oid: string | null;
  last_activity_at: string | null;
}

// ---------------------------------------------------------------------------
// Runtime Workflow Step
// ---------------------------------------------------------------------------

/**
 * A runtime step instance. Each step in a running workflow has its own
 * state machine instance tracking its progress through ISA-88 states.
 *
 * The step_json field stores the deep-copied MasterWorkflowStep spec
 * for rendering forms and resolving parameters.
 */
export interface RuntimeWorkflowStep {
  instance_id: string;
  workflow_instance_id: string;
  step_oid: string;
  step_type: StepType;
  step_state: StepState;
  step_json: string;
  resolved_inputs_json: string | null;
  resolved_outputs_json: string | null;
  user_inputs_json: string | null;
  child_workflow_instance_id: string | null;
  activated_at: string | null;
  started_at: string | null;
  completed_at: string | null;
}

// ---------------------------------------------------------------------------
// Workflow Connection (runtime copy)
// ---------------------------------------------------------------------------

/**
 * A connection between two steps in a runtime workflow.
 * Deep-copied from the master specification on workflow creation.
 */
export interface WorkflowConnection {
  workflow_instance_id: string;
  from_step_oid: string;
  to_step_oid: string;
  condition?: string;
  connection_id?: string;
  source_handle_id?: string;
}

// ---------------------------------------------------------------------------
// Runtime Value Property
// ---------------------------------------------------------------------------

/**
 * A runtime value property -- the data bus for passing values between steps.
 * Scoped to either a workflow instance or an environment.
 */
export interface RuntimeValueProperty {
  scope: 'workflow' | 'environment';
  scope_id: string;
  property_name: string;
  entries: PropertyEntry[];
  last_modified?: string;
}

/**
 * A single key/value entry within a runtime value property.
 */
export interface PropertyEntry {
  name: string;
  value: string;
}

// ---------------------------------------------------------------------------
// Resource Pool State (runtime)
// ---------------------------------------------------------------------------

export interface ResourcePool {
  resource_name: string;
  scope: 'workflow' | 'environment';
  scope_id: string;
  resource_type: string;
  capacity: number;
  current_usage: number;
  named_instances?: Array<{
    name: string;
    acquired_by?: string;
  }>;
}

export interface ResourceQueueEntry {
  step_instance_id: string;
  workflow_instance_id: string;
  command_type: string;
  resource_name: string;
  amount: number;
  requested_at: string;
}

// ---------------------------------------------------------------------------
// Sync Barrier
// ---------------------------------------------------------------------------

export interface SyncBarrierEntry {
  id: string;
  resource_name: string;
  command_type: string;
  step_instance_id: string;
  workflow_instance_id: string;
  matched_with?: string;
  registered_at: string;
}

// ---------------------------------------------------------------------------
// State Transition (for history tracking)
// ---------------------------------------------------------------------------

export interface StateTransition {
  from_state: StepState;
  to_state: StepState;
  timestamp: string;
  triggered_by: 'engine' | 'user' | 'action_server';
  reason?: string;
}

// ---------------------------------------------------------------------------
// Resolved Parameter (used during execution)
// ---------------------------------------------------------------------------

export interface ResolvedParameter {
  name: string;
  value: string;
}
