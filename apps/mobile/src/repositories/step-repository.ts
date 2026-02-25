// SQLite implementation of IStepRepository.
// Reads/writes runtime_steps table for step execution state.

import type { SQLiteDatabase } from 'expo-sqlite';
import type { IStepRepository, RuntimeWorkflowStep, StepState, StepType } from '@brainpal/engine';
import type { RuntimeStepRow } from '@brainpal/storage';

function rowToStep(row: RuntimeStepRow): RuntimeWorkflowStep {
  return {
    instance_id: row.instance_id,
    workflow_instance_id: row.workflow_instance_id,
    step_oid: row.step_oid,
    step_type: row.step_type as StepType,
    step_state: row.step_state as StepState,
    step_json: row.step_json,
    resolved_inputs_json: row.resolved_inputs_json,
    resolved_outputs_json: row.resolved_outputs_json,
    user_inputs_json: row.user_inputs_json,
    activated_at: row.activated_at,
    started_at: row.started_at,
    completed_at: row.completed_at,
  };
}

export class SqliteStepRepository implements IStepRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  async getByWorkflow(workflowInstanceId: string): Promise<RuntimeWorkflowStep[]> {
    const rows = await this.db.getAllAsync<RuntimeStepRow>(
      'SELECT * FROM runtime_steps WHERE workflow_instance_id = ?',
      [workflowInstanceId],
    );
    return rows.map(rowToStep);
  }

  async getById(instanceId: string): Promise<RuntimeWorkflowStep | null> {
    const row = await this.db.getFirstAsync<RuntimeStepRow>(
      'SELECT * FROM runtime_steps WHERE instance_id = ?',
      [instanceId],
    );
    return row ? rowToStep(row) : null;
  }

  async updateState(instanceId: string, state: StepState): Promise<void> {
    await this.db.runAsync(
      'UPDATE runtime_steps SET step_state = ? WHERE instance_id = ?',
      [state, instanceId],
    );
  }

  async save(step: RuntimeWorkflowStep): Promise<void> {
    await this.db.runAsync(
      `INSERT OR REPLACE INTO runtime_steps
        (instance_id, workflow_instance_id, step_oid, step_type, step_state,
         step_json, resolved_inputs_json, resolved_outputs_json, user_inputs_json,
         activated_at, started_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        step.instance_id,
        step.workflow_instance_id,
        step.step_oid,
        step.step_type,
        step.step_state,
        step.step_json,
        step.resolved_inputs_json,
        step.resolved_outputs_json,
        step.user_inputs_json,
        step.activated_at,
        step.started_at,
        step.completed_at,
      ],
    );
  }

  async saveMany(steps: RuntimeWorkflowStep[]): Promise<void> {
    for (const step of steps) {
      await this.save(step);
    }
  }

  async updateUserInputs(instanceId: string, userInputsJson: string): Promise<void> {
    await this.db.runAsync(
      'UPDATE runtime_steps SET user_inputs_json = ? WHERE instance_id = ?',
      [userInputsJson, instanceId],
    );
  }

  async updateResolvedOutputs(instanceId: string, resolvedOutputsJson: string): Promise<void> {
    await this.db.runAsync(
      'UPDATE runtime_steps SET resolved_outputs_json = ? WHERE instance_id = ?',
      [resolvedOutputsJson, instanceId],
    );
  }
}
