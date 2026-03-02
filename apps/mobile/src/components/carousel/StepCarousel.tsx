// StepCarousel: FlatList-based horizontal carousel for navigating active
// user interaction steps. Each page renders a FormCanvas with embedded action buttons.
// Supports wrap-around navigation via Previous/Next buttons.

import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  onResolveParameter?: (nameKey: string) => Promise<string | null>;
  onWriteFormOutputParameters?: (outputs: Array<{ nameKey: string; value: string }>) => Promise<void>;
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
  onResolveParameter,
  onWriteFormOutputParameters,
}: StepCarouselProps) {
  const flatListRef = useRef<FlatList<ActiveStep>>(null);

  // Form data map: stepInstanceId -> Record<string, string>
  const [formDataMap, setFormDataMap] = useState<Record<string, Record<string, string>>>({});

  // Track submitting steps to disable buttons
  const [submittingSteps, setSubmittingSteps] = useState<Set<string>>(new Set());

  // Resolved parameter values for rich text substitution: stepInstanceId -> Record<name.key, value>
  const [resolvedParamsMap, setResolvedParamsMap] = useState<Record<string, Record<string, string>>>({});

  // Track which steps have already had defaults resolved (avoid re-resolving)
  const resolvedDefaultsRef = useRef<Set<string>>(new Set());

  // Track steps blocked by timers (blockDone)
  const [blockedSteps, setBlockedSteps] = useState<Set<string>>(new Set());

  const handleBlockDoneChange = useCallback(
    (stepInstanceId: string, isBlocked: boolean) => {
      setBlockedSteps((prev) => {
        const next = new Set(prev);
        if (isBlocked) {
          next.add(stepInstanceId);
        } else {
          next.delete(stepInstanceId);
        }
        return next;
      });
    },
    [],
  );

  // -----------------------------------------------------------------------
  // Default resolution for new steps
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (!onResolveParameter) return;

    const newSteps = steps.filter(
      (s) => !resolvedDefaultsRef.current.has(s.stepInstanceId),
    );
    if (newSteps.length === 0) return;

    // Mark as being resolved immediately to avoid double-resolving
    for (const s of newSteps) {
      resolvedDefaultsRef.current.add(s.stepInstanceId);
    }

    (async () => {
      for (const step of newSteps) {
        if (!step.formLayout) continue;

        const defaults: Record<string, string> = {};
        const paramChipKeys = new Set<string>();

        for (const el of step.formLayout.elements) {
          const fieldKey = el.fieldName ?? el.content?.plainText ?? '';

          // Resolve defaultSource for input/textarea elements
          if (el.defaultSource) {
            if (el.defaultSource.mode === 'static') {
              defaults[fieldKey] = el.defaultSource.value;
            } else if (el.defaultSource.mode === 'parameter') {
              const resolved = await onResolveParameter(el.defaultSource.value);
              defaults[fieldKey] = resolved ?? '';
            }
          }

          // Collect param chip references from text/header elements
          if ((el.type === 'text' || el.type === 'header') && el.content?.content) {
            const chipRegex = /data-param-chip="([^"]+)"/g;
            let match: RegExpExecArray | null;
            while ((match = chipRegex.exec(el.content.content)) !== null) {
              paramChipKeys.add(match[1]);
            }
          }
        }

        // Seed form data with resolved defaults
        if (Object.keys(defaults).length > 0) {
          setFormDataMap((prev) => ({
            ...prev,
            [step.stepInstanceId]: {
              ...defaults,
              ...(prev[step.stepInstanceId] ?? {}),
            },
          }));
        }

        // Resolve parameter chips for rich text
        if (paramChipKeys.size > 0) {
          const resolvedParams: Record<string, string> = {};
          for (const key of paramChipKeys) {
            const value = await onResolveParameter(key);
            resolvedParams[key] = value ?? `<${key}>`;
          }
          setResolvedParamsMap((prev) => ({
            ...prev,
            [step.stepInstanceId]: resolvedParams,
          }));
        }
      }
    })();
  }, [steps, onResolveParameter]);

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
    async (stepInstanceId: string, outputValue?: string) => {
      setSubmittingSteps((prev) => new Set(prev).add(stepInstanceId));
      const stepFormData = formDataMap[stepInstanceId] ?? {};

      // Write output parameters to Value Properties before completing the step
      if (onWriteFormOutputParameters) {
        const step = steps.find((s) => s.stepInstanceId === stepInstanceId);
        if (step?.formLayout) {
          const outputs: Array<{ nameKey: string; value: string }> = [];
          for (const el of step.formLayout.elements) {
            if (el.outputParameter) {
              const fieldKey = el.fieldName ?? el.content?.plainText ?? '';
              const fieldValue = stepFormData[fieldKey] ?? '';
              outputs.push({ nameKey: el.outputParameter, value: fieldValue });
            }
          }
          if (outputs.length > 0) {
            await onWriteFormOutputParameters(outputs);
          }
        }
      }

      onStepComplete(stepInstanceId, stepFormData, outputValue);
    },
    [onStepComplete, formDataMap, steps, onWriteFormOutputParameters],
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
      const isBlocked = blockedSteps.has(item.stepInstanceId);
      const isDisabled = isSubmitting || isBlocked;

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
              onButtonPress={isDisabled ? undefined : (outputValue) =>
                handleSubmit(item.stepInstanceId, outputValue)
              }
              resolvedParams={resolvedParamsMap[item.stepInstanceId]}
              onBlockDoneChange={(blocked) =>
                handleBlockDoneChange(item.stepInstanceId, blocked)
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
    [formDataMap, submittingSteps, blockedSteps, images, handleFormDataChange, handleSubmit, resolvedParamsMap, handleBlockDoneChange],
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
