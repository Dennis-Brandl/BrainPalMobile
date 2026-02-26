// Execution screen: Main user interaction surface for workflow execution.
// Assembles StepCarousel (with FormCanvas pages), ExecutionHeader,
// StateControls, and WaitingStateBox. Wires to WorkflowRunner for
// user input submission and workflow lifecycle commands.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import type { WorkflowState } from '@brainpal/engine';
import type { PackageImageRow } from '@brainpal/storage';
import { colors } from '@brainpal/ui/src/theme/colors';
import { useEngine } from '../../src/providers/EngineProvider';
import { useExecutionStore } from '../../src/stores/execution-store';
import { useActiveSteps } from '../../src/hooks/useActiveSteps';
import { StepCarousel } from '../../src/components/carousel/StepCarousel';
import { DotIndicator } from '../../src/components/carousel/DotIndicator';
import { ExecutionHeader } from '../../src/components/execution/ExecutionHeader';
import { StateControls } from '../../src/components/execution/StateControls';
import { ConfirmDialog } from '../../src/components/execution/ConfirmDialog';
import { WaitingStateBox } from '../../src/components/workflow/WaitingStateBox';

// ---------------------------------------------------------------------------
// Terminal workflow states
// ---------------------------------------------------------------------------

const TERMINAL_STATES: ReadonlySet<WorkflowState> = new Set([
  'COMPLETED',
  'ABORTED',
  'STOPPED',
]);

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function ExecutionScreen() {
  const { instanceId } = useLocalSearchParams<{ instanceId: string }>();
  const router = useRouter();
  const db = useSQLiteContext();
  const { runner } = useEngine();

  // -----------------------------------------------------------------------
  // State from execution store
  // -----------------------------------------------------------------------

  const workflow = useExecutionStore(
    (s) => (instanceId ? s.activeWorkflows[instanceId] : undefined),
  );

  const workflowState: WorkflowState = workflow?.workflowState ?? 'IDLE';
  const workflowName = workflow?.name ?? 'Workflow';
  const masterOid = workflow?.masterOid ?? '';

  // -----------------------------------------------------------------------
  // Active steps for carousel
  // -----------------------------------------------------------------------

  const { steps: activeSteps, isLoading } = useActiveSteps(instanceId ?? '');
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  // -----------------------------------------------------------------------
  // Images loaded from package_images table
  // -----------------------------------------------------------------------

  const [images, setImages] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!masterOid) return;
    let cancelled = false;

    async function loadImages() {
      try {
        const rows = await db.getAllAsync<PackageImageRow>(
          'SELECT filename, mime_type, data FROM package_images WHERE workflow_oid = ?',
          [masterOid],
        );

        if (cancelled) return;

        const imageMap = new Map<string, string>();
        for (const row of rows) {
          // Convert Uint8Array BLOB to base64 data URI
          const bytes = row.data;
          let binary = '';
          for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64 = btoa(binary);
          const uri = `data:${row.mime_type};base64,${base64}`;
          imageMap.set(row.filename, uri);
        }
        setImages(imageMap);
      } catch (err) {
        console.warn('ExecutionScreen: failed to load images', err);
      }
    }

    loadImages();
    return () => {
      cancelled = true;
    };
  }, [db, masterOid]);

  // -----------------------------------------------------------------------
  // Abort confirmation dialog
  // -----------------------------------------------------------------------

  const [showAbortConfirm, setShowAbortConfirm] = useState(false);

  // -----------------------------------------------------------------------
  // Auto-advance: adjust index when active steps change
  // -----------------------------------------------------------------------

  const prevStepsRef = useRef(activeSteps);

  useEffect(() => {
    prevStepsRef.current = activeSteps;

    if (activeSteps.length === 0) {
      setCurrentStepIndex((prev) => (prev === 0 ? prev : 0));
      return;
    }

    // Current index is out of bounds -- step was removed.
    // Try to stay at the same position or go to last.
    setCurrentStepIndex((prev) => {
      if (prev < activeSteps.length) return prev;
      return Math.min(prev, activeSteps.length - 1);
    });
  }, [activeSteps]);

  // -----------------------------------------------------------------------
  // Handle terminal workflow state: navigate back after brief delay
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (TERMINAL_STATES.has(workflowState)) {
      const timeout = setTimeout(() => {
        if (router.canGoBack()) {
          router.back();
        }
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [workflowState, router]);

  // -----------------------------------------------------------------------
  // Event handlers
  // -----------------------------------------------------------------------

  const handleStepComplete = useCallback(
    async (stepInstanceId: string, outputValue?: string) => {
      try {
        // Build form data for submission
        // For YES_NO steps: outputValue is the yes/no value
        const formData: Record<string, string> = {};
        if (outputValue !== undefined) {
          formData._output = outputValue;
        }

        await runner.submitUserInput(stepInstanceId, formData);
      } catch (err) {
        console.warn('ExecutionScreen: submitUserInput failed', err);
      }
    },
    [runner],
  );

  const handlePause = useCallback(async () => {
    if (!instanceId) return;
    try {
      await runner.pauseWorkflow(instanceId);
    } catch (err) {
      console.warn('ExecutionScreen: pauseWorkflow failed', err);
    }
  }, [runner, instanceId]);

  const handleResume = useCallback(async () => {
    if (!instanceId) return;
    try {
      await runner.resumeWorkflow(instanceId);
    } catch (err) {
      console.warn('ExecutionScreen: resumeWorkflow failed', err);
    }
  }, [runner, instanceId]);

  const handleStop = useCallback(async () => {
    if (!instanceId) return;
    try {
      await runner.stop(instanceId);
      if (router.canGoBack()) {
        router.back();
      }
    } catch (err) {
      console.warn('ExecutionScreen: stop failed', err);
    }
  }, [runner, instanceId, router]);

  const handleAbort = useCallback(() => {
    setShowAbortConfirm(true);
  }, []);

  const confirmAbort = useCallback(async () => {
    setShowAbortConfirm(false);
    if (!instanceId) return;
    try {
      await runner.abort(instanceId);
      if (router.canGoBack()) {
        router.back();
      }
    } catch (err) {
      console.warn('ExecutionScreen: abort failed', err);
    }
  }, [runner, instanceId, router]);

  const cancelAbort = useCallback(() => {
    setShowAbortConfirm(false);
  }, []);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    }
  }, [router]);

  // -----------------------------------------------------------------------
  // Step info text
  // -----------------------------------------------------------------------

  const stepInfo = useMemo(() => {
    if (activeSteps.length === 0) {
      return `${workflow?.totalSteps ?? 0} total steps`;
    }
    return `Step ${currentStepIndex + 1} of ${activeSteps.length} active`;
  }, [activeSteps.length, currentStepIndex, workflow?.totalSteps]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  const hasActiveSteps = activeSteps.length > 0;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ExecutionHeader
        workflowName={workflowName}
        workflowState={workflowState}
        stepInfo={stepInfo}
        onBack={handleBack}
        stateControlsSlot={
          <StateControls
            workflowState={workflowState}
            onPause={handlePause}
            onResume={handleResume}
            onStop={handleStop}
            onAbort={handleAbort}
          />
        }
      />

      <View style={styles.body}>
        {hasActiveSteps ? (
          <>
            <StepCarousel
              steps={activeSteps}
              currentIndex={currentStepIndex}
              onIndexChange={setCurrentStepIndex}
              onStepComplete={handleStepComplete}
              images={images}
            />
            <DotIndicator
              count={activeSteps.length}
              activeIndex={currentStepIndex}
            />
          </>
        ) : (
          <WaitingStateBox workflowState={workflowState} />
        )}
      </View>

      <ConfirmDialog
        visible={showAbortConfirm}
        title="Abort Workflow"
        message="Are you sure you want to abort this workflow? This action cannot be undone."
        confirmLabel="Abort"
        cancelLabel="Cancel"
        destructive
        onConfirm={confirmAbort}
        onCancel={cancelAbort}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  body: {
    flex: 1,
  },
});
