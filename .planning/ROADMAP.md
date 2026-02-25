# Roadmap: BrainPal Mobile

## Overview

BrainPal Mobile is built in five phases that follow the dependency chain: foundation infrastructure must be correct before the engine can write state, the engine must be proven before the UI can render against it, and the core execution path must work before ancillary features (history, notifications, workflow proxy) layer on top. The final phase addresses PDF export and production polish. Each phase delivers a coherent, independently verifiable capability -- nothing is "done" until it works on Android, iOS, and web.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Monorepo scaffold, SQLite persistence layer, cross-platform baseline on all three targets
- [x] **Phase 2: Engine Core** - ISA-88 state machine, scheduler, parameter/condition subsystems, import pipeline, crash recovery
- [ ] **Phase 3: Execution UI** - WYSIWYG form renderer, step carousel, execution screen, home screen, state controls, navigation
- [ ] **Phase 4: Workflow Proxy + Ancillary Features** - Nested workflow execution, history display, notifications, settings
- [ ] **Phase 5: Polish + PDF Export** - Execution report export, performance tuning, production hardening

## Phase Details

### Phase 1: Foundation
**Goal**: The monorepo builds and runs on Android emulator, Android physical device, iOS simulator, and web with a correct persistence layer that enforces write-ahead semantics and handles platform-specific SQLite differences
**Depends on**: Nothing (first phase)
**Requirements**: FNDTN-01, FNDTN-02, FNDTN-03, FNDTN-04, PERS-01, PERS-05
**Success Criteria** (what must be TRUE):
  1. Running `npx expo start` launches the app on Android emulator, Android physical device (USB/WiFi), iOS simulator, and web browser with shared packages resolving correctly (no "Invalid hook call" or duplicate React errors)
  2. SQLite database initializes in WAL mode with schema v1, and a write-ahead helper function enforces SQLite-write-before-Zustand-update ordering in all mutations
  3. Zustand stores rebuild their state from SQLite on app restart (kill and relaunch produces identical UI state)
  4. Web target runs with correct COOP/COEP headers and uses a JS-level write queue in place of exclusive transactions (wa-sqlite limitation handled transparently)
  5. Environment Value Properties persist across app sessions (written to SQLite, survive restart)
  6. Cross-platform verification: app tested and confirmed working on Android emulator, Android physical device, and iOS simulator before phase completion
**Plans**: 3 plans

Plans:
- [x] 01-01: Monorepo scaffold and cross-platform smoke test
- [x] 01-02: SQLite schema, WAL mode, write-ahead persistence pattern
- [x] 01-03: Zustand read-through cache and web platform configuration

### Phase 2: Engine Core
**Goal**: The pure-TypeScript engine can import workflow packages, create runtime workflow instances, and execute them step-by-step through the state machine with scheduling, parameter resolution, condition evaluation, and crash recovery -- all verified by automated tests without any UI
**Depends on**: Phase 1
**Requirements**: PKG-01, PKG-02, PKG-03, PKG-04, PKG-05, EXEC-01, EXEC-02, EXEC-03, EXEC-07, EXEC-11, EXEC-12, PERS-02, PERS-03, PERS-04
**Success Criteria** (what must be TRUE):
  1. User can pick a .WFmasterX file from device storage and the system extracts workflows, environments, actions, and images into SQLite; importing a newer version of the same package replaces the old one
  2. User can view a list of downloaded master workflow specifications on the Home screen and delete unwanted ones
  3. Creating a Runtime Workflow produces a deep copy of the master spec that can be executed independently; the state machine walks steps through IDLE to COMPLETED following ISA-88 transitions
  4. The scheduler determines next steps when a step completes, the condition evaluator handles SELECT 1 branching with all 10 comparison operators, and the parameter resolver reads/writes Value Properties across workflow and environment scope
  5. Active workflows resume from persisted SQLite state after app restart; execution log entries capture all engine events with timestamps; workflow Value Properties are cleaned up after completion
**Plans**: 5 plans

Plans:
- [x] 02-01: Engine types, interfaces, event bus, event queue, Vitest config, and mock repositories
- [x] 02-02: ISA-88 table-driven state machine and DAG-based scheduler
- [x] 02-03: Parameter resolver with scope chain, condition evaluator (10 operators), and resource manager
- [x] 02-04: Import pipeline (fflate ZIP extraction, manifest parsing, version replacement)
- [x] 02-05: WorkflowRunner, step executor, crash recovery, execution logging, and integration tests

