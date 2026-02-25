# Project Research Summary

**Project:** BrainPal Mobile
**Domain:** Cross-platform runtime workflow execution engine (React Native + Expo monorepo)
**Researched:** 2026-02-24
**Confidence:** HIGH

## Executive Summary

BrainPal Mobile is a pure runtime executor for workflows designed in BrainPal MD. It occupies an unusual position in the market: it combines the industrial rigor of EBR/batch-control systems (ISA-88 state machine, resource management, parallel branch execution, nested workflows) with the accessibility and cross-platform reach of consumer-grade connected worker apps. No competitor in the prosumer space offers this combination. The recommended approach is a strict monorepo architecture with four shared packages — a pure-TypeScript engine, a SQLite storage layer, a protocol client, and a shared React Native UI package — running on Expo SDK 54 with React Native 0.81. This separation keeps the execution engine testable in Node.js, platform-independent, and reusable across both the mobile and Docker/web targets from a single codebase.

The single most important architectural decision is the write-ahead persistence model: SQLite is written before Zustand is updated, which is the source of truth for crash recovery. Every other design choice flows from this commitment. The engine communicates with the UI exclusively through a typed event bus, never importing React or platform code. Zustand stores are rebuilt from SQLite on every app start and treated as a reactive cache, not as persistent state. This is a non-negotiable constraint and must be established in Phase 1 before any feature development begins.

The biggest risks are (1) expo-sqlite on web is alpha, with fundamental differences from native SQLite that will silently break features developed mobile-first, (2) state machine race conditions under parallel branch execution are nearly impossible to reproduce and diagnose once the codebase is mature, and (3) WYSIWYG form rendering fidelity across device types requires a precisely specified canvas scaling algorithm that, if wrong, requires a complete rework of every form element renderer. All three risks are avoidable by front-loading the right architectural decisions and testing on all three platforms from day one.

---

## Key Findings

### Recommended Stack

The core technology choices are pre-decided: React Native + Expo (managed workflow), TypeScript, Zustand, expo-sqlite, and an npm-workspaces monorepo. Research confirmed that **Expo SDK 54** (not the specified SDK 52) is the correct target — SDK 52 is 15 months old, SDK 54 is current stable with React 19.1, React Native 0.81, stable New Architecture, and precompiled iOS builds. SDK 55 is in beta and should be deferred to Q2 2026. The one meaningful deviation from the project specification is **fflate instead of JSZip**: JSZip requires stream/buffer polyfills in React Native, has known Android issues in Expo, is effectively unmaintained (last release 2022), and blocks the main thread. fflate is pure JavaScript, zero dependencies, true async, and works in Node.js, React Native, and browser without any Metro configuration.

See `.planning/research/STACK.md` for full version matrix and alternatives considered.

**Core technologies:**
- **Expo SDK 54 + React Native 0.81**: App framework — stable New Architecture, precompiled iOS, React 19.1
- **TypeScript 5.8**: Type safety — improved narrowing, erasableSyntaxOnly, watch-mode performance gains
- **Zustand 5**: App state — tiny bundle, native useSyncExternalStore, works with Hermes/Fabric; reactive cache only (not persistence)
- **expo-sqlite 16**: Local persistence — WAL mode, exclusive transactions, React hooks; web support is alpha (see pitfalls)
- **fflate 0.8.2**: ZIP extraction — replaces JSZip; pure JS, zero polyfills, true async, works in engine package
- **expo-router 6**: File-based navigation — same route structure for web and mobile; tab navigation out of the box
- **react-native-svg 15.11**: Custom graph/SVG rendering — use primitives directly, not a charting library
- **react-native-reanimated 4.1**: Animations — New Architecture only; requires react-native-worklets peer dependency
- **Vitest 4 / Jest 30 + jest-expo 54**: Dual test runner split — Vitest for pure-TS packages (engine, protocol, storage); Jest for React Native apps and UI package
- **Turborepo 2.8**: Monorepo build orchestration — caches task results, parallel execution, `^build` dependency aware

**Testing runner split is mandatory:** Vitest cannot run React Native component tests; Jest cannot efficiently test pure TypeScript packages. This is a hard constraint, not a preference.

### Expected Features

See `.planning/research/FEATURES.md` for full feature dependency graph and competitor analysis.

