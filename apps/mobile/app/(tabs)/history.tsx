// History tab: Lists completed/aborted/stopped workflows with pull-to-refresh
// and individual delete via confirmation dialog.

import React, { useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect, type Href } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { colors, typography, spacing } from '@brainpal/ui';
import { useCompletedWorkflows, useDeleteWorkflow, type HistoryWorkflow } from '../../src/hooks/useHistory';
import { StateBadge } from '../../src/components/workflow/StateBadge';

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
    second: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// History Screen
// ---------------------------------------------------------------------------

export default function HistoryScreen() {
  const router = useRouter();
  const { workflows, loading, hasMore, loadMore, refresh } = useCompletedWorkflows();
  const deleteWorkflow = useDeleteWorkflow();

  // Re-query when tab gains focus (tabs stay mounted in tab navigator)
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

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
            <Text style={styles.cardDate}>
              {formatDate(item.startedAt)}  {'\u00B7'}  {item.instanceId.slice(0, 8)}
            </Text>
          </View>
          <View style={styles.cardRight}>
            <StateBadge state={item.state} size="small" />
            <Text style={styles.cardDuration}>{item.duration}</Text>
          </View>
        </View>
        <Pressable
          style={styles.deleteButton}
          onPress={() => {
            Alert.alert(
              'Delete Workflow',
              'Delete this workflow run from history?',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: async () => {
                    await deleteWorkflow(item.instanceId);
                    refresh();
                  },
                },
              ],
            );
          }}
          hitSlop={8}
        >
          <FontAwesome name="trash-o" size={18} color={colors.textSecondary} />
        </Pressable>
      </Pressable>
    ),
    [handlePress, deleteWorkflow, refresh],
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        contentContainerStyle={styles.listContent}
        data={workflows}
        keyExtractor={(item) => item.instanceId}
        renderItem={renderItem}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl refreshing={loading && workflows.length === 0} onRefresh={refresh} />
        }
        ListFooterComponent={
          loading && workflows.length > 0 ? (
            <ActivityIndicator style={styles.footerLoader} color={colors.primary} />
          ) : null
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
  footerLoader: {
    paddingVertical: spacing.lg,
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
