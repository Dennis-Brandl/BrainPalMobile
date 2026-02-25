# Feature Research

**Domain:** Cross-platform runtime workflow execution engine (guided procedure apps, digital work instructions, batch control execution)
**Researched:** 2026-02-24
**Confidence:** HIGH (well-specified project with detailed specs; competitive landscape verified via multiple sources)

## Feature Landscape

This research focuses on the **runtime execution experience** -- what users expect when executing pre-designed workflows step-by-step on a mobile or web device. The domain sits at the intersection of:

- **Connected worker platforms** (Dozuki, SafetyCulture, MaintainX, 4Smartworker)
- **Procedure management / SOP execution** (SweetProcess, Process Street, ProcedureFlow, Keeni)
- **Batch control execution** (ISA-88 compliant EBR systems, Opcenter, Atachi)
- **Durable workflow engines** (Temporal, AWS Step Functions, Elsa Workflows)

BrainPal Mobile is unique in that it consumes externally-designed workflow packages (from BrainPal MD) rather than designing workflows in-app. This positions it as a **pure runtime executor** -- closer to EBR execution clients and connected worker apps than to workflow design platforms.

---

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete or broken.

#### Execution Core

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Step-by-step sequential execution** | Fundamental purpose of the app -- users walk through procedures one step at a time | HIGH | Graph walking with predecessor completion checks. Not just a linear list -- must handle the full workflow graph topology. |
| **WYSIWYG form rendering** | Users expect forms to match what was designed in BrainPal MD. Visual fidelity is the contract between designer and executor. | HIGH | Absolute positioning with canvas scaling per device type (phone/tablet/desktop). Fallback chain: desktop -> tablet -> phone. Blurriness on HiDPI displays is a known risk (see PITFALLS.md). |
| **Form data entry and submission** | Core interaction model -- users fill in text inputs, checkboxes, make selections, then submit | MEDIUM | Must bind UI elements to output parameters and write to Value Properties. Required field validation before submit. |
| **State controls: Pause/Resume** | Every connected worker platform and EBR system supports pausing and resuming. Users working physical procedures (recipes, maintenance) frequently need to pause. | MEDIUM | ISA-88 PAUSE/RESUME via state machine. Must preserve form state across pause. Carousel position must be restored on resume. |
| **State controls: Stop/Abort** | Users need an escape hatch. Stop = orderly shutdown. Abort = emergency bail. Industry standard in ISA-88. | MEDIUM | STOP transitions through STOPPING -> COMPLETED. ABORT transitions through ABORTING -> ABORTED. ABORT requires CLEAR to reach COMPLETED. Resource release on both paths. |
| **Active workflow dashboard** | Users need to see what's running, what's paused, what's waiting for attention. Every workflow app has this as the home screen. | LOW | Home screen with active workflows section showing state badges, step counts, progress indicators. |
| **Workflow package import** | Without this, the app has no content. File import is the v1 content acquisition path. | MEDIUM | ZIP extraction (JSZip), manifest parsing, schema validation, SQLite storage of workflows/environments/actions/images. Must handle corrupt/invalid packages gracefully. |
| **Crash recovery / state persistence** | If the app crashes mid-procedure, losing all progress is unacceptable. Temporal, .NET WF, and every serious workflow engine provides this. | HIGH | Write-ahead semantics: SQLite updated BEFORE in-memory state. On restart, query active workflows and rebuild from persisted state. This is the hardest table-stakes feature to get right. |
| **Execution history / audit trail** | Every EBR system, every connected worker platform provides execution records. Users in maintenance and business process contexts need proof of completion. | MEDIUM | Append-only execution_log_entries with timestamps, state transitions, user inputs, parameter resolutions. Per-step detail view with timing. |
| **Notifications for step attention** | When a new step needs user input (especially in parallel workflows), the user must be alerted. Standard in all connected worker platforms. | MEDIUM | expo-notifications (mobile) + Browser Notification API (web). Configurable per notification type. In-app toast/snackbar for foreground alerts. |
| **Yes/No decision steps** | Binary decisions are the simplest conditional -- every procedure app supports them. Custom labels ("Approve"/"Reject", "Pass"/"Fail") are expected. | LOW | Simplified form with two buttons, custom labels/values from yes_no_config. Output value written to Value Property. |
| **Downloaded workflow library** | Users need to see what workflows are available to start. Standard library/catalog view. | LOW | List of master_workflows with local_id, version, description. Tap to view details or start new execution. |