**Must have (table stakes) — all are P1 for v1:**
- Package import (.WFmasterX from device storage via expo-document-picker + fflate)
- Full ISA-88 state machine (observable track: IDLE, WAITING, STARTING, EXECUTING, PAUSING, PAUSED, COMPLETING, COMPLETED, ABORTING, ABORTED, CLEARING, HOLDING, HELD, STOPPING — all transitions)
- DAG-based scheduler with PARALLEL fork, WAIT ALL, WAIT ANY join logic
- WYSIWYG form rendering with canvas scaling per device type (phone/tablet/desktop fallback chain)
- Form data entry and submission with required-field validation
- Yes/No decision steps with custom labels
- Step carousel with dot indicators for parallel branch navigation
- State controls: Pause/Resume, Stop, Abort — all triggerable from UI
- Parameter resolver (literal + property lookup; scope chain: step → workflow → parent chain → environment)
- Condition evaluator (SELECT 1, 10 comparison operators with type coercion)
- Resource manager (FIFO queues, alphabetical acquisition, SYNC barriers for rendezvous)
- Workflow Proxy (nested child workflow execution with output parameter propagation to parent)
- State persistence + crash recovery (write-ahead; rebuild from SQLite on restart)
- Append-only execution logging with state transitions, user inputs, timestamps
- Home screen (workflow library + active workflow list with state badges)
- Bottom tab navigation (Home, Execute, Overview placeholder, History, Settings)
- Execution history display (per-workflow step history with inputs/outputs/timing)
- Local notifications for step attention, errors, state transitions (configurable in Settings)
- Settings screen (notification prefs, storage info, clear completed workflows)
- Responsive layout: device type detection and form layout selection

**Should have — competitive differentiators (P1 but can follow core execution):**
- ISA-88 HOLD/UNHOLD (action-server-triggered path distinct from user-triggered PAUSE/RESUME)
- SYNC barrier matching (Synchronize+Synchronize, Send+Receive) for parallel branch rendezvous
- Cross-platform execution parity (Android, iOS, web/Docker from single codebase)

**Defer to v1.x (add after validation):**
- PDF/HTML execution report export (expo-print + expo-sharing)
- Improved error diagnostics display
- Workflow detail/preview screen before starting

**Defer to v2+ (out of scope for v1):**
- BrainPal MD server browsing/download (REST client, catalog UI, version management)
- Action server REST/SSE protocol (ACTION PROXY steps: show "not supported" in v1)
- Python/Pyodide script execution (SCRIPT steps: show "not supported" in v1)
- Workflow graph visualization/minimap
- User authentication
- Multi-device collaboration
- Full expression engine

### Architecture Approach

The architecture is a strictly layered monorepo with dependency injection as the backbone: `packages/engine` (pure TypeScript, no platform deps) defines interfaces and all business logic; `packages/storage` implements those interfaces against expo-sqlite; `packages/protocol` implements protocol interfaces (v2 scope, stub for v1); `packages/ui` consumes engine types for display only; `apps/mobile` and `apps/web` are the composition roots that wire everything together. The engine never imports from platform packages — it communicates with storage through injected interfaces and communicates with the UI through a typed EventBus. Zustand stores live in the app layer and are driven by the bridge, which subscribes to engine events and translates them into store mutations. This gives the engine full testability in Node.js with Vitest and zero-platform mocks.

See `.planning/research/ARCHITECTURE.md` for full component diagram, data flow, and code examples for each pattern.

**Major components:**
1. **packages/engine** — Pure TypeScript: StateMachine (table-driven ISA-88), Scheduler (DAG adjacency list), ResourceManager (FIFO + SYNC barriers), ParameterResolver (scope chain), ConditionEvaluator (10 operators), WorkflowRunner (top-level orchestrator), EngineEventBus (typed pub/sub)
2. **packages/storage** — SQLite repositories implementing engine interfaces: master workflow repos, runtime workflow/step/connection/binding repos, value-property repo, execution-log repo, resource-pool repo
3. **packages/ui** — Shared React Native components: FormCanvas (canvas scaling), FormElement (type dispatch), StepCarousel (prev/next with dots), StateBadge (ISA-88 color/icon indicators), common controls
4. **apps/mobile + apps/web** — Composition roots: EngineProvider (dependency injection wiring), bridge (engine events → Zustand), screen components, navigation
5. **Zustand Stores (app layer)** — Reactive cache rebuilt from SQLite on startup; source of truth is always SQLite, never Zustand
6. **EventBus bridge** — One-way: engine emits typed events; bridge translates to Zustand store mutations; UI re-renders reactively

