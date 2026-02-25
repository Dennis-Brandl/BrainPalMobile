// Scheduler types for DAG-based step activation logic.

import type { RuntimeWorkflowStep, WorkflowConnection } from '../types/runtime';

/**
 * Map from step_oid to an array of connected step_oids.
 * Used for both outgoing (successors) and incoming (predecessors) adjacency.
 */
export type AdjacencyList = Map<string, string[]>;

/**
 * Context required by the scheduler to determine next steps.
 * Contains the pre-built adjacency lists, the current step states,
 * and the raw connection data.
 */
export interface SchedulerContext {
  /** step_oid -> array of successor step_oids */
  outgoing: AdjacencyList;
  /** step_oid -> array of predecessor step_oids */
  incoming: AdjacencyList;
  /** step_oid -> RuntimeWorkflowStep (for checking step_type and step_state) */
  steps: Map<string, RuntimeWorkflowStep>;
  /** Raw connections (for reference, e.g., connection_id lookup) */
  connections: WorkflowConnection[];
}