#### Navigation and UX

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Bottom tab navigation** | Standard mobile navigation pattern. Users expect persistent access to Home, Execute, History, Settings. | LOW | React Navigation bottom tabs. 5 tabs: Home, Execute, Overview (placeholder for v1), History, Settings. |
| **Step carousel for parallel branches** | When multiple steps are active simultaneously (parallel branches), users need a way to see and switch between them. This is the primary UX innovation for handling parallel execution. | MEDIUM | Active step list management. Previous/Next with wrap-around. Dot indicators. Steps added on EXECUTING, removed on completion. Position persistence across tab switches. |
| **Settings screen** | Users expect to configure notification preferences and manage storage. | LOW | Notification toggles, storage info display, clear completed workflows action. |
| **Responsive layout (phone/tablet/desktop)** | Users execute on different devices. Form layout selection by device type is the spec contract. | MEDIUM | Device detection by screen width. Form layout selection from form_layout_config. Fallback chain when target layout unavailable. |

---

### Differentiators (Competitive Advantage)

Features that set BrainPal Mobile apart. Not expected in every competitor, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **ISA-88 full state machine** | Industrial-grade state model that most consumer/prosumer apps lack. Provides HOLD/UNHOLD (action-server-triggered), PAUSE/RESUME (user-triggered), STOP, ABORT, and CLEAR -- well beyond simple "start/done" models. Gives users fine-grained control and visibility into step lifecycle. | HIGH | 20+ states with guarded transitions. Separate observable and opaque tracks. Table-driven implementation. This is THE core differentiator and the most complex component. |
| **Parallel branch execution** | Most SOP/checklist apps are strictly linear. Supporting PARALLEL fork, WAIT ALL join, and WAIT ANY join enables modeling of real concurrent procedures (e.g., "preheat oven while prepping ingredients"). | HIGH | Scheduler must activate all outgoing branches from PARALLEL node. WAIT ALL blocks until all incoming branches complete. WAIT ANY proceeds on first completion. The step carousel makes parallel branches navigable. |
| **Resource management with deadlock prevention** | No consumer workflow app has this. Borrowed from ISA-88 batch control. Enables modeling of shared physical resources (cutting board, oven, testing equipment) with automatic queueing and deadlock prevention via alphabetical acquisition order. | HIGH | FIFO queues, scope resolution (workflow -> parent chain -> environment), SYNC barriers for rendezvous patterns (Synchronize, Send/Receive). This is a significant differentiator over any SOP tool. |
| **Conditional branching (SELECT 1)** | Dynamic path selection based on data. Goes beyond simple if/then -- supports 10 comparison operators with type coercion. Enables adaptive procedures that change based on user input or measured values. | MEDIUM | Evaluate conditions in order, follow matching connection. Must handle "no match" error case gracefully (step ABORTED with notification). |
| **Nested workflows (Workflow Proxy)** | Composition and reuse of sub-workflows. A maintenance procedure can embed a "safety check" sub-workflow. Child workflow executes independently with output parameter propagation to parent. | HIGH | Deep copy of embedded child spec, create child RuntimeWorkflow, run independently. PAUSE/ABORT propagate to children. Output parameters flow back to parent step on completion. Requires careful lifecycle management. |
| **Parameter resolution system** | Input parameters resolve from literal values or Value Property lookups (workflow scope -> parent chain -> environment scope). Output parameters write back to Value Properties. This data bus pattern enables inter-step data flow without tight coupling. | MEDIUM | Scope resolution chain with fallback. Value Properties as named bags of key/value entries. Workflow-scoped properties are ephemeral (deleted on completion), environment-scoped properties persist across executions. |
| **SYNC barriers (Send/Receive/Synchronize)** | Rendezvous synchronization between parallel branches. Two steps must both arrive before either proceeds. Enables coordination patterns like "wait for both preparation AND equipment to be ready." | HIGH | Barrier matching logic: Synchronize+Synchronize, Send+Receive. Checked BEFORE regular resources to prevent deadlock. Requires careful persistence and recovery. |
| **PDF/HTML execution report export** | Audit reports in portable formats. Critical for regulated industries (pharma, maintenance). Goes beyond just viewing history -- produces a standalone document. | MEDIUM | Generate structured report from execution_log_entries, state_transitions, user inputs/outputs, timestamps, durations. expo-print or react-native-html-to-pdf for PDF generation. |
| **Cross-platform from single codebase** | Same execution engine on Android, iOS, and web/Docker. Pure TypeScript engine package with no platform dependencies enables this. Competitors typically support only one or two platforms well. | MEDIUM | Already architecturally addressed via monorepo with shared packages. The engine's platform-independence is key. Storage layer uses dependency injection for expo-sqlite. |
| **WYSIWYG fidelity across device types** | Form layouts are designed per device type in BrainPal MD. The runtime renders them with absolute positioning and canvas scaling to match the designer's intent. Most competitors use responsive/reflowing layouts instead. | HIGH | Canvas scaling to fit device screen while maintaining aspect ratio. HiDPI handling. Must be pixel-accurate (or close) to maintain trust between designers and executors. |