**Key architectural patterns (all HIGH confidence):**
- Table-driven state machine (data table IS the spec — testable per-row, extensible by row addition)
- Interface-based DI for engine purity (constructor injection, no DI framework needed)
- Event bus for engine-to-UI communication (engine never knows about React)
- Write-ahead persistence (SQLite before Zustand, always)
- Canvas scaling via `transform: [{ scale }]` on a container — NOT individual element repositioning (interactive elements must render at native size with computed screen coordinates)
- Serial async event queue (prevents state machine race conditions in parallel branches)

### Critical Pitfalls

See `.planning/research/PITFALLS.md` for full prevention strategies, warning signs, and recovery costs.

1. **expo-sqlite transaction scope leakage** — `withTransactionAsync()` silently includes any concurrent query in the transaction, causing unpredictable rollbacks. Use `withExclusiveTransactionAsync()` everywhere; ban `withTransactionAsync()` via CI lint. On web (wa-sqlite), exclusive transactions are not supported — use a JS-level write queue instead. Address in Phase 1.

2. **Zustand/SQLite dual-state desynchronization** — The instinct to optimistic-update Zustand before SQLite write will cause data loss on crash. Enforce write-ahead order in every mutation: `await sqliteWrite()` then `store.setState()`. Never use Zustand persist middleware alongside SQLite. Add a startup integrity check. Address in Phase 1.

3. **Web platform as second-class citizen** — expo-sqlite on web (wa-sqlite/WASM) lacks WAL mode, lacks exclusive transactions, is 3-10x slower, and requires specific HTTP headers (COOP/COEP) that must be configured in Docker/nginx from day one. Test on web from the first feature. No feature is "done" until it passes on Android, iOS, and web. Address in Phase 1.

4. **State machine race conditions under parallel execution** — JavaScript async/await allows multiple concurrent "step completed" handlers to run against the same un-mutated state, causing double-activations of join nodes and dual resource grants. Implement a serial async event queue that processes all engine events one at a time before dequeuing the next. Design this before building the scheduler. Address in Phase 2.

5. **WYSIWYG form rendering fidelity** — Absolute positioning at design-canvas scale must survive PixelRatio (1x–3.5x), font scale (0.8x–3.0x iOS), and platform font metric differences. Apply `allowFontScaling={false}` within form containers. Compute interactive element positions in screen coordinates rather than applying scale to touch targets. Build and test the scaling algorithm against 5 device types before building individual element renderers. Address in Phase 3.

6. **Monorepo Metro bundler resolution** — Multiple React copies cause "Invalid hook call" crashes. Shared packages must list React/RN as `peerDependencies` only. Add `overrides` in root package.json. Validate the monorepo wiring with a hello-world smoke test on all three platforms before any feature work. Address in Phase 1.

---

## Implications for Roadmap

The research converges on a clear build order driven by three constraints: (1) the engine package is the dependency root that every other package depends on; (2) write-ahead persistence and web platform configuration must be correct from day one or every subsequent phase will inherit the defect; (3) the ISA-88 state machine is the most complex single component and the foundation for all scheduling, resource management, and workflow proxy logic.

### Phase 1: Foundation (Monorepo + Storage + Cross-Platform Baseline)

**Rationale:** Four of the six critical pitfalls must be prevented before any feature work begins. Metro resolution failures, transaction scope leakage, Zustand/SQLite desync, and web platform divergence are all Phase 1 structural defects. Fixing them after features are built is extremely expensive (rated HIGH recovery cost in PITFALLS.md).

**Delivers:**
- Validated monorepo structure with all packages building on Android, iOS, and web
- SQLite schema with WAL mode, migrations, and exclusive transaction discipline
- Write-ahead state management contract: helper functions enforcing SQLite-before-Zustand ordering
- Docker/nginx configuration with COOP/COEP headers for web
- Web write-queue abstraction (wa-sqlite has no exclusive transactions)
- expo-sqlite/kv-store for lightweight UI preferences (Zustand persist adapter)
- CI pipeline that builds and tests all three platforms on every commit

**Addresses:** Monorepo bootstrap, storage schema, crash recovery foundation, web platform configuration

**Avoids:** All Phase 1 pitfalls (transaction scope leakage, Zustand/SQLite desync, Metro resolution, web platform divergence)

**Research flag:** Standard patterns — well-documented (Expo monorepo guide, expo-sqlite docs). Skip research-phase.

---

### Phase 2: Engine Core (State Machine + Scheduler + Import Pipeline)

