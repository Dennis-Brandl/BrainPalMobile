// Home screen: Active/Library dual-tab layout for workflow management.

import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { colors, typography, spacing } from '@brainpal/ui';
import { useWorkflowStore, type MasterWorkflow, type RuntimeWorkflowSummary } from '../../src/stores/workflow-store';
import { useExecutionStore } from '../../src/stores/execution-store';
import { ActiveWorkflowCard } from '../../src/components/workflow/WorkflowCard';
import { LibraryWorkflowCard } from '../../src/components/workflow/WorkflowCard';
import { useImportWorkflow } from '../../src/hooks/useImportWorkflow';

// ---------------------------------------------------------------------------
// Tab type
// ---------------------------------------------------------------------------

type TabKey = 'active' | 'library';

// ---------------------------------------------------------------------------
// Home Screen
// ---------------------------------------------------------------------------

export default function HomeScreen() {
  const [activeTab, setActiveTab] = useState<TabKey>('active');
  const router = useRouter();
  const { importWorkflow, isImporting } = useImportWorkflow();

  // Store data
  const masterWorkflows = useWorkflowStore((s) => s.masterWorkflows);
  const runtimeWorkflows = useWorkflowStore((s) => s.runtimeWorkflows);
  const activeWorkflows = useExecutionStore((s) => s.activeWorkflows);

  // Build active workflow list from execution store + workflow store
  const activeWorkflowList: RuntimeWorkflowSummary[] = React.useMemo(() => {
    // Merge: use execution store for active ones, workflow store for runtime list
    const activeIds = new Set(Object.keys(activeWorkflows));
    const fromExec: RuntimeWorkflowSummary[] = Object.values(activeWorkflows).map((wf) => ({
      instanceId: wf.instanceId,
      masterOid: wf.masterOid,
      name: wf.name,
      workflowState: wf.workflowState,
      startedAt: wf.startedAt,
      lastActivityAt: wf.lastActivityAt,
    }));
    // Also include runtime workflows from the workflow store that aren't in execution store
    const fromStore = runtimeWorkflows.filter((w) => !activeIds.has(w.instanceId));
    return [...fromExec, ...fromStore];
  }, [activeWorkflows, runtimeWorkflows]);

  // Navigation handlers
  const handleActivePress = useCallback(
    (instanceId: string) => {
      router.push(`/execution/${instanceId}` as Href);
    },
    [router],
  );

  const handleLibraryPress = useCallback(
    (oid: string) => {
      router.push(`/execution/library/${oid}` as Href);
    },
    [router],
  );

  // Render items
  const renderActiveItem = useCallback(
    ({ item }: { item: RuntimeWorkflowSummary }) => (
      <ActiveWorkflowCard
        workflow={item}
        onPress={() => handleActivePress(item.instanceId)}
      />
    ),
    [handleActivePress],
  );

  const renderLibraryItem = useCallback(
    ({ item }: { item: MasterWorkflow }) => (
      <LibraryWorkflowCard
        workflow={item}
        onPress={() => handleLibraryPress(item.oid)}
      />
    ),
    [handleLibraryPress],
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>BrainPal Mobile</Text>
        {activeTab === 'library' && (
          <Pressable
            style={styles.importButton}
            onPress={importWorkflow}
            disabled={isImporting}
          >
            {isImporting ? (
              <>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.importButtonText}>Importing...</Text>
              </>
            ) : (
              <>
                <FontAwesome name="download" size={16} color={colors.primary} />
                <Text style={styles.importButtonText}>Import</Text>
              </>
            )}
          </Pressable>
        )}
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tab, activeTab === 'active' && styles.tabActive]}
          onPress={() => setActiveTab('active')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'active' && styles.tabTextActive,
            ]}
          >
            Active
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === 'library' && styles.tabActive]}
          onPress={() => setActiveTab('library')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'library' && styles.tabTextActive,
            ]}
          >
            Library
          </Text>
        </Pressable>
      </View>

      {/* Content */}
      {activeTab === 'active' ? (
        <FlatList
          contentContainerStyle={styles.listContent}
          data={activeWorkflowList}
          keyExtractor={(item) => item.instanceId}
          renderItem={renderActiveItem}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No active workflows</Text>
              <Text style={styles.emptyHint}>
                Go to the Library tab to start a workflow
              </Text>
            </View>
          }
        />
      ) : (
        <FlatList
          contentContainerStyle={styles.listContent}
          data={masterWorkflows}
          keyExtractor={(item) => item.oid}
          renderItem={renderLibraryItem}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No workflows downloaded</Text>
              <Text style={styles.emptyHint}>
                Import a .WFmasterX package to get started
              </Text>
            </View>
          }
        />
      )}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: {
    ...typography.heading,
    color: colors.textPrimary,
  },
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    gap: spacing.xs,
  },
  importButtonText: {
    ...typography.body,
    color: colors.primary,
    fontWeight: '600',
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.primary,
  },
  tabText: {
    ...typography.subheading,
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.primary,
  },
  listContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
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
