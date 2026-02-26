// useActiveSteps: Derives the list of active user interaction steps for the
// step carousel from the execution store and SQLite runtime_steps table.

import { useEffect, useMemo, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import type {
  StepType,
  StepState,
  MasterWorkflowStep,
  FormLayoutEntry,
} from '@brainpal/engine';
import type { RuntimeStepRow } from '@brainpal/storage';
import { useExecutionStore } from '../stores/execution-store';
import { useDeviceType, type DeviceType } from './useDeviceType';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActiveStep {
  stepInstanceId: string;
  stepOid: string;
  stepType: StepType;
  stepState: StepState;
  stepSpec: MasterWorkflowStep;
  formLayout: FormLayoutEntry | null;
}

export interface UseActiveStepsResult {
  steps: ActiveStep[];
  isLoading: boolean;
}

// ---------------------------------------------------------------------------
// Layout selection
// ---------------------------------------------------------------------------

function selectFormLayout(
  layouts: FormLayoutEntry[] | undefined,
  deviceType: DeviceType,
): FormLayoutEntry | null {
  if (!layouts || layouts.length === 0) return null;

  // Try exact match
  const exact = layouts.find((l) => l.deviceType === deviceType);
  if (exact) return exact;

  // Fallback chain
  const fallbackOrder: DeviceType[] =
    deviceType === 'desktop'
      ? ['tablet', 'phone']
      : deviceType === 'tablet'
        ? ['phone', 'desktop']
        : ['tablet', 'desktop'];

  for (const fallback of fallbackOrder) {
    const found = layouts.find((l) => l.deviceType === fallback);
    if (found) return found;
  }

  // Last resort: first available
  return layouts[0] ?? null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const EMPTY_IDS: string[] = [];

export function useActiveSteps(workflowInstanceId: string): UseActiveStepsResult {
  const db = useSQLiteContext();
  const deviceType = useDeviceType();

  // Subscribe to the specific workflow's active step instance IDs
  // Use stable empty array to prevent infinite re-render loops
  const activeStepInstanceIds = useExecutionStore(
    (s) => s.activeWorkflows[workflowInstanceId]?.activeStepInstanceIds ?? EMPTY_IDS,
  );

  const [stepRows, setStepRows] = useState<RuntimeStepRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch step rows from SQLite when active step IDs change
  useEffect(() => {
    if (activeStepInstanceIds.length === 0) {
      setStepRows([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function loadSteps() {
      try {
        // Build query with IN clause
        const placeholders = activeStepInstanceIds.map(() => '?').join(',');
        const rows = await db.getAllAsync<RuntimeStepRow>(
          `SELECT * FROM runtime_steps WHERE instance_id IN (${placeholders})`,
          activeStepInstanceIds,
        );
        if (!cancelled) {
          setStepRows(rows);
          setIsLoading(false);
        }
      } catch (err) {
        console.warn('useActiveSteps: failed to load step rows', err);
        if (!cancelled) {
          setStepRows([]);
          setIsLoading(false);
        }
      }
    }

    setIsLoading(true);
    loadSteps();

    return () => {
      cancelled = true;
    };
  }, [db, activeStepInstanceIds]);

  // Derive ActiveStep objects from step rows
  const steps = useMemo<ActiveStep[]>(() => {
    const result: ActiveStep[] = [];

    for (const row of stepRows) {
      const stepType = row.step_type as StepType;

      // Only include user-facing step types
      if (stepType !== 'USER_INTERACTION' && stepType !== 'YES_NO') {
        continue;
      }

      let stepSpec: MasterWorkflowStep;
      try {
        stepSpec = JSON.parse(row.step_json) as MasterWorkflowStep;
      } catch {
        console.warn(`useActiveSteps: failed to parse step_json for ${row.instance_id}`);
        continue;
      }

      const formLayout = selectFormLayout(stepSpec.form_layout_config, deviceType);

      result.push({
        stepInstanceId: row.instance_id,
        stepOid: row.step_oid,
        stepType,
        stepState: row.step_state as StepState,
        stepSpec,
        formLayout,
      });
    }

    // Preserve insertion order (matches activeStepInstanceIds order)
    return result.sort((a, b) => {
      const idxA = activeStepInstanceIds.indexOf(a.stepInstanceId);
      const idxB = activeStepInstanceIds.indexOf(b.stepInstanceId);
      return idxA - idxB;
    });
  }, [stepRows, deviceType, activeStepInstanceIds]);

  return { steps, isLoading };
}
