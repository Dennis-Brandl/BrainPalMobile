// WorkflowCard: Reusable workflow row components for Active and Library lists.

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, typography, spacing } from '@brainpal/ui';
import { StateBadge } from './StateBadge';
import type { RuntimeWorkflowSummary, MasterWorkflow } from '../../stores/workflow-store';
import { useExecutionStore } from '../../stores/execution-store';

// ---------------------------------------------------------------------------
// Relative time helper
// ---------------------------------------------------------------------------

function getRelativeTime(dateStr: string | null): string {
  if (!dateStr) return '';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  if (diffMs < 0) return 'just now';

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// ActiveWorkflowCard
// ---------------------------------------------------------------------------

interface ActiveWorkflowCardProps {
  workflow: RuntimeWorkflowSummary;
  onPress: () => void;
}

export function ActiveWorkflowCard({ workflow, onPress }: ActiveWorkflowCardProps) {
  // Get active workflow state from execution store for step progress
  const activeWf = useExecutionStore(
    (state) => state.activeWorkflows[workflow.instanceId],
  );

  const activeStepCount = activeWf?.activeStepInstanceIds.length ?? 0;
  const totalSteps = activeWf?.totalSteps ?? 0;
  const currentStepIndex = activeWf?.currentStepIndex ?? 0;

  // Determine time display: prefer lastActivityAt, fall back to startedAt
  const timeStr = getRelativeTime(workflow.lastActivityAt ?? workflow.startedAt);

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      {/* Row 1: Name + State Badge */}
      <View style={styles.row}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {workflow.name}
        </Text>
        <StateBadge state={workflow.workflowState} size="small" />
      </View>

      {/* Row 2: Current step info + step progress */}
      <View style={styles.row}>
        <Text style={styles.stepInfo} numberOfLines={1}>
          {activeStepCount > 0
            ? `${activeStepCount} active step${activeStepCount > 1 ? 's' : ''}`
            : 'Waiting...'}
        </Text>
        {totalSteps > 0 && (
          <Text style={styles.stepProgress}>
            Step {currentStepIndex + 1}/{totalSteps}
          </Text>
        )}
      </View>

      {/* Row 3: Relative time */}
      {timeStr !== '' && (
        <Text style={styles.timeText}>{timeStr}</Text>
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// LibraryWorkflowCard
// ---------------------------------------------------------------------------

interface LibraryWorkflowCardProps {
  workflow: MasterWorkflow;
  onPress: () => void;
}

export function LibraryWorkflowCard({ workflow, onPress }: LibraryWorkflowCardProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      {/* Row 1: Name + Version badge */}
      <View style={styles.row}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {workflow.local_id}
        </Text>
        <View style={styles.versionBadge}>
          <Text style={styles.versionText}>v{workflow.version}</Text>
        </View>
      </View>

      {/* Description (truncated to 2 lines) */}
      {workflow.description ? (
        <Text style={styles.description} numberOfLines={2}>
          {workflow.description}
        </Text>
      ) : null}

      {/* Step count */}
      <Text style={styles.metaText}>
        {workflow.stepCount} step{workflow.stepCount !== 1 ? 's' : ''}
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
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
  row: {
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
  stepInfo: {
    ...typography.body,
    color: colors.textSecondary,
    flex: 1,
  },
  stepProgress: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  timeText: {
    ...typography.caption,
    color: colors.textSecondary,
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
  description: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  metaText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
