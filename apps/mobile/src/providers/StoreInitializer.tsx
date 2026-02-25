import React, { useEffect, useState, type PropsWithChildren } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { colors, typography, spacing } from '@brainpal/ui';
import { useEnvironmentStore } from '../stores/environment-store';
import { useWorkflowStore } from '../stores/workflow-store';

/**
 * Initializes all Zustand stores from SQLite before rendering children.
 *
 * Must be rendered inside a SQLiteProvider so useSQLiteContext() is available.
 * Shows a loading indicator while stores are being populated from the database.
 * Shows an error state if initialization fails.
 */
export function StoreInitializer({ children }: PropsWithChildren) {
  const db = useSQLiteContext();
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function initStores() {
      try {
        await Promise.all([
          useEnvironmentStore.getState().loadFromDb(db),
          useWorkflowStore.getState().loadFromDb(db),
        ]);
        if (!cancelled) {
          setIsReady(true);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to initialize stores',
          );
        }
      }
    }

    initStores();

    return () => {
      cancelled = true;
    };
  }, [db]);

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorTitle}>Initialization Error</Text>
        <Text style={styles.errorMessage}>{error}</Text>
      </View>
    );
  }

  if (!isReady) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.base,
  },
  errorTitle: {
    ...typography.subheading,
    color: colors.error,
    marginBottom: spacing.sm,
  },
  errorMessage: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
