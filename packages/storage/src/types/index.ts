/**
 * TypeScript interfaces matching the database tables that Phase 1 actively uses.
 * Additional table row types will be added in later phases as needed.
 */

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

export interface EnvironmentValuePropertyRow {
  id: number;
  environment_oid: string;
  property_name: string;
  entries_json: string;
  last_modified: string;
}