---

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems. Deliberately NOT building these for v1.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **In-app workflow editor/designer** | "Let me tweak a workflow on the device" | BrainPal MD already exists as the editor. Duplicating design capability creates spec divergence, increases complexity enormously, and conflates the runtime/design separation that makes the architecture clean. | Import updated packages from BrainPal MD. The runtime is a pure consumer. |
| **Real-time multi-device collaboration** | "Two people executing the same workflow" | Requires conflict resolution, distributed state synchronization, real-time networking. Massive complexity for a v1. Single-device-per-workflow is explicitly scoped. | v2+ scope. For v1, one device owns one workflow instance. |
| **Full expression engine** | "Let me write formulas in conditions" | The 10 spec comparison operators cover all existing workflow conditions. A full expression engine adds parser complexity, security considerations (code injection), and debugging difficulty. | Use the spec comparison operators. If more logic is needed, v2 adds Python/Pyodide scripts. |
| **Workflow graph visualization (minimap)** | "Show me where I am in the workflow" | Requires graph layout algorithm, pinch-to-zoom, node rendering, touch interaction. Significant UI complexity. The step carousel and step list (deferred) provide sufficient navigation for v1. | Step carousel for active steps. Overview tab can be a placeholder for v1. Graph visualization in v2+. |
| **Linear step list view** | "Show me all steps in a flat list" | Requires linearizing a DAG (which may have parallel branches), showing branch context, scroll-to-step. Deferred with graph visualization as both are overview features. | Step carousel for navigation. History screen for completed steps. |
| **Server browsing/download** | "Browse and download from BrainPal MD server" | Adds REST API client, authentication, catalog browsing UI, download management, version comparison. Significant scope for v1 when file import provides the same content. | File import from device storage. Real .WFmasterX packages are available locally for testing. |
| **Action server REST/SSE protocol** | "Execute action proxy steps against servers" | Most test workflows focus on user interaction. Action server protocol requires REST client, SSE streaming, offline queue, reconnection logic, environment binding UI. Large integration surface. | v2 scope. For v1, ACTION PROXY steps can show a "not supported in this version" state or be skipped. |
| **Python/Pyodide script execution** | "Run embedded Python scripts" | Requires WebView sandbox, Pyodide WASM loading (large binary), postMessage bridge, timeout handling. Rarely used in current workflows. | v2 scope. SCRIPT steps can show a "not supported in this version" state. |
| **User authentication** | "Login with credentials" | v1 is single-user mode. Adding auth requires user management, token storage, permission models, session management. No user-facing benefit for single-device use. | v2+ with server integration. |
| **Hardware integrations** | "Connect to sensors, barcode scanners, scales" | Device-specific APIs, Bluetooth/USB protocols, driver management. Huge scope with high platform variance. | Future version. Focus on the software workflow execution first. |
| **AI-assisted step suggestions** | "Let AI suggest the next best step" | Trendy but orthogonal to the core value. Adds LLM dependency, prompt engineering, response latency. The workflow graph already defines the procedure path deterministically. | The workflow graph IS the intelligence -- it was designed by a human expert in BrainPal MD. |
| **Undo/revert completed steps** | "I submitted the wrong data, let me go back" | Violates the append-only audit trail model. State machine transitions are forward-only by design (ISA-88). Reverting a completed step would require unwinding Value Property writes, re-acquiring released resources, and invalidating downstream steps. | Allow re-running the entire workflow. Log corrections as new entries rather than overwriting history. Consider a "correction annotation" feature in v2. |

