// Settings screen: Notification preferences, storage info, and app metadata.

import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { colors, typography, spacing } from '@brainpal/ui';
import { ConfirmDialog } from '../../src/components/execution/ConfirmDialog';
import { useNotificationPrefs } from '../../src/hooks/useNotificationPrefs';
import { useStorageCounts } from '../../src/hooks/useStorageCounts';

// ---------------------------------------------------------------------------
// DB Status types (retained from original settings screen)
// ---------------------------------------------------------------------------

interface DbStatus {
  tableCount: number;
  schemaVersion: number;
  journalMode: string;
}

// ---------------------------------------------------------------------------
// StatusRow
// ---------------------------------------------------------------------------

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statusRow}>
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={styles.statusValue}>{value}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Settings Screen
// ---------------------------------------------------------------------------

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const { prefs, loading: prefsLoading, toggle } = useNotificationPrefs();
  const { counts, loading: countsLoading, refresh: refreshCounts } = useStorageCounts();

  // DB status (retained from original settings)
  const [dbStatus, setDbStatus] = useState<DbStatus | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);

  // Confirm dialog for clear completed
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    async function loadDbStatus() {
      try {
        const tableResult = await db.getFirstAsync<{ count: number }>(
          "SELECT COUNT(*) as count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
        );
        const versionResult = await db.getFirstAsync<{ user_version: number }>(
          'PRAGMA user_version',
        );
        const journalResult = await db.getFirstAsync<{ journal_mode: string }>(
          'PRAGMA journal_mode',
        );

        setDbStatus({
          tableCount: tableResult?.count ?? 0,
          schemaVersion: versionResult?.user_version ?? 0,
          journalMode: journalResult?.journal_mode ?? 'unknown',
        });
      } catch (err) {
        setDbError(err instanceof Error ? err.message : 'Failed to load database status');
      }
    }

    loadDbStatus();
  }, [db]);

  // ---------------------------------------------------------------------------
  // Clear completed workflows
  // ---------------------------------------------------------------------------

  const handleClearCompleted = useCallback(async () => {
    setClearing(true);
    try {
      // 1. Delete execution_log_entries for completed root workflows and their children
      await db.runAsync(
        `DELETE FROM execution_log_entries WHERE workflow_instance_id IN (
          SELECT instance_id FROM runtime_workflows
          WHERE (workflow_state IN ('COMPLETED', 'ABORTED', 'STOPPED') AND parent_workflow_instance_id IS NULL)
          OR parent_workflow_instance_id IN (
            SELECT instance_id FROM runtime_workflows
            WHERE workflow_state IN ('COMPLETED', 'ABORTED', 'STOPPED') AND parent_workflow_instance_id IS NULL
          )
        )`,
      );

      // 2. Delete child workflows of completed root workflows
      await db.runAsync(
        `DELETE FROM runtime_workflows WHERE parent_workflow_instance_id IN (
          SELECT instance_id FROM runtime_workflows
          WHERE workflow_state IN ('COMPLETED', 'ABORTED', 'STOPPED') AND parent_workflow_instance_id IS NULL
        )`,
      );

      // 3. Delete completed root workflows
      await db.runAsync(
        `DELETE FROM runtime_workflows
         WHERE workflow_state IN ('COMPLETED', 'ABORTED', 'STOPPED')
         AND parent_workflow_instance_id IS NULL`,
      );

      // 4. Refresh storage counts
      await refreshCounts();
    } catch (err) {
      console.warn('Failed to clear completed workflows:', err);
    } finally {
      setClearing(false);
      setShowClearConfirm(false);
    }
  }, [db, refreshCounts]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Settings</Text>

        {/* ─── Section 1: Notification Preferences ─── */}
        <Text style={styles.sectionTitle}>Notifications</Text>
        <View style={styles.card}>
          {prefsLoading ? (
            <Text style={styles.loadingText}>Loading...</Text>
          ) : prefs.length === 0 ? (
            <Text style={styles.loadingText}>No notification preferences found</Text>
          ) : (
            prefs.map((pref) => (
              <View key={pref.type} style={styles.switchRow}>
                <Text style={styles.statusLabel}>{pref.label}</Text>
                <Switch
                  value={pref.enabled}
                  onValueChange={() => toggle(pref.type, !pref.enabled)}
                  trackColor={{ false: colors.border, true: colors.primaryLight }}
                  thumbColor={pref.enabled ? colors.primary : colors.textSecondary}
                />
              </View>
            ))
          )}
        </View>

        {/* ─── Section 2: Storage Info ─── */}
        <Text style={styles.sectionTitle}>Storage</Text>
        <View style={styles.card}>
          {countsLoading || !counts ? (
            <Text style={styles.loadingText}>Loading...</Text>
          ) : (
            <>
              <StatusRow
                label="Downloaded Workflows"
                value={String(counts.downloaded)}
              />
              <StatusRow
                label="Active Instances"
                value={String(counts.active)}
              />
              <StatusRow
                label="Completed Instances"
                value={String(counts.completed)}
              />
            </>
          )}
        </View>

        <Pressable
          style={[
            styles.clearButton,
            (!counts || counts.completed === 0 || clearing) && styles.clearButtonDisabled,
          ]}
          onPress={() => setShowClearConfirm(true)}
          disabled={!counts || counts.completed === 0 || clearing}
        >
          <Text
            style={[
              styles.clearButtonText,
              (!counts || counts.completed === 0 || clearing) && styles.clearButtonTextDisabled,
            ]}
          >
            {clearing ? 'Clearing...' : 'Clear Completed Workflows'}
          </Text>
        </Pressable>

        {/* ─── Section 3: App Info ─── */}
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.card}>
          <StatusRow label="Version" value="0.0.1" />
          <StatusRow label="Build" value="dev" />
          <StatusRow label="Platform" value={Platform.OS} />
        </View>

        {/* ─── Section 4: Database Status (retained from original) ─── */}
        <Text style={styles.sectionTitle}>Database Status</Text>
        <View style={styles.card}>
          {dbError ? (
            <Text style={styles.errorText}>{dbError}</Text>
          ) : dbStatus ? (
            <>
              <StatusRow
                label="Tables created"
                value={String(dbStatus.tableCount)}
              />
              <StatusRow
                label="Schema version"
                value={String(dbStatus.schemaVersion)}
              />
              <StatusRow label="Journal mode" value={dbStatus.journalMode} />
            </>
          ) : (
            <Text style={styles.loadingText}>Loading...</Text>
          )}
        </View>
      </ScrollView>

      <ConfirmDialog
        visible={showClearConfirm}
        title="Clear Completed Workflows"
        message="Delete all completed workflows and their execution history? This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onConfirm={handleClearCompleted}
        onCancel={() => setShowClearConfirm(false)}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.lg * 2,
  },
  title: {
    ...typography.heading,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.subheading,
    color: colors.textPrimary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  statusLabel: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
  },
  statusValue: {
    ...typography.body,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  clearButton: {
    marginTop: spacing.md,
    backgroundColor: colors.error,
    borderRadius: 8,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  clearButtonDisabled: {
    backgroundColor: colors.border,
  },
  clearButtonText: {
    ...typography.subheading,
    color: colors.surface,
  },
  clearButtonTextDisabled: {
    color: colors.textSecondary,
  },
  errorText: {
    ...typography.body,
    color: colors.error,
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
