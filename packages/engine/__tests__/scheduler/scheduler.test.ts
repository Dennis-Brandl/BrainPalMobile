// Tests for the DAG-based scheduler.
// Covers: linear flow, PARALLEL fork, WAIT_ALL join, WAIT_ANY join, END step.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Scheduler } from '../../src/scheduler';
import type { SchedulerContext } from '../../src/scheduler';
import type { RuntimeWorkflowStep, WorkflowConnection } from '../../src/types/runtime';
import type { StepType, StepState } from '../../src/types/common';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function makeRuntimeStep(
  stepOid: string,
  stepType: StepType,
  stepState: StepState = 'IDLE',
): RuntimeWorkflowStep {
  return {
    instance_id: `inst-${stepOid}`,
    workflow_instance_id: 'wf-test-1',
    step_oid: stepOid,
    step_type: stepType,
    step_state: stepState,
    step_json: '{}',
    resolved_inputs_json: null,
    resolved_outputs_json: null,
    user_inputs_json: null,
    activated_at: null,
    started_at: null,
    completed_at: null,
  };
}

function makeConnection(fromOid: string, toOid: string): WorkflowConnection {
  return {
    workflow_instance_id: 'wf-test-1',
    from_step_oid: fromOid,
    to_step_oid: toOid,
    connection_id: `conn-${fromOid}-${toOid}`,
  };
}