**Rationale:** The engine is the dependency root; storage and UI packages depend on its interfaces. The state machine is the most complex single component and must be built and tested before the scheduler, which depends on it. The serial event queue must be designed before the scheduler to prevent race conditions. The import pipeline provides content for all subsequent phases.

**Delivers:**
- packages/engine: all interfaces, types, and sub-components
  - Table-driven ISA-88 state machine (all 20+ states, all transitions including HOLD/UNHOLD, STOP, ABORT/CLEAR)
  - Serial async event queue (prevents race conditions in parallel branches)
  - DAG-based scheduler with adjacency lists (PARALLEL, WAIT ALL, WAIT ANY)
  - Resource manager (FIFO queues, alphabetical acquisition order, SYNC barriers)
  - Parameter resolver (literal + scope chain property lookup, output writing)
  - Condition evaluator (SELECT 1, 10 operators, type coercion)
  - WorkflowRunner top-level orchestrator
  - Typed EngineEventBus
- .WFmasterX import pipeline: expo-document-picker + fflate ZIP extraction + manifest parsing + schema validation + SQLite storage of master workflows, environments, actions, images
- Crash recovery: startup SQLite query → Zustand rebuild → engine state reconstruction
- Vitest test suite for all engine sub-components (unit tests per transition row, parallel branch scenarios, deadlock prevention, crash recovery)

**Uses:** fflate (ZIP), expo-document-picker, expo-file-system, expo-sqlite repositories from Phase 1

**Implements:** Engine package, storage repositories (runtime-workflow, runtime-step, value-property, resource-pool, execution-log)

**Avoids:** State machine race conditions (serial event queue built here); crash recovery gaps (write-ahead validated here)

**Research flag:** ISA-88 state machine and DAG scheduler are well-researched with detailed code examples in ARCHITECTURE.md. No additional research-phase needed. The SYNC barrier matching logic (Send/Receive/Synchronize) deserves careful implementation review against the spec.

---

### Phase 3: UI Shell + Form Renderer + Execution Screen

**Rationale:** With the engine tested and proven in isolation, the UI layer can be built on top of it. The form renderer is the highest-risk UI component (WYSIWYG fidelity pitfall); it must be designed and tested across device types before individual element renderers are built. The step carousel is the primary UX innovation for parallel branch navigation and must handle position persistence across tab switches and crash recovery.

**Delivers:**
- packages/ui: FormCanvas (canvas scaling algorithm), FormElement (type dispatch), all element renderers (TextElement, InputElement, ImageElement, CheckboxElement, etc.)
- StepCarousel (Previous/Next, dot indicators, wrap-around, position persistence)
- StateBadge (ISA-88 state colors and icons)
- Execute screen wiring: engine bridge → Zustand → StepCarousel → FormCanvas
- Home screen: workflow library list, active workflow list with state badges and progress
- State controls UI: Pause/Resume/Stop/Abort with confirmation dialogs
- Yes/No step renderer (simplified form with custom label buttons)
- Visual regression test harness: reference form rendered on 5 device types vs. BrainPal MD screenshots

**Uses:** react-native-svg (canvas scaling math), react-native-reanimated (carousel transitions), react-native-safe-area-context

**Implements:** UI package + Execute and Home screens

**Avoids:** WYSIWYG fidelity pitfall (scaling algorithm built and tested before element renderers); over-scaling interactive elements (compute screen coordinates, render inputs at native size)

**Research flag:** Canvas scaling has a specific algorithm documented in ARCHITECTURE.md with known edge cases (PixelRatio, font scale, ForeignObject limitations). No additional research needed. The interactive-element touch target issue (anti-pattern 6 in ARCHITECTURE.md) needs careful implementation per the documented approach.

---

### Phase 4: History, Notifications, Settings + Workflow Proxy

**Rationale:** History, notifications, and settings enhance the execution experience but do not block it — they consume engine events without producing them. Workflow Proxy is a P1 feature but is the most complex integration point (depends on nearly everything: scheduler, state machine, parameter resolver, resource manager) and should come after the core execution path is proven. The execution logger must be capturing data (Phase 2) before history display makes sense.

**Delivers:**
- History screen: per-workflow execution log, step-level detail with inputs/outputs, state transitions, timing
- Notifications: expo-notifications (mobile) + Browser Notification API (web) for step attention, errors, state transitions; in-app toast/snackbar for foreground
- Settings screen: notification preference toggles, storage usage info, clear completed workflows action
- Workflow Proxy: deep-copy child spec, create child RuntimeWorkflow, run independently, propagate output parameters to parent step on child completion; PAUSE/ABORT propagation to child workflows
- Bottom tab navigation (all 5 tabs: Home, Execute, Overview placeholder, History, Settings)

