---
phase: quick
plan: 001
subsystem: ui
tags: [zustand, event-bus, race-condition, execution-store]
duration: 2min
completed: 2026-02-25
---

# Quick Task 001: Wire Engine EventBus to Execution Store

**Fixed race condition where execution store showed IDLE after startWorkflow because store entry was created after events fired.**

## Root Cause

The EngineProvider already had correct EventBus subscriptions (WORKFLOW_STARTED, WORKFLOW_COMPLETED, STEP_STATE_CHANGED, etc.) wired to execution store actions. The bug was in `[oid].tsx` where `addActiveWorkflow` was called AFTER `runner.startWorkflow()`. Since `startWorkflow` emits WORKFLOW_STARTED synchronously, the event handler called `updateWorkflowState` but found no store entry (the `if (!wf) return state` guard silently dropped the update).

## Fix

Reordered `handleStartExecution` in `apps/mobile/app/execution/library/[oid].tsx`:
1. `runner.createWorkflow(spec)` — returns instanceId, no events
2. `addActiveWorkflow(instanceId, ...)` — creates store entry with IDLE
3. `setCurrentWorkflow(instanceId)` — sets active workflow for execution screen
4. `addRuntimeWorkflow(...)` — adds to workflow store (IDLE, not RUNNING)
5. `runner.startWorkflow(instanceId)` — emits WORKFLOW_STARTED → store updates to RUNNING
6. Navigate to execution screen

## Commit

- `a10a55a` — fix(execution): reorder store setup before startWorkflow to fix race condition

## Files Modified

- `apps/mobile/app/execution/library/[oid].tsx` — reordered store additions before startWorkflow, added setCurrentWorkflow selector
