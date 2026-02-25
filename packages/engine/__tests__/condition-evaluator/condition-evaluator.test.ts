import { describe, it, expect } from 'vitest';
import {
  evaluateCondition,
  evaluate,
  ConditionEvaluator,
} from '../../src/condition-evaluator/condition-evaluator';
import { ConditionNotMatchedError } from '../../src/condition-evaluator/types';
import type { Select1EvalConfig } from '../../src/condition-evaluator/types';
import type { ConditionConnection } from '../../src/types/master';

describe('evaluateCondition', () => {
  describe('string operators', () => {
    it('equals: returns true for matching strings', () => {
      expect(evaluateCondition('hello', 'equals', 'hello', 'string')).toBe(true);
    });

    it('equals: returns false for non-matching strings', () => {
      expect(evaluateCondition('hello', 'equals', 'world', 'string')).toBe(false);
    });

    it('not_equals: returns true for non-matching strings', () => {
      expect(evaluateCondition('hello', 'not_equals', 'world', 'string')).toBe(true);
    });

    it('not_equals: returns false for matching strings', () => {
      expect(evaluateCondition('hello', 'not_equals', 'hello', 'string')).toBe(false);
    });

    it('contains: returns true when input contains expected', () => {
      expect(evaluateCondition('hello world', 'contains', 'world', 'string')).toBe(true);
    });

    it('contains: returns false when input does not contain expected', () => {
      expect(evaluateCondition('hello', 'contains', 'world', 'string')).toBe(false);
    });

    it('not_contains: returns true when input does not contain expected', () => {
      expect(evaluateCondition('hello', 'not_contains', 'world', 'string')).toBe(true);
    });

    it('not_contains: returns false when input contains expected', () => {
      expect(evaluateCondition('hello world', 'not_contains', 'world', 'string')).toBe(false);
    });

    it('starts_with: returns true when input starts with expected', () => {
      expect(evaluateCondition('hello world', 'starts_with', 'hello', 'string')).toBe(true);
    });

    it('starts_with: returns false when input does not start with expected', () => {
      expect(evaluateCondition('hello world', 'starts_with', 'world', 'string')).toBe(false);
    });

    it('ends_with: returns true when input ends with expected', () => {
      expect(evaluateCondition('hello world', 'ends_with', 'world', 'string')).toBe(true);
    });

    it('ends_with: returns false when input does not end with expected', () => {
      expect(evaluateCondition('hello world', 'ends_with', 'hello', 'string')).toBe(false);
    });

    it('greater_than: compares strings lexicographically', () => {
      expect(evaluateCondition('b', 'greater_than', 'a', 'string')).toBe(true);
      expect(evaluateCondition('a', 'greater_than', 'b', 'string')).toBe(false);
    });

    it('less_than: compares strings lexicographically', () => {
      expect(evaluateCondition('a', 'less_than', 'b', 'string')).toBe(true);
      expect(evaluateCondition('b', 'less_than', 'a', 'string')).toBe(false);
    });

    it('greater_than_or_equal: compares strings lexicographically', () => {
      expect(evaluateCondition('b', 'greater_than_or_equal', 'a', 'string')).toBe(true);
      expect(evaluateCondition('a', 'greater_than_or_equal', 'a', 'string')).toBe(true);
      expect(evaluateCondition('a', 'greater_than_or_equal', 'b', 'string')).toBe(false);
    });

    it('less_than_or_equal: compares strings lexicographically', () => {
      expect(evaluateCondition('a', 'less_than_or_equal', 'b', 'string')).toBe(true);
      expect(evaluateCondition('a', 'less_than_or_equal', 'a', 'string')).toBe(true);
      expect(evaluateCondition('b', 'less_than_or_equal', 'a', 'string')).toBe(false);
    });
  });

  describe('numeric coercion', () => {
    it('greater_than: compares numerically (not string)', () => {
      // String comparison: "2" > "10" is true (lexicographic)
      // Number comparison: 2 > 10 is false
      expect(evaluateCondition('2', 'greater_than', '10', 'number')).toBe(false);
      expect(evaluateCondition('10', 'greater_than', '2', 'number')).toBe(true);
    });

    it('less_than: compares numerically', () => {
      expect(evaluateCondition('2', 'less_than', '10', 'number')).toBe(true);
      expect(evaluateCondition('10', 'less_than', '2', 'number')).toBe(false);
    });

    it('equals: compares numerically', () => {
      expect(evaluateCondition('10', 'equals', '10.0', 'number')).toBe(true);
      expect(evaluateCondition('10', 'equals', '10.0', 'float')).toBe(true);
    });

    it('greater_than_or_equal: with integer type', () => {
      expect(evaluateCondition('5', 'greater_than_or_equal', '5', 'integer')).toBe(true);
      expect(evaluateCondition('4', 'greater_than_or_equal', '5', 'integer')).toBe(false);
    });

    it('less_than_or_equal: with float type', () => {
      expect(evaluateCondition('3.14', 'less_than_or_equal', '3.14', 'float')).toBe(true);
      expect(evaluateCondition('3.15', 'less_than_or_equal', '3.14', 'float')).toBe(false);
    });
  });

  describe('boolean coercion', () => {
    it('equals: "True" equals "true" (case insensitive)', () => {
      expect(evaluateCondition('True', 'equals', 'true', 'boolean')).toBe(true);
    });

    it('equals: "TRUE" equals "true"', () => {
      expect(evaluateCondition('TRUE', 'equals', 'true', 'boolean')).toBe(true);
    });

    it('equals: "false" equals "false"', () => {
      expect(evaluateCondition('false', 'equals', 'false', 'boolean')).toBe(true);
    });

    it('not_equals: "true" not_equals "false"', () => {
      expect(evaluateCondition('true', 'not_equals', 'false', 'boolean')).toBe(true);
    });

    it('equals: "false" not equals "true"', () => {
      expect(evaluateCondition('false', 'equals', 'true', 'boolean')).toBe(false);
    });
  });
});

