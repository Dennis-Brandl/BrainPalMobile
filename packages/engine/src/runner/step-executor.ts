// Step executor: step-type-specific execution logic for each ISA-88 phase.
// Called by WorkflowRunner when a step enters STARTING, EXECUTING, or COMPLETING.

import type { StateMachine } from '../state-machine/state-machine';
import type { StepState, StateEvent, StepType } from '../types/common';
import type {
  RuntimeWorkflowStep,
  WorkflowConnection,
} from '../types/runtime';
import type {
  MasterWorkflowStep,
  MasterWorkflowSpecification,
  OutputParameterSpecification,
} from '../types/master';
import type { ParameterResolver } from '../parameter-resolver/parameter-resolver';
import type { ConditionEvaluator } from '../condition-evaluator/condition-evaluator';
import type { EngineEventBus } from '../events/event-bus';
import type { IExecutionLogger } from '../interfaces/logger';
import type { IStepRepository, IWorkflowRepository } from '../interfaces/storage';
import type { IWorkflowRunnerForProxy } from './types';

// ---------------------------------------------------------------------------
// UnsupportedStepTypeError
// ---------------------------------------------------------------------------

export class UnsupportedStepTypeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedStepTypeError';
  }
}

// ---------------------------------------------------------------------------
// StepExecutionContext
// ---------------------------------------------------------------------------

export interface StepExecutionContext {
  workflowInstanceId: string;
  step: RuntimeWorkflowStep;
  masterStep: MasterWorkflowStep;
  stateMachine: StateMachine<StepState, StateEvent>;
  parameterResolver: ParameterResolver;
  conditionEvaluator: ConditionEvaluator;
  eventBus: EngineEventBus;
  executionLogger: IExecutionLogger;
  stepRepo: IStepRepository;
  connections: WorkflowConnection[];
  /** Only provided for WORKFLOW_PROXY steps */
  runner?: IWorkflowRunnerForProxy;
  /** Only provided for WORKFLOW_PROXY steps */
  workflowRepo?: IWorkflowRepository;
}

// ---------------------------------------------------------------------------
// STARTING Phase
// ---------------------------------------------------------------------------

/**
 * Execute the STARTING phase for a step.
 * Resolves input parameters, stores them on the step, and transitions to EXECUTING.
 */
export async function executeStartingPhase(
  ctx: StepExecutionContext,
): Promise<void> {
  const { step, masterStep, stateMachine, parameterResolver, eventBus, executionLogger, stepRepo, workflowInstanceId } = ctx;

  // Resolve input parameters
  if (masterStep.input_parameter_specifications?.length > 0) {
    const result = await parameterResolver.resolveInputs(
      workflowInstanceId,
      masterStep.input_parameter_specifications,
    );

    // Store resolved inputs on step
    step.resolved_inputs_json = JSON.stringify(result.resolved);
    await stepRepo.save(step);

    // Log PARAMETER_INPUT_RESOLVED
    for (const resolved of result.resolved) {
      await executionLogger.log({
        workflow_instance_id: workflowInstanceId,
        step_oid: step.step_oid,
        step_instance_id: step.instance_id,
        event_type: 'PARAMETER_INPUT_RESOLVED',
        event_data_json: JSON.stringify({ paramId: resolved.id, value: resolved.value, source: resolved.source }),
        timestamp: new Date().toISOString(),
      });

      eventBus.emit('PARAMETER_RESOLVED', {
        stepInstanceId: step.instance_id,
        paramName: resolved.id,
        value: resolved.value,
      });
    }
  }

  // Transition: STARTING -> EXECUTING
  const fromState = stateMachine.getState();
  stateMachine.send('SC');
  step.step_state = 'EXECUTING';
  step.started_at = new Date().toISOString();
  await stepRepo.save(step);

  await logStateChange(executionLogger, eventBus, workflowInstanceId, step, fromState, 'EXECUTING', 'SC');
}

