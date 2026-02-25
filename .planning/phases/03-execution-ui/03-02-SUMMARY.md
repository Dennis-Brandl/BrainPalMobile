---
phase: 03-execution-ui
plan: 02
subsystem: ui
tags: [react-native, expo-router, zustand, workflow-cards, state-badge, navigation, isa88]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: SQLite schema, Zustand stores, theme tokens (colors, typography, spacing)
  - phase: 03-execution-ui plan 01
    provides: EngineProvider, execution store, workflow store runtime tracking, SQLite repositories
provides:
  - Home screen with Active/Library dual-tab navigation
  - StateBadge component for ISA-88 color-coded state display
  - ActiveWorkflowCard and LibraryWorkflowCard components
  - Library detail screen with Start Execution workflow launch
  - Execution stack layout with navigation routing
  - useDeviceType responsive hook
  - getSpecificationJson standalone query
affects: [03-03-step-renderer, 03-04-integration-test]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Segmented control tab pattern: useState-driven tab switching with FlatList per tab"
    - "Typed route casting: Href type assertion for dynamic Expo Router segments"
    - "Standalone query pattern: getSpecificationJson as exported function (not store method) for DB queries outside state"

key-files:
  created:
    - apps/mobile/src/components/workflow/StateBadge.tsx
    - apps/mobile/src/components/workflow/WorkflowCard.tsx
    - apps/mobile/src/hooks/useDeviceType.ts
    - apps/mobile/app/execution/_layout.tsx
    - apps/mobile/app/execution/[instanceId].tsx
    - apps/mobile/app/execution/library/[oid].tsx
  modified:
    - apps/mobile/app/(tabs)/index.tsx
    - apps/mobile/app/(tabs)/_layout.tsx
    - apps/mobile/app/_layout.tsx
    - apps/mobile/src/stores/workflow-store.ts

key-decisions:
  - "stepCount derived during rowToWorkflow by parsing specification_json steps array length"
  - "getSpecificationJson as standalone export (not store method) since it needs db arg and doesn't modify state"
  - "Expo Router dynamic route paths cast via 'as Href' to handle typed routes before generation"
  - "Execution screen placeholder created for navigation target (full implementation in 03-03)"

patterns-established:
  - "Card component pattern: Pressable wrapper with surface bg, border, rounded corners, pressed opacity"
  - "Tab-in-screen pattern: Home screen manages its own Active/Library tabs via useState, separate from bottom tab navigator"
  - "Relative time display: getRelativeTime helper for human-readable time-since strings"

# Metrics
duration: 5min
completed: 2026-02-25
---

# Phase 3 Plan 2: Home Screen and Library Detail Summary

**Home screen with Active/Library dual-tab navigation, ISA-88 state badges, workflow cards, and library detail screen with Start Execution workflow launch flow**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-25T20:24:14Z
- **Completed:** 2026-02-25T20:29:22Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Home screen rewritten with Active/Library segmented tab switcher replacing single-list layout
- StateBadge renders color-coded pills for all ISA-88 workflow and step states (blue/amber/green/red/gray)
- Library detail screen shows workflow metadata with step type breakdown and Start Execution button
- Full navigation flow: Home -> Library -> Detail -> Start -> Execution screen
- Active workflow list merges execution store and workflow store data

## Task Commits

Each task was committed atomically:

1. **Task 1: Create shared components and hooks** - `fbaf816` (feat)
2. **Task 2: Rewrite Home screen with Active/Library tabs and create library detail screen** - `e8a6ef5` (feat)

## Files Created/Modified

### Created
- `apps/mobile/src/components/workflow/StateBadge.tsx` - Color-coded ISA-88 state badge pill component
- `apps/mobile/src/components/workflow/WorkflowCard.tsx` - ActiveWorkflowCard and LibraryWorkflowCard components
- `apps/mobile/src/hooks/useDeviceType.ts` - Responsive device type detection hook (phone/tablet/desktop)
- `apps/mobile/app/execution/_layout.tsx` - Execution Stack navigator for [instanceId] and library/[oid]
- `apps/mobile/app/execution/[instanceId].tsx` - Execution screen placeholder (full implementation in 03-03)
- `apps/mobile/app/execution/library/[oid].tsx` - Library workflow detail screen with Start Execution

### Modified
- `apps/mobile/app/(tabs)/index.tsx` - Rewritten with Active/Library dual-tab layout
- `apps/mobile/app/(tabs)/_layout.tsx` - Hide header on Home tab
- `apps/mobile/app/_layout.tsx` - Add execution route to root Stack
- `apps/mobile/src/stores/workflow-store.ts` - Add stepCount to MasterWorkflow, getSpecificationJson query

## Decisions Made
- **stepCount derivation:** Parsed from specification_json during rowToWorkflow rather than stored as a separate column, keeping the schema unchanged
- **getSpecificationJson as standalone function:** Since it needs a db argument and returns data without modifying store state, it's a standalone export rather than a store method
- **Route type casting:** Used `as Href` assertion for dynamic Expo Router paths (`/execution/${id}`) since typed routes are auto-generated and may not include new routes until build
- **Execution placeholder:** Created a minimal execution screen at `[instanceId].tsx` as a navigation target; full step renderer and controls come in plan 03-03

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created execution screen placeholder for navigation target**
- **Found during:** Task 2 (creating execution routes)
- **Issue:** Navigating to `/execution/${instanceId}` requires a screen file to exist
- **Fix:** Created `apps/mobile/app/execution/[instanceId].tsx` with basic workflow state display
- **Files modified:** apps/mobile/app/execution/[instanceId].tsx
- **Verification:** TypeScript compiles, navigation target exists
- **Committed in:** e8a6ef5 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Placeholder necessary for navigation to work. No scope creep.

## Issues Encountered
- Expo Router typed routes didn't recognize new `/execution/` paths until routes are regenerated at build time. Resolved by casting route strings with `as Href` type assertion.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Home screen and library detail are ready for user testing
- Execution screen placeholder is ready to be replaced by step renderer in 03-03
- StateBadge and WorkflowCard components are reusable across execution and overview screens
- Start Execution flow creates runtime workflow and navigates to execution screen

---
*Phase: 03-execution-ui*
*Completed: 2026-02-25*
