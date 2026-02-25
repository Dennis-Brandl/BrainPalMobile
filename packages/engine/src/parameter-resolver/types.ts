// Parameter resolver types for input resolution and output writing.

/**
 * A single resolved parameter with its source information.
 */
export interface ResolvedParameter {
  /** The parameter specification id */
  id: string;
  /** The resolved value (after lookup or literal) */
  value: string;
  /** How the value was obtained */
  source: 'literal' | 'property';
  /** For property lookups: the property name used */
  property_name?: string;
  /** For property lookups: the entry name used */
  entry_name?: string;
}

/**
 * Result of resolving all input parameters for a step.
 */
export interface ParameterResolutionResult {
  /** Successfully resolved parameters */
  resolved: ResolvedParameter[];
  /** Any errors encountered during resolution */
  errors: string[];
}