// ---------------------------------------------------------------------------
// EXECUTING Phase
// ---------------------------------------------------------------------------

/**
 * Execute the EXECUTING phase for a step.
 * Behavior depends on step type. Some steps auto-complete, others wait.
 *
 * @returns true if the step auto-completes (caller should proceed to COMPLETING).
 */
export async function executeExecutingPhase(
  ctx: StepExecutionContext,
): Promise<boolean> {
  const { step, masterStep, stateMachine, conditionEvaluator, eventBus, executionLogger, stepRepo, workflowInstanceId, connections } = ctx;

  switch (step.step_type as StepType) {
    case 'START': {
      // Auto-complete immediately
      const fromState = stateMachine.getState();
      stateMachine.send('SC');
      step.step_state = 'COMPLETING';
      await stepRepo.save(step);
      await logStateChange(executionLogger, eventBus, workflowInstanceId, step, fromState, 'COMPLETING', 'SC');
      return true;
    }

    case 'END': {
      // Auto-complete immediately
      const fromState = stateMachine.getState();
      stateMachine.send('SC');
      step.step_state = 'COMPLETING';
      await stepRepo.save(step);
      await logStateChange(executionLogger, eventBus, workflowInstanceId, step, fromState, 'COMPLETING', 'SC');
      return true;
    }

    case 'USER_INTERACTION': {
      // Wait for user input
      eventBus.emit('USER_INPUT_REQUIRED', {
        stepInstanceId: step.instance_id,
        workflowInstanceId,
        stepOid: step.step_oid,
      });
      return false;
    }

    case 'YES_NO': {
      // Wait for user input (yes/no choice)
      eventBus.emit('USER_INPUT_REQUIRED', {
        stepInstanceId: step.instance_id,
        workflowInstanceId,
        stepOid: step.step_oid,
      });
      return false;
    }

    case 'SELECT_1': {
      // Evaluate conditions and follow matched branch
      const config = masterStep.select1_config;
      if (!config) {
        throw new Error(`SELECT_1 step ${step.step_oid} missing select1_config`);
      }

      // Get the input value (from resolved inputs)
      let inputValue = '';
      if (step.resolved_inputs_json) {
        const resolvedInputs = JSON.parse(step.resolved_inputs_json) as Array<{ id: string; value: string }>;
        const inputParam = resolvedInputs.find((r) => r.id === config.input_name);
        if (inputParam) {
          inputValue = inputParam.value;
        }
      }

      // Build conditions from the step's condition_connections or select1_config options
      const conditions = (masterStep.condition_connections ?? []).length > 0
        ? masterStep.condition_connections!
        : config.options.map((opt) => ({
            connection_id: opt.connection_id,
            operator: opt.operator,
            expected_value: opt.value,
            value_type: config.input_value_type,
          }));

      const matchedConnectionId = conditionEvaluator.evaluate(
        { inputValue, conditions },
        step.step_oid,
        step.instance_id,
      );

      // Log condition evaluation
      await executionLogger.log({
        workflow_instance_id: workflowInstanceId,
        step_oid: step.step_oid,
        step_instance_id: step.instance_id,
        event_type: 'CONDITION_EVALUATED',
        event_data_json: JSON.stringify({ inputValue, matchedConnectionId }),
        timestamp: new Date().toISOString(),
      });

      eventBus.emit('CONDITION_EVALUATED', {
        stepInstanceId: step.instance_id,
        matchedConnectionId,
      });

      // Store the matched connection on the step for use during completion
      step.resolved_outputs_json = JSON.stringify({ matchedConnectionId });
      await stepRepo.save(step);

      // Auto-complete
      const fromState = stateMachine.getState();
      stateMachine.send('SC');
      step.step_state = 'COMPLETING';
      await stepRepo.save(step);
      await logStateChange(executionLogger, eventBus, workflowInstanceId, step, fromState, 'COMPLETING', 'SC');
      return true;
    }

    case 'PARALLEL': {
      // Auto-complete immediately. The scheduler handles branch activation.
      const fromState = stateMachine.getState();
      stateMachine.send('SC');
      step.step_state = 'COMPLETING';
      await stepRepo.save(step);
      await logStateChange(executionLogger, eventBus, workflowInstanceId, step, fromState, 'COMPLETING', 'SC');
      return true;
    }

    case 'WAIT_ALL': {
      // Auto-complete immediately. The scheduler already verified all branches done.
      const fromState = stateMachine.getState();
      stateMachine.send('SC');
      step.step_state = 'COMPLETING';
      await stepRepo.save(step);
      await logStateChange(executionLogger, eventBus, workflowInstanceId, step, fromState, 'COMPLETING', 'SC');
      return true;
    }

    case 'WAIT_ANY': {
      // Auto-complete immediately. The scheduler already verified at least one branch done.
      const fromState = stateMachine.getState();
      stateMachine.send('SC');
      step.step_state = 'COMPLETING';
      await stepRepo.save(step);
      await logStateChange(executionLogger, eventBus, workflowInstanceId, step, fromState, 'COMPLETING', 'SC');
      return true;
    }

    case 'WORKFLOW_PROXY': {
      // Create and start a child workflow
      if (!ctx.runner || !ctx.workflowRepo) {
        throw new Error('WORKFLOW_PROXY step requires runner and workflowRepo in context');
      }

      // Get the parent workflow's full specification to find child workflows
      const parentWorkflow = await ctx.workflowRepo.getById(ctx.workflowInstanceId);
      if (!parentWorkflow) {
        throw new Error(`Parent workflow ${ctx.workflowInstanceId} not found`);
      }
      const parentSpec = JSON.parse(parentWorkflow.specification_json) as MasterWorkflowSpecification;

      // Resolve which child workflow this WORKFLOW_PROXY step invokes
      const childWorkflows = parentSpec.child_workflows ?? [];
      let childSpec: MasterWorkflowSpecification | undefined;

      if (childWorkflows.length === 1) {
        // Single child -- use directly (most common case)
        childSpec = childWorkflows[0];
      } else if (childWorkflows.length > 1) {
        // Try matching step description against child local_id
        const stepDesc = (masterStep.description ?? '').trim().toLowerCase();
        childSpec = childWorkflows.find(
          (cw) => cw.local_id.trim().toLowerCase() === stepDesc,
        );

        // Try matching step local_id against child local_id
        if (!childSpec) {
          const stepLocalId = masterStep.local_id.trim().toLowerCase();
          childSpec = childWorkflows.find(
            (cw) => cw.local_id.trim().toLowerCase() === stepLocalId,
          );
        }

        // Positional fallback: find this step's index among all WORKFLOW_PROXY steps
        if (!childSpec) {
          const proxySteps = (parentSpec.steps ?? []).filter((s) => s.step_type === 'WORKFLOW_PROXY');
          const proxyIndex = proxySteps.findIndex((s) => s.oid === step.step_oid);
          if (proxyIndex >= 0 && proxyIndex < childWorkflows.length) {
            childSpec = childWorkflows[proxyIndex];
          }
        }
      }

      if (!childSpec) {
        const available = childWorkflows.map((cw) => cw.local_id).join(', ');
        throw new Error(
          `WORKFLOW_PROXY step ${step.step_oid} could not match a child workflow. ` +
          `Available child workflows: [${available}]`,
        );
      }

      // Create and start child workflow
      const childInstanceId = await ctx.runner.createChildWorkflow(
        childSpec,
        ctx.workflowInstanceId,
        ctx.step.step_oid,
      );

      // Save child reference on parent step
      ctx.step.child_workflow_instance_id = childInstanceId;
      await ctx.stepRepo.save(ctx.step);

      // Start the child workflow using direct activation (bypasses event queue
      // to avoid deadlock -- we are already inside the event queue handler)
      await ctx.runner.startChildWorkflowDirect(childInstanceId);

      // Return false -- parent step stays in EXECUTING while child runs
      return false;
    }

    case 'ACTION_PROXY': {
      throw new UnsupportedStepTypeError('ACTION_PROXY steps require action server configuration (v2 feature)');
    }

    case 'SCRIPT': {
      throw new UnsupportedStepTypeError('SCRIPT steps require Pyodide (v2 feature)');
    }

    default: {
      throw new UnsupportedStepTypeError(`Unknown step type: ${step.step_type}`);
    }
  }
}