**Uses:** expo-notifications 0.32, expo-router tabs layout

**Implements:** Execution logger queries (History), notification dispatch bridge, Workflow Proxy in engine

**Avoids:** Child workflow output propagation gap (explicitly on the "Looks Done But Isn't" checklist in PITFALLS.md)

**Research flag:** Workflow Proxy nesting depth limit (recommend max 10 levels per PITFALLS.md performance traps) should be a deliberate implementation choice. Otherwise standard patterns.

---

### Phase 5: Polish, Performance, PDF Export + v1.x Features

**Rationale:** Once all P1 features are complete and validated across platforms, the final phase addresses polish, the most common production performance traps, and P2 features that were validated as useful by early testing.

**Delivers:**
- PDF/HTML execution report export (expo-print + expo-sharing; HTML fallback for web)
- Granular Zustand selectors to prevent cross-workflow re-renders (performance trap: > 20 steps)
- SQLite query indexes on frequently queried columns (`step.workflow_id`, `step.state`, `workflow.status`, `log.workflow_id`)
- Paginated execution history loading (LIMIT/OFFSET; avoid loading > 100 log entries into memory)
- Progress indicator during ZIP import (long-running operation feedback)
- Confirmation dialogs for all destructive actions (STOP, ABORT, DELETE workflow)
- Startup integrity check validating state machine invariants (no step in impossible dual-state)
- Improved error display for malformed workflow packages

**Uses:** expo-print, expo-sharing, existing engine/storage/ui packages

**Avoids:** Performance traps (re-renders, SQLite query growth, memory from unbounded log arrays); UX pitfalls (no feedback on long operations, no confirmation on destructive actions)

**Research flag:** expo-print on web prints the current page, not custom HTML — the web-specific fallback (generate HTML + window.print() or file download) needs explicit handling. Otherwise standard patterns.

---

### Phase Ordering Rationale

- **Foundation before engine:** The storage layer, web configuration, and transaction discipline must be correct before any engine state writes occur. A retroactive fix to transaction isolation is rated HIGH recovery cost.
- **Engine before UI:** The engine package is the dependency root. UI components consume engine types and react to engine events; they cannot be built against a moving interface.
- **Scaling algorithm before element renderers:** If the canvas scaling math is wrong, every form element renderer must be rebuilt. Two hours on the algorithm saves weeks on the fix.
- **Serial event queue before scheduler:** The event queue is a prerequisite for the scheduler. Adding it after parallel branches are implemented requires a near-complete rewrite of the scheduling layer.
- **State machine before Workflow Proxy:** The proxy creates child workflow instances that each need their own scheduler, state machine, and resource manager. All of those must work correctly before the nesting logic adds another layer.
- **Core execution before history/notifications:** The execution logger must be capturing data before history display is meaningful. Notifications enhance but do not block execution; they can be verified end-to-end only after the execution events they react to exist.

### Research Flags

Phases needing deeper research during planning:
- **Phase 1 (web/Docker configuration):** The specific COOP/COEP header values and Metro WASM configuration need verification against the exact Docker setup. PITFALLS.md provides the directives but the exact nginx config will depend on deployment target.
- **Phase 2 (SYNC barrier implementation):** The Synchronize/Send/Receive matching logic is specified in the project spec but has no existing code examples. This warrants careful review against the spec during phase planning to clarify edge cases (partial barrier cleanup on ABORT, barrier state persistence for crash recovery).
- **Phase 3 (interactive element touch targets after canvas scaling):** The documented approach (compute screen coordinates, render inputs at native size outside the scaled container) needs a proof-of-concept before committing to the full element renderer implementation.

