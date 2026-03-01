# Phase 6: Pause/Resume Fix + Crash Recovery - Research

**Researched:** 2026-03-01
**Domain:** Engine event system, crash recovery, Zustand store synchronization
**Confidence:** HIGH

## Summary

This phase addresses two broken E2E flows identified in the v1.0 milestone audit. Both are internal codebase fixes requiring no new libraries or external dependencies -- only modifications to existing engine and UI bridge code.

**Issue 1 (WORKFLOW_PAUSED event gap):** `pauseWorkflow()` and `resumeWorkflow()` in `WorkflowRunner` update the database but never emit events to the `EngineEventBus`. Every other lifecycle method (start, abort, stop, complete) follows the pattern: update DB, log event, emit EventBus event. Pause/resume skips steps 2 and 3. The `EngineEventMap` type definition has no `WORKFLOW_PAUSED` or `WORKFLOW_RESUMED` entries, so there is nothing for the Zustand store to subscribe to. This causes `StateControls` to show "Pause" when the workflow is already paused, because the store's `workflowState` stays `RUNNING`.

**Issue 2 (Crash recovery stepsToReactivate discarded):** `recoverWorkflows()` builds a `stepsToReactivate` array per workflow (for steps in WAITING, STARTING, EXECUTING-automated, or COMPLETING states) but the array is only used in a log message (count) and never returned in `RecoveryResult`. Additionally, `recoverWorkflows()` builds a `runnerState` object but never returns it -- the `EngineProvider` independently rebuilds this same state structure, duplicating ~30 lines of code. After crash recovery, automated steps (START, PARALLEL, WAIT_ALL, SELECT_1) that were mid-flight remain frozen.

**Primary recommendation:** Follow the existing lifecycle event pattern exactly. Add `WORKFLOW_PAUSED` and `WORKFLOW_RESUMED` to both `EngineEventMap` and `LogEventType`, emit them from `pauseWorkflow()`/`resumeWorkflow()`, and subscribe in `EngineProvider`. For crash recovery, extend `RecoveryResult` to include both `runnerState` and `stepsToReactivate` per workflow, and add a `reactivateSteps()` method to `WorkflowRunner` that the `EngineProvider` calls after restoring state.

## Standard Stack

No new libraries required. This phase modifies existing internal code only.

### Core (existing, no changes)
| Library | Version | Purpose | Role in This Phase |
|---------|---------|---------|-------------------|
| @brainpal/engine | internal | Workflow execution engine | Modified: event types, runner, crash recovery |
| zustand | ^5.x | State management | Consumed: new event subscriptions in EngineProvider |
| expo-sqlite | ^15.x | SQLite database | Unchanged: DB operations already work correctly |

### Supporting
None needed.

### Alternatives Considered
None -- this is internal bug fixing, not library selection.

## Architecture Patterns

### Pattern 1: Lifecycle Event Emission (existing pattern to replicate)

**What:** Every workflow lifecycle transition follows a 3-step pattern: (1) update DB, (2) log event, (3) emit EventBus event.

**When to use:** Whenever a workflow-level state change occurs.

**Example (existing pattern from `startWorkflow`, `abort`, `stop`):**
```typescript
// Source: packages/engine/src/runner/workflow-runner.ts, lines 168-181
// 1. Update DB
workflow.workflow_state = 'RUNNING';
await this.config.workflowRepo.save(workflow);

// 2. Log event
await this.config.executionLogger.log({
  workflow_instance_id: workflowInstanceId,
  event_type: 'WORKFLOW_STARTED',
  event_data_json: JSON.stringify({ started_at: workflow.started_at }),
  timestamp: new Date().toISOString(),
});

// 3. Emit EventBus event
this.config.eventBus.emit('WORKFLOW_STARTED', { workflowInstanceId });
```

**What's missing in pauseWorkflow() (line 246-278):** Steps 2 and 3 are absent. The method updates DB via `updateState()` and pauses individual steps, but never logs a workflow-level event or emits to EventBus.

