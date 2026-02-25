// ExecutionHeader: Top bar of the execution screen showing workflow name,
// step progress, state badge, and a slot for the state controls overflow menu.

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { WorkflowState } from '@brainpal/engine';
import { colors } from '@brainpal/ui/src/theme/colors';
import { typography } from '@brainpal/ui/src/theme/typography';
import { spacing } from '@brainpal/ui/src/theme/spacing';
import { StateBadge } from '../workflow/StateBadge';

export interface ExecutionHeaderProps {
  workflowName: string;
  workflowState: WorkflowState;
  /** e.g., "Step 3 of 12" */
  stepInfo: string;
  onBack: () => void;
  /** Rendered as the right-side overflow menu trigger */
  stateControlsSlot: React.ReactNode;
}

export function ExecutionHeader({
  workflowName,
  workflowState,
  stepInfo,
  onBack,
  stateControlsSlot,
}: ExecutionHeaderProps) {
  return (
    <View style={styles.container}>
      {/* Left: back button */}
      <Pressable style={styles.backButton} onPress={onBack} hitSlop={8}>
        <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
      </Pressable>

      {/* Center: workflow name + step info */}
      <View style={styles.center}>
        <Text style={styles.workflowName} numberOfLines={1}>
          {workflowName}
        </Text>
        <View style={styles.stepInfoRow}>
          <StateBadge state={workflowState} size="small" />
          <Text style={styles.stepInfo} numberOfLines={1}>
            {stepInfo}
          </Text>
        </View>
      </View>

      {/* Right: state controls slot */}
      <View style={styles.rightSlot}>
        {stateControlsSlot}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    minHeight: 56,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    marginHorizontal: spacing.xs,
  },
  workflowName: {
    ...typography.subheading,
    color: colors.textPrimary,
  },
  stepInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: spacing.xs,
  },
  stepInfo: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  rightSlot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
