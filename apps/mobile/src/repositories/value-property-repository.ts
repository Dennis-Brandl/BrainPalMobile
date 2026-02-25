// SQLite implementation of IValuePropertyRepository.
// Reads/writes workflow_value_properties and environment_value_properties tables.

import type { SQLiteDatabase } from 'expo-sqlite';
import type {
  IValuePropertyRepository,
  RuntimeValueProperty,
  PropertyEntry,
  PropertySpecification,
} from '@brainpal/engine';
import type {
  WorkflowValuePropertyRow,
  EnvironmentValuePropertyRow,
} from '@brainpal/storage';

export class SqliteValuePropertyRepository implements IValuePropertyRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  async getWorkflowProperty(
    workflowInstanceId: string,
    name: string,
  ): Promise<RuntimeValueProperty | null> {
    const row = await this.db.getFirstAsync<WorkflowValuePropertyRow>(
      'SELECT * FROM workflow_value_properties WHERE workflow_instance_id = ? AND property_name = ?',
      [workflowInstanceId, name],
    );
    if (!row) return null;
    return {
      scope: 'workflow',
      scope_id: row.workflow_instance_id,
      property_name: row.property_name,
      entries: JSON.parse(row.entries_json) as PropertyEntry[],
      last_modified: row.last_modified,
    };
  }

  async getEnvironmentProperty(
    envOid: string,
    name: string,
  ): Promise<RuntimeValueProperty | null> {
    const row = await this.db.getFirstAsync<EnvironmentValuePropertyRow>(
      'SELECT * FROM environment_value_properties WHERE environment_oid = ? AND property_name = ?',
      [envOid, name],
    );
    if (!row) return null;
    return {
      scope: 'environment',
      scope_id: row.environment_oid,
      property_name: row.property_name,
      entries: JSON.parse(row.entries_json) as PropertyEntry[],
      last_modified: row.last_modified,
    };
  }

  async upsertEntry(
    scope: 'workflow' | 'environment',
    scopeId: string,
    propertyName: string,
    entryName: string,
    value: string,
  ): Promise<void> {
    const now = new Date().toISOString();

    if (scope === 'workflow') {
      // Read existing property
      const existing = await this.db.getFirstAsync<WorkflowValuePropertyRow>(
        'SELECT * FROM workflow_value_properties WHERE workflow_instance_id = ? AND property_name = ?',
        [scopeId, propertyName],
      );

      let entries: PropertyEntry[];
      if (existing) {
        entries = JSON.parse(existing.entries_json) as PropertyEntry[];
        const idx = entries.findIndex((e) => e.name === entryName);
        if (idx >= 0) {
          entries[idx] = { name: entryName, value };
        } else {
          entries.push({ name: entryName, value });
        }
      } else {
        entries = [{ name: entryName, value }];
      }

      await this.db.runAsync(
        `INSERT INTO workflow_value_properties (workflow_instance_id, property_name, entries_json, last_modified)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(workflow_instance_id, property_name)
         DO UPDATE SET entries_json = excluded.entries_json, last_modified = excluded.last_modified`,
        [scopeId, propertyName, JSON.stringify(entries), now],
      );
    } else {
      // Environment scope
      const existing = await this.db.getFirstAsync<EnvironmentValuePropertyRow>(
        'SELECT * FROM environment_value_properties WHERE environment_oid = ? AND property_name = ?',
        [scopeId, propertyName],
      );

      let entries: PropertyEntry[];
      if (existing) {
        entries = JSON.parse(existing.entries_json) as PropertyEntry[];
        const idx = entries.findIndex((e) => e.name === entryName);
        if (idx >= 0) {
          entries[idx] = { name: entryName, value };
        } else {
          entries.push({ name: entryName, value });
        }
      } else {
        entries = [{ name: entryName, value }];
      }

      await this.db.runAsync(
        `INSERT INTO environment_value_properties (environment_oid, property_name, entries_json, last_modified)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(environment_oid, property_name)
         DO UPDATE SET entries_json = excluded.entries_json, last_modified = excluded.last_modified`,
        [scopeId, propertyName, JSON.stringify(entries), now],
      );
    }
  }

  async deleteByWorkflow(workflowInstanceId: string): Promise<void> {
    await this.db.runAsync(
      'DELETE FROM workflow_value_properties WHERE workflow_instance_id = ?',
      [workflowInstanceId],
    );
  }

  async initializeFromSpec(
    scope: 'workflow' | 'environment',
    scopeId: string,
    specs: PropertySpecification[],
  ): Promise<void> {
    const now = new Date().toISOString();

    for (const spec of specs) {
      const entries: PropertyEntry[] = spec.entries.map((e) => ({
        name: e.name,
        value: e.value,
      }));
      const entriesJson = JSON.stringify(entries);

      if (scope === 'workflow') {
        await this.db.runAsync(
          `INSERT INTO workflow_value_properties (workflow_instance_id, property_name, entries_json, last_modified)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(workflow_instance_id, property_name)
           DO UPDATE SET entries_json = excluded.entries_json, last_modified = excluded.last_modified`,
          [scopeId, spec.name, entriesJson, now],
        );
      } else {
        await this.db.runAsync(
          `INSERT INTO environment_value_properties (environment_oid, property_name, entries_json, last_modified)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(environment_oid, property_name)
           DO UPDATE SET entries_json = excluded.entries_json, last_modified = excluded.last_modified`,
          [scopeId, spec.name, entriesJson, now],
        );
      }
    }
  }

  async getAllByWorkflow(workflowInstanceId: string): Promise<RuntimeValueProperty[]> {
    const rows = await this.db.getAllAsync<WorkflowValuePropertyRow>(
      'SELECT * FROM workflow_value_properties WHERE workflow_instance_id = ?',
      [workflowInstanceId],
    );
    return rows.map((row) => ({
      scope: 'workflow' as const,
      scope_id: row.workflow_instance_id,
      property_name: row.property_name,
      entries: JSON.parse(row.entries_json) as PropertyEntry[],
      last_modified: row.last_modified,
    }));
  }
}
