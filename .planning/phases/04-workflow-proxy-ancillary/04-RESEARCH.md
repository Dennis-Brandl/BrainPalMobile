# Phase 4: Workflow Proxy + Ancillary Features - Research

**Researched:** 2026-02-26
**Domain:** Nested workflow execution, execution history UI, local notifications, settings management
**Confidence:** HIGH

## Summary

Phase 4 adds four capabilities to BrainPal Mobile: (1) Workflow Proxy step execution creating child workflows inline, (2) execution history display with summary and audit-trail views, (3) local notifications for steps needing attention and errors, and (4) a Settings screen with notification preferences, storage counts, and cleanup controls.

The critical implementation insight is that the existing codebase already has 90% of the infrastructure needed. The `MasterWorkflowSpecification` type includes a `child_workflows: MasterWorkflowSpecification[]` array. The `RuntimeWorkflow` type already has `parent_workflow_instance_id` and `parent_step_oid` fields. The `RuntimeWorkflowStep` type has `child_workflow_instance_id`. The database schema has `parent_workflow_instance_id` and `parent_step_oid` columns on `runtime_workflows` and an index on `parent_workflow_instance_id`. The `execution_log_entries` table already captures all events needed for history display. The `notification_preferences` table is already in the schema with default preferences seeded.

**Primary recommendation:** Implement WORKFLOW_PROXY as a new case in the step executor that reuses `WorkflowRunner.createWorkflow` + `startWorkflow` for the child, with an async completion callback that resumes the parent step. Build history and settings as straightforward SQLite query screens. Use `expo-notifications` for mobile and the Browser Notification API for web.

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| expo-sqlite | ~16.0.10 | History queries, notification prefs, storage counts | Already installed; execution_log_entries and notification_preferences tables exist |
| zustand | ~5.0.11 | Notification preference state, history list state | Already installed; established bridge pattern |
| expo-router | ~6.0.23 | History detail navigation, settings screen routing | Already installed; tab screens already exist as placeholders |
| @brainpal/engine | local | WorkflowRunner, step executor, event bus | Already implemented; WORKFLOW_PROXY case is the stub to replace |

### New Dependencies
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| expo-notifications | ~0.32.x | Local notifications on mobile (iOS/Android) | Install via `npx expo install expo-notifications` |
| expo-device | ~7.0.x | Check if running on physical device (notification guard) | Install via `npx expo install expo-device` |
| expo-constants | ~17.0.x | Access projectId for notification config | Likely already available as Expo SDK transitive dep; install if missing |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| expo-notifications | notifee (@notifee/react-native) | More features but requires dev build setup; expo-notifications is sufficient for local notifications and already in the stack plan |
| Browser Notification API (web) | expo-notifications on web | expo-notifications does NOT support web; must use native browser API directly |
| New history Zustand store | Direct SQLite queries in component | History is read-only data; a store adds unnecessary complexity. Use direct SQLite queries via hooks. |

**Installation:**
```bash
npx expo install expo-notifications expo-device
```

## Architecture Patterns

### Recommended Project Structure (Phase 4 additions)
```
packages/engine/src/
  runner/
    step-executor.ts       # ADD WORKFLOW_PROXY case (replaces UnsupportedStepTypeError)
    workflow-runner.ts      # ADD child workflow tracking, pause/abort propagation
    types.ts               # ADD childWorkflowId tracking to WorkflowRunnerState
apps/mobile/src/
  hooks/
    useHistory.ts           # NEW: query execution_log_entries + runtime_workflows
    useNotificationPrefs.ts # NEW: read/write notification_preferences table
    useStorageCounts.ts     # NEW: count queries for settings display
  services/
    notification-service.ts # NEW: platform notification dispatch (mobile + web)
  stores/
    execution-store.ts      # MODIFY: track child workflow steps as parent active steps
apps/mobile/app/
  (tabs)/
    history.tsx             # REPLACE placeholder with history list
    settings.tsx            # REPLACE placeholder with full settings screen
  execution/
    history/
      [instanceId].tsx      # NEW: history detail screen for a workflow instance
```

