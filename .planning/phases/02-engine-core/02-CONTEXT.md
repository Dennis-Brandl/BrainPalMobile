# Phase 2: Engine Core - Context

**Gathered:** 2026-02-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Pure TypeScript workflow execution engine that imports .WFmasterX and .WFlibX packages, creates runtime workflow instances, and executes them step-by-step through the ISA-88 state machine with scheduling, parameter resolution, condition evaluation, and crash recovery. All verified by automated tests without any UI. The engine package has no platform dependencies — testable in Node.js.

</domain>

<decisions>
## Implementation Decisions

### Import pipeline behavior
- Support both .WFmasterX (single workflow) and .WFlibX (multi-workflow library) package formats
- Strict validation: any validation failure (corrupt ZIP, wrong schema version, missing referenced files) rejects the entire package with a clear error message — no partial imports
- Version replacement: importing a newer version of the same package replaces the old master spec; active runtime workflows created from the old version continue running with their deep-copied data until completion
- Deletion with active instances: warn the user listing active runtime instances, then cascade (abort all active instances and delete everything) if user confirms

### Crash recovery semantics
- Resume from persisted state exactly — reload whatever was written to SQLite via write-ahead semantics
- Steps in active engine states (EXECUTING, COMPLETING) at crash time: Claude's discretion on whether to re-enter or roll back, based on ISA-88 semantics and safety per state
- Stale workflow detection: flag workflows as stale after a threshold period (Claude picks sensible default). User can choose to resume or abort stale workflows. Engine always supports resuming regardless of age.

### Execution logging scope
- Log everything unconditionally: state transitions, parameter reads/writes, condition evaluations, scheduler decisions, resource acquisition/release, and internal engine events
- Always write all events to SQLite — no configurable verbosity levels
- Each log entry captures: event type, previous state, new state, timestamp, and related data (full before/after audit trail)
- Capture user interaction form data (field values entered by user) in log entries — PDF reports should show actual responses, not just "step completed"

### Claude's Discretion
- Crash recovery: handling of steps in intermediate engine states (re-enter vs roll back per state)
- Stale workflow threshold duration (sensible default, possibly configurable later)
- Event bus architecture and internal event taxonomy
- Test strategy (unit vs integration, real packages vs synthetic data)
- Engine component interfaces and dependency injection patterns

</decisions>

<specifics>
## Specific Ideas

- Engine must be pure TypeScript with no platform dependencies (testable in Node.js)
- Follows BrainPal MD's existing data model with Managed Elements using Snowflake OIDs
- ISA-88 batch control semantics from the StateMachineSpec
- Execution log entries should be rich enough that Phase 5 PDF export can produce a complete audit report showing every step, decision, parameter value, and user response

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-engine-core*
*Context gathered: 2026-02-25*
