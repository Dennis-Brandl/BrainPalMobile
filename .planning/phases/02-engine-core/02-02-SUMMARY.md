---
phase: 02-engine-core
plan: 02
subsystem: engine
tags: [isa-88, state-machine, scheduler, dag, parallel, wait-all, wait-any]

# Dependency graph
requires:
  - phase: 02-01
    provides: StepState, StateEvent, StepType, ACTIVE_STATES types and runtime types
provides:
  - Generic table-driven StateMachine<S,E> class with send(), getState(), canSend()
  - ISA88_OBSERVABLE_TRANSITIONS (19 rules) and ISA88_OPAQUE_TRANSITIONS (11 rules)
  - InvalidTransitionError for illegal state transitions
  - Scheduler class with buildAdjacencyLists(), getNextSteps(), getParallelBranchSteps()
affects: [02-05 workflow-runner, 02-03 parameter-resolver]

# Tech tracking
tech-stack:
  added: []
  patterns: [table-driven state machine with wildcard guards, DAG adjacency list scheduling]

key-files:
  created:
    - packages/engine/src/state-machine/types.ts
    - packages/engine/src/state-machine/state-machine.ts
    - packages/engine/src/state-machine/isa88-config.ts
    - packages/engine/src/state-machine/index.ts
    - packages/engine/src/scheduler/types.ts
    - packages/engine/src/scheduler/scheduler.ts
    - packages/engine/src/scheduler/index.ts
    - packages/engine/__tests__/state-machine/state-machine.test.ts
    - packages/engine/__tests__/state-machine/isa88-transitions.test.ts
    - packages/engine/__tests__/scheduler/scheduler.test.ts
  modified:
    - packages/engine/src/index.ts

key-decisions:
  - "Wildcard *_ACTIVE matching uses guard function checking ACTIVE_STATES set -- keeps transition table as pure data"
  - "Scheduler checks target step_state for WAIT_ANY idempotency (only activates if IDLE) -- prevents double-activation race condition"

patterns-established:
  - "Table-driven state machine: transition rules as data arrays, not switch/case code"
  - "Adjacency list pair (outgoing + incoming) built once per workflow, reused for all scheduling decisions"

# Metrics
duration: 6min
completed: 2026-02-25
---

# Phase 2 Plan 2: State Machine & Scheduler Summary

**Generic table-driven ISA-88 state machine (19 observable + 11 opaque transition rules) and DAG scheduler with PARALLEL fork, WAIT ALL, WAIT ANY join logic**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-25T18:27:48Z
- **Completed:** 2026-02-25T18:33:39Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Generic StateMachine<S,E> class that works with any state/event type combination
- Complete ISA-88 observable transition table: happy path, PAUSE/RESUME, HOLD/UNHOLD, ABORT from any active state, STOP from any active state, CLEAR after ABORT
- Complete ISA-88 opaque transition table: POSTED->RECEIVED->IN_PROGRESS, ABORT, STOP, CLEAR
- Scheduler handles linear flow, PARALLEL forks (activate all branches), WAIT_ALL (all predecessors must complete), WAIT_ANY (first predecessor triggers, no double-activate)
- 73 new tests (50 state machine + 23 scheduler), all passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement table-driven state machine with ISA-88 transition tables** - `6beb283` (feat)
2. **Task 2: Implement DAG-based scheduler** - scheduler code already committed in prior session as part of `2e1ab24`; index exports added in `001fbcc` (feat)

**Plan metadata:** pending

## Files Created/Modified
- `packages/engine/src/state-machine/types.ts` - StateTransitionRule, StateMachineConfig, StepContext types
- `packages/engine/src/state-machine/state-machine.ts` - Generic StateMachine<S,E> class with send(), getState(), canSend()
- `packages/engine/src/state-machine/isa88-config.ts` - ISA88_OBSERVABLE_TRANSITIONS (19 rules) and ISA88_OPAQUE_TRANSITIONS (11 rules)
- `packages/engine/src/state-machine/index.ts` - Barrel export
- `packages/engine/src/scheduler/types.ts` - AdjacencyList, SchedulerContext types
- `packages/engine/src/scheduler/scheduler.ts` - Scheduler class with buildAdjacencyLists(), getNextSteps(), getParallelBranchSteps()
- `packages/engine/src/scheduler/index.ts` - Barrel export
- `packages/engine/src/index.ts` - Added state machine and scheduler exports to public API
- `packages/engine/__tests__/state-machine/state-machine.test.ts` - 13 generic state machine tests
- `packages/engine/__tests__/state-machine/isa88-transitions.test.ts` - 37 ISA-88 transition tests (observable + opaque)
- `packages/engine/__tests__/scheduler/scheduler.test.ts` - 23 scheduler tests

## Decisions Made
- Wildcard `*_ACTIVE` matching uses guard function that checks the ACTIVE_STATES set -- keeps transition table as pure data without embedding state references in the matching logic
- Scheduler checks target step_state for WAIT_ANY idempotency (only activates if step is IDLE) -- prevents double-activation when multiple branches complete
- StateMachine.send() accepts optional Partial<StepContext> -- the machine fills in currentState automatically, callers only pass extra context if guards need it

## Deviations from Plan

None - plan executed exactly as written.

Note: The scheduler source files were found to be already committed in a prior session (commit `2e1ab24` for plan 02-03). The implementation matches the plan specification exactly. Only the engine index.ts exports needed to be added.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- State machine and scheduler are the execution backbone for WorkflowRunner (Plan 02-05)
- Parameter resolver and condition evaluator (Plan 02-03) already implemented in prior session
- Ready for import pipeline (Plan 02-04) and workflow runner (Plan 02-05)

---
*Phase: 02-engine-core*
*Completed: 2026-02-25*
