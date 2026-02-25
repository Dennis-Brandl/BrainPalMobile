// SQLite implementation of IResourcePoolRepository.
// Reads/writes resource_pools table for concurrent resource management.

import type { SQLiteDatabase } from 'expo-sqlite';
import type { IResourcePoolRepository, ResourcePool } from '@brainpal/engine';
import type { ResourcePoolRow } from '@brainpal/storage';

function rowToPool(row: ResourcePoolRow): ResourcePool {
  return {
    resource_name: row.resource_name,
    scope: row.scope as ResourcePool['scope'],
    scope_id: row.scope_id,
    resource_type: row.resource_type,
    capacity: row.capacity,
    current_usage: row.current_usage,
    named_instances: row.named_instances_json
      ? JSON.parse(row.named_instances_json)
      : undefined,
  };
}

export class SqliteResourcePoolRepository implements IResourcePoolRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  async create(pool: ResourcePool): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO resource_pools
        (resource_name, scope, scope_id, resource_type, capacity, current_usage, named_instances_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        pool.resource_name,
        pool.scope,
        pool.scope_id,
        pool.resource_type,
        pool.capacity,
        pool.current_usage,
        pool.named_instances ? JSON.stringify(pool.named_instances) : null,
      ],
    );
  }

  async getByScope(scope: string, scopeId: string): Promise<ResourcePool[]> {
    const rows = await this.db.getAllAsync<ResourcePoolRow>(
      'SELECT * FROM resource_pools WHERE scope = ? AND scope_id = ?',
      [scope, scopeId],
    );
    return rows.map(rowToPool);
  }

  async updateUsage(
    resourceName: string,
    scope: string,
    scopeId: string,
    currentUsage: number,
  ): Promise<void> {
    await this.db.runAsync(
      'UPDATE resource_pools SET current_usage = ? WHERE resource_name = ? AND scope = ? AND scope_id = ?',
      [currentUsage, resourceName, scope, scopeId],
    );
  }

  async delete(resourceName: string, scope: string, scopeId: string): Promise<void> {
    await this.db.runAsync(
      'DELETE FROM resource_pools WHERE resource_name = ? AND scope = ? AND scope_id = ?',
      [resourceName, scope, scopeId],
    );
  }
}
