# Phase 7: UI Cleanup + Dead Code Removal - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Clean up placeholder UI stubs and dead code identified in the v1.0 milestone audit. Four specific items: Execute tab placeholder, Overview tab placeholder, unused FormActionButtons component, and missing Phase 3 VERIFICATION.md. No new capabilities — strictly cleanup and documentation.

</domain>

<decisions>
## Implementation Decisions

### Execute tab behavior
- When active workflow(s) exist: auto-navigate to the most recently started active workflow's execution screen (redirect to `/execution/[instanceId]`)
- When multiple workflows are active: show a list of active workflows so user can pick which to continue
- When no workflow is active: show an empty state with guidance ("No active workflow — start one from the Library tab")
- Badge: show active workflow count on the Execute tab icon

### Overview tab disposition
- Remove entirely — go from 5 tabs to 4 (Home, Execute, History, Settings)
- Delete the overview.tsx file completely (no hidden route preservation)
- Tab order after removal: Home → Execute → History → Settings

### FormActionButtons cleanup
- Delete the component file completely — it's dead code (step completion uses ButtonElement in FormCanvas)
- Remove any barrel exports referencing it
- Scope cleanup strictly to audit findings (no expanded dead code sweep)

### Phase 3 VERIFICATION.md
- Create verification document covering Phase 3 execution UI
- Document verification status based on subsequent Phase 4/5/6 usage confirming functionality

### Claude's Discretion
- Empty state illustration/icon choice for Execute tab
- Exact wording of empty state message
- VERIFICATION.md structure and depth
- Whether to combine multiple cleanup items into one plan or split across plans

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. The success criteria from ROADMAP.md are clear and specific enough to guide implementation.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 07-ui-cleanup-dead-code*
*Context gathered: 2026-03-01*
