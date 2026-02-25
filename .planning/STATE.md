# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-24)

**Core value:** Users can import a workflow package and execute it step-by-step on any platform -- the execution engine must faithfully walk the workflow graph, render forms correctly, handle branching/resources/nesting, and persist state across crashes.
**Current focus:** Phase 2: Engine Core

## Current Position

Phase: 2 of 5 (Engine Core)
Plan: 4 of 5 in current phase
Status: In progress
Last activity: 2026-02-25 -- Completed 02-04-PLAN.md

Progress: [##########..........] 7/8 Plans (Phase 1: 3/3, Phase 2: 4/5)

## Performance Metrics

**Velocity:**
- Total plans completed: 7
- Average duration: 5.1 min
- Total execution time: 0.60 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 3/3 | 13 min | 4.3 min |
| 02-engine-core | 4/5 | 23 min | 5.8 min |

**Recent Trend:**
- Last 5 plans: 02-01 (7 min), 02-02 (6 min), 02-03 (5 min), 02-04 (5 min)
- Trend: stable

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

### Pending Todos

None.

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-02-25T18:36:33Z
Stopped at: Completed 02-04-PLAN.md
Resume file: None