### Pattern 1: Child Workflow as Transparent Delegation
**What:** When a WORKFLOW_PROXY step reaches EXECUTING, the engine creates a child RuntimeWorkflow from the embedded `child_workflows` array in the parent's master spec, sets `parent_workflow_instance_id` and `parent_step_oid` on the child, and starts it. The child runs through the same WorkflowRunner. When the child completes, output parameters propagate back to the parent step's `resolved_outputs_json`, and the parent step auto-completes.
**When to use:** Every WORKFLOW_PROXY step execution.
**Critical detail:** The parent step stays in EXECUTING state while the child runs. The parent step does NOT auto-complete. Completion is triggered when the engine detects the child workflow reaching COMPLETED state.

```typescript
// In step-executor.ts executeExecutingPhase:
case 'WORKFLOW_PROXY': {
  // 1. Find the child workflow spec from the parent's embedded child_workflows
  const parentSpec = JSON.parse(step.step_json) as MasterWorkflowStep;
  const parentWorkflowSpec = /* retrieve from specification_json */;
  const childSpec = parentWorkflowSpec.child_workflows.find(
    cw => cw.oid === parentSpec./* reference to child workflow OID */
  );

  // 2. Create and start child workflow
  const childInstanceId = await runner.createWorkflow(childSpec);
  // Set parent references on child
  childWorkflow.parent_workflow_instance_id = workflowInstanceId;
  childWorkflow.parent_step_oid = step.step_oid;

  // 3. Store child reference on parent step
  step.child_workflow_instance_id = childInstanceId;
  await stepRepo.save(step);

  // 4. Start child -- parent step stays in EXECUTING
  await runner.startWorkflow(childInstanceId);

  // 5. Return false -- step does NOT auto-complete
  return false;
}
```

### Pattern 2: Child Completion Triggers Parent Completion
**What:** When the child workflow reaches its END step and completes, the engine detects it has a `parent_workflow_instance_id`, extracts child output parameters, propagates them to the parent step, and then completes the parent step (EXECUTING -> COMPLETING -> COMPLETED).
**When to use:** In the `completeWorkflow` or `onStepCompleted` path when the completing workflow has a parent.

```typescript
// In workflow-runner.ts completeWorkflow path:
if (childWorkflow.parent_workflow_instance_id) {
  // Propagate child outputs to parent step
  const parentRunnerState = this.activeWorkflows.get(childWorkflow.parent_workflow_instance_id);
  const parentStepOid = childWorkflow.parent_step_oid;
  const parentStepInstanceId = parentRunnerState.stepOidToInstanceId.get(parentStepOid);

  // Copy child workflow output parameters to parent step resolved_outputs_json
  // Then enqueue parent step completion: EXECUTING -> COMPLETING
  await this.eventQueue.enqueue({
    type: 'STEP_STATE_CHANGED',
    stepInstanceId: parentStepInstanceId,
    workflowInstanceId: childWorkflow.parent_workflow_instance_id,
    stepOid: parentStepOid,
    fromState: 'EXECUTING',
    toState: 'COMPLETING',
    event: 'SC',
  });
}
```

### Pattern 3: Pause/Abort Propagation (Parent -> Child)
**What:** When the parent workflow is paused or aborted, the engine checks if any active steps are WORKFLOW_PROXY steps with a running child. If so, it propagates the pause/abort to the child workflow automatically.
**When to use:** In `pauseWorkflow` and `abort` methods.

```typescript
// In workflow-runner.ts pauseWorkflow:
for (const step of steps) {
  if (step.step_type === 'WORKFLOW_PROXY' && step.child_workflow_instance_id) {
    const childWf = await this.config.workflowRepo.getById(step.child_workflow_instance_id);
    if (childWf && childWf.workflow_state === 'RUNNING') {
      await this.pauseWorkflow(step.child_workflow_instance_id);
    }
  }
}
```

