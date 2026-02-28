// Master Information System types -- read-only data downloaded from BrainPal MD.
// Source: DataModelSpec.md Sections 1-2, PackageFormatSpec.md

import type {
  StepType,
  ComparisonOperator,
  ResourceType,
  ResourceCommandType,
  ActionVisibility,
} from './common';

// ---------------------------------------------------------------------------
// Base Types
// ---------------------------------------------------------------------------

/**
 * Base interface for all managed entities in the BrainPal system.
 * Every master entity inherits these fields.
 */
export interface ManagedElement {
  local_id: string;
  oid: string;
  version: string;
  last_modified_date: string;
  description?: string;
  schemaVersion: string;
}

// ---------------------------------------------------------------------------
// Parameter Specifications
// ---------------------------------------------------------------------------

/**
 * Input parameter specification. Defines how a step receives data.
 */
export interface ParameterSpecification {
  id: string;
  default_value: string;
  value_type: 'literal' | 'property';
  json_schema?: string;
  description?: string;
}

/**
 * Output parameter specification. Defines how a step writes data
 * to Value Properties.
 */
export interface OutputParameterSpecification extends ParameterSpecification {
  target_property_name: string;
  target_entry_name: string;
}

/**
 * UI parameter specification. Defines form fields for user interaction steps.
 */
export interface UIParameterSpecification extends ParameterSpecification {
  label: string;
  ui_type: string;
  required?: boolean;
}

// ---------------------------------------------------------------------------
// Property Specifications
// ---------------------------------------------------------------------------

/**
 * A named bag of key/value pairs that serves as the data bus.
 */
export interface PropertySpecification {
  name: string;
  entries: PropertyEntrySpecification[];
}

/**
 * A single key/value entry within a Property.
 */
export interface PropertyEntrySpecification {
  name: string;
  value: string;
}

/**
 * Resource property specification defining concurrent access controls.
 */
export interface ResourcePropertySpecification {
  name: string;
  resource_type: ResourceType;
  use_limit?: number;
  names?: string[];
}

/**
 * Resource command issued by a step to acquire/release/sync resources.
 */
export interface ResourceCommandSpecification {
  oid: string;
  command_type: ResourceCommandType;
  resource_name: string;
  amount?: number;
  target?: string;
  source?: string;
}

// ---------------------------------------------------------------------------
// Step-Type Specific Configurations
// ---------------------------------------------------------------------------

export interface YesNoConfig {
  yes_label: string;
  no_label: string;
  yes_value: string;
  no_value: string;
  default_selection?: 'yes' | 'no';
}

export interface ScriptConfig {
  language: 'python';
  source: string;
}

export interface Select1Config {
  input_name: string;
  input_value_type: string;
  options: Select1Option[];
}

export interface Select1Option {
  label: string;
  operator: ComparisonOperator;
  value: string;
  connection_id: string;
}

// ---------------------------------------------------------------------------
// Form Layout (WYSIWYG)
// ---------------------------------------------------------------------------

export interface FormLayoutEntry {
  deviceType: 'phone' | 'tablet' | 'desktop';
  canvasWidth: number;
  canvasHeight: number;
  elements: FormElementSpec[];
}

export type FormElementType =
  | 'text'
  | 'header'
  | 'input'
  | 'image'
  | 'video'
  | 'checkbox'
  | 'button'
  | 'select'
  | 'dropdown'
  | 'date'
  | 'datepicker'
  | 'textarea'
  | 'number'
  | 'numeric'
  | 'toggle'
  | 'switch'
  | 'radio'
  | 'radiobutton';

export interface FormElementOption {
  label: string;
  value: string;
}

export interface FormElementSpec {
  type: FormElementType | (string & {});  // known types + fallback for unknown
  content?: { content: string; plainText: string };
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number;
  fontWeight?: string;
  color?: string;
  align?: string;
  src?: string;
  options?: (FormElementOption | string)[];
  /** Display label for buttons, inputs, and radio groups */
  label?: string;
  /** Button output value (e.g., "true"/"false" for Yes/No) */
  outputValue?: string;
  /** Form field name for input elements (real packages use this instead of content.plainText) */
  fieldName?: string;
  /** Placeholder text for input elements */
  placeholder?: string;
  /** Whether this element can be deleted from the form editor */
  deletable?: boolean;
}

