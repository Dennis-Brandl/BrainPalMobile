// ISA-88 state transition tables for observable and opaque step tracks.
// These are pure data -- consumed by the generic StateMachine class.
// Source: StateMachineSpec.md Section 3.1

import type { StepState, StateEvent } from '../types/common';
import { ACTIVE_STATES } from '../types/common';
import type { StateTransitionRule, StepContext } from './types';

// ---------------------------------------------------------------------------
// Guard: checks whether the current state is in the ACTIVE_STATES set.
// Used by wildcard '*_ACTIVE' rules for ABORT and STOP.
// ---------------------------------------------------------------------------

const isActiveState = (ctx: StepContext): boolean =>
  ACTIVE_STATES.has(ctx.currentState);

// ---------------------------------------------------------------------------
// Observable Track Transitions (19 rules)
// ---------------------------------------------------------------------------

/**
 * Complete ISA-88 observable step transition table.
 *
 * Covers the full lifecycle: IDLE -> WAITING -> STARTING -> EXECUTING ->
 * COMPLETING -> COMPLETED, plus PAUSE/RESUME, HOLD/UNHOLD, ABORT, STOP,
 * and CLEAR flows.
 */
export const ISA88_OBSERVABLE_TRANSITIONS: StateTransitionRule<StepState, StateEvent>[] = [
  // Happy path
  { from: 'IDLE',        event: 'START',   to: 'WAITING' },
  { from: 'WAITING',     event: 'SC',      to: 'STARTING' },
  { from: 'STARTING',    event: 'SC',      to: 'EXECUTING' },
  { from: 'EXECUTING',   event: 'SC',      to: 'COMPLETING' },
  { from: 'COMPLETING',  event: 'SC',      to: 'COMPLETED' },

  // Pause flow (user-initiated, external)
  { from: 'EXECUTING',   event: 'PAUSE',   to: 'PAUSING' },
  { from: 'PAUSING',     event: 'SC',      to: 'PAUSED' },
  { from: 'PAUSED',      event: 'RESUME',  to: 'UNPAUSING' },
  { from: 'UNPAUSING',   event: 'SC',      to: 'EXECUTING' },

  // Hold flow (action-server-initiated, internal)
  { from: 'EXECUTING',   event: 'HOLD',    to: 'HOLDING' },
  { from: 'HOLDING',     event: 'SC',      to: 'HELD' },
  { from: 'HELD',        event: 'UNHOLD',  to: 'UNHOLDING' },
  { from: 'UNHOLDING',   event: 'SC',      to: 'EXECUTING' },

  // Abort flow (from any active state)
  { from: '*_ACTIVE',    event: 'ABORT',   to: 'ABORTING', guard: isActiveState },
  { from: 'ABORTING',    event: 'SC',      to: 'ABORTED' },

  // Clear flow (after abort)
  { from: 'ABORTED',     event: 'CLEAR',   to: 'CLEARING' },
  { from: 'CLEARING',    event: 'SC',      to: 'COMPLETED' },

  // Stop flow (from any active state)
  { from: '*_ACTIVE',    event: 'STOP',    to: 'STOPPING', guard: isActiveState },
  { from: 'STOPPING',    event: 'SC',      to: 'COMPLETED' },
];

// ---------------------------------------------------------------------------
// Opaque Track Transitions (11 rules)
// ---------------------------------------------------------------------------

/**
 * ISA-88 opaque step transition table.
 *
 * Simplified flow for fire-and-forget actions:
 * IDLE -> WAITING -> POSTED -> RECEIVED -> IN_PROGRESS -> COMPLETED
 * Plus ABORT, STOP, and CLEAR flows.
 */
export const ISA88_OPAQUE_TRANSITIONS: StateTransitionRule<StepState, StateEvent>[] = [
  // Happy path (opaque track)
  { from: 'IDLE',          event: 'START',  to: 'WAITING' },
  { from: 'WAITING',       event: 'SC',     to: 'POSTED' },
  { from: 'POSTED',        event: 'SC',     to: 'RECEIVED' },
  { from: 'RECEIVED',      event: 'SC',     to: 'IN_PROGRESS' },
  { from: 'IN_PROGRESS',   event: 'SC',     to: 'COMPLETED' },

  // Abort flow (from any active state)
  { from: '*_ACTIVE',      event: 'ABORT',  to: 'ABORTING', guard: isActiveState },
  { from: 'ABORTING',      event: 'SC',     to: 'ABORTED' },

  // Clear flow (after abort)
  { from: 'ABORTED',       event: 'CLEAR',  to: 'CLEARING' },
  { from: 'CLEARING',      event: 'SC',     to: 'COMPLETED' },

  // Stop flow (from any active state)
  { from: '*_ACTIVE',      event: 'STOP',   to: 'STOPPING', guard: isActiveState },
  { from: 'STOPPING',      event: 'SC',     to: 'COMPLETED' },
];