**What's missing in resumeWorkflow() (line 284-316):** Same gap -- only DB update via `updateState()`.

### Pattern 2: EngineEventMap/EventBus Subscription (existing pattern to replicate)

**What:** The `EngineProvider` subscribes to `EngineEventMap` events and updates the Zustand `execution-store`.

**When to use:** Whenever a new event type is added to `EngineEventMap`.

**Example (existing pattern from EngineProvider.tsx, lines 150-196):**
```typescript
// Source: apps/mobile/src/providers/EngineProvider.tsx
unsubscribers.push(
  eventBus.on('WORKFLOW_STARTED', ({ workflowInstanceId }) => {
    useExecutionStore.getState().updateWorkflowState(workflowInstanceId, 'RUNNING');
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
```

**Required additions:** Two new subscriptions for `WORKFLOW_PAUSED` and `WORKFLOW_RESUMED` that call `updateWorkflowState()` with `'PAUSED'` and `'RUNNING'` respectively.

### Pattern 3: RecoveryResult Return Structure

**What:** `recoverWorkflows()` returns a `RecoveryResult` object consumed by `EngineProvider`.

**Current structure (packages/engine/src/runner/types.ts, line 69-76):**
```typescript
export interface RecoveryResult {
  recovered: string[];      // workflow instance IDs
  stale: string[];           // stale workflow instance IDs
  errors: Array<{ workflowId: string; error: string }>;
}
```

**Problem:** Two critical pieces of data are built inside `recoverWorkflows()` but discarded:
1. `runnerState: WorkflowRunnerState` -- the rebuilt in-memory state (state machines, adjacency lists, step maps)
2. `stepsToReactivate: string[]` -- step OIDs needing re-processing

The `EngineProvider` then independently rebuilds the `runnerState` from scratch (lines 288-326), duplicating ~35 lines of code from `crash-recovery.ts`.

**Recommended fix:** Extend `RecoveryResult` to include per-workflow recovery data:
```typescript
export interface RecoveredWorkflowData {
  runnerState: WorkflowRunnerState;
  stepsToReactivate: string[];  // step OIDs
}

export interface RecoveryResult {
  recovered: RecoveredWorkflowData[];  // Changed from string[] to full data
  stale: string[];
  errors: Array<{ workflowId: string; error: string }>;
}
```

### Pattern 4: Step Reactivation After Recovery

**What:** After crash recovery restores in-memory state, frozen automated steps need to be re-processed by the `WorkflowRunner`.

**Current gap:** `activateStep()` is `private` on `WorkflowRunner`. There is no public method to reactivate a step after recovery.

**Existing precedent:** `restoreWorkflowState()` (line 435-437) is a public method specifically for crash recovery that sets runner state. A similar public method for step reactivation follows this pattern.

**Recommended approach:** Add a public method to `WorkflowRunner`:
```typescript
async reactivateStep(
  workflowInstanceId: string,
  stepOid: string,
  stepInstanceId: string,
): Promise<void> {
  // Enqueue step activation through event queue
  await this.eventQueue.enqueue({
    type: 'STEP_ACTIVATED',
    stepInstanceId,
    workflowInstanceId,
    stepOid,
  });
}
```

**Important consideration for 're-execute' and 're-complete' recovery actions:**
Steps marked for 're-execute' (automated steps in EXECUTING state) and 're-complete' (steps in COMPLETING state) cannot simply be re-activated from IDLE -- they need to resume from their current state. The `activateStep()` method starts from IDLE and transitions through WAITING -> STARTING -> EXECUTING. For re-execute/re-complete, a different code path is needed:

