// useNotificationPrefs: Read/write notification preference toggles from SQLite.
// Uses ON CONFLICT DO UPDATE (upsert) -- NEVER INSERT OR REPLACE (cascade danger).

import { useCallback, useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NotificationPref {
  type: string;
  label: string;
  enabled: boolean;
}

interface NotificationPrefRow {
  notification_type: string;
  enabled: number;
}

// ---------------------------------------------------------------------------
// Label mapping (user-facing types only)
// ---------------------------------------------------------------------------

const USER_FACING_TYPES: Record<string, string> = {
  STEP_ATTENTION: 'Step needs attention',
  ERROR: 'Errors and failures',
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useNotificationPrefs() {
  const db = useSQLiteContext();
  const [prefs, setPrefs] = useState<NotificationPref[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPrefs = useCallback(async () => {
    try {
      const rows = await db.getAllAsync<NotificationPrefRow>(
        'SELECT * FROM notification_preferences',
      );

      const mapped: NotificationPref[] = [];
      for (const row of rows) {
        const label = USER_FACING_TYPES[row.notification_type];
        // Skip non-user-facing types (ACTION_COMPLETED, STATE_TRANSITION,
        // RESOURCE_ACQUIRED, TIMEOUT). TIMEOUT is hidden because engine
        // has no TIMEOUT event -- displaying it would be misleading.
        if (!label) continue;

        mapped.push({
          type: row.notification_type,
          label,
          enabled: row.enabled === 1,
        });
      }

      setPrefs(mapped);
    } catch (err) {
      console.warn('useNotificationPrefs: failed to load preferences', err);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => {
    loadPrefs();
  }, [loadPrefs]);

  const toggle = useCallback(
    async (type: string, enabled: boolean) => {
      // Upsert pattern -- NOT INSERT OR REPLACE (avoids cascade deletion)
      await db.runAsync(
        `INSERT INTO notification_preferences (notification_type, enabled)
         VALUES (?, ?)
         ON CONFLICT(notification_type) DO UPDATE SET enabled = excluded.enabled`,
        [type, enabled ? 1 : 0],
      );
      // Refresh state
      await loadPrefs();
    },
    [db, loadPrefs],
  );

  return { prefs, loading, toggle };
}
