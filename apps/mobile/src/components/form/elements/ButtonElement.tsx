// ButtonElement: Form-embedded button that triggers step completion.
// Calls onButtonPress with the element's outputValue to complete the step.

import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { colors } from '@brainpal/ui/src/theme/colors';
import { typography } from '@brainpal/ui/src/theme/typography';
import { spacing } from '@brainpal/ui/src/theme/spacing';
import type { ElementProps } from './types';

export function ButtonElement({ element, onButtonPress }: ElementProps) {
  const label = element.label ?? element.content?.plainText ?? 'Button';
  const bgColor = element.color ?? colors.primary;

  const handlePress = () => {
    onButtonPress?.(element.outputValue ?? '');
  };

  return (
    <Pressable
      style={[styles.button, { backgroundColor: bgColor }]}
      onPress={handlePress}
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  label: {
    ...typography.subheading,
    color: colors.surface,
  },
});