function buildContext(
  steps: RuntimeWorkflowStep[],
  connections: WorkflowConnection[],
): SchedulerContext {
  const scheduler = new Scheduler();
  const { outgoing, incoming } = scheduler.buildAdjacencyLists(connections);
  const stepMap = new Map<string, RuntimeWorkflowStep>();
  for (const step of steps) {
    stepMap.set(step.step_oid, step);
  }
  return { outgoing, incoming, steps: stepMap, connections };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Scheduler', () => {
  let scheduler: Scheduler;

  beforeEach(() => {
    scheduler = new Scheduler();
  });

  // -------------------------------------------------------------------------
  // buildAdjacencyLists
  // -------------------------------------------------------------------------

  describe('buildAdjacencyLists', () => {
    it('should build correct outgoing and incoming maps for a linear 3-step workflow', () => {
      const connections: WorkflowConnection[] = [
        makeConnection('start', 'step1'),
        makeConnection('step1', 'step2'),
        makeConnection('step2', 'end'),
      ];

      const { outgoing, incoming } = scheduler.buildAdjacencyLists(connections);

      // Outgoing
      expect(outgoing.get('start')).toEqual(['step1']);
      expect(outgoing.get('step1')).toEqual(['step2']);
      expect(outgoing.get('step2')).toEqual(['end']);
      expect(outgoing.get('end')).toBeUndefined();

      // Incoming
      expect(incoming.get('start')).toBeUndefined();
      expect(incoming.get('step1')).toEqual(['start']);
      expect(incoming.get('step2')).toEqual(['step1']);
      expect(incoming.get('end')).toEqual(['step2']);
    });

    it('should handle PARALLEL fork with multiple outgoing connections', () => {
      const connections: WorkflowConnection[] = [
        makeConnection('parallel', 'branch-a'),
        makeConnection('parallel', 'branch-b'),
        makeConnection('parallel', 'branch-c'),
      ];

      const { outgoing, incoming } = scheduler.buildAdjacencyLists(connections);

      expect(outgoing.get('parallel')).toEqual(['branch-a', 'branch-b', 'branch-c']);
      expect(incoming.get('branch-a')).toEqual(['parallel']);
      expect(incoming.get('branch-b')).toEqual(['parallel']);
      expect(incoming.get('branch-c')).toEqual(['parallel']);
    });

    it('should handle WAIT_ALL join with multiple incoming connections', () => {
      const connections: WorkflowConnection[] = [
        makeConnection('branch-a', 'wait-all'),
        makeConnection('branch-b', 'wait-all'),
      ];

      const { outgoing, incoming } = scheduler.buildAdjacencyLists(connections);

      expect(incoming.get('wait-all')).toEqual(['branch-a', 'branch-b']);
      expect(outgoing.get('branch-a')).toEqual(['wait-all']);
      expect(outgoing.get('branch-b')).toEqual(['wait-all']);
    });
  });

  // -------------------------------------------------------------------------
  // Linear flow
  // -------------------------------------------------------------------------

  describe('linear flow', () => {
    // START -> step1 -> step2 -> END
    const steps = [
      makeRuntimeStep('start', 'START', 'COMPLETED'),
      makeRuntimeStep('step1', 'USER_INTERACTION', 'IDLE'),
      makeRuntimeStep('step2', 'USER_INTERACTION', 'IDLE'),
      makeRuntimeStep('end', 'END', 'IDLE'),
    ];
    const connections = [
      makeConnection('start', 'step1'),
      makeConnection('step1', 'step2'),
      makeConnection('step2', 'end'),
    ];

    it('should activate step1 when START completes', () => {
      const ctx = buildContext(steps, connections);
      const next = scheduler.getNextSteps('start', ctx);
      expect(next).toEqual(['step1']);
    });

    it('should activate step2 when step1 completes', () => {
      const modSteps = steps.map((s) =>
        s.step_oid === 'step1' ? { ...s, step_state: 'COMPLETED' as StepState } : s,
      );
      const ctx = buildContext(modSteps, connections);
      const next = scheduler.getNextSteps('step1', ctx);
      expect(next).toEqual(['step2']);
    });

    it('should activate END when step2 completes', () => {
      const modSteps = steps.map((s) =>
        s.step_oid === 'step2' ? { ...s, step_state: 'COMPLETED' as StepState } : s,
      );
      const ctx = buildContext(modSteps, connections);
      const next = scheduler.getNextSteps('step2', ctx);
      expect(next).toEqual(['end']);
    });
  });

  // -------------------------------------------------------------------------
  // END step
  // -------------------------------------------------------------------------

  describe('END step', () => {
    it('should return empty array when END step completes (no outgoing)', () => {
      const steps = [makeRuntimeStep('end', 'END', 'COMPLETED')];
      const connections: WorkflowConnection[] = [];
      const ctx = buildContext(steps, connections);

      const next = scheduler.getNextSteps('end', ctx);
      expect(next).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // No outgoing connections for non-END step (orphan warning)
  // -------------------------------------------------------------------------

  describe('orphan detection', () => {
    it('should return empty with warning for non-END step with no outgoing connections', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const steps = [makeRuntimeStep('orphan', 'USER_INTERACTION', 'COMPLETED')];
      const connections: WorkflowConnection[] = [];
      const ctx = buildContext(steps, connections);

      const next = scheduler.getNextSteps('orphan', ctx);
      expect(next).toEqual([]);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('orphan'),
      );

      warnSpy.mockRestore();
    });
  });

  // -------------------------------------------------------------------------
  // PARALLEL fork
  // -------------------------------------------------------------------------

  describe('PARALLEL fork', () => {
    // START -> PARALLEL -> [branch-a, branch-b]
    const steps = [
      makeRuntimeStep('start', 'START', 'COMPLETED'),
      makeRuntimeStep('parallel', 'PARALLEL', 'IDLE'),
      makeRuntimeStep('branch-a', 'USER_INTERACTION', 'IDLE'),
      makeRuntimeStep('branch-b', 'USER_INTERACTION', 'IDLE'),
    ];
    const connections = [
      makeConnection('start', 'parallel'),
      makeConnection('parallel', 'branch-a'),
      makeConnection('parallel', 'branch-b'),
    ];

    it('should activate the PARALLEL step when its predecessor completes', () => {
      const ctx = buildContext(steps, connections);
      const next = scheduler.getNextSteps('start', ctx);
      expect(next).toEqual(['parallel']);
    });

    it('should return all branch starts from getParallelBranchSteps', () => {
      const ctx = buildContext(steps, connections);
      const branches = scheduler.getParallelBranchSteps('parallel', ctx);
      expect(branches).toEqual(['branch-a', 'branch-b']);
      expect(branches).toHaveLength(2);
    });

    it('should activate all branches when PARALLEL step completes via getNextSteps', () => {
      const modSteps = steps.map((s) =>
        s.step_oid === 'parallel'
          ? { ...s, step_state: 'COMPLETED' as StepState }
          : s,
      );
      const ctx = buildContext(modSteps, connections);
      const next = scheduler.getNextSteps('parallel', ctx);
      expect(next).toHaveLength(2);
      expect(next).toContain('branch-a');
      expect(next).toContain('branch-b');
    });
  });

  // -------------------------------------------------------------------------
  // WAIT_ALL join
  // -------------------------------------------------------------------------

  describe('WAIT_ALL join', () => {
    // branch-a -> WAIT_ALL <- branch-b
    // WAIT_ALL -> end
    const makeSteps = (
      aState: StepState,
      bState: StepState,
      waitState: StepState = 'IDLE',
    ) => [
      makeRuntimeStep('branch-a', 'USER_INTERACTION', aState),
      makeRuntimeStep('branch-b', 'USER_INTERACTION', bState),
      makeRuntimeStep('wait-all', 'WAIT_ALL', waitState),
      makeRuntimeStep('end', 'END', 'IDLE'),
    ];
    const connections = [
      makeConnection('branch-a', 'wait-all'),
      makeConnection('branch-b', 'wait-all'),
      makeConnection('wait-all', 'end'),
    ];

    it('should NOT activate WAIT_ALL when only branch A completes', () => {
      const steps = makeSteps('COMPLETED', 'EXECUTING');
      const ctx = buildContext(steps, connections);

      const next = scheduler.getNextSteps('branch-a', ctx);
      expect(next).toEqual([]);
    });

    it('should activate WAIT_ALL when branch B also completes (all incoming COMPLETED)', () => {
      const steps = makeSteps('COMPLETED', 'COMPLETED');
      const ctx = buildContext(steps, connections);

      const next = scheduler.getNextSteps('branch-b', ctx);
      expect(next).toEqual(['wait-all']);
    });

    it('should NOT activate WAIT_ALL when only branch B completes', () => {
      const steps = makeSteps('EXECUTING', 'COMPLETED');
      const ctx = buildContext(steps, connections);

      const next = scheduler.getNextSteps('branch-b', ctx);
      expect(next).toEqual([]);
    });

    it('should handle 3-way WAIT_ALL', () => {
      const steps = [
        makeRuntimeStep('a', 'USER_INTERACTION', 'COMPLETED'),
        makeRuntimeStep('b', 'USER_INTERACTION', 'COMPLETED'),
        makeRuntimeStep('c', 'USER_INTERACTION', 'EXECUTING'),
        makeRuntimeStep('wait-all', 'WAIT_ALL', 'IDLE'),
      ];
      const conns = [
        makeConnection('a', 'wait-all'),
        makeConnection('b', 'wait-all'),
        makeConnection('c', 'wait-all'),
      ];
      const ctx = buildContext(steps, conns);

      // c not completed -- should not activate
      expect(scheduler.getNextSteps('b', ctx)).toEqual([]);

      // Now c completes
      ctx.steps.get('c')!.step_state = 'COMPLETED';
      expect(scheduler.getNextSteps('c', ctx)).toEqual(['wait-all']);
    });
  });

  // -------------------------------------------------------------------------
  // WAIT_ANY join
  // -------------------------------------------------------------------------

  describe('WAIT_ANY join', () => {
    // branch-a -> WAIT_ANY <- branch-b
    // WAIT_ANY -> end
    const makeSteps = (
      aState: StepState,
      bState: StepState,
      waitState: StepState = 'IDLE',
    ) => [
      makeRuntimeStep('branch-a', 'USER_INTERACTION', aState),
      makeRuntimeStep('branch-b', 'USER_INTERACTION', bState),
      makeRuntimeStep('wait-any', 'WAIT_ANY', waitState),
      makeRuntimeStep('end', 'END', 'IDLE'),
    ];
    const connections = [
      makeConnection('branch-a', 'wait-any'),
      makeConnection('branch-b', 'wait-any'),
      makeConnection('wait-any', 'end'),
    ];

    it('should activate WAIT_ANY when first branch (A) completes', () => {
      const steps = makeSteps('COMPLETED', 'EXECUTING');
      const ctx = buildContext(steps, connections);

      const next = scheduler.getNextSteps('branch-a', ctx);
      expect(next).toEqual(['wait-any']);
    });

    it('should NOT double-activate WAIT_ANY when second branch (B) completes', () => {
      // WAIT_ANY is already activated (not IDLE anymore)
      const steps = makeSteps('COMPLETED', 'COMPLETED', 'EXECUTING');
      const ctx = buildContext(steps, connections);

      const next = scheduler.getNextSteps('branch-b', ctx);
      expect(next).toEqual([]);
    });

    it('should activate WAIT_ANY regardless of which branch completes first', () => {
      // Branch B completes first this time
      const steps = makeSteps('EXECUTING', 'COMPLETED');
      const ctx = buildContext(steps, connections);

      const next = scheduler.getNextSteps('branch-b', ctx);
      expect(next).toEqual(['wait-any']);
    });

    it('should not activate WAIT_ANY if it has been completed already', () => {
      const steps = makeSteps('COMPLETED', 'COMPLETED', 'COMPLETED');
      const ctx = buildContext(steps, connections);

      const next = scheduler.getNextSteps('branch-b', ctx);
      expect(next).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Full parallel workflow (fork + join)
  // -------------------------------------------------------------------------

  describe('full parallel workflow (fork + join)', () => {
    // START -> PARALLEL -> [branch-a, branch-b] -> WAIT_ALL -> END
    const steps = [
      makeRuntimeStep('start', 'START', 'COMPLETED'),
      makeRuntimeStep('parallel', 'PARALLEL', 'COMPLETED'),
      makeRuntimeStep('branch-a', 'USER_INTERACTION', 'IDLE'),
      makeRuntimeStep('branch-b', 'USER_INTERACTION', 'IDLE'),
      makeRuntimeStep('wait-all', 'WAIT_ALL', 'IDLE'),
      makeRuntimeStep('end', 'END', 'IDLE'),
    ];
    const connections = [
      makeConnection('start', 'parallel'),
      makeConnection('parallel', 'branch-a'),
      makeConnection('parallel', 'branch-b'),
      makeConnection('branch-a', 'wait-all'),
      makeConnection('branch-b', 'wait-all'),
      makeConnection('wait-all', 'end'),
    ];

    it('should activate both branches when PARALLEL completes', () => {
      const ctx = buildContext(steps, connections);
      const next = scheduler.getNextSteps('parallel', ctx);
      expect(next).toHaveLength(2);
      expect(next).toContain('branch-a');
      expect(next).toContain('branch-b');
    });

    it('should not activate WAIT_ALL after only branch-a completes', () => {
      const modSteps = steps.map((s) => {
        if (s.step_oid === 'branch-a') return { ...s, step_state: 'COMPLETED' as StepState };
        if (s.step_oid === 'branch-b') return { ...s, step_state: 'EXECUTING' as StepState };
        return s;
      });
      const ctx = buildContext(modSteps, connections);
      expect(scheduler.getNextSteps('branch-a', ctx)).toEqual([]);
    });

    it('should activate WAIT_ALL after both branches complete', () => {
      const modSteps = steps.map((s) => {
        if (s.step_oid === 'branch-a' || s.step_oid === 'branch-b') {
          return { ...s, step_state: 'COMPLETED' as StepState };
        }
        return s;
      });
      const ctx = buildContext(modSteps, connections);
      expect(scheduler.getNextSteps('branch-b', ctx)).toEqual(['wait-all']);
    });

    it('should activate END after WAIT_ALL completes', () => {
      const modSteps = steps.map((s) => {
        if (s.step_oid === 'wait-all') return { ...s, step_state: 'COMPLETED' as StepState };
        return s;
      });
      const ctx = buildContext(modSteps, connections);
      expect(scheduler.getNextSteps('wait-all', ctx)).toEqual(['end']);
    });
  });
});
