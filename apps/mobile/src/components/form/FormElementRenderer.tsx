// FormElementRenderer: Stub -- full implementation in Task 2.
// This placeholder ensures FormCanvas compiles in Task 1.

import React from 'react';
import { Text, View } from 'react-native';
import type { FormElementSpec } from '@brainpal/engine';

export interface FormElementRendererProps {
  element: FormElementSpec;
  formData: Record<string, string>;
  onFormDataChange: (key: string, value: string) => void;
  images?: Map<string, string>;
}

export function FormElementRenderer({ element }: FormElementRendererProps) {
  return (
    <View style={{ flex: 1 }}>
      <Text>{element.content?.plainText ?? `[${element.type}]`}</Text>
    </View>
  );
}
