// DAG-based scheduler for determining which steps to activate next.
// Handles sequential flow, PARALLEL forks, WAIT ALL joins, and WAIT ANY joins.
// Source: ExecutionEngineSpec.md Section 4

import type { WorkflowConnection } from '../types/runtime';
import type { AdjacencyList, SchedulerContext } from './types';

/**
 * Scheduler determines which steps to activate when a step completes.
 *
 * It reads the workflow DAG (via adjacency lists built from connections)
 * and evaluates join semantics based on target step types:
 *
 * - Normal steps: activate directly
 * - PARALLEL: activate the PARALLEL step itself (it activates branches on completion)
 * - WAIT_ALL: activate only when ALL incoming predecessor steps are COMPLETED
 * - WAIT_ANY: activate on the FIRST incoming predecessor completion only
 */
export class Scheduler {
  /**
   * Build outgoing and incoming adjacency lists from workflow connections.
   * Call once per workflow creation and reuse throughout execution.
   */
  buildAdjacencyLists(connections: WorkflowConnection[]): {
    outgoing: AdjacencyList;
    incoming: AdjacencyList;
  } {
    const outgoing: AdjacencyList = new Map();
    const incoming: AdjacencyList = new Map();

    for (const conn of connections) {
      // Outgoing: from_step_oid -> [to_step_oid, ...]
      const outs = outgoing.get(conn.from_step_oid);
      if (outs) {
        outs.push(conn.to_step_oid);
      } else {
        outgoing.set(conn.from_step_oid, [conn.to_step_oid]);
      }

      // Incoming: to_step_oid -> [from_step_oid, ...]
      const ins = incoming.get(conn.to_step_oid);
      if (ins) {
        ins.push(conn.from_step_oid);
      } else {
        incoming.set(conn.to_step_oid, [conn.from_step_oid]);
      }
    }

    return { outgoing, incoming };
  }

  /**
   * Determine which step_oids should be activated after a step completes.
   *
   * @param completedStepOid The step_oid of the step that just completed.
   * @param context The scheduler context with adjacency lists and step state map.
   * @returns Array of step_oids to activate.
   */
  getNextSteps(completedStepOid: string, context: SchedulerContext): string[] {
    const successors = context.outgoing.get(completedStepOid);

    if (!successors || successors.length === 0) {
      // No outgoing connections. If not an END step, log warning.
      const completedStep = context.steps.get(completedStepOid);
      if (completedStep && completedStep.step_type !== 'END') {
        console.warn(
          `Scheduler: step '${completedStepOid}' has no outgoing connections and is not an END step`,
        );
      }
      return [];
    }

    const toActivate: string[] = [];

    for (const targetOid of successors) {
      const targetStep = context.steps.get(targetOid);
      if (!targetStep) {
        console.warn(`Scheduler: target step '${targetOid}' not found in context`);
        continue;
      }

      switch (targetStep.step_type) {
        case 'WAIT_ALL': {
          // Only activate if ALL incoming predecessors are COMPLETED
          const predecessors = context.incoming.get(targetOid) ?? [];
          const allCompleted = predecessors.every((predOid) => {
            const predStep = context.steps.get(predOid);
            return predStep?.step_state === 'COMPLETED';
          });
          if (allCompleted) {
            toActivate.push(targetOid);
          }
          break;
        }

        case 'WAIT_ANY': {
          // Activate on FIRST incoming predecessor completion only.
          // If the step is still IDLE, this is the first trigger.
          if (targetStep.step_state === 'IDLE') {
            toActivate.push(targetOid);
          }
          // Otherwise, already activated -- do not double-activate.
          break;
        }

        default: {
          // Normal steps (START, END, USER_INTERACTION, YES_NO, ACTION_PROXY,
          // SCRIPT, WORKFLOW_PROXY, SELECT_1, PARALLEL): activate directly.
          toActivate.push(targetOid);
          break;
        }
      }
    }

    return toActivate;
  }

  /**
   * Get all branch start steps for a PARALLEL step.
   * Called when the PARALLEL step itself completes to activate all outgoing branches.
   *
   * @param parallelStepOid The step_oid of the PARALLEL step.
   * @param context The scheduler context.
   * @returns Array of step_oids that are the start of each parallel branch.
   */
  getParallelBranchSteps(parallelStepOid: string, context: SchedulerContext): string[] {
    return context.outgoing.get(parallelStepOid) ?? [];
  }
}
