// Engine event types -- the engine's output channel for UI, logging, and notifications.
// Source: ExecutionEngineSpec.md Section 9, Research Pattern 4

import type { StepState, StateEvent } from './common';

// ---------------------------------------------------------------------------
// Execution Log Types
// ---------------------------------------------------------------------------

/**
 * All log event types emitted during workflow execution.
 */
export type LogEventType =
  | 'WORKFLOW_CREATED'
  | 'WORKFLOW_STARTED'
  | 'WORKFLOW_COMPLETED'
  | 'WORKFLOW_ABORTED'
  | 'WORKFLOW_STOPPED'
  | 'WORKFLOW_RESUMED'
  | 'STEP_STATE_CHANGED'
  | 'SCHEDULER_ACTIVATED_STEPS'
  | 'PARAMETER_INPUT_RESOLVED'
  | 'PARAMETER_OUTPUT_WRITTEN'
  | 'CONDITION_EVALUATED'
  | 'RESOURCE_ACQUIRED'
  | 'RESOURCE_RELEASED'
  | 'RESOURCE_QUEUED'
  | 'SYNC_BARRIER_REGISTERED'
  | 'SYNC_BARRIER_MATCHED'
  | 'USER_INPUT_SUBMITTED'
  | 'PACKAGE_IMPORTED'
  | 'ENGINE_ERROR';

/**
 * A single execution log entry persisted for audit and debugging.
 */
export interface ExecutionLogEntry {
  workflow_instance_id: string;
  step_oid?: string;
  step_instance_id?: string;
  event_type: LogEventType;
  event_data_json: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Engine Event Map (typed event bus payloads)
// ---------------------------------------------------------------------------

/**
 * Maps event names to their typed payloads.
 * The event bus uses this for type-safe publish/subscribe.
 */
export type EngineEventMap = {
  WORKFLOW_STARTED: { workflowInstanceId: string };
  WORKFLOW_COMPLETED: { workflowInstanceId: string };
  WORKFLOW_ABORTED: { workflowInstanceId: string };
  WORKFLOW_STOPPED: { workflowInstanceId: string };
  STEP_STATE_CHANGED: {
    stepInstanceId: string;
    workflowInstanceId: string;
    stepOid: string;
    fromState: StepState;
    toState: StepState;
    event: StateEvent;
  };
  STEP_ACTIVATED: {
    stepInstanceId: string;
    workflowInstanceId: string;
    stepOid: string;
  };
  ACTIVE_STEPS_CHANGED: {
    workflowInstanceId: string;
    activeSteps: string[];
  };
  USER_INPUT_REQUIRED: {
    stepInstanceId: string;
    workflowInstanceId: string;
    stepOid: string;
  };
  PARAMETER_RESOLVED: {
    stepInstanceId: string;
    paramName: string;
    value: string;
  };
  CONDITION_EVALUATED: {
    stepInstanceId: string;
    matchedConnectionId: string | null;
  };
  SCHEDULER_DECISION: {
    completedStepId: string;
    activatedStepIds: string[];
  };
  RESOURCE_ACQUIRED: {
    stepInstanceId: string;
    resourceName: string;
  };
  RESOURCE_WAITING: {
    stepInstanceId: string;
    resourceName: string;
  };
  EXECUTION_LOG: {
    entry: ExecutionLogEntry;
  };
  ERROR: {
    source: string;
    message: string;
    details?: unknown;
  };
};

// ---------------------------------------------------------------------------
// Discriminated Union (for event queue)
// ---------------------------------------------------------------------------

/**
 * Discriminated union of all engine events.
 * Used by the EngineEventQueue for typed serial processing.
 */
export type EngineEvent =
  | { type: 'WORKFLOW_STARTED'; workflowInstanceId: string }
  | { type: 'WORKFLOW_COMPLETED'; workflowInstanceId: string }
  | { type: 'WORKFLOW_ABORTED'; workflowInstanceId: string }
  | { type: 'WORKFLOW_STOPPED'; workflowInstanceId: string }
  | {
      type: 'STEP_STATE_CHANGED';
      stepInstanceId: string;
      workflowInstanceId: string;
      stepOid: string;
      fromState: StepState;
      toState: StepState;
      event: StateEvent;
    }
  | { type: 'STEP_ACTIVATED'; stepInstanceId: string; workflowInstanceId: string; stepOid: string }
  | { type: 'ACTIVE_STEPS_CHANGED'; workflowInstanceId: string; activeSteps: string[] }
  | { type: 'USER_INPUT_REQUIRED'; stepInstanceId: string; workflowInstanceId: string; stepOid: string }
  | { type: 'PARAMETER_RESOLVED'; stepInstanceId: string; paramName: string; value: string }
  | { type: 'CONDITION_EVALUATED'; stepInstanceId: string; matchedConnectionId: string | null }
  | { type: 'SCHEDULER_DECISION'; completedStepId: string; activatedStepIds: string[] }
  | { type: 'RESOURCE_ACQUIRED'; stepInstanceId: string; resourceName: string }
  | { type: 'RESOURCE_WAITING'; stepInstanceId: string; resourceName: string }
  | { type: 'EXECUTION_LOG'; entry: ExecutionLogEntry }
  | { type: 'ERROR'; source: string; message: string; details?: unknown };
