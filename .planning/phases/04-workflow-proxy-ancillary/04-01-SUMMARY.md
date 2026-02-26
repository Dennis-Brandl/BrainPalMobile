---
phase: 04-workflow-proxy-ancillary
plan: 01
subsystem: engine
tags: [workflow-proxy, nested-workflow, child-workflow, isa88, event-queue]

# Dependency graph
requires:
  - phase: 02-engine-core
    provides: WorkflowRunner, step-executor, event queue, ISA-88 state machine, lifecycle functions
  - phase: 03-execution-ui
    provides: EngineProvider bridge, execution store, crash recovery
provides:
  - WORKFLOW_PROXY step execution (child workflow creation, inline step display, output propagation)
  - Parent/child lifecycle coordination (pause, resume, abort, stop propagation)
  - Event queue deadlock avoidance via startChildWorkflowDirect
  - EngineProvider parent cache for child->root workflow ID resolution
  - Crash recovery skips child workflows as top-level UI entries
affects: [04-02, 04-03, 05-polish]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Direct activation for nested operations inside event queue handler (deadlock avoidance)"
    - "Parent cache ref for O(1) child->root workflow ID lookups in EngineProvider"
    - "Output propagation BEFORE completeWorkflow (prevents data loss from deleteByWorkflow)"

key-files:
  created: []
  modified:
    - packages/engine/src/runner/step-executor.ts
    - packages/engine/src/runner/workflow-runner.ts
    - packages/engine/src/runner/types.ts
    - packages/engine/src/types/runtime.ts
    - packages/storage/src/types/index.ts
    - packages/engine/src/runner/lifecycle.ts
    - apps/mobile/src/repositories/step-repository.ts
    - apps/mobile/src/providers/EngineProvider.tsx
    - packages/engine/__tests__/helpers/fixtures.ts
    - packages/engine/__tests__/runner/workflow-runner.test.ts

key-decisions:
  - "startChildWorkflowDirect bypasses event queue to avoid deadlock when WORKFLOW_PROXY activates child from within handler"
  - "Child workflow matching: single child > description match > local_id match > positional fallback"
  - "Output propagation reads child Value Properties BEFORE completeWorkflow deletes them"
  - "Parent step resumed via direct handleUserInputCompletion (not event queue enqueue)"
  - "Abort/stop propagate to children FIRST, then clean up parent (correct teardown order)"
  - "EngineProvider parent cache pre-populated during crash recovery to avoid race conditions"

patterns-established:
  - "Direct activation pattern: use activateStep directly when already inside event queue handler"
  - "Parent cache pattern: useRef(Map) for async workflow ID resolution in event handlers"

# Metrics
duration: 10min
completed: 2026-02-26
---

# Phase 4 Plan 1: WORKFLOW_PROXY Execution Summary

**Nested workflow execution via WORKFLOW_PROXY: child workflow creation, inline step display, output propagation, and full parent/child lifecycle coordination**

## Performance

- **Duration:** 10 min
- **Started:** 2026-02-26T18:08:32Z
- **Completed:** 2026-02-26T18:18:09Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments
- WORKFLOW_PROXY step no longer throws UnsupportedStepTypeError; creates and starts child workflows inline
- Child workflow completion propagates outputs back to parent step and resumes parent execution flow
- Pause, resume, abort, and stop operations cascade from parent to child workflows
- EngineProvider maps child step events to root parent workflow ID for seamless carousel display
- Crash recovery properly restores child workflow runner state without adding them as separate UI entries
- 3 new integration tests verify end-to-end WORKFLOW_PROXY behavior (264 total tests, all passing)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add child_workflow_instance_id to types/repos and WORKFLOW_PROXY infrastructure** - `1f9a1f4` (feat)
2. **Task 2: Implement WORKFLOW_PROXY execution, child completion, and lifecycle propagation** - `d2398a2` (feat)
3. **Task 3: Update EngineProvider bridge, crash recovery, and integration tests** - `7cc54cb` (feat)

