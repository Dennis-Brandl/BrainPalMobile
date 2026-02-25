// StateBadge: color-coded pill badge displaying ISA-88 workflow or step state.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, typography, spacing } from '@brainpal/ui';
import type { WorkflowState, StepState } from '@brainpal/engine';

type BadgeState = WorkflowState | StepState;

interface StateBadgeProps {
  state: BadgeState;
  size?: 'small' | 'default';
}

// ---------------------------------------------------------------------------
// Color mapping
// ---------------------------------------------------------------------------

interface BadgeColors {
  backgroundColor: string;
  textColor: string;
}

function getBadgeColors(state: BadgeState): BadgeColors {
  switch (state) {
    // Active / running states -- blue
    case 'RUNNING':
    case 'EXECUTING':
    case 'STARTING':
    case 'COMPLETING':
      return { backgroundColor: colors.primary, textColor: '#FFFFFF' };

    // Paused / held states -- amber
    case 'PAUSED':
    case 'PAUSING':
    case 'UNPAUSING':
    case 'HELD':
    case 'HOLDING':
    case 'UNHOLDING':
      return { backgroundColor: colors.warning, textColor: colors.textPrimary };

    // Completed -- green
    case 'COMPLETED':
      return { backgroundColor: colors.success, textColor: '#FFFFFF' };

    // Aborted -- red
    case 'ABORTED':
    case 'ABORTING':
      return { backgroundColor: colors.error, textColor: '#FFFFFF' };

    // Stopped -- gray
    case 'STOPPED':
    case 'STOPPING':
      return { backgroundColor: colors.textSecondary, textColor: '#FFFFFF' };

    // Idle / waiting -- light gray
    case 'IDLE':
    case 'WAITING':
      return { backgroundColor: colors.border, textColor: colors.textPrimary };

    // All other states -- default gray
    default:
      return { backgroundColor: colors.border, textColor: colors.textSecondary };
  }
}

// ---------------------------------------------------------------------------
// Format state name for readability
// ---------------------------------------------------------------------------

function formatStateName(state: string): string {
  return state
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StateBadge({ state, size = 'default' }: StateBadgeProps) {
  const { backgroundColor, textColor } = getBadgeColors(state);
  const isSmall = size === 'small';

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor },
        isSmall && styles.badgeSmall,
      ]}
    >
      <Text
        style={[
          isSmall ? styles.textSmall : styles.textDefault,
          { color: textColor },
        ]}
        numberOfLines={1}
      >
        {formatStateName(state)}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  badge: {
    borderRadius: 12,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    alignSelf: 'flex-start',
  },
  badgeSmall: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  textDefault: {
    ...typography.body,
    fontWeight: '600',
  },
  textSmall: {
    ...typography.caption,
    fontWeight: '600',
  },
});