### Phase 3: Execution UI
**Goal**: Users can see their workflows, launch execution, interact with WYSIWYG forms rendered faithfully across device types, navigate parallel branches via the step carousel, and control workflow state from the execution screen
**Depends on**: Phase 2
**Requirements**: EXEC-04, EXEC-05, EXEC-06, EXEC-08, EXEC-09, UI-01, UI-02, UI-03, UI-04, UI-05, UI-06, UI-07, UI-08
**Success Criteria** (what must be TRUE):
  1. Home screen displays downloaded master workflows and active runtime workflows with ISA-88 state badges; tapping an active workflow opens the execution screen
  2. Execution screen renders WYSIWYG forms from form_layout_config using absolute positioning with canvas scaling that correctly adapts to phone, tablet, and desktop form factors (visual fidelity matches BrainPal MD output)
  3. Step carousel navigates between active user interaction steps with Previous/Next buttons and wrap-around; Yes/No steps render with custom labels and produce correct output values
  4. User can PAUSE, RESUME, STOP, and ABORT a running workflow from the execution screen; PARALLEL fork activates all branches concurrently; WAIT ALL and WAIT ANY joins proceed correctly
  5. Resource Manager acquires resources with FIFO queues and alphabetical deadlock prevention; SYNC barriers (Synchronize, Send, Receive) correctly synchronize parallel branches
**Plans**: TBD

Plans:
- [ ] 03-01: Home screen, bottom tab navigation, and responsive layout shell
- [ ] 03-02: Canvas scaling algorithm and WYSIWYG form renderer
- [ ] 03-03: Step carousel, Yes/No renderer, and state control UI
- [ ] 03-04: Parallel execution UI wiring (fork/join, resources, SYNC barriers)

### Phase 4: Workflow Proxy + Ancillary Features
**Goal**: Users can execute workflows that contain nested child workflows (Workflow Proxy), view execution history with full detail, receive notifications for steps needing attention and errors, and manage app settings
**Depends on**: Phase 3
**Requirements**: EXEC-10, HIST-01, NOTF-01, NOTF-02, NOTF-03, SETT-01, SETT-02, SETT-03
**Success Criteria** (what must be TRUE):
  1. Workflow Proxy steps create and execute child workflows; output parameters from child workflows propagate back to the parent step on completion; PAUSE and ABORT propagate from parent to child
  2. User can view execution history per workflow showing completed steps with inputs, outputs, state transitions, and durations
  3. System sends notifications when user interaction steps need attention and when errors or timeouts occur; notifications work on mobile (push) and web (browser notifications)
  4. Settings screen displays notification preference toggles (enable/disable per type), storage info (downloaded count, active count, storage used), and a control to clear completed workflows
**Plans**: TBD

Plans:
- [ ] 04-01: Workflow Proxy engine logic and child workflow lifecycle
- [ ] 04-02: History screen and execution log queries
- [ ] 04-03: Notifications and Settings screens

### Phase 5: Polish + PDF Export
**Goal**: Users can export execution reports as PDF and the app meets production quality standards for performance, error handling, and user feedback
**Depends on**: Phase 4
**Requirements**: HIST-02
**Success Criteria** (what must be TRUE):
  1. User can export a completed workflow's execution report as a PDF document on mobile (via share sheet) and as a file download on web
  2. App provides progress feedback during long operations (ZIP import) and confirmation dialogs before destructive actions (STOP, ABORT, delete workflow)
  3. Execution history loads efficiently with pagination (no memory issues on workflows with hundreds of log entries); Zustand selectors prevent unnecessary re-renders across workflow boundaries
**Plans**: TBD

Plans:
- [ ] 05-01: PDF export implementation (mobile + web paths)
- [ ] 05-02: Performance tuning and production hardening

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5

| Phase | Plans Complete | Status | Completed |
|-------|---------------|--------|-----------|
| 1. Foundation | 3/3 | ✓ Complete | 2026-02-25 |
| 2. Engine Core | 5/5 | ✓ Complete | 2026-02-25 |
| 3. Execution UI | 0/4 | Not started | - |
| 4. Workflow Proxy + Ancillary | 0/3 | Not started | - |
| 5. Polish + PDF Export | 0/2 | Not started | - |

---
*Roadmap created: 2026-02-24*
*Last updated: 2026-02-26*
