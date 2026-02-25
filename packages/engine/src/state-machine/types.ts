// State machine types for the generic table-driven state machine.
// The state machine is parameterized by state (S) and event (E) string types.

import type { StepState } from '../types/common';

/**
 * A single transition rule in the state machine table.
 *
 * `from` can be a specific state or the wildcard '*_ACTIVE' which matches
 * any state in the ACTIVE_STATES set (checked via the guard function).
 */
export interface StateTransitionRule<S extends string, E extends string> {
  from: S | '*_ACTIVE';
  event: E;
  to: S;
  guard?: (context: StepContext) => boolean;
}

/**
 * Configuration for creating a StateMachine instance.
 */
export interface StateMachineConfig<S extends string, E extends string> {
  initialState: S;
  transitions: StateTransitionRule<S, E>[];
}

/**
 * Context passed to guard functions during transition evaluation.
 * At minimum contains the current state for wildcard matching.
 */
export interface StepContext {
  currentState: StepState;
  [key: string]: unknown;
}
