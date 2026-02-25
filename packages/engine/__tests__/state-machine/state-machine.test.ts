// Unit tests for the generic StateMachine class.
// Tests with a simple 3-state config to verify core mechanics
// independent of ISA-88 specifics.

import { describe, it, expect, vi } from 'vitest';
import { StateMachine, InvalidTransitionError } from '../../src/state-machine';
import type { StateMachineConfig, StepContext } from '../../src/state-machine';

// Simple 3-state machine for testing: OFF -> ON -> DONE
type SimpleState = 'OFF' | 'ON' | 'DONE';
type SimpleEvent = 'ACTIVATE' | 'FINISH' | 'RESET';

const simpleConfig: StateMachineConfig<SimpleState, SimpleEvent> = {
  initialState: 'OFF',
  transitions: [
    { from: 'OFF', event: 'ACTIVATE', to: 'ON' },
    { from: 'ON', event: 'FINISH', to: 'DONE' },
    { from: 'DONE', event: 'RESET', to: 'OFF' },
  ],
};

describe('StateMachine (generic)', () => {
  it('should start in the initial state', () => {
    const sm = new StateMachine(simpleConfig);
    expect(sm.getState()).toBe('OFF');
  });

  it('should transition on valid event', () => {
    const sm = new StateMachine(simpleConfig);
    const result = sm.send('ACTIVATE');
    expect(result).toBe('ON');
    expect(sm.getState()).toBe('ON');
  });

  it('should support chained transitions', () => {
    const sm = new StateMachine(simpleConfig);
    sm.send('ACTIVATE');
    sm.send('FINISH');
    expect(sm.getState()).toBe('DONE');
  });

  it('should throw InvalidTransitionError on invalid event', () => {
    const sm = new StateMachine(simpleConfig);
    expect(() => sm.send('FINISH')).toThrow(InvalidTransitionError);
  });

  it('should include state and event in InvalidTransitionError', () => {
    const sm = new StateMachine(simpleConfig);
    try {
      sm.send('FINISH');
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidTransitionError);
      const e = err as InvalidTransitionError;
      expect(e.currentState).toBe('OFF');
      expect(e.event).toBe('FINISH');
    }
  });

  it('should return true from canSend for valid transitions', () => {
    const sm = new StateMachine(simpleConfig);
    expect(sm.canSend('ACTIVATE')).toBe(true);
  });

  it('should return false from canSend for invalid transitions', () => {
    const sm = new StateMachine(simpleConfig);
    expect(sm.canSend('FINISH')).toBe(false);
    expect(sm.canSend('RESET')).toBe(false);
  });

  it('should call onTransition callback with correct arguments', () => {
    const callback = vi.fn();
    const sm = new StateMachine(simpleConfig, callback);

    sm.send('ACTIVATE');
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('OFF', 'ON', 'ACTIVATE');

    sm.send('FINISH');
    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenCalledWith('ON', 'DONE', 'FINISH');
  });

  it('should support guard functions that allow transitions', () => {
    const config: StateMachineConfig<SimpleState, SimpleEvent> = {
      initialState: 'OFF',
      transitions: [
        {
          from: 'OFF',
          event: 'ACTIVATE',
          to: 'ON',
          guard: () => true,
        },
      ],
    };
    const sm = new StateMachine(config);
    expect(sm.send('ACTIVATE')).toBe('ON');
  });

  it('should support guard functions that prevent transitions', () => {
    const config: StateMachineConfig<SimpleState, SimpleEvent> = {
      initialState: 'OFF',
      transitions: [
        {
          from: 'OFF',
          event: 'ACTIVATE',
          to: 'ON',
          guard: () => false,
        },
      ],
    };
    const sm = new StateMachine(config);
    expect(() => sm.send('ACTIVATE')).toThrow(InvalidTransitionError);
    expect(sm.canSend('ACTIVATE')).toBe(false);
  });

  it('should pass context to guard functions', () => {
    const guardSpy = vi.fn().mockReturnValue(true);
    const config: StateMachineConfig<SimpleState, SimpleEvent> = {
      initialState: 'OFF',
      transitions: [
        {
          from: 'OFF',
          event: 'ACTIVATE',
          to: 'ON',
          guard: guardSpy,
        },
      ],
    };
    const sm = new StateMachine(config);
    sm.send('ACTIVATE', { currentState: 'OFF' as any, extra: 'data' });

    expect(guardSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        currentState: 'OFF',
        extra: 'data',
      }),
    );
  });

  it('should support wildcard *_ACTIVE matching with guard', () => {
    type WState = 'A' | 'B' | 'C';
    type WEvent = 'GO' | 'WILD';

    const config: StateMachineConfig<WState, WEvent> = {
      initialState: 'A',
      transitions: [
        { from: 'A', event: 'GO', to: 'B' },
        {
          from: '*_ACTIVE' as any,
          event: 'WILD',
          to: 'C',
          guard: (ctx: StepContext) => ctx.currentState === 'B',
        },
      ],
    };

    const sm = new StateMachine(config);
    sm.send('GO'); // A -> B

    // Wildcard should match since guard says B is "active"
    expect(sm.canSend('WILD')).toBe(true);
    expect(sm.send('WILD')).toBe('C');
  });

  it('should reject wildcard *_ACTIVE when guard returns false', () => {
    type WState = 'A' | 'B' | 'C';
    type WEvent = 'WILD';

    const config: StateMachineConfig<WState, WEvent> = {
      initialState: 'A',
      transitions: [
        {
          from: '*_ACTIVE' as any,
          event: 'WILD',
          to: 'C',
          guard: () => false,
        },
      ],
    };

    const sm = new StateMachine(config);
    expect(sm.canSend('WILD')).toBe(false);
    expect(() => sm.send('WILD')).toThrow(InvalidTransitionError);
  });
});
