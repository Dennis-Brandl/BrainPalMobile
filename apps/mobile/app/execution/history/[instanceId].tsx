// History detail screen: Shows step summary cards with toggle to full audit trail.
// Navigated from History tab via router.push('/execution/history/[instanceId]').

import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { colors, typography, spacing } from '@brainpal/ui';
import { StateBadge } from '../../../src/components/workflow/StateBadge';
import {
  useWorkflowHistory,
  type HistoryStep,
  type HistoryLogEntry,
} from '../../../src/hooks/useHistory';
import { useExportPdf, type ReportStep } from '../../../src/hooks/useExportPdf';
import type { StepState, WorkflowState } from '@brainpal/engine';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format step type for display: USER_INTERACTION -> User Interaction */
function formatStepType(stepType: string): string {
  return stepType
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/** Format ISO timestamp to HH:MM:SS.mmm */
function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    const ms = String(d.getMilliseconds()).padStart(3, '0');
    return `${hh}:${mm}:${ss}.${ms}`;
  } catch {
    return iso;
  }
}

/** Color for log event type badges */
function eventTypeColor(eventType: string): string {
  if (eventType.includes('STATE_CHANGED') || eventType.includes('STATE')) {
    return colors.primary;
  }
  if (eventType.includes('PARAMETER') || eventType.includes('RESOLVED')) {
    return colors.success;
  }
  if (eventType.includes('USER_INPUT')) {
    return colors.warning;
  }
  if (eventType.includes('ERROR') || eventType.includes('ABORT')) {
    return colors.error;
  }
  return colors.textSecondary;
}

/** Summarize event data JSON for display */
function summarizeEventData(eventType: string, eventDataJson: string): string {
  try {
    const data = JSON.parse(eventDataJson);

    if (eventType === 'STEP_STATE_CHANGED') {
      return `${data.fromState ?? '?'} -> ${data.toState ?? '?'}`;
    }
    if (eventType === 'PARAMETER_INPUT_RESOLVED' || eventType === 'PARAMETER_OUTPUT_WRITTEN') {
      return `${data.paramName ?? data.propertyName ?? 'param'} = ${data.value ?? '...'}`;
    }
    if (eventType === 'USER_INPUT_SUBMITTED') {
      const keys = Object.keys(data.formData ?? data);
      return keys.length > 0 ? keys.join(', ') : 'submitted';
    }
    if (eventType === 'CONDITION_EVALUATED') {
      return data.matchedConnectionId
        ? `matched: ${data.matchedConnectionId}`
        : 'no match';
    }
    if (eventType === 'ENGINE_ERROR') {
      return data.message ?? 'error';
    }

    // Workflow-level events
    if (eventType.startsWith('WORKFLOW_')) {
      return data.workflowInstanceId
        ? `instance: ${data.workflowInstanceId.slice(0, 8)}...`
        : eventType.replace('WORKFLOW_', '').toLowerCase();
    }

    // Fallback: show keys
    const keys = Object.keys(data);
    return keys.length > 0 ? keys.slice(0, 3).join(', ') : '--';
  } catch {
    return eventDataJson.slice(0, 60);
  }
}

/** Format event type for display badge */
function formatEventType(eventType: string): string {
  return eventType
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');
}

// ---------------------------------------------------------------------------
// Step Summary Card
// ---------------------------------------------------------------------------

