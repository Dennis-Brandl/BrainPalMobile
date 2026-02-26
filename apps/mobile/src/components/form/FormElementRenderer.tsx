// FormElementRenderer: Dispatcher that maps FormElementSpec.type to the
// appropriate element renderer component. Unknown types render a safe fallback.

import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import type { FormElementSpec } from '@brainpal/engine';
import { colors } from '@brainpal/ui/src/theme/colors';
import { typography } from '@brainpal/ui/src/theme/typography';
import { spacing } from '@brainpal/ui/src/theme/spacing';

import { TextElement } from './elements/TextElement';
import { HeaderElement } from './elements/HeaderElement';
import { InputElement } from './elements/InputElement';
import { ImageElement } from './elements/ImageElement';
import { CheckboxElement } from './elements/CheckboxElement';
import { ButtonElement } from './elements/ButtonElement';
import { SelectElement } from './elements/SelectElement';
import { DatePickerElement } from './elements/DatePickerElement';
import { TextAreaElement } from './elements/TextAreaElement';
import { NumericInputElement } from './elements/NumericInputElement';
import { ToggleSwitchElement } from './elements/ToggleSwitchElement';
import { RadioButtonElement } from './elements/RadioButtonElement';
import type { ElementProps } from './elements/types';

export interface FormElementRendererProps {
  element: FormElementSpec;
  formData: Record<string, string>;
  onFormDataChange: (key: string, value: string) => void;
  images?: Map<string, string>;
  /** Button press handler for step completion */
  onButtonPress?: (outputValue: string) => void;
}

/**
 * Renders a fallback placeholder for unsupported element types.
 * Never crashes -- this is the safety net for unknown types.
 */
function FallbackElement({ element }: { element: FormElementSpec }) {
  return (
    <View style={fallbackStyles.container}>
      <Text style={fallbackStyles.text}>Unsupported: {element.type}</Text>
    </View>
  );
}

const fallbackStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.textSecondary,
    borderStyle: 'dashed',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xs,
  },
  text: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});

/**
 * FormElementRenderer dispatches to the correct element component
 * based on the element's type field. Comparison is case-insensitive.
 */
export function FormElementRenderer({
  element,
  formData,
  onFormDataChange,
  images,
  onButtonPress,
}: FormElementRendererProps) {
  // Derive form field key: prefer fieldName (real packages) over content.plainText
  const fieldKey = element.fieldName ?? element.content?.plainText ?? '';
  const value = formData[fieldKey];
  const onChange = (newValue: string) => onFormDataChange(fieldKey, newValue);

  const elementProps: ElementProps = {
    element,
    value,
    onChange,
    images,
    onButtonPress,
  };

  const type = element.type.toLowerCase();

  switch (type) {
    case 'text':
      return <TextElement {...elementProps} />;

    case 'header':
      return <HeaderElement {...elementProps} />;

    case 'input':
    case 'textinput':
      return <InputElement {...elementProps} />;

    case 'image':
      return <ImageElement {...elementProps} />;

    case 'video':
      // Video not supported in v1 -- render fallback
      return <FallbackElement element={element} />;

    case 'checkbox':
      return <CheckboxElement {...elementProps} />;

    case 'button':
      return <ButtonElement {...elementProps} />;

    case 'select':
    case 'dropdown':
      return <SelectElement {...elementProps} />;

    case 'date':
    case 'datepicker':
      return <DatePickerElement {...elementProps} />;

    case 'textarea':
      return <TextAreaElement {...elementProps} />;

    case 'number':
    case 'numeric':
      return <NumericInputElement {...elementProps} />;

    case 'toggle':
    case 'switch':
      return <ToggleSwitchElement {...elementProps} />;

    case 'radio':
    case 'radiobutton':
      return <RadioButtonElement {...elementProps} />;

    default:
      return <FallbackElement element={element} />;
  }
}
