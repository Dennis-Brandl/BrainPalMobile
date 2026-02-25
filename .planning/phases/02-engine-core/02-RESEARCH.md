# Phase 2: Engine Core - Research

**Researched:** 2026-02-25
**Domain:** Pure TypeScript workflow execution engine -- ISA-88 state machine, DAG scheduler, parameter/condition subsystems, ZIP import pipeline, crash recovery, execution logging
**Confidence:** HIGH

## Summary

Phase 2 builds the entire execution engine as a pure TypeScript package (`@brainpal/engine`) with zero platform dependencies, verified exclusively by automated tests running in Node.js via Vitest. The engine imports `.WFmasterX` and `.WFlibX` packages (ZIP files containing JSON specs and images), creates runtime workflow instances as deep copies, and executes them step-by-step through a table-driven ISA-88 state machine with DAG-based scheduling, parameter resolution, condition evaluation, and full execution logging.

The architecture follows interface-based dependency injection: the engine defines repository interfaces (IWorkflowRepository, IStepRepository, etc.) and the tests provide in-memory implementations. The production implementations in `@brainpal/storage` come later when wiring to the app layer. This keeps the engine completely platform-independent. The single most critical architectural pattern is the **serial async event queue** that prevents race conditions when parallel branches complete simultaneously -- every engine event (step completion, state transition, resource operation) must be processed through a FIFO queue one at a time.

The import pipeline uses `fflate` (v0.8.2) for ZIP extraction -- a pure JavaScript library with zero dependencies that works identically in Node.js tests and React Native at runtime. UUID generation uses `crypto.randomUUID()` which is available natively in Node.js 19+ (test environment) and will use `expo-crypto` at runtime via dependency injection.

**Primary recommendation:** Build the engine package bottom-up: types and interfaces first, then state machine, then scheduler, then parameter/condition subsystems, then import pipeline, then crash recovery and logging. Each component is independently testable. Use in-memory repository mocks for all tests. Enforce serial event processing from the start.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | ~5.9.2 | Type safety for all engine code | Already installed at root; strict mode catches state machine type errors at compile time |
| fflate | ~0.8.2 | ZIP extraction for .WFmasterX/.WFlibX packages | Pure JS, zero deps, works in Node.js + React Native + browser without polyfills; 8KB minified; Uint8Array API |
| Vitest | ~4.x | Test runner for engine package | 10-20x faster than Jest; native TypeScript/ESM support; no Babel transform needed; ideal for pure TS packages |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @vitest/coverage-v8 | ~4.x | Code coverage for engine tests | Run with `vitest --coverage` to verify test completeness per component |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| fflate | JSZip 3.10.1 | JSZip requires stream/buffer polyfills in React Native; last release 4 years ago; known Android issues; fake async. Only consider if fflate has a platform-specific bug |
| Vitest | Jest 30 | Jest works but is 10-20x slower for pure TS and requires Babel transforms; use Jest only for React Native component tests in apps/mobile |
| crypto.randomUUID() | uuid npm package | uuid requires react-native-get-random-values polyfill; crypto.randomUUID() is natively available in Node.js 19+ and expo-crypto on mobile |

### Installation

```bash
# From project root -- engine package dependencies
npm install fflate --workspace=packages/engine

# Dev dependencies at root (shared)
npm install -D vitest @vitest/coverage-v8
```

**Note:** fflate is installed in the engine package workspace specifically because the engine is the ZIP extraction consumer. Vitest is a root dev dependency shared across packages.

## Architecture Patterns

### Recommended Engine Package Structure

```
packages/engine/
  src/
    types/                    # All data model types (master, runtime, common)
      master.ts              # MasterWorkflowSpecification, MasterWorkflowStep, etc.
      runtime.ts             # RuntimeWorkflow, RuntimeWorkflowStep, etc.
      common.ts              # StepState, StepType, WorkflowState, etc.
      events.ts              # EngineEvent discriminated union
      index.ts               # Re-exports
    interfaces/               # Repository contracts (engine defines, storage implements)
      storage.ts             # IWorkflowRepository, IStepRepository, IValuePropertyRepository, etc.
      logger.ts              # IExecutionLogger
      id-generator.ts        # IIdGenerator (abstracts UUID generation)
      index.ts
    events/                   # Event system
      event-bus.ts           # Typed EventEmitter (zero deps)
      event-queue.ts         # Serial async FIFO queue for engine events
      index.ts
    state-machine/            # ISA-88 state machine
      types.ts               # StateTransitionRule, StateMachineConfig
      state-machine.ts       # Generic table-driven state machine class
      isa88-config.ts        # Transition table data for observable track
      isa88-opaque-config.ts # Transition table data for opaque track
      index.ts
    scheduler/                # DAG-based step activation
      types.ts               # AdjacencyList types
      scheduler.ts           # Step activation logic, PARALLEL/WAIT ALL/WAIT ANY
      index.ts
    parameter-resolver/       # Input/output parameter resolution
      types.ts               # ResolvedParameter
      parameter-resolver.ts  # Resolve inputs, write outputs
      scope-resolver.ts      # Workflow -> parent -> environment lookup chain
      index.ts
    condition-evaluator/      # SELECT 1 branching
      types.ts               # ComparisonOperator, Select1Config
      condition-evaluator.ts # 10 operators with type coercion
      index.ts
    import/                   # Package import pipeline
      types.ts               # ManifestSchema, ImportResult
      manifest-parser.ts     # Parse and validate manifest.json
      package-extractor.ts   # ZIP extraction with fflate, file categorization
      package-importer.ts    # Orchestrate extraction -> validation -> storage
      index.ts
    runner/                   # Top-level orchestrator
      types.ts               # RunnerConfig
      workflow-runner.ts     # Create, start, step dispatch, completion
      step-executor.ts       # Step-type-specific execution logic
      lifecycle.ts           # Workflow creation (deep copy) and completion
      crash-recovery.ts      # Resume from persisted state
      index.ts
    logger/                   # Execution logging
      types.ts               # LogEventType enum, ExecutionLogEntry
      execution-logger.ts    # Log all engine events unconditionally
      index.ts
    index.ts                  # Public API surface
  __tests__/
    state-machine/
    scheduler/
    parameter-resolver/
    condition-evaluator/
    import/
    runner/
    logger/
    helpers/                  # In-memory mock repositories, test fixtures
      mock-repositories.ts   # In-memory implementations of all I* interfaces
      fixtures.ts            # Sample workflow specs for testing
      test-utils.ts          # Common test helpers
```

