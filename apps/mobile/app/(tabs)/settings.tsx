import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { colors, typography, spacing } from '@brainpal/ui';

interface DbStatus {
  tableCount: number;
  schemaVersion: number;
  journalMode: string;
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statusRow}>
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={styles.statusValue}>{value}</Text>
    </View>
  );
}

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const [dbStatus, setDbStatus] = useState<DbStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        setError(err instanceof Error ? err.message : 'Failed to load database status');
      }
    }

    loadDbStatus();
  }, [db]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.content}>
        <Text style={styles.title}>Settings</Text>

        <Text style={styles.sectionTitle}>Database Status</Text>
        <View style={styles.card}>
          {error ? (
            <Text style={styles.errorText}>{error}</Text>
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
              <StatusRow label="Platform" value={Platform.OS} />
            </>
          ) : (
            <Text style={styles.loadingText}>Loading...</Text>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    padding: spacing.lg,
  },
  title: {
    ...typography.heading,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.subheading,
    color: colors.textPrimary,
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
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  statusLabel: {
    ...typography.body,
    color: colors.textPrimary,
  },
  statusValue: {
    ...typography.body,
    color: colors.textSecondary,
    fontWeight: '500',
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
