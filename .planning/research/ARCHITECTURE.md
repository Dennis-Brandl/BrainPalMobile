# Architecture Research

**Domain:** Cross-platform runtime workflow execution engine (React Native + Expo monorepo)
**Researched:** 2026-02-24
**Confidence:** HIGH (specifications are well-defined; patterns are well-established in the ecosystem)

## System Overview

```
+===========================================================================+
|                        PRESENTATION LAYER                                  |
|  +----------+  +----------+  +---------+  +---------+  +----------+       |
|  |  Home    |  | Execute  |  |Overview |  | History |  | Settings |       |
|  | Screen   |  | Screen   |  | Screen  |  | Screen  |  | Screen   |       |
|  +----+-----+  +----+-----+  +----+----+  +----+----+  +----+-----+       |
|       |             |             |             |             |            |
+===========================================================================+
|                        SHARED UI PACKAGE (packages/ui)                     |
|  +----------------+  +---------------+  +--------------+  +----------+    |
|  | Form Renderer  |  | Step Carousel |  | State Badges |  |  Common  |    |
|  | (WYSIWYG)      |  | (Prev/Next)   |  | (ISA-88)     |  | Controls |    |
|  +-------+--------+  +-------+-------+  +------+-------+  +----+-----+    |
|          |                    |                  |               |         |
+===========================================================================+
|                        STATE MANAGEMENT LAYER                              |
|  +------------------+  +------------------+  +------------------+         |
|  | useWorkflowStore |  | usePackageStore  |  | useNotification  |         |
|  | (Zustand)        |  | (Zustand)        |  | Store (Zustand)  |         |
|  +--------+---------+  +--------+---------+  +--------+---------+         |
|           |                      |                      |                 |
|  +--------v---------------------------------------------------------+     |
|  |              Event Bus (typed EventEmitter)                      |     |
|  +--------+---------------------------------------------------------+     |
|           |                                                               |
+===========================================================================+
|                        ENGINE PACKAGE (packages/engine) -- PURE TS        |
|  +-------------------------------------------------------------------+   |
|  |                     Workflow Runner                                 |   |
|  |  (Top-level orchestrator: lifecycle, nesting, event emission)      |   |
|  +-+--------+----------+-----------+-----------+--------------------+-+   |
|    |        |          |           |           |                    |     |
|  +-v----+ +-v------+ +-v-------+ +-v--------+ +-v-----------+         |   |
|  |State | |Sched-  | |Resource | |Parameter | |Condition    |         |   |
|  |Mach. | |uler    | |Manager  | |Resolver  | |Evaluator    |         |   |
|  |(ISA  | |(DAG    | |(FIFO,   | |(Literal, | |(SELECT 1,   |         |   |
|  | 88)  | | walk)  | | SYNC)   | | PropRef) | | 10 ops)     |         |   |
|  +------+ +--------+ +---------+ +----------+ +-------------+         |   |
|                                                                           |
|  Communicates via: Repository INTERFACES (no platform deps)               |
+===========================================================================+
|                        STORAGE PACKAGE (packages/storage)                  |
|  +-----------------+  +-----------------+  +-----------------+            |
|  | Master Repos    |  | Runtime Repos   |  | Log/Queue Repos |            |
|  | (Workflow, Env,  |  | (Workflow, Step, |  | (ExecLog, State |            |
|  |  Action, Image) |  |  Conn, Binding) |  |  Trans, Offline)|            |
|  +--------+--------+  +--------+--------+  +--------+--------+            |
|           |                     |                     |                    |
|  +--------v---------------------v---------------------v--------+          |
|  |                    expo-sqlite (WAL mode)                    |          |
|  +--------------------------------------------------------------+          |
+===========================================================================+
|                        PROTOCOL PACKAGE (packages/protocol)                |
|  +---------------+  +---------------+  +------------------+               |
|  | REST Client   |  | SSE Client    |  | Offline Queue    |               |
|  | (fetch-based) |  | (EventSource) |  | (replay on conn) |               |
|  +---------------+  +---------------+  +------------------+               |
+===========================================================================+
```

### Component Responsibilities

| Component | Responsibility | Communicates With |
|-----------|----------------|-------------------|
| **apps/mobile** | Expo app shell, platform navigation, screen composition | ui, storage, engine (via stores) |
| **apps/web** | React Native Web + Docker hosting, web-specific layouts | ui, storage, engine (via stores) |
| **packages/engine** | All business logic: state machine, scheduling, resources, parameters, conditions | Storage (via interfaces), Protocol (via interfaces) |
| **packages/storage** | SQLite schema, migrations, DAO repositories, expo-sqlite integration | expo-sqlite (platform) |
| **packages/protocol** | REST/SSE communication with action servers, offline queue | Network (fetch, EventSource) |
| **packages/ui** | Shared React Native components: form renderer, carousel, badges, common controls | engine (types only), React Native |
| **Zustand Stores** | In-memory reactive state, bridge between engine events and UI re-renders | engine (subscribes to events), storage (persists), ui (drives renders) |

## Recommended Project Structure

