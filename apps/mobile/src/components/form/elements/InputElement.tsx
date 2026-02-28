// InputElement: Single-line text input with border styling.

import React from 'react';
import { Text, TextInput, View, StyleSheet } from 'react-native';
import { colors } from '@brainpal/ui/src/theme/colors';
import { typography } from '@brainpal/ui/src/theme/typography';
import { spacing } from '@brainpal/ui/src/theme/spacing';
import type { ElementProps } from './types';

export function InputElement({ element, value, onChange }: ElementProps) {
  const placeholder = element.placeholder ?? element.content?.plainText ?? '';
  const label = element.label;

  return (
    <View style={styles.container}>
      {label != null && label !== '' && (
        <Text style={styles.label}>{label}</Text>
      )}
      <TextInput
        style={[
          styles.input,
          element.fontSize != null && { fontSize: element.fontSize },
          element.color != null && { color: element.color },
        ]}
        value={value ?? ''}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  label: {
    ...typography.caption,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    ...typography.body,
    color: colors.textPrimary,
  },
});
