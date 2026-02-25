// WaitingStateBox: Centered message shown when no user interaction steps
// are active. Displays contextual message based on workflow state.

import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { WorkflowState } from '@brainpal/engine';
import { colors } from '@brainpal/ui/src/theme/colors';
import { typography } from '@brainpal/ui/src/theme/typography';
import { spacing } from '@brainpal/ui/src/theme/spacing';

export interface WaitingStateBoxProps {
  workflowState: WorkflowState;
  message?: string;
}

function getDefaultMessage(state: WorkflowState): string {
  switch (state) {
    case 'RUNNING':
      return 'Processing...';
    case 'PAUSED':
      return 'Workflow Paused';
    case 'STOPPED':
      return 'Workflow Stopped';
    case 'COMPLETED':
      return 'Workflow Completed';
    case 'ABORTED':
      return 'Workflow Aborted';
    case 'IDLE':
    default:
      return 'Waiting...';
  }
}

function getIcon(
  state: WorkflowState,
): { name: keyof typeof Ionicons.glyphMap; color: string } | null {
  switch (state) {
    case 'RUNNING':
      return null; // Use ActivityIndicator instead
    case 'PAUSED':
      return { name: 'pause-circle-outline', color: colors.warning };
    case 'STOPPED':
      return { name: 'stop-circle-outline', color: colors.textSecondary };
    case 'COMPLETED':
      return { name: 'checkmark-circle-outline', color: colors.success };
    case 'ABORTED':
      return { name: 'close-circle-outline', color: colors.error };
    default:
      return { name: 'time-outline', color: colors.textSecondary };
  }
}

export function WaitingStateBox({ workflowState, message }: WaitingStateBoxProps) {
  const displayMessage = message ?? getDefaultMessage(workflowState);
  const icon = getIcon(workflowState);

  return (
    <View style={styles.container}>
      <View style={styles.box}>
        {icon ? (
          <Ionicons name={icon.name} size={48} color={icon.color} />
        ) : (
          <ActivityIndicator size="large" color={colors.primary} />
        )}
        <Text style={styles.message}>{displayMessage}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  box: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 200,
  },
  message: {
    ...typography.subheading,
    color: colors.textSecondary,
    marginTop: spacing.md,
    textAlign: 'center',
  },
});