```
brainpal-mobile/
+-- apps/
|   +-- mobile/                         # Expo app (Android + iOS)
|   |   +-- app.json                    # Expo config
|   |   +-- metro.config.js             # Metro bundler (auto for SDK 52+)
|   |   +-- src/
|   |   |   +-- screens/               # Screen components
|   |   |   +-- navigation/            # React Navigation bottom tabs + stack
|   |   |   +-- hooks/                 # Platform-specific hooks
|   |   |   +-- stores/                # Zustand store definitions
|   |   |   +-- bridge/                # Engine-to-store bridge (event listeners)
|   |   |   +-- providers/             # SQLiteProvider, EngineProvider
|   |   |   +-- platform/              # Platform-specific implementations
|   |   +-- __tests__/
|   |
|   +-- web/                            # React Native Web + Docker
|       +-- src/
|       |   +-- screens/               # Web-optimized layouts
|       |   +-- stores/                # Same Zustand stores (shared pattern)
|       |   +-- bridge/                # Same bridge pattern
|       |   +-- server/                # Express server for Docker
|       +-- Dockerfile
|       +-- docker-compose.yml
|
+-- packages/
|   +-- engine/                         # Pure TypeScript (NO platform deps)
|   |   +-- src/
|   |   |   +-- state-machine/
|   |   |   |   +-- types.ts           # StepState, StateEvent, TransitionRule
|   |   |   |   +-- state-machine.ts   # Generic table-driven state machine
|   |   |   |   +-- isa88-config.ts    # ISA-88 transition table (data)
|   |   |   |   +-- index.ts
|   |   |   +-- scheduler/
|   |   |   |   +-- types.ts           # Graph types, active step list
|   |   |   |   +-- scheduler.ts       # DAG traversal, step activation
|   |   |   |   +-- parallel.ts        # PARALLEL/WAIT ALL/WAIT ANY logic
|   |   |   |   +-- index.ts
|   |   |   +-- resource-manager/
|   |   |   |   +-- types.ts           # ResourcePool, ResourceQueue
|   |   |   |   +-- resource-manager.ts # Acquisition, release, deadlock prevention
|   |   |   |   +-- sync-barrier.ts    # SYNC resource matching
|   |   |   |   +-- index.ts
|   |   |   +-- parameter-resolver/
|   |   |   |   +-- types.ts           # ResolvedParameter
|   |   |   |   +-- parameter-resolver.ts # Input resolution, output writing
|   |   |   |   +-- scope-resolver.ts  # Workflow/environment scope chain
|   |   |   |   +-- index.ts
|   |   |   +-- condition-evaluator/
|   |   |   |   +-- types.ts           # ComparisonOperator
|   |   |   |   +-- condition-evaluator.ts # 10 operators, type coercion
|   |   |   |   +-- index.ts
|   |   |   +-- workflow-runner/
|   |   |   |   +-- types.ts           # EngineEvent, RunnerConfig
|   |   |   |   +-- workflow-runner.ts  # Top-level orchestrator
|   |   |   |   +-- step-executor.ts   # Step-type dispatch (per step type)
|   |   |   |   +-- lifecycle.ts       # Create, start, complete, abort
|   |   |   |   +-- index.ts
|   |   |   +-- interfaces/
|   |   |   |   +-- storage.ts         # IWorkflowRepository, IStepRepository, etc.
|   |   |   |   +-- protocol.ts        # IActionClient, ISSEClient
|   |   |   |   +-- logger.ts          # IExecutionLogger
|   |   |   +-- events/
|   |   |   |   +-- event-bus.ts       # Typed EventEmitter (zero deps)
|   |   |   |   +-- types.ts           # EngineEvent union type
|   |   |   +-- types/                  # Shared data model types
|   |   |   |   +-- master.ts          # Master information system types
|   |   |   |   +-- runtime.ts         # Runtime execution system types
|   |   |   |   +-- common.ts          # ManagedElement, StepType, etc.
|   |   |   +-- index.ts               # Public API surface
|   |   +-- __tests__/
|   |       +-- state-machine/
|   |       +-- scheduler/
|   |       +-- resource-manager/
|   |       +-- parameter-resolver/
|   |       +-- condition-evaluator/
|   |       +-- workflow-runner/
|   |       +-- fixtures/              # Test workflow specs (JSON)
|   |
|   +-- storage/                        # SQLite via expo-sqlite
|   |   +-- src/
|   |   |   +-- database/
|   |   |   |   +-- connection.ts      # Database open, WAL pragma, init
|   |   |   |   +-- migrations.ts      # Schema versioning, ALTER TABLE
|   |   |   |   +-- schema.ts          # CREATE TABLE statements
|   |   |   +-- repositories/
|   |   |   |   +-- master-workflow.repo.ts
|   |   |   |   +-- runtime-workflow.repo.ts
|   |   |   |   +-- runtime-step.repo.ts
|   |   |   |   +-- value-property.repo.ts
|   |   |   |   +-- resource-pool.repo.ts
|   |   |   |   +-- execution-log.repo.ts
|   |   |   |   +-- offline-queue.repo.ts
|   |   |   +-- types/
|   |   |   +-- index.ts
|   |   +-- __tests__/
|   |
|   +-- protocol/                       # REST/SSE client (v2 scope)
|   |   +-- src/
|   |   |   +-- rest-client/
|   |   |   +-- sse-client/
|   |   |   +-- offline-queue/
|   |   |   +-- types/
|   |   |   +-- index.ts
|   |   +-- __tests__/
|   |
|   +-- ui/                             # Shared React Native components
|       +-- src/
|       |   +-- form-renderer/
|       |   |   +-- FormCanvas.tsx      # Scaling container
|       |   |   +-- FormElement.tsx     # Element type dispatch
|       |   |   +-- elements/           # TextElement, InputElement, etc.
|       |   |   +-- DeviceSelector.ts   # Phone/tablet/desktop detection
|       |   |   +-- scaling.ts          # Canvas-to-screen math
|       |   |   +-- index.ts
|       |   +-- step-carousel/
|       |   |   +-- StepCarousel.tsx    # Previous/Next with wrap-around
|       |   |   +-- DotIndicator.tsx    # Active step dots
|       |   +-- state-badge/
|       |   |   +-- StateBadge.tsx      # Color + icon state indicators
|       |   +-- common/                 # Buttons, cards, modals
|       |   +-- theme/                  # Colors, typography, spacing
|       |   +-- index.ts
|       +-- __tests__/
|
+-- package.json                        # Root workspace config
+-- tsconfig.base.json                  # Shared TypeScript config
+-- turbo.json                          # Turborepo build orchestration
```