- **re-execute:** The step is already in EXECUTING state. The step executor's `executeExecutingPhase()` needs to be called again, which will auto-complete the automated step.
- **re-complete:** The step is already in COMPLETING state. The step executor's `executeCompletingPhase()` needs to be called, followed by `onStepCompleted()`.
- **reactivate/rollback-to-waiting:** These steps are in WAITING state and can use the normal activation flow, but need to start from WAITING (not IDLE). The `activateStep()` method begins with IDLE -> WAITING transition, so a separate entry point or modification is needed.

### Anti-Patterns to Avoid

- **Anti-Pattern: Duplicating state reconstruction.** The EngineProvider currently rebuilds `WorkflowRunnerState` from scratch after calling `recoverWorkflows()`, which already builds the same structure internally. This should be returned, not rebuilt.

- **Anti-Pattern: Silent lifecycle transitions.** Updating DB state without emitting events creates UI desync. Every workflow state change must follow the emit pattern.

- **Anti-Pattern: Building data structures that are never consumed.** The `stepsToReactivate` array is built with careful per-state logic, then only its `.length` is logged. This represents completed work that was accidentally discarded.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Event type definitions | Ad-hoc string literals | Add to existing `EngineEventMap` and `LogEventType` types | Type safety, IDE autocomplete, compile-time checking |
| Step re-processing after crash | New recovery-specific execution path | Existing `executeExecutingPhase()` and `executeCompletingPhase()` | These functions already handle all step types correctly |
| State machine reconstruction | New SM builder | Existing `createRecoveredStateMachine()` in crash-recovery.ts | Already handles creating SM at any persisted state |

**Key insight:** Both fixes involve wiring up existing building blocks that are already implemented but not connected. No new algorithms or complex logic needed.

## Common Pitfalls

### Pitfall 1: Emitting events for child workflows during pause/resume

**What goes wrong:** `pauseWorkflow()` recursively pauses child workflows (lines 269-276). If `WORKFLOW_PAUSED` is emitted for both parent and child, the EngineProvider's child-workflow-completion handler logic may interfere.

**Why it happens:** The EngineProvider has special handling for child workflow lifecycle events (it skips UI updates for child workflows via `parentCache`).

**How to avoid:** Only emit `WORKFLOW_PAUSED`/`WORKFLOW_RESUMED` for the top-level workflow. The recursive call to child workflows should update DB state (as it does now) but the EventBus event is only needed for the workflow whose UI is visible. Alternatively, emit for all and let EngineProvider filter via `parentCache` (matching the existing `WORKFLOW_COMPLETED` pattern).

**Recommended approach:** Emit for all workflows (parent and child). The EngineProvider subscription should call `updateWorkflowState()` which is harmless for child workflows (the store may not even have an entry for the child). This is consistent with `WORKFLOW_STARTED` which also fires for child workflows.

### Pitfall 2: Re-activation race conditions with event queue

**What goes wrong:** If step reactivation is done outside the event queue, it can race with other events being processed.

**Why it happens:** The `EngineEventQueue` serializes all step state changes. Bypassing it (like `startChildWorkflowDirect` does) is only safe when called from within the queue handler.

**How to avoid:** Step reactivation should go through `eventQueue.enqueue()` to maintain serial processing. Since reactivation happens during crash recovery (before any user interaction), there are no concurrent events to race with, but using the queue is still the correct pattern.

**Warning signs:** Steps ending up in unexpected states, or "transition not allowed" errors from the state machine.

### Pitfall 3: State machine mismatch after recovery

**What goes wrong:** The in-memory `StateMachine` for a recovered step may not match the persisted `step_state` if recovery actions modify the step state without updating the SM.

**Why it happens:** `crash-recovery.ts` correctly creates new state machines after state changes (e.g., line 97: `stateMachines.set(step.step_oid, createRecoveredStateMachine('WAITING'))`), but if reactivation logic later expects a different SM state, transitions fail.