---

## Feature Dependencies

```
[Package Import]
    |
    v
[Workflow Library Display (Home Screen)]
    |
    v
[Workflow Creation (deep copy master -> runtime)]
    |
    +-------> [State Machine] ------> [State Controls UI (Pause/Resume/Stop/Abort)]
    |              |
    |              v
    +-------> [Scheduler] ----------> [Step Carousel (active step navigation)]
    |              |
    |              +-------> [PARALLEL / WAIT ALL / WAIT ANY]
    |              |
    |              v
    +-------> [Form Renderer] ------> [Form Data Entry + Submit]
    |                                       |
    |                                       v
    +-------> [Parameter Resolver] --> [Value Properties Read/Write]
    |              |
    |              v
    +-------> [Condition Evaluator] -> [SELECT 1 branching]
    |
    +-------> [Resource Manager] ---> [FIFO Queues + SYNC Barriers]
    |
    +-------> [Workflow Proxy] ------> [Nested Workflow Execution]
    |              |                        |
    |              |                        +---> [Parameter Resolver] (child -> parent output propagation)
    |              |
    |              +---> [Scheduler] (child workflow has its own scheduler)
    |
    +-------> [Execution Logger] ---> [History Screen]
    |                                       |
    |                                       v
    +-------> [Report Exporter] -----> [PDF/HTML Export]
    |
    +-------> [Notification System] -> [Settings Screen (notification prefs)]
    |
    +-------> [Crash Recovery] ------> [State Persistence (SQLite write-ahead)]
```

### Dependency Notes

- **State Machine is foundational:** Every other engine component depends on the state machine to manage step lifecycle. Build and test this first.
- **Scheduler depends on State Machine:** The scheduler drives steps through the state machine and determines next activations. Cannot function without a working state machine.
- **Form Renderer depends on Package Import:** Forms reference images from the package. Canvas dimensions come from form_layout_config. Without imported packages, there is nothing to render.
- **Parameter Resolver depends on Value Properties:** Input resolution reads from Value Properties. Output writing creates/updates Value Properties. The property store must exist before parameter resolution works.
- **Resource Manager is independent but required for WAITING -> STARTING:** Steps block in WAITING until resources are acquired. Without the resource manager, steps with resource commands will hang. Steps WITHOUT resource commands can bypass this.
- **Workflow Proxy depends on nearly everything:** Creates child workflows, which need their own scheduler, state machine, parameter resolution, and resource management. This is the most complex integration point and should come last.
- **Crash Recovery depends on State Persistence:** The write-ahead pattern must be implemented in the storage layer before crash recovery logic can be built on top of it.
- **Report Export depends on Execution Logger:** Reports are generated from execution_log_entries and state_transitions. The logging system must be capturing data before export makes sense.
- **Notifications enhance but don't block execution:** Notifications can be added after core execution works. They consume engine events but don't produce them.

---

## MVP Definition

### Launch With (v1)

Minimum viable product -- the set of features needed to validate that users can meaningfully execute BrainPal MD workflows on mobile/web.

- [ ] **Package import** (.WFmasterX from device storage) -- without this, no content
- [ ] **Workflow library display** (Home screen with downloaded workflows and active instances) -- without this, no way to find and start workflows
- [ ] **Workflow creation** (deep copy master -> runtime) -- the instantiation path
- [ ] **State machine** (full ISA-88 observable track) -- the execution backbone
- [ ] **Scheduler** (sequential execution, PARALLEL fork, WAIT ALL/WAIT ANY joins) -- the graph walker
- [ ] **WYSIWYG form rendering** (phone/tablet/desktop layouts, canvas scaling) -- the user-facing execution experience
- [ ] **Form data entry and submit** (text input, checkbox, image display, user input capture) -- core interaction
- [ ] **Yes/No steps** (custom labels, output value writing) -- simplest decision point
- [ ] **Step carousel** (Previous/Next, dot indicators, wrap-around) -- parallel branch navigation
- [ ] **State controls** (Pause/Resume, Stop, Abort from UI) -- user control over execution
- [ ] **Parameter resolver** (literal and property lookup, output writing) -- inter-step data flow
- [ ] **Condition evaluator** (SELECT 1 with 10 operators) -- conditional branching
- [ ] **Resource manager** (FIFO queues, deadlock prevention, SYNC barriers) -- resource coordination
- [ ] **Workflow Proxy** (nested child workflow execution with output propagation) -- composition
- [ ] **State persistence** (SQLite write-ahead, crash recovery) -- reliability guarantee
- [ ] **Execution logging** (append-only log entries for all events) -- audit trail
- [ ] **Execution history display** (per-workflow step history with inputs/outputs/timing) -- review past execution
- [ ] **Notifications** (step attention, errors, state transitions -- configurable) -- user alerting
- [ ] **Settings screen** (notification prefs, storage info, clear completed workflows) -- configuration
- [ ] **Bottom tab navigation** (Home, Execute, Overview placeholder, History, Settings) -- app structure

