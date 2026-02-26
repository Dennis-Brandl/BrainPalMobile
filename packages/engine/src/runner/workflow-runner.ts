// WorkflowRunner: top-level orchestrator for workflow execution.
// All step state changes and activations go through the EngineEventQueue
// to prevent race conditions when parallel branches complete simultaneously.

import type { MasterWorkflowSpecification, MasterWorkflowStep } from '../types/master';
import type { RuntimeWorkflowStep, WorkflowConnection } from '../types/runtime';
import type { StepState, StateEvent } from '../types/common';
import type { EngineEvent } from '../types/events';
import type { RunnerConfig, WorkflowRunnerState, IWorkflowRunnerForProxy } from './types';
import type { StepExecutionContext } from './step-executor';

import { StateMachine } from '../state-machine/state-machine';
import { ISA88_OBSERVABLE_TRANSITIONS } from '../state-machine/isa88-config';
import { Scheduler } from '../scheduler/scheduler';
import { ParameterResolver } from '../parameter-resolver/parameter-resolver';
import { ScopeResolver } from '../parameter-resolver/scope-resolver';
import { ConditionEvaluator } from '../condition-evaluator/condition-evaluator';
import { ResourceManager } from '../resource-manager/resource-manager';
import { EngineEventQueue } from '../events/event-queue';
import {
  createRuntimeWorkflow,
  completeWorkflow,
  abortWorkflow,
} from './lifecycle';
import {
  executeStartingPhase,
  executeExecutingPhase,
  executeCompletingPhase,
} from './step-executor';
import { ACTIVE_STATES } from '../types/common';

/**
 * The top-level orchestrator for workflow execution.
 *
 * Creates runtime workflows from master specs, executes them step by step
 * through the ISA-88 state machine using the serial event queue, and handles
 * all step types. All operations that mutate step state go through the
 * EngineEventQueue to ensure serial processing.
 */
export class WorkflowRunner implements IWorkflowRunnerForProxy {
  private activeWorkflows = new Map<string, WorkflowRunnerState>();
  private eventQueue: EngineEventQueue;
  private scheduler = new Scheduler();
  private parameterResolver: ParameterResolver;
  private conditionEvaluator = new ConditionEvaluator();
  private resourceManager: ResourceManager;
  private scopeResolver: ScopeResolver;

