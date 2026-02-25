// FormCanvas: Scaled WYSIWYG canvas container with pinch-to-zoom.
// Renders form elements at absolute positions within a uniformly scaled canvas.

import React, { useCallback } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
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
  /** Optional slot for rendering action buttons below the canvas */
  renderActionButtons?: () => React.ReactNode;
  /** Image map: filename -> base64 data URI */
  images?: Map<string, string>;
}

const MIN_SCALE_FACTOR = 0.5; // Minimum zoom = half computed scale
const MAX_SCALE = 2.0;        // Maximum zoom = 2x

export function FormCanvas({
  layout,
  formData,
  onFormDataChange,
  renderActionButtons,
  images,
}: FormCanvasProps) {
  const { scale: computedScale, scaledWidth, scaledHeight } = useCanvasScale(
    layout.canvasWidth,
    layout.canvasHeight,
  );

  // Pinch-to-zoom shared values
  const currentScale = useSharedValue(computedScale);
  const savedScale = useSharedValue(computedScale);

  const minScale = computedScale * MIN_SCALE_FACTOR;

  const pinchGesture = Gesture.Pinch()
    .onUpdate((event) => {
      'worklet';
      const newScale = savedScale.value * event.scale;
      // Clamp between min and max
      currentScale.value = Math.min(Math.max(newScale, minScale), MAX_SCALE);
    })
    .onEnd(() => {
      'worklet';
      savedScale.value = currentScale.value;
    });

  const animatedCanvasStyle = useAnimatedStyle(() => ({
    transform: [{ scale: currentScale.value }],
  }));

  // Compute the wrapper dimensions based on animated scale
  // We use the static computed dimensions for the outer wrapper since
  // the animated scale handles the visual transform
  const animatedWrapperStyle = useAnimatedStyle(() => {
    const ratio = currentScale.value / computedScale;
    return {
      width: scaledWidth * ratio,
      height: scaledHeight * ratio,
    };
  });

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
      <GestureDetector gesture={pinchGesture}>
        <Animated.View style={[styles.canvasWrapper, animatedWrapperStyle]}>
          <Animated.View
            style={[
              {
                width: layout.canvasWidth,
                height: layout.canvasHeight,
                transformOrigin: 'left top',
              },
              animatedCanvasStyle,
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
                  />
                </View>
              ))}
            </View>
          </Animated.View>
        </Animated.View>
      </GestureDetector>

      {renderActionButtons?.()}
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