// ---------------------------------------------------------------------------
// Workflow Connection
// ---------------------------------------------------------------------------

export interface MasterWorkflowConnection {
  from_step_id: string;
  to_step_id: string;
  condition?: string;
  connection_id?: string;
  source_handle_id?: string;
  waypoints?: Array<{ x: number; y: number }>;
}

// ---------------------------------------------------------------------------
// Condition Connection (for step-level condition branching)
// ---------------------------------------------------------------------------

export interface ConditionConnection {
  connection_id: string;
  operator: ComparisonOperator;
  expected_value: string;
  value_type: string;
}

// ---------------------------------------------------------------------------
// Master Workflow Step
// ---------------------------------------------------------------------------

export interface MasterWorkflowStep extends ManagedElement {
  step_type: StepType;
  position: { x: number; y: number };

  // Parameters
  input_parameter_specifications: ParameterSpecification[];
  output_parameter_specifications: OutputParameterSpecification[];
  value_property_specifications: PropertySpecification[];

  // Resource commands
  resource_command_specifications: ResourceCommandSpecification[];

  // UI step content
  ui_parameter_specifications?: UIParameterSpecification[];

  // Step-type specific configurations
  yes_no_config?: YesNoConfig;
  script_config?: ScriptConfig;
  select1_config?: Select1Config;
  form_layout_config?: FormLayoutEntry[];

  // Condition connections
  condition_connections?: ConditionConnection[];

  // Action reference
  action_visibility?: ActionVisibility;
}

// ---------------------------------------------------------------------------
// Master Workflow Specification
// ---------------------------------------------------------------------------

export interface MasterWorkflowSpecification extends ManagedElement {
  // Workflow graph
  steps: MasterWorkflowStep[];
  connections: MasterWorkflowConnection[];
  viewport: { x: number; y: number; zoom: number };

  // Workflow-level parameters
  starting_parameter_specifications: ParameterSpecification[];
  output_parameter_specifications: OutputParameterSpecification[];
  value_property_specifications: PropertySpecification[];
  resource_property_specifications: ResourcePropertySpecification[];

  // Embedded dependencies
  environment_specifications: MasterEnvironmentSpecification[];
  child_workflows: MasterWorkflowSpecification[];
}

// ---------------------------------------------------------------------------
// Master Environment Information System
// ---------------------------------------------------------------------------

export interface IncludedAction {
  action_name: string;
  action_library: string;
  action_oid?: string;
  action_version?: string;
  action_last_modified_date?: string;
  input_parameter_specifications?: ParameterSpecification[];
  output_parameter_specifications?: OutputParameterSpecification[];
  property_specifications?: PropertySpecification[];
}

export interface MasterEnvironmentSpecification extends ManagedElement {
  included_actions: IncludedAction[];
  value_property_specifications: PropertySpecification[];
  action_property_specifications: PropertySpecification[];
  resource_property_specifications: ResourcePropertySpecification[];
}

export interface MasterEnvironmentLibrary extends ManagedElement {
  specifications: MasterEnvironmentSpecification[];
}

// ---------------------------------------------------------------------------
// Master Action Information System
// ---------------------------------------------------------------------------

export interface MasterActionSpecification extends ManagedElement {
  input_parameter_specifications: ParameterSpecification[];
  output_parameter_specifications: OutputParameterSpecification[];
  property_specifications: PropertySpecification[];
  action_visibility: ActionVisibility;
}

export interface MasterActionLibrary extends ManagedElement {
  specifications: MasterActionSpecification[];
}

// ---------------------------------------------------------------------------
// Master Workflow Library
// ---------------------------------------------------------------------------

export interface MasterWorkflowLibrary extends ManagedElement {
  specifications: MasterWorkflowSpecification[];
}