  constructor(private readonly config: RunnerConfig) {
    // Set up event queue -- all engine events go through here
    this.eventQueue = new EngineEventQueue((event) => this.handleEvent(event));

    // Set up parameter resolution
    this.scopeResolver = new ScopeResolver(
      config.valuePropertyRepo,
      config.workflowRepo,
    );
    this.parameterResolver = new ParameterResolver(
      this.scopeResolver,
      config.valuePropertyRepo,
    );

    // Set up resource manager
    this.resourceManager = new ResourceManager(
      config.resourcePoolRepo,
      config.resourceQueueRepo,
      config.syncBarrierRepo,
      config.idGenerator,
    );
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Create a runtime workflow from a master specification.
   * Returns the workflow instance ID.
   */
  async createWorkflow(masterSpec: MasterWorkflowSpecification): Promise<string> {
    const { workflow, steps, connections } = createRuntimeWorkflow(
      masterSpec,
      this.config.idGenerator,
    );

    // Save to repositories
    await this.config.workflowRepo.save(workflow);
    await this.config.stepRepo.saveMany(steps);
    await this.config.connectionRepo.saveMany(workflow.instance_id, connections);

    // Initialize Value Properties from spec defaults
    if (masterSpec.value_property_specifications?.length > 0) {
      await this.config.valuePropertyRepo.initializeFromSpec(
        'workflow',
        workflow.instance_id,
        masterSpec.value_property_specifications,
      );
    }

    // Initialize resource pools
    if (masterSpec.resource_property_specifications?.length > 0) {
      await this.resourceManager.initializePools(
        'workflow',
        workflow.instance_id,
        masterSpec.resource_property_specifications,
      );
    }

    // Build scheduler adjacency lists
    const { outgoing, incoming } = this.scheduler.buildAdjacencyLists(connections);

    // Create step maps
    const stepsMap = new Map<string, RuntimeWorkflowStep>();
    const stepOidToInstanceId = new Map<string, string>();
    const stepInstanceIdToOid = new Map<string, string>();

    for (const step of steps) {
      stepsMap.set(step.step_oid, step);
      stepOidToInstanceId.set(step.step_oid, step.instance_id);
      stepInstanceIdToOid.set(step.instance_id, step.step_oid);
    }

    // Create StateMachine instances for each step (all start at IDLE)
    const stateMachines = new Map<string, StateMachine<StepState, StateEvent>>();
    for (const step of steps) {
      const sm = new StateMachine<StepState, StateEvent>({
        initialState: 'IDLE',
        transitions: ISA88_OBSERVABLE_TRANSITIONS,
      });
      stateMachines.set(step.step_oid, sm);
    }

    // Store workflow runner state
    const runnerState: WorkflowRunnerState = {
      workflowInstanceId: workflow.instance_id,
      masterWorkflowOid: masterSpec.oid,
      stateMachines,
      schedulerContext: { outgoing, incoming, steps: stepsMap, connections },
      stepOidToInstanceId,
      stepInstanceIdToOid,
    };
    this.activeWorkflows.set(workflow.instance_id, runnerState);

    // Log event
    await this.config.executionLogger.log({
      workflow_instance_id: workflow.instance_id,
      event_type: 'WORKFLOW_CREATED',
      event_data_json: JSON.stringify({
        masterOid: masterSpec.oid,
        stepCount: steps.length,
      }),
      timestamp: new Date().toISOString(),
    });

    return workflow.instance_id;
  }

  /**
   * Start a workflow. Finds the START step and activates it.
   */
  async startWorkflow(workflowInstanceId: string): Promise<void> {
    const workflow = await this.config.workflowRepo.getById(workflowInstanceId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowInstanceId} not found`);
    }

    // Update workflow state to RUNNING
    workflow.workflow_state = 'RUNNING';
    workflow.started_at = new Date().toISOString();
    workflow.last_activity_at = new Date().toISOString();
    await this.config.workflowRepo.save(workflow);

    // Log workflow started
    await this.config.executionLogger.log({
      workflow_instance_id: workflowInstanceId,
      event_type: 'WORKFLOW_STARTED',
      event_data_json: JSON.stringify({ started_at: workflow.started_at }),
      timestamp: new Date().toISOString(),
    });

    this.config.eventBus.emit('WORKFLOW_STARTED', { workflowInstanceId });

    // Find START step
    const runnerState = this.activeWorkflows.get(workflowInstanceId);
    if (!runnerState) {
      throw new Error(`Runner state for workflow ${workflowInstanceId} not found`);
    }

    const startStepOid = this.findStartStepOid(runnerState);
    if (!startStepOid) {
      throw new Error(`No START step found in workflow ${workflowInstanceId}`);
    }

    const startStepInstanceId = runnerState.stepOidToInstanceId.get(startStepOid)!;

    // Enqueue activation through the event queue
    await this.eventQueue.enqueue({
      type: 'STEP_ACTIVATED',
      stepInstanceId: startStepInstanceId,
      workflowInstanceId,
      stepOid: startStepOid,
    });
  }

  /**
   * Submit user input for a step waiting in EXECUTING state.
   */
  async submitUserInput(
    stepInstanceId: string,
    formData: Record<string, string>,
  ): Promise<void> {
    const step = await this.config.stepRepo.getById(stepInstanceId);
    if (!step) {
      throw new Error(`Step ${stepInstanceId} not found`);
    }

    // Store form data
    step.user_inputs_json = JSON.stringify(formData);
    await this.config.stepRepo.save(step);

    // Log user input submitted
    await this.config.executionLogger.log({
      workflow_instance_id: step.workflow_instance_id,
      step_oid: step.step_oid,
      step_instance_id: step.instance_id,
      event_type: 'USER_INPUT_SUBMITTED',
      event_data_json: JSON.stringify(formData),
      timestamp: new Date().toISOString(),
    });

    // Enqueue event to transition step from EXECUTING -> COMPLETING
    await this.eventQueue.enqueue({
      type: 'STEP_STATE_CHANGED',
      stepInstanceId: step.instance_id,
      workflowInstanceId: step.workflow_instance_id,
      stepOid: step.step_oid,
      fromState: 'EXECUTING',
      toState: 'COMPLETING',
      event: 'SC',
    });
  }

  /**
   * Pause a workflow: pause all EXECUTING steps.
   */
  async pauseWorkflow(workflowInstanceId: string): Promise<void> {
    const runnerState = this.activeWorkflows.get(workflowInstanceId);
    if (!runnerState) {
      throw new Error(`Runner state for workflow ${workflowInstanceId} not found`);
    }

    const steps = await this.config.stepRepo.getByWorkflow(workflowInstanceId);
    for (const step of steps) {
      if (step.step_state === 'EXECUTING') {
        const sm = runnerState.stateMachines.get(step.step_oid);
        if (sm && sm.canSend('PAUSE')) {
          sm.send('PAUSE');
          step.step_state = 'PAUSING';
          await this.config.stepRepo.save(step);

          // Auto-complete PAUSING -> PAUSED
          sm.send('SC');
          step.step_state = 'PAUSED';
          await this.config.stepRepo.save(step);
        }
      }
    }

    // Propagate pause to child workflows
    for (const step of steps) {
      if (step.step_type === 'WORKFLOW_PROXY' && step.child_workflow_instance_id) {
        if (this.activeWorkflows.has(step.child_workflow_instance_id)) {
          await this.pauseWorkflow(step.child_workflow_instance_id);
        }
      }
    }

    await this.config.workflowRepo.updateState(workflowInstanceId, 'PAUSED');
  }

  /**
   * Resume a paused workflow: resume all PAUSED steps.
   */
  async resumeWorkflow(workflowInstanceId: string): Promise<void> {
    const runnerState = this.activeWorkflows.get(workflowInstanceId);
    if (!runnerState) {
      throw new Error(`Runner state for workflow ${workflowInstanceId} not found`);
    }

    const steps = await this.config.stepRepo.getByWorkflow(workflowInstanceId);
    for (const step of steps) {
      if (step.step_state === 'PAUSED') {
        const sm = runnerState.stateMachines.get(step.step_oid);
        if (sm && sm.canSend('RESUME')) {
          sm.send('RESUME');
          step.step_state = 'UNPAUSING';
          await this.config.stepRepo.save(step);

          // Auto-complete UNPAUSING -> EXECUTING
          sm.send('SC');
          step.step_state = 'EXECUTING';
          await this.config.stepRepo.save(step);
        }
      }
    }

    // Propagate resume to child workflows
    for (const step of steps) {
      if (step.step_type === 'WORKFLOW_PROXY' && step.child_workflow_instance_id) {
        if (this.activeWorkflows.has(step.child_workflow_instance_id)) {
          await this.resumeWorkflow(step.child_workflow_instance_id);
        }
      }
    }

    await this.config.workflowRepo.updateState(workflowInstanceId, 'RUNNING');
  }

  /**
   * Abort a workflow.
   */
  async abort(workflowInstanceId: string): Promise<void> {
    const runnerState = this.activeWorkflows.get(workflowInstanceId);
    if (!runnerState) {
      throw new Error(`Runner state for workflow ${workflowInstanceId} not found`);
    }

    // Abort child workflows FIRST (clean up children before parent)
    const steps = await this.config.stepRepo.getByWorkflow(workflowInstanceId);
    for (const step of steps) {
      if (step.step_type === 'WORKFLOW_PROXY' && step.child_workflow_instance_id) {
        if (this.activeWorkflows.has(step.child_workflow_instance_id)) {
          await this.abort(step.child_workflow_instance_id);
        }
      }
    }

    // Abort all active parent steps
    for (const step of steps) {
      if (ACTIVE_STATES.has(step.step_state)) {
        const sm = runnerState.stateMachines.get(step.step_oid);
        if (sm && sm.canSend('ABORT')) {
          sm.send('ABORT');
          step.step_state = 'ABORTING';
          await this.config.stepRepo.save(step);

          // Auto-complete ABORTING -> ABORTED
          sm.send('SC');
          step.step_state = 'ABORTED';
          await this.config.stepRepo.save(step);
        }
      }
    }

    // Abort workflow
    await abortWorkflow(
      workflowInstanceId,
      this.config.workflowRepo,
      this.config.valuePropertyRepo,
      this.config.resourcePoolRepo,
      this.config.executionLogger,
    );

    this.config.eventBus.emit('WORKFLOW_ABORTED', { workflowInstanceId });
    this.activeWorkflows.delete(workflowInstanceId);
  }

  /**
   * Stop a workflow (orderly shutdown).
   */
  async stop(workflowInstanceId: string): Promise<void> {
    const runnerState = this.activeWorkflows.get(workflowInstanceId);
    if (!runnerState) {
      throw new Error(`Runner state for workflow ${workflowInstanceId} not found`);
    }

    // Stop child workflows FIRST (clean up children before parent)
    const steps = await this.config.stepRepo.getByWorkflow(workflowInstanceId);
    for (const step of steps) {
      if (step.step_type === 'WORKFLOW_PROXY' && step.child_workflow_instance_id) {
        if (this.activeWorkflows.has(step.child_workflow_instance_id)) {
          await this.stop(step.child_workflow_instance_id);
        }
      }
    }

    // Stop all active parent steps
    for (const step of steps) {
      if (ACTIVE_STATES.has(step.step_state)) {
        const sm = runnerState.stateMachines.get(step.step_oid);
        if (sm && sm.canSend('STOP')) {
          sm.send('STOP');
          step.step_state = 'STOPPING';
          await this.config.stepRepo.save(step);

          // Auto-complete STOPPING -> COMPLETED
          sm.send('SC');
          step.step_state = 'COMPLETED';
          await this.config.stepRepo.save(step);
        }
      }
    }

    // Update workflow state
    const workflow = await this.config.workflowRepo.getById(workflowInstanceId);
    if (workflow) {
      workflow.workflow_state = 'STOPPED';
      workflow.completed_at = new Date().toISOString();
      workflow.last_activity_at = new Date().toISOString();
      await this.config.workflowRepo.save(workflow);
    }

    await this.config.executionLogger.log({
      workflow_instance_id: workflowInstanceId,
      event_type: 'WORKFLOW_STOPPED',
      event_data_json: JSON.stringify({ stopped_at: new Date().toISOString() }),
      timestamp: new Date().toISOString(),
    });

    this.config.eventBus.emit('WORKFLOW_STOPPED', { workflowInstanceId });
    this.activeWorkflows.delete(workflowInstanceId);
  }

  /**
   * Get the active workflows map (for testing/recovery).
   */
  getActiveWorkflows(): Map<string, WorkflowRunnerState> {
    return this.activeWorkflows;
  }

  /**
   * Restore a runner state into the active workflows map.
   * Used by crash recovery to re-register recovered workflows.
   */
  restoreWorkflowState(state: WorkflowRunnerState): void {
    this.activeWorkflows.set(state.workflowInstanceId, state);
  }

  /**
   * Start a child workflow using direct step activation.
   * This bypasses the event queue to avoid deadlock when called from within
   * the event queue handler (e.g., during WORKFLOW_PROXY step execution).
   */
  async startChildWorkflowDirect(workflowInstanceId: string): Promise<void> {
    const workflow = await this.config.workflowRepo.getById(workflowInstanceId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowInstanceId} not found`);
    }

