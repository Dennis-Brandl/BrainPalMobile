// Tests for ISA-88 state transition tables -- both observable and opaque tracks.
// Verifies all transition paths from StateMachineSpec.md.

import { describe, it, expect } from 'vitest';
import { StateMachine, InvalidTransitionError } from '../../src/state-machine';
import {
  ISA88_OBSERVABLE_TRANSITIONS,
  ISA88_OPAQUE_TRANSITIONS,
} from '../../src/state-machine';
import type { StepState, StateEvent } from '../../src/types/common';
import { ACTIVE_STATES } from '../../src/types/common';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createObservableMachine(initial: StepState = 'IDLE') {
  return new StateMachine<StepState, StateEvent>({
    initialState: initial,
    transitions: ISA88_OBSERVABLE_TRANSITIONS,
  });
}

function createOpaqueMachine(initial: StepState = 'IDLE') {
  return new StateMachine<StepState, StateEvent>({
    initialState: initial,
    transitions: ISA88_OPAQUE_TRANSITIONS,
  });
}

/**
 * Drive a state machine through a sequence of events, returning the final state.
 */
function drive(
  sm: StateMachine<StepState, StateEvent>,
  events: StateEvent[],
): StepState {
  for (const event of events) {
    sm.send(event);
  }
  return sm.getState();
}

// ---------------------------------------------------------------------------
// Observable Track Tests
// ---------------------------------------------------------------------------

