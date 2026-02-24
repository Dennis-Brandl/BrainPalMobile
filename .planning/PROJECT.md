# BrainPal Mobile

## What This Is

BrainPal Mobile is a cross-platform runtime workflow execution engine that consumes Master Workflow Specifications created by BrainPal MD (a visual workflow specification editor). It imports .WFmasterX workflow packages, creates runtime workflow instances, and executes them step-by-step — displaying WYSIWYG user interaction forms, managing parallel branches and conditional logic, and tracking execution history with full audit trails. Built with React Native + Expo for Android, iOS, and web (Docker/Windows).

## Core Value

Users can import a workflow package and execute it step-by-step on any platform — the execution engine must faithfully walk the workflow graph, render forms correctly, handle branching/resources/nesting, and persist state across crashes.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Import .WFmasterX packages from device storage and extract workflows, environments, actions, and images into SQLite
- [ ] Display downloaded workflows and active workflow instances on the Home screen
- [ ] Create a Runtime Workflow as a deep copy of a Master Workflow Specification and begin execution
- [ ] Implement the ISA-88 state machine for Runtime Workflow Steps (observable track: IDLE through COMPLETED, with PAUSE/RESUME, HOLD/UNHOLD, ABORT/STOP/CLEAR)
- [ ] Implement the Scheduler — determine next steps from the workflow graph, handle PARALLEL fork, WAIT ALL join, WAIT ANY join
- [ ] Implement the Resource Manager — FIFO acquisition queues, deadlock prevention (alphabetical order), SYNC barriers (Synchronize/Send/Receive)
- [ ] Implement the Parameter Resolver — resolve input parameters (literal and property lookups), write output parameters to Value Properties (workflow and environment scope)
- [ ] Implement the Condition Evaluator — evaluate SELECT 1 conditions using all 10 comparison operators
- [ ] Implement Workflow Proxy steps — create and execute child workflows, propagate output parameters to parent
- [ ] Render WYSIWYG user interaction forms from form_layout_config with device-type selection (phone/tablet/desktop), absolute positioning, and canvas scaling
- [ ] Implement the step carousel — Previous/Next navigation through active user interaction steps with wrap-around behavior
- [ ] Implement Yes/No steps with custom labels and output values
- [ ] Support user-triggered state controls: PAUSE, RESUME, STOP, ABORT, CLEAR from the execution UI
- [ ] Persist all state to SQLite with write-ahead semantics for crash recovery
- [ ] Recover active workflows on app restart from persisted SQLite state
- [ ] Implement execution logging — append-only log entries for all execution events with timestamps
- [ ] Display execution history per workflow — completed steps with inputs, outputs, state transitions, and durations
- [ ] Export execution reports as PDF and HTML
- [ ] Implement notifications — configurable alerts for step attention, state transitions, errors, and timeouts
- [ ] Settings screen — notification preferences, storage info, clear completed workflows
- [ ] Handle all step types: START, END, USER_INTERACTION, YES_NO, SELECT 1, PARALLEL, WAIT ALL, WAIT ANY, WORKFLOW PROXY
- [ ] Implement bottom tab navigation: Home, Execute, Overview (placeholder), History, Settings
- [ ] Support responsive layouts: phone, tablet, desktop form factor detection

### Out of Scope

- BrainPal MD server browsing/download — v1 uses file import only; server integration is v2
- Action server REST/SSE protocol (ACTION PROXY steps) — most test workflows don't use action proxies; defer to v2
- Pyodide/Python script execution (SCRIPT steps) — rarely used in workflows; defer to v2
- Workflow graph visualization (minimap) — carousel is sufficient for v1
- Linear step list view — deferred with graph visualization
- User authentication — v1 is single-user mode per spec
- Multi-device collaboration — v1 is single device per workflow per spec
- Expression engine — v1 uses spec comparison operators only
- Hardware integrations — future version scope
- Server mode (mobile as workflow server) — v3+ scope

## Context

- BrainPal MD (the visual workflow editor) already exists and is functional — real .WFmasterX packages are available for testing
- Use case is general-purpose guided workflow execution: recipes, exercise routines, maintenance and repair procedures, business processes
- The data model follows the BrainPal Data Model Overview with Managed Elements using Snowflake OIDs
- ISA-88 batch control semantics inform the state machine design (industry standard for batch process control)
- Test workflows exercise all advanced features: parallel branches, SELECT 1 conditions, nested workflows (WORKFLOW PROXY), and resources
- Full specifications exist in .BrainPalMobile/ covering: DataModel, StateMachine, RESTProtocol, Architecture, UI, Storage, ExecutionEngine, PackageFormat, Docker

## Constraints

- **Tech Stack**: React Native + Expo (managed workflow), TypeScript, Zustand, SQLite (expo-sqlite) — per spec
- **Architecture**: Monorepo with 4 shared packages (engine, protocol, storage, ui) + 2 apps (mobile, web) — per spec
- **Engine Purity**: The engine package must be pure TypeScript with no platform dependencies — testable in Node.js
- **Data Fidelity**: Form rendering must match BrainPal MD's WYSIWYG layout — absolute positioning with canvas scaling
- **State Persistence**: Write-ahead semantics — SQLite updated BEFORE in-memory state for crash safety
- **Package Format**: Must consume .WFmasterX ZIP packages with schema version 4.0

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Cross-platform from day one (not mobile-first) | User needs all three platforms equally | -- Pending |
| Defer action server protocol to v2 | Most workflows are user-interaction focused; reduces v1 scope significantly | -- Pending |
| Defer Pyodide/Python to v2 | Rarely used in current workflows; complex integration (WebView sandbox) | -- Pending |
| Carousel only for v1 (no graph visualization) | Sufficient for workflow navigation; graph adds complexity | -- Pending |
| Import-only for v1 (no server browsing) | Real packages available locally; server API adds scope | -- Pending |

---
*Last updated: 2026-02-24 after initialization*
