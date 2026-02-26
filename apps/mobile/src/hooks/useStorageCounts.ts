// useStorageCounts: Queries storage metrics for the Settings screen.
// Shows downloaded workflows, active instances, and completed instances.

import { useCallback, useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StorageCounts {
  downloaded: number;
  active: number;
  completed: number;
  storageBytes: number;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useStorageCounts() {
  const db = useSQLiteContext();
  const [counts, setCounts] = useState<StorageCounts | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [downloadedRow, activeRow, completedRow, storageRow] = await Promise.all([
        db.getFirstAsync<{ count: number }>(
          'SELECT COUNT(*) as count FROM master_workflows',
        ),
        db.getFirstAsync<{ count: number }>(
          `SELECT COUNT(*) as count FROM runtime_workflows
           WHERE workflow_state IN ('IDLE', 'RUNNING', 'PAUSED')
           AND parent_workflow_instance_id IS NULL`,
        ),
        db.getFirstAsync<{ count: number }>(
          `SELECT COUNT(*) as count FROM runtime_workflows
           WHERE workflow_state IN ('COMPLETED', 'ABORTED', 'STOPPED')
           AND parent_workflow_instance_id IS NULL`,
        ),
        db.getFirstAsync<{ bytes: number }>(
          `SELECT page_count * page_size as bytes FROM pragma_page_count(), pragma_page_size()`,
        ),
      ]);

      setCounts({
        downloaded: downloadedRow?.count ?? 0,
        active: activeRow?.count ?? 0,
        completed: completedRow?.count ?? 0,
        storageBytes: storageRow?.bytes ?? 0,
      });
    } catch (err) {
      console.warn('useStorageCounts: failed to load counts', err);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { counts, loading, refresh };
}
