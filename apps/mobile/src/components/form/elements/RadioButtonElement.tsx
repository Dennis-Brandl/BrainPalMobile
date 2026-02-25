// RadioButtonElement: Radio button group where only one option can be selected.
// Options come from element.options array.

import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { colors } from '@brainpal/ui/src/theme/colors';
import { typography } from '@brainpal/ui/src/theme/typography';
import { spacing } from '@brainpal/ui/src/theme/spacing';
import type { ElementProps } from './types';

export function RadioButtonElement({ element, value, onChange }: ElementProps) {
  const options = element.options ?? [];

  if (options.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.noOptions}>No radio options</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {options.map((option) => {
        const isSelected = value === option.value;
        return (
          <Pressable
            key={option.value}
            style={styles.optionRow}
            onPress={() => onChange?.(option.value)}
          >
            <View style={[styles.radio, isSelected && styles.radioSelected]}>
              {isSelected && <View style={styles.radioInner} />}
            </View>
            <Text style={styles.label}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  radioSelected: {
    borderColor: colors.primary,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  label: {
    ...typography.body,
    color: colors.textPrimary,
    marginLeft: spacing.sm,
  },
  noOptions: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
