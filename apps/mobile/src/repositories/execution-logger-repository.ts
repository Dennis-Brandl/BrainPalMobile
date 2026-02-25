// SQLite implementation of IExecutionLogger.
// Appends to execution_log_entries table for audit and debugging.

import type { SQLiteDatabase } from 'expo-sqlite';
import type { IExecutionLogger, ExecutionLogEntry } from '@brainpal/engine';
import type { ExecutionLogRow } from '@brainpal/storage';

export class SqliteExecutionLoggerRepository implements IExecutionLogger {
  constructor(private readonly db: SQLiteDatabase) {}

  async log(entry: ExecutionLogEntry): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO execution_log_entries
        (workflow_instance_id, step_oid, step_instance_id, event_type, event_data_json, timestamp)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        entry.workflow_instance_id,
        entry.step_oid ?? null,
        entry.step_instance_id ?? null,
        entry.event_type,
        entry.event_data_json,
        entry.timestamp,
      ],
    );
  }

  async getByWorkflow(workflowInstanceId: string): Promise<ExecutionLogEntry[]> {
    const rows = await this.db.getAllAsync<ExecutionLogRow>(
      'SELECT * FROM execution_log_entries WHERE workflow_instance_id = ? ORDER BY timestamp ASC',
      [workflowInstanceId],
    );
    return rows.map((row) => ({
      workflow_instance_id: row.workflow_instance_id,
      step_oid: row.step_oid ?? undefined,
      step_instance_id: row.step_instance_id ?? undefined,
      event_type: row.event_type as ExecutionLogEntry['event_type'],
      event_data_json: row.event_data_json,
      timestamp: row.timestamp,
    }));
  }
}
