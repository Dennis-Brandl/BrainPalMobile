import { describe, it, expect, vi } from 'vitest';
import { EngineEventBus } from '../../src/events/event-bus';

describe('EngineEventBus', () => {
  it('should deliver typed events to subscribers', () => {
    const bus = new EngineEventBus();
    const handler = vi.fn();

    bus.on('WORKFLOW_STARTED', handler);
    bus.emit('WORKFLOW_STARTED', { workflowInstanceId: 'wf-1' });

    expect(handler).toHaveBeenCalledWith({ workflowInstanceId: 'wf-1' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should deliver events to multiple subscribers', () => {
    const bus = new EngineEventBus();
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    bus.on('STEP_STATE_CHANGED', handler1);
    bus.on('STEP_STATE_CHANGED', handler2);

    const payload = {
      stepInstanceId: 's-1',
      workflowInstanceId: 'wf-1',
      stepOid: 'step-001',
      fromState: 'IDLE' as const,
      toState: 'WAITING' as const,
      event: 'START' as const,
    };
    bus.emit('STEP_STATE_CHANGED', payload);

    expect(handler1).toHaveBeenCalledWith(payload);
    expect(handler2).toHaveBeenCalledWith(payload);
  });

  it('should unsubscribe via returned function', () => {
    const bus = new EngineEventBus();
    const handler = vi.fn();

    const unsubscribe = bus.on('WORKFLOW_COMPLETED', handler);
    bus.emit('WORKFLOW_COMPLETED', { workflowInstanceId: 'wf-1' });
    expect(handler).toHaveBeenCalledTimes(1);

    unsubscribe();
    bus.emit('WORKFLOW_COMPLETED', { workflowInstanceId: 'wf-2' });
    expect(handler).toHaveBeenCalledTimes(1); // Still 1, not called again
  });

  it('should clear all listeners with removeAllListeners', () => {
    const bus = new EngineEventBus();
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    bus.on('WORKFLOW_STARTED', handler1);
    bus.on('ERROR', handler2);

    bus.removeAllListeners();

    bus.emit('WORKFLOW_STARTED', { workflowInstanceId: 'wf-1' });
    bus.emit('ERROR', { source: 'test', message: 'fail' });

    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).not.toHaveBeenCalled();
  });

  it('should not throw when emitting with no subscribers', () => {
    const bus = new EngineEventBus();

    // Should not throw
    expect(() => {
      bus.emit('WORKFLOW_ABORTED', { workflowInstanceId: 'wf-1' });
    }).not.toThrow();
  });

  it('should not interfere between different event types', () => {
    const bus = new EngineEventBus();
    const startedHandler = vi.fn();
    const completedHandler = vi.fn();

    bus.on('WORKFLOW_STARTED', startedHandler);
    bus.on('WORKFLOW_COMPLETED', completedHandler);

    bus.emit('WORKFLOW_STARTED', { workflowInstanceId: 'wf-1' });

    expect(startedHandler).toHaveBeenCalledTimes(1);
    expect(completedHandler).not.toHaveBeenCalled();
  });
});