### Pattern 4: Inline Child Steps in UI (Flat Carousel)
**What:** The EngineProvider's event bus subscription already adds user-facing steps to `activeStepInstanceIds` when they reach EXECUTING. Since child workflow steps go through the same engine pipeline, their USER_INTERACTION and YES_NO steps will naturally appear in the parent's active step list -- IF the execution store tracks them under the parent workflow's ID.
**When to use:** Always, for seamless child workflow experience.
**Implementation strategy:** When a child workflow's step emits STEP_STATE_CHANGED with toState 'EXECUTING', the EngineProvider bridge should check if the child has a parent, and if so, add the step to the PARENT's active step list instead of the child's. This makes child steps appear inline in the parent carousel.

```typescript
// In EngineProvider STEP_STATE_CHANGED handler:
eventBus.on('STEP_STATE_CHANGED', (data) => {
  const { stepInstanceId, workflowInstanceId, toState } = data;
  if (toState === 'EXECUTING') {
    // Determine the root parent workflow for UI tracking
    const effectiveWorkflowId = getParentWorkflowId(workflowInstanceId) ?? workflowInstanceId;
    // Add to the parent's carousel
    execStore.addActiveStep(effectiveWorkflowId, stepInstanceId);
  }
});
```

### Pattern 5: History as Read-Only SQLite Queries
**What:** History display reads directly from `runtime_workflows`, `runtime_steps`, and `execution_log_entries` tables using SQLite queries. No Zustand store needed -- this is read-only, non-reactive data.
**When to use:** For the History tab and history detail screen.

```typescript
// Hook: useHistory.ts
export function useCompletedWorkflows() {
  const db = useSQLiteContext();
  // Query completed/aborted/stopped workflows
  const rows = await db.getAllAsync<RuntimeWorkflowRow>(
    `SELECT * FROM runtime_workflows
     WHERE workflow_state IN ('COMPLETED', 'ABORTED', 'STOPPED')
     AND parent_workflow_instance_id IS NULL
     ORDER BY completed_at DESC`
  );
  return rows;
}

export function useWorkflowHistory(instanceId: string) {
  const db = useSQLiteContext();
  // Get all steps for this workflow
  const steps = await db.getAllAsync<RuntimeStepRow>(
    `SELECT * FROM runtime_steps
     WHERE workflow_instance_id = ? OR workflow_instance_id IN (
       SELECT instance_id FROM runtime_workflows WHERE parent_workflow_instance_id = ?
     )
     ORDER BY activated_at ASC`,
    [instanceId, instanceId]
  );
  // For audit trail: get execution log entries
  const logs = await db.getAllAsync<ExecutionLogRow>(
    `SELECT * FROM execution_log_entries
     WHERE workflow_instance_id = ? OR workflow_instance_id IN (
       SELECT instance_id FROM runtime_workflows WHERE parent_workflow_instance_id = ?
     )
     ORDER BY timestamp ASC`,
    [instanceId, instanceId]
  );
  return { steps, logs };
}
```

### Pattern 6: Platform-Conditional Notification Service
**What:** A notification service module that uses `expo-notifications` on mobile and the Browser `Notification` API on web. The service subscribes to engine events and dispatches notifications based on user preferences from the `notification_preferences` SQLite table.
**When to use:** For all notification dispatch.

