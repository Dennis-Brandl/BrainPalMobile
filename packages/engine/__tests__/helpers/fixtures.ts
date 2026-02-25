// Test fixtures for creating well-formed workflow specifications.
// Used by tests across all engine plans (state machine, scheduler, etc.).

import type { MasterWorkflowSpecification, MasterWorkflowStep } from '../../src/types/master';
import type { StepType } from '../../src/types/common';

// ---------------------------------------------------------------------------
// Helper to create a minimal MasterWorkflowStep
// ---------------------------------------------------------------------------

function makeStep(
  oid: string,
  localId: string,
  stepType: StepType,
  x: number,
  y: number,
): MasterWorkflowStep {
  return {
    local_id: localId,
    oid,
    version: '1.0.0',
    last_modified_date: '2026-01-01T00:00:00Z',
    schemaVersion: '4.0',
    step_type: stepType,
    position: { x, y },
    input_parameter_specifications: [],
    output_parameter_specifications: [],
    value_property_specifications: [],
    resource_command_specifications: [],
  };
}

// ---------------------------------------------------------------------------
// makeLinearWorkflow
// ---------------------------------------------------------------------------

/**
 * Creates a linear workflow: START -> N user_interaction steps -> END.
 * Each step is connected to the next in sequence.
 *
 * @param stepCount Number of user interaction steps between START and END.
 */
export function makeLinearWorkflow(stepCount: number): MasterWorkflowSpecification {
  const steps: MasterWorkflowStep[] = [];
  const connections: MasterWorkflowSpecification['connections'] = [];

  // START node
  const startStep = makeStep('step-start', 'Start', 'START', 100, 0);
  steps.push(startStep);

  // User interaction steps
  for (let i = 1; i <= stepCount; i++) {
    const step = makeStep(
      `step-ui-${i}`,
      `User Step ${i}`,
      'USER_INTERACTION',
      100,
      i * 150,
    );
    step.ui_parameter_specifications = [
      {
        id: `input-${i}`,
        label: `Input ${i}`,
        ui_type: 'text',
        required: true,
        default_value: '',
        value_type: 'literal',
      },
    ];
    steps.push(step);
  }

  // END node
  const endStep = makeStep('step-end', 'End', 'END', 100, (stepCount + 1) * 150);
  steps.push(endStep);

  // Connect: START -> step-ui-1 -> step-ui-2 -> ... -> END
  connections.push({
    from_step_id: 'step-start',
    to_step_id: stepCount > 0 ? 'step-ui-1' : 'step-end',
    connection_id: 'conn-start',
  });

  for (let i = 1; i <= stepCount; i++) {
    const nextId = i < stepCount ? `step-ui-${i + 1}` : 'step-end';
    connections.push({
      from_step_id: `step-ui-${i}`,
      to_step_id: nextId,
      connection_id: `conn-${i}`,
    });
  }

  return {
    local_id: `Linear Workflow (${stepCount} steps)`,
    oid: `wf-linear-${stepCount}`,
    version: '1.0.0',
    last_modified_date: '2026-01-01T00:00:00Z',
    schemaVersion: '4.0',
    steps,
    connections,
    viewport: { x: 0, y: 0, zoom: 1 },
    starting_parameter_specifications: [],
    output_parameter_specifications: [],
    value_property_specifications: [],
    resource_property_specifications: [],
    environment_specifications: [],
    child_workflows: [],
  };
}

// ---------------------------------------------------------------------------
// makeParallelWorkflow
// ---------------------------------------------------------------------------

/**
 * Creates a parallel workflow:
 * START -> PARALLEL -> [branch A: UI Step A1, UI Step A2] -> WAIT_ALL -> END
 *                   -> [branch B: UI Step B1]             ->
 */