### Pattern 1: Serial Async Event Queue (CRITICAL)

**What:** All engine events are processed through a single FIFO queue. When a step completes, the completion event is enqueued. The queue processes events one at a time, fully awaiting all SQLite writes and state updates before dequeuing the next event.

**When to use:** ALWAYS. Every step state change, scheduler decision, resource operation, and parameter resolution goes through this queue.

**Why critical:** Without this, parallel branch completions cause race conditions -- two branches completing during the same event loop tick both see pre-mutation state and both try to activate the same join step.

**Example:**
```typescript
// Source: PITFALLS.md Pitfall 5 + Architecture research
export class EngineEventQueue {
  private processing = false;
  private queue: Array<{
    event: EngineEvent;
    resolve: () => void;
    reject: (err: Error) => void;
  }> = [];

  constructor(private handler: (event: EngineEvent) => Promise<void>) {}

  enqueue(event: EngineEvent): Promise<void> {
    return new Promise((resolve, reject) => {
      this.queue.push({ event, resolve, reject });
      this.processNext();
    });
  }

  private async processNext(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const { event, resolve, reject } = this.queue.shift()!;
      try {
        await this.handler(event);
        resolve();
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    }

    this.processing = false;
  }
}
```

### Pattern 2: Table-Driven State Machine

**What:** The ISA-88 state machine is a generic class parameterized by state/event types, driven by a data table of transition rules. No switch/case for state transitions.

**When to use:** For every RuntimeWorkflowStep instance. Each step gets its own state machine initialized with the ISA-88 transition table (observable or opaque depending on step type).

**Example:**
```typescript
// Source: StateMachineSpec.md + Architecture research
export interface StateTransitionRule<S extends string, E extends string> {
  from: S | '*_ACTIVE';
  event: E;
  to: S;
  guard?: (context: StepContext) => boolean;
}

export class StateMachine<S extends string, E extends string> {
  private currentState: S;

  constructor(
    private readonly config: {
      initialState: S;
      transitions: StateTransitionRule<S, E>[];
    },
    private readonly onTransition?: (from: S, to: S, event: E) => void,
  ) {
    this.currentState = config.initialState;
  }

  send(event: E, context?: StepContext): S {
    const rule = this.config.transitions.find(
      (t) =>
        (t.from === this.currentState || t.from === '*_ACTIVE') &&
        t.event === event &&
        (!t.guard || t.guard({ ...context, currentState: this.currentState })),
    );
    if (!rule) {
      throw new InvalidTransitionError(this.currentState, event);
    }
    const from = this.currentState;
    this.currentState = rule.to;
    this.onTransition?.(from, rule.to, event);
    return this.currentState;
  }

  getState(): S {
    return this.currentState;
  }

  canSend(event: E, context?: StepContext): boolean {
    return this.config.transitions.some(
      (t) =>
        (t.from === this.currentState || t.from === '*_ACTIVE') &&
        t.event === event &&
        (!t.guard || t.guard({ ...context, currentState: this.currentState })),
    );
  }
}
```

### Pattern 3: Interface-Based Dependency Injection

**What:** The engine package defines TypeScript interfaces for all external dependencies. Tests provide in-memory mocks. The app layer provides real SQLite implementations.

**When to use:** For all storage, logging, and platform-specific operations (UUID generation, file I/O).

**Example:**
```typescript
// Source: Architecture research
export interface IWorkflowRepository {
  getById(instanceId: string): Promise<RuntimeWorkflow | null>;
  save(workflow: RuntimeWorkflow): Promise<void>;
  updateState(instanceId: string, state: WorkflowState): Promise<void>;
  getActive(): Promise<RuntimeWorkflow[]>;
  delete(instanceId: string): Promise<void>;
}

export interface IStepRepository {
  getByWorkflow(workflowInstanceId: string): Promise<RuntimeWorkflowStep[]>;
  getById(instanceId: string): Promise<RuntimeWorkflowStep | null>;
  updateState(instanceId: string, state: StepState): Promise<void>;
  save(step: RuntimeWorkflowStep): Promise<void>;
  saveMany(steps: RuntimeWorkflowStep[]): Promise<void>;
}

export interface IConnectionRepository {
  getByWorkflow(workflowInstanceId: string): Promise<WorkflowConnection[]>;
  saveMany(workflowInstanceId: string, connections: WorkflowConnection[]): Promise<void>;
}

export interface IValuePropertyRepository {
  getWorkflowProperty(workflowInstanceId: string, name: string): Promise<RuntimeValueProperty | null>;
  getEnvironmentProperty(envOid: string, name: string): Promise<RuntimeValueProperty | null>;
  upsertEntry(scope: 'workflow' | 'environment', scopeId: string, propertyName: string, entryName: string, value: string): Promise<void>;
  deleteByWorkflow(workflowInstanceId: string): Promise<void>;
  initializeFromSpec(scope: 'workflow' | 'environment', scopeId: string, specs: PropertySpecification[]): Promise<void>;
}

export interface IExecutionLogger {
  log(entry: ExecutionLogEntry): Promise<void>;
  getByWorkflow(workflowInstanceId: string): Promise<ExecutionLogEntry[]>;
}

export interface IIdGenerator {
  generateId(): string;  // Returns UUID v4
}

// In-memory implementation for tests
export class InMemoryWorkflowRepository implements IWorkflowRepository {
  private workflows = new Map<string, RuntimeWorkflow>();
  // ... implement all methods using Map
}
```

