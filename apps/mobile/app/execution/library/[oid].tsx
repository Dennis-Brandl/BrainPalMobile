// Library workflow detail screen: shows workflow info and "Start Execution" button.

import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { colors, typography, spacing } from '@brainpal/ui';
import type { MasterWorkflowSpecification } from '@brainpal/engine';
import { SPEC_STEP_TYPE_MAP } from '@brainpal/engine';
import {
  useWorkflowStore,
  getSpecificationJson,
} from '../../../src/stores/workflow-store';
import { useExecutionStore } from '../../../src/stores/execution-store';
import { useEngine } from '../../../src/providers/EngineProvider';

// ---------------------------------------------------------------------------
// Step type display names
// ---------------------------------------------------------------------------

const STEP_TYPE_DISPLAY: Record<string, string> = {
  START: 'Start',
  END: 'End',
  USER_INTERACTION: 'User Interaction',
  YES_NO: 'Yes/No',
  SELECT_1: 'Select 1',
  PARALLEL: 'Parallel',
  WAIT_ALL: 'Wait All',
  WAIT_ANY: 'Wait Any',
  WORKFLOW_PROXY: 'Workflow Proxy',
  ACTION_PROXY: 'Action Proxy',
  SCRIPT: 'Script',
};

// ---------------------------------------------------------------------------
// Library Detail Screen
// ---------------------------------------------------------------------------

export default function LibraryDetailScreen() {
  const { oid } = useLocalSearchParams<{ oid: string }>();
  const router = useRouter();
  const db = useSQLiteContext();
  const { runner } = useEngine();
  const addActiveWorkflow = useExecutionStore((s) => s.addActiveWorkflow);
  const setCurrentWorkflow = useExecutionStore((s) => s.setCurrentWorkflow);

  const [isStarting, setIsStarting] = useState(false);

  // Find workflow in store
  const workflow = useWorkflowStore((s) =>
    s.masterWorkflows.find((w) => w.oid === oid),
  );

  // Parse step type breakdown from specification_json (loaded lazily)
  const [stepBreakdown, setStepBreakdown] = useState<
    Array<{ type: string; count: number }> | null
  >(null);

  React.useEffect(() => {
    if (!oid) return;
    let cancelled = false;

    getSpecificationJson(db, oid).then((json) => {
      if (cancelled || !json) return;
      try {
        const spec = JSON.parse(json) as MasterWorkflowSpecification;
        const counts: Record<string, number> = {};
        for (const step of spec.steps) {
          const normalizedType =
            SPEC_STEP_TYPE_MAP[step.step_type] ?? step.step_type;
          const displayName =
            STEP_TYPE_DISPLAY[normalizedType] ?? normalizedType;
          counts[displayName] = (counts[displayName] ?? 0) + 1;
        }
        const breakdown = Object.entries(counts)
          .map(([type, count]) => ({ type, count }))
          .sort((a, b) => b.count - a.count);
        setStepBreakdown(breakdown);
      } catch {
        setStepBreakdown([]);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [db, oid]);

  // Start Execution handler
  const handleStartExecution = useCallback(async () => {
    if (!oid || isStarting) return;
    setIsStarting(true);

    try {
      // 1. Get full specification JSON
      const specJson = await getSpecificationJson(db, oid);
      if (!specJson) {
        Alert.alert('Error', 'Could not load workflow specification.');
        setIsStarting(false);
        return;
      }

      // 2. Parse to MasterWorkflowSpecification
      const spec = JSON.parse(specJson) as MasterWorkflowSpecification;

      // 3. Create runtime workflow via engine runner (no events emitted yet)
      const instanceId = await runner.createWorkflow(spec);

      // 4. Add to stores BEFORE starting (so event handlers find the entry)
      const name = workflow?.local_id ?? spec.local_id ?? 'Workflow';
      const totalSteps = spec.steps?.length ?? 0;
      addActiveWorkflow(instanceId, oid, name, totalSteps);
      setCurrentWorkflow(instanceId);

      useWorkflowStore.getState().addRuntimeWorkflow({
        instanceId,
        masterOid: oid,
        name,
        workflowState: 'IDLE',
        startedAt: null,
        lastActivityAt: new Date().toISOString(),
      });

      // 5. Start the workflow (emits WORKFLOW_STARTED → store updates to RUNNING)
      await runner.startWorkflow(instanceId);

      // 6. Navigate to execution screen
      router.replace(`/execution/${instanceId}` as Href);
    } catch (err) {
      console.error('Failed to start workflow:', err);
      Alert.alert(
        'Start Failed',
        `Could not start workflow: ${err instanceof Error ? err.message : String(err)}`,
      );
      setIsStarting(false);
    }
  }, [oid, isStarting, db, runner, workflow, addActiveWorkflow, setCurrentWorkflow, router]);

  // Format downloaded date
  const downloadedDate = useMemo(() => {
    if (!workflow?.downloaded_at) return null;
    try {
      return new Date(workflow.downloaded_at).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return workflow.downloaded_at;
    }
  }, [workflow?.downloaded_at]);

  // ---------------------------------------------------------------------------
  // Not found state
  // ---------------------------------------------------------------------------

  if (!workflow) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Workflow not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Workflow name */}
        <Text style={styles.workflowName}>{workflow.local_id}</Text>

        {/* Version badge */}
        <View style={styles.metaRow}>
          <View style={styles.versionBadge}>
            <Text style={styles.versionText}>v{workflow.version}</Text>
          </View>
          <Text style={styles.stepCountText}>
            {workflow.stepCount} step{workflow.stepCount !== 1 ? 's' : ''}
          </Text>
        </View>

        {/* Description */}
        {workflow.description ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.descriptionText}>{workflow.description}</Text>
          </View>
        ) : null}

        {/* Step type breakdown */}
        {stepBreakdown && stepBreakdown.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Step Breakdown</Text>
            {stepBreakdown.map((entry) => (
              <View key={entry.type} style={styles.breakdownRow}>
                <Text style={styles.breakdownType}>{entry.type}</Text>
                <Text style={styles.breakdownCount}>{entry.count}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Downloaded date */}
        {downloadedDate ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Downloaded</Text>
            <Text style={styles.metaText}>{downloadedDate}</Text>
          </View>
        ) : null}

        {/* Package filename */}
        {workflow.package_file_name ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Package</Text>
            <Text style={styles.metaText}>{workflow.package_file_name}</Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Start Execution button */}
      <View style={styles.buttonContainer}>
        <Pressable
          style={({ pressed }) => [
            styles.startButton,
            pressed && styles.startButtonPressed,
            isStarting && styles.startButtonDisabled,
          ]}
          onPress={handleStartExecution}
          disabled={isStarting}
        >
          {isStarting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.startButtonText}>Start Execution</Text>
          )}
        </Pressable>
      </View>
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
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  workflowName: {
    ...typography.heading,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  versionBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 4,
  },
  versionText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
  },
  stepCountText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.subheading,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  descriptionText: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  breakdownType: {
    ...typography.body,
    color: colors.textPrimary,
  },
  breakdownCount: {
    ...typography.body,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  metaText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  emptyText: {
    ...typography.subheading,
    color: colors.textSecondary,
  },
  buttonContainer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  startButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: spacing.base,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  startButtonPressed: {
    opacity: 0.8,
  },
  startButtonDisabled: {
    opacity: 0.6,
  },
  startButtonText: {
    ...typography.subheading,
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
