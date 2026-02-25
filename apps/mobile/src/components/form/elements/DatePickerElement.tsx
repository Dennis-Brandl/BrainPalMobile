// DatePickerElement: Date input field.
// For v1, renders a text input with date formatting hint (YYYY-MM-DD).
// Full native date picker integration deferred to a later version.

import React from 'react';
import { TextInput, Text, View, StyleSheet } from 'react-native';
import { colors } from '@brainpal/ui/src/theme/colors';
import { typography } from '@brainpal/ui/src/theme/typography';
import { spacing } from '@brainpal/ui/src/theme/spacing';
import type { ElementProps } from './types';

export function DatePickerElement({ element, value, onChange }: ElementProps) {
  const placeholder = element.content?.plainText ?? 'YYYY-MM-DD';

  return (
    <View style={styles.container}>
      <View style={styles.inputRow}>
        <Text style={styles.icon}>{'\uD83D\uDCC5'}</Text>
        <TextInput
          style={styles.input}
          value={value ?? ''}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.textSecondary}
          keyboardType="numbers-and-punctuation"
        />
      </View>
      <Text style={styles.hint}>Format: YYYY-MM-DD</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  inputRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    paddingHorizontal: spacing.sm,
  },
  icon: {
    fontSize: 16,
    marginRight: spacing.xs,
  },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
    paddingVertical: spacing.xs,
  },
  hint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
