import { create } from 'zustand';
import { type SQLiteDatabase } from 'expo-sqlite';
import { type MasterWorkflowRow, type RuntimeWorkflowRow } from '@brainpal/storage';
import type { WorkflowState } from '@brainpal/engine';

export interface MasterWorkflow {
  oid: string;
  local_id: string;
  version: string;
  description: string | null;
  downloaded_at: string;
  package_file_name: string | null;
}

export interface RuntimeWorkflowSummary {
  instanceId: string;
  masterOid: string;
  name: string;
  workflowState: WorkflowState;
  startedAt: string | null;
  lastActivityAt: string | null;
}

interface WorkflowStore {
  masterWorkflows: MasterWorkflow[];
  runtimeWorkflows: RuntimeWorkflowSummary[];
  isLoaded: boolean;
  loadFromDb: (db: SQLiteDatabase) => Promise<void>;
  loadRuntimeWorkflows: (db: SQLiteDatabase) => Promise<void>;
  addRuntimeWorkflow: (summary: RuntimeWorkflowSummary) => void;
  removeRuntimeWorkflow: (instanceId: string) => void;
  updateRuntimeWorkflowState: (instanceId: string, state: WorkflowState) => void;
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

function runtimeRowToSummary(row: RuntimeWorkflowRow): RuntimeWorkflowSummary {
  let name = 'Workflow';
  try {
    const spec = JSON.parse(row.specification_json);
    name = spec.local_id || spec.description || 'Workflow';
  } catch {
    // Use default
  }
  return {
    instanceId: row.instance_id,
    masterOid: row.master_workflow_oid,
    name,
    workflowState: row.workflow_state as WorkflowState,
    startedAt: row.started_at,
    lastActivityAt: row.last_activity_at,
  };
}

export const useWorkflowStore = create<WorkflowStore>()((set) => ({
  masterWorkflows: [],
  runtimeWorkflows: [],
  isLoaded: false,

  loadFromDb: async (db: SQLiteDatabase) => {
    const [masterRows, runtimeRows] = await Promise.all([
      db.getAllAsync<MasterWorkflowRow>(
        'SELECT * FROM master_workflows ORDER BY downloaded_at DESC',
      ),
      db.getAllAsync<RuntimeWorkflowRow>(
        "SELECT * FROM runtime_workflows WHERE workflow_state IN ('IDLE', 'RUNNING', 'PAUSED') ORDER BY created_at DESC",
      ),
    ]);
    set({
      masterWorkflows: masterRows.map(rowToWorkflow),
      runtimeWorkflows: runtimeRows.map(runtimeRowToSummary),
      isLoaded: true,
    });
  },

  loadRuntimeWorkflows: async (db: SQLiteDatabase) => {
    const rows = await db.getAllAsync<RuntimeWorkflowRow>(
      "SELECT * FROM runtime_workflows WHERE workflow_state IN ('IDLE', 'RUNNING', 'PAUSED') ORDER BY created_at DESC",
    );
    set({ runtimeWorkflows: rows.map(runtimeRowToSummary) });
  },

  addRuntimeWorkflow: (summary: RuntimeWorkflowSummary) => {
    set((state) => ({
      runtimeWorkflows: [summary, ...state.runtimeWorkflows],
    }));
  },

  removeRuntimeWorkflow: (instanceId: string) => {
    set((state) => ({
      runtimeWorkflows: state.runtimeWorkflows.filter((w) => w.instanceId !== instanceId),
    }));
  },

  updateRuntimeWorkflowState: (instanceId: string, wfState: WorkflowState) => {
    set((state) => ({
      runtimeWorkflows: state.runtimeWorkflows.map((w) =>
        w.instanceId === instanceId ? { ...w, workflowState: wfState } : w,
      ),
    }));
  },
}));
