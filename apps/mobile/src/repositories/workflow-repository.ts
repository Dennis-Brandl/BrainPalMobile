// SQLite implementation of IWorkflowRepository.
// Reads/writes runtime_workflows table for active workflow execution state.

import type { SQLiteDatabase } from 'expo-sqlite';
import type { IWorkflowRepository, RuntimeWorkflow, WorkflowState } from '@brainpal/engine';
import type { RuntimeWorkflowRow } from '@brainpal/storage';

function rowToWorkflow(row: RuntimeWorkflowRow): RuntimeWorkflow {
  return {
    instance_id: row.instance_id,
    master_workflow_oid: row.master_workflow_oid,
    master_workflow_version: row.master_workflow_version,
    workflow_state: row.workflow_state as WorkflowState,
    specification_json: row.specification_json,
    created_at: row.created_at,
    started_at: row.started_at,
    completed_at: row.completed_at,
    last_activity_at: row.last_activity_at,
    parent_workflow_instance_id: row.parent_workflow_instance_id,
    parent_step_oid: row.parent_step_oid,
  };
}

export class SqliteWorkflowRepository implements IWorkflowRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  async getById(instanceId: string): Promise<RuntimeWorkflow | null> {
    const row = await this.db.getFirstAsync<RuntimeWorkflowRow>(
      'SELECT * FROM runtime_workflows WHERE instance_id = ?',
      [instanceId],
    );
    return row ? rowToWorkflow(row) : null;
  }

  async save(workflow: RuntimeWorkflow): Promise<void> {
    await this.db.runAsync(
      `INSERT OR REPLACE INTO runtime_workflows
        (instance_id, master_workflow_oid, master_workflow_version, workflow_state,
         specification_json, created_at, started_at, completed_at, last_activity_at,
         parent_workflow_instance_id, parent_step_oid)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        workflow.instance_id,
        workflow.master_workflow_oid,
        workflow.master_workflow_version,
        workflow.workflow_state,
        workflow.specification_json,
        workflow.created_at,
        workflow.started_at,
        workflow.completed_at,
        workflow.last_activity_at,
        workflow.parent_workflow_instance_id,
        workflow.parent_step_oid,
      ],
    );
  }

  async updateState(instanceId: string, state: WorkflowState): Promise<void> {
    await this.db.runAsync(
      'UPDATE runtime_workflows SET workflow_state = ? WHERE instance_id = ?',
      [state, instanceId],
    );
  }

  async getActive(): Promise<RuntimeWorkflow[]> {
    const rows = await this.db.getAllAsync<RuntimeWorkflowRow>(
      "SELECT * FROM runtime_workflows WHERE workflow_state IN ('IDLE', 'RUNNING', 'PAUSED')",
    );
    return rows.map(rowToWorkflow);
  }

  async delete(instanceId: string): Promise<void> {
    await this.db.runAsync(
      'DELETE FROM runtime_workflows WHERE instance_id = ?',
      [instanceId],
    );
  }

  async updateLastActivity(instanceId: string, timestamp: string): Promise<void> {
    await this.db.runAsync(
      'UPDATE runtime_workflows SET last_activity_at = ? WHERE instance_id = ?',
      [timestamp, instanceId],
    );
  }
}
