// FormActionButtons: Step completion buttons rendered below the form canvas.
// USER_INTERACTION: single "Complete" button.
// YES_NO: two side-by-side buttons with custom labels from YesNoConfig.

import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import type { YesNoConfig } from '@brainpal/engine';
import { colors } from '@brainpal/ui/src/theme/colors';
import { typography } from '@brainpal/ui/src/theme/typography';
import { spacing } from '@brainpal/ui/src/theme/spacing';

export interface FormActionButtonsProps {
  /** Step type determines button count and behavior */
  stepType: 'USER_INTERACTION' | 'YES_NO';
  /** Yes/No configuration with custom labels and values */
  yesNoConfig?: YesNoConfig;
  /** Called when user presses a button. outputValue is the yes/no value or undefined. */
  onSubmit: (outputValue?: string) => void;
  /** Disable all buttons (e.g., during submission) */
  disabled?: boolean;
}

export function FormActionButtons({
  stepType,
  yesNoConfig,
  onSubmit,
  disabled = false,
}: FormActionButtonsProps) {
  if (stepType === 'YES_NO') {
    const yesLabel = yesNoConfig?.yes_label ?? 'Yes';
    const noLabel = yesNoConfig?.no_label ?? 'No';
    const yesValue = yesNoConfig?.yes_value ?? 'true';
    const noValue = yesNoConfig?.no_value ?? 'false';

    return (
      <View style={styles.container}>
        <Pressable
          style={[styles.button, styles.yesButton, disabled && styles.buttonDisabled]}
          onPress={() => onSubmit(yesValue)}
          disabled={disabled}
        >
          <Text style={[styles.buttonText, styles.yesButtonText]}>{yesLabel}</Text>
        </Pressable>
        <View style={styles.buttonGap} />
        <Pressable
          style={[styles.button, styles.noButton, disabled && styles.buttonDisabled]}
          onPress={() => onSubmit(noValue)}
          disabled={disabled}
        >
          <Text style={[styles.buttonText, styles.noButtonText]}>{noLabel}</Text>
        </Pressable>
      </View>
    );
  }

  // USER_INTERACTION: single submit button
  return (
    <View style={styles.container}>
      <Pressable
        style={[styles.button, styles.submitButton, disabled && styles.buttonDisabled]}
        onPress={() => onSubmit()}
        disabled={disabled}
      >
        <Text style={[styles.buttonText, styles.submitButtonText]}>Complete</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  button: {
    flex: 1,
    minHeight: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonGap: {
    width: spacing.md,
  },
  buttonText: {
    ...typography.subheading,
  },
  // USER_INTERACTION submit
  submitButton: {
    backgroundColor: colors.primary,
  },
  submitButtonText: {
    color: colors.surface,
  },
  // YES_NO buttons
  yesButton: {
    backgroundColor: colors.primary,
  },
  yesButtonText: {
    color: colors.surface,
  },
  noButton: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  noButtonText: {
    color: colors.primary,
  },
});
