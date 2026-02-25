---
phase: 02-engine-core
plan: 01
subsystem: engine
tags: [typescript, types, interfaces, events, vitest, dependency-injection, event-bus, event-queue]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: monorepo structure with @brainpal/engine package stub
provides:
  - Complete TypeScript data model types for all master and runtime entities
  - Repository interfaces for dependency injection (11 interfaces)
  - Typed event bus (EngineEventBus) and serial async event queue (EngineEventQueue)
  - In-memory mock repositories for all interfaces
  - Test fixtures for linear, parallel, and branching workflows
  - Vitest configuration for engine package
affects: [02-02, 02-03, 02-04, 02-05, 03-ui-shell]

# Tech tracking
tech-stack:
  added: [vitest@4.0.18, @vitest/coverage-v8]
  patterns: [interface-based DI, typed event bus, serial async queue, discriminated union events]

key-files:
  created:
    - packages/engine/vitest.config.ts
    - packages/engine/src/types/master.ts
    - packages/engine/src/types/runtime.ts
    - packages/engine/src/types/common.ts
    - packages/engine/src/types/events.ts
    - packages/engine/src/types/index.ts
    - packages/engine/src/interfaces/storage.ts
    - packages/engine/src/interfaces/logger.ts
    - packages/engine/src/interfaces/id-generator.ts
    - packages/engine/src/interfaces/index.ts
    - packages/engine/src/events/event-bus.ts
    - packages/engine/src/events/event-queue.ts
    - packages/engine/src/events/index.ts
    - packages/engine/__tests__/helpers/mock-repositories.ts
    - packages/engine/__tests__/helpers/fixtures.ts
    - packages/engine/__tests__/helpers/test-utils.ts
    - packages/engine/__tests__/events/event-bus.test.ts
    - packages/engine/__tests__/events/event-queue.test.ts
  modified:
    - packages/engine/package.json
    - packages/engine/tsconfig.json
    - packages/engine/src/index.ts
    - package.json
    - package-lock.json

key-decisions:
  - "StepType uses underscored names (ACTION_PROXY, SELECT_1) with SPEC_STEP_TYPE_MAP for import normalization from spec names with spaces"
  - "Runtime types use JSON string fields (step_json, specification_json) matching SQLite storage pattern for crash recovery"
  - "EngineEvent is both a discriminated union (for queue) and EngineEventMap (for typed bus) -- dual representation"
  - "PackageImage type uses Uint8Array for binary image data (compatible with fflate output)"

patterns-established:
  - "Interface-based DI: engine defines interfaces, platform implements them"
  - "Typed event bus: Map<string, Set<Function>> with generic on/emit"
  - "Serial async queue: FIFO with promise-per-event for race condition prevention"
  - "Test context: createTestContext() returns all mocks in one call"
  - "Test fixtures: makeLinearWorkflow/makeParallelWorkflow/makeSelect1Workflow"

# Metrics
duration: 7min
completed: 2026-02-25
---

# Phase 2 Plan 01: Engine Foundation Summary

**Complete TypeScript type system for BrainPal data model with 11 repository interfaces, typed event bus, serial async event queue, and Vitest test infrastructure**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-25T18:13:45Z
- **Completed:** 2026-02-25T18:20:39Z
- **Tasks:** 2/2
- **Files modified:** 22

## Accomplishments

- Complete data model types covering all master (read-only) and runtime (mutable) entities from DataModelSpec.md, StateMachineSpec.md, and ExecutionEngineSpec.md
- 11 repository interfaces with async Promise methods defining the engine's storage contract without any platform imports
- Typed EngineEventBus with subscribe/emit/removeAllListeners and EngineEventQueue with serial FIFO processing
- In-memory mock implementations of all interfaces for testing, plus workflow fixture factories
- 12 passing tests verifying event bus behavior and event queue serial processing

## Task Commits

Each task was committed atomically:

1. **Task 1: Create engine types, interfaces, and Vitest configuration** - `4f248bf` (feat)
2. **Task 2: Create event bus, event queue, mock repositories, and tests** - `6b9f281` (feat)

## Files Created/Modified

- `packages/engine/vitest.config.ts` - Vitest config with Node.js env and v8 coverage
- `packages/engine/src/types/common.ts` - StepState, StepType, WorkflowState, ComparisonOperator, ACTIVE_STATES, SPEC_STEP_TYPE_MAP
- `packages/engine/src/types/master.ts` - MasterWorkflowSpecification, MasterWorkflowStep, ParameterSpecification, and all master entity types
- `packages/engine/src/types/runtime.ts` - RuntimeWorkflow, RuntimeWorkflowStep, WorkflowConnection, RuntimeValueProperty, ResourcePool, SyncBarrierEntry
- `packages/engine/src/types/events.ts` - EngineEventMap, EngineEvent discriminated union, LogEventType, ExecutionLogEntry
- `packages/engine/src/types/index.ts` - Barrel re-export of all types
- `packages/engine/src/interfaces/storage.ts` - IMasterWorkflowRepository, IWorkflowRepository, IStepRepository, IConnectionRepository, IValuePropertyRepository, IResourcePoolRepository, IResourceQueueRepository, ISyncBarrierRepository, IImageRepository
- `packages/engine/src/interfaces/logger.ts` - IExecutionLogger interface
- `packages/engine/src/interfaces/id-generator.ts` - IIdGenerator interface
- `packages/engine/src/interfaces/index.ts` - Barrel re-export
- `packages/engine/src/events/event-bus.ts` - EngineEventBus class with typed pub/sub
- `packages/engine/src/events/event-queue.ts` - EngineEventQueue with serial async FIFO processing
- `packages/engine/src/events/index.ts` - Events barrel
- `packages/engine/src/index.ts` - Public API surface exporting all types, interfaces, and events
- `packages/engine/__tests__/helpers/mock-repositories.ts` - InMemory implementations of all 11 repository interfaces + TestIdGenerator
- `packages/engine/__tests__/helpers/fixtures.ts` - makeLinearWorkflow, makeParallelWorkflow, makeSelect1Workflow
- `packages/engine/__tests__/helpers/test-utils.ts` - createTestContext, waitForEvent, drainQueue
- `packages/engine/__tests__/events/event-bus.test.ts` - 6 tests for event bus
- `packages/engine/__tests__/events/event-queue.test.ts` - 6 tests for event queue

## Decisions Made

- **StepType normalization:** Used underscored names (ACTION_PROXY, SELECT_1, WAIT_ALL) with a SPEC_STEP_TYPE_MAP lookup for converting from spec format names that contain spaces. This keeps TypeScript union types clean while supporting the spec's naming conventions during import.
- **Dual event representation:** EngineEventMap maps event names to typed payloads (for the bus), while EngineEvent is a discriminated union with a `type` field (for the queue). Both representations exist because the bus needs generic key-based typing and the queue needs a single union type.
- **Runtime JSON string fields:** RuntimeWorkflow.specification_json and RuntimeWorkflowStep.step_json store deep-copied master specs as JSON strings, matching the SQLite storage pattern and enabling crash recovery by re-parsing from persisted state.
- **PackageImage with Uint8Array:** Image binary data uses Uint8Array which is compatible with fflate ZIP extraction output (plan 02-04 scope).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All types and interfaces are ready for use by plans 02-02 through 02-05
- Mock repositories pass type checks against all interfaces
- Test fixtures create well-formed workflow specs for state machine, scheduler, and condition evaluator tests
- Event bus and queue are tested and ready for integration into WorkflowRunner

---
*Phase: 02-engine-core*
*Completed: 2026-02-25*
