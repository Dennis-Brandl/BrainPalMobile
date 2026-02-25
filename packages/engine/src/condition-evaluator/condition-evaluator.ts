// Condition evaluator for SELECT 1 branching.
// Implements all 10 comparison operators with type coercion.
// Source: ExecutionEngineSpec.md Section 7, Research Code Examples

import type { ComparisonOperator } from '../types/common';
import type { Select1EvalConfig } from './types';
import { ConditionNotMatchedError } from './types';

/**
 * Evaluate a single condition: compare inputValue against expectedValue
 * using the specified operator and type coercion.
 *
 * @param inputValue - The actual value to test
 * @param operator - One of 10 comparison operators
 * @param expectedValue - The value to compare against
 * @param valueType - Type hint for coercion ('number', 'integer', 'float', 'boolean', or string default)
 * @returns true if the condition matches
 */
export function evaluateCondition(
  inputValue: string,
  operator: ComparisonOperator,
  expectedValue: string,
  valueType: string,
): boolean {
  const [a, b] = coerceTypes(inputValue, expectedValue, valueType);

  switch (operator) {
    case 'equals':
      return a === b;
    case 'not_equals':
      return a !== b;
    case 'greater_than':
      return a > b;
    case 'less_than':
      return a < b;
    case 'greater_than_or_equal':
      return a >= b;
    case 'less_than_or_equal':
      return a <= b;
    case 'contains':
      return String(a).includes(String(b));
    case 'not_contains':
      return !String(a).includes(String(b));
    case 'starts_with':
      return String(a).startsWith(String(b));
    case 'ends_with':
      return String(a).endsWith(String(b));
  }
}

/**
 * Evaluate SELECT 1 conditions in order and return the first matching
 * connection ID.
 *
 * @param config - The SELECT 1 evaluation configuration
 * @param stepOid - Optional step OID for error context
 * @param stepInstanceId - Optional step instance ID for error context
 * @returns The connection_id of the first matching condition
 * @throws ConditionNotMatchedError if no condition matches (Pitfall 6)
 */
export function evaluate(
  config: Select1EvalConfig,
  stepOid?: string,
  stepInstanceId?: string,
): string {
  for (const condition of config.conditions) {
    const matched = evaluateCondition(
      config.inputValue,
      condition.operator,
      condition.expected_value,
      condition.value_type,
    );
    if (matched) {
      return condition.connection_id;
    }
  }

  throw new ConditionNotMatchedError(config.inputValue, stepOid, stepInstanceId);
}

/**
 * Coerce string values to appropriate types for comparison.
 * Uses valueType hint to determine coercion strategy.
 */
function coerceTypes(a: string, b: string, valueType: string): [unknown, unknown] {
  if (valueType === 'number' || valueType === 'integer' || valueType === 'float') {
    return [Number(a), Number(b)];
  }
  if (valueType === 'boolean') {
    return [a.toLowerCase() === 'true', b.toLowerCase() === 'true'];
  }
  // Default: string comparison (no coercion)
  return [a, b];
}

/**
 * ConditionEvaluator class wrapping the pure functions for use
 * as an injectable dependency in the WorkflowRunner.
 */
export class ConditionEvaluator {
  /**
   * Evaluate a single condition.
   */
  evaluateCondition(
    inputValue: string,
    operator: ComparisonOperator,
    expectedValue: string,
    valueType: string,
  ): boolean {
    return evaluateCondition(inputValue, operator, expectedValue, valueType);
  }

  /**
   * Evaluate SELECT 1 conditions and return the matched connection ID.
   * @throws ConditionNotMatchedError if no condition matches
   */
  evaluate(
    config: Select1EvalConfig,
    stepOid?: string,
    stepInstanceId?: string,
  ): string {
    return evaluate(config, stepOid, stepInstanceId);
  }
}
