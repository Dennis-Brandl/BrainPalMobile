// StepCarousel: FlatList-based horizontal carousel for navigating active
// user interaction steps. Each page renders a FormCanvas + FormActionButtons.
// Supports wrap-around navigation via Previous/Next buttons.

import React, { useCallback, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
  type ViewabilityConfig,
  type ViewToken,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@brainpal/ui/src/theme/colors';
import { typography } from '@brainpal/ui/src/theme/typography';
import { spacing } from '@brainpal/ui/src/theme/spacing';
import type { ActiveStep } from '../../hooks/useActiveSteps';
import { FormCanvas } from '../form/FormCanvas';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StepCarouselProps {
  steps: ActiveStep[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
  onStepComplete: (stepInstanceId: string, formData: Record<string, string>, outputValue?: string) => void;
  images: Map<string, string>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCREEN_WIDTH = Dimensions.get('window').width;

const VIEWABILITY_CONFIG: ViewabilityConfig = {
  viewAreaCoveragePercentThreshold: 50,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StepCarousel({
  steps,
  currentIndex,
  onIndexChange,
  onStepComplete,
  images,
}: StepCarouselProps) {
  const flatListRef = useRef<FlatList<ActiveStep>>(null);

  // Form data map: stepInstanceId -> Record<string, string>
  const [formDataMap, setFormDataMap] = useState<Record<string, Record<string, string>>>({});

  // Track submitting steps to disable buttons
  const [submittingSteps, setSubmittingSteps] = useState<Set<string>>(new Set());

  // -----------------------------------------------------------------------
  // Form data handlers
  // -----------------------------------------------------------------------

  const handleFormDataChange = useCallback(
    (stepInstanceId: string, key: string, value: string) => {
      setFormDataMap((prev) => ({
        ...prev,
        [stepInstanceId]: {
          ...(prev[stepInstanceId] ?? {}),
          [key]: value,
        },
      }));
    },
    [],
  );

  // -----------------------------------------------------------------------
  // Step completion
  // -----------------------------------------------------------------------

  const handleSubmit = useCallback(
    (stepInstanceId: string, outputValue?: string) => {
      setSubmittingSteps((prev) => new Set(prev).add(stepInstanceId));
      const stepFormData = formDataMap[stepInstanceId] ?? {};
      onStepComplete(stepInstanceId, stepFormData, outputValue);
    },
    [onStepComplete, formDataMap],
  );

  // -----------------------------------------------------------------------
  // Navigation
  // -----------------------------------------------------------------------

  const goToNext = useCallback(() => {
    if (steps.length <= 1) return;
    const nextIndex = (currentIndex + 1) % steps.length;
    flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
    onIndexChange(nextIndex);
  }, [currentIndex, steps.length, onIndexChange]);

  const goToPrevious = useCallback(() => {
    if (steps.length <= 1) return;
    const prevIndex = (currentIndex - 1 + steps.length) % steps.length;
    flatListRef.current?.scrollToIndex({ index: prevIndex, animated: true });
    onIndexChange(prevIndex);
  }, [currentIndex, steps.length, onIndexChange]);

  // Track visible items for index sync
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        onIndexChange(viewableItems[0].index);
      }
    },
  );

  // -----------------------------------------------------------------------
  // Render item
  // -----------------------------------------------------------------------

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<ActiveStep>) => {
      const stepFormData = formDataMap[item.stepInstanceId] ?? {};
      const isSubmitting = submittingSteps.has(item.stepInstanceId);

      return (
        <View style={{ width: SCREEN_WIDTH }}>
          {/* Step title */}
          <View style={styles.stepHeader}>
            <Text style={styles.stepTitle} numberOfLines={1}>
              {item.stepSpec.local_id}
            </Text>
          </View>

          {/* Form canvas with embedded buttons for step completion */}
          {item.formLayout ? (
            <FormCanvas
              layout={item.formLayout}
              formData={stepFormData}
              onFormDataChange={(key, value) =>
                handleFormDataChange(item.stepInstanceId, key, value)
              }
              images={images}
              onButtonPress={isSubmitting ? undefined : (outputValue) =>
                handleSubmit(item.stepInstanceId, outputValue)
              }
            />
          ) : (
            <View style={styles.noFormContainer}>
              <Text style={styles.noFormText}>No form layout available</Text>
            </View>
          )}
        </View>
      );
    },
    [formDataMap, submittingSteps, images, handleFormDataChange, handleSubmit],
  );

  const keyExtractor = useCallback(
    (item: ActiveStep) => item.stepInstanceId,
    [],
  );

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: SCREEN_WIDTH,
      offset: SCREEN_WIDTH * index,
      index,
    }),
    [],
  );

  // -----------------------------------------------------------------------
  // Scroll end handler (for swipe-based navigation)
  // -----------------------------------------------------------------------

  const onMomentumScrollEnd = useCallback(
    (e: { nativeEvent: { contentOffset: { x: number } } }) => {
      const newIndex = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
      if (newIndex >= 0 && newIndex < steps.length) {
        onIndexChange(newIndex);
      }
    },
    [steps.length, onIndexChange],
  );

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  const showNavButtons = steps.length > 1;

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={steps}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        getItemLayout={getItemLayout}
        onMomentumScrollEnd={onMomentumScrollEnd}
        viewabilityConfig={VIEWABILITY_CONFIG}
        onViewableItemsChanged={onViewableItemsChanged.current}
        initialScrollIndex={currentIndex < steps.length ? currentIndex : 0}
        removeClippedSubviews={false}
      />

      {/* Previous / Next navigation buttons */}
      {showNavButtons && (
        <>
          <Pressable
            style={[styles.navButton, styles.navButtonLeft]}
            onPress={goToPrevious}
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={20} color={colors.primary} />
          </Pressable>
          <Pressable
            style={[styles.navButton, styles.navButtonRight]}
            onPress={goToNext}
            hitSlop={8}
          >
            <Ionicons name="chevron-forward" size={20} color={colors.primary} />
          </Pressable>
        </>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
  },
  stepHeader: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  stepTitle: {
    ...typography.subheading,
    color: colors.textPrimary,
  },
  noFormContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  noFormText: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  navButton: {
    position: 'absolute',
    top: '50%',
    marginTop: -20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
  },
  navButtonLeft: {
    left: spacing.xs,
  },
  navButtonRight: {
    right: spacing.xs,
  },
});
