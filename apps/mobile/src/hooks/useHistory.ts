// useHistory: SQLite query hooks for the History tab and history detail screen.
// Provides completed workflow listing, step/audit detail, and individual deletion.

import { useCallback, useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import type { WorkflowState, StepState, StepType } from '@brainpal/engine';
import type { RuntimeWorkflowRow, RuntimeStepRow, ExecutionLogRow } from '@brainpal/storage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HistoryWorkflow {
  instanceId: string;
  name: string;
  state: WorkflowState;
  startedAt: string | null;
  completedAt: string | null;
  duration: string;
}

export interface HistoryStep {
  instanceId: string;
  name: string;
  stepType: StepType;
  state: StepState;
  duration: string;
  resolvedInputs: string | null;
  resolvedOutputs: string | null;
  userInputs: string | null;
}

export interface HistoryLogEntry {
  id: number;
  stepOid: string | null;
  eventType: string;
  eventData: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Duration formatting helper (private to module)
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  if (ms < 1000) return '< 1s';

  const totalSeconds = Math.floor(ms / 1000);

  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes < 60) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0
    ? `${hours}h ${remainingMinutes}m`
    : `${hours}h`;
}

// ---------------------------------------------------------------------------
// Parse workflow name from specification_json
// ---------------------------------------------------------------------------

function parseWorkflowName(specJson: string): string {
  try {
    const spec = JSON.parse(specJson);
    return spec.local_id ?? spec.description ?? 'Untitled Workflow';
  } catch {
    return 'Untitled Workflow';
  }
}

// ---------------------------------------------------------------------------
// Parse step name from step_json
// ---------------------------------------------------------------------------

function parseStepName(stepJson: string): string {
  try {
    const step = JSON.parse(stepJson);
    return step.local_id ?? step.description ?? 'Unnamed Step';
  } catch {
    return 'Unnamed Step';
  }
}

// ---------------------------------------------------------------------------
// Compute duration between two ISO timestamps
// ---------------------------------------------------------------------------

function computeDuration(startIso: string | null, endIso: string | null): string {
  if (!startIso || !endIso) return '--';
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (ms < 0) return '--';
  return formatDuration(ms);
}

// ---------------------------------------------------------------------------
// Hook: useCompletedWorkflows
// ---------------------------------------------------------------------------

export function useCompletedWorkflows() {
  const db = useSQLiteContext();
  const [workflows, setWorkflows] = useState<HistoryWorkflow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const rows = await db.getAllAsync<RuntimeWorkflowRow>(
        `SELECT instance_id, master_workflow_oid, workflow_state, specification_json,
                created_at, started_at, completed_at
         FROM runtime_workflows
         WHERE workflow_state IN ('COMPLETED', 'ABORTED', 'STOPPED')
           AND parent_workflow_instance_id IS NULL
         ORDER BY completed_at DESC`,
      );

      const mapped: HistoryWorkflow[] = rows.map((row) => ({
        instanceId: row.instance_id,
        name: parseWorkflowName(row.specification_json),
        state: row.workflow_state as WorkflowState,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        duration: computeDuration(row.started_at, row.completed_at),
      }));

      setWorkflows(mapped);
    } catch (err) {
      console.warn('useCompletedWorkflows: failed to load', err);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { workflows, loading, refresh };
}

// ---------------------------------------------------------------------------
// Hook: useWorkflowHistory
// ---------------------------------------------------------------------------

export function useWorkflowHistory(instanceId: string) {
  const db = useSQLiteContext();
  const [steps, setSteps] = useState<HistoryStep[]>([]);
  const [logEntries, setLogEntries] = useState<HistoryLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // Query steps: include parent + child workflow steps, exclude control-flow types
        const stepRows = await db.getAllAsync<RuntimeStepRow>(
          `SELECT s.* FROM runtime_steps s
           JOIN runtime_workflows w ON s.workflow_instance_id = w.instance_id
           WHERE (w.instance_id = ? OR w.parent_workflow_instance_id = ?)
             AND s.step_type NOT IN ('START', 'END', 'PARALLEL', 'WAIT_ALL', 'WAIT_ANY')
           ORDER BY s.activated_at ASC`,
          [instanceId, instanceId],
        );

        if (cancelled) return;

        const mappedSteps: HistoryStep[] = stepRows.map((row) => ({
          instanceId: row.instance_id,
          name: parseStepName(row.step_json),
          stepType: row.step_type as StepType,
          state: row.step_state as StepState,
          duration: computeDuration(row.activated_at, row.completed_at),
          resolvedInputs: row.resolved_inputs_json,
          resolvedOutputs: row.resolved_outputs_json,
          userInputs: row.user_inputs_json,
        }));

        // Query audit log: include parent + child workflow entries
        const logRows = await db.getAllAsync<ExecutionLogRow>(
          `SELECT * FROM execution_log_entries
           WHERE workflow_instance_id = ?
              OR workflow_instance_id IN (
                SELECT instance_id FROM runtime_workflows
                WHERE parent_workflow_instance_id = ?
              )
           ORDER BY timestamp ASC`,
          [instanceId, instanceId],
        );

        if (cancelled) return;

        const mappedLogs: HistoryLogEntry[] = logRows.map((row) => ({
          id: row.id,
          stepOid: row.step_oid,
          eventType: row.event_type,
          eventData: row.event_data_json,
          timestamp: row.timestamp,
        }));

        setSteps(mappedSteps);
        setLogEntries(mappedLogs);
      } catch (err) {
        console.warn('useWorkflowHistory: failed to load', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    setLoading(true);
    load();

    return () => {
      cancelled = true;
    };
  }, [db, instanceId]);

  return { steps, logEntries, loading };
}

// ---------------------------------------------------------------------------
// Hook: useDeleteWorkflow
// ---------------------------------------------------------------------------

export function useDeleteWorkflow() {
  const db = useSQLiteContext();

  const deleteWorkflow = useCallback(
    async (instanceId: string): Promise<void> => {
      // 1. Delete execution_log_entries first (no ON DELETE CASCADE on this FK)
      await db.runAsync(
        `DELETE FROM execution_log_entries
         WHERE workflow_instance_id = ?
            OR workflow_instance_id IN (
              SELECT instance_id FROM runtime_workflows
              WHERE parent_workflow_instance_id = ?
            )`,
        [instanceId, instanceId],
      );

      // 2. Delete child workflows (runtime_steps/connections cascade from FK)
      await db.runAsync(
        'DELETE FROM runtime_workflows WHERE parent_workflow_instance_id = ?',
        [instanceId],
      );

      // 3. Delete parent workflow (runtime_steps/connections cascade from FK)
      await db.runAsync(
        'DELETE FROM runtime_workflows WHERE instance_id = ?',
        [instanceId],
      );
    },
    [db],
  );

  return deleteWorkflow;
}
