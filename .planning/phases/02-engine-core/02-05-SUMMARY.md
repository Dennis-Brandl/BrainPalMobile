---
phase: 02-engine-core
plan: 05
subsystem: engine
tags: [workflow-runner, isa88, state-machine, scheduler, crash-recovery, execution-logger, event-queue]

# Dependency graph
requires:
  - phase: 02-01
    provides: types, interfaces, events (EngineEventBus, EngineEventQueue)
  - phase: 02-02
    provides: StateMachine with ISA-88 observable transitions, Scheduler with DAG-based step activation
  - phase: 02-03
    provides: ParameterResolver, ScopeResolver, ConditionEvaluator, ResourceManager
  - phase: 02-04
    provides: PackageImporter (fflate ZIP extraction)
provides:
  - WorkflowRunner orchestrating all components through serial event queue
  - createRuntimeWorkflow deep-copy lifecycle for workflow instantiation
  - StepExecutor with step-type-specific execution for all 11 step types
  - ExecutionLogService for unconditional audit trail logging
  - Crash recovery with per-state recovery actions and stale detection
  - Complete engine public API surface in packages/engine/src/index.ts
affects: [03-storage, 04-ui, 05-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Serial event queue for all step state changes (race condition prevention)"
    - "Deep-copy lifecycle for runtime workflow creation from master specs"
    - "Per-state crash recovery table (STARTING->rollback, ABORTING->complete, etc.)"
    - "Step-type dispatch pattern in StepExecutor for all 11 types"

key-files:
  created:
    - packages/engine/src/runner/types.ts
    - packages/engine/src/runner/workflow-runner.ts
    - packages/engine/src/runner/step-executor.ts
    - packages/engine/src/runner/lifecycle.ts
    - packages/engine/src/runner/crash-recovery.ts
    - packages/engine/src/runner/index.ts
    - packages/engine/src/logger/types.ts
    - packages/engine/src/logger/execution-logger.ts
    - packages/engine/src/logger/index.ts
    - packages/engine/__tests__/runner/lifecycle.test.ts
    - packages/engine/__tests__/runner/workflow-runner.test.ts
    - packages/engine/__tests__/runner/crash-recovery.test.ts
    - packages/engine/__tests__/logger/execution-logger.test.ts
  modified:
    - packages/engine/src/index.ts
    - packages/engine/src/condition-evaluator/condition-evaluator.ts
    - packages/engine/__tests__/helpers/fixtures.ts

key-decisions:
  - "All step state changes routed through EngineEventQueue for serial processing (prevents parallel branch race conditions)"
  - "SELECT_1 stores matchedConnectionId in resolved_outputs_json for use during step completion routing"
  - "Crash recovery uses StateMachine initialized at persisted state (not replaying from IDLE)"
  - "Stale workflow threshold is 24 hours -- stale workflows returned separately for UI prompt"
  - "WORKFLOW_PROXY, ACTION_PROXY, SCRIPT throw UnsupportedStepTypeError (deferred to later phases)"

patterns-established:
  - "WorkflowRunner.activateStep() pattern: IDLE->WAITING->STARTING->EXECUTING with auto-complete continuation"
  - "Event bus emissions alongside execution logger for dual-channel observability"
  - "RunnerConfig dependency injection: all repositories + eventBus + idGenerator + logger"

# Metrics
duration: 12min
completed: 2026-02-25
---

# Phase 2 Plan 5: WorkflowRunner and Crash Recovery Summary

**WorkflowRunner orchestrating ISA-88 state machine, DAG scheduler, parameter resolver, condition evaluator, and resource manager through serial event queue with crash recovery and execution logging**

## Performance

- **Duration:** 12 min
- **Started:** 2026-02-25T18:40:21Z
- **Completed:** 2026-02-25T18:52:40Z
- **Tasks:** 2
- **Files modified:** 16

## Accomplishments
- WorkflowRunner executes linear, parallel, and SELECT_1 branching workflows end-to-end
- Serial event queue prevents race conditions when parallel branches complete simultaneously (proven by test)
- Crash recovery resumes interrupted workflows with per-state recovery actions (rollback STARTING, complete ABORTING, etc.)
- ExecutionLogService captures full audit trail of all engine events with ISO 8601 timestamps
- 261 total engine tests passing across 15 test files with zero type errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement lifecycle, step executor, execution logger, and WorkflowRunner** - `8eb2c66` (feat)
2. **Task 2: Create integration tests and crash recovery** - `6f79c56` (feat)

## Files Created/Modified
- `packages/engine/src/runner/types.ts` - RunnerConfig, WorkflowRunnerState, RecoveryResult types
- `packages/engine/src/runner/workflow-runner.ts` - Top-level orchestrator (760 lines)
- `packages/engine/src/runner/step-executor.ts` - Step-type-specific execution logic (370 lines)
- `packages/engine/src/runner/lifecycle.ts` - createRuntimeWorkflow, completeWorkflow, abortWorkflow (183 lines)
- `packages/engine/src/runner/crash-recovery.ts` - recoverWorkflows with per-state recovery (279 lines)
- `packages/engine/src/runner/index.ts` - Runner barrel exports
- `packages/engine/src/logger/types.ts` - Logger type re-exports
- `packages/engine/src/logger/execution-logger.ts` - ExecutionLogService class
- `packages/engine/src/logger/index.ts` - Logger barrel exports
- `packages/engine/src/index.ts` - Complete engine public API surface with all component exports
- `packages/engine/src/condition-evaluator/condition-evaluator.ts` - Fixed type errors (unknown comparisons)
- `packages/engine/__tests__/helpers/fixtures.ts` - Fixed SELECT_1 property reference
- `packages/engine/__tests__/runner/lifecycle.test.ts` - Lifecycle tests (10 tests)
- `packages/engine/__tests__/runner/workflow-runner.test.ts` - Integration tests (14 tests)
- `packages/engine/__tests__/runner/crash-recovery.test.ts` - Crash recovery tests (13 tests)
- `packages/engine/__tests__/logger/execution-logger.test.ts` - Logger tests (7 tests)

## Decisions Made
- All step state changes routed through EngineEventQueue -- this is the critical design decision preventing race conditions when parallel branches complete
- SELECT_1 step stores matchedConnectionId in resolved_outputs_json; onStepCompleted reads it to route only the matched branch
- Crash recovery creates StateMachine at persisted state (not IDLE), avoiding need to replay state transitions
- Stale threshold is 24 hours; stale workflows returned separately in RecoveryResult for UI-layer decision
- Unsupported step types (WORKFLOW_PROXY, ACTION_PROXY, SCRIPT) throw descriptive UnsupportedStepTypeError

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed condition-evaluator type errors with unknown comparisons**
- **Found during:** Task 1 (type checking)
- **Issue:** `coerceTypes()` returns `[unknown, unknown]` which strict TypeScript rejects for `>`, `<` operators
- **Fix:** Added `as number` casts for comparison operators (values are already coerced)
- **Files modified:** packages/engine/src/condition-evaluator/condition-evaluator.ts
- **Verification:** `npx tsc --noEmit` passes with zero errors
- **Committed in:** 8eb2c66 (Task 1 commit)

**2. [Rule 1 - Bug] Fixed SELECT_1 fixture property reference**
- **Found during:** Task 2 (SELECT_1 integration test)
- **Issue:** SELECT_1 input parameter had empty default_value instead of property reference
- **Fix:** Changed default_value from `''` to `'UserChoice.Value'` in makeSelect1Workflow fixture
- **Files modified:** packages/engine/__tests__/helpers/fixtures.ts
- **Verification:** SELECT_1 branching test passes -- correct branch followed
- **Committed in:** 6f79c56 (Task 2 commit)

**3. [Rule 2 - Missing Critical] Added eventBus emissions for early state transitions**
- **Found during:** Task 2 (state transition completeness test)
- **Issue:** IDLE->WAITING and WAITING->STARTING transitions were logged but not emitted to eventBus
- **Fix:** Added eventBus.emit('STEP_STATE_CHANGED') alongside executionLogger.log for these transitions
- **Files modified:** packages/engine/src/runner/workflow-runner.ts
- **Verification:** Full state transition test now passes
- **Committed in:** 6f79c56 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 missing critical)
**Impact on plan:** All auto-fixes necessary for correctness. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The complete engine is now built and verified: types, interfaces, events, state machine, scheduler, parameter resolver, condition evaluator, resource manager, import pipeline, workflow runner, crash recovery, execution logging
- Phase 2 (Engine Core) is complete -- all 5 plans executed
- Ready for Phase 3 (Storage) which implements the repository interfaces with SQLite

---
*Phase: 02-engine-core*
*Completed: 2026-02-25*
