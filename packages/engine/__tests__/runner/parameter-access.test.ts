// Tests for WorkflowRunner.resolveParameter() and writeFormOutputParameters().
// These methods allow the UI to read/write Value Properties via name.key references.

import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowRunner } from '../../src/runner/workflow-runner';
import type { RunnerConfig } from '../../src/runner/types';
import { makeLinearWorkflow } from '../helpers/fixtures';
import { createTestContext } from '../helpers/test-utils';

function buildRunnerConfig(ctx: ReturnType<typeof createTestContext>): RunnerConfig {
  return {
    workflowRepo: ctx.workflowRepo,
    stepRepo: ctx.stepRepo,
    connectionRepo: ctx.connectionRepo,
    valuePropertyRepo: ctx.valuePropertyRepo,
    resourcePoolRepo: ctx.resourcePoolRepo,
    resourceQueueRepo: ctx.resourceQueueRepo,
    syncBarrierRepo: ctx.syncBarrierRepo,
    executionLogger: ctx.logger,
    eventBus: ctx.eventBus,
    idGenerator: ctx.idGenerator,
  };
}

describe('WorkflowRunner parameter access', () => {
  let ctx: ReturnType<typeof createTestContext>;
  let runner: WorkflowRunner;
  let wfId: string;

  beforeEach(async () => {
    ctx = createTestContext();
    ctx.clearAll();
    runner = new WorkflowRunner(buildRunnerConfig(ctx));

    // Create and start a simple workflow so we have an active instance
    const spec = makeLinearWorkflow(1);
    // Add a Value Property to the spec
    spec.value_property_specifications = [
      {
        name: 'UserInfo',
        entries: [
          { name: 'Name', value: 'Alice' },
          { name: 'Email', value: 'alice@example.com' },
        ],
      },
    ];
    wfId = await runner.createWorkflow(spec);
    await runner.startWorkflow(wfId);
  });

  // -------------------------------------------------------------------------
  // resolveParameter
  // -------------------------------------------------------------------------

  describe('resolveParameter', () => {
    it('resolves an existing property entry with name.key format', async () => {
      const result = await runner.resolveParameter(wfId, 'UserInfo.Name');
      expect(result).toBe('Alice');
    });

    it('resolves a different entry from the same property', async () => {
      const result = await runner.resolveParameter(wfId, 'UserInfo.Email');
      expect(result).toBe('alice@example.com');
    });

    it('returns null for a non-existent property', async () => {
      const result = await runner.resolveParameter(wfId, 'NonExistent.Key');
      expect(result).toBeNull();
    });

    it('defaults entry name to Value when no dot in reference', async () => {
      // Create a property with a "Value" entry
      await ctx.valuePropertyRepo.upsertEntry('workflow', wfId, 'SimpleProperty', 'Value', 'hello');
      const result = await runner.resolveParameter(wfId, 'SimpleProperty');
      expect(result).toBe('hello');
    });

    it('traverses parent scope for nested workflows', async () => {
      // Create a child workflow
      const childSpec = makeLinearWorkflow(1);
      childSpec.oid = 'wf-child';
      const childId = await runner.createChildWorkflow(childSpec, wfId, 'step-ui-1');
      await runner.startChildWorkflowDirect(childId);

      // Child should see parent's properties via scope chain
      const result = await runner.resolveParameter(childId, 'UserInfo.Name');
      expect(result).toBe('Alice');
    });
  });

  // -------------------------------------------------------------------------
  // writeFormOutputParameters
  // -------------------------------------------------------------------------

  describe('writeFormOutputParameters', () => {
    it('creates new property entries', async () => {
      await runner.writeFormOutputParameters(wfId, [
        { nameKey: 'Answers.Question1', value: 'Yes' },
      ]);

      const result = await runner.resolveParameter(wfId, 'Answers.Question1');
      expect(result).toBe('Yes');
    });

    it('updates existing property entries', async () => {
      await runner.writeFormOutputParameters(wfId, [
        { nameKey: 'UserInfo.Name', value: 'Bob' },
      ]);

      const result = await runner.resolveParameter(wfId, 'UserInfo.Name');
      expect(result).toBe('Bob');
    });

    it('writes multiple outputs at once', async () => {
      await runner.writeFormOutputParameters(wfId, [
        { nameKey: 'Form.Field1', value: 'value1' },
        { nameKey: 'Form.Field2', value: 'value2' },
        { nameKey: 'Form.Field3', value: 'value3' },
      ]);

      expect(await runner.resolveParameter(wfId, 'Form.Field1')).toBe('value1');
      expect(await runner.resolveParameter(wfId, 'Form.Field2')).toBe('value2');
      expect(await runner.resolveParameter(wfId, 'Form.Field3')).toBe('value3');
    });

    it('handles name-only key (defaults entry to Value)', async () => {
      await runner.writeFormOutputParameters(wfId, [
        { nameKey: 'Result', value: '42' },
      ]);

      const result = await runner.resolveParameter(wfId, 'Result');
      expect(result).toBe('42');
    });
  });
});
