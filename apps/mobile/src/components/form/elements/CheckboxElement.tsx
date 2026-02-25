// CheckboxElement: Pressable checkbox with label, toggles true/false string values.

import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { colors } from '@brainpal/ui/src/theme/colors';
import { typography } from '@brainpal/ui/src/theme/typography';
import { spacing } from '@brainpal/ui/src/theme/spacing';
import type { ElementProps } from './types';

export function CheckboxElement({ element, value, onChange }: ElementProps) {
  const isChecked = value === 'true';
  const label = element.content?.plainText ?? '';

  const handlePress = () => {
    onChange?.(isChecked ? 'false' : 'true');
  };

  return (
    <Pressable style={styles.container} onPress={handlePress}>
      <View style={[styles.checkbox, isChecked && styles.checkboxChecked]}>
        {isChecked && <Text style={styles.checkmark}>{'✓'}</Text>}
      </View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkmark: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: '700',
  },
  label: {
    ...typography.body,
    color: colors.textPrimary,
    marginLeft: spacing.sm,
    flex: 1,
  },
});