```typescript
// services/notification-service.ts
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications'; // mobile only
import type { EngineEventBus } from '@brainpal/engine';

export class NotificationService {
  constructor(
    private eventBus: EngineEventBus,
    private getPreference: (type: string) => Promise<boolean>,
  ) {}

  async initialize() {
    if (Platform.OS !== 'web') {
      // Mobile: request permissions, set handler
      await Notifications.requestPermissionsAsync();
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
    }

    // Subscribe to engine events
    this.eventBus.on('USER_INPUT_REQUIRED', async (data) => {
      if (await this.getPreference('STEP_ATTENTION')) {
        await this.send('Step Needs Attention', 'A step requires your input', data);
      }
    });

    this.eventBus.on('ERROR', async (data) => {
      if (await this.getPreference('ERROR')) {
        await this.send('Error', data.message, data);
      }
    });
  }

  private async send(title: string, body: string, data: Record<string, unknown>) {
    if (Platform.OS === 'web') {
      // Browser Notification API
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body });
      }
    } else {
      // expo-notifications
      await Notifications.scheduleNotificationAsync({
        content: { title, body, data },
        trigger: null, // immediate
      });
    }
  }
}
```

### Anti-Patterns to Avoid
- **Creating a separate WorkflowRunner for child workflows:** Reuse the SAME runner instance. The runner already tracks multiple workflows via `activeWorkflows` Map. Creating a separate runner would break event serialization through the shared EngineEventQueue.
- **Using INSERT OR REPLACE for notification_preferences:** The `notification_preferences` table has `notification_type` as PRIMARY KEY. Use `ON CONFLICT DO UPDATE` to avoid cascade deletion risks (same pitfall as commit 3f9990c, though this table has no foreign keys referencing it).
- **Storing history in Zustand:** History is read-only, potentially large, and not needed reactively. Query SQLite directly in hooks. Don't bloat the Zustand store.
- **Separate carousel per child workflow:** The UX decision is that child steps appear inline. Do NOT create a separate execution screen or carousel for child workflows.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Mobile local notifications | Custom platform bridge | expo-notifications `scheduleNotificationAsync` | Handles Android channels, iOS permissions, sound/vibration, tap response navigation |
| Notification permissions | Manual platform checks | expo-notifications `requestPermissionsAsync` / `getPermissionsAsync` | Cross-platform permission handling with iOS-specific options |
| Notification tap handling | Custom deep link parser | expo-notifications `addNotificationResponseReceivedListener` + expo-router navigation | Handles app backgrounded/foregrounded states correctly |
| Android notification channels | Direct Android API calls | expo-notifications `setNotificationChannelAsync` | Required for Android 8.0+; expo-notifications handles it cleanly |
| Web background notifications | Custom service worker | Browser `Notification` API (simple) | For v1, in-tab notifications are sufficient; service worker push is Phase 5+ scope |
| Duration calculation | Manual date math | Simple `Date` subtraction: `new Date(completed_at) - new Date(activated_at)` | Timestamps are ISO 8601 strings, native Date handles them |

**Key insight:** The existing engine infrastructure (event bus, execution logger, repository pattern) means Phase 4's primary work is WIRING, not building. The child workflow spec is already embedded in `MasterWorkflowSpecification.child_workflows`. The runtime tables already have parent/child fields. The execution log already captures all events needed for history.

## Common Pitfalls

### Pitfall 1: Child Workflow Event Bus Events Target Wrong Workflow ID
**What goes wrong:** Child workflow step state changes emit events with the child's `workflowInstanceId`. The EngineProvider bridge adds active steps to the child workflow entry in the execution store. But the UI expects all steps (parent + child) under the PARENT workflow ID for seamless carousel display.
**Why it happens:** The engine emits events with the direct workflow owner's ID, which is correct for the engine but wrong for the UI's flat view.
**How to avoid:** In the EngineProvider bridge, when processing STEP_STATE_CHANGED for a step whose workflow has a `parent_workflow_instance_id`, map the active step to the parent's workflow entry in the execution store. The engine itself should NOT be changed -- the bridge layer handles this mapping.
**Warning signs:** Child workflow steps not appearing in the carousel; empty carousel when child workflow is running.