### Add After Validation (v1.x)

Features to add once core execution is proven and user feedback is collected.

- [ ] **PDF/HTML report export** -- trigger: users in regulated environments request portable audit reports
- [ ] **Improved error display** -- trigger: users encounter errors and need better diagnostics
- [ ] **Workflow detail screen** -- trigger: users want to preview workflow metadata before starting
- [ ] **Notification center screen** -- trigger: users with many active workflows need notification management
- [ ] **Storage management improvements** -- trigger: users accumulate many workflows and need cleanup tools

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] **BrainPal MD server browsing/download** -- requires REST API client, catalog UI, version management
- [ ] **Action server REST/SSE protocol** -- requires protocol client, offline queue, SSE streaming
- [ ] **Python/Pyodide script execution** -- requires WebView sandbox, WASM loading, timeout handling
- [ ] **Workflow graph visualization (minimap)** -- requires graph layout, rendering, touch interaction
- [ ] **Linear step list view** -- requires DAG linearization, branch context display
- [ ] **User authentication** -- requires user management, token storage, permission models
- [ ] **Multi-device collaboration** -- requires distributed state sync, conflict resolution
- [ ] **Full expression engine** -- requires parser, evaluator, security sandbox
- [ ] **Hardware integrations** -- requires device-specific APIs, Bluetooth/USB protocols

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Package import | HIGH | MEDIUM | P1 |
| State machine (ISA-88) | HIGH | HIGH | P1 |
| Scheduler (graph walking, parallel branches) | HIGH | HIGH | P1 |
| WYSIWYG form renderer | HIGH | HIGH | P1 |
| Form data entry + submit | HIGH | MEDIUM | P1 |
| Step carousel | HIGH | MEDIUM | P1 |
| State controls (Pause/Resume/Stop/Abort) | HIGH | MEDIUM | P1 |
| Parameter resolver | HIGH | MEDIUM | P1 |
| Condition evaluator (SELECT 1) | HIGH | LOW | P1 |
| Resource manager | MEDIUM | HIGH | P1 |
| Workflow Proxy (nested workflows) | MEDIUM | HIGH | P1 |
| Yes/No steps | HIGH | LOW | P1 |
| State persistence + crash recovery | HIGH | HIGH | P1 |
| Execution logging | HIGH | MEDIUM | P1 |
| Home screen (library + active workflows) | HIGH | LOW | P1 |
| Bottom tab navigation | HIGH | LOW | P1 |
| Notifications | MEDIUM | MEDIUM | P1 |
| Settings screen | LOW | LOW | P1 |
| Execution history display | MEDIUM | MEDIUM | P1 |
| Responsive layout (device type detection) | MEDIUM | LOW | P1 |
| PDF/HTML report export | MEDIUM | MEDIUM | P2 |
| Workflow detail/preview screen | LOW | LOW | P2 |
| Notification center | LOW | LOW | P2 |
| Server browsing/download | MEDIUM | HIGH | P3 |
| Action server protocol | MEDIUM | HIGH | P3 |
| Pyodide/Python scripts | LOW | HIGH | P3 |
| Graph visualization | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for launch -- the workflow execution experience is non-functional without these
- P2: Should have, add when possible -- enhances the experience but core execution works without them
- P3: Nice to have, future consideration -- significant scope that should be deferred

---

## Competitor Feature Analysis