// ---------------------------------------------------------------------------
// COMPLETING Phase
// ---------------------------------------------------------------------------

/**
 * Execute the COMPLETING phase for a step.
 * Writes output parameters and transitions to COMPLETED.
 */
export async function executeCompletingPhase(
  ctx: StepExecutionContext,
): Promise<void> {
  const { step, masterStep, stateMachine, parameterResolver, eventBus, executionLogger, stepRepo, workflowInstanceId } = ctx;

  // Write output parameters
  if (masterStep.output_parameter_specifications?.length > 0) {
    // Build resolved values map from user inputs or resolved inputs
    const resolvedValues = new Map<string, string>();

    // For user interaction steps: use user_inputs_json
    if (step.user_inputs_json) {
      const userInputs = JSON.parse(step.user_inputs_json) as Record<string, string>;
      for (const output of masterStep.output_parameter_specifications) {
        const value = userInputs[output.id];
        if (value !== undefined) {
          resolvedValues.set(output.id, value);
        }
      }
    }

    // For other steps: use resolved_inputs_json values
    if (step.resolved_inputs_json && resolvedValues.size === 0) {
      const resolvedInputs = JSON.parse(step.resolved_inputs_json) as Array<{ id: string; value: string }>;
      for (const input of resolvedInputs) {
        resolvedValues.set(input.id, input.value);
      }
    }

    await parameterResolver.writeOutputs(
      workflowInstanceId,
      masterStep.output_parameter_specifications,
      resolvedValues,
    );

    // Log PARAMETER_OUTPUT_WRITTEN
    for (const output of masterStep.output_parameter_specifications) {
      const value = resolvedValues.get(output.id);
      if (value !== undefined) {
        await executionLogger.log({
          workflow_instance_id: workflowInstanceId,
          step_oid: step.step_oid,
          step_instance_id: step.instance_id,
          event_type: 'PARAMETER_OUTPUT_WRITTEN',
          event_data_json: JSON.stringify({
            paramId: output.id,
            targetProperty: output.target_property_name,
            targetEntry: output.target_entry_name,
            value,
          }),
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  // Transition: COMPLETING -> COMPLETED
  const fromState = stateMachine.getState();
  stateMachine.send('SC');
  step.step_state = 'COMPLETED';
  step.completed_at = new Date().toISOString();
  await stepRepo.save(step);

  await logStateChange(executionLogger, eventBus, workflowInstanceId, step, fromState, 'COMPLETED', 'SC');
}

// ---------------------------------------------------------------------------
// Helper: log state change
// ---------------------------------------------------------------------------

async function logStateChange(
  executionLogger: IExecutionLogger,
  eventBus: EngineEventBus,
  workflowInstanceId: string,
  step: RuntimeWorkflowStep,
  fromState: StepState,
  toState: StepState,
  event: StateEvent,
): Promise<void> {
  await executionLogger.log({
    workflow_instance_id: workflowInstanceId,
    step_oid: step.step_oid,
    step_instance_id: step.instance_id,
    event_type: 'STEP_STATE_CHANGED',
    event_data_json: JSON.stringify({ fromState, toState, event }),
    timestamp: new Date().toISOString(),
  });

  eventBus.emit('STEP_STATE_CHANGED', {
    stepInstanceId: step.instance_id,
    workflowInstanceId,
    stepOid: step.step_oid,
    fromState,
    toState,
    event,
  });
}
