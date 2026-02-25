import { create } from 'zustand';
import { type SQLiteDatabase } from 'expo-sqlite';
import { WriteQueue, writeAhead, type EnvironmentValuePropertyRow } from '@brainpal/storage';

export interface EnvironmentValueProperty {
  environment_oid: string;
  property_name: string;
  entries: Array<{ name: string; value: string }>;
  last_modified: string;
}

interface EnvironmentStore {
  properties: EnvironmentValueProperty[];
  isLoaded: boolean;
  loadFromDb: (db: SQLiteDatabase) => Promise<void>;
  setProperty: (
    queue: WriteQueue,
    envOid: string,
    propName: string,
    entries: Array<{ name: string; value: string }>,
  ) => Promise<void>;
  getProperty: (
    envOid: string,
    propName: string,
  ) => EnvironmentValueProperty | undefined;
}

function rowToProperty(row: EnvironmentValuePropertyRow): EnvironmentValueProperty {
  return {
    environment_oid: row.environment_oid,
    property_name: row.property_name,
    entries: JSON.parse(row.entries_json),
    last_modified: row.last_modified,
  };
}

export const useEnvironmentStore = create<EnvironmentStore>()((set, get) => ({
  properties: [],
  isLoaded: false,

  loadFromDb: async (db: SQLiteDatabase) => {
    const rows = await db.getAllAsync<EnvironmentValuePropertyRow>(
      'SELECT * FROM environment_value_properties',
    );
    set({
      properties: rows.map(rowToProperty),
      isLoaded: true,
    });
  },

  setProperty: async (
    queue: WriteQueue,
    envOid: string,
    propName: string,
    entries: Array<{ name: string; value: string }>,
  ) => {
    const now = new Date().toISOString();
    const entriesJson = JSON.stringify(entries);

    await queue.execute(async (db) => {
      await writeAhead(
        async () => {
          await db.runAsync(
            `INSERT INTO environment_value_properties (environment_oid, property_name, entries_json, last_modified)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(environment_oid, property_name)
             DO UPDATE SET entries_json = excluded.entries_json, last_modified = excluded.last_modified`,
            [envOid, propName, entriesJson, now],
          );
        },
        () => {
          const updated: EnvironmentValueProperty = {
            environment_oid: envOid,
            property_name: propName,
            entries,
            last_modified: now,
          };
          set((state) => {
            const idx = state.properties.findIndex(
              (p) =>
                p.environment_oid === envOid && p.property_name === propName,
            );
            const next = [...state.properties];
            if (idx >= 0) {
              next[idx] = updated;
            } else {
              next.push(updated);
            }
            return { properties: next };
          });
        },
      );
    });
  },

  getProperty: (envOid: string, propName: string) => {
    return get().properties.find(
      (p) => p.environment_oid === envOid && p.property_name === propName,
    );
  },
}));
