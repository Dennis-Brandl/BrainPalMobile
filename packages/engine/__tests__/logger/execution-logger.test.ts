// Tests for ExecutionLogService.

import { describe, it, expect, beforeEach } from 'vitest';
import { ExecutionLogService } from '../../src/logger/execution-logger';
import { InMemoryExecutionLogger } from '../helpers/mock-repositories';
import type { LogEventType } from '../../src/types/events';

describe('ExecutionLogService', () => {
  let mockLogger: InMemoryExecutionLogger;
  let service: ExecutionLogService;

  beforeEach(() => {
    mockLogger = new InMemoryExecutionLogger();
    service = new ExecutionLogService(mockLogger);
  });

  it('creates log entry with correct fields and ISO timestamp', async () => {
    await service.logEvent(
      'wf-001',
      'WORKFLOW_CREATED',
      { masterOid: 'spec-1', stepCount: 5 },
    );

    const entries = await service.getByWorkflow('wf-001');
    expect(entries).toHaveLength(1);
    expect(entries[0].workflow_instance_id).toBe('wf-001');
    expect(entries[0].event_type).toBe('WORKFLOW_CREATED');
    expect(entries[0].timestamp).toBeTruthy();

    // Verify ISO 8601 format
    const date = new Date(entries[0].timestamp);
    expect(date.getTime()).not.toBeNaN();
  });

  it('serializes event_data_json properly', async () => {
    const eventData = { paramId: 'input-1', value: '42', source: 'property' };
    await service.logEvent('wf-001', 'PARAMETER_INPUT_RESOLVED', eventData);

    const entries = await service.getByWorkflow('wf-001');
    const parsed = JSON.parse(entries[0].event_data_json);
    expect(parsed.paramId).toBe('input-1');
    expect(parsed.value).toBe('42');
    expect(parsed.source).toBe('property');
  });

  it('includes optional step_oid and step_instance_id', async () => {
    await service.logEvent(
      'wf-001',
      'STEP_STATE_CHANGED',
      { fromState: 'IDLE', toState: 'WAITING' },
      'step-1',
      'step-inst-1',
    );

    const entries = await service.getByWorkflow('wf-001');
    expect(entries[0].step_oid).toBe('step-1');
    expect(entries[0].step_instance_id).toBe('step-inst-1');
  });

  it('logs all major event types', async () => {
    const eventTypes: LogEventType[] = [
      'WORKFLOW_CREATED',
      'WORKFLOW_STARTED',
      'WORKFLOW_COMPLETED',
      'WORKFLOW_ABORTED',
      'WORKFLOW_STOPPED',
      'WORKFLOW_RESUMED',
      'STEP_STATE_CHANGED',
      'SCHEDULER_ACTIVATED_STEPS',
      'PARAMETER_INPUT_RESOLVED',
      'PARAMETER_OUTPUT_WRITTEN',
      'CONDITION_EVALUATED',
      'RESOURCE_ACQUIRED',
      'RESOURCE_RELEASED',
      'USER_INPUT_SUBMITTED',
      'ENGINE_ERROR',
    ];

    for (const eventType of eventTypes) {
      await service.logEvent('wf-001', eventType, { test: true });
    }

    const entries = await service.getByWorkflow('wf-001');
    expect(entries).toHaveLength(eventTypes.length);

    const loggedTypes = entries.map((e) => e.event_type);
    for (const eventType of eventTypes) {
      expect(loggedTypes).toContain(eventType);
    }
  });

  it('handles complex nested event data serialization', async () => {
    const complexData = {
      steps: [{ id: 'step-1', state: 'COMPLETED' }, { id: 'step-2', state: 'EXECUTING' }],
      metadata: { nested: { deep: true } },
    };

    await service.logEvent('wf-001', 'ENGINE_ERROR', complexData);

    const entries = await service.getByWorkflow('wf-001');
    const parsed = JSON.parse(entries[0].event_data_json);
    expect(parsed.steps).toHaveLength(2);
    expect(parsed.metadata.nested.deep).toBe(true);
  });

  it('returns empty array for unknown workflow', async () => {
    const entries = await service.getByWorkflow('nonexistent');
    expect(entries).toHaveLength(0);
  });

  it('maintains order of log entries', async () => {
    await service.logEvent('wf-001', 'WORKFLOW_CREATED', { order: 1 });
    await service.logEvent('wf-001', 'WORKFLOW_STARTED', { order: 2 });
    await service.logEvent('wf-001', 'STEP_STATE_CHANGED', { order: 3 });

    const entries = await service.getByWorkflow('wf-001');
    expect(entries).toHaveLength(3);
    expect(JSON.parse(entries[0].event_data_json).order).toBe(1);
    expect(JSON.parse(entries[1].event_data_json).order).toBe(2);
    expect(JSON.parse(entries[2].event_data_json).order).toBe(3);
  });
});