### Pattern 4: Typed Event Bus

**What:** A lightweight typed EventEmitter that the engine uses to communicate state changes. No external dependencies.

**When to use:** For all engine-to-external communication. The event bus is the engine's only output channel (besides repository writes).

**Example:**
```typescript
// Source: ExecutionEngineSpec.md Section 9
export type EngineEventMap = {
  WORKFLOW_STARTED: { workflowInstanceId: string };
  WORKFLOW_COMPLETED: { workflowInstanceId: string };
  WORKFLOW_ABORTED: { workflowInstanceId: string };
  STEP_STATE_CHANGED: { stepInstanceId: string; workflowInstanceId: string; fromState: StepState; toState: StepState; event: StateEvent };
  STEP_ACTIVATED: { stepInstanceId: string; workflowInstanceId: string };
  ACTIVE_STEPS_CHANGED: { workflowInstanceId: string; activeSteps: string[] };
  USER_INPUT_REQUIRED: { stepInstanceId: string; workflowInstanceId: string };
  PARAMETER_RESOLVED: { stepInstanceId: string; paramName: string; value: string };
  CONDITION_EVALUATED: { stepInstanceId: string; matchedConnectionId: string | null };
  SCHEDULER_DECISION: { completedStepId: string; activatedStepIds: string[] };
  RESOURCE_ACQUIRED: { stepInstanceId: string; resourceName: string };
  RESOURCE_WAITING: { stepInstanceId: string; resourceName: string };
  EXECUTION_LOG: { entry: ExecutionLogEntry };
  ERROR: { source: string; message: string; details?: unknown };
};

export class EngineEventBus {
  private handlers = new Map<string, Set<Function>>();

  on<K extends keyof EngineEventMap>(
    event: K,
    handler: (data: EngineEventMap[K]) => void,
  ): () => void {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
    return () => { this.handlers.get(event)?.delete(handler); };
  }

  emit<K extends keyof EngineEventMap>(event: K, data: EngineEventMap[K]): void {
    this.handlers.get(event)?.forEach((fn) => fn(data));
  }

  removeAllListeners(): void {
    this.handlers.clear();
  }
}
```

### Pattern 5: Deep Copy for Runtime Workflow Creation

**What:** When creating a RuntimeWorkflow from a MasterWorkflowSpecification, the entire specification is deep-copied via `JSON.parse(JSON.stringify(...))`. This ensures the runtime instance is completely independent -- changes to one runtime instance never affect the master or other instances.

**When to use:** EXEC-01 workflow creation. The deep copy includes steps, connections, value property specs, and resource specs.

**Example:**
```typescript
// Source: ExecutionEngineSpec.md Section 2.2
export function createRuntimeWorkflow(
  masterSpec: MasterWorkflowSpecification,
  idGenerator: IIdGenerator,
): { workflow: RuntimeWorkflow; steps: RuntimeWorkflowStep[]; connections: WorkflowConnection[] } {
  const instanceId = idGenerator.generateId();
  const specCopy = JSON.parse(JSON.stringify(masterSpec));

  const steps: RuntimeWorkflowStep[] = specCopy.steps.map((step: MasterWorkflowStep) => ({
    instance_id: idGenerator.generateId(),
    workflow_instance_id: instanceId,
    step_oid: step.oid,
    step_type: step.step_type,
    step_state: 'IDLE' as StepState,
    step_json: JSON.stringify(step),
    resolved_inputs_json: null,
    resolved_outputs_json: null,
    user_inputs_json: null,
    activated_at: null,
    started_at: null,
    completed_at: null,
  }));

  const workflow: RuntimeWorkflow = {
    instance_id: instanceId,
    master_workflow_oid: masterSpec.oid,
    master_workflow_version: masterSpec.version,
    workflow_state: 'IDLE',
    specification_json: JSON.stringify(specCopy),
    created_at: new Date().toISOString(),
    started_at: null,
    completed_at: null,
    parent_workflow_instance_id: null,
    parent_step_oid: null,
  };

  return { workflow, steps, connections: specCopy.connections };
}
```

### Anti-Patterns to Avoid

- **Engine importing platform code:** Never import expo-sqlite, expo-crypto, react-native, or any platform API in the engine package. Use interfaces + dependency injection. The engine runs in Node.js for tests.
- **Switch statement state machine:** Do not implement ISA-88 transitions with switch/case. The transition table has 20+ rules; switch becomes unreadable and untestable.
- **Processing engine events without the queue:** Never process step completions or state changes outside the serial event queue. Even in tests, use the queue to catch race condition bugs early.
- **Zustand in the engine:** The engine has no knowledge of Zustand. It communicates through the event bus and repository interfaces. The bridge layer (in the app) connects events to Zustand.
- **Monolithic WorkflowRunner:** Do not put all logic in one class. The WorkflowRunner delegates to StateMachine, Scheduler, ParameterResolver, ConditionEvaluator, and ExecutionLogger.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ZIP extraction | Custom ZIP parser | fflate `unzipSync` / `unzip` | ZIP format is complex (multiple compression methods, CRC checks, directory entries). fflate is 8KB, battle-tested, and handles edge cases |
| UUID generation | Math.random() based ID | `crypto.randomUUID()` via IIdGenerator interface | crypto.randomUUID() is RFC4122-compliant and cryptographically secure; available natively in Node.js 19+ |
| State machine | Switch/case state transitions | Table-driven StateMachine class | 20+ transition rules with guards; table is testable row-by-row, auditable, and matches the spec directly |
| Adjacency list | Repeated connection scanning | Pre-built outgoing/incoming maps | Building Maps once on workflow creation is O(connections); repeated scanning is O(connections) per step completion |
| JSON deep copy | Recursive manual clone | `JSON.parse(JSON.stringify(...))` | Handles all JSON-serializable types correctly; the spec data is always JSON-serializable (no functions, no Date objects, no circular refs) |
| Type coercion for conditions | Ad-hoc comparison logic | Dedicated coercion function per value type | The 10 comparison operators need consistent type coercion (string vs number vs boolean); centralizing this prevents inconsistencies |