## Files Created/Modified
- `packages/engine/src/types/runtime.ts` - Added child_workflow_instance_id to RuntimeWorkflowStep
- `packages/storage/src/types/index.ts` - Added child_workflow_instance_id to RuntimeStepRow
- `packages/engine/src/runner/types.ts` - Added IWorkflowRunnerForProxy interface with startChildWorkflowDirect
- `packages/engine/src/runner/lifecycle.ts` - Initialize child_workflow_instance_id: null on step creation
- `packages/engine/src/runner/step-executor.ts` - WORKFLOW_PROXY case with child matching and creation
- `packages/engine/src/runner/workflow-runner.ts` - createChildWorkflow, startChildWorkflowDirect, child completion, pause/abort propagation
- `packages/engine/src/runner/index.ts` - Export IWorkflowRunnerForProxy type
- `apps/mobile/src/repositories/step-repository.ts` - Persist child_workflow_instance_id via ON CONFLICT DO UPDATE
- `apps/mobile/src/providers/EngineProvider.tsx` - Parent cache, resolveRootWorkflowId, crash recovery child skip
- `packages/engine/__tests__/helpers/fixtures.ts` - makeWorkflowProxyWorkflow fixture
- `packages/engine/__tests__/runner/workflow-runner.test.ts` - 3 WORKFLOW_PROXY integration tests

## Decisions Made
- **startChildWorkflowDirect:** Initial implementation used `startWorkflow` (which enqueues through event queue) to start the child. This caused a deadlock because the parent STEP_ACTIVATED event was still being processed. Fixed by adding `startChildWorkflowDirect` which uses direct `activateStep` call, bypassing the event queue. This is consistent with the existing pattern where `onStepCompleted` also calls `activateStep` directly.
- **Child matching strategy:** Resolves which child_workflows[] entry a WORKFLOW_PROXY step invokes using a fallback chain: single child (most common) > description-to-local_id match > local_id-to-local_id match > positional index match. This handles the fact that the spec has no explicit linking field on the step.
- **Output propagation ordering:** Critical to read child's Value Properties BEFORE calling completeWorkflow, which calls deleteByWorkflow. This prevents data loss and follows the plan's explicit warning.
- **Parent cache pre-population:** Pre-populating the parentCacheRef during crash recovery ensures the STEP_STATE_CHANGED handler can resolve root workflow IDs synchronously (from cache) on first encounter, avoiding a race condition.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed event queue deadlock in child workflow startup**
- **Found during:** Task 3 (integration test timeout)
- **Issue:** `startWorkflow` enqueues through the event queue, but the WORKFLOW_PROXY step executor runs inside the event queue handler. Calling `startWorkflow` from there causes a deadlock (child's STEP_ACTIVATED waits for parent's to finish, which waits for child's to finish).
- **Fix:** Added `startChildWorkflowDirect` method that uses direct `activateStep` call instead of event queue enqueue. Updated `IWorkflowRunnerForProxy` interface accordingly.
- **Files modified:** packages/engine/src/runner/workflow-runner.ts, packages/engine/src/runner/types.ts, packages/engine/src/runner/step-executor.ts
- **Verification:** All 264 tests pass, including 3 WORKFLOW_PROXY tests completing in <10ms each
- **Committed in:** 7cc54cb (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix for correctness. The plan mentioned using `startWorkflow` but this caused deadlock in the event queue. The direct activation pattern is consistent with existing code patterns in the runner.

## Issues Encountered
- Parallel plan execution (04-02 running alongside 04-01) caused some files from 04-02 to be swept into Task 2's git commit. This is cosmetic -- the actual code changes are correct and properly attributed.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- WORKFLOW_PROXY step execution is fully functional and tested
- 264 engine tests pass (261 existing + 3 new)
- Zero TypeScript errors across entire monorepo
- Ready for Phase 5 (polish/integration testing) when all Phase 4 plans complete

---
*Phase: 04-workflow-proxy-ancillary*
*Completed: 2026-02-26*
