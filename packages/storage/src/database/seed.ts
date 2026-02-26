/**
 * Dev seed SQL for BrainPal Mobile.
 *
 * Inserts sample master data for development testing:
 * - One master workflow with a START -> END specification
 * - One master environment bound to the workflow
 * - One environment value property with a sample entry
 */
export const SEED_SQL = `
-- Sample master workflow: START -> END
INSERT INTO master_workflows (
  oid, local_id, version, description, schema_version,
  last_modified_date, specification_json, downloaded_at, package_file_name
) VALUES (
  'seed-workflow-001',
  'Sample Workflow',
  '1.0.0',
  'A sample workflow for development testing',
  '4.0',
  '2026-02-24T00:00:00Z',
  '${JSON.stringify({
    oid: 'seed-workflow-001',
    local_id: 'Sample Workflow',
    version: '1.0.0',
    last_modified_date: '2026-02-24T00:00:00Z',
    description: 'A sample workflow for development testing',
    schemaVersion: '4.0',
    steps: [
      {
        oid: 'step-start-001',
        local_id: 'Start',
        version: '1.0.0',
        last_modified_date: '2026-02-24T00:00:00Z',
        schemaVersion: '4.0',
        step_type: 'START',
        position: { x: 100, y: 100 },
        input_parameter_specifications: [],
        output_parameter_specifications: [],
        value_property_specifications: [],
        resource_command_specifications: [],
      },
      {
        oid: 'step-end-001',
        local_id: 'End',
        version: '1.0.0',
        last_modified_date: '2026-02-24T00:00:00Z',
        schemaVersion: '4.0',
        step_type: 'END',
        position: { x: 100, y: 300 },
        input_parameter_specifications: [],
        output_parameter_specifications: [],
        value_property_specifications: [],
        resource_command_specifications: [],
      },
    ],
    connections: [
      {
        from_step_id: 'step-start-001',
        to_step_id: 'step-end-001',
        connection_id: 'conn-001',
      },
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
    starting_parameter_specifications: [],
    output_parameter_specifications: [],
    value_property_specifications: [],
    resource_property_specifications: [],
    environment_specifications: [],
    child_workflows: [],
  }).replace(/'/g, "''")}',
  '2026-02-24T00:00:00Z',
  'sample-workflow.WFmasterX'
);

-- Sample master environment bound to the workflow
INSERT INTO master_environments (
  oid, local_id, version, specification_json, workflow_oid
) VALUES (
  'seed-env-001',
  'Default Environment',
  '1.0.0',
  '${JSON.stringify({
    oid: 'seed-env-001',
    localId: 'Default Environment',
    version: '1.0.0',
    valueProperties: [
      {
        name: 'TestProperty',
        entries: [{ name: 'SampleEntry', value: 'Hello from seed data' }],
      },
    ],
  }).replace(/'/g, "''")}',
  'seed-workflow-001'
);

-- Sample environment value property
INSERT INTO environment_value_properties (
  environment_oid, property_name, entries_json, last_modified
) VALUES (
  'seed-env-001',
  'TestProperty',
  '${JSON.stringify([
    { name: 'SampleEntry', value: 'Hello from seed data' },
  ]).replace(/'/g, "''")}',
  '2026-02-24T00:00:00Z'
);
`;