### Pitfall 2: Pause/Abort Not Reaching Child Workflows
**What goes wrong:** User pauses or aborts the parent workflow, but child workflow keeps running. Child steps continue appearing or the child enters an inconsistent state.
**Why it happens:** `pauseWorkflow` and `abort` iterate over the parent's steps only. They don't recursively handle child workflows.
**How to avoid:** In `pauseWorkflow`, `resumeWorkflow`, and `abort`, check each WORKFLOW_PROXY step for a `child_workflow_instance_id` and recursively apply the action to the child workflow.
**Warning signs:** After pausing parent, child steps are still in EXECUTING state.

### Pitfall 3: Child Workflow Completion Race with Event Queue
**What goes wrong:** Child workflow completes and the engine tries to resume the parent step, but the parent step completion event races with other events in the EngineEventQueue.
**Why it happens:** Child workflow completion happens inside the event queue handler, which is already processing an event. Enqueueing a new event for parent step completion while inside the handler can cause ordering issues.
**How to avoid:** Use direct method calls (like `activateStep` does currently) instead of `eventQueue.enqueue` when the parent step needs to complete from within the child's completion handler. The code is already inside the serial event queue handler, so direct calls maintain serialization.
**Warning signs:** Parent step stuck in EXECUTING after child completes.

### Pitfall 4: History Query Including Child Workflows Separately
**What goes wrong:** History list shows both the parent workflow AND child workflows as separate entries, cluttering the list.
**Why it happens:** A naive query on `runtime_workflows WHERE workflow_state IN ('COMPLETED', 'ABORTED', 'STOPPED')` returns all workflows including children.
**How to avoid:** Filter history list to only show root workflows: `WHERE parent_workflow_instance_id IS NULL`. When displaying detail, include child workflow steps by joining on `parent_workflow_instance_id`.
**Warning signs:** Duplicate workflow entries in history; child workflows appearing as standalone entries.

### Pitfall 5: expo-notifications Web Crash
**What goes wrong:** Importing `expo-notifications` on web causes a runtime error because the native module is not available.
**Why it happens:** expo-notifications does NOT support web platform. Importing it unconditionally crashes the web build.
**How to avoid:** Use conditional imports: `Platform.OS !== 'web' ? require('expo-notifications') : null`. Or create platform-specific files: `notification-service.native.ts` and `notification-service.web.ts`.
**Warning signs:** Web build crashes with "Native module not found" or similar error.

### Pitfall 6: Notification Preferences Not Persisted Before First Use
**What goes wrong:** The schema seeds default notification preferences via INSERT statements in schema.ts. But if the app was installed before Phase 4 code, the preferences might already exist or might not.
**Why it happens:** The schema SQL runs `INSERT INTO notification_preferences VALUES (...)` which would fail on duplicate keys during re-initialization.
**How to avoid:** The existing schema already seeds these values. Since the schema includes `DROP TABLE IF EXISTS` at the top, the table is recreated fresh on every schema init. The preferences will be seeded correctly. For existing installations, the schema version check in `initializeDatabase` will need to handle the migration path. However, since this is a development-phase app, a clean schema init is acceptable.
**Warning signs:** Missing notification preferences rows; toggle states incorrect on first load.

### Pitfall 7: INSERT OR REPLACE on notification_preferences
**What goes wrong:** Using `INSERT OR REPLACE` to update notification preferences. While `notification_preferences` has no child tables with CASCADE, the pattern should be avoided project-wide per the learned lesson from commit 3f9990c.
**Why it happens:** Developer habit or copy-paste from older code.
**How to avoid:** Always use `INSERT INTO ... ON CONFLICT DO UPDATE SET ...` (upsert) for all tables. This is a project-wide convention.
**Warning signs:** N/A for this specific table, but establishes bad precedent.

## Code Examples

