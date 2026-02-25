// SQLite implementation of IResourceQueueRepository.
// Reads/writes resource_queue table for FIFO resource acquisition.

import type { SQLiteDatabase } from 'expo-sqlite';
import type { IResourceQueueRepository, ResourceQueueEntry } from '@brainpal/engine';
import type { ResourceQueueRow, ResourcePoolRow } from '@brainpal/storage';

function rowToEntry(row: ResourceQueueRow): ResourceQueueEntry {
  return {
    step_instance_id: row.step_instance_id,
    workflow_instance_id: row.workflow_instance_id,
    command_type: row.command_type,
    resource_name: row.resource_name,
    amount: row.amount,
    requested_at: row.requested_at,
  };
}

export class SqliteResourceQueueRepository implements IResourceQueueRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  async enqueue(entry: ResourceQueueEntry): Promise<void> {
    // Look up the resource pool to get the pool id
    const pool = await this.db.getFirstAsync<ResourcePoolRow>(
      'SELECT * FROM resource_pools WHERE resource_name = ?',
      [entry.resource_name],
    );
    const poolId = pool?.id ?? 0;

    await this.db.runAsync(
      `INSERT INTO resource_queue
        (resource_pool_id, step_instance_id, workflow_instance_id, command_type, resource_name, amount, requested_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        poolId,
        entry.step_instance_id,
        entry.workflow_instance_id,
        entry.command_type,
        entry.resource_name,
        entry.amount,
        entry.requested_at,
      ],
    );
  }

  async dequeue(
    resourceName: string,
    _scope: string,
    _scopeId: string,
  ): Promise<ResourceQueueEntry | null> {
    // Get the oldest entry for this resource
    const row = await this.db.getFirstAsync<ResourceQueueRow>(
      'SELECT * FROM resource_queue WHERE resource_name = ? ORDER BY requested_at ASC LIMIT 1',
      [resourceName],
    );
    if (!row) return null;

    // Remove it from the queue
    await this.db.runAsync('DELETE FROM resource_queue WHERE id = ?', [row.id]);

    return rowToEntry(row);
  }

  async getByPool(
    resourceName: string,
    _scope: string,
    _scopeId: string,
  ): Promise<ResourceQueueEntry[]> {
    const rows = await this.db.getAllAsync<ResourceQueueRow>(
      'SELECT * FROM resource_queue WHERE resource_name = ? ORDER BY requested_at ASC',
      [resourceName],
    );
    return rows.map(rowToEntry);
  }
}
