// Generic table-driven state machine.
// Parameterized by S (states) and E (events) -- works with any state/event type pair.
// Used with ISA-88 transition tables for step lifecycle management.

import type { StateMachineConfig, StateTransitionRule, StepContext } from './types';
import type { StepState } from '../types/common';

/**
 * Error thrown when an invalid state transition is attempted.
 */
export class InvalidTransitionError extends Error {
  constructor(
    public readonly currentState: string,
    public readonly event: string,
  ) {
    super(`Invalid transition: cannot send '${event}' in state '${currentState}'`);
    this.name = 'InvalidTransitionError';
  }
}

/**
 * Generic table-driven state machine.
 *
 * Transition rules are evaluated in order. The first matching rule wins.
 * Rules with `from: '*_ACTIVE'` use their guard function to check whether
 * the current state qualifies (e.g., is in the ACTIVE_STATES set).
 */
export class StateMachine<S extends string, E extends string> {
  private currentState: S;

  constructor(
    private readonly config: StateMachineConfig<S, E>,
    private readonly onTransition?: (from: S, to: S, event: E) => void,
  ) {
    this.currentState = config.initialState;
  }

  /**
   * Send an event to the state machine.
   * Finds the first matching transition rule and applies it.
   * Throws InvalidTransitionError if no valid transition exists.
   */
  send(event: E, context?: Partial<StepContext>): S {
    const rule = this.findRule(event, context);
    if (!rule) {
      throw new InvalidTransitionError(this.currentState, event);
    }
    const from = this.currentState;
    this.currentState = rule.to;
    this.onTransition?.(from, rule.to, event);
    return this.currentState;
  }

  /**
   * Returns the current state.
   */
  getState(): S {
    return this.currentState;
  }

  /**
   * Check whether an event can be sent in the current state.
   * Returns true if a matching transition rule exists.
   */
  canSend(event: E, context?: Partial<StepContext>): boolean {
    return this.findRule(event, context) !== undefined;
  }

  /**
   * Find the first transition rule matching the current state, event, and guard.
   */
  private findRule(
    event: E,
    context?: Partial<StepContext>,
  ): StateTransitionRule<S, E> | undefined {
    const ctx: StepContext = {
      currentState: this.currentState as unknown as StepState,
      ...context,
    };

    return this.config.transitions.find(
      (t) =>
        (t.from === this.currentState || t.from === '*_ACTIVE') &&
        t.event === event &&
        (!t.guard || t.guard(ctx)),
    );
  }
}
