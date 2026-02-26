# Requirements: BrainPal Mobile

**Defined:** 2026-02-24
**Core Value:** Users can import a workflow package and execute it step-by-step on any platform -- the execution engine must faithfully walk the workflow graph, render forms correctly, handle branching/resources/nesting, and persist state across crashes.

## v1 Requirements

### Foundation

- [x] **FNDTN-01**: Monorepo scaffold with engine, protocol, storage, ui packages + mobile and web apps
- [x] **FNDTN-02**: SQLite database initialized with WAL mode, schema v1, and write-ahead persistence pattern
- [x] **FNDTN-03**: Zustand stores configured as read-through cache of SQLite state
- [x] **FNDTN-04**: Cross-platform baseline verified on Android, iOS, and web

### Package Management

- [x] **PKG-01**: User can import .WFmasterX file from device storage via file picker
- [x] **PKG-02**: System extracts workflow specs, environment specs, action specs, and images from ZIP package into SQLite
- [x] **PKG-03**: User can view list of downloaded master workflow specifications on the Home screen
- [x] **PKG-04**: User can delete a downloaded workflow and its associated data
- [x] **PKG-05**: System replaces older package when importing a newer version of the same workflow

### Workflow Execution

- [x] **EXEC-01**: User can create a Runtime Workflow as a deep copy of a Master Workflow Specification
- [x] **EXEC-02**: ISA-88 state machine manages step lifecycle (observable track: IDLE through COMPLETED)
- [x] **EXEC-03**: Scheduler determines next steps from workflow graph when a step completes
- [x] **EXEC-04**: Scheduler handles PARALLEL fork (activates all outgoing branches concurrently)
- [x] **EXEC-05**: Scheduler handles WAIT ALL join (proceeds when all incoming branches complete)
- [x] **EXEC-06**: Scheduler handles WAIT ANY join (proceeds when first incoming branch completes)
- [x] **EXEC-07**: Condition Evaluator handles SELECT 1 branching with all 10 comparison operators
- [x] **EXEC-08**: Resource Manager acquires resources with FIFO queues and deadlock prevention (alphabetical order)
- [x] **EXEC-09**: Resource Manager handles SYNC barriers (Synchronize, Send, Receive matching)
- [x] **EXEC-10**: Workflow Proxy steps create and execute child workflows with output parameter propagation
- [x] **EXEC-11**: Parameter Resolver resolves inputs (literal values and Value Property lookups)
- [x] **EXEC-12**: Parameter Resolver writes outputs to Value Properties (workflow and environment scope)

### User Interface

- [x] **UI-01**: Home screen displays active workflows with status and downloaded workflows
- [x] **UI-02**: Execution screen renders WYSIWYG forms from form_layout_config with device-type selection
- [x] **UI-03**: Form elements use absolute positioning with canvas scaling to fit device screen
- [x] **UI-04**: Step carousel navigates active user interaction steps with Previous/Next wrap-around
- [x] **UI-05**: Yes/No steps render with custom labels and output values
- [x] **UI-06**: User can PAUSE, RESUME, STOP, and ABORT workflows from the execution screen
- [x] **UI-07**: Bottom tab navigation: Home, Execute, Overview (placeholder), History, Settings
- [x] **UI-08**: Responsive layouts adapt to phone, tablet, and desktop form factors

### Persistence

- [x] **PERS-01**: All state changes persisted to SQLite before in-memory state (write-ahead)
- [x] **PERS-02**: Active workflows resume from persisted SQLite state on app restart
- [x] **PERS-03**: Execution log entries appended for all engine events with timestamps
- [x] **PERS-04**: Workflow Value Properties deleted after workflow completion and log generation
- [x] **PERS-05**: Environment Value Properties retained across workflow executions

### History & Reporting

- [x] **HIST-01**: User can view execution history per workflow with completed steps, inputs, outputs, and durations
- [ ] **HIST-02**: User can export execution report as PDF

### Notifications

- [x] **NOTF-01**: System sends notifications when user interaction steps need attention
- [x] **NOTF-02**: System sends notifications for errors (timeouts deferred to Environment Actions, v2 scope)
- [x] **NOTF-03**: User can configure notification preferences (enable/disable per type) in Settings

### Settings

