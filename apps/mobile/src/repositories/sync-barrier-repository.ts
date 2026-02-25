// SQLite implementation of ISyncBarrierRepository.
// Reads/writes sync_barriers table for SYNC resource coordination.
//
// The engine's SyncBarrierEntry.id is a string. The SQLite schema uses
// INTEGER AUTOINCREMENT for the id column. We use the auto-increment id
// cast to string as the SyncBarrierEntry.id (set after INSERT).

import type { SQLiteDatabase } from 'expo-sqlite';
import type { ISyncBarrierRepository, SyncBarrierEntry } from '@brainpal/engine';
import type { SyncBarrierRow } from '@brainpal/storage';

function rowToEntry(row: SyncBarrierRow): SyncBarrierEntry {
  return {
    id: String(row.id),
    resource_name: row.resource_name,
    command_type: row.command_type,
    step_instance_id: row.step_instance_id,
    workflow_instance_id: row.workflow_instance_id,
    matched_with: row.matched_with_step_id ?? undefined,
    registered_at: row.requested_at,
  };
}

export class SqliteSyncBarrierRepository implements ISyncBarrierRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  async register(entry: SyncBarrierEntry): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO sync_barriers
        (resource_name, step_instance_id, workflow_instance_id, command_type, requested_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        entry.resource_name,
        entry.step_instance_id,
        entry.workflow_instance_id,
        entry.command_type,
        entry.registered_at,
      ],
    );
  }

  async match(entryId: string, matchedWithStepInstanceId: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db.runAsync(
      'UPDATE sync_barriers SET matched_with_step_id = ?, matched_at = ? WHERE id = ?',
      [matchedWithStepInstanceId, now, parseInt(entryId, 10)],
    );
  }

  async getUnmatched(
    resourceName: string,
    compatibleCommandType: string,
    workflowInstanceId: string,
  ): Promise<SyncBarrierEntry | null> {
    const row = await this.db.getFirstAsync<SyncBarrierRow>(
      `SELECT * FROM sync_barriers
       WHERE resource_name = ? AND command_type = ? AND workflow_instance_id = ?
         AND matched_with_step_id IS NULL
       ORDER BY requested_at ASC LIMIT 1`,
      [resourceName, compatibleCommandType, workflowInstanceId],
    );
    return row ? rowToEntry(row) : null;
  }
}
