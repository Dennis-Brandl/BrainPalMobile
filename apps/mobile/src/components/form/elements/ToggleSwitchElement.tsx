// ToggleSwitchElement: Toggle switch with label. Stores "true"/"false" in formData.

import React from 'react';
import { Switch, Text, View, StyleSheet } from 'react-native';
import { colors } from '@brainpal/ui/src/theme/colors';
import { typography } from '@brainpal/ui/src/theme/typography';
import { spacing } from '@brainpal/ui/src/theme/spacing';
import type { ElementProps } from './types';

export function ToggleSwitchElement({ element, value, onChange }: ElementProps) {
  const isOn = value === 'true';
  const label = element.content?.plainText ?? '';

  const handleToggle = (newValue: boolean) => {
    onChange?.(newValue ? 'true' : 'false');
  };

  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Switch
        value={isOn}
        onValueChange={handleToggle}
        trackColor={{ false: colors.border, true: colors.primaryLight }}
        thumbColor={isOn ? colors.primary : colors.surface}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
    marginRight: spacing.sm,
  },
});
