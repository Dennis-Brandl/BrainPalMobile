// SQLite implementation of IMasterWorkflowRepository.
// Reads/writes master_workflows table, converting between rows and engine types.

import type { SQLiteDatabase } from 'expo-sqlite';
import type {
  IMasterWorkflowRepository,
  MasterWorkflowSpecification,
} from '@brainpal/engine';
import type { MasterWorkflowRow } from '@brainpal/storage';

export class SqliteMasterWorkflowRepository implements IMasterWorkflowRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  async getAll(): Promise<MasterWorkflowSpecification[]> {
    const rows = await this.db.getAllAsync<MasterWorkflowRow>(
      'SELECT * FROM master_workflows ORDER BY downloaded_at DESC',
    );
    return rows.map((row) => JSON.parse(row.specification_json) as MasterWorkflowSpecification);
  }

  async getByOid(oid: string): Promise<MasterWorkflowSpecification | null> {
    const row = await this.db.getFirstAsync<MasterWorkflowRow>(
      'SELECT * FROM master_workflows WHERE oid = ?',
      [oid],
    );
    if (!row) return null;
    return JSON.parse(row.specification_json) as MasterWorkflowSpecification;
  }

  async save(spec: MasterWorkflowSpecification): Promise<void> {
    const now = new Date().toISOString();
    await this.db.runAsync(
      `INSERT INTO master_workflows (oid, local_id, version, description, schema_version, last_modified_date, specification_json, downloaded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(oid) DO UPDATE SET
         local_id = excluded.local_id,
         version = excluded.version,
         description = excluded.description,
         schema_version = excluded.schema_version,
         last_modified_date = excluded.last_modified_date,
         specification_json = excluded.specification_json`,
      [
        spec.oid,
        spec.local_id,
        spec.version,
        spec.description ?? null,
        spec.schemaVersion,
        spec.last_modified_date,
        JSON.stringify(spec),
        now,
      ],
    );
  }

  async deleteByOid(oid: string): Promise<void> {
    await this.db.runAsync('DELETE FROM master_workflows WHERE oid = ?', [oid]);
  }

  async replaceByOid(oid: string, spec: MasterWorkflowSpecification): Promise<void> {
    await this.deleteByOid(oid);
    await this.save(spec);
  }
}
