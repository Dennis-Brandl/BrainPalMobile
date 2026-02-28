// RadioButtonElement: Radio button group where only one option can be selected.
// Options come from element.options array.

import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { colors } from '@brainpal/ui/src/theme/colors';
import { typography } from '@brainpal/ui/src/theme/typography';
import { spacing } from '@brainpal/ui/src/theme/spacing';
import type { ElementProps } from './types';

function normalizeOption(option: unknown): { label: string; value: string } {
  if (typeof option === 'string') return { label: option, value: option };
  const obj = option as { label?: string; value?: string };
  return { label: obj.label ?? '', value: obj.value ?? '' };
}

export function RadioButtonElement({ element, value, onChange }: ElementProps) {
  const rawOptions = element.options ?? [];
  const options = rawOptions.map(normalizeOption);
  const groupLabel = element.label;

  if (options.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.noOptions}>No radio options</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {groupLabel != null && groupLabel !== '' && (
        <Text style={styles.groupLabel}>{groupLabel}</Text>
      )}
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
            <Text style={styles.optionLabel}>{option.label}</Text>
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
  groupLabel: {
    ...typography.caption,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  optionLabel: {
    ...typography.body,
    color: colors.textPrimary,
    marginLeft: spacing.sm,
  },
  noOptions: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
