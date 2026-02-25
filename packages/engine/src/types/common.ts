// Common enums and union types shared across master and runtime data models.
// Source: DataModelSpec.md, StateMachineSpec.md

/**
 * All possible states for a runtime workflow step.
 * Follows ISA-88 batch control semantics with observable and opaque tracks.
 */
export type StepState =
  // Common states
  | 'IDLE'
  | 'WAITING'
  | 'COMPLETED'
  | 'ABORTED'
  | 'ABORTING'
  | 'STOPPING'
  | 'CLEARING'
  // Observable step states
  | 'STARTING'
  | 'EXECUTING'
  | 'COMPLETING'
  | 'PAUSING'
  | 'PAUSED'
  | 'UNPAUSING'
  | 'HOLDING'
  | 'HELD'
  | 'UNHOLDING'
  // Opaque step states
  | 'POSTED'
  | 'RECEIVED'
  | 'IN_PROGRESS';

/**
 * Events that can be sent to the step state machine.
 */
export type StateEvent =
  | 'START'
  | 'SC'      // State Change (automatic)
  | 'PAUSE'
  | 'RESUME'
  | 'HOLD'
  | 'UNHOLD'
  | 'ABORT'
  | 'STOP'
  | 'CLEAR';

/**
 * All supported step types in the workflow graph.
 * Note: The spec uses spaces in some names (e.g., 'ACTION PROXY').
 * We use underscored versions for programmatic consistency.
 */
export type StepType =
  | 'START'
  | 'END'
  | 'USER_INTERACTION'
  | 'YES_NO'
  | 'SELECT_1'
  | 'PARALLEL'
  | 'WAIT_ALL'
  | 'WAIT_ANY'
  | 'WORKFLOW_PROXY'
  | 'ACTION_PROXY'
  | 'SCRIPT';

/**
 * Map from spec step type names (which may contain spaces) to our StepType.
 * Used during import to normalize step types.
 */
export const SPEC_STEP_TYPE_MAP: Record<string, StepType> = {
  'START': 'START',
  'END': 'END',
  'USER_INTERACTION': 'USER_INTERACTION',
  'YES_NO': 'YES_NO',
  'SELECT 1': 'SELECT_1',
  'SELECT_1': 'SELECT_1',
  'PARALLEL': 'PARALLEL',
  'WAIT ALL': 'WAIT_ALL',
  'WAIT_ALL': 'WAIT_ALL',
  'WAIT ANY': 'WAIT_ANY',
  'WAIT_ANY': 'WAIT_ANY',
  'WORKFLOW PROXY': 'WORKFLOW_PROXY',
  'WORKFLOW_PROXY': 'WORKFLOW_PROXY',
  'ACTION PROXY': 'ACTION_PROXY',
  'ACTION_PROXY': 'ACTION_PROXY',
  'SCRIPT': 'SCRIPT',
};

/**
 * Overall workflow state.
 */
export type WorkflowState =
  | 'IDLE'
  | 'RUNNING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'ABORTED'
  | 'STOPPED';

/**
 * Comparison operators for SELECT 1 condition evaluation.
 */
export type ComparisonOperator =
  | 'equals'
  | 'not_equals'
  | 'greater_than'
  | 'less_than'
  | 'greater_than_or_equal'
  | 'less_than_or_equal'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with';

/**
 * Resource types for controlling concurrent access to shared assets.
 */
export type ResourceType =
  | 'binary exclusive use'
  | 'binary shared use with pool limits'
  | 'countable use with pool limits'
  | 'named pool'
  | 'sync';

/**
 * Resource command types issued by steps.
 */
export type ResourceCommandType =
  | 'Acquire'
  | 'Release'
  | 'Send'
  | 'Receive'
  | 'Synchronize';

/**
 * Action visibility modes.
 */
export type ActionVisibility = 'opaque' | 'observable';

/**
 * Set of states considered "active" for the purpose of ABORT/STOP transitions.
 * A step in any of these states can receive ABORT or STOP events.
 */
export const ACTIVE_STATES: ReadonlySet<StepState> = new Set<StepState>([
  'WAITING',
  'STARTING',
  'EXECUTING',
  'COMPLETING',
  'PAUSING',
  'PAUSED',
  'UNPAUSING',
  'HOLDING',
  'HELD',
  'UNHOLDING',
  'POSTED',
  'RECEIVED',
  'IN_PROGRESS',
]);

/**
 * Terminal states -- steps in these states cannot transition further
 * (except ABORTED which can CLEAR).
 */
export const TERMINAL_STATES: ReadonlySet<StepState> = new Set<StepState>([
  'COMPLETED',
  'ABORTED',
]);
