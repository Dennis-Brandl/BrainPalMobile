// Runner types for the WorkflowRunner and crash recovery.

import type { StateMachine } from '../state-machine/state-machine';
import type { StepState, StateEvent } from '../types/common';
import type { SchedulerContext } from '../scheduler/types';
import type {
  IWorkflowRepository,
  IStepRepository,
  IConnectionRepository,
  IValuePropertyRepository,
  IResourcePoolRepository,
  IResourceQueueRepository,
  ISyncBarrierRepository,
} from '../interfaces/storage';
import type { IExecutionLogger } from '../interfaces/logger';
import type { IIdGenerator } from '../interfaces/id-generator';
import type { EngineEventBus } from '../events/event-bus';
import type { MasterWorkflowSpecification } from '../types/master';

// ---------------------------------------------------------------------------
// RunnerConfig
// ---------------------------------------------------------------------------

/**
 * Configuration for the WorkflowRunner.
 * Contains all injected dependencies (repositories, event bus, ID generator, logger).
 */
export interface RunnerConfig {
  workflowRepo: IWorkflowRepository;
  stepRepo: IStepRepository;
  connectionRepo: IConnectionRepository;
  valuePropertyRepo: IValuePropertyRepository;
  resourcePoolRepo: IResourcePoolRepository;
  resourceQueueRepo: IResourceQueueRepository;
  syncBarrierRepo: ISyncBarrierRepository;
  executionLogger: IExecutionLogger;
  eventBus: EngineEventBus;
  idGenerator: IIdGenerator;
}

// ---------------------------------------------------------------------------
// WorkflowRunnerState
// ---------------------------------------------------------------------------

/**
 * Per-workflow tracking state held in memory by the WorkflowRunner.
 * Contains the state machines for each step and the scheduler context.
 */
export interface WorkflowRunnerState {
  workflowInstanceId: string;
  masterWorkflowOid: string;
  /** step_oid -> StateMachine instance */
  stateMachines: Map<string, StateMachine<StepState, StateEvent>>;
  /** Scheduler context with adjacency lists and step state map */
  schedulerContext: SchedulerContext;
  /** step_oid -> step instance_id */
  stepOidToInstanceId: Map<string, string>;
  /** step instance_id -> step_oid */
  stepInstanceIdToOid: Map<string, string>;
}

// ---------------------------------------------------------------------------
// RecoveryResult
// ---------------------------------------------------------------------------

/**
 * Result of crash recovery.
 */
export interface RecoveryResult {
  /** Workflow instance IDs that were successfully recovered and resumed */
  recovered: string[];
  /** Workflow instance IDs flagged as stale (inactive > 24 hours) */
  stale: string[];
  /** Workflow instance IDs that encountered errors during recovery */
  errors: Array<{ workflowId: string; error: string }>;
}

// ---------------------------------------------------------------------------
// IWorkflowRunnerForProxy
// ---------------------------------------------------------------------------

/**
 * Interface exposed to the step executor for WORKFLOW_PROXY steps.
 * Allows creating and starting child workflows without exposing the full runner.
 */
export interface IWorkflowRunnerForProxy {
  createChildWorkflow(
    childSpec: MasterWorkflowSpecification,
    parentWorkflowInstanceId: string,
    parentStepOid: string,
  ): Promise<string>;
  /**
   * Start a child workflow using direct activation (not via event queue).
   * This is critical when called from within an event queue handler to avoid deadlock.
   */
  startChildWorkflowDirect(workflowInstanceId: string): Promise<void>;
}
