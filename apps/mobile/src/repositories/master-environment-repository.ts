// SQLite implementation of IMasterEnvironmentRepository.
// Reads/writes master_environments table.

import type { SQLiteDatabase } from 'expo-sqlite';
import type {
  IMasterEnvironmentRepository,
  MasterEnvironmentLibrary,
} from '@brainpal/engine';
import type { MasterEnvironmentRow } from '@brainpal/storage';

export class SqliteMasterEnvironmentRepository implements IMasterEnvironmentRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  async getByWorkflowOid(workflowOid: string): Promise<MasterEnvironmentLibrary[]> {
    const rows = await this.db.getAllAsync<MasterEnvironmentRow>(
      'SELECT * FROM master_environments WHERE workflow_oid = ?',
      [workflowOid],
    );
    return rows.map((row) => JSON.parse(row.specification_json) as MasterEnvironmentLibrary);
  }

  async save(workflowOid: string, lib: MasterEnvironmentLibrary): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO master_environments (oid, local_id, version, specification_json, workflow_oid)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(oid) DO UPDATE SET
         local_id = excluded.local_id,
         version = excluded.version,
         specification_json = excluded.specification_json,
         workflow_oid = excluded.workflow_oid`,
      [lib.oid, lib.local_id, lib.version, JSON.stringify(lib), workflowOid],
    );
  }

  async deleteByWorkflowOid(workflowOid: string): Promise<void> {
    await this.db.runAsync(
      'DELETE FROM master_environments WHERE workflow_oid = ?',
      [workflowOid],
    );
  }
}
