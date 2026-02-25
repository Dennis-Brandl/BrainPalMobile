import { create } from 'zustand';
import { type SQLiteDatabase } from 'expo-sqlite';
import { type MasterWorkflowRow } from '@brainpal/storage';

export interface MasterWorkflow {
  oid: string;
  local_id: string;
  version: string;
  description: string | null;
  downloaded_at: string;
  package_file_name: string | null;
}

interface WorkflowStore {
  masterWorkflows: MasterWorkflow[];
  isLoaded: boolean;
  loadFromDb: (db: SQLiteDatabase) => Promise<void>;
}

function rowToWorkflow(row: MasterWorkflowRow): MasterWorkflow {
  return {
    oid: row.oid,
    local_id: row.local_id,
    version: row.version,
    description: row.description,
    downloaded_at: row.downloaded_at,
    package_file_name: row.package_file_name,
  };
}

export const useWorkflowStore = create<WorkflowStore>()((set) => ({
  masterWorkflows: [],
  isLoaded: false,

  loadFromDb: async (db: SQLiteDatabase) => {
    const rows = await db.getAllAsync<MasterWorkflowRow>(
      'SELECT * FROM master_workflows ORDER BY downloaded_at DESC',
    );
    set({
      masterWorkflows: rows.map(rowToWorkflow),
      isLoaded: true,
    });
  },
}));