**How to avoid:** For `re-execute` steps, the SM is already at EXECUTING. The step executor's `executeExecutingPhase()` transitions EXECUTING -> COMPLETING -> COMPLETED. For `reactivate` steps, the SM is at WAITING. The activation logic needs to handle the WAITING -> STARTING transition (not IDLE -> WAITING which is the normal `activateStep()` entry point).

### Pitfall 4: WORKFLOW_PROXY steps in EXECUTING during crash

**What goes wrong:** A `WORKFLOW_PROXY` step in EXECUTING state means a child workflow is running. Crash recovery needs to handle both the parent WORKFLOW_PROXY step AND the child workflow. Re-executing the WORKFLOW_PROXY's `executeExecutingPhase()` would try to create a SECOND child workflow.

**Why it happens:** `WORKFLOW_PROXY` is classified as a non-auto-completing step type (returns `false` from `executeExecutingPhase()`), similar to `USER_INTERACTION`. During crash recovery, `getRecoveryAction()` returns `'re-execute'` for it because it's not `USER_INTERACTION` or `YES_NO`.

**How to avoid:** `getRecoveryAction()` should return `'stay-executing'` for `WORKFLOW_PROXY` steps in EXECUTING state, same as USER_INTERACTION. The child workflow recovery happens separately through `workflowRepo.getActive()` which returns child workflows too.

**Current code (line 229-234):**
```typescript
case 'EXECUTING':
  if (step.step_type === 'USER_INTERACTION' || step.step_type === 'YES_NO') {
    return 'stay-executing';
  }
  return 're-execute';
```

**Fix:** Add `WORKFLOW_PROXY` to the stay-executing check:
```typescript
case 'EXECUTING':
  if (step.step_type === 'USER_INTERACTION' || step.step_type === 'YES_NO' || step.step_type === 'WORKFLOW_PROXY') {
    return 'stay-executing';
  }
  return 're-execute';
```

### Pitfall 5: Reactivation order matters for WAIT_ALL/WAIT_ANY

**What goes wrong:** If a WAIT_ALL step is reactivated before its predecessor parallel branch steps have completed, the scheduler may not have the correct state to determine convergence.

**Why it happens:** WAIT_ALL checks if all incoming branches have completed. During crash recovery, branch steps may be in various states.

**How to avoid:** Reactivation should process steps in topological order (upstream before downstream). Steps in earlier pipeline stages (WAITING, STARTING) should be reactivated before steps in later stages (EXECUTING, COMPLETING). The `stepsToReactivate` array should be sorted by recovery action priority or by graph topology.

**Practical note:** This edge case requires a crash to happen during the milliseconds when a WAIT_ALL step is mid-execution -- extremely unlikely but should be handled correctly.

## Code Examples

### Example 1: Adding WORKFLOW_PAUSED/WORKFLOW_RESUMED to EngineEventMap

```typescript
// File: packages/engine/src/types/events.ts

// Add to EngineEventMap (around line 58):
export type EngineEventMap = {
  WORKFLOW_STARTED: { workflowInstanceId: string };
  WORKFLOW_COMPLETED: { workflowInstanceId: string };
  WORKFLOW_ABORTED: { workflowInstanceId: string };
  WORKFLOW_STOPPED: { workflowInstanceId: string };
  WORKFLOW_PAUSED: { workflowInstanceId: string };    // NEW
  WORKFLOW_RESUMED: { workflowInstanceId: string };    // NEW
  // ... rest unchanged
};

// Add to EngineEvent discriminated union (around line 124):
export type EngineEvent =
  | { type: 'WORKFLOW_STARTED'; workflowInstanceId: string }
  | { type: 'WORKFLOW_COMPLETED'; workflowInstanceId: string }
  | { type: 'WORKFLOW_ABORTED'; workflowInstanceId: string }
  | { type: 'WORKFLOW_STOPPED'; workflowInstanceId: string }
  | { type: 'WORKFLOW_PAUSED'; workflowInstanceId: string }   // NEW
  | { type: 'WORKFLOW_RESUMED'; workflowInstanceId: string }   // NEW
  // ... rest unchanged

// Add to LogEventType (around line 13):
export type LogEventType =
  | 'WORKFLOW_CREATED'
  | 'WORKFLOW_STARTED'
  | 'WORKFLOW_COMPLETED'
  | 'WORKFLOW_ABORTED'
  | 'WORKFLOW_STOPPED'
  | 'WORKFLOW_PAUSED'    // NEW
  | 'WORKFLOW_RESUMED'   // already exists
  // ... rest unchanged
```