### WORKFLOW_PROXY Step Execution (Engine)
```typescript
// Source: Derived from existing step-executor.ts pattern and MasterWorkflowSpecification.child_workflows field

case 'WORKFLOW_PROXY': {
  // The master step spec contains a reference to which child workflow to invoke
  // The child workflow spec is embedded in the parent's MasterWorkflowSpecification.child_workflows[]

  // 1. Get parent workflow's full specification
  const parentWorkflow = await ctx.stepRepo.getByWorkflow(ctx.workflowInstanceId);
  // Note: The parent's specification_json is stored on the RuntimeWorkflow, accessed via workflowRepo

  // 2. Find the matching child workflow spec
  // The WORKFLOW_PROXY step's masterStep should reference the child by OID
  // This reference could be in masterStep.oid mapping or a dedicated field

  // 3. Use the existing createWorkflow path but set parent references:
  //    workflow.parent_workflow_instance_id = ctx.workflowInstanceId
  //    workflow.parent_step_oid = ctx.step.step_oid

  // 4. Start the child workflow

  // 5. Save child_workflow_instance_id on the parent step
  //    step.child_workflow_instance_id = childInstanceId (new field needed on RuntimeWorkflowStep)

  // 6. Return false -- parent step waits in EXECUTING
  return false;
}
```

### History List Query
```typescript
// Source: Existing schema (execution_log_entries, runtime_workflows, runtime_steps tables)

// Get all completed root workflows (excluding child workflows)
const completedWorkflows = await db.getAllAsync<{
  instance_id: string;
  master_workflow_oid: string;
  workflow_state: string;
  specification_json: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}>(
  `SELECT instance_id, master_workflow_oid, workflow_state, specification_json,
          created_at, started_at, completed_at
   FROM runtime_workflows
   WHERE workflow_state IN ('COMPLETED', 'ABORTED', 'STOPPED')
     AND parent_workflow_instance_id IS NULL
   ORDER BY completed_at DESC`
);
```

### History Detail: Step Summary Cards
```typescript
// Source: Existing runtime_steps table

// Get all steps for a workflow (including child workflow steps, inline flat order)
const allSteps = await db.getAllAsync<RuntimeStepRow>(
  `SELECT s.* FROM runtime_steps s
   JOIN runtime_workflows w ON s.workflow_instance_id = w.instance_id
   WHERE (w.instance_id = ? OR w.parent_workflow_instance_id = ?)
     AND s.step_type NOT IN ('START', 'END', 'PARALLEL', 'WAIT_ALL', 'WAIT_ANY')
   ORDER BY s.activated_at ASC`,
  [instanceId, instanceId]
);

// For each step, compute duration:
for (const step of allSteps) {
  const duration = step.completed_at && step.activated_at
    ? new Date(step.completed_at).getTime() - new Date(step.activated_at).getTime()
    : null;
  // duration is in milliseconds
}
```

### Notification Preferences CRUD
```typescript
// Source: Existing notification_preferences table in schema.ts

// Read all preferences
const prefs = await db.getAllAsync<{ notification_type: string; enabled: number }>(
  'SELECT * FROM notification_preferences'
);
// Convert to Map<string, boolean>
const prefMap = new Map(prefs.map(p => [p.notification_type, p.enabled === 1]));

// Update a preference (upsert pattern per project convention)
await db.runAsync(
  `INSERT INTO notification_preferences (notification_type, enabled)
   VALUES (?, ?)
   ON CONFLICT(notification_type) DO UPDATE SET enabled = excluded.enabled`,
  [notificationType, enabled ? 1 : 0]
);
```

### Storage Counts for Settings
```typescript
// Source: Existing tables

const [downloads, active, completed] = await Promise.all([
  db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM master_workflows'
  ),
  db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM runtime_workflows
     WHERE workflow_state IN ('IDLE', 'RUNNING', 'PAUSED')
     AND parent_workflow_instance_id IS NULL`
  ),
  db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM runtime_workflows
     WHERE workflow_state IN ('COMPLETED', 'ABORTED', 'STOPPED')
     AND parent_workflow_instance_id IS NULL`
  ),
]);
```

