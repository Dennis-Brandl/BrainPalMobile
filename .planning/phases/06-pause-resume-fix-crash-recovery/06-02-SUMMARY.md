---
phase: 06-pause-resume-fix-crash-recovery
plan: 02
subsystem: engine
tags: [crash-recovery, isa88, state-machine, reactivation, workflow-proxy]

# Dependency graph
requires:
  - phase: 02-engine-core
    provides: "WorkflowRunner, crash-recovery, state machines, step executor"
  - phase: 04-workflow-proxy-ancillary
    provides: "WORKFLOW_PROXY step type and child workflow lifecycle"
  - phase: 06-01
    provides: "Pause/resume event gap fix with proper state transitions"
provides:
  - "RecoveredWorkflowData interface with runnerState + stepsToReactivate"
  - "WORKFLOW_PROXY stay-executing classification in crash recovery"
  - "WorkflowRunner.reactivateSteps() for resuming frozen automated steps"
  - "Simplified EngineProvider consuming RecoveryResult directly"
affects:
  - "07-ux-refresh-settings-about"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "RecoveredWorkflowData pattern: crash recovery returns full runner state + reactivation plan per workflow"
    - "Fire-and-forget reactivation: EngineProvider calls reactivateSteps() without blocking UI readiness"
    - "Priority-sorted reactivation: WAITING steps before EXECUTING before COMPLETING"

key-files:
  created: []
  modified:
    - "packages/engine/src/runner/types.ts"
    - "packages/engine/src/runner/crash-recovery.ts"
    - "packages/engine/src/runner/workflow-runner.ts"
    - "packages/engine/src/runner/index.ts"
    - "packages/engine/src/index.ts"
    - "packages/engine/__tests__/runner/crash-recovery.test.ts"
    - "apps/mobile/src/providers/EngineProvider.tsx"

key-decisions:
  - "RecoveredWorkflowData returned from crash-recovery.ts eliminates duplicated state reconstruction in EngineProvider"
  - "WORKFLOW_PROXY in EXECUTING classified as stay-executing (waits for child) not re-execute"
  - "reactivateSteps routes actions through event queue (reactivate) or direct helpers (re-execute, re-complete)"
  - "activateStep handles both IDLE and WAITING entry states for recovery reactivation"
  - "Fire-and-forget reactivation pattern: don't block UI readiness on automated step resumption"

patterns-established:
  - "RecoveredWorkflowData: crash recovery returns structured per-workflow data instead of ID strings"
  - "Priority-sorted reactivation: reactivate (0) < re-execute (1) < re-complete (2)"

# Metrics
duration: 7min
completed: 2026-03-01
---

# Phase 6 Plan 2: Crash Recovery for Automated Steps Summary

**Extended RecoveryResult with per-workflow runnerState and stepsToReactivate, added reactivateSteps() to WorkflowRunner, simplified EngineProvider recovery by ~35 lines**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-01T17:47:41Z
- **Completed:** 2026-03-01T17:55:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Extended RecoveryResult to return full RecoveredWorkflowData (runnerState + stepsToReactivate) per workflow
- Fixed WORKFLOW_PROXY in EXECUTING classified as stay-executing instead of re-execute (prevents child workflow double-start)
- Added WorkflowRunner.reactivateSteps() routing recovered steps to correct executor phase
- Simplified EngineProvider crash recovery from ~60 lines of manual state reconstruction to ~30 lines consuming RecoveryResult
- All 271 engine tests passing (264 original updated + 4 new crash recovery tests)

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend RecoveryResult, fix crash-recovery.ts, add reactivation to WorkflowRunner** - `9e26502` (feat)
2. **Task 2: Consume extended RecoveryResult in EngineProvider and add crash recovery tests** - `5f4c99f` (feat)

## Files Created/Modified
- `packages/engine/src/runner/types.ts` - Added RecoveredWorkflowData interface, changed RecoveryResult.recovered type
- `packages/engine/src/runner/crash-recovery.ts` - WORKFLOW_PROXY stay-executing fix, rich stepsToReactivate, priority sorting
- `packages/engine/src/runner/workflow-runner.ts` - reactivateSteps(), reactivateExecutingStep(), reactivateCompletingStep(), activateStep IDLE/WAITING handling
- `packages/engine/src/runner/index.ts` - Export RecoveredWorkflowData type
- `packages/engine/src/index.ts` - Export RecoveredWorkflowData type from engine barrel
- `packages/engine/__tests__/runner/crash-recovery.test.ts` - Updated all tests for RecoveredWorkflowData shape + 4 new tests
- `apps/mobile/src/providers/EngineProvider.tsx` - Simplified recovery consuming runnerState directly, calls reactivateSteps

## Decisions Made
- [06-02]: RecoveredWorkflowData returned from crash-recovery.ts eliminates duplicated state reconstruction in EngineProvider
- [06-02]: WORKFLOW_PROXY in EXECUTING classified as stay-executing (waits for child) not re-execute
- [06-02]: reactivateSteps routes actions through event queue (reactivate) or direct helpers (re-execute, re-complete)
- [06-02]: activateStep handles both IDLE and WAITING entry states for recovery reactivation
- [06-02]: Fire-and-forget reactivation pattern avoids blocking UI readiness on automated step resumption

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Crash recovery for automated steps complete -- E2E Flow 5 (App crash -> Restart -> Resume) now covers all step types
- Phase 6 complete (2/2 plans): pause/resume event gap fixed and crash recovery extended
- Ready for Phase 7 (UX Refresh / Settings / About)

---
*Phase: 06-pause-resume-fix-crash-recovery*
*Completed: 2026-03-01*
