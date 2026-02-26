// FormCanvas: Scaled WYSIWYG canvas container.
// Renders form elements at absolute positions within a uniformly scaled canvas.

import React, { useCallback } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { FormLayoutEntry } from '@brainpal/engine';
import { useCanvasScale } from '../../hooks/useCanvasScale';
import { FormElementRenderer } from './FormElementRenderer';
import { colors } from '@brainpal/ui/src/theme/colors';

export interface FormCanvasProps {
  /** Form layout from step's form_layout_config */
  layout: FormLayoutEntry;
  /** Current form field values */
  formData: Record<string, string>;
  /** Handler for form input changes */
  onFormDataChange: (key: string, value: string) => void;
  /** Button press handler for step completion */
  onButtonPress?: (outputValue: string) => void;
  /** Image map: filename -> base64 data URI */
  images?: Map<string, string>;
}

export function FormCanvas({
  layout,
  formData,
  onFormDataChange,
  onButtonPress,
  images,
}: FormCanvasProps) {
  const { scale, scaledWidth, scaledHeight } = useCanvasScale(
    layout.canvasWidth,
    layout.canvasHeight,
  );

  const handleFormDataChange = useCallback(
    (key: string, value: string) => {
      onFormDataChange(key, value);
    },
    [onFormDataChange],
  );

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator
      bounces={false}
    >
      <View
        style={[
          styles.canvasWrapper,
          { width: scaledWidth, height: scaledHeight },
        ]}
      >
        <View
          style={[
            {
              width: layout.canvasWidth,
              height: layout.canvasHeight,
              transform: [{ scale }],
              transformOrigin: 'left top',
            },
          ]}
        >
          <View style={styles.canvasBackground}>
            {layout.elements.map((element, index) => (
              <View
                key={`${element.type}-${element.x}-${element.y}-${index}`}
                style={{
                  position: 'absolute',
                  left: element.x,
                  top: element.y,
                  width: element.width,
                  height: element.height,
                }}
              >
                <FormElementRenderer
                  element={element}
                  formData={formData}
                  onFormDataChange={handleFormDataChange}
                  images={images}
                  onButtonPress={onButtonPress}
                />
              </View>
            ))}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  canvasWrapper: {
    overflow: 'hidden',
    alignSelf: 'center',
  },
  canvasBackground: {
    flex: 1,
    backgroundColor: colors.surface,
  },
});
