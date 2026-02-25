// Condition evaluator types for SELECT 1 branching.

import type { ConditionConnection } from '../types/master';

/**
 * Configuration for evaluating a SELECT 1 step's conditions.
 */
export interface Select1EvalConfig {
  /** The input value to evaluate against conditions */
  inputValue: string;
  /** The conditions to evaluate, each linked to a connection */
  conditions: ConditionConnection[];
}

/**
 * Result of condition evaluation: the matched connection ID.
 */
export interface ConditionResult {
  matchedConnectionId: string;
}

/**
 * Error thrown when no condition matches the input value in a SELECT 1 step.
 * The workflow should not silently hang -- this is an explicit failure case
 * per ExecutionEngineSpec.md Section 7.1 and Research Pitfall 6.
 */
export class ConditionNotMatchedError extends Error {
  constructor(
    public readonly inputValue: string,
    public readonly stepOid?: string,
    public readonly stepInstanceId?: string,
  ) {
    super(
      `No condition matched input value "${inputValue}"` +
        (stepOid ? ` for step "${stepOid}"` : '') +
        '. All SELECT 1 conditions were evaluated but none returned true.',
    );
    this.name = 'ConditionNotMatchedError';
  }
}
