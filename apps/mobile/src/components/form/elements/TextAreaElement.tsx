// TextAreaElement: Multi-line text input.

import React from 'react';
import { TextInput, View, StyleSheet } from 'react-native';
import { colors } from '@brainpal/ui/src/theme/colors';
import { typography } from '@brainpal/ui/src/theme/typography';
import { spacing } from '@brainpal/ui/src/theme/spacing';
import type { ElementProps } from './types';

export function TextAreaElement({ element, value, onChange }: ElementProps) {
  const placeholder = element.content?.plainText ?? '';

  return (
    <View style={styles.container}>
      <TextInput
        style={[
          styles.textArea,
          element.fontSize != null && { fontSize: element.fontSize },
          element.color != null && { color: element.color },
        ]}
        value={value ?? ''}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        multiline
        numberOfLines={4}
        textAlignVertical="top"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  textArea: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    ...typography.body,
    color: colors.textPrimary,
    minHeight: 80,
  },
});
