// DotIndicator: Shows active step count and current position as dots.
// When count exceeds 7, displays "X / N" text instead.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@brainpal/ui/src/theme/colors';
import { typography } from '@brainpal/ui/src/theme/typography';
import { spacing } from '@brainpal/ui/src/theme/spacing';

export interface DotIndicatorProps {
  count: number;
  activeIndex: number;
}

const DOT_THRESHOLD = 7;
const ACTIVE_DOT_SIZE = 10;
const INACTIVE_DOT_SIZE = 8;

export function DotIndicator({ count, activeIndex }: DotIndicatorProps) {
  if (count <= 1) return null;

  // When too many dots, show text indicator
  if (count > DOT_THRESHOLD) {
    return (
      <View style={styles.container}>
        <Text style={styles.textIndicator}>
          {activeIndex + 1} / {count}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {Array.from({ length: count }, (_, i) => {
        const isActive = i === activeIndex;
        return (
          <View
            key={i}
            style={[
              styles.dot,
              isActive ? styles.dotActive : styles.dotInactive,
              {
                width: isActive ? ACTIVE_DOT_SIZE : INACTIVE_DOT_SIZE,
                height: isActive ? ACTIVE_DOT_SIZE : INACTIVE_DOT_SIZE,
                borderRadius: isActive ? ACTIVE_DOT_SIZE / 2 : INACTIVE_DOT_SIZE / 2,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  dot: {
    // Base styles (dimensions and borderRadius set dynamically)
  },
  dotActive: {
    backgroundColor: colors.primary,
  },
  dotInactive: {
    backgroundColor: colors.border,
  },
  textIndicator: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
});
