# Phase 3: Execution UI - Context

**Gathered:** 2026-02-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can see their workflows, launch execution, interact with WYSIWYG forms rendered faithfully across device types, navigate parallel branches via the step carousel, and control workflow state from the execution screen. History, notifications, settings, and workflow proxy are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Home screen presentation
- Vertical list layout for workflow rows (full-width, stacked)
- Separate tabs for Active workflows vs Library (downloaded master workflows)
- Active tab rows show: workflow name, state badge, current step name, step progress (e.g., "Step 3/12"), time since started/paused
- Library tab rows show: workflow name, version, description, step count
- Tapping a library workflow opens a detail/preview screen with a "Start Execution" button (not immediate launch)
- Tapping an active workflow opens the execution screen

### WYSIWYG form rendering
- Uniform scale-to-fit: shrink entire canvas proportionally to fit screen width, preserving exact absolute-positioned layout
- Pinch-to-zoom supported for users to enlarge controls on smaller screens
- No auto-zoom or overlay on control interaction — rely on native zoom behavior
- Extended control set required: text input, dropdown/select, checkbox, radio buttons, date picker, text area, numeric input, labels/headers, image display, signature capture, barcode scanner, file attachment, toggle switch
- Functionally equivalent fidelity — same controls and data capture, but native mobile styling is acceptable (not pixel-perfect to BrainPal MD)

### Step carousel & navigation
- Horizontal swipe between active user interaction steps
- Previous/Next buttons with wrap-around (last step wraps to first)
- Dot indicators at bottom showing active step count and current position
- Yes/No steps and User Interaction steps use the same WYSIWYG form renderer — only difference is button count (1 vs 2 with true/false); button position and text come from step format files
- Auto-advance to next active step after completing current step; if no more steps need input, show waiting state

### Execution controls & state
- Overflow menu (⋮) in top toolbar for state controls (Pause, Resume, Stop, Abort)
- Context-sensitive menu: shows only applicable actions for current state
- Abort requires confirmation dialog; Stop executes immediately (can be resumed)
- When workflow is idle (paused, waiting): simple status box with contextual message — "Waiting for resource", "Waiting for synchronization", "Waiting for action to complete" (v1 keeps messages simple, more descriptive later)

### Claude's Discretion
- State badge styling (color-coded pills, icon+text, or hybrid) — consistent across home screen and execution screen
- Loading skeleton and shimmer patterns
- Tab navigation implementation (bottom tabs, top tabs, or other pattern)
- Detail/preview screen layout for library workflows
- Exact spacing, typography, and animation choices
- Error state handling and retry patterns

</decisions>

<specifics>
## Specific Ideas

- Both Yes/No and User Interaction steps render identically through the WYSIWYG form renderer — the only difference is the number of action buttons (1 for User Interaction, 2 for Yes/No with true/false). Button positions and labels are defined in the downloaded step format files.
- Waiting states in v1 should be simple and generic; richer context messages deferred to later versions.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 03-execution-ui*
*Context gathered: 2026-02-25*