describe('evaluate (SELECT 1)', () => {
  function makeCondition(
    connectionId: string,
    operator: string,
    expectedValue: string,
    valueType = 'string',
  ): ConditionConnection {
    return {
      connection_id: connectionId,
      operator: operator as any,
      expected_value: expectedValue,
      value_type: valueType,
    };
  }

  it('should return the connection_id of the matching condition', () => {
    const config: Select1EvalConfig = {
      inputValue: 'yes',
      conditions: [
        makeCondition('conn-yes', 'equals', 'yes'),
        makeCondition('conn-no', 'equals', 'no'),
      ],
    };

    expect(evaluate(config)).toBe('conn-yes');
  });

  it('should return the FIRST matching condition when multiple match', () => {
    const config: Select1EvalConfig = {
      inputValue: 'hello world',
      conditions: [
        makeCondition('conn-contains-hello', 'contains', 'hello'),
        makeCondition('conn-starts-hello', 'starts_with', 'hello'),
        makeCondition('conn-contains-world', 'contains', 'world'),
      ],
    };

    // First match wins
    expect(evaluate(config)).toBe('conn-contains-hello');
  });

  it('should throw ConditionNotMatchedError when no condition matches', () => {
    const config: Select1EvalConfig = {
      inputValue: 'maybe',
      conditions: [
        makeCondition('conn-yes', 'equals', 'yes'),
        makeCondition('conn-no', 'equals', 'no'),
      ],
    };

    expect(() => evaluate(config, 'step-oid-1', 'step-instance-1')).toThrow(
      ConditionNotMatchedError,
    );
  });

  it('should include input value and step info in error', () => {
    const config: Select1EvalConfig = {
      inputValue: 'unexpected',
      conditions: [makeCondition('conn-1', 'equals', 'expected')],
    };

    try {
      evaluate(config, 'my-step', 'step-inst-1');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ConditionNotMatchedError);
      const error = err as ConditionNotMatchedError;
      expect(error.inputValue).toBe('unexpected');
      expect(error.stepOid).toBe('my-step');
      expect(error.stepInstanceId).toBe('step-inst-1');
      expect(error.message).toContain('unexpected');
      expect(error.message).toContain('my-step');
    }
  });

  it('should evaluate conditions with numeric coercion', () => {
    const config: Select1EvalConfig = {
      inputValue: '150',
      conditions: [
        makeCondition('conn-low', 'less_than', '100', 'number'),
        makeCondition('conn-mid', 'less_than', '200', 'number'),
        makeCondition('conn-high', 'greater_than_or_equal', '200', 'number'),
      ],
    };

    expect(evaluate(config)).toBe('conn-mid');
  });

  it('should work with empty conditions list (throws immediately)', () => {
    const config: Select1EvalConfig = {
      inputValue: 'anything',
      conditions: [],
    };

    expect(() => evaluate(config)).toThrow(ConditionNotMatchedError);
  });
});

describe('ConditionEvaluator class', () => {
  const evaluator = new ConditionEvaluator();

  it('evaluateCondition delegates to the pure function', () => {
    expect(evaluator.evaluateCondition('abc', 'contains', 'b', 'string')).toBe(true);
  });

  it('evaluate delegates to the pure function', () => {
    const config: Select1EvalConfig = {
      inputValue: 'yes',
      conditions: [
        { connection_id: 'c1', operator: 'equals', expected_value: 'yes', value_type: 'string' },
      ],
    };

    expect(evaluator.evaluate(config)).toBe('c1');
  });

  it('evaluate throws ConditionNotMatchedError on no match', () => {
    const config: Select1EvalConfig = {
      inputValue: 'nope',
      conditions: [
        { connection_id: 'c1', operator: 'equals', expected_value: 'yes', value_type: 'string' },
      ],
    };

    expect(() => evaluator.evaluate(config)).toThrow(ConditionNotMatchedError);
  });
});