**Key insight:** The engine's complexity is in orchestration (state machine transitions, scheduler decisions, event ordering), not in low-level utilities. Use proven solutions for utilities, invest engineering effort in orchestration correctness.

## Common Pitfalls

### Pitfall 1: Async Event Interleaving (Race Conditions)

**What goes wrong:** Two parallel branches complete during the same event loop tick. Both completion handlers see pre-mutation state. Both activate the same WAIT ALL join step, causing double activation.
**Why it happens:** JavaScript async/await interleaves on `await` points. Without serialization, concurrent completions see stale state.
**How to avoid:** Route ALL engine events through the serial EngineEventQueue. Process one event fully (including all SQLite writes) before processing the next.
**Warning signs:** Non-deterministic test failures, WAIT ALL completing before all branches finish, steps appearing in active list twice.

### Pitfall 2: Incomplete ISA-88 Transition Table

**What goes wrong:** The state machine accepts only happy-path transitions (IDLE -> WAITING -> STARTING -> EXECUTING -> COMPLETING -> COMPLETED). ABORT, STOP, PAUSE, and CLEAR transitions are missing or incomplete.
**Why it happens:** Developers test the happy path first and defer edge cases. The ISA-88 spec has 20+ transition rules including ABORT from any active state, HOLD/UNHOLD, and CLEARING after ABORTED.
**How to avoid:** Implement the complete transition table from StateMachineSpec.md Section 3.1 as data on day one. Write a test for every row in the table. The table IS the specification.
**Warning signs:** ABORT button does nothing, STOP transitions to wrong state, PAUSED workflow cannot be resumed.

### Pitfall 3: Crash Recovery Missing In-Flight States