    // Update workflow state to RUNNING
    workflow.workflow_state = 'RUNNING';
    workflow.started_at = new Date().toISOString();
    workflow.last_activity_at = new Date().toISOString();
    await this.config.workflowRepo.save(workflow);

    // Log workflow started
    await this.config.executionLogger.log({
      workflow_instance_id: workflowInstanceId,
      event_type: 'WORKFLOW_STARTED',
      event_data_json: JSON.stringify({ started_at: workflow.started_at }),
      timestamp: new Date().toISOString(),
    });

    this.config.eventBus.emit('WORKFLOW_STARTED', { workflowInstanceId });

    // Find START step
    const runnerState = this.activeWorkflows.get(workflowInstanceId);
    if (!runnerState) {
      throw new Error(`Runner state for workflow ${workflowInstanceId} not found`);
    }

    const startStepOid = this.findStartStepOid(runnerState);
    if (!startStepOid) {
      throw new Error(`No START step found in workflow ${workflowInstanceId}`);
    }

    const startStepInstanceId = runnerState.stepOidToInstanceId.get(startStepOid)!;

    // DIRECT activation -- do NOT use eventQueue.enqueue (avoids deadlock)
    await this.activateStep(workflowInstanceId, startStepOid, startStepInstanceId);
  }

  /**
   * Create a child workflow linked to a parent workflow and step.
   * Sets parent_workflow_instance_id and parent_step_oid on the child.
   */
  async createChildWorkflow(
    childSpec: MasterWorkflowSpecification,
    parentWorkflowInstanceId: string,
    parentStepOid: string,
  ): Promise<string> {
    // Child workflow specs are embedded in the parent's specification_json and
    // do NOT have their own row in master_workflows.  The runtime_workflows
    // table has FK: master_workflow_oid -> master_workflows(oid).  To satisfy
    // this constraint we use the PARENT's master_workflow_oid (the child is
    // logically part of the same package).
    const parentWf = await this.config.workflowRepo.getById(parentWorkflowInstanceId);
    const parentMasterOid = parentWf?.master_workflow_oid ?? childSpec.oid;

    const { workflow, steps, connections } = createRuntimeWorkflow(
      childSpec,
      this.config.idGenerator,
    );

    // Set parent link and override master OID BEFORE saving (avoids FK error)
    workflow.master_workflow_oid = parentMasterOid;
    workflow.parent_workflow_instance_id = parentWorkflowInstanceId;
    workflow.parent_step_oid = parentStepOid;

    // Save to repositories
    await this.config.workflowRepo.save(workflow);
    await this.config.stepRepo.saveMany(steps);
    await this.config.connectionRepo.saveMany(workflow.instance_id, connections);

    // Initialize Value Properties from child spec defaults
    if (childSpec.value_property_specifications?.length > 0) {
      await this.config.valuePropertyRepo.initializeFromSpec(
        'workflow',
        workflow.instance_id,
        childSpec.value_property_specifications,
      );
    }

    // Initialize resource pools
    if (childSpec.resource_property_specifications?.length > 0) {
      await this.resourceManager.initializePools(
        'workflow',
        workflow.instance_id,
        childSpec.resource_property_specifications,
      );
    }

    // Build scheduler adjacency lists
    const { outgoing, incoming } = this.scheduler.buildAdjacencyLists(connections);

    // Create step maps
    const stepsMap = new Map<string, RuntimeWorkflowStep>();
    const stepOidToInstanceId = new Map<string, string>();
    const stepInstanceIdToOid = new Map<string, string>();

    for (const step of steps) {
      stepsMap.set(step.step_oid, step);
      stepOidToInstanceId.set(step.step_oid, step.instance_id);
      stepInstanceIdToOid.set(step.instance_id, step.step_oid);
    }

    // Create StateMachine instances for each step
    const stateMachines = new Map<string, StateMachine<StepState, StateEvent>>();
    for (const step of steps) {
      const sm = new StateMachine<StepState, StateEvent>({
        initialState: 'IDLE',
        transitions: ISA88_OBSERVABLE_TRANSITIONS,
      });
      stateMachines.set(step.step_oid, sm);
    }

    // Store workflow runner state
    const runnerState: WorkflowRunnerState = {
      workflowInstanceId: workflow.instance_id,
      masterWorkflowOid: childSpec.oid,
      stateMachines,
      schedulerContext: { outgoing, incoming, steps: stepsMap, connections },
      stepOidToInstanceId,
      stepInstanceIdToOid,
    };
    this.activeWorkflows.set(workflow.instance_id, runnerState);

    // Log creation
    await this.config.executionLogger.log({
      workflow_instance_id: workflow.instance_id,
      event_type: 'WORKFLOW_CREATED',
      event_data_json: JSON.stringify({
        masterOid: childSpec.oid,
        parentWorkflowInstanceId,
        parentStepOid,
      }),
      timestamp: new Date().toISOString(),
    });

    return workflow.instance_id;
  }

  // -------------------------------------------------------------------------
  // Internal: Event Queue Handler
  // -------------------------------------------------------------------------

  /**
   * Handle a single event from the serial event queue.
   * This is the CRITICAL serialization point -- only one event is processed
   * at a time, preventing race conditions in parallel branches.
   */
  private async handleEvent(event: EngineEvent): Promise<void> {
    switch (event.type) {
      case 'STEP_ACTIVATED':
        await this.activateStep(
          event.workflowInstanceId,
          event.stepOid,
          event.stepInstanceId,
        );
        break;

      case 'STEP_STATE_CHANGED':
        // Handle user input submission: EXECUTING -> COMPLETING
        if (event.fromState === 'EXECUTING' && event.toState === 'COMPLETING') {
          await this.handleUserInputCompletion(
            event.workflowInstanceId,
            event.stepOid,
            event.stepInstanceId,
          );
        }
        break;

      default:
        // Other events pass through (logging, etc.)
        break;
    }
  }

  // -------------------------------------------------------------------------
  // Internal: Step Activation
  // -------------------------------------------------------------------------

  /**
   * Activate a step: transition IDLE -> WAITING -> STARTING -> EXECUTING.
   * If the step auto-completes, continue to COMPLETING -> COMPLETED.
   */
  private async activateStep(
    workflowInstanceId: string,
    stepOid: string,
    stepInstanceId: string,
  ): Promise<void> {
    const runnerState = this.activeWorkflows.get(workflowInstanceId);
    if (!runnerState) return;

    const step = await this.config.stepRepo.getById(stepInstanceId);
    if (!step) return;

    const sm = runnerState.stateMachines.get(stepOid);
    if (!sm) return;

    // Update last activity
    await this.config.workflowRepo.updateLastActivity(
      workflowInstanceId,
      new Date().toISOString(),
    );

    // Transition: IDLE -> WAITING (START event)
    const fromIdle = sm.getState();
    sm.send('START');
    step.step_state = 'WAITING';
    step.activated_at = new Date().toISOString();
    await this.config.stepRepo.save(step);

    await this.config.executionLogger.log({
      workflow_instance_id: workflowInstanceId,
      step_oid: stepOid,
      step_instance_id: stepInstanceId,
      event_type: 'STEP_STATE_CHANGED',
      event_data_json: JSON.stringify({ fromState: fromIdle, toState: 'WAITING', event: 'START' }),
      timestamp: new Date().toISOString(),
    });

    this.config.eventBus.emit('STEP_STATE_CHANGED', {
      stepInstanceId,
      workflowInstanceId,
      stepOid,
      fromState: fromIdle,
      toState: 'WAITING',
      event: 'START',
    });

    // Check resource commands (simplified: skip if none)
    const masterStep = this.getMasterStep(step);
    const hasResourceCommands = masterStep.resource_command_specifications?.length > 0;

    if (hasResourceCommands) {
      // Try to acquire resources
      const acquireCommands = masterStep.resource_command_specifications.filter(
        (cmd) => cmd.command_type === 'Acquire',
      );

      if (acquireCommands.length > 0) {
        const requests = acquireCommands.map((cmd) => ({
          step_instance_id: stepInstanceId,
          workflow_instance_id: workflowInstanceId,
          command_type: cmd.command_type,
          resource_name: cmd.resource_name,
          amount: cmd.amount ?? 1,
          scope: 'workflow' as const,
          scope_id: workflowInstanceId,
        }));

        const { allAcquired } = await this.resourceManager.acquireAll(requests);

        if (!allAcquired) {
          // Step stays in WAITING until resources are granted
          return;
        }
      }
    }

    // Transition: WAITING -> STARTING (SC event)
    const fromWaiting = sm.getState();
    sm.send('SC');
    step.step_state = 'STARTING';
    await this.config.stepRepo.save(step);

    await this.config.executionLogger.log({
      workflow_instance_id: workflowInstanceId,
      step_oid: stepOid,
      step_instance_id: stepInstanceId,
      event_type: 'STEP_STATE_CHANGED',
      event_data_json: JSON.stringify({ fromState: fromWaiting, toState: 'STARTING', event: 'SC' }),
      timestamp: new Date().toISOString(),
    });

    this.config.eventBus.emit('STEP_STATE_CHANGED', {
      stepInstanceId,
      workflowInstanceId,
      stepOid,
      fromState: fromWaiting,
      toState: 'STARTING',
      event: 'SC',
    });

    // Execute STARTING phase
    const ctx = this.buildStepContext(workflowInstanceId, step, masterStep, sm);
    await executeStartingPhase(ctx);

    // Refresh step from repo (executeStartingPhase updates it)
    const updatedStep = await this.config.stepRepo.getById(stepInstanceId);
    if (!updatedStep) return;

    // Execute EXECUTING phase
    const execCtx = this.buildStepContext(workflowInstanceId, updatedStep, masterStep, sm);
    const autoCompleted = await executeExecutingPhase(execCtx);

    if (autoCompleted) {
      // Refresh step again
      const completingStep = await this.config.stepRepo.getById(stepInstanceId);
      if (!completingStep) return;

      // Execute COMPLETING phase
      const compCtx = this.buildStepContext(workflowInstanceId, completingStep, masterStep, sm);
      await executeCompletingPhase(compCtx);

      // Step is now COMPLETED -- handle completion
      await this.onStepCompleted(workflowInstanceId, stepOid, stepInstanceId);
    }
    // If not auto-completed, step stays in EXECUTING (waiting for user input)
  }

  // -------------------------------------------------------------------------
  // Internal: User Input Completion
  // -------------------------------------------------------------------------

  /**
   * Handle completion of a user input step after submitUserInput is called.
   */
  private async handleUserInputCompletion(
    workflowInstanceId: string,
    stepOid: string,
    stepInstanceId: string,
  ): Promise<void> {
    const runnerState = this.activeWorkflows.get(workflowInstanceId);
    if (!runnerState) return;

    const step = await this.config.stepRepo.getById(stepInstanceId);
    if (!step) return;

    const sm = runnerState.stateMachines.get(stepOid);
    if (!sm) return;

    const masterStep = this.getMasterStep(step);

    // Transition: EXECUTING -> COMPLETING
    const fromState = sm.getState();
    sm.send('SC');
    step.step_state = 'COMPLETING';
    await this.config.stepRepo.save(step);

    await this.config.executionLogger.log({
      workflow_instance_id: workflowInstanceId,
      step_oid: stepOid,
      step_instance_id: stepInstanceId,
      event_type: 'STEP_STATE_CHANGED',
      event_data_json: JSON.stringify({ fromState, toState: 'COMPLETING', event: 'SC' }),
      timestamp: new Date().toISOString(),
    });

    // Execute COMPLETING phase
    const ctx = this.buildStepContext(workflowInstanceId, step, masterStep, sm);
    await executeCompletingPhase(ctx);

    // Step is now COMPLETED -- handle completion
    await this.onStepCompleted(workflowInstanceId, stepOid, stepInstanceId);
  }

  // -------------------------------------------------------------------------
  // Internal: Step Completion
  // -------------------------------------------------------------------------

  /**
   * Handle step completion: determine next steps and activate them.
   */
  private async onStepCompleted(
    workflowInstanceId: string,
    stepOid: string,
    stepInstanceId: string,
  ): Promise<void> {
    const runnerState = this.activeWorkflows.get(workflowInstanceId);
    if (!runnerState) return;

    // Update last activity
    await this.config.workflowRepo.updateLastActivity(
      workflowInstanceId,
      new Date().toISOString(),
    );

    // Refresh step state in the scheduler context
    const completedStep = await this.config.stepRepo.getById(stepInstanceId);
    if (completedStep) {
      runnerState.schedulerContext.steps.set(stepOid, completedStep);
    }

    // Check if this is an END step -> complete workflow
    const step = runnerState.schedulerContext.steps.get(stepOid);
    if (step?.step_type === 'END') {
      // Check if this is a child workflow completing
      const workflow = await this.config.workflowRepo.getById(workflowInstanceId);
      if (workflow?.parent_workflow_instance_id) {
        // CHILD WORKFLOW COMPLETING -- propagate outputs BEFORE completeWorkflow
        // (completeWorkflow deletes Value Properties via deleteByWorkflow)
        const parentRunnerState = this.activeWorkflows.get(workflow.parent_workflow_instance_id);
        if (parentRunnerState && workflow.parent_step_oid) {
          // Read child workflow's output Value Properties
          const outputProperties = await this.config.valuePropertyRepo.getAllByWorkflow(workflowInstanceId);

          // Find parent step
          const parentStepInstanceId = parentRunnerState.stepOidToInstanceId.get(workflow.parent_step_oid);
          if (parentStepInstanceId) {
            const parentStep = await this.config.stepRepo.getById(parentStepInstanceId);
            if (parentStep) {
              // Propagate outputs to parent step's resolved_outputs_json
              parentStep.resolved_outputs_json = JSON.stringify(outputProperties);
              await this.config.stepRepo.save(parentStep);
            }
          }

          // Now complete the child workflow (this deletes Value Properties)
          await completeWorkflow(
            workflowInstanceId,
            this.config.workflowRepo,
            this.config.valuePropertyRepo,
            this.config.resourcePoolRepo,
            this.config.executionLogger,
          );
          this.config.eventBus.emit('WORKFLOW_COMPLETED', { workflowInstanceId });

          // Resume parent step: EXECUTING -> COMPLETING -> COMPLETED
          // Use DIRECT call (we are inside event queue handler -- avoids Pitfall 3)
          if (parentStepInstanceId) {
            await this.handleUserInputCompletion(
              workflow.parent_workflow_instance_id,
              workflow.parent_step_oid,
              parentStepInstanceId,
            );
          }

          // Clean up child from active workflows
          this.activeWorkflows.delete(workflowInstanceId);
          return;
        }
      }

      // Top-level workflow completing (no parent)
      await completeWorkflow(
        workflowInstanceId,
        this.config.workflowRepo,
        this.config.valuePropertyRepo,
        this.config.resourcePoolRepo,
        this.config.executionLogger,
      );
      this.config.eventBus.emit('WORKFLOW_COMPLETED', { workflowInstanceId });
      this.activeWorkflows.delete(workflowInstanceId);
      return;
    }

    // Determine next steps via scheduler
    let nextStepOids: string[];

    // Special handling for PARALLEL and SELECT_1 steps
    if (step?.step_type === 'PARALLEL') {
      // PARALLEL: activate ALL outgoing branches
      nextStepOids = this.scheduler.getParallelBranchSteps(
        stepOid,
        runnerState.schedulerContext,
      );
    } else if (step?.step_type === 'SELECT_1') {
      // SELECT_1: only activate the matched branch
      const resolvedOutputs = completedStep?.resolved_outputs_json
        ? JSON.parse(completedStep.resolved_outputs_json) as { matchedConnectionId: string }
        : null;

      if (resolvedOutputs?.matchedConnectionId) {
        // Find the connection with the matched ID and get its target step
        const matchedConn = runnerState.schedulerContext.connections.find(
          (c) => c.connection_id === resolvedOutputs.matchedConnectionId,
        );
        nextStepOids = matchedConn ? [matchedConn.to_step_oid] : [];
      } else {
        nextStepOids = [];
      }
    } else {
      // Normal steps: use scheduler to get next steps
      nextStepOids = this.scheduler.getNextSteps(stepOid, runnerState.schedulerContext);
    }

    // Log scheduler decision
    const activatedStepIds = nextStepOids.map(
      (oid) => runnerState.stepOidToInstanceId.get(oid)!,
    ).filter(Boolean);

    await this.config.executionLogger.log({
      workflow_instance_id: workflowInstanceId,
      step_oid: stepOid,
      step_instance_id: stepInstanceId,
      event_type: 'SCHEDULER_ACTIVATED_STEPS',
      event_data_json: JSON.stringify({
        completedStepOid: stepOid,
        activatedStepOids: nextStepOids,
      }),
      timestamp: new Date().toISOString(),
    });

    this.config.eventBus.emit('SCHEDULER_DECISION', {
      completedStepId: stepInstanceId,
      activatedStepIds,
    });

    // Activate next steps through the event queue
    for (const nextOid of nextStepOids) {
      const nextInstanceId = runnerState.stepOidToInstanceId.get(nextOid);
      if (nextInstanceId) {
        // Use direct activation (we are already inside the event queue handler)
        await this.activateStep(workflowInstanceId, nextOid, nextInstanceId);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Internal Helpers
  // -------------------------------------------------------------------------

  private findStartStepOid(runnerState: WorkflowRunnerState): string | undefined {
    for (const [stepOid, step] of runnerState.schedulerContext.steps) {
      if (step.step_type === 'START') {
        return stepOid;
      }
    }
    return undefined;
  }

  private getMasterStep(step: RuntimeWorkflowStep): MasterWorkflowStep {
    return JSON.parse(step.step_json) as MasterWorkflowStep;
  }

  private buildStepContext(
    workflowInstanceId: string,
    step: RuntimeWorkflowStep,
    masterStep: MasterWorkflowStep,
    stateMachine: StateMachine<StepState, StateEvent>,
  ): StepExecutionContext {
    const runnerState = this.activeWorkflows.get(workflowInstanceId);
    return {
      workflowInstanceId,
      step,
      masterStep,
      stateMachine,
      parameterResolver: this.parameterResolver,
      conditionEvaluator: this.conditionEvaluator,
      eventBus: this.config.eventBus,
      executionLogger: this.config.executionLogger,
      stepRepo: this.config.stepRepo,
      connections: runnerState?.schedulerContext.connections ?? [],
      runner: this,
      workflowRepo: this.config.workflowRepo,
    };
  }
}
