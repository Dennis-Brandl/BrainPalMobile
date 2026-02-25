/**
 * TypeScript interfaces matching the database tables.
 * Row types for SQLite queries -- these map 1:1 to table columns.
 */

// ---------------------------------------------------------------------------
// Package Management Row Types
// ---------------------------------------------------------------------------

export interface MasterWorkflowRow {
  id: number;
  oid: string;
  local_id: string;
  version: string;
  description: string | null;
  schema_version: string;
  last_modified_date: string;
  specification_json: string;
  downloaded_at: string;
  source_server_url: string | null;
  source_library_oid: string | null;
  package_file_name: string | null;
}

export interface MasterEnvironmentRow {
  id: number;
  oid: string;
  local_id: string;
  version: string;
  specification_json: string;
  workflow_oid: string | null;
}

export interface MasterActionRow {
  id: number;
  oid: string;
  local_id: string;
  version: string;
  specification_json: string;
  environment_oid: string | null;
}

export interface PackageImageRow {
  id: number;
  workflow_oid: string;
  filename: string;
  mime_type: string;
  data: Uint8Array;
}

// ---------------------------------------------------------------------------
// Runtime Execution Row Types
// ---------------------------------------------------------------------------

export interface RuntimeWorkflowRow {
  instance_id: string;
  master_workflow_oid: string;
  master_workflow_version: string;
  workflow_state: string;
  specification_json: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  last_activity_at: string | null;
  parent_workflow_instance_id: string | null;
  parent_step_oid: string | null;
}

export interface RuntimeStepRow {
  instance_id: string;
  workflow_instance_id: string;
  step_oid: string;
  step_type: string;
  step_state: string;
  step_json: string;
  resolved_inputs_json: string | null;
  resolved_outputs_json: string | null;
  user_inputs_json: string | null;
  activated_at: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface RuntimeConnectionRow {
  id: number;
  workflow_instance_id: string;
  from_step_oid: string;
  to_step_oid: string;
  condition: string | null;
  connection_id: string | null;
  source_handle_id: string | null;
}

// ---------------------------------------------------------------------------
// Value Property Row Types
// ---------------------------------------------------------------------------

export interface EnvironmentValuePropertyRow {
  id: number;
  environment_oid: string;
  property_name: string;
  entries_json: string;
  last_modified: string;
}

export interface WorkflowValuePropertyRow {
  id: number;
  workflow_instance_id: string;
  property_name: string;
  entries_json: string;
  last_modified: string;
}

// ---------------------------------------------------------------------------
// Resource Management Row Types
// ---------------------------------------------------------------------------

export interface ResourcePoolRow {
  id: number;
  resource_name: string;
  scope: string;
  scope_id: string;
  resource_type: string;
  capacity: number;
  current_usage: number;
  named_instances_json: string | null;
}

export interface ResourceQueueRow {
  id: number;
  resource_pool_id: number;
  step_instance_id: string;
  workflow_instance_id: string;
  command_type: string;
  resource_name: string;
  amount: number;
  requested_at: string;
}

export interface SyncBarrierRow {
  id: number;
  resource_name: string;
  step_instance_id: string;
  workflow_instance_id: string;
  command_type: string;
  requested_at: string;
  matched_with_step_id: string | null;
  matched_at: string | null;
}

// ---------------------------------------------------------------------------
// Execution Logging Row Types
// ---------------------------------------------------------------------------

export interface ExecutionLogRow {
  id: number;
  workflow_instance_id: string;
  step_oid: string | null;
  step_instance_id: string | null;
  event_type: string;
  event_data_json: string;
  timestamp: string;
}