### Example 2: Emitting events from pauseWorkflow/resumeWorkflow

```typescript
// File: packages/engine/src/runner/workflow-runner.ts

async pauseWorkflow(workflowInstanceId: string): Promise<void> {
  // ... existing step pausing code (lines 252-276) ...

  await this.config.workflowRepo.updateState(workflowInstanceId, 'PAUSED');

  // NEW: Log event
  await this.config.executionLogger.log({
    workflow_instance_id: workflowInstanceId,
    event_type: 'WORKFLOW_PAUSED',
    event_data_json: JSON.stringify({ paused_at: new Date().toISOString() }),
    timestamp: new Date().toISOString(),
  });

  // NEW: Emit EventBus event
  this.config.eventBus.emit('WORKFLOW_PAUSED', { workflowInstanceId });
}

async resumeWorkflow(workflowInstanceId: string): Promise<void> {
  // ... existing step resuming code (lines 290-314) ...

  await this.config.workflowRepo.updateState(workflowInstanceId, 'RUNNING');

  // NEW: Log event
  await this.config.executionLogger.log({
    workflow_instance_id: workflowInstanceId,
    event_type: 'WORKFLOW_RESUMED',
    event_data_json: JSON.stringify({ resumed_at: new Date().toISOString() }),
    timestamp: new Date().toISOString(),
  });

  // NEW: Emit EventBus event
  this.config.eventBus.emit('WORKFLOW_RESUMED', { workflowInstanceId });
}
```

### Example 3: EngineProvider subscriptions for pause/resume

```typescript
// File: apps/mobile/src/providers/EngineProvider.tsx

// Add alongside existing WORKFLOW_STARTED subscription:
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
```

### Example 4: Extended RecoveryResult with step reactivation data

```typescript
// File: packages/engine/src/runner/types.ts

export interface RecoveredWorkflowData {
  workflowInstanceId: string;
  runnerState: WorkflowRunnerState;
  stepsToReactivate: Array<{
    stepOid: string;
    stepInstanceId: string;
    action: 'reactivate' | 're-execute' | 're-complete';
  }>;
}

export interface RecoveryResult {
  recovered: RecoveredWorkflowData[];
  stale: string[];
  errors: Array<{ workflowId: string; error: string }>;
}
```

### Example 5: Public reactivation method on WorkflowRunner

```typescript
// File: packages/engine/src/runner/workflow-runner.ts

/**
 * Reactivate a step after crash recovery.
 * Used by EngineProvider to resume automated steps that were mid-flight during crash.
 */
async reactivateStep(
  workflowInstanceId: string,
  stepOid: string,
  stepInstanceId: string,
): Promise<void> {
  await this.eventQueue.enqueue({
    type: 'STEP_ACTIVATED',
    stepInstanceId,
    workflowInstanceId,
    stepOid,
  });
}
```

**Note:** This only handles the 'reactivate' action (steps in WAITING). For 're-execute' and 're-complete' actions, separate handling is needed since those steps are not in IDLE state. See Pitfall 3.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Crash recovery returns only workflow IDs | Should return full state + reactivation data | This phase | Eliminates code duplication in EngineProvider |
| Pause/resume updates DB only | Should follow full lifecycle event pattern | This phase | Fixes UI desync |

## Open Questions