| Feature | Connected Worker Apps (Dozuki, MaintainX) | SOP Platforms (SweetProcess, Process Street) | EBR Systems (Opcenter, Atachi) | BrainPal Mobile (Our Approach) |
|---------|------------------------------------------|----------------------------------------------|-------------------------------|-------------------------------|
| Step-by-step execution | Yes, linear | Yes, linear checklists | Yes, procedure-driven | Yes, graph-based (supports non-linear) |
| Parallel branches | No | No (conditional logic only) | Yes (ISA-88) | Yes (PARALLEL/WAIT ALL/WAIT ANY) |
| State machine | Simple (open/done) | Simple (open/done) | Full ISA-88 | Full ISA-88 (observable + opaque tracks) |
| Pause/Resume | Some | No | Yes | Yes |
| Resource management | No | No | Yes (via MES integration) | Yes (built-in FIFO queues, SYNC barriers) |
| Conditional branching | Limited (if/then) | Yes (conditional logic) | Yes | Yes (SELECT 1 with 10 operators) |
| Nested workflows | No | No | Some | Yes (Workflow Proxy with output propagation) |
| WYSIWYG forms | Template-based | Template-based | Configurable | Absolute positioned, canvas-scaled per device |
| Audit trail | Yes | Yes | Yes (FDA compliant) | Yes (append-only with state transitions) |
| PDF export | Some | Yes (PDF/Word) | Yes | Yes (PDF/HTML) |
| Offline support | Some (auto-sync) | Print for offline | Limited | Full offline execution, SQLite persistence |
| Cross-platform | Web + mobile | Web + mobile | Desktop/web (industrial) | Android + iOS + Web/Docker from single codebase |
| Workflow design | In-app or web | In-app | Separate system (MES) | Separate system (BrainPal MD) -- runtime only |
| Multi-media in steps | Images, videos, AR | Images, videos | Limited | Images, videos, rich text (from WYSIWYG) |

**Key competitive positioning:** BrainPal Mobile combines the industrial rigor of EBR systems (ISA-88 state machine, resource management, parallel branches) with the accessibility and cross-platform reach of connected worker apps. No competitor in the consumer/prosumer space offers the combination of parallel branch execution, resource management with deadlock prevention, nested workflows, and WYSIWYG form fidelity.

---

## Sources

**Industry Research (MEDIUM confidence -- multiple sources agreeing):**
- [Dozuki Digital Work Instructions](https://www.dozuki.com/digital-work-instructions-dozuki-knowledge-management)
- [SweetProcess SOP App](https://www.sweetprocess.com/sop-app/)
- [Top 10 Digital Work Instruction Software 2026](https://gitnux.org/best/digital-work-instruction-software/)
- [Process Street vs SweetProcess Comparison](https://www.sweetprocess.com/process-street-vs-sweetprocess/)
- [Connected Worker Platforms 2026](https://thectoclub.com/tools/best-connected-worker-platforms/)
- [Workflow Apps Features and Comparison](https://www.cflowapps.com/workflow-apps/)

**Standards (HIGH confidence -- authoritative):**
- [ISA-88 Standards - ISA](https://www.isa.org/standards-and-publications/isa-standards/isa-88-standards)
- [ISA-88 S88 Batch Control Explained](https://www.plcacademy.com/isa-88-s88-batch-control-explained/)

**Technical Patterns (MEDIUM confidence -- verified via multiple technical sources):**
- [Temporal Durable Execution](https://temporal.io/)
- [Workflow Persistence - .NET Framework](https://learn.microsoft.com/en-us/dotnet/framework/windows-workflow-foundation/workflow-persistence)
- [LangChain Durable Execution](https://docs.langchain.com/oss/python/langgraph/durable-execution)
- [Canvas Scaling - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas)

**Project Specifications (HIGH confidence -- authoritative project documentation):**
- `.BrainPalMobile/PROJECT.md` -- Project overview and capabilities
- `.BrainPalMobile/ExecutionEngineSpec.md` -- Engine component architecture
- `.BrainPalMobile/StateMachineSpec.md` -- ISA-88 state machine specification
- `.BrainPalMobile/UISpec.md` -- Screen designs and form rendering
- `.BrainPalMobile/DataModelSpec.md` -- Complete data model
- `.BrainPalMobile/StorageSpec.md` -- SQLite schema and data lifecycle
- `.BrainPalMobile/PackageFormatSpec.md` -- .WFmasterX package format
- `.BrainPalMobile/ArchitectureSpec.md` -- Monorepo structure and package architecture

---
*Feature research for: Cross-platform runtime workflow execution engine*
*Researched: 2026-02-24*