- [x] **SETT-01**: Settings screen displays notification preferences with toggles
- [x] **SETT-02**: Settings screen displays storage info (downloaded count, active count, storage used)
- [x] **SETT-03**: User can clear completed workflows from storage

## v2 Requirements

### Server Integration

- **SERV-01**: User can connect to a BrainPal MD server and browse workflow libraries
- **SERV-02**: User can download .WFmasterX packages from BrainPal MD server
- **SERV-03**: System detects when newer versions of downloaded workflows are available

### Action Server Protocol

- **ACTN-01**: System invokes actions on action servers via REST POST
- **ACTN-02**: System monitors observable actions via SSE event stream
- **ACTN-03**: System polls opaque action status with exponential backoff
- **ACTN-04**: Offline action queue persists pending invocations and replays on reconnect

### Script Execution

- **SCRP-01**: Pyodide WebView sandbox executes Python scripts with input/output parameters
- **SCRP-02**: Script execution has timeout handling for runaway scripts

### Visualization

- **VIZL-01**: Minimap graph view renders workflow graph with color-coded step states
- **VIZL-02**: Linear step list view shows all steps in execution order with status
- **VIZL-03**: User can tap active steps in overview to navigate to execution screen

### Enhanced History

- **EHST-01**: Expandable state transition history per step
- **EHST-02**: HTML report export

## Out of Scope

| Feature | Reason |
|---------|--------|
| In-app workflow editing | BrainPal MD handles design; mobile is runtime-only |
| User authentication | v1 is single-user mode per spec |
| Multi-device collaboration | v1 is single device per workflow per spec |
| Full expression engine | v1 uses spec comparison operators only |
| Undo/revert execution | ISA-88 state machine is forward-only by design |
| Real-time collaboration | Would require server infrastructure and conflict resolution |
| Hardware integrations | Future version scope (v4+) |
| Server mode | Mobile as workflow server is v3+ scope |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FNDTN-01 | Phase 1 | Complete |
| FNDTN-02 | Phase 1 | Complete |
| FNDTN-03 | Phase 1 | Complete |
| FNDTN-04 | Phase 1 | Complete |
| PKG-01 | Phase 2 | Complete |
| PKG-02 | Phase 2 | Complete |
| PKG-03 | Phase 2 | Complete |
| PKG-04 | Phase 2 | Complete |
| PKG-05 | Phase 2 | Complete |
| EXEC-01 | Phase 2 | Complete |
| EXEC-02 | Phase 2 | Complete |
| EXEC-03 | Phase 2 | Complete |
| EXEC-04 | Phase 3 | Complete |
| EXEC-05 | Phase 3 | Complete |
| EXEC-06 | Phase 3 | Complete |
| EXEC-07 | Phase 2 | Complete |
| EXEC-08 | Phase 3 | Complete |
| EXEC-09 | Phase 3 | Complete |
| EXEC-10 | Phase 4 | Complete |
| EXEC-11 | Phase 2 | Complete |
| EXEC-12 | Phase 2 | Complete |
| UI-01 | Phase 3 | Complete |
| UI-02 | Phase 3 | Complete |
| UI-03 | Phase 3 | Complete |
| UI-04 | Phase 3 | Complete |
| UI-05 | Phase 3 | Complete |
| UI-06 | Phase 3 | Complete |
| UI-07 | Phase 3 | Complete |
| UI-08 | Phase 3 | Complete |
| PERS-01 | Phase 1 | Complete |
| PERS-02 | Phase 2 | Complete |
| PERS-03 | Phase 2 | Complete |
| PERS-04 | Phase 2 | Complete |
| PERS-05 | Phase 1 | Complete |
| HIST-01 | Phase 4 | Complete |
| HIST-02 | Phase 5 | Pending |
| NOTF-01 | Phase 4 | Complete |
| NOTF-02 | Phase 4 | Complete |
| NOTF-03 | Phase 4 | Complete |
| SETT-01 | Phase 4 | Complete |
| SETT-02 | Phase 4 | Complete |
| SETT-03 | Phase 4 | Complete |

**Coverage:**
- v1 requirements: 42 total
- Mapped to phases: 42
- Unmapped: 0

---
*Requirements defined: 2026-02-24*
*Last updated: 2026-02-26 after Phase 4 completion*