describe('ISA-88 Observable Transitions', () => {
  describe('happy path', () => {
    it('should complete the full lifecycle: IDLE -> COMPLETED', () => {
      const sm = createObservableMachine();
      const final = drive(sm, ['START', 'SC', 'SC', 'SC', 'SC']);
      expect(final).toBe('COMPLETED');
    });

    it('should transition through correct intermediate states', () => {
      const sm = createObservableMachine();
      const states: StepState[] = [sm.getState()];

      for (const event of ['START', 'SC', 'SC', 'SC', 'SC'] as StateEvent[]) {
        sm.send(event);
        states.push(sm.getState());
      }

      expect(states).toEqual([
        'IDLE',
        'WAITING',
        'STARTING',
        'EXECUTING',
        'COMPLETING',
        'COMPLETED',
      ]);
    });
  });

  describe('PAUSE/RESUME flow', () => {
    it('should pause and resume from EXECUTING', () => {
      const sm = createObservableMachine();
      drive(sm, ['START', 'SC', 'SC']); // -> EXECUTING
      expect(sm.getState()).toBe('EXECUTING');

      sm.send('PAUSE');
      expect(sm.getState()).toBe('PAUSING');

      sm.send('SC');
      expect(sm.getState()).toBe('PAUSED');

      sm.send('RESUME');
      expect(sm.getState()).toBe('UNPAUSING');

      sm.send('SC');
      expect(sm.getState()).toBe('EXECUTING');
    });

    it('should allow completion after pause/resume cycle', () => {
      const sm = createObservableMachine();
      drive(sm, ['START', 'SC', 'SC']); // -> EXECUTING
      drive(sm, ['PAUSE', 'SC', 'RESUME', 'SC']); // pause/resume cycle
      drive(sm, ['SC', 'SC']); // -> COMPLETING -> COMPLETED
      expect(sm.getState()).toBe('COMPLETED');
    });
  });

  describe('HOLD/UNHOLD flow', () => {
    it('should hold and unhold from EXECUTING', () => {
      const sm = createObservableMachine();
      drive(sm, ['START', 'SC', 'SC']); // -> EXECUTING

      sm.send('HOLD');
      expect(sm.getState()).toBe('HOLDING');

      sm.send('SC');
      expect(sm.getState()).toBe('HELD');

      sm.send('UNHOLD');
      expect(sm.getState()).toBe('UNHOLDING');

      sm.send('SC');
      expect(sm.getState()).toBe('EXECUTING');
    });

    it('should allow completion after hold/unhold cycle', () => {
      const sm = createObservableMachine();
      drive(sm, ['START', 'SC', 'SC']); // -> EXECUTING
      drive(sm, ['HOLD', 'SC', 'UNHOLD', 'SC']); // hold/unhold cycle
      drive(sm, ['SC', 'SC']); // -> COMPLETING -> COMPLETED
      expect(sm.getState()).toBe('COMPLETED');
    });
  });

  describe('ABORT from active states', () => {
    const activeStatePaths: Array<{ state: StepState; events: StateEvent[] }> = [
      { state: 'WAITING', events: ['START'] },
      { state: 'STARTING', events: ['START', 'SC'] },
      { state: 'EXECUTING', events: ['START', 'SC', 'SC'] },
      { state: 'COMPLETING', events: ['START', 'SC', 'SC', 'SC'] },
      { state: 'PAUSING', events: ['START', 'SC', 'SC', 'PAUSE'] },
      { state: 'PAUSED', events: ['START', 'SC', 'SC', 'PAUSE', 'SC'] },
      { state: 'UNPAUSING', events: ['START', 'SC', 'SC', 'PAUSE', 'SC', 'RESUME'] },
      { state: 'HOLDING', events: ['START', 'SC', 'SC', 'HOLD'] },
      { state: 'HELD', events: ['START', 'SC', 'SC', 'HOLD', 'SC'] },
      { state: 'UNHOLDING', events: ['START', 'SC', 'SC', 'HOLD', 'SC', 'UNHOLD'] },
    ];

    for (const { state, events } of activeStatePaths) {
      it(`should ABORT from ${state}`, () => {
        const sm = createObservableMachine();
        drive(sm, events);
        expect(sm.getState()).toBe(state);

        sm.send('ABORT');
        expect(sm.getState()).toBe('ABORTING');
      });
    }
  });

  describe('STOP from active states', () => {
    const activeStatePaths: Array<{ state: StepState; events: StateEvent[] }> = [
      { state: 'WAITING', events: ['START'] },
      { state: 'STARTING', events: ['START', 'SC'] },
      { state: 'EXECUTING', events: ['START', 'SC', 'SC'] },
      { state: 'COMPLETING', events: ['START', 'SC', 'SC', 'SC'] },
      { state: 'PAUSING', events: ['START', 'SC', 'SC', 'PAUSE'] },
      { state: 'PAUSED', events: ['START', 'SC', 'SC', 'PAUSE', 'SC'] },
    ];

    for (const { state, events } of activeStatePaths) {
      it(`should STOP from ${state}`, () => {
        const sm = createObservableMachine();
        drive(sm, events);
        expect(sm.getState()).toBe(state);

        sm.send('STOP');
        expect(sm.getState()).toBe('STOPPING');

        sm.send('SC');
        expect(sm.getState()).toBe('COMPLETED');
      });
    }
  });

  describe('ABORT -> CLEAR flow', () => {
    it('should complete the full ABORT -> CLEAR -> COMPLETED cycle', () => {
      const sm = createObservableMachine();
      drive(sm, ['START', 'SC', 'SC']); // -> EXECUTING

      sm.send('ABORT');
      expect(sm.getState()).toBe('ABORTING');

      sm.send('SC');
      expect(sm.getState()).toBe('ABORTED');

      sm.send('CLEAR');
      expect(sm.getState()).toBe('CLEARING');

      sm.send('SC');
      expect(sm.getState()).toBe('COMPLETED');
    });
  });

  describe('invalid transitions', () => {
    it('should reject START from EXECUTING', () => {
      const sm = createObservableMachine();
      drive(sm, ['START', 'SC', 'SC']); // -> EXECUTING
      expect(() => sm.send('START')).toThrow(InvalidTransitionError);
    });

    it('should reject PAUSE from IDLE', () => {
      const sm = createObservableMachine();
      expect(() => sm.send('PAUSE')).toThrow(InvalidTransitionError);
    });

    it('should reject RESUME from EXECUTING', () => {
      const sm = createObservableMachine();
      drive(sm, ['START', 'SC', 'SC']); // -> EXECUTING
      expect(() => sm.send('RESUME')).toThrow(InvalidTransitionError);
    });

    it('should reject HOLD from IDLE', () => {
      const sm = createObservableMachine();
      expect(() => sm.send('HOLD')).toThrow(InvalidTransitionError);
    });

    it('should reject ABORT from IDLE (not an active state)', () => {
      const sm = createObservableMachine();
      expect(() => sm.send('ABORT')).toThrow(InvalidTransitionError);
    });

    it('should reject ABORT from COMPLETED (terminal state)', () => {
      const sm = createObservableMachine();
      drive(sm, ['START', 'SC', 'SC', 'SC', 'SC']); // -> COMPLETED
      expect(() => sm.send('ABORT')).toThrow(InvalidTransitionError);
    });

    it('should reject STOP from IDLE (not an active state)', () => {
      const sm = createObservableMachine();
      expect(() => sm.send('STOP')).toThrow(InvalidTransitionError);
    });

    it('should reject CLEAR from EXECUTING', () => {
      const sm = createObservableMachine();
      drive(sm, ['START', 'SC', 'SC']); // -> EXECUTING
      expect(() => sm.send('CLEAR')).toThrow(InvalidTransitionError);
    });
  });

  describe('transition table completeness', () => {
    it('should have 19 observable transition rules', () => {
      expect(ISA88_OBSERVABLE_TRANSITIONS).toHaveLength(19);
    });

    it('should have ABORT and STOP as wildcard rules', () => {
      const wildcardRules = ISA88_OBSERVABLE_TRANSITIONS.filter(
        (t) => t.from === '*_ACTIVE',
      );
      expect(wildcardRules).toHaveLength(2);
      expect(wildcardRules.map((t) => t.event).sort()).toEqual(['ABORT', 'STOP']);
    });

    it('ACTIVE_STATES should contain 13 states', () => {
      expect(ACTIVE_STATES.size).toBe(13);
    });
  });
});

