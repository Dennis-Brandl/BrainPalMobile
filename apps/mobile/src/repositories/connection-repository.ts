// SQLite implementation of IConnectionRepository.
// Reads/writes runtime_connections table.

import type { SQLiteDatabase } from 'expo-sqlite';
import type { IConnectionRepository, WorkflowConnection } from '@brainpal/engine';
import type { RuntimeConnectionRow } from '@brainpal/storage';

function rowToConnection(row: RuntimeConnectionRow): WorkflowConnection {
  return {
    workflow_instance_id: row.workflow_instance_id,
    from_step_oid: row.from_step_oid,
    to_step_oid: row.to_step_oid,
    condition: row.condition ?? undefined,
    connection_id: row.connection_id ?? undefined,
    source_handle_id: row.source_handle_id ?? undefined,
  };
}

export class SqliteConnectionRepository implements IConnectionRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  async getByWorkflow(workflowInstanceId: string): Promise<WorkflowConnection[]> {
    const rows = await this.db.getAllAsync<RuntimeConnectionRow>(
      'SELECT * FROM runtime_connections WHERE workflow_instance_id = ?',
      [workflowInstanceId],
    );
    return rows.map(rowToConnection);
  }

  async saveMany(workflowInstanceId: string, connections: WorkflowConnection[]): Promise<void> {
    for (const conn of connections) {
      await this.db.runAsync(
        `INSERT INTO runtime_connections
          (workflow_instance_id, from_step_oid, to_step_oid, condition, connection_id, source_handle_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          workflowInstanceId,
          conn.from_step_oid,
          conn.to_step_oid,
          conn.condition ?? null,
          conn.connection_id ?? null,
          conn.source_handle_id ?? null,
        ],
      );
    }
  }
}