function StepCard({ step }: { step: HistoryStep }) {
  return (
    <View style={styles.stepCard}>
      <View style={styles.stepCardLeft}>
        <Text style={styles.stepName} numberOfLines={1}>
          {step.name}
        </Text>
        <Text style={styles.stepType}>{formatStepType(step.stepType)}</Text>
      </View>
      <View style={styles.stepCardRight}>
        <StateBadge state={step.state as StepState} size="small" />
        <Text style={styles.stepDuration}>{step.duration}</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Log Entry Row
// ---------------------------------------------------------------------------

function LogEntryRow({ entry }: { entry: HistoryLogEntry }) {
  const badgeColor = eventTypeColor(entry.eventType);

  return (
    <View style={styles.logRow}>
      <Text style={styles.logTimestamp}>{formatTimestamp(entry.timestamp)}</Text>
      <View style={[styles.logBadge, { backgroundColor: badgeColor }]}>
        <Text style={styles.logBadgeText} numberOfLines={1}>
          {formatEventType(entry.eventType)}
        </Text>
      </View>
      <Text style={styles.logSummary} numberOfLines={2}>
        {summarizeEventData(entry.eventType, entry.eventData)}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// History Detail Screen
// ---------------------------------------------------------------------------

export default function HistoryDetailScreen() {
  const { instanceId } = useLocalSearchParams<{ instanceId: string }>();
  const { steps, logEntries, workflowMeta, loading } = useWorkflowHistory(instanceId ?? '');
  const { exportReport, isExporting } = useExportPdf();
  const [showAudit, setShowAudit] = useState(false);

  // Use workflowMeta for name and state, with fallbacks
  const workflowName = workflowMeta?.workflowName ?? 'Workflow';
  const overallState = (workflowMeta?.state ?? 'COMPLETED') as WorkflowState;

  const handleExportPdf = useCallback(() => {
    if (!workflowMeta || !instanceId) return;

    const reportSteps: ReportStep[] = steps.map((s) => ({
      name: s.name,
      stepType: s.stepType,
      state: s.state,
      duration: s.duration,
      userInputs: s.userInputs,
      resolvedOutputs: s.resolvedOutputs,
      isChildStep: s.isChildStep,
      childWorkflowName: s.childWorkflowName,
    }));

    exportReport({
      workflowName: workflowMeta.workflowName,
      instanceId,
      state: workflowMeta.state,
      startedAt: workflowMeta.startedAt,
      completedAt: workflowMeta.completedAt,
      duration: workflowMeta.duration,
      steps: reportSteps,
    });
  }, [workflowMeta, instanceId, steps, exportReport]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header summary */}
      <View style={styles.header}>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {workflowName}
          </Text>
          <StateBadge state={overallState} size="small" />
        </View>
        <Text style={styles.headerMeta}>
          {steps.length} step{steps.length !== 1 ? 's' : ''}
          {logEntries.length > 0 ? ` | ${logEntries.length} log entries` : ''}
        </Text>
      </View>

      {/* Action bar: Toggle + Export */}
      <View style={styles.actionBar}>
        <Pressable style={styles.toggleButton} onPress={() => setShowAudit(!showAudit)}>
          <Text style={styles.toggleText}>
            {showAudit ? 'Show Summary' : 'Show Details'}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.exportButton, isExporting && styles.exportButtonDisabled]}
          onPress={handleExportPdf}
          disabled={isExporting}
        >
          <FontAwesome name="file-pdf-o" size={14} color="#FFFFFF" />
          <Text style={styles.exportButtonText}>
            {isExporting ? 'Exporting...' : 'Export PDF'}
          </Text>
        </Pressable>
      </View>

      {/* Content */}
      {showAudit ? (
        <FlatList
          contentContainerStyle={styles.listContent}
          data={logEntries}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <LogEntryRow entry={item} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No audit log entries</Text>
            </View>
          }
        />
      ) : (
        <FlatList
          contentContainerStyle={styles.listContent}
          data={steps}
          keyExtractor={(item) => item.instanceId}
          renderItem={({ item }) => <StepCard step={item} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No steps recorded</Text>
            </View>
          }
        />
      )}
    </View>
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
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.base,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  headerTitle: {
    ...typography.subheading,
    color: colors.textPrimary,
    flex: 1,
  },
  headerMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  toggleButton: {
    paddingVertical: spacing.xs,
  },
  toggleText: {
    ...typography.body,
    color: colors.primary,
    fontWeight: '600',
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 6,
  },
  exportButtonDisabled: {
    opacity: 0.5,
  },
  exportButtonText: {
    ...typography.caption,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  listContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  // Step card
  stepCard: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepCardLeft: {
    flex: 1,
    marginRight: spacing.md,
  },
  stepName: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
    marginBottom: 2,
  },
  stepType: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  stepCardRight: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  stepDuration: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  // Log entry
  logRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  logTimestamp: {
    ...typography.caption,
    color: colors.textSecondary,
    fontFamily: undefined,
    fontVariant: ['tabular-nums'],
    minWidth: 90,
  },
  logBadge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    maxWidth: 100,
  },
  logBadgeText: {
    ...typography.caption,
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 10,
  },
  logSummary: {
    ...typography.caption,
    color: colors.textPrimary,
    flex: 1,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