**What goes wrong:** App crashes while a step is in EXECUTING or COMPLETING state. On restart, the engine tries to resume but the step is in a transitional state that normal activation logic does not handle.
**Why it happens:** Write-ahead semantics persist the state before moving to the next state. If the crash happens after writing EXECUTING but before processing the SC event to COMPLETING, the step is stuck in EXECUTING with no way to advance.
**How to avoid:** On crash recovery, inspect each step's state. For intermediate states (EXECUTING, COMPLETING, STARTING), either:
  - **Re-enter the state:** Re-send the SC event that would have advanced it. Safe for COMPLETING (just needs to write outputs), STARTING (just needs to resolve inputs).
  - **Roll back:** Move EXECUTING back to WAITING for user interaction steps (user has not submitted yet). This is safe because no outputs were written.
  - Decision per state type (Claude's discretion area -- see Crash Recovery Strategy below).
**Warning signs:** Steps stuck in EXECUTING or COMPLETING after app restart; workflow shows as RUNNING but no steps are progressing.

### Pitfall 4: Import Pipeline Partial Failure

**What goes wrong:** ZIP extraction succeeds for the workflow JSON but fails for images or environments. The master workflow is stored without its images, leading to broken form rendering.
**Why it happens:** Processing ZIP entries one at a time without transaction boundaries. If image extraction fails mid-way, some data is committed but the package is incomplete.
**How to avoid:** Validate the entire package in memory before writing anything to storage. Extract all ZIP entries, parse all JSON, validate all references, then write everything in a single batch. If any validation fails, reject the entire package.
**Warning signs:** Forms rendering without images, missing environments, "environment not found" errors during workflow execution.

### Pitfall 5: Value Property Scope Resolution Errors

**What goes wrong:** Parameter resolver reads the wrong Value Property because scope resolution is incorrect. A workflow-scoped property shadows an environment-scoped property with the same name, or vice versa.
**Why it happens:** The scope resolution chain (workflow -> parent workflow chain -> environment) must be followed precisely. If the resolver checks environment scope first, it finds stale values from a previous workflow execution instead of fresh workflow-scoped values.
**How to avoid:** Implement scope resolution exactly per ExecutionEngineSpec.md Section 6.1: (1) workflow scope, (2) parent workflow chain, (3) environment scope. Write tests with properties at multiple scopes with the same name.
**Warning signs:** Parameters resolving to unexpected values, environment properties being modified when workflow properties should have been modified.

### Pitfall 6: SELECT 1 No-Match Case

**What goes wrong:** None of the SELECT 1 conditions match the input value. Without handling this case, the scheduler has no connection to follow and the workflow hangs silently.
**Why it happens:** Test cases only cover matching conditions. The "no match" case is specified in ExecutionEngineSpec.md Section 7.1 as `throw ConditionNotMatchedError(step, inputValue)`.
**How to avoid:** After evaluating all options, if none matched, transition the step to ABORTED state with a descriptive error. Emit an ERROR event. Log the unmatched value.
**Warning signs:** Workflow stops progressing after a SELECT 1 step with no error, step stuck in EXECUTING.

## Code Examples

### ZIP Extraction with fflate

```typescript
// Source: fflate npm docs + project PackageFormatSpec.md
import { unzipSync, strFromU8 } from 'fflate';

export interface ExtractedPackage {
  manifest: ManifestSchema;
  workflows: Array<{ filename: string; content: MasterWorkflowSpecification }>;
  environments: Array<{ filename: string; content: MasterEnvironmentLibrary }>;
  actions: Array<{ filename: string; content: MasterActionLibrary }>;
  images: Array<{ filename: string; data: Uint8Array; mimeType: string }>;
}

export function extractPackage(zipData: Uint8Array): ExtractedPackage {
  const files = unzipSync(zipData);

  // Parse manifest
  const manifestData = files['manifest.json'];
  if (!manifestData) {
    throw new PackageValidationError('Missing manifest.json');
  }
  const manifest: ManifestSchema = JSON.parse(strFromU8(manifestData));

  // Categorize and parse files
  const workflows: ExtractedPackage['workflows'] = [];
  const environments: ExtractedPackage['environments'] = [];
  const actions: ExtractedPackage['actions'] = [];
  const images: ExtractedPackage['images'] = [];

  for (const [path, data] of Object.entries(files)) {
    if (path === 'manifest.json') continue;

    if (path.endsWith('.WFmaster')) {
      workflows.push({
        filename: path,
        content: JSON.parse(strFromU8(data)),
      });
    } else if (path.endsWith('.WFenvir')) {
      environments.push({
        filename: path,
        content: JSON.parse(strFromU8(data)),
      });
    } else if (path.endsWith('.WFaction')) {
      actions.push({
        filename: path,
        content: JSON.parse(strFromU8(data)),
      });
    } else if (path.startsWith('images/') && data.length > 0) {
      images.push({
        filename: path.replace('images/', ''),
        data,
        mimeType: getMimeType(path),
      });
    }
  }

  return { manifest, workflows, environments, actions, images };
}

function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const mimeMap: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    bmp: 'image/bmp',
    ico: 'image/x-icon',
    mp4: 'video/mp4',
    webm: 'video/webm',
  };
  return mimeMap[ext ?? ''] ?? 'application/octet-stream';
}
```

### Condition Evaluator (10 Operators)

```typescript
// Source: ExecutionEngineSpec.md Section 7, DataModelSpec.md Section 1.2
export type ComparisonOperator =
  | 'equals' | 'not_equals'
  | 'greater_than' | 'less_than'
  | 'greater_than_or_equal' | 'less_than_or_equal'
  | 'contains' | 'not_contains'
  | 'starts_with' | 'ends_with';

export function evaluateCondition(
  inputValue: string,
  operator: ComparisonOperator,
  expectedValue: string,
  valueType: string,
): boolean {
  const [a, b] = coerceTypes(inputValue, expectedValue, valueType);

  switch (operator) {
    case 'equals': return a === b;
    case 'not_equals': return a !== b;
    case 'greater_than': return a > b;
    case 'less_than': return a < b;
    case 'greater_than_or_equal': return a >= b;
    case 'less_than_or_equal': return a <= b;
    case 'contains': return String(a).includes(String(b));
    case 'not_contains': return !String(a).includes(String(b));
    case 'starts_with': return String(a).startsWith(String(b));
    case 'ends_with': return String(a).endsWith(String(b));
  }
}

function coerceTypes(a: string, b: string, valueType: string): [any, any] {
  if (valueType === 'number' || valueType === 'integer' || valueType === 'float') {
    return [Number(a), Number(b)];
  }
  if (valueType === 'boolean') {
    return [a.toLowerCase() === 'true', b.toLowerCase() === 'true'];
  }
  // Default: string comparison
  return [a, b];
}
```

### Vitest Configuration for Engine Package

```typescript
// packages/engine/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/**/types.ts'],
    },
  },
});
```

### ISA-88 Observable Transition Table (Complete)

```typescript
// Source: StateMachineSpec.md Section 3.1
export type StepState =
  | 'IDLE' | 'WAITING' | 'STARTING' | 'EXECUTING' | 'COMPLETING'
  | 'PAUSING' | 'PAUSED' | 'UNPAUSING'
  | 'HOLDING' | 'HELD' | 'UNHOLDING'
  | 'ABORTING' | 'ABORTED' | 'CLEARING'
  | 'STOPPING' | 'COMPLETED'
  // Opaque states
  | 'POSTED' | 'RECEIVED' | 'IN_PROGRESS';

export type StateEvent =
  | 'START' | 'SC' | 'PAUSE' | 'RESUME' | 'HOLD' | 'UNHOLD'
  | 'ABORT' | 'STOP' | 'CLEAR';

const ACTIVE_STATES = new Set<StepState>([
  'WAITING', 'STARTING', 'EXECUTING', 'COMPLETING',
  'PAUSING', 'PAUSED', 'UNPAUSING',
  'HOLDING', 'HELD', 'UNHOLDING',
  'POSTED', 'RECEIVED', 'IN_PROGRESS',
]);

export const ISA88_OBSERVABLE_TRANSITIONS: StateTransitionRule<StepState, StateEvent>[] = [
  { from: 'IDLE',       event: 'START',   to: 'WAITING' },
  { from: 'WAITING',    event: 'SC',      to: 'STARTING' },
  { from: 'STARTING',   event: 'SC',      to: 'EXECUTING' },
  { from: 'EXECUTING',  event: 'SC',      to: 'COMPLETING' },
  { from: 'EXECUTING',  event: 'PAUSE',   to: 'PAUSING' },
  { from: 'EXECUTING',  event: 'HOLD',    to: 'HOLDING' },
  { from: 'COMPLETING', event: 'SC',      to: 'COMPLETED' },
  { from: 'PAUSING',    event: 'SC',      to: 'PAUSED' },
  { from: 'PAUSED',     event: 'RESUME',  to: 'UNPAUSING' },
  { from: 'UNPAUSING',  event: 'SC',      to: 'EXECUTING' },
  { from: 'HOLDING',    event: 'SC',      to: 'HELD' },
  { from: 'HELD',       event: 'UNHOLD',  to: 'UNHOLDING' },
  { from: 'UNHOLDING',  event: 'SC',      to: 'EXECUTING' },
  // ABORT from any active state
  { from: '*_ACTIVE', event: 'ABORT', to: 'ABORTING',
    guard: (ctx) => ACTIVE_STATES.has(ctx.currentState) },
  { from: 'ABORTING',   event: 'SC',      to: 'ABORTED' },
  { from: 'ABORTED',    event: 'CLEAR',   to: 'CLEARING' },
  { from: 'CLEARING',   event: 'SC',      to: 'COMPLETED' },
  // STOP from any active state
  { from: '*_ACTIVE', event: 'STOP', to: 'STOPPING',
    guard: (ctx) => ACTIVE_STATES.has(ctx.currentState) },
  { from: 'STOPPING',   event: 'SC',      to: 'COMPLETED' },
];

export const ISA88_OPAQUE_TRANSITIONS: StateTransitionRule<StepState, StateEvent>[] = [
  { from: 'IDLE',        event: 'START', to: 'WAITING' },
  { from: 'WAITING',     event: 'SC',    to: 'POSTED' },
  { from: 'POSTED',      event: 'SC',    to: 'RECEIVED' },
  { from: 'RECEIVED',    event: 'SC',    to: 'IN_PROGRESS' },
  { from: 'IN_PROGRESS', event: 'SC',    to: 'COMPLETED' },
  // ABORT from any active opaque state
  { from: '*_ACTIVE', event: 'ABORT', to: 'ABORTING',
    guard: (ctx) => ACTIVE_STATES.has(ctx.currentState) },
  { from: 'ABORTING',    event: 'SC',    to: 'ABORTED' },
  { from: 'ABORTED',     event: 'CLEAR', to: 'CLEARING' },
  { from: 'CLEARING',    event: 'SC',    to: 'COMPLETED' },
  { from: '*_ACTIVE', event: 'STOP', to: 'STOPPING',
    guard: (ctx) => ACTIVE_STATES.has(ctx.currentState) },
  { from: 'STOPPING',    event: 'SC',    to: 'COMPLETED' },
];
```

## Crash Recovery Strategy (Claude's Discretion)

### Per-State Recovery Decisions

When the app crashes, steps may be in intermediate states. Here is the recommended recovery action per state:

| State at Crash | Recovery Action | Rationale |
|----------------|----------------|-----------|
| **IDLE** | No action needed | Step has not started |
| **WAITING** | Re-enter WAITING | Re-attempt resource acquisition. Resources may have been partially acquired; the resource manager should check current state and resume |
| **STARTING** | Roll back to WAITING | Input parameter resolution may be incomplete. Re-resolving is safe and idempotent |
| **EXECUTING** (USER_INTERACTION / YES_NO) | Re-enter EXECUTING | User has not submitted form data. The form will be re-displayed. No outputs have been written |
| **EXECUTING** (START / END / PARALLEL / WAIT ALL / WAIT ANY / SELECT 1) | Re-enter EXECUTING and re-send SC | These steps auto-complete. Re-executing their logic is idempotent |
| **COMPLETING** | Re-enter COMPLETING and re-send SC | Output parameters may have been partially written. Since upserts are idempotent, re-writing is safe |
| **PAUSING** | Move to PAUSED | The step was being paused; complete the pause |
| **PAUSED** | Stay PAUSED | User must resume manually |
| **UNPAUSING** | Move to EXECUTING | The step was being resumed; complete the resume |
| **HOLDING / HELD / UNHOLDING** | Stay in current state | These are action-server-driven states (v2 scope). Safe to keep as-is |
| **ABORTING** | Complete abort to ABORTED | Finish cleanup |
| **STOPPING** | Complete stop to COMPLETED | Finish orderly shutdown |
| **COMPLETED / ABORTED** | No action needed | Terminal states |

### Stale Workflow Threshold

**Recommended default:** 24 hours. Any workflow that was active at crash time and has not been touched for 24 hours is flagged as stale on the next app launch. The user is prompted with options: "Resume" or "Abort". The engine always supports resuming regardless of age.

**Implementation:** Store `last_activity_at` timestamp per runtime workflow (updated on every step state change). On app startup, query: `SELECT * FROM runtime_workflows WHERE workflow_state IN ('RUNNING', 'PAUSED') AND last_activity_at < datetime('now', '-24 hours')`.

### Recovery Sequence on App Restart

```
1. Query runtime_workflows WHERE workflow_state NOT IN ('COMPLETED', 'ABORTED', 'STOPPED', 'IDLE')
2. For each active workflow:
   a. Load all runtime_steps
   b. Load all runtime_connections
   c. Build scheduler adjacency lists
   d. For each step in a non-terminal state:
      - Apply per-state recovery action from table above
   e. Check stale threshold (24h)
   f. If not stale: resume normal execution
   g. If stale: mark as stale, wait for user decision
3. Emit WORKFLOW_RESUMED events for each recovered workflow
```

## Execution Logging Strategy

### Event Types

Every engine event is logged unconditionally. The log event type taxonomy:

```typescript
export type LogEventType =
  // Workflow lifecycle
  | 'WORKFLOW_CREATED'
  | 'WORKFLOW_STARTED'
  | 'WORKFLOW_COMPLETED'
  | 'WORKFLOW_ABORTED'
  | 'WORKFLOW_STOPPED'
  | 'WORKFLOW_RESUMED'        // After crash recovery
  // Step state changes
  | 'STEP_STATE_CHANGED'
  // Scheduler decisions
  | 'SCHEDULER_ACTIVATED_STEPS'
  // Parameter operations
  | 'PARAMETER_INPUT_RESOLVED'
  | 'PARAMETER_OUTPUT_WRITTEN'
  // Condition evaluation
  | 'CONDITION_EVALUATED'
  // Resource operations
  | 'RESOURCE_ACQUIRED'
  | 'RESOURCE_RELEASED'
  | 'RESOURCE_QUEUED'
  | 'SYNC_BARRIER_REGISTERED'
  | 'SYNC_BARRIER_MATCHED'
  // User interaction
  | 'USER_INPUT_SUBMITTED'    // Captures full form data
  // Import
  | 'PACKAGE_IMPORTED'
  // Errors
  | 'ENGINE_ERROR';
```

### Log Entry Structure

```typescript
export interface ExecutionLogEntry {
  workflow_instance_id: string;
  step_oid: string | null;        // null for workflow-level events
  step_instance_id: string | null;
  event_type: LogEventType;
  event_data_json: string;        // Serialized event-specific data
  timestamp: string;              // ISO 8601 UTC
}

// Example event_data for STEP_STATE_CHANGED:
// { "from_state": "EXECUTING", "to_state": "COMPLETING", "triggered_by": "engine" }

// Example event_data for USER_INPUT_SUBMITTED:
// { "form_values": { "cloves_input": "6", "temperature": "180" }, "step_local_id": "Add Garlic" }

// Example event_data for PARAMETER_OUTPUT_WRITTEN:
// { "property_name": "GarlicResponse", "entry_name": "Value", "old_value": "", "new_value": "6", "scope": "workflow" }
```

### Audit Trail Completeness

Each log entry must capture enough data for Phase 5 PDF export to produce a complete audit report:
- Every step: when it started, what state changes it went through, what inputs were resolved, what form data the user entered, what outputs were written
- Every decision: which SELECT 1 branch was taken and why (the evaluated value and matched condition)
- Every parameter: before and after values for full traceability
- User interaction: the actual field values entered, not just "step completed"

## Test Strategy (Claude's Discretion)

### Unit vs Integration Split

| Component | Test Type | Mock Level | Example Tests |
|-----------|----------|------------|---------------|
| StateMachine | Unit | None (pure logic) | Each transition rule individually; invalid transition rejection; guard evaluation |
| Scheduler | Unit | Mock step state lookups | Sequential activation; PARALLEL fork; WAIT ALL with varying completion order; WAIT ANY first-trigger |
| ConditionEvaluator | Unit | None (pure logic) | All 10 operators; type coercion (string, number, boolean); no-match case |
| ParameterResolver | Unit | Mock IValuePropertyRepository | Literal resolution; property lookup; scope chain (workflow -> environment); default fallback |
| PackageExtractor | Unit | None (fflate on real Uint8Array data) | Valid package; corrupt ZIP; missing manifest; missing referenced files |
| WorkflowRunner | Integration | In-memory repositories | Full workflow execution: START -> steps -> END; parallel branches; crash recovery simulation |
| EventQueue | Unit | Mock handler | Serial processing; error handling; queue draining |
| ExecutionLogger | Unit | Mock IExecutionLogger | All event types logged; timestamp format; event_data completeness |

### Test Data Strategy

Use **synthetic data** built programmatically in test fixtures, not real .WFmasterX packages:
- Build `MasterWorkflowSpecification` objects in TypeScript with precise control over step types, connections, and parameters
- Create small focused workflows: "START -> END" (2 steps), "START -> USER_INTERACTION -> END" (3 steps), "START -> PARALLEL -> [A, B] -> WAIT ALL -> END" (6 steps)
- For import pipeline tests: build Uint8Array ZIP data using fflate's `zipSync` function to create in-memory test packages

### Example Test Fixture

```typescript
// __tests__/helpers/fixtures.ts
import { zipSync, strToU8 } from 'fflate';

export function makeLinearWorkflow(stepCount: number): MasterWorkflowSpecification {
  const steps: MasterWorkflowStep[] = [
    { oid: 'start', local_id: 'Start', step_type: 'START', /* ... */ },
  ];
  const connections: WorkflowConnection[] = [];

  for (let i = 1; i <= stepCount; i++) {
    steps.push({
      oid: `step-${i}`,
      local_id: `Step ${i}`,
      step_type: 'USER_INTERACTION',
      /* ... minimal spec ... */
    });
    connections.push({
      from_step_id: i === 1 ? 'start' : `step-${i - 1}`,
      to_step_id: `step-${i}`,
      connection_id: `conn-${i}`,
    });
  }

  steps.push({ oid: 'end', local_id: 'End', step_type: 'END', /* ... */ });
  connections.push({
    from_step_id: `step-${stepCount}`,
    to_step_id: 'end',
    connection_id: `conn-end`,
  });

  return { oid: 'test-wf', local_id: 'Test', version: '1.0.0', steps, connections, /* ... */ };
}

export function makeTestPackageZip(workflow: MasterWorkflowSpecification): Uint8Array {
  return zipSync({
    'manifest.json': strToU8(JSON.stringify({
      packageVersion: '1.0',
      packageType: 'runtime',
      workflowOid: workflow.oid,
      workflowVersion: workflow.version,
      schemaVersion: '4.0',
      files: [{ path: 'Test.WFmaster', type: 'workflow', oid: workflow.oid }],
    })),
    'Test.WFmaster': strToU8(JSON.stringify(workflow)),
  });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| JSZip for ZIP processing | fflate (pure JS, zero polyfills) | 2022+ | No stream/buffer polyfills needed in React Native; 40x faster |
| uuid npm package with polyfills | crypto.randomUUID() native | Node.js 19+ (2022) | No external dependency; works in Node.js test environment natively |
| Vitest 2.x workspace config | Vitest 3+/4.x projects config | 2025 | Use `test.projects` instead of `workspace` in vitest.config.ts |
| expo-file-system legacy API (readAsStringAsync) | expo-file-system new API (File class with .bytes()) | SDK 54 (2025) | Object-based API; `new File(path).bytes()` returns Uint8Array directly |
| expo-document-picker result.type === 'success' | result.canceled === false with assets array | SDK 52+ | Result type changed; check `canceled` boolean, access `assets` array |

**Deprecated/outdated:**
- `withTransactionAsync()`: Do not use. Use `withExclusiveTransactionAsync()` on native, WriteQueue on web.
- JSZip in Expo: Requires polyfills, last release 2022, known Android issues.
- `expo-random`: Merged into `expo-crypto`.
- Vitest `workspace` config: Replaced by `projects` in Vitest 3+.

## Open Questions

1. **Import pipeline: exact .WFlibX manifest structure**
   - What we know: .WFlibX contains multiple .WFmaster files in a `workflows/` directory and shares environments/actions across them
   - What's unclear: Does the manifest.json for .WFlibX differ from .WFmasterX? Does it list all workflows or just metadata?
   - Recommendation: Support both formats but start with .WFmasterX (single workflow). The .WFlibX format can be inferred from the package structure (presence of `workflows/` directory). Validate against actual test packages when available.

2. **Resource management scope in Phase 2**
   - What we know: Resource acquisition, FIFO queues, deadlock prevention (alphabetical order), and SYNC barriers are all specified in ExecutionEngineSpec.md
   - What's unclear: The roadmap assigns EXEC-08 (Resource Manager) and EXEC-09 (SYNC barriers) to Phase 3, but the engine needs resource foundations for the WAITING -> STARTING transition
   - Recommendation: Build resource acquisition/release foundations in Phase 2 as part of the step execution flow. Steps without resource commands bypass the resource manager. Full FIFO queue and SYNC barrier logic can be Phase 2 scope since they are testable without UI.

3. **ACTION PROXY and SCRIPT step handling in Phase 2**
   - What we know: These step types require action servers (v2) and Pyodide (v2) respectively
   - What's unclear: Should the engine throw an error, skip, or stub these step types in v1?
   - Recommendation: The state machine and step executor should recognize these types. When encountered, transition to ABORTED with a descriptive error "ACTION PROXY steps require action server configuration (v2 feature)". This is better than silently skipping because it gives the user clear feedback.

## Sources

### Primary (HIGH confidence)
- `.BrainPalMobile/StateMachineSpec.md` -- Complete ISA-88 transition table, state definitions, step-type behaviors
- `.BrainPalMobile/ExecutionEngineSpec.md` -- Engine component architecture, workflow creation/completion, scheduler, parameter resolver, condition evaluator, resource manager, event system
- `.BrainPalMobile/DataModelSpec.md` -- Complete data model: ManagedElement, ParameterSpecification, ValueProperty, ResourceProperty types
- `.BrainPalMobile/PackageFormatSpec.md` -- ZIP structure, manifest format, extraction process, image handling
- `.BrainPalMobile/StorageSpec.md` (via schema.ts) -- All 18 SQLite tables with column definitions and indexes
- `.planning/research/ARCHITECTURE.md` -- Engine architecture, patterns, data flow, anti-patterns
- `.planning/research/PITFALLS.md` -- Race conditions, crash recovery, transaction scope, import gotchas

### Secondary (MEDIUM confidence)
- [fflate GitHub](https://github.com/101arrowz/fflate) -- API usage, unzipSync/strFromU8, filter options
- [fflate npm](https://www.npmjs.com/package/fflate) -- Version 0.8.2, zero dependencies, works in Node.js + browser
- [Expo Crypto Documentation](https://docs.expo.dev/versions/latest/sdk/crypto/) -- randomUUID() API, platform support
- [Expo Document Picker Documentation](https://docs.expo.dev/versions/latest/sdk/document-picker/) -- getDocumentAsync API, result types, SDK 54
- [Expo FileSystem Documentation](https://docs.expo.dev/versions/latest/sdk/filesystem/) -- New File class API, bytes() method, SDK 54
- [Vitest Monorepo Setup](https://vitest.dev/guide/projects) -- Projects configuration for monorepo
- [Turborepo + Vitest Guide](https://turborepo.dev/docs/guides/tools/vitest) -- Integration pattern

### Tertiary (LOW confidence)
- [crypto.randomUUID MDN](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID) -- Browser/Node.js availability
- [TypeScript State Machine Patterns (Medium)](https://medium.com/@floyd.may/building-a-typescript-state-machine-cc9e55995fa8) -- Table-driven approach
- [ISA-88 Wikipedia](https://en.wikipedia.org/wiki/ISA-88) -- Standard overview

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- fflate verified via npm/GitHub docs; Vitest verified via official docs; crypto.randomUUID verified via MDN and Expo docs
- Architecture: HIGH -- patterns derived from project specification documents (StateMachineSpec, ExecutionEngineSpec, DataModelSpec) and Phase 1 research
- Pitfalls: HIGH -- race condition pitfall documented in PITFALLS.md and verified against async/await interleaving behavior; import pitfalls derived from PackageFormatSpec validation requirements
- Crash recovery: MEDIUM -- recovery strategy is informed by ISA-88 semantics but specific per-state decisions are engineering judgment
- Test strategy: HIGH -- Vitest for pure TS packages is established in STACK.md; synthetic test data pattern is standard practice

**Research date:** 2026-02-25
**Valid until:** 60 days (stable domain -- ISA-88 spec, fflate API, and engine architecture are all stable)