1. **Re-execution entry point for non-IDLE steps**
   - What we know: `activateStep()` assumes IDLE -> WAITING as entry point. Steps in EXECUTING (re-execute) and COMPLETING (re-complete) need different entry points.
   - What's unclear: Should the re-execution go through the event queue (new event type like `STEP_REACTIVATED`), or should it be done directly during the recovery phase?
   - Recommendation: Add handling in the `handleEvent()` method for a `STEP_ACTIVATED` event that checks current SM state and routes to the appropriate executor phase. If SM is at EXECUTING, call `executeExecutingPhase()`. If at COMPLETING, call `executeCompletingPhase()`. If at WAITING, proceed with normal WAITING -> STARTING flow (skipping the IDLE -> WAITING transition).

2. **Topological ordering of stepsToReactivate**
   - What we know: Steps should ideally be reactivated in dependency order (upstream before downstream).
   - What's unclear: Whether the event queue serialization makes this unnecessary (each activation completes before the next starts, so downstream steps would see completed upstream steps).
   - Recommendation: The event queue already serializes processing. Since each STEP_ACTIVATED event is processed fully before the next, and `activateStep()` recursively activates downstream steps via `onStepCompleted()`, reactivation order may not matter in practice. However, sorting by state (WAITING first, then EXECUTING, then COMPLETING) is a safe defensive measure.

3. **Existing test coverage gaps**
   - What we know: The pause/resume test (workflow-runner.test.ts, line 401-432) verifies DB state changes but does NOT check EventBus emissions. Crash recovery tests verify state transitions but do NOT test step reactivation.
   - What's unclear: Whether new tests should be added to existing test files or in a new test file.
   - Recommendation: Add event emission assertions to existing pause/resume test. Add new crash recovery tests for automated step reactivation (START, PARALLEL, SELECT_1 types).

## Sources

### Primary (HIGH confidence)
- Direct source code inspection of all relevant files (highest confidence -- this is the codebase itself)
  - `packages/engine/src/runner/workflow-runner.ts` -- WorkflowRunner class, pauseWorkflow/resumeWorkflow methods
  - `packages/engine/src/runner/crash-recovery.ts` -- recoverWorkflows function, stepsToReactivate logic
  - `packages/engine/src/types/events.ts` -- EngineEventMap, LogEventType, EngineEvent types
  - `packages/engine/src/events/event-bus.ts` -- EngineEventBus class
  - `packages/engine/src/runner/types.ts` -- RecoveryResult, WorkflowRunnerState, RunnerConfig
  - `packages/engine/src/runner/step-executor.ts` -- executeExecutingPhase, executeCompletingPhase
  - `apps/mobile/src/providers/EngineProvider.tsx` -- EventBus subscriptions, crash recovery integration
  - `apps/mobile/src/stores/execution-store.ts` -- Zustand store, updateWorkflowState action
  - `apps/mobile/src/components/execution/StateControls.tsx` -- Menu items per workflow state
  - `apps/mobile/app/execution/[instanceId].tsx` -- Execution screen, handlePause/handleResume handlers
  - `packages/engine/__tests__/runner/workflow-runner.test.ts` -- Existing pause/resume tests
  - `packages/engine/__tests__/runner/crash-recovery.test.ts` -- Existing crash recovery tests
  - `packages/engine/__tests__/helpers/test-utils.ts` -- Test infrastructure

### Secondary (MEDIUM confidence)
- `.planning/v1.0-MILESTONE-AUDIT.md` -- Issue descriptions and severity assessments
- `.planning/ROADMAP.md` -- Phase 6 goals and success criteria

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- No new libraries, all internal code modification
- Architecture: HIGH -- All patterns identified from direct source code inspection of existing codebase
- Pitfalls: HIGH -- Pitfalls 1-4 identified from direct code analysis; Pitfall 5 is MEDIUM (edge case reasoning)

**Research date:** 2026-03-01
**Valid until:** 2026-03-31 (stable internal codebase, no external dependency changes)
