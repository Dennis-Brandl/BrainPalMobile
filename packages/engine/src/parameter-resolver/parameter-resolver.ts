// Parameter resolver: resolves step input parameters and writes output parameters.
// Uses ScopeResolver for property lookups across the scope chain.

import type { ParameterSpecification, OutputParameterSpecification } from '../types/master';
import type { IValuePropertyRepository } from '../interfaces/storage';
import type { ResolvedParameter, ParameterResolutionResult } from './types';
import type { ScopeResolver } from './scope-resolver';

/**
 * Resolves input parameters for steps and writes output parameters
 * to Value Properties after step completion.
 */
export class ParameterResolver {
  constructor(
    private readonly scopeResolver: ScopeResolver,
    private readonly valuePropertyRepo: IValuePropertyRepository,
  ) {}

  /**
   * Resolve all input parameters for a step.
   *
   * For literal parameters: use default_value directly.
   * For property parameters: parse default_value to extract property_name
   * and entry_name, then look up via scope chain. Falls back to default_value
   * if lookup returns null.
   *
   * @param workflowInstanceId - The workflow instance containing the step
   * @param parameters - The input parameter specifications from the step
   * @param environmentId - Optional environment OID for environment scope lookup
   * @returns Resolution result with all resolved parameters and any errors
   */
  async resolveInputs(
    workflowInstanceId: string,
    parameters: ParameterSpecification[],
    environmentId?: string,
  ): Promise<ParameterResolutionResult> {
    const resolved: ResolvedParameter[] = [];
    const errors: string[] = [];

    for (const param of parameters) {
      try {
        if (param.value_type === 'literal') {
          resolved.push({
            id: param.id,
            value: param.default_value,
            source: 'literal',
          });
        } else if (param.value_type === 'property') {
          const { propertyName, entryName } = parsePropertyReference(param.default_value);

          const value = await this.scopeResolver.lookupProperty(
            workflowInstanceId,
            propertyName,
            entryName,
            environmentId,
          );

          resolved.push({
            id: param.id,
            value: value ?? param.default_value,
            source: 'property',
            property_name: propertyName,
            entry_name: entryName,
          });
        } else {
          // Unknown value_type -- treat as literal fallback
          resolved.push({
            id: param.id,
            value: param.default_value,
            source: 'literal',
          });
          errors.push(`Unknown value_type '${param.value_type}' for parameter '${param.id}', using default_value`);
        }
      } catch (err) {
        errors.push(`Failed to resolve parameter '${param.id}': ${err instanceof Error ? err.message : String(err)}`);
        // Still provide a fallback value so execution can continue
        resolved.push({
          id: param.id,
          value: param.default_value,
          source: param.value_type === 'property' ? 'property' : 'literal',
        });
      }
    }

    return { resolved, errors };
  }

  /**
   * Write output parameter values to Value Properties.
   *
   * Each output parameter specifies a target_property_name and target_entry_name
   * where the resolved value should be written via upsert.
   *
   * @param workflowInstanceId - The workflow instance (scope for workflow-scoped writes)
   * @param outputs - The output parameter specifications
   * @param resolvedValues - Map of parameter id -> resolved value to write
   */
  async writeOutputs(
    workflowInstanceId: string,
    outputs: OutputParameterSpecification[],
    resolvedValues: Map<string, string>,
  ): Promise<void> {
    for (const output of outputs) {
      const value = resolvedValues.get(output.id);
      if (value !== undefined) {
        await this.valuePropertyRepo.upsertEntry(
          'workflow',
          workflowInstanceId,
          output.target_property_name,
          output.target_entry_name,
          value,
        );
      }
    }
  }
}

/**
 * Parse a property reference string into property name and entry name.
 *
 * The default_value for property-type parameters contains a reference
 * in the format "PropertyName.EntryName" or just "PropertyName" (with
 * entry name defaulting to "Value").
 */
function parsePropertyReference(reference: string): {
  propertyName: string;
  entryName: string;
} {
  const dotIndex = reference.indexOf('.');
  if (dotIndex === -1) {
    return { propertyName: reference, entryName: 'Value' };
  }
  return {
    propertyName: reference.substring(0, dotIndex),
    entryName: reference.substring(dotIndex + 1),
  };
}
