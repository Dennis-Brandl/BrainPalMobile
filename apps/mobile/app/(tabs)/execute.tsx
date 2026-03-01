// Execute tab: Smart active-workflow routing screen.
// Zero workflows -> empty state. One workflow -> auto-redirect.
// Multiple workflows -> selectable list.

import React, { useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect, type Href } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { colors, typography, spacing } from '@brainpal/ui';
import { useExecutionStore, type ActiveWorkflowState } from '../../src/stores/execution-store';
import { StateBadge } from '../../src/components/workflow/StateBadge';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ExecuteScreen() {
  const router = useRouter();
  const activeWorkflows = useExecutionStore((s) => s.activeWorkflows);

  // Sort by most recent activity (locked decision: most recently started first)
  const activeList = useMemo(
    () =>
      Object.values(activeWorkflows).sort((a, b) => {
        const aTime = a.lastActivityAt ?? a.startedAt ?? '';
        const bTime = b.lastActivityAt ?? b.startedAt ?? '';
        return bTime.localeCompare(aTime); // descending
      }),
    [activeWorkflows],
  );

  // Single-workflow auto-redirect on tab focus
  useFocusEffect(
    useCallback(() => {
      if (activeList.length === 1) {
        router.replace(`/execution/${activeList[0].instanceId}` as Href);
      }
    }, [activeList, router]),
  );

  // Navigation handler for multi-workflow list
  const handlePress = useCallback(
    (instanceId: string) => {
      router.push(`/execution/${instanceId}` as Href);
    },
    [router],
  );

  // Render item for multi-workflow list
  const renderItem = useCallback(
    ({ item }: { item: ActiveWorkflowState }) => (
      <Pressable
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        onPress={() => handlePress(item.instanceId)}
      >
        <View style={styles.cardRow}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.name}
          </Text>
          <StateBadge state={item.workflowState} size="small" />
        </View>
        <Text style={styles.cardMeta} numberOfLines={1}>
          {item.activeStepInstanceIds.length > 0
            ? `${item.activeStepInstanceIds.length} active step${item.activeStepInstanceIds.length > 1 ? 's' : ''}`
            : 'Waiting...'}
        </Text>
      </Pressable>
    ),
    [handlePress],
  );

  const keyExtractor = useCallback(
    (item: ActiveWorkflowState) => item.instanceId,
    [],
  );

  // -------------------------------------------------------------------------
  // Branch: single workflow -- show loading while redirect fires
  // -------------------------------------------------------------------------

  if (activeList.length === 1) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // -------------------------------------------------------------------------
  // Branch: zero workflows -- empty state
  // -------------------------------------------------------------------------

  if (activeList.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.centered}>
          <FontAwesome
            name="play-circle"
            size={64}
            color={colors.textSecondary}
            style={styles.emptyIcon}
          />
          <Text style={styles.emptyTitle}>No Active Workflow</Text>
          <Text style={styles.emptyBody}>
            Start a workflow from the Library tab on the Home screen
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // -------------------------------------------------------------------------
  // Branch: multiple workflows -- selectable list
  // -------------------------------------------------------------------------

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <Text style={styles.heading}>Active Workflows</Text>
      </View>
      <FlatList
        contentContainerStyle={styles.listContent}
        data={activeList}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
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
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  emptyIcon: {
    opacity: 0.4,
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    ...typography.subheading,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  emptyBody: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  heading: {
    ...typography.heading,
    color: colors.textPrimary,
  },
  listContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.base,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardPressed: {
    opacity: 0.7,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  cardTitle: {
    ...typography.subheading,
    color: colors.textPrimary,
    flex: 1,
    marginRight: spacing.sm,
  },
  cardMeta: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