### Structure Rationale

- **packages/engine/ is PURE TypeScript**: No React, no React Native, no expo-sqlite. Communicates with storage and protocol through interfaces defined in `interfaces/`. This makes it testable with `vitest` in Node.js with zero platform setup.
- **packages/storage/ owns all SQLite access**: Implements the interfaces defined by engine. The engine never imports expo-sqlite directly.
- **apps/*/stores/ + bridge/**: The Zustand stores live in the app layer because they bridge engine events to UI reactivity. The `bridge/` folder subscribes to engine events and dispatches Zustand store updates.
- **packages/ui/ is presentation-only**: No business logic. Receives data through props and callbacks. Depends on engine only for TYPE imports (never runtime calls).

## Architectural Patterns

### Pattern 1: Table-Driven State Machine (Confidence: HIGH)

**What:** The ISA-88 state machine is implemented as a generic, data-driven engine. The transition table is a plain data structure (array of `{from, event, to, guard?, action?}` rules). The state machine class reads this table at runtime -- no switch/case, no if/else chains for state transitions.

**When to use:** Always for the ISA-88 step state machine and action state machine. The same generic class is instantiated once per runtime step, configured with the ISA-88 transition table.

**Trade-offs:** Slightly more abstract than a simple switch statement, but massively easier to test (test each transition row independently), extend (add a row to the table), and audit (the table IS the specification).

**Example:**
```typescript
// isa88-config.ts -- The transition table IS the specification
export const ISA88_OBSERVABLE_TRANSITIONS: StateTransitionRule[] = [
  { from: 'IDLE',       event: 'START',   to: 'WAITING'    },
  { from: 'WAITING',    event: 'SC',      to: 'STARTING'   },
  { from: 'STARTING',   event: 'SC',      to: 'EXECUTING'  },
  { from: 'EXECUTING',  event: 'SC',      to: 'COMPLETING' },
  { from: 'EXECUTING',  event: 'PAUSE',   to: 'PAUSING'    },
  { from: 'EXECUTING',  event: 'HOLD',    to: 'HOLDING'    },
  { from: 'PAUSING',    event: 'SC',      to: 'PAUSED'     },
  { from: 'PAUSED',     event: 'RESUME',  to: 'UNPAUSING'  },
  { from: 'UNPAUSING',  event: 'SC',      to: 'EXECUTING'  },
  { from: 'HOLDING',    event: 'SC',      to: 'HELD'       },
  { from: 'HELD',       event: 'UNHOLD',  to: 'UNHOLDING'  },
  { from: 'UNHOLDING',  event: 'SC',      to: 'EXECUTING'  },
  { from: 'COMPLETING', event: 'SC',      to: 'COMPLETED'  },
  // ABORT from any active state (use guard for "any active" set)
  { from: '*_ACTIVE',   event: 'ABORT',   to: 'ABORTING',
    guard: (ctx) => ACTIVE_STATES.has(ctx.currentState) },
  { from: 'ABORTING',   event: 'SC',      to: 'ABORTED'    },
  { from: 'ABORTED',    event: 'CLEAR',   to: 'CLEARING'   },
  { from: 'CLEARING',   event: 'SC',      to: 'COMPLETED'  },
  { from: '*_ACTIVE',   event: 'STOP',    to: 'STOPPING',
    guard: (ctx) => ACTIVE_STATES.has(ctx.currentState) },
  { from: 'STOPPING',   event: 'SC',      to: 'COMPLETED'  },
];

// state-machine.ts -- Generic, reusable
export class StateMachine<TState extends string, TEvent extends string> {
  private currentState: TState;
  private transitions: StateTransitionRule<TState, TEvent>[];
  private listeners: Array<(from: TState, to: TState, event: TEvent) => void> = [];

  constructor(config: StateMachineConfig<TState, TEvent>) {
    this.currentState = config.initialState;
    this.transitions = config.transitions;
  }

  send(event: TEvent, context?: StepContext): TState {
    const rule = this.transitions.find(
      t => (t.from === this.currentState || t.from === '*_ACTIVE') &&
           t.event === event &&
           (!t.guard || t.guard(context))
    );
    if (!rule) {
      throw new InvalidTransitionError(this.currentState, event);
    }
    const from = this.currentState;
    this.currentState = rule.to;
    if (rule.action) rule.action(context);
    this.listeners.forEach(fn => fn(from, rule.to, event));
    return this.currentState;
  }

  getState(): TState { return this.currentState; }

  onTransition(fn: (from: TState, to: TState, event: TEvent) => void): void {
    this.listeners.push(fn);
  }
}
```

### Pattern 2: Interface-Based Dependency Injection for Engine Purity (Confidence: HIGH)

**What:** The engine package defines TypeScript interfaces for all external dependencies (storage, protocol, logging). The app layer creates concrete implementations and injects them when constructing the WorkflowRunner. No DI framework needed -- constructor injection with interfaces is sufficient.

**When to use:** Always. This is the foundation of engine testability and platform independence.

**Trade-offs:** Requires defining interfaces upfront. Slightly more ceremony than direct imports. But makes the engine completely unit-testable with in-memory mocks and completely decoupled from platform.

**Example:**
```typescript
// packages/engine/src/interfaces/storage.ts
export interface IWorkflowRepository {
  getById(instanceId: string): Promise<RuntimeWorkflow | null>;
  save(workflow: RuntimeWorkflow): Promise<void>;
  updateState(instanceId: string, state: WorkflowState): Promise<void>;
  getActive(): Promise<RuntimeWorkflow[]>;
}

export interface IStepRepository {
  getByWorkflow(workflowInstanceId: string): Promise<RuntimeWorkflowStep[]>;
  updateState(instanceId: string, state: StepState): Promise<void>;
  save(step: RuntimeWorkflowStep): Promise<void>;
}

export interface IExecutionLogger {
  log(entry: ExecutionLogEntry): Promise<void>;
  getByWorkflow(workflowInstanceId: string): Promise<ExecutionLogEntry[]>;
}

// packages/engine/src/workflow-runner/workflow-runner.ts
export class WorkflowRunner {
  constructor(
    private readonly workflowRepo: IWorkflowRepository,
    private readonly stepRepo: IStepRepository,
    private readonly logger: IExecutionLogger,
    private readonly eventBus: EngineEventBus,
    // ...other interfaces
  ) {}
}

// apps/mobile/src/providers/EngineProvider.tsx -- wiring
const workflowRepo = new SQLiteWorkflowRepository(db); // from packages/storage
const stepRepo = new SQLiteStepRepository(db);
const logger = new SQLiteExecutionLogger(db);
const eventBus = new EngineEventBus();
const runner = new WorkflowRunner(workflowRepo, stepRepo, logger, eventBus);
```

### Pattern 3: Event Bus for Engine-to-UI Communication (Confidence: HIGH)

**What:** The engine emits typed events through a lightweight EventEmitter. Zustand stores subscribe to these events in a "bridge" layer. This keeps the engine ignorant of Zustand/React while enabling reactive UI updates.

**When to use:** For ALL engine-to-UI communication. The engine never calls Zustand directly. The bridge layer translates engine events into store mutations.

**Trade-offs:** Adds an indirection layer between engine and UI. But this indirection is exactly what maintains engine purity and testability. The bridge is thin -- typically 5-10 lines per event type.

**Example:**
```typescript
// packages/engine/src/events/event-bus.ts
type EventMap = {
  'WORKFLOW_STARTED':     { workflowInstanceId: string };
  'STEP_STATE_CHANGED':   { stepInstanceId: string; from: StepState; to: StepState };
  'ACTIVE_STEPS_CHANGED': { activeSteps: RuntimeWorkflowStep[] };
  'USER_INPUT_REQUIRED':  { stepInstanceId: string };
  'ERROR':                { source: string; message: string };
};

export class EngineEventBus {
  private handlers = new Map<string, Set<Function>>();

  on<K extends keyof EventMap>(event: K, handler: (data: EventMap[K]) => void): () => void {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
    return () => this.handlers.get(event)?.delete(handler); // Returns unsubscribe
  }

  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    this.handlers.get(event)?.forEach(fn => fn(data));
  }
}

// apps/mobile/src/bridge/engine-bridge.ts
export function bridgeEngineToStores(
  eventBus: EngineEventBus,
  workflowStore: WorkflowStoreApi,
) {
  eventBus.on('STEP_STATE_CHANGED', ({ stepInstanceId, from, to }) => {
    workflowStore.getState().updateStepState(stepInstanceId, to);
  });

  eventBus.on('ACTIVE_STEPS_CHANGED', ({ activeSteps }) => {
    workflowStore.getState().setActiveSteps(activeSteps);
  });

  eventBus.on('USER_INPUT_REQUIRED', ({ stepInstanceId }) => {
    // Could trigger navigation, notification, etc.
    workflowStore.getState().setAttentionStep(stepInstanceId);
  });
}
```

### Pattern 4: Write-Ahead Persistence (SQLite before Zustand) (Confidence: HIGH)

**What:** All state mutations follow a strict order: (1) Write to SQLite, (2) Update Zustand store, (3) UI re-renders reactively. If the app crashes between steps 1 and 2, on restart the SQLite state is the source of truth. Zustand is rebuilt from SQLite on app launch.

**When to use:** For ALL runtime state changes (step states, workflow states, value properties, resource pools). Master data (read-only) does not need this pattern.

**Trade-offs:** Every state change involves a SQLite write before the UI updates. This adds latency (typically 1-5ms per write with WAL mode). But it guarantees crash recovery. The alternative (Zustand-first) risks losing state on crash.

**Data flow:**
```
Engine decides state change
    |
    v
1. SQLite write (via repository interface)
    |
    v
2. Engine emits event on EventBus
    |
    v
3. Bridge receives event, updates Zustand store
    |
    v
4. React components re-render (Zustand subscription)
```

**On app restart (crash recovery):**
```
1. Open SQLite database
2. Query runtime_workflows WHERE state IN ('RUNNING', 'PAUSED')
3. Load all runtime_steps for each active workflow
4. Rebuild Zustand stores from SQLite state
5. Reconstruct engine state (state machines, scheduler, resource manager)
6. Resume execution from last persisted state
```

### Pattern 5: Canvas Scaling for Cross-Platform Form Rendering (Confidence: MEDIUM)

**What:** The WYSIWYG form renderer uses a scaling container that maps a fixed-size design canvas (defined by `canvasWidth` x `canvasHeight` in the form spec) to the actual screen dimensions. All form elements use absolute positioning within the canvas, and the entire canvas is uniformly scaled using a CSS transform.

**When to use:** For all WYSIWYG form rendering. The form spec defines element positions in canvas coordinates. The renderer scales the canvas to fit the device screen.

**Trade-offs:** Absolute positioning is less flexible than Flexbox for responsive layouts, but that is by design: these are WYSIWYG forms authored in BrainPal MD with exact element placement. Scaling maintains aspect ratio but may leave letterbox margins on devices with different aspect ratios. Touch targets must be verified after scaling to ensure they meet accessibility minimums (44x44 dp).

**Example:**
```typescript
// packages/ui/src/form-renderer/scaling.ts
export function calculateScale(
  canvasWidth: number,
  canvasHeight: number,
  screenWidth: number,
  screenHeight: number,
): { scale: number; offsetX: number; offsetY: number } {
  const scaleX = screenWidth / canvasWidth;
  const scaleY = screenHeight / canvasHeight;
  const scale = Math.min(scaleX, scaleY); // Uniform scale, maintain aspect ratio
  const offsetX = (screenWidth - canvasWidth * scale) / 2;  // Center horizontally
  const offsetY = (screenHeight - canvasHeight * scale) / 2; // Center vertically
  return { scale, offsetX, offsetY };
}

// packages/ui/src/form-renderer/FormCanvas.tsx
export function FormCanvas({ layout, screenWidth, screenHeight }: Props) {
  const { scale, offsetX, offsetY } = calculateScale(
    layout.canvasWidth, layout.canvasHeight,
    screenWidth, screenHeight,
  );

  return (
    <View style={{ width: screenWidth, height: screenHeight }}>
      <View style={{
        width: layout.canvasWidth,
        height: layout.canvasHeight,
        transform: [{ scale }, { translateX: offsetX / scale }, { translateY: offsetY / scale }],
        transformOrigin: 'top left',
      }}>
        {layout.elements.map(el => (
          <FormElement key={el.type + el.x + el.y} spec={el} />
        ))}
      </View>
    </View>
  );
}
```

### Pattern 6: DAG-Based Scheduler with Adjacency List (Confidence: HIGH)

**What:** The scheduler maintains the workflow graph as an adjacency list built from the `runtime_connections` table. When a step completes, the scheduler looks up outgoing connections and evaluates whether successor steps can be activated (all predecessors complete). For PARALLEL forks, all outgoing branches are activated simultaneously. For WAIT ALL joins, activation is deferred until all incoming branches are complete. For WAIT ANY joins, the first completed incoming branch triggers activation.

**When to use:** For all step activation decisions after any step state change to COMPLETED.

**Trade-offs:** Adjacency list is O(1) for outgoing edge lookup, O(edges) for incoming edge lookup. For workflow graphs (typically 5-50 steps), performance is not a concern. The scheduler does NOT do a full topological sort at start -- it reactively activates steps as predecessors complete. This is correct for the ISA-88 model where steps are activated by events, not pre-scheduled.

**Example:**
```typescript
// packages/engine/src/scheduler/scheduler.ts
export class Scheduler {
  private outgoing: Map<string, WorkflowConnection[]>; // stepOid -> connections FROM this step
  private incoming: Map<string, WorkflowConnection[]>; // stepOid -> connections TO this step

  constructor(connections: WorkflowConnection[]) {
    this.outgoing = new Map();
    this.incoming = new Map();
    for (const conn of connections) {
      if (!this.outgoing.has(conn.from_step_id)) this.outgoing.set(conn.from_step_id, []);
      this.outgoing.get(conn.from_step_id)!.push(conn);
      if (!this.incoming.has(conn.to_step_id)) this.incoming.set(conn.to_step_id, []);
      this.incoming.get(conn.to_step_id)!.push(conn);
    }
  }

  getNextSteps(
    completedStepOid: string,
    getStepState: (oid: string) => StepState,
    getStepType: (oid: string) => StepType,
  ): string[] {
    const outConns = this.outgoing.get(completedStepOid) || [];
    const toActivate: string[] = [];

    for (const conn of outConns) {
      const targetOid = conn.to_step_id;
      const targetType = getStepType(targetOid);
      const inConns = this.incoming.get(targetOid) || [];

      if (targetType === 'WAIT ALL') {
        // All predecessors must be COMPLETED
        const allDone = inConns.every(c => getStepState(c.from_step_id) === 'COMPLETED');
        if (allDone) toActivate.push(targetOid);
      } else if (targetType === 'WAIT ANY') {
        // First predecessor to complete triggers activation
        if (getStepState(targetOid) === 'IDLE') toActivate.push(targetOid);
      } else {
        // Normal step: all predecessors must be COMPLETED
        const allDone = inConns.every(c => getStepState(c.from_step_id) === 'COMPLETED');
        if (allDone) toActivate.push(targetOid);
      }
    }

    return toActivate;
  }
}
```

## Data Flow

### Primary Execution Flow

```
User starts workflow
    |
    v
WorkflowRunner.create(masterSpec)
    |-- Deep copy master spec to runtime
    |-- Create runtime_workflow in SQLite
    |-- Create runtime_steps in SQLite
    |-- Initialize value properties
    |-- Create resource pools
    |
    v
WorkflowRunner.start(instanceId)
    |-- Set workflow state to RUNNING (SQLite first)
    |-- Find START node, activate it
    |-- StateMachine: IDLE -> WAITING -> STARTING -> EXECUTING -> COMPLETING -> COMPLETED
    |   (each transition: SQLite write -> event emit -> Zustand update)
    |
    v
Scheduler.getNextSteps(startStepOid)
    |-- Returns successor step OIDs
    |
    v
For each next step: WorkflowRunner.activateStep(stepOid)
    |-- StateMachine: IDLE -> WAITING
    |-- ResourceManager.acquireResources(step)
    |   |-- If SYNC: register with SyncBarrier, wait for partner
    |   |-- If regular: acquire in alphabetical order, queue if unavailable
    |
    v (when resources acquired)
StateMachine: WAITING -> STARTING
    |-- ParameterResolver.resolveInputs(step)
    |
    v
StateMachine: STARTING -> EXECUTING
    |-- For USER_INTERACTION: Add to active step list, emit USER_INPUT_REQUIRED
    |-- For YES_NO: Same as USER_INTERACTION with Yes/No form
    |-- For SELECT 1: ConditionEvaluator.evaluate() -> auto-complete
    |-- For PARALLEL: Activate all outgoing branches -> auto-complete
    |-- For WAIT ALL/ANY: Monitor incoming branches
    |
    v (when step work is done)
StateMachine: EXECUTING -> COMPLETING
    |-- ParameterResolver.writeOutputs(step)
    |-- ResourceManager.releaseResources(step)
    |
    v
StateMachine: COMPLETING -> COMPLETED
    |-- Scheduler.getNextSteps() -> cycle continues
    |-- If END node: trigger workflow completion
```

### State Management Flow (Zustand + SQLite Dual Persistence)

```
Engine state change (e.g., step EXECUTING -> COMPLETING)
    |
    +---> 1. SQLite Repository: UPDATE runtime_steps SET step_state = 'COMPLETING'
    |     (write-ahead: SQLite is source of truth for crash recovery)
    |
    +---> 2. SQLite Repository: INSERT INTO state_transitions (from, to, timestamp)
    |     (append-only audit log)
    |
    +---> 3. SQLite Repository: INSERT INTO execution_log_entries (event_type, data)
    |     (append-only execution log)
    |
    +---> 4. EventBus.emit('STEP_STATE_CHANGED', { stepInstanceId, from, to })
    |
    +---> 5. Bridge handler: workflowStore.updateStepState(id, 'COMPLETING')
    |     (Zustand store mutation for reactive UI)
    |
    +---> 6. React components re-render (automatic via Zustand selectors)
```

### Form Rendering Flow

```
User navigates to Execute tab
    |
    v
ExecutionScreen reads activeSteps from useWorkflowStore
    |
    v
StepCarousel renders current active step
    |
    v
FormCanvas receives form_layout_config for current step
    |
    v
DeviceSelector picks layout: phone / tablet / desktop
    |-- Measures screen dimensions (useWindowDimensions)
    |-- Falls back: desktop -> tablet -> phone
    |
    v
Scaling calculated: canvasWidth x canvasHeight -> screen dimensions
    |
    v
FormElement components rendered with absolute positioning
    |-- Each element: { type, x, y, width, height, fontSize, ... }
    |-- Mapped to React Native components (Text, TextInput, Image, etc.)
    |-- Input elements bound to step output parameters
    |
    v
User fills form, presses Submit
    |
    v
Form collects user_inputs, calls WorkflowRunner.submitUserInput(stepId, inputs)
    |
    v
Engine: write output parameters -> StateMachine: EXECUTING -> COMPLETING -> COMPLETED
    |
    v
Scheduler activates next steps -> cycle continues
```

## Build Order and Package Dependencies

### Dependency Graph (determines build order)

```
                 +----------+
                 |  engine   |  (pure TS, no deps on other packages)
                 |  types/   |
                 +-----+-----+
                       |
              +--------+--------+
              |                 |
        +-----v-----+    +-----v------+
        |  storage   |    |  protocol  |
        | (implements|    | (implements|
        |  engine    |    |  engine    |
        |  interfaces|    |  interfaces|
        +-----+------+    +-----+------+
              |                 |
              +--------+--------+
                       |
                 +-----v-----+
                 |    ui      |
                 | (uses      |
                 |  engine    |
                 |  types)    |
                 +-----+------+
                       |
              +--------+--------+
              |                 |
        +-----v-----+    +-----v-----+
        |  mobile    |    |   web     |
        |  (app)     |    |  (app)    |
        +------------+    +-----------+
```

### Build Order (for Turborepo)

The build must respect these dependency constraints:

| Phase | Package | Depends On | Rationale |
|-------|---------|-----------|-----------|
| 1 | `packages/engine` | (none) | Pure TS, defines types and interfaces used by everything else |
| 2 | `packages/storage` | engine | Implements engine's storage interfaces using expo-sqlite |
| 2 | `packages/protocol` | engine | Implements engine's protocol interfaces (can build in parallel with storage) |
| 3 | `packages/ui` | engine (types only) | Shared UI components, needs engine types for data model |
| 4 | `apps/mobile` | engine, storage, protocol, ui | Composes all packages |
| 4 | `apps/web` | engine, storage, protocol, ui | Composes all packages (can build in parallel with mobile) |

**Turborepo configuration:**
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "lint": {}
  }
}
```

The `"dependsOn": ["^build"]` directive tells Turborepo to build dependencies before the dependent package. Since engine has no internal dependencies, it builds first. Storage and protocol depend on engine, so they build after engine (and in parallel with each other). UI depends on engine, so it builds after engine. Apps depend on all packages, so they build last.

### Development Build Order Implications for Roadmap

Because engine is the foundation that everything depends on:

1. **Build engine types and interfaces first** -- Even before full engine implementation. The type definitions and interface contracts let storage and UI development begin.
2. **Build storage repositories second** -- They implement the engine interfaces. Engine tests can use in-memory mocks, but integration tests need real repositories.
3. **Build UI components third** -- They consume engine types for display. Can be built with mock data while engine is still in development.
4. **Wire everything in apps last** -- The bridge layer, providers, and navigation compose all packages.

## Anti-Patterns

### Anti-Pattern 1: Engine Importing Platform Code

**What people do:** Import expo-sqlite or React Native APIs directly into the engine package for convenience.
**Why it is wrong:** Breaks testability in Node.js. Makes engine impossible to unit test without mocking platform modules. Couples business logic to a specific platform.
**Do this instead:** Define interfaces in `packages/engine/src/interfaces/`. Implement those interfaces in `packages/storage/` and `packages/protocol/`. Inject implementations via constructor in the app layer.

### Anti-Pattern 2: Zustand as Source of Truth for Runtime State

**What people do:** Treat Zustand stores as the primary state and sync to SQLite occasionally or on app background.
**Why it is wrong:** If the app crashes between Zustand mutation and SQLite sync, runtime state is lost. Workflow could be in an inconsistent state on restart. This violates the write-ahead requirement.
**Do this instead:** SQLite is ALWAYS written first. Zustand is a read-through cache that is rebuilt from SQLite on app restart. The persistence order is: SQLite -> EventBus -> Zustand -> UI.

### Anti-Pattern 3: Monolithic Workflow Runner

**What people do:** Put all engine logic (state machine, scheduling, resources, parameters, conditions) in a single large class or file.
**Why it is wrong:** Makes individual components untestable. A bug in the condition evaluator requires understanding the entire workflow runner. Changes to resource management risk breaking the state machine.
**Do this instead:** Each engine sub-component is its own module with its own interface, its own tests, and clear input/output boundaries. The WorkflowRunner is a thin orchestrator that delegates to sub-components.

### Anti-Pattern 4: Switch Statement State Machine

**What people do:** Implement the state machine as a giant switch statement: `switch (currentState) { case 'IDLE': if (event === 'START') { ... } }`.
**Why it is wrong:** With 20+ states and 15+ transitions, the switch statement becomes unreadable and untestable. Adding a new state requires modifying multiple branches. Guard conditions become deeply nested.
**Do this instead:** Table-driven state machine where the transition table is data. Test each transition row independently. Add states/transitions by adding rows to the table.

### Anti-Pattern 5: Direct Component-to-Engine Calls

**What people do:** Have React components call engine methods directly: `onClick={() => workflowRunner.submitInput(stepId, data)}`.
**Why it is wrong:** Tightly couples UI components to engine internals. Makes it hard to add cross-cutting concerns (logging, error handling, state updates). Components become hard to test in isolation.
**Do this instead:** Components dispatch actions through Zustand store methods. Store methods call engine methods, handle errors, update state, and manage side effects. This keeps components thin and testable.

### Anti-Pattern 6: Over-Scaling the Form Renderer

**What people do:** Apply the canvas scale transform to interactive elements (TextInput, Checkbox) the same as display elements.
**Why it is wrong:** Scaled TextInput fields have misaligned touch targets. Font sizes become non-standard after transform. Keyboard interaction may behave unexpectedly with scaled inputs.
**Do this instead:** Scale the visual container for layout positioning, but render interactive elements at their native size. Use the scale factor to compute the correct position and dimensions in screen coordinates, then render the element without the transform. This maintains proper touch targets and keyboard behavior.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| BrainPal MD Server | REST API via `packages/protocol` | v2 scope. v1 uses file import only. |
| Action Servers | REST invoke + SSE state stream via `packages/protocol` | v2 scope. v1 handles USER_INTERACTION steps only. |
| Device File System | Expo DocumentPicker + FileSystem for .WFmasterX import | Platform-specific, handled in app layer. |
| Notifications | expo-notifications (mobile), Notification API (web) | Platform-specific, handled in app layer. |

### Internal Boundaries

| Boundary | Communication | Direction | Notes |
|----------|---------------|-----------|-------|
| Engine -> Storage | Repository interfaces (async) | Engine calls storage | Engine defines interfaces, storage implements |
| Engine -> Protocol | Client interfaces (async) | Engine calls protocol | v2 scope, stub for v1 |
| Engine -> UI | EventBus (pub/sub) | Engine emits, bridge subscribes | One-way: engine never knows about UI |
| UI -> Engine | Zustand store actions -> engine methods | Store calls engine | Via the bridge/provider layer |
| Storage -> SQLite | expo-sqlite API | Direct | Storage package owns all SQL |
| App -> All packages | Composition root, DI wiring | App creates and connects | Apps are the only layer that imports from all packages |

## Scalability Considerations

| Concern | Single Workflow (typical) | 5+ Concurrent Workflows | 50+ Steps per Workflow |
|---------|--------------------------|------------------------|----------------------|
| State machine instances | 5-20 per workflow, negligible memory | 25-100 total, still negligible | 50+ per workflow, watch memory |
| SQLite writes per second | Low (1-2 per user action) | Moderate (5-10 from parallel execution) | Moderate (auto-transitions are fast) |
| Zustand re-renders | Minimal (use selectors for specific slices) | Use workflow-scoped selectors to avoid cross-workflow re-renders | Use step-specific selectors, avoid rendering all steps |
| Graph traversal | O(connections), trivial for <50 steps | Independent per workflow | Adjacency list is O(1) per lookup |

### Scaling Priorities

1. **First bottleneck: SQLite write throughput during parallel branch execution.** Multiple branches completing simultaneously generate multiple SQLite writes. Mitigation: WAL mode (already planned), batch writes within a single transaction where possible.
2. **Second bottleneck: Zustand re-renders during rapid state changes.** Use granular selectors (`useWorkflowStore(s => s.steps[stepId].state)` not `useWorkflowStore(s => s.steps)`). Consider debouncing non-critical UI updates (e.g., state badges for background steps).

## Sources

- Expo monorepo guide: https://docs.expo.dev/guides/monorepos/ (HIGH confidence -- official documentation, SDK 52+ auto-config)
- Expo local-first architecture: https://docs.expo.dev/guides/local-first/ (HIGH confidence -- official documentation)
- expo-sqlite API reference: https://docs.expo.dev/versions/latest/sdk/sqlite/ (HIGH confidence -- official documentation, SDK 54)
- ISA-88 state machine model: https://en.wikipedia.org/wiki/ISA-88 and https://www.plcacademy.com/isa-88-s88-batch-control-explained/ (HIGH confidence -- industry standard)
- Table-driven state machines in TypeScript: https://medium.com/@floyd.may/building-a-typescript-state-machine-cc9e55995fa8 and https://medium.com/@MichaelVD/composable-state-machines-in-typescript-type-safe-predictable-and-testable-5e16574a6906 (MEDIUM confidence -- community patterns, verified against spec)
- DAG-based workflow engine design: https://bugfree.ai/knowledge-hub/designing-a-dag-based-workflow-engine-from-scratch (MEDIUM confidence -- architectural reference)
- Typed EventEmitter patterns: https://basarat.gitbook.io/typescript/main-1/typed-event and https://github.com/andywer/typed-emitter (MEDIUM confidence -- community libraries, well-established pattern)
- Zustand persistence patterns: https://github.com/pmndrs/zustand/blob/main/docs/integrations/persisting-store-data.md (HIGH confidence -- official Zustand documentation)
- React Native absolute positioning: https://reactnative.dev/docs/layout-props (HIGH confidence -- official React Native documentation)
- Turborepo build order: https://turbo.build/repo/docs (MEDIUM confidence -- official docs, verified via multiple community implementations)
- BrainPal Mobile specifications: `.BrainPalMobile/ArchitectureSpec.md`, `ExecutionEngineSpec.md`, `StateMachineSpec.md`, `StorageSpec.md`, `UISpec.md`, `DataModelSpec.md` (HIGH confidence -- project specifications, authoritative)

---
*Architecture research for: BrainPal Mobile cross-platform workflow execution engine*
*Researched: 2026-02-24*
