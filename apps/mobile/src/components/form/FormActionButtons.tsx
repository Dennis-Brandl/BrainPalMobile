// FormActionButtons: Stub -- full implementation in Task 2.

import React from 'react';
import { Text, Pressable, View } from 'react-native';
import type { YesNoConfig } from '@brainpal/engine';

export interface FormActionButtonsProps {
  stepType: 'USER_INTERACTION' | 'YES_NO';
  yesNoConfig?: YesNoConfig;
  onSubmit: (outputValue?: string) => void;
  disabled?: boolean;
}

export function FormActionButtons({ stepType, onSubmit }: FormActionButtonsProps) {
  return (
    <View>
      <Pressable onPress={() => onSubmit()}>
        <Text>{stepType === 'YES_NO' ? 'Yes' : 'Done'}</Text>
      </Pressable>
    </View>
  );
}
