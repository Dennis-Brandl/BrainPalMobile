// EngineProvider: React context providing WorkflowRunner to the component tree.
// Creates all SQLite repository instances, wires event bus subscriptions,
// and runs crash recovery on mount.

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import {
  WorkflowRunner,
  EngineEventBus,
  recoverWorkflows,
  type RunnerConfig,
  type StepState,
} from '@brainpal/engine';
import {
  SqliteWorkflowRepository,
  SqliteStepRepository,
  SqliteConnectionRepository,
  SqliteValuePropertyRepository,
  SqliteResourcePoolRepository,
  SqliteResourceQueueRepository,
  SqliteSyncBarrierRepository,
  SqliteExecutionLoggerRepository,
  IdGenerator,
} from '../repositories';
import { useRouter } from 'expo-router';
import { useExecutionStore } from '../stores/execution-store';
import { createNotificationService, type NotificationService } from '../services/notification-service';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface EngineContextValue {
  runner: WorkflowRunner;
  eventBus: EngineEventBus;
  isReady: boolean;
}

const EngineContext = createContext<EngineContextValue | null>(null);

// ---------------------------------------------------------------------------
// Non-executing step states (for removing from active steps)
// ---------------------------------------------------------------------------

const NON_ACTIVE_STEP_STATES = new Set<StepState>([
  'COMPLETING',
  'COMPLETED',
  'ABORTED',
  'ABORTING',
  'STOPPING',
  'PAUSING',
  'PAUSED',
]);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function EngineProvider({ children }: PropsWithChildren) {
  const db = useSQLiteContext();
  const [isReady, setIsReady] = useState(false);

  const router = useRouter();

  // Use refs to create instances ONCE (not on every render)
  const eventBusRef = useRef<EngineEventBus | null>(null);
  const runnerRef = useRef<WorkflowRunner | null>(null);
  const configRef = useRef<RunnerConfig | null>(null);
  const notificationServiceRef = useRef<NotificationService | null>(null);
  // Cache for resolving child workflow IDs to root parent workflow IDs
  const parentCacheRef = useRef(new Map<string, string | null>());

  // Initialize on first render only
  if (!eventBusRef.current) {
    const eventBus = new EngineEventBus();
    eventBusRef.current = eventBus;

    // Create all repository instances
    const workflowRepo = new SqliteWorkflowRepository(db);
    const stepRepo = new SqliteStepRepository(db);
    const connectionRepo = new SqliteConnectionRepository(db);
    const valuePropertyRepo = new SqliteValuePropertyRepository(db);
    const resourcePoolRepo = new SqliteResourcePoolRepository(db);
    const resourceQueueRepo = new SqliteResourceQueueRepository(db);
    const syncBarrierRepo = new SqliteSyncBarrierRepository(db);
    const executionLogger = new SqliteExecutionLoggerRepository(db);
    const idGenerator = new IdGenerator();

    const config: RunnerConfig = {
      workflowRepo,
      stepRepo,
      connectionRepo,
      valuePropertyRepo,
      resourcePoolRepo,
      resourceQueueRepo,
      syncBarrierRepo,
      executionLogger,
      eventBus,
      idGenerator,
    };
    configRef.current = config;

    runnerRef.current = new WorkflowRunner(config);

    // Create notification service (platform-specific: mobile or web)
    notificationServiceRef.current = createNotificationService(db);
  }

  // Wire event bus subscriptions and run crash recovery
  useEffect(() => {
    const eventBus = eventBusRef.current!;
    const config = configRef.current!;
    const runner = runnerRef.current!;
    const store = useExecutionStore.getState();
    const unsubscribers: Array<() => void> = [];
    const parentCache = parentCacheRef.current;

    // Helper: resolve a workflow instance ID to the root parent workflow ID.
    // Child workflow step events need to be attributed to the root parent for the carousel.
    async function resolveRootWorkflowId(workflowInstanceId: string): Promise<string> {
      if (parentCache.has(workflowInstanceId)) {
        return parentCache.get(workflowInstanceId) ?? workflowInstanceId;
      }
      const wf = await config.workflowRepo.getById(workflowInstanceId);
      if (wf?.parent_workflow_instance_id) {
        // Walk up the chain to find root
        const rootId = await resolveRootWorkflowId(wf.parent_workflow_instance_id);
        parentCache.set(workflowInstanceId, rootId);
        return rootId;
      }
      // This is a root workflow
      parentCache.set(workflowInstanceId, null);
      return workflowInstanceId;
    }

    // Subscribe to workflow lifecycle events
    unsubscribers.push(
      eventBus.on('WORKFLOW_STARTED', ({ workflowInstanceId }) => {
        useExecutionStore.getState().updateWorkflowState(workflowInstanceId, 'RUNNING');
      }),
    );

    unsubscribers.push(
      eventBus.on('WORKFLOW_COMPLETED', ({ workflowInstanceId }) => {
        // Check if this is a child workflow -- if so, do NOT remove from active workflows
        // (the parent workflow is still running and is the one shown in the carousel)
        const cachedParent = parentCache.get(workflowInstanceId);
        if (cachedParent !== undefined && cachedParent !== null) {
          // This is a child workflow completing -- skip UI cleanup
          return;
        }
        // Check async if not cached yet (race edge case)
        config.workflowRepo.getById(workflowInstanceId).then((wf) => {
          if (wf?.parent_workflow_instance_id) {
            parentCache.set(workflowInstanceId, wf.parent_workflow_instance_id);
            return; // Child workflow -- skip
          }
          useExecutionStore.getState().updateWorkflowState(workflowInstanceId, 'COMPLETED');
          // Remove after short delay so UI can show completion
          setTimeout(() => {
            useExecutionStore.getState().removeActiveWorkflow(workflowInstanceId);
          }, 2000);
        });
      }),
    );

    unsubscribers.push(
      eventBus.on('WORKFLOW_ABORTED', ({ workflowInstanceId }) => {
        useExecutionStore.getState().updateWorkflowState(workflowInstanceId, 'ABORTED');
        setTimeout(() => {
          useExecutionStore.getState().removeActiveWorkflow(workflowInstanceId);
        }, 2000);
      }),
    );

    unsubscribers.push(
      eventBus.on('WORKFLOW_STOPPED', ({ workflowInstanceId }) => {
        useExecutionStore.getState().updateWorkflowState(workflowInstanceId, 'STOPPED');
        setTimeout(() => {
          useExecutionStore.getState().removeActiveWorkflow(workflowInstanceId);
        }, 2000);
      }),
    );

    unsubscribers.push(
      eventBus.on('WORKFLOW_PAUSED', ({ workflowInstanceId }) => {
        useExecutionStore.getState().updateWorkflowState(workflowInstanceId, 'PAUSED');
      }),
    );

    unsubscribers.push(
      eventBus.on('WORKFLOW_RESUMED', ({ workflowInstanceId }) => {
        useExecutionStore.getState().updateWorkflowState(workflowInstanceId, 'RUNNING');
      }),
    );

    // Subscribe to step state changes and derive active steps.
    // Child workflow steps are mapped to the root parent workflow ID
    // so they appear in the parent's carousel (seamless inline display).
    unsubscribers.push(
      eventBus.on('STEP_STATE_CHANGED', (data) => {
        const { stepInstanceId, workflowInstanceId, stepOid, toState } = data;

        // Resolve the root workflow ID for the step (handles child->parent mapping)
        resolveRootWorkflowId(workflowInstanceId).then((rootId) => {
          const execStore = useExecutionStore.getState();
          execStore.updateStepState(rootId, stepOid, toState);

          if (toState === 'EXECUTING') {
            // Check step type to determine if this is a user-facing step
            const cachedType = execStore.getStepType(stepInstanceId);
            if (cachedType) {
              if (cachedType === 'USER_INTERACTION' || cachedType === 'YES_NO') {
                execStore.addActiveStep(rootId, stepInstanceId);
              }
            } else {
              // Query step type from DB and cache it
              config.stepRepo.getById(stepInstanceId).then((step) => {
                if (step) {
                  const currentStore = useExecutionStore.getState();
                  currentStore.cacheStepType(stepInstanceId, step.step_type);
                  if (step.step_type === 'USER_INTERACTION' || step.step_type === 'YES_NO') {
                    currentStore.addActiveStep(rootId, stepInstanceId);
                  }
                }
              });
            }
          } else if (NON_ACTIVE_STEP_STATES.has(toState)) {
            execStore.removeActiveStep(rootId, stepInstanceId);
          }
        });
      }),
    );

    // Initialize notification service and subscribe to notification events
    const notificationService = notificationServiceRef.current!;
    notificationService.initialize().catch((err) => {
      console.warn('NotificationService initialization failed:', err);
    });

    // Subscribe to USER_INPUT_REQUIRED for step attention notifications
    unsubscribers.push(
      eventBus.on('USER_INPUT_REQUIRED', (data) => {
        // Fire-and-forget: don't block the engine
        (async () => {
          try {
            let stepName = 'A step requires your input';
            const step = await config.stepRepo.getById(data.stepInstanceId);
            if (step) {
              try {
                const parsed = JSON.parse(step.step_json);
                stepName = parsed.local_id || parsed.description || stepName;
              } catch {
                // Use default name
              }
            }
            await notificationService.sendStepAttention(
              data.workflowInstanceId,
              data.stepInstanceId,
              stepName,
            );
          } catch (err) {
            console.warn('Notification send failed:', err);
          }
        })();
      }),
    );

    // Subscribe to ERROR events for error notifications
    unsubscribers.push(
      eventBus.on('ERROR', (data) => {
        notificationService.sendError(data.source, data.message).catch((err) => {
          console.warn('Error notification send failed:', err);
        });
      }),
    );

    // Set up notification tap handler for navigation
    const tapSub = notificationService.setupNotificationTapHandler(router);

    // Run crash recovery
    async function runRecovery() {
      try {
        const result = await recoverWorkflows(config);

        // For each recovered workflow, consume runnerState from RecoveryResult
        for (const recoveredData of result.recovered) {
          const { workflowInstanceId, runnerState, stepsToReactivate } = recoveredData;

          // Restore runnerState directly (already built by crash-recovery.ts)
          runner.restoreWorkflowState(runnerState);

          // Look up workflow for parent cache and UI registration
          const workflow = await config.workflowRepo.getById(workflowInstanceId);
          if (!workflow) continue;

          // Pre-populate parent cache for all recovered workflows
          if (workflow.parent_workflow_instance_id !== null) {
            parentCache.set(workflowInstanceId, workflow.parent_workflow_instance_id);
            // Child workflow -- restore into runner state but do NOT add to UI
            // Reactivate frozen automated steps (fire-and-forget)
            if (stepsToReactivate.length > 0) {
              runner.reactivateSteps(recoveredData).catch((err) => {
                console.warn(`Reactivation failed for child ${workflowInstanceId}:`, err);
              });
            }
            continue;
          }
          parentCache.set(workflowInstanceId, null);

          // Parse spec for workflow name
          let name = 'Workflow';
          try {
            const spec = JSON.parse(workflow.specification_json);
            name = spec.local_id || spec.description || 'Workflow';
          } catch {
            // Use default
          }

          const stepCount = runnerState.schedulerContext.steps.size;
          store.addActiveWorkflow(workflowInstanceId, workflow.master_workflow_oid, name, stepCount);

          // Reactivate frozen automated steps (fire-and-forget, don't block UI)
          if (stepsToReactivate.length > 0) {
            runner.reactivateSteps(recoveredData).catch((err) => {
              console.warn(`Reactivation failed for ${workflowInstanceId}:`, err);
            });
          }
        }
      } catch (err) {
        console.warn('Crash recovery failed:', err);
      }

      setIsReady(true);
    }

    runRecovery();

    // Cleanup subscriptions on unmount
    return () => {
      for (const unsub of unsubscribers) {
        unsub();
      }
      tapSub.remove();
    };
  }, [db, router]);

  const contextValue: EngineContextValue = {
    runner: runnerRef.current!,
    eventBus: eventBusRef.current!,
    isReady,
  };

  return (
    <EngineContext.Provider value={contextValue}>
      {children}
    </EngineContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useEngine(): EngineContextValue {
  const ctx = useContext(EngineContext);
  if (!ctx) {
    throw new Error('useEngine must be used within an EngineProvider');
  }
  return ctx;
}
