// History tab: Lists completed/aborted/stopped workflows with pull-to-refresh
// and individual delete via confirmation dialog.

import React, { useCallback, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { colors, typography, spacing } from '@brainpal/ui';
import { useCompletedWorkflows, useDeleteWorkflow, type HistoryWorkflow } from '../../src/hooks/useHistory';
import { StateBadge } from '../../src/components/workflow/StateBadge';
import { ConfirmDialog } from '../../src/components/execution/ConfirmDialog';

// ---------------------------------------------------------------------------
// Format date for display
// ---------------------------------------------------------------------------

function formatDate(iso: string | null): string {
  if (!iso) return '--';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// History Screen
// ---------------------------------------------------------------------------

export default function HistoryScreen() {
  const router = useRouter();
  const { workflows, loading, refresh } = useCompletedWorkflows();
  const deleteWorkflow = useDeleteWorkflow();

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    await deleteWorkflow(deleteTarget);
    setDeleteTarget(null);
    refresh();
  }, [deleteTarget, deleteWorkflow, refresh]);

  const handlePress = useCallback(
    (instanceId: string) => {
      router.push(`/execution/history/${instanceId}` as Href);
    },
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: HistoryWorkflow }) => (
      <Pressable
        style={styles.card}
        onPress={() => handlePress(item.instanceId)}
      >
        <View style={styles.cardRow}>
          <View style={styles.cardLeft}>
            <Text style={styles.cardName} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.cardDate}>{formatDate(item.startedAt)}</Text>
          </View>
          <View style={styles.cardRight}>
            <StateBadge state={item.state} size="small" />
            <Text style={styles.cardDuration}>{item.duration}</Text>
          </View>
        </View>
        <Pressable
          style={styles.deleteButton}
          onPress={() => setDeleteTarget(item.instanceId)}
          hitSlop={8}
        >
          <FontAwesome name="trash-o" size={18} color={colors.textSecondary} />
        </Pressable>
      </Pressable>
    ),
    [handlePress],
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        contentContainerStyle={styles.listContent}
        data={workflows}
        keyExtractor={(item) => item.instanceId}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} />
        }
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.emptyContainer}>
              <FontAwesome
                name="clock-o"
                size={48}
                color={colors.border}
                style={styles.emptyIcon}
              />
              <Text style={styles.emptyText}>No completed workflows yet</Text>
              <Text style={styles.emptyHint}>
                Completed, aborted, and stopped workflows will appear here
              </Text>
            </View>
          )
        }
      />

      <ConfirmDialog
        visible={deleteTarget !== null}
        title="Delete Workflow"
        message="Delete this workflow and its execution history?"
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
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
  listContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.base,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardLeft: {
    flex: 1,
    marginRight: spacing.md,
  },
  cardName: {
    ...typography.subheading,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  cardDate: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  cardRight: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  cardDuration: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  deleteButton: {
    paddingLeft: spacing.md,
    paddingVertical: spacing.sm,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  emptyIcon: {
    marginBottom: spacing.base,
  },
  emptyText: {
    ...typography.subheading,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  emptyHint: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