### Clear Completed Workflows
```typescript
// Source: Existing cascade delete setup in schema

// Delete ALL completed workflows (bulk clear)
// ON DELETE CASCADE will clean up runtime_steps, runtime_connections,
// workflow_value_properties, execution_log_entries, etc.
// Wait -- execution_log_entries does NOT have ON DELETE CASCADE!
// Check: FOREIGN KEY (workflow_instance_id) REFERENCES runtime_workflows(instance_id)
// without ON DELETE CASCADE. Must delete logs manually first.

await db.runAsync(
  `DELETE FROM execution_log_entries WHERE workflow_instance_id IN (
    SELECT instance_id FROM runtime_workflows
    WHERE workflow_state IN ('COMPLETED', 'ABORTED', 'STOPPED')
    AND parent_workflow_instance_id IS NULL
  )`
);
await db.runAsync(
  `DELETE FROM runtime_workflows
   WHERE workflow_state IN ('COMPLETED', 'ABORTED', 'STOPPED')
   AND parent_workflow_instance_id IS NULL`
);
```

### expo-notifications Setup (Mobile)
```typescript
// Source: expo-notifications official docs (https://docs.expo.dev/versions/latest/sdk/notifications/)

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Must call before scheduling any notification on Android 8+
if (Platform.OS === 'android') {
  await Notifications.setNotificationChannelAsync('step-attention', {
    name: 'Step Needs Attention',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    sound: 'default',
  });
  await Notifications.setNotificationChannelAsync('errors', {
    name: 'Errors',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    sound: 'default',
  });
}

// Set handler for foreground notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Handle notification taps -> navigate to specific step
Notifications.addNotificationResponseReceivedListener((response) => {
  const data = response.notification.request.content.data;
  if (data.stepInstanceId && data.workflowInstanceId) {
    // Use expo-router to navigate
    router.push(`/execution/${data.workflowInstanceId}`);
  }
});
```

