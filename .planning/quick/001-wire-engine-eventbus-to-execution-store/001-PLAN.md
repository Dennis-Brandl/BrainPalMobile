---
phase: quick
plan: 001
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/mobile/app/execution/library/[oid].tsx
autonomous: true

must_haves:
  truths:
    - "After startWorkflow, execution store shows workflowState RUNNING (not IDLE)"
    - "STEP_STATE_CHANGED events update stepStates in the store"
    - "User-facing steps (USER_INTERACTION, YES_NO) appear in activeStepInstanceIds when EXECUTING"
    - "WORKFLOW_COMPLETED/ABORTED/STOPPED events update the store and trigger cleanup"
  artifacts:
    - path: "apps/mobile/app/execution/library/[oid].tsx"
      provides: "Fixed ordering: addActiveWorkflow before startWorkflow"
      contains: "addActiveWorkflow"
  key_links:
    - from: "apps/mobile/app/execution/library/[oid].tsx"
      to: "apps/mobile/src/stores/execution-store.ts"
      via: "addActiveWorkflow called before runner.startWorkflow"
      pattern: "addActiveWorkflow.*\\n.*startWorkflow"
    - from: "apps/mobile/src/providers/EngineProvider.tsx"
      to: "apps/mobile/src/stores/execution-store.ts"
      via: "eventBus.on handlers calling store actions"
      pattern: "eventBus\\.on.*updateWorkflowState"
---

<objective>
Fix the race condition where the execution store shows IDLE after startWorkflow because the workflow entry is added to the store AFTER the engine emits WORKFLOW_STARTED.

Purpose: The EngineProvider already has correct eventBus subscriptions (WORKFLOW_STARTED, WORKFLOW_COMPLETED, WORKFLOW_ABORTED, WORKFLOW_STOPPED, STEP_STATE_CHANGED) that call the right store actions. The bug is in `[oid].tsx` where `addActiveWorkflow` is called on line 123 AFTER `runner.startWorkflow(instanceId)` on line 118. Since `startWorkflow` synchronously emits WORKFLOW_STARTED before returning, the event handler calls `updateWorkflowState` but finds no workflow entry (the `if (!wf) return state` guard in execution-store line 95 silently drops the update). By the time `addActiveWorkflow` runs, it creates the workflow with the default state IDLE.

Output: Fixed `[oid].tsx` with addActiveWorkflow called before startWorkflow.
</objective>

<execution_context>
@C:\Users\dnbra\.claude/get-shit-done/workflows/execute-plan.md
@C:\Users\dnbra\.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/mobile/app/execution/library/[oid].tsx
@apps/mobile/src/providers/EngineProvider.tsx
@apps/mobile/src/stores/execution-store.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Reorder addActiveWorkflow before startWorkflow in [oid].tsx</name>
  <files>apps/mobile/app/execution/library/[oid].tsx</files>
  <action>
In `handleStartExecution` (around lines 98-145), move `addActiveWorkflow` and the workflow store `addRuntimeWorkflow` calls to BEFORE `runner.startWorkflow(instanceId)`. The corrected sequence should be:

1. Parse spec, create workflow via `runner.createWorkflow(spec)` -- this returns instanceId but does NOT emit events yet
2. Add to execution store via `addActiveWorkflow(instanceId, oid, name, totalSteps)` -- creates the store entry with IDLE state
3. Add to workflow store via `useWorkflowStore.getState().addRuntimeWorkflow(...)` -- creates runtime entry
4. Start the workflow via `runner.startWorkflow(instanceId)` -- this emits WORKFLOW_STARTED which the EngineProvider handler will catch and call `updateWorkflowState(instanceId, 'RUNNING')`, correctly finding the entry created in step 2
5. Navigate to execution screen

Specifically, restructure lines 114-136 so that:
- Lines 120-133 (the addActiveWorkflow + addRuntimeWorkflow block) move to between `createWorkflow` and `startWorkflow`
- `setCurrentWorkflow(instanceId)` should also be called after addActiveWorkflow so the execution screen immediately knows which workflow is active
- The `startWorkflow` call moves to after the store additions
- Navigation (`router.replace`) stays last

Also import `setCurrentWorkflow` from the execution store -- add it alongside the existing `addActiveWorkflow` selector on line 53. Use a second selector: `const setCurrentWorkflow = useExecutionStore((s) => s.setCurrentWorkflow);`
  </action>
  <verify>
Run `npx tsc --noEmit` from the apps/mobile directory to confirm no type errors. Visually inspect that `addActiveWorkflow` appears before `startWorkflow` in the handler.
  </verify>
  <done>
`handleStartExecution` calls addActiveWorkflow and addRuntimeWorkflow BEFORE runner.startWorkflow, so when WORKFLOW_STARTED fires, the store entry exists and gets updated to RUNNING. The execution screen navigates with a workflow already in RUNNING state.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with no errors in apps/mobile
2. In `[oid].tsx`, `addActiveWorkflow` call appears before `runner.startWorkflow` call
3. In `[oid].tsx`, `setCurrentWorkflow(instanceId)` is called before navigation
4. The EngineProvider event subscriptions (already correct) will now find the workflow entry when events fire
</verification>

<success_criteria>
- The race condition is eliminated: store entry exists before engine events fire
- TypeScript compiles cleanly
- The execution screen receives a workflow in RUNNING state (not IDLE) when navigated to
</success_criteria>

<output>
After completion, create `.planning/quick/001-wire-engine-eventbus-to-execution-store/001-SUMMARY.md`
</output>
