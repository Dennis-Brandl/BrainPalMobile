---
phase: 03-execution-ui
plan: 01
subsystem: engine-integration
tags: [sqlite, zustand, react-context, workflow-runner, crash-recovery, event-bus, repository-pattern]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: SQLite schema, WriteQueue, StoreInitializer pattern, Zustand stores
  - phase: 02-engine-core
    provides: WorkflowRunner, EngineEventBus, repository interfaces (12), crash recovery, ISA-88 state machine
provides:
  - SQLite implementations of all 12 engine repository interfaces
  - EngineProvider React context with WorkflowRunner instance
  - Execution Zustand store bridging EngineEventBus to React components
  - Crash recovery wiring on app startup
  - Runtime workflow tracking in workflow store
affects: [03-02-step-renderer, 03-03-workflow-lifecycle-ui, 03-04-integration-test]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Repository pattern: SQLite repos implement engine interfaces, injected via EngineProvider"
    - "Event-driven store: Zustand store subscribes to EngineEventBus for reactive UI updates"
    - "Active step derivation: STEP_STATE_CHANGED events + step type cache determine user-facing steps"
    - "Crash recovery: recoverWorkflows runs on mount, restores runner state from persisted SQLite data"

key-files:
  created:
    - apps/mobile/src/repositories/master-workflow-repository.ts
    - apps/mobile/src/repositories/master-environment-repository.ts
    - apps/mobile/src/repositories/master-action-repository.ts
    - apps/mobile/src/repositories/image-repository.ts
    - apps/mobile/src/repositories/workflow-repository.ts
    - apps/mobile/src/repositories/step-repository.ts
    - apps/mobile/src/repositories/connection-repository.ts
    - apps/mobile/src/repositories/value-property-repository.ts
    - apps/mobile/src/repositories/resource-pool-repository.ts
    - apps/mobile/src/repositories/resource-queue-repository.ts
    - apps/mobile/src/repositories/sync-barrier-repository.ts
    - apps/mobile/src/repositories/execution-logger-repository.ts
    - apps/mobile/src/repositories/id-generator.ts
    - apps/mobile/src/repositories/index.ts
    - apps/mobile/src/stores/execution-store.ts
    - apps/mobile/src/providers/EngineProvider.tsx
  modified:
    - packages/storage/src/database/schema.ts
    - packages/storage/src/types/index.ts
    - apps/mobile/src/stores/workflow-store.ts
    - apps/mobile/src/providers/StoreInitializer.tsx
    - apps/mobile/app/_layout.tsx

key-decisions:
  - "SyncBarrier uses SQLite auto-increment id cast to string as engine entry ID"
  - "Active steps derived from STEP_STATE_CHANGED events with step type cache, not ACTIVE_STEPS_CHANGED event"
  - "EngineProvider uses useRef for runner/eventBus/config to create instances once, not on every render"
  - "Crash recovery rebuilds WorkflowRunnerState with static imports of Scheduler/StateMachine"

patterns-established:
  - "Repository construction: all repos take SQLiteDatabase in constructor, EngineProvider creates them all"
  - "Event bus subscription pattern: EngineProvider subscribes on mount, stores unsubscribers for cleanup"
  - "Step type caching: execution store caches stepInstanceId -> stepType to avoid repeated DB queries"
  - "Runtime workflow summary: workflow store tracks active runtime workflows alongside master workflows"

# Metrics
duration: 8min
completed: 2026-02-25
---

# Phase 3 Plan 1: Engine-to-UI Bridge Summary

**All 12 engine repository interfaces implemented with SQLite, EngineProvider wiring WorkflowRunner via React context, and execution Zustand store bridging EngineEventBus to reactive components with crash recovery on startup**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-25T20:12:19Z
- **Completed:** 2026-02-25T20:20:19Z
- **Tasks:** 3
- **Files modified:** 21

## Accomplishments
- All 12 engine repository interfaces (4 master, 7 runtime, 1 logger) implemented with SQLite using expo-sqlite v16 API patterns
- EngineProvider creates WorkflowRunner with full RunnerConfig and provides it to component tree via React context
- Execution store subscribes to EngineEventBus for WORKFLOW_STARTED/COMPLETED/ABORTED/STOPPED and STEP_STATE_CHANGED events with active step derivation
- Crash recovery runs on app mount, restoring recovered workflows into both runner state and execution store
- Schema fixed to include last_activity_at column in runtime_workflows table
- Workflow store extended with runtime workflow tracking (add/remove/updateState)
- App boots successfully with new provider nesting: SQLiteProvider -> StoreInitializer -> EngineProvider -> Stack