// ---------------------------------------------------------------------------
// Opaque Track Tests
// ---------------------------------------------------------------------------

describe('ISA-88 Opaque Transitions', () => {
  describe('happy path', () => {
    it('should complete: IDLE -> WAITING -> POSTED -> RECEIVED -> IN_PROGRESS -> COMPLETED', () => {
      const sm = createOpaqueMachine();
      const states: StepState[] = [sm.getState()];

      for (const event of ['START', 'SC', 'SC', 'SC', 'SC'] as StateEvent[]) {
        sm.send(event);
        states.push(sm.getState());
      }

      expect(states).toEqual([
        'IDLE',
        'WAITING',
        'POSTED',
        'RECEIVED',
        'IN_PROGRESS',
        'COMPLETED',
      ]);
    });
  });

  describe('ABORT from opaque active states', () => {
    const opaqueActivePaths: Array<{ state: StepState; events: StateEvent[] }> = [
      { state: 'WAITING', events: ['START'] },
      { state: 'POSTED', events: ['START', 'SC'] },
      { state: 'RECEIVED', events: ['START', 'SC', 'SC'] },
      { state: 'IN_PROGRESS', events: ['START', 'SC', 'SC', 'SC'] },
    ];

    for (const { state, events } of opaqueActivePaths) {
      it(`should ABORT from ${state}`, () => {
        const sm = createOpaqueMachine();
        drive(sm, events);
        expect(sm.getState()).toBe(state);

        sm.send('ABORT');
        expect(sm.getState()).toBe('ABORTING');
      });
    }
  });

  describe('STOP from opaque active states', () => {
    it('should STOP from POSTED', () => {
      const sm = createOpaqueMachine();
      drive(sm, ['START', 'SC']); // -> POSTED
      sm.send('STOP');
      expect(sm.getState()).toBe('STOPPING');
      sm.send('SC');
      expect(sm.getState()).toBe('COMPLETED');
    });
  });

  describe('ABORT -> CLEAR flow', () => {
    it('should complete: ABORT -> ABORTING -> ABORTED -> CLEAR -> CLEARING -> COMPLETED', () => {
      const sm = createOpaqueMachine();
      drive(sm, ['START', 'SC']); // -> POSTED
      drive(sm, ['ABORT', 'SC']); // -> ABORTED
      expect(sm.getState()).toBe('ABORTED');

      sm.send('CLEAR');
      expect(sm.getState()).toBe('CLEARING');

      sm.send('SC');
      expect(sm.getState()).toBe('COMPLETED');
    });
  });

  describe('invalid transitions', () => {
    it('should reject PAUSE from opaque step (not supported)', () => {
      const sm = createOpaqueMachine();
      drive(sm, ['START', 'SC']); // -> POSTED
      expect(() => sm.send('PAUSE')).toThrow(InvalidTransitionError);
    });

    it('should reject HOLD from opaque step (not supported)', () => {
      const sm = createOpaqueMachine();
      drive(sm, ['START', 'SC', 'SC']); // -> RECEIVED
      expect(() => sm.send('HOLD')).toThrow(InvalidTransitionError);
    });
  });

  describe('transition table completeness', () => {
    it('should have 11 opaque transition rules', () => {
      expect(ISA88_OPAQUE_TRANSITIONS).toHaveLength(11);
    });
  });
});
