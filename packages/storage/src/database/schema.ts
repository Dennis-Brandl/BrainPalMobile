/**
 * Complete SQLite schema DDL for BrainPal Mobile.
 *
 * All 18 tables copied verbatim from StorageSpec.md.
 * DROP TABLE statements in reverse-dependency order (children first)
 * followed by CREATE TABLE + CREATE INDEX statements.
 */
export const SCHEMA_SQL = `
-- ============================================================
-- DROP TABLES (reverse-dependency order: children first)
-- ============================================================
DROP TABLE IF EXISTS offline_action_queue;
DROP TABLE IF EXISTS sync_barriers;
DROP TABLE IF EXISTS resource_queue;
DROP TABLE IF EXISTS resource_pools;
DROP TABLE IF EXISTS workflow_value_properties;
DROP TABLE IF EXISTS environment_value_properties;
DROP TABLE IF EXISTS state_transitions;
DROP TABLE IF EXISTS execution_log_entries;
DROP TABLE IF EXISTS environment_bindings;
DROP TABLE IF EXISTS runtime_connections;
DROP TABLE IF EXISTS runtime_steps;
DROP TABLE IF EXISTS runtime_workflows;
DROP TABLE IF EXISTS package_images;
DROP TABLE IF EXISTS master_actions;
DROP TABLE IF EXISTS master_environments;
DROP TABLE IF EXISTS master_workflows;
DROP TABLE IF EXISTS notification_preferences;
DROP TABLE IF EXISTS server_connections;

-- ============================================================
-- PACKAGE MANAGEMENT TABLES (5)
-- ============================================================

-- master_workflows: Stores downloaded Master Workflow Specifications
CREATE TABLE master_workflows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  oid TEXT NOT NULL UNIQUE,
  local_id TEXT NOT NULL,
  version TEXT NOT NULL,
  description TEXT,
  schema_version TEXT NOT NULL DEFAULT '4.0',
  last_modified_date TEXT NOT NULL,
  specification_json TEXT NOT NULL,    -- Full MasterWorkflowSpecification as JSON
  downloaded_at TEXT NOT NULL,         -- ISO 8601
  source_server_url TEXT,             -- BrainPal MD server it was downloaded from
  source_library_oid TEXT,            -- Library OID on the source server
  package_file_name TEXT              -- Original .WFmasterX filename
);

CREATE INDEX idx_master_workflows_local_id ON master_workflows(local_id);

-- master_environments: Stores Environment Specifications extracted from packages
CREATE TABLE master_environments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  oid TEXT NOT NULL UNIQUE,
  local_id TEXT NOT NULL,
  version TEXT NOT NULL,
  specification_json TEXT NOT NULL,
  workflow_oid TEXT,                   -- Associated workflow (NULL if standalone)
  FOREIGN KEY (workflow_oid) REFERENCES master_workflows(oid) ON DELETE CASCADE
);

-- master_actions: Stores Action Specifications extracted from packages
CREATE TABLE master_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  oid TEXT NOT NULL UNIQUE,
  local_id TEXT NOT NULL,
  version TEXT NOT NULL,
  specification_json TEXT NOT NULL,
  environment_oid TEXT,
  FOREIGN KEY (environment_oid) REFERENCES master_environments(oid) ON DELETE CASCADE
);

-- package_images: Stores binary image data extracted from packages
CREATE TABLE package_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_oid TEXT NOT NULL,
  filename TEXT NOT NULL,             -- Image filename (may include stepOid prefix)
  mime_type TEXT NOT NULL,            -- e.g., 'image/png', 'image/jpeg'
  data BLOB NOT NULL,                -- Binary image data
  FOREIGN KEY (workflow_oid) REFERENCES master_workflows(oid) ON DELETE CASCADE,
  UNIQUE(workflow_oid, filename)
);

-- server_connections: Stores BrainPal MD server connection history
CREATE TABLE server_connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_url TEXT NOT NULL UNIQUE,
  server_name TEXT,                   -- Friendly name
  last_connected_at TEXT,            -- ISO 8601
  is_current INTEGER DEFAULT 0,      -- Boolean: currently active connection
  auth_token TEXT                     -- Future: stored auth token
);

-- ============================================================
-- RUNTIME EXECUTION TABLES (4)
-- ============================================================

-- runtime_workflows: Active workflow instances
CREATE TABLE runtime_workflows (
  instance_id TEXT PRIMARY KEY,       -- UUID
  master_workflow_oid TEXT NOT NULL,
  master_workflow_version TEXT NOT NULL,
  workflow_state TEXT NOT NULL DEFAULT 'IDLE',
  specification_json TEXT NOT NULL,   -- Deep copy of master spec at time of creation
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  last_activity_at TEXT,
  parent_workflow_instance_id TEXT,   -- For nested workflows
  parent_step_oid TEXT,              -- Step that spawned this child workflow
  FOREIGN KEY (master_workflow_oid) REFERENCES master_workflows(oid),
  FOREIGN KEY (parent_workflow_instance_id) REFERENCES runtime_workflows(instance_id)
);

CREATE INDEX idx_runtime_workflows_state ON runtime_workflows(workflow_state);
CREATE INDEX idx_runtime_workflows_parent ON runtime_workflows(parent_workflow_instance_id);

-- runtime_steps: Individual step instances within a runtime workflow
CREATE TABLE runtime_steps (
  instance_id TEXT PRIMARY KEY,       -- UUID
  workflow_instance_id TEXT NOT NULL,
  step_oid TEXT NOT NULL,            -- From master step
  step_type TEXT NOT NULL,
  step_state TEXT NOT NULL DEFAULT 'IDLE',
  step_json TEXT NOT NULL,           -- Full step specification (deep copy)
  resolved_inputs_json TEXT,         -- Resolved input parameters as JSON
  resolved_outputs_json TEXT,        -- Resolved output parameters as JSON
  user_inputs_json TEXT,             -- User form inputs as JSON
  runtime_action_instance_id TEXT,   -- For ACTION PROXY steps
  child_workflow_instance_id TEXT,   -- For WORKFLOW PROXY steps
  activated_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  FOREIGN KEY (workflow_instance_id) REFERENCES runtime_workflows(instance_id) ON DELETE CASCADE
);

CREATE INDEX idx_runtime_steps_workflow ON runtime_steps(workflow_instance_id);
CREATE INDEX idx_runtime_steps_state ON runtime_steps(step_state);
CREATE INDEX idx_runtime_steps_type ON runtime_steps(step_type);

-- runtime_connections: Step-to-step connections for a runtime workflow
CREATE TABLE runtime_connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_instance_id TEXT NOT NULL,
  from_step_oid TEXT NOT NULL,
  to_step_oid TEXT NOT NULL,
  condition TEXT,
  connection_id TEXT,
  source_handle_id TEXT,
  FOREIGN KEY (workflow_instance_id) REFERENCES runtime_workflows(instance_id) ON DELETE CASCADE
);

CREATE INDEX idx_runtime_connections_workflow ON runtime_connections(workflow_instance_id);
CREATE INDEX idx_runtime_connections_from ON runtime_connections(from_step_oid);

-- environment_bindings: Maps environments to action server URLs
CREATE TABLE environment_bindings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_instance_id TEXT NOT NULL,
  environment_oid TEXT NOT NULL,
  action_server_base_url TEXT NOT NULL,
  connection_status TEXT DEFAULT 'unknown',
  last_health_check TEXT,
  FOREIGN KEY (workflow_instance_id) REFERENCES runtime_workflows(instance_id) ON DELETE CASCADE,
  UNIQUE(workflow_instance_id, environment_oid)
);

-- ============================================================
-- VALUE PROPERTIES TABLES (2)
-- ============================================================

-- environment_value_properties: Environment-scoped, retained across workflows
CREATE TABLE environment_value_properties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  environment_oid TEXT NOT NULL,
  property_name TEXT NOT NULL,
  entries_json TEXT NOT NULL,          -- JSON array of {name, value} entries
  last_modified TEXT NOT NULL,
  UNIQUE(environment_oid, property_name)
);

CREATE INDEX idx_env_props_oid ON environment_value_properties(environment_oid);

-- workflow_value_properties: Workflow-scoped, deleted after completion
CREATE TABLE workflow_value_properties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_instance_id TEXT NOT NULL,
  property_name TEXT NOT NULL,
  entries_json TEXT NOT NULL,
  last_modified TEXT NOT NULL,
  FOREIGN KEY (workflow_instance_id) REFERENCES runtime_workflows(instance_id) ON DELETE CASCADE,
  UNIQUE(workflow_instance_id, property_name)
);

CREATE INDEX idx_wf_props_instance ON workflow_value_properties(workflow_instance_id);

-- ============================================================
-- RESOURCE MANAGEMENT TABLES (3)
-- ============================================================

-- resource_pools: Current state of all resource pools
CREATE TABLE resource_pools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resource_name TEXT NOT NULL,
  scope TEXT NOT NULL CHECK(scope IN ('workflow', 'environment')),
  scope_id TEXT NOT NULL,             -- workflow_instance_id or environment_oid
  resource_type TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 1,
  current_usage INTEGER NOT NULL DEFAULT 0,
  named_instances_json TEXT,          -- For named pool: JSON array of {name, acquired_by}
  UNIQUE(resource_name, scope, scope_id)
);

-- resource_queue: FIFO acquisition queue for resources
CREATE TABLE resource_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resource_pool_id INTEGER NOT NULL,
  step_instance_id TEXT NOT NULL,
  workflow_instance_id TEXT NOT NULL,
  command_type TEXT NOT NULL,
  resource_name TEXT NOT NULL,
  amount INTEGER DEFAULT 1,
  requested_at TEXT NOT NULL,
  FOREIGN KEY (resource_pool_id) REFERENCES resource_pools(id) ON DELETE CASCADE,
  FOREIGN KEY (step_instance_id) REFERENCES runtime_steps(instance_id) ON DELETE CASCADE
);

CREATE INDEX idx_resource_queue_pool ON resource_queue(resource_pool_id);
CREATE INDEX idx_resource_queue_requested ON resource_queue(requested_at);

-- sync_barriers: Tracks pending SYNC resource requests
CREATE TABLE sync_barriers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resource_name TEXT NOT NULL,
  step_instance_id TEXT NOT NULL,
  workflow_instance_id TEXT NOT NULL,
  command_type TEXT NOT NULL CHECK(command_type IN ('Synchronize', 'Send', 'Receive')),
  requested_at TEXT NOT NULL,
  matched_with_step_id TEXT,         -- NULL until partner arrives
  matched_at TEXT,                   -- NULL until matched
  FOREIGN KEY (step_instance_id) REFERENCES runtime_steps(instance_id) ON DELETE CASCADE
);

CREATE INDEX idx_sync_barriers_resource ON sync_barriers(resource_name);
CREATE INDEX idx_sync_barriers_unmatched ON sync_barriers(matched_with_step_id) WHERE matched_with_step_id IS NULL;

-- ============================================================
-- EXECUTION LOGGING TABLES (2)
-- ============================================================

-- execution_log_entries: Append-only log of all execution events
CREATE TABLE execution_log_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_instance_id TEXT NOT NULL,
  step_oid TEXT,                      -- NULL for workflow-level events
  step_instance_id TEXT,
  event_type TEXT NOT NULL,
  event_data_json TEXT NOT NULL,      -- Event-specific JSON data
  timestamp TEXT NOT NULL,
  FOREIGN KEY (workflow_instance_id) REFERENCES runtime_workflows(instance_id)
);

CREATE INDEX idx_log_workflow ON execution_log_entries(workflow_instance_id);
CREATE INDEX idx_log_timestamp ON execution_log_entries(timestamp);
CREATE INDEX idx_log_event_type ON execution_log_entries(event_type);

-- state_transitions: Detailed state transition history per step
CREATE TABLE state_transitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  step_instance_id TEXT NOT NULL,
  workflow_instance_id TEXT NOT NULL,
  from_state TEXT,
  to_state TEXT NOT NULL,
  triggered_by TEXT NOT NULL CHECK(triggered_by IN ('engine', 'user', 'action_server')),
  reason TEXT,
  timestamp TEXT NOT NULL,
  FOREIGN KEY (step_instance_id) REFERENCES runtime_steps(instance_id) ON DELETE CASCADE
);

CREATE INDEX idx_transitions_step ON state_transitions(step_instance_id);
CREATE INDEX idx_transitions_workflow ON state_transitions(workflow_instance_id);

-- ============================================================
-- OFFLINE QUEUE TABLE (1)
-- ============================================================

-- offline_action_queue: Pending action invocations queued while offline
CREATE TABLE offline_action_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  step_instance_id TEXT NOT NULL,
  workflow_instance_id TEXT NOT NULL,
  action_oid TEXT NOT NULL,
  environment_oid TEXT NOT NULL,
  action_server_base_url TEXT NOT NULL,
  request_body_json TEXT NOT NULL,    -- Full invoke request body
  visibility TEXT NOT NULL CHECK(visibility IN ('opaque', 'observable')),
  queued_at TEXT NOT NULL,           -- ISO 8601, when originally queued
  retry_count INTEGER DEFAULT 0,
  last_retry_at TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'replaying', 'completed', 'failed')),
  error_message TEXT,
  FOREIGN KEY (step_instance_id) REFERENCES runtime_steps(instance_id) ON DELETE CASCADE
);

CREATE INDEX idx_offline_queue_status ON offline_action_queue(status);
CREATE INDEX idx_offline_queue_queued ON offline_action_queue(queued_at);

-- ============================================================
-- NOTIFICATION PREFERENCES TABLE (1)
-- ============================================================

CREATE TABLE notification_preferences (
  notification_type TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1  -- Boolean
);

-- Default preferences
INSERT INTO notification_preferences VALUES ('STEP_ATTENTION', 0);
INSERT INTO notification_preferences VALUES ('ACTION_COMPLETED', 1);
INSERT INTO notification_preferences VALUES ('STATE_TRANSITION', 0);
INSERT INTO notification_preferences VALUES ('RESOURCE_ACQUIRED', 0);
INSERT INTO notification_preferences VALUES ('ERROR', 1);
INSERT INTO notification_preferences VALUES ('TIMEOUT', 1);
`;
