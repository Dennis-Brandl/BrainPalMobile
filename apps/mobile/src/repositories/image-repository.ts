// SQLite implementation of IImageRepository.
// Reads/writes package_images table with BLOB data.

import type { SQLiteDatabase } from 'expo-sqlite';
import type { IImageRepository, PackageImage } from '@brainpal/engine';
import type { PackageImageRow } from '@brainpal/storage';

export class SqliteImageRepository implements IImageRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  async getByWorkflowOid(workflowOid: string): Promise<PackageImage[]> {
    const rows = await this.db.getAllAsync<PackageImageRow>(
      'SELECT * FROM package_images WHERE workflow_oid = ?',
      [workflowOid],
    );
    return rows.map((row) => ({
      filename: row.filename,
      mime_type: row.mime_type,
      data: row.data,
    }));
  }

  async save(workflowOid: string, image: PackageImage): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO package_images (workflow_oid, filename, mime_type, data)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(workflow_oid, filename) DO UPDATE SET
         mime_type = excluded.mime_type,
         data = excluded.data`,
      [workflowOid, image.filename, image.mime_type, image.data],
    );
  }

  async deleteByWorkflowOid(workflowOid: string): Promise<void> {
    await this.db.runAsync(
      'DELETE FROM package_images WHERE workflow_oid = ?',
      [workflowOid],
    );
  }
}