Phases with standard patterns (skip research-phase):
- **Phase 1 (monorepo + SQLite setup):** Expo monorepo guide is official documentation. SQLite WAL and exclusive transactions are well-documented. Standard patterns.
- **Phase 2 (table-driven state machine):** Pattern is well-established in TypeScript with examples in ARCHITECTURE.md. ISA-88 transition table is specified in the project. No research needed.
- **Phase 4 (notifications):** expo-notifications is well-documented with SDK 54. Standard local notification patterns.
- **Phase 5 (PDF export):** expo-print usage is straightforward with documented web caveat.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Core stack pre-decided; supporting library choices verified against official docs and npm. fflate over JSZip recommendation is MEDIUM (fflate stable but ~2 years since last release; ZIP format is stable). |
| Features | HIGH | Detailed project specifications (8 spec files) are authoritative. Competitive landscape verified via multiple industry sources. Feature prioritization derives directly from dependency graph. |
| Architecture | HIGH | Patterns (table-driven state machine, DI interfaces, event bus, write-ahead) are well-established with code examples. Monorepo structure derived from official Expo docs. |
| Pitfalls | MEDIUM-HIGH | expo-sqlite transaction scope leakage and wa-sqlite limitations are documented in official sources and GitHub issues. Race condition analysis is derived from JavaScript async model — MEDIUM confidence on edge cases. Form rendering pitfalls are documented with PixelRatio ranges from official RN docs. |

**Overall confidence:** HIGH

### Gaps to Address

- **expo-sqlite web (wa-sqlite) stability:** Web support is alpha. The write-queue abstraction needed on web (no exclusive transactions) will need integration testing to verify correctness. Plan for 1-2 iteration cycles on the web persistence layer.
- **fflate on Expo Go vs. dev builds:** fflate is pure JS and should work in Expo Go, but this needs explicit validation early in Phase 2. If it fails, the fallback is react-native-zip-archive (requires dev builds) or JSZip with polyfills (requires Metro config).
- **SYNC barrier crash recovery:** What state must be persisted for SYNC barriers to survive an app crash mid-rendezvous? This needs explicit design during Phase 2 planning. The pitfalls file flags it but does not resolve it.
- **Workflow Proxy nesting depth:** The project spec does not specify a maximum nesting depth. A default of 10 levels is recommended in PITFALLS.md as a performance guard. This should be confirmed with the product stakeholder before implementation.
- **expo-print + web:** On web, expo-print prints the current page rather than custom HTML. The v1.x PDF export feature needs a web-specific implementation path (HTML download or window.print with a print-styled div). Scope this explicitly when PDF export is planned.

---

## Sources

### Primary (HIGH confidence)
- Expo SDK 54 Changelog — `https://expo.dev/changelog/sdk-54` — SDK version rationale, React Native 0.81, New Architecture
- Expo SQLite Documentation — `https://docs.expo.dev/versions/latest/sdk/sqlite/` — transaction scope warnings, web alpha status, exclusive transaction API
- Expo Monorepo Guide — `https://docs.expo.dev/guides/monorepos/` — SDK 52+ auto-config, peerDependency requirements
- ISA-88 / S88 Batch Control — `https://www.plcacademy.com/isa-88-s88-batch-control-explained/` — state machine model, phase transitions
- BrainPal Mobile Project Specifications — `.BrainPalMobile/PROJECT.md`, `ExecutionEngineSpec.md`, `StateMachineSpec.md`, `UISpec.md`, `DataModelSpec.md`, `StorageSpec.md`, `PackageFormatSpec.md`, `ArchitectureSpec.md` — authoritative project requirements
- React Native Layout Props — `https://reactnative.dev/docs/layout-props` — absolute positioning semantics, PixelRatio documentation
- Zustand Documentation — `https://github.com/pmndrs/zustand` — persist middleware, store patterns

### Secondary (MEDIUM confidence)
- fflate GitHub — `https://github.com/101arrowz/fflate` — pure JS, zero deps, performance vs JSZip
- JSZip Expo Issue #521 — `https://github.com/Stuk/jszip/issues/521` — compatibility problems
- Expo GitHub Issue #33754 — `https://github.com/expo/expo/issues/33754` — "database is locked" under high concurrency
- Vitest vs Jest 2026 — multiple community benchmarks — 10x speed advantage for pure TS, React Native limitation confirmed
- DAG-based workflow engine design — `https://bugfree.ai/knowledge-hub/designing-a-dag-based-workflow-engine-from-scratch` — adjacency list scheduler pattern
- Typed EventEmitter patterns — community TypeScript libraries — pub/sub event bus design
- Connected Worker Platforms 2026 — `https://thectoclub.com/tools/best-connected-worker-platforms/` — competitive feature landscape
- Top Digital Work Instruction Software 2026 — `https://gitnux.org/best/digital-work-instruction-software/` — competitor feature analysis

### Tertiary (LOW confidence)
- Expo SDK 54 Upgrade community post — real-world upgrade experience; informational only, not relied on for decisions

---
*Research completed: 2026-02-24*
*Ready for roadmap: yes*
