// Execution store: Zustand store bridging engine events to React components.
// Maintains active workflow execution state for reactive UI rendering.

import { create } from 'zustand';
import type { SQLiteDatabase } from 'expo-sqlite';
import type { WorkflowState, StepState } from '@brainpal/engine';
import type { RuntimeWorkflowRow, RuntimeStepRow } from '@brainpal/storage';

// ---------------------------------------------------------------------------
// State Types
// ---------------------------------------------------------------------------

export interface ActiveWorkflowState {
  instanceId: string;
  masterOid: string;
  name: string;
  workflowState: WorkflowState;
  stepStates: Record<string, StepState>;  // stepOid -> state
  activeStepInstanceIds: string[];         // for step carousel
  currentStepIndex: number;
  totalSteps: number;
  startedAt: string | null;
  lastActivityAt: string | null;
}

interface ExecutionState {
  // Active workflow tracking
  activeWorkflows: Record<string, ActiveWorkflowState>;  // instanceId -> state
  currentWorkflowId: string | null;

  // Step type cache (stepInstanceId -> stepType) to avoid repeated DB queries
  stepTypeCache: Record<string, string>;

  // Actions
  setCurrentWorkflow: (id: string | null) => void;
  addActiveWorkflow: (instanceId: string, masterOid: string, name: string, totalSteps: number) => void;
  removeActiveWorkflow: (instanceId: string) => void;
  updateWorkflowState: (instanceId: string, state: WorkflowState) => void;
  updateStepState: (instanceId: string, stepOid: string, state: StepState) => void;
  addActiveStep: (instanceId: string, stepInstanceId: string) => void;
  removeActiveStep: (instanceId: string, stepInstanceId: string) => void;
  cacheStepType: (stepInstanceId: string, stepType: string) => void;
  getStepType: (stepInstanceId: string) => string | undefined;
  loadFromDb: (db: SQLiteDatabase) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useExecutionStore = create<ExecutionState>()((set, get) => ({
  activeWorkflows: {},
  currentWorkflowId: null,
  stepTypeCache: {},

  setCurrentWorkflow: (id: string | null) => {
    set({ currentWorkflowId: id });
  },

  addActiveWorkflow: (instanceId: string, masterOid: string, name: string, totalSteps: number) => {
    set((state) => ({
      activeWorkflows: {
        ...state.activeWorkflows,
        [instanceId]: {
          instanceId,
          masterOid,
          name,
          workflowState: 'IDLE',
          stepStates: {},
          activeStepInstanceIds: [],
          currentStepIndex: 0,
          totalSteps,
          startedAt: null,
          lastActivityAt: null,
        },
      },
    }));
  },

  removeActiveWorkflow: (instanceId: string) => {
    set((state) => {
      const next = { ...state.activeWorkflows };
      delete next[instanceId];
      return {
        activeWorkflows: next,
        currentWorkflowId:
          state.currentWorkflowId === instanceId ? null : state.currentWorkflowId,
      };
    });
  },

  updateWorkflowState: (instanceId: string, wfState: WorkflowState) => {
    set((state) => {
      const wf = state.activeWorkflows[instanceId];
      if (!wf) return state;
      return {
        activeWorkflows: {
          ...state.activeWorkflows,
          [instanceId]: {
            ...wf,
            workflowState: wfState,
            startedAt: wfState === 'RUNNING' && !wf.startedAt
              ? new Date().toISOString()
              : wf.startedAt,
            lastActivityAt: new Date().toISOString(),
          },
        },
      };
    });
  },

  updateStepState: (instanceId: string, stepOid: string, stepState: StepState) => {
    set((state) => {
      const wf = state.activeWorkflows[instanceId];
      if (!wf) return state;
      return {
        activeWorkflows: {
          ...state.activeWorkflows,
          [instanceId]: {
            ...wf,
            stepStates: { ...wf.stepStates, [stepOid]: stepState },
            lastActivityAt: new Date().toISOString(),
          },
        },
      };
    });
  },

  addActiveStep: (instanceId: string, stepInstanceId: string) => {
    set((state) => {
      const wf = state.activeWorkflows[instanceId];
      if (!wf) return state;
      if (wf.activeStepInstanceIds.includes(stepInstanceId)) return state;
      return {
        activeWorkflows: {
          ...state.activeWorkflows,
          [instanceId]: {
            ...wf,
            activeStepInstanceIds: [...wf.activeStepInstanceIds, stepInstanceId],
          },
        },
      };
    });
  },

  removeActiveStep: (instanceId: string, stepInstanceId: string) => {
    set((state) => {
      const wf = state.activeWorkflows[instanceId];
      if (!wf) return state;
      return {
        activeWorkflows: {
          ...state.activeWorkflows,
          [instanceId]: {
            ...wf,
            activeStepInstanceIds: wf.activeStepInstanceIds.filter((id) => id !== stepInstanceId),
          },
        },
      };
    });
  },

  cacheStepType: (stepInstanceId: string, stepType: string) => {
    set((state) => ({
      stepTypeCache: { ...state.stepTypeCache, [stepInstanceId]: stepType },
    }));
  },

  getStepType: (stepInstanceId: string) => {
    return get().stepTypeCache[stepInstanceId];
  },

  loadFromDb: async (db: SQLiteDatabase) => {
    // Load active workflows from SQLite
    const wfRows = await db.getAllAsync<RuntimeWorkflowRow>(
      "SELECT * FROM runtime_workflows WHERE workflow_state IN ('IDLE', 'RUNNING', 'PAUSED')",
    );

    const activeWorkflows: Record<string, ActiveWorkflowState> = {};

    for (const wfRow of wfRows) {
      // Parse spec to get workflow name
      let name = 'Workflow';
      try {
        const spec = JSON.parse(wfRow.specification_json);
        name = spec.local_id || spec.description || 'Workflow';
      } catch {
        // Use default name
      }

      // Load steps for this workflow
      const stepRows = await db.getAllAsync<RuntimeStepRow>(
        'SELECT * FROM runtime_steps WHERE workflow_instance_id = ?',
        [wfRow.instance_id],
      );

      const stepStates: Record<string, StepState> = {};
      const activeStepInstanceIds: string[] = [];

      for (const stepRow of stepRows) {
        stepStates[stepRow.step_oid] = stepRow.step_state as StepState;
        if (stepRow.step_state === 'EXECUTING') {
          const stepType = stepRow.step_type;
          if (stepType === 'USER_INTERACTION' || stepType === 'YES_NO') {
            activeStepInstanceIds.push(stepRow.instance_id);
          }
        }
      }

      activeWorkflows[wfRow.instance_id] = {
        instanceId: wfRow.instance_id,
        masterOid: wfRow.master_workflow_oid,
        name,
        workflowState: wfRow.workflow_state as WorkflowState,
        stepStates,
        activeStepInstanceIds,
        currentStepIndex: 0,
        totalSteps: stepRows.length,
        startedAt: wfRow.started_at,
        lastActivityAt: wfRow.last_activity_at,
      };
    }

    set({ activeWorkflows });
  },
}));