export function makeParallelWorkflow(): MasterWorkflowSpecification {
  const steps: MasterWorkflowStep[] = [
    makeStep('step-start', 'Start', 'START', 100, 0),
    makeStep('step-parallel', 'Fork', 'PARALLEL', 100, 150),
    makeStep('step-a1', 'Branch A Step 1', 'USER_INTERACTION', 0, 300),
    makeStep('step-a2', 'Branch A Step 2', 'USER_INTERACTION', 0, 450),
    makeStep('step-b1', 'Branch B Step 1', 'USER_INTERACTION', 200, 300),
    makeStep('step-wait-all', 'Join', 'WAIT_ALL', 100, 600),
    makeStep('step-end', 'End', 'END', 100, 750),
  ];

  const connections: MasterWorkflowSpecification['connections'] = [
    { from_step_id: 'step-start', to_step_id: 'step-parallel', connection_id: 'conn-1' },
    { from_step_id: 'step-parallel', to_step_id: 'step-a1', connection_id: 'conn-2' },
    { from_step_id: 'step-parallel', to_step_id: 'step-b1', connection_id: 'conn-3' },
    { from_step_id: 'step-a1', to_step_id: 'step-a2', connection_id: 'conn-4' },
    { from_step_id: 'step-a2', to_step_id: 'step-wait-all', connection_id: 'conn-5' },
    { from_step_id: 'step-b1', to_step_id: 'step-wait-all', connection_id: 'conn-6' },
    { from_step_id: 'step-wait-all', to_step_id: 'step-end', connection_id: 'conn-7' },
  ];

  return {
    local_id: 'Parallel Workflow',
    oid: 'wf-parallel',
    version: '1.0.0',
    last_modified_date: '2026-01-01T00:00:00Z',
    schemaVersion: '4.0',
    steps,
    connections,
    viewport: { x: 0, y: 0, zoom: 1 },
    starting_parameter_specifications: [],
    output_parameter_specifications: [],
    value_property_specifications: [],
    resource_property_specifications: [],
    environment_specifications: [],
    child_workflows: [],
  };
}

// ---------------------------------------------------------------------------
// makeSelect1Workflow
// ---------------------------------------------------------------------------

/**
 * Creates a branching workflow:
 * START -> USER_INTERACTION -> SELECT_1 -> [N branch steps] -> END
 *
 * Each branch has a single user interaction step that connects to END.
 *
 * @param branchCount Number of branches from the SELECT_1 step.
 */
export function makeSelect1Workflow(branchCount: number): MasterWorkflowSpecification {
  const steps: MasterWorkflowStep[] = [
    makeStep('step-start', 'Start', 'START', 100, 0),
  ];

  // User interaction step that feeds SELECT_1
  const inputStep = makeStep('step-input', 'Get Choice', 'USER_INTERACTION', 100, 150);
  inputStep.output_parameter_specifications = [
    {
      id: 'user-choice',
      default_value: '',
      value_type: 'property',
      target_property_name: 'UserChoice',
      target_entry_name: 'Value',
    },
  ];
  steps.push(inputStep);

  // SELECT_1 step
  const selectStep = makeStep('step-select', 'Route', 'SELECT_1', 100, 300);
  selectStep.select1_config = {
    input_name: 'choice',
    input_value_type: 'string',
    options: Array.from({ length: branchCount }, (_, i) => ({
      label: `Option ${i + 1}`,
      operator: 'equals' as const,
      value: `${i + 1}`,
      connection_id: `conn-branch-${i + 1}`,
    })),
  };
  selectStep.input_parameter_specifications = [
    {
      id: 'choice',
      default_value: '',
      value_type: 'property',
    },
  ];
  steps.push(selectStep);

  // Branch steps
  for (let i = 1; i <= branchCount; i++) {
    const branchStep = makeStep(
      `step-branch-${i}`,
      `Branch ${i}`,
      'USER_INTERACTION',
      (i - 1) * 200,
      450,
    );
    steps.push(branchStep);
  }

  // END node
  const endStep = makeStep('step-end', 'End', 'END', 100, 600);
  steps.push(endStep);

  // Connections
  const connections: MasterWorkflowSpecification['connections'] = [
    { from_step_id: 'step-start', to_step_id: 'step-input', connection_id: 'conn-start' },
    { from_step_id: 'step-input', to_step_id: 'step-select', connection_id: 'conn-to-select' },
  ];

  for (let i = 1; i <= branchCount; i++) {
    connections.push({
      from_step_id: 'step-select',
      to_step_id: `step-branch-${i}`,
      connection_id: `conn-branch-${i}`,
    });
    connections.push({
      from_step_id: `step-branch-${i}`,
      to_step_id: 'step-end',
      connection_id: `conn-branch-${i}-to-end`,
    });
  }

  return {
    local_id: `Select1 Workflow (${branchCount} branches)`,
    oid: `wf-select1-${branchCount}`,
    version: '1.0.0',
    last_modified_date: '2026-01-01T00:00:00Z',
    schemaVersion: '4.0',
    steps,
    connections,
    viewport: { x: 0, y: 0, zoom: 1 },
    starting_parameter_specifications: [],
    output_parameter_specifications: [],
    value_property_specifications: [
      {
        name: 'UserChoice',
        entries: [{ name: 'Value', value: '' }],
      },
    ],
    resource_property_specifications: [],
    environment_specifications: [],
    child_workflows: [],
  };
}
