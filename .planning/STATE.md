# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-24)

**Core value:** Users can import a workflow package and execute it step-by-step on any platform -- the execution engine must faithfully walk the workflow graph, render forms correctly, handle branching/resources/nesting, and persist state across crashes.
**Current focus:** Phase 5: Polish & Integration Testing

## Current Position

Phase: 4 of 5 (Workflow Proxy + Ancillary Features)
Plan: 3 of 3 in current phase
Status: Phase 4 complete
Last activity: 2026-02-26 -- Completed 04-01-PLAN.md (WORKFLOW_PROXY Execution)

Progress: [####################] 15/15 Plans (4/5 Phases complete, Phase 4 complete)

## Performance Metrics

**Velocity:**
- Total plans completed: 15
- Average duration: 5.5 min
- Total execution time: 1.40 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 3/3 | 13 min | 4.3 min |
| 02-engine-core | 5/5 | 35 min | 7.0 min |
| 03-execution-ui | 4/4 | 22 min | 5.5 min |
| 04-workflow-proxy-ancillary | 3/3 | 20 min | 6.7 min |

**Recent Trend:**
- Last 5 plans: 03-03 (5 min), 03-04 (4 min), 04-03 (6 min), 04-02 (4 min), 04-01 (10 min)
- Trend: stable (04-01 slightly longer due to complex nested workflow execution)

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: 5-phase delivery structure derived from requirement dependencies and research
- [Roadmap]: Foundation phase front-loads all 4 critical infrastructure pitfalls (Metro resolution, transaction scope, Zustand/SQLite desync, web platform divergence)
- [Roadmap]: Engine built and tested in isolation (Phase 2) before any UI work (Phase 3)
- [Roadmap]: Workflow Proxy deferred to Phase 4 since it depends on all other engine subsystems being proven
- [01-01]: react-native@0.81.5 required by Expo SDK 54.0.33 (not 0.81.0 from research)
- [01-01]: TypeScript ~5.9.2 required by Expo SDK 54 (not ~5.8.0 from research)
- [01-01]: Shared packages point main/types at src/index.ts directly (Metro resolves .ts in dev)
- [01-01]: @expo/vector-icons v15 is SDK 54 default (not v14)
- [01-02]: withExclusiveTransactionAsync returns Promise<void>, WriteQueue captures result via closure
- [01-02]: react-native added as peerDependency to @brainpal/storage for Platform import
- [01-02]: SCHEMA_SQL and SEED_SQL internal only (not exported from @brainpal/storage public API)
- [01-03]: StoreInitializer loads both stores in parallel via Promise.all for faster startup
- [01-03]: Environment store setProperty uses WriteQueue.execute wrapping writeAhead for serialized write-ahead semantics
- [01-03]: Workflow store is read-only in Phase 1 (mutations come in Phase 2 import pipeline)
- [02-01]: StepType uses underscored names with SPEC_STEP_TYPE_MAP for import normalization from spec names with spaces
- [02-01]: Runtime types use JSON string fields (step_json, specification_json) matching SQLite storage pattern
- [02-01]: EngineEvent is both a discriminated union (for queue) and EngineEventMap (for typed bus)
- [02-01]: PackageImage uses Uint8Array for binary image data (compatible with fflate output)
- [02-02]: Wildcard *_ACTIVE matching uses guard function checking ACTIVE_STATES set -- keeps transition table as pure data
- [02-02]: Scheduler checks target step_state for WAIT_ANY idempotency (only activates if IDLE) -- prevents double-activation
- [02-03]: Property reference parsing uses dot notation (PropertyName.EntryName) with 'Value' as default entry name
- [02-03]: ConditionEvaluator exported as both pure functions and class for injection flexibility
- [02-03]: ResourceManager requires IIdGenerator for SYNC barrier entry IDs
- [02-03]: acquireAll stops on first failure to prevent partial acquisition deadlocks
- [02-04]: fflate is the only runtime dependency for engine -- pure JS, zero deps, works in Node.js + React Native
- [02-04]: All-or-nothing validation: extractPackage() validates everything in memory before any storage writes
- [02-04]: Image filenames strip images/ prefix when stored (step1-photo.png not images/step1-photo.png)
- [02-04]: Environments associated by workflowOid from manifest; actions keyed by their own OID
- [02-05]: All step state changes routed through EngineEventQueue for serial processing (prevents parallel branch race conditions)
- [02-05]: SELECT_1 stores matchedConnectionId in resolved_outputs_json for branch routing
- [02-05]: Crash recovery creates StateMachine at persisted state (not replaying from IDLE)
- [02-05]: Stale workflow threshold is 24 hours; stale workflows returned separately for UI prompt
- [02-05]: Unsupported step types (WORKFLOW_PROXY, ACTION_PROXY, SCRIPT) throw UnsupportedStepTypeError
- [03-01]: SyncBarrier uses SQLite auto-increment id cast to string as engine entry ID
- [03-01]: Active steps derived from STEP_STATE_CHANGED events with step type cache, not ACTIVE_STEPS_CHANGED event
- [03-01]: EngineProvider uses useRef for runner/eventBus/config to create instances once
- [03-01]: Crash recovery rebuilds WorkflowRunnerState with static imports of Scheduler/StateMachine
- [03-02]: stepCount derived during rowToWorkflow by parsing specification_json steps array length
- [03-02]: getSpecificationJson as standalone export (not store method) since it needs db arg and doesn't modify state
- [03-02]: Expo Router dynamic route paths cast via 'as Href' for typed routes before generation
- [03-02]: Execution screen placeholder created for navigation target (full implementation in 03-03)
- [03-03]: FormElementSpec type extended with string intersection for unknown type fallback
- [03-03]: Form field key derived from element.content.plainText (shared key for formData)
- [03-03]: SelectElement uses modal picker for v1 (no native Picker dependency)
- [03-03]: DatePickerElement uses text input with format hint for v1 (no expo-date-picker)
- [03-04]: useActiveSteps batch queries SQLite with IN clause (not per-step) for performance
- [03-04]: Form data stored in carousel-level Record per stepInstanceId to persist across swipes
- [03-04]: StateControls uses Modal overlay for dropdown menu (v1, no third-party popover)
- [03-04]: Terminal workflow states auto-navigate back after 2s delay
- [03-04]: STOPPED state shows only Abort in menu (Resume-from-STOPPED deferred)
- [04-03]: TIMEOUT preference hidden from Settings UI since engine has no TIMEOUT event in EngineEventMap
- [04-03]: channelId goes on trigger object (not content) per expo-notifications SDK 54 types
- [04-03]: Router parameter typed as { push: (href: any) => void } for expo-router typed routes compatibility
- [04-03]: Web notifications only fire when document.hidden (tab backgrounded) -- no in-app toast for v1
- [04-03]: Notification event handlers use fire-and-forget pattern to avoid blocking engine
- [04-02]: Duration formatting helper is module-private (not exported) -- only needed by history hooks
- [04-02]: Audit trail color-codes event types: blue=state, green=param, orange=user, red=error, gray=other
- [04-02]: History detail derives overall state from step states rather than separate workflow query
- [04-02]: Delete order: execution_log_entries first (no CASCADE FK), then child workflows, then parent
- [04-01]: startChildWorkflowDirect bypasses event queue to avoid deadlock during WORKFLOW_PROXY child startup
- [04-01]: Child workflow matching: single child > description match > local_id match > positional fallback
- [04-01]: Output propagation reads child Value Properties BEFORE completeWorkflow deletes them
- [04-01]: Parent step resumed via direct handleUserInputCompletion (not event queue enqueue)
- [04-01]: Abort/stop propagate to children FIRST, then clean up parent (correct teardown order)
- [04-01]: EngineProvider parent cache pre-populated during crash recovery to avoid race conditions
- [04-phase]: No engine-level timeouts -- workflows are long-lived (days/weeks); timeouts come from Environment Actions (future v2 scope)

### Pending Todos

None.

### Blockers/Concerns

None.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 001 | Wire engine EventBus to execution store (race condition fix) | 2026-02-25 | a10a55a | [001-wire-engine-eventbus-to-execution-store](./quick/001-wire-engine-eventbus-to-execution-store/) |
| 002 | Fix INSERT OR REPLACE cascade deletion of steps/connections | 2026-02-25 | 3f9990c | inline fix (no plan needed) |

## Session Continuity

Last session: 2026-02-26
Stopped at: Completed 04-01-PLAN.md (WORKFLOW_PROXY Execution). All Phase 4 plans complete. Ready for Phase 5.
Resume file: None