## Task Commits

Each task was committed atomically:

1. **Task 1a: Schema fix, row types, master + utility repos** - `b6eef46` (feat)
2. **Task 1b: Runtime SQLite repository implementations** - `28a3345` (feat)
3. **Task 2: EngineProvider, execution store, crash recovery** - `4d26485` (feat)

## Files Created/Modified

### Created
- `apps/mobile/src/repositories/master-workflow-repository.ts` - IMasterWorkflowRepository SQLite implementation
- `apps/mobile/src/repositories/master-environment-repository.ts` - IMasterEnvironmentRepository SQLite implementation
- `apps/mobile/src/repositories/master-action-repository.ts` - IMasterActionRepository SQLite implementation
- `apps/mobile/src/repositories/image-repository.ts` - IImageRepository SQLite implementation with BLOB storage
- `apps/mobile/src/repositories/workflow-repository.ts` - IWorkflowRepository SQLite implementation (getById, save, getActive, etc.)
- `apps/mobile/src/repositories/step-repository.ts` - IStepRepository SQLite implementation (getByWorkflow, save, saveMany, etc.)
- `apps/mobile/src/repositories/connection-repository.ts` - IConnectionRepository SQLite implementation
- `apps/mobile/src/repositories/value-property-repository.ts` - IValuePropertyRepository SQLite implementation (workflow + environment scope)
- `apps/mobile/src/repositories/resource-pool-repository.ts` - IResourcePoolRepository SQLite implementation
- `apps/mobile/src/repositories/resource-queue-repository.ts` - IResourceQueueRepository SQLite implementation with FIFO dequeue
- `apps/mobile/src/repositories/sync-barrier-repository.ts` - ISyncBarrierRepository SQLite implementation using auto-increment id as string
- `apps/mobile/src/repositories/execution-logger-repository.ts` - IExecutionLogger SQLite implementation
- `apps/mobile/src/repositories/id-generator.ts` - IIdGenerator using crypto.randomUUID()
- `apps/mobile/src/repositories/index.ts` - Barrel export of all repository classes
- `apps/mobile/src/stores/execution-store.ts` - Zustand store bridging EngineEventBus to React
- `apps/mobile/src/providers/EngineProvider.tsx` - React context providing WorkflowRunner + crash recovery

### Modified
- `packages/storage/src/database/schema.ts` - Added last_activity_at TEXT column to runtime_workflows
- `packages/storage/src/types/index.ts` - Added all runtime row types (RuntimeWorkflowRow, RuntimeStepRow, etc.)
- `apps/mobile/src/stores/workflow-store.ts` - Added RuntimeWorkflowSummary tracking and runtime workflow mutations
- `apps/mobile/src/providers/StoreInitializer.tsx` - Added execution store loading to Promise.all
- `apps/mobile/app/_layout.tsx` - Added EngineProvider wrapping inside StoreInitializer

## Decisions Made
- **SyncBarrier ID mapping:** SQLite auto-increment id cast to string serves as the engine's SyncBarrierEntry.id, avoiding schema modifications. The `match()` method parses it back to int for the WHERE clause.
- **Active step derivation:** Rather than relying on the ACTIVE_STEPS_CHANGED event (defined but never emitted by the engine), active steps are derived from STEP_STATE_CHANGED events by checking if `toState === 'EXECUTING'` and `stepType` is USER_INTERACTION or YES_NO.
- **Step type caching:** The execution store caches stepInstanceId -> stepType to avoid querying SQLite on every STEP_STATE_CHANGED event. The cache is populated on first query.
- **Static imports for crash recovery:** Used static imports of Scheduler, StateMachine, ISA88_OBSERVABLE_TRANSITIONS instead of dynamic import() to preserve TypeScript generic type parameters.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- **TypeScript generics lost in dynamic import:** Initial implementation used `await import('@brainpal/engine')` for crash recovery rebuild, but this lost `StateMachine<StepState, StateEvent>` generic parameters (defaulting to `StateMachine<string, string>`). Fixed by using static imports at the top of the file.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- EngineProvider is ready for all subsequent Phase 3 UI plans to consume via `useEngine()` hook
- Execution store is ready for step renderer (03-02) to read active steps and step states
- All repository implementations are tested via TypeScript compilation against engine interface contracts
- App boots cleanly with the full provider chain

---
*Phase: 03-execution-ui*
*Completed: 2026-02-25*
