// SQLite implementation of IMasterActionRepository.
// Reads/writes master_actions table.

import type { SQLiteDatabase } from 'expo-sqlite';
import type {
  IMasterActionRepository,
  MasterActionLibrary,
} from '@brainpal/engine';
import type { MasterActionRow } from '@brainpal/storage';

export class SqliteMasterActionRepository implements IMasterActionRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  async getByEnvironmentOid(environmentOid: string): Promise<MasterActionLibrary[]> {
    const rows = await this.db.getAllAsync<MasterActionRow>(
      'SELECT * FROM master_actions WHERE environment_oid = ?',
      [environmentOid],
    );
    return rows.map((row) => JSON.parse(row.specification_json) as MasterActionLibrary);
  }

  async save(environmentOid: string, lib: MasterActionLibrary): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO master_actions (oid, local_id, version, specification_json, environment_oid)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(oid) DO UPDATE SET
         local_id = excluded.local_id,
         version = excluded.version,
         specification_json = excluded.specification_json,
         environment_oid = excluded.environment_oid`,
      [lib.oid, lib.local_id, lib.version, JSON.stringify(lib), environmentOid],
    );
  }

  async deleteByEnvironmentOid(environmentOid: string): Promise<void> {
    await this.db.runAsync(
      'DELETE FROM master_actions WHERE environment_oid = ?',
      [environmentOid],
    );
  }
}
