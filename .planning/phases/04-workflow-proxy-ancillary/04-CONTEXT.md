# Phase 4: Workflow Proxy + Ancillary Features - Context

**Gathered:** 2026-02-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Nested workflow execution (Workflow Proxy steps create and run child workflows with output parameter propagation), execution history display per workflow, notifications for steps needing attention and errors, and app settings management. PDF export and production hardening are Phase 5.

</domain>

<decisions>
## Implementation Decisions

### Child Workflow UX
- Completely invisible to the user — child workflow steps appear inline in the parent's carousel with no visual distinction
- No breadcrumbs, no banners, no workflow boundary indicators
- Silent continuation when child completes — parent resumes without toast or notification
- PAUSE and ABORT always propagate from parent to child automatically (no confirmation dialog)

### History Presentation
- Workflow list as primary view — list of past workflows, tap to see execution details
- Default to summary cards per step (name, state reached, duration), with a "Show details" toggle that switches to full audit trail (every state transition, parameter read/write, timestamps)
- Child workflow steps shown inline in flat execution order (matching the seamless execution experience)

### Notification Behavior
- Two notification types: "Step needs attention" (user interaction/Yes-No waiting) and "Error/failure" (step failed, unsupported step, unexpected error)
- Workflow completion and state changes (pause/stop/abort) do NOT trigger notifications
- Mobile: sound + vibration using default system notification settings
- Tapping a notification navigates directly to the specific step needing attention
- Web: in-app toast/banner when tab is active + browser Notification API when backgrounded (requires permission prompt)

### Settings Organization
- Notification preferences: layout at Claude's discretion (master toggle + per-type or per-type only)
- Storage info: counts only (downloaded workflows, active instances, completed instances) — no disk usage calculation
- "Clear completed workflows": bulk clear button in settings + individual delete per workflow in history list
- Confirmation dialog before destructive actions (clear all completed, delete individual)
- App info section: version, build number, report issues link

### Claude's Discretion
- Notification preference layout structure (master toggle vs per-type)
- History filtering/search approach for v1 (simple chronological may suffice, or basic status filters)
- Step detail audit trail formatting
- Settings screen section ordering and visual styling

</decisions>

<specifics>
## Specific Ideas

- The child workflow experience should feel like the user never left — no boundary, no transition, no awareness of nesting
- History should give both quick overview and deep audit capability via the toggle, not force one or the other

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-workflow-proxy-ancillary*
*Context gathered: 2026-02-26*