### Web Notification API
```typescript
// Source: Browser Notification API (standard web API)

// Request permission
async function requestWebNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

// Send notification
function sendWebNotification(title: string, body: string): void {
  if ('Notification' in window && Notification.permission === 'granted') {
    if (document.hidden) {
      // Tab is backgrounded -- use browser notification
      new Notification(title, { body });
    } else {
      // Tab is active -- use in-app toast/banner (React component)
      // Dispatch to a toast store or similar
    }
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| expo-notifications in Expo Go | Requires development build for push (SDK 54+) | SDK 53/54 | Local notifications still work in Expo Go; push requires dev build |
| INSERT OR REPLACE for upserts | ON CONFLICT DO UPDATE | Project convention (commit 3f9990c) | Prevents cascade deletion bugs |
| Separate screens per child workflow | Inline child steps in parent carousel | User decision (Phase 4 CONTEXT) | Simpler UX, more complex bridging logic |

**Deprecated/outdated:**
- expo-notifications push notifications in Expo Go: No longer works as of SDK 53. Must use development builds.
- However, LOCAL notifications (which is what this project needs) still work without dev builds.

## Open Questions

1. **How does the WORKFLOW_PROXY step reference which child workflow to invoke?**
   - What we know: `MasterWorkflowSpecification.child_workflows` is an array of `MasterWorkflowSpecification[]`. The WORKFLOW_PROXY step must have some reference to identify which child to run.
   - What's unclear: The exact field on the `MasterWorkflowStep` that maps to a child workflow OID. It could be via a naming convention, an explicit OID reference in the step spec, or the step's own OID matching.
   - Recommendation: Inspect actual .WFmasterX test package files to determine the mapping. This is a Phase 4 plan-time investigation, not a blocker. The field likely exists in the step_json but was not needed in earlier phases. Check the step spec's description, local_id, or a dedicated `workflow_proxy_oid` field.

2. **Should child workflow output parameters map to parent step outputs or parent workflow scope?**
   - What we know: The context says "output parameters from child workflows propagate back to the parent step on completion." The parent step has `output_parameter_specifications` that define where outputs should be written.
   - What's unclear: Whether the child's workflow-level output parameters are automatically mapped to the parent step's output parameters by name, or if there's an explicit mapping in the spec.
   - Recommendation: The most likely pattern is that the child workflow's output parameter specifications write to Value Properties, and the parent step's input parameters read from those same properties. Verify with actual test packages.

3. **execution_log_entries foreign key lacks ON DELETE CASCADE**
   - What we know: The `execution_log_entries` table has `FOREIGN KEY (workflow_instance_id) REFERENCES runtime_workflows(instance_id)` WITHOUT `ON DELETE CASCADE`.
   - What's unclear: Whether this was intentional (logs should survive workflow deletion for audit) or an oversight.
   - Recommendation: For the "clear completed workflows" feature, explicitly delete log entries before deleting the workflow. Do NOT add CASCADE retroactively -- there may be value in keeping logs separate from workflow lifecycle. The state_transitions table DOES have CASCADE, so it will be cleaned up automatically.

4. **RuntimeWorkflowStep.child_workflow_instance_id column**
   - What we know: The `runtime_steps` schema already has `child_workflow_instance_id TEXT` column. The `RuntimeWorkflowStep` TypeScript type does NOT include this field.
   - What's unclear: N/A -- this is a known gap to fill.
   - Recommendation: Add `child_workflow_instance_id: string | null` to the `RuntimeWorkflowStep` interface in types/runtime.ts. Update the step repository save/load to include this field.

## Sources

### Primary (HIGH confidence)
- Existing codebase analysis: `packages/engine/src/types/master.ts` -- `MasterWorkflowSpecification.child_workflows: MasterWorkflowSpecification[]` field confirms child workflow embedding
- Existing codebase analysis: `packages/engine/src/types/runtime.ts` -- `RuntimeWorkflow.parent_workflow_instance_id` and `parent_step_oid` fields exist
- Existing codebase analysis: `packages/storage/src/database/schema.ts` -- `runtime_workflows.parent_workflow_instance_id`, `runtime_steps.child_workflow_instance_id`, `notification_preferences` table with seeded defaults, `execution_log_entries` table with indexes
- Existing codebase analysis: `packages/engine/src/runner/step-executor.ts` -- WORKFLOW_PROXY case currently throws `UnsupportedStepTypeError`, confirming this is the insertion point
- Existing codebase analysis: `packages/engine/src/runner/workflow-runner.ts` -- Event queue serialization pattern, `activeWorkflows` Map for multi-workflow tracking
- [Expo Notifications API reference](https://docs.expo.dev/versions/latest/sdk/notifications/) -- local notification scheduling, permissions, Android channels, web NOT supported

### Secondary (MEDIUM confidence)
- [Expo SDK 54 Notifications compatibility](https://www.npmjs.com/package/expo-notifications) -- v0.32.16 current, local notifications work in Expo Go
- [Browser Notification API](https://developer.mozilla.org/en-US/docs/Web/API/Notification) -- standard web API for background tab notifications
- Phase 1 Stack Research (`.planning/research/STACK.md`) -- expo-notifications ~0.32.x confirmed in version matrix

### Tertiary (LOW confidence)
- Child workflow OID mapping in WORKFLOW_PROXY steps -- needs verification with actual .WFmasterX packages

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in project or verified in prior research
- Architecture (Workflow Proxy): HIGH for overall pattern, MEDIUM for child workflow OID mapping detail
- Architecture (History/Settings): HIGH -- straightforward SQLite query screens
- Architecture (Notifications): HIGH for mobile, MEDIUM for web (Browser API is well-known but untested in this project)
- Pitfalls: HIGH -- derived from actual codebase analysis, existing CASCADE pitfall lesson

**Research date:** 2026-02-26
**Valid until:** 2026-03-26 (stable domain; no fast-moving dependencies)
