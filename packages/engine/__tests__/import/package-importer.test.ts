// Package importer tests -- validates the full import pipeline:
// extract -> validate -> store, version replacement, multi-workflow, error handling.

import { describe, it, expect, beforeEach } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { PackageImporter } from '../../src/import/package-importer';
import {
  InMemoryMasterWorkflowRepository,
  InMemoryMasterEnvironmentRepository,
  InMemoryMasterActionRepository,
  InMemoryImageRepository,
} from '../helpers/mock-repositories';
import type { MasterWorkflowSpecification } from '../../src/types/master';
import type { MasterEnvironmentLibrary } from '../../src/types/master';
import type { MasterActionLibrary } from '../../src/types/master';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWorkflow(oid: string, version = '1.0.0'): MasterWorkflowSpecification {
  return {
    local_id: `Workflow ${oid}`,
    oid,
    version,
    last_modified_date: '2026-01-01T00:00:00Z',
    schemaVersion: '4.0',
    steps: [],
    connections: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    starting_parameter_specifications: [],
    output_parameter_specifications: [],
    value_property_specifications: [],
    resource_property_specifications: [],
    environment_specifications: [],
    child_workflows: [],
  };
}

function makeEnvironment(oid: string): MasterEnvironmentLibrary {
  return {
    local_id: `Environment ${oid}`,
    oid,
    version: '1.0.0',
    last_modified_date: '2026-01-01T00:00:00Z',
    schemaVersion: '4.0',
    specifications: [],
  };
}

function makeAction(oid: string): MasterActionLibrary {
  return {
    local_id: `Actions ${oid}`,
    oid,
    version: '1.0.0',
    last_modified_date: '2026-01-01T00:00:00Z',
    schemaVersion: '4.0',
    specifications: [],
  };
}

function buildRuntimePackageZip(options: {
  workflowOid?: string;
  workflowVersion?: string;
  includeEnv?: boolean;
  includeAction?: boolean;
  includeImages?: boolean;
  envOid?: string;
  actionOid?: string;
}): Uint8Array {
  const wfOid = options.workflowOid ?? 'wf-001';
  const wfVersion = options.workflowVersion ?? '1.0.0';
  const envOid = options.envOid ?? 'env-001';
  const actionOid = options.actionOid ?? 'act-001';

  const files: Record<string, Uint8Array> = {};

  // Build manifest
  const manifestFiles: Array<Record<string, string>> = [
    { path: 'Workflow.WFmaster', type: 'workflow', oid: wfOid },
  ];

  if (options.includeEnv) {
    manifestFiles.push({ path: 'environments/Env.WFenvir', type: 'environment', oid: envOid });
  }
  if (options.includeAction) {
    manifestFiles.push({ path: 'actions/Act.WFaction', type: 'action', oid: actionOid });
  }
  if (options.includeImages) {
    manifestFiles.push({ path: 'images/step1-photo.png', type: 'image' });
  }

  files['manifest.json'] = strToU8(
    JSON.stringify({
      packageVersion: '1.0',
      packageType: 'runtime',
      workflowOid: wfOid,
      workflowVersion: wfVersion,
      schemaVersion: '4.0',
      files: manifestFiles,
    }),
  );

  files['Workflow.WFmaster'] = strToU8(JSON.stringify(makeWorkflow(wfOid, wfVersion)));

  if (options.includeEnv) {
    files['environments/Env.WFenvir'] = strToU8(JSON.stringify(makeEnvironment(envOid)));
  }
  if (options.includeAction) {
    files['actions/Act.WFaction'] = strToU8(JSON.stringify(makeAction(actionOid)));
  }
  if (options.includeImages) {
    files['images/step1-photo.png'] = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  }

  return zipSync(files);
}

function buildLibraryPackageZip(workflowOids: string[]): Uint8Array {
  const files: Record<string, Uint8Array> = {};

  const manifestFiles = workflowOids.map((oid) => ({
    path: `workflows/${oid}.WFmaster`,
    type: 'workflow',
    oid,
  }));

  files['manifest.json'] = strToU8(
    JSON.stringify({
      packageVersion: '1.0',
      packageType: 'library',
      schemaVersion: '4.0',
      files: manifestFiles,
    }),
  );

  for (const oid of workflowOids) {
    files[`workflows/${oid}.WFmaster`] = strToU8(JSON.stringify(makeWorkflow(oid)));
  }

  return zipSync(files);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PackageImporter', () => {
  let workflowRepo: InMemoryMasterWorkflowRepository;
  let environmentRepo: InMemoryMasterEnvironmentRepository;
  let actionRepo: InMemoryMasterActionRepository;
  let imageRepo: InMemoryImageRepository;
  let importer: PackageImporter;

  beforeEach(() => {
    workflowRepo = new InMemoryMasterWorkflowRepository();
    environmentRepo = new InMemoryMasterEnvironmentRepository();
    actionRepo = new InMemoryMasterActionRepository();
    imageRepo = new InMemoryImageRepository();
    importer = new PackageImporter(workflowRepo, environmentRepo, actionRepo, imageRepo);
  });

  // -------------------------------------------------------------------------
  // Basic import
  // -------------------------------------------------------------------------

  it('imports a single workflow package', async () => {
    const zip = buildRuntimePackageZip({
      workflowOid: 'wf-001',
      includeEnv: true,
      includeAction: true,
    });

    const result = await importer.importPackage(zip);

    expect(result.success).toBe(true);
    expect(result.workflowOids).toEqual(['wf-001']);

    const workflow = await workflowRepo.getByOid('wf-001');
    expect(workflow).not.toBeNull();
    expect(workflow!.oid).toBe('wf-001');

    const environments = await environmentRepo.getByWorkflowOid('wf-001');
    expect(environments).toHaveLength(1);
    expect(environments[0].oid).toBe('env-001');

    // Actions are saved by their own OID as key
    const actions = await actionRepo.getByEnvironmentOid('act-001');
    expect(actions).toHaveLength(1);
  });

  it('returns workflowOids on successful import', async () => {
    const zip = buildRuntimePackageZip({ workflowOid: 'wf-001' });

    const result = await importer.importPackage(zip);

    expect(result.success).toBe(true);
    expect(result.workflowOids).toEqual(['wf-001']);
  });

  // -------------------------------------------------------------------------
  // Version replacement
  // -------------------------------------------------------------------------

  it('replaces old version when importing same OID twice', async () => {
    // Import version 1
    const zipV1 = buildRuntimePackageZip({
      workflowOid: 'wf-001',
      workflowVersion: '1.0.0',
      includeEnv: true,
      includeImages: true,
    });
    const result1 = await importer.importPackage(zipV1);
    expect(result1.success).toBe(true);

    // Verify v1 stored
    let workflow = await workflowRepo.getByOid('wf-001');
    expect(workflow!.version).toBe('1.0.0');

    const envsV1 = await environmentRepo.getByWorkflowOid('wf-001');
    expect(envsV1).toHaveLength(1);

    const imagesV1 = await imageRepo.getByWorkflowOid('wf-001');
    expect(imagesV1).toHaveLength(1);

    // Import version 2 (same OID)
    const zipV2 = buildRuntimePackageZip({
      workflowOid: 'wf-001',
      workflowVersion: '2.0.0',
      includeEnv: true,
      includeImages: true,
    });
    const result2 = await importer.importPackage(zipV2);
    expect(result2.success).toBe(true);

    // Verify v2 replaced v1
    workflow = await workflowRepo.getByOid('wf-001');
    expect(workflow!.version).toBe('2.0.0');

    // Old data was cleaned, new data stored
    const envsV2 = await environmentRepo.getByWorkflowOid('wf-001');
    expect(envsV2).toHaveLength(1);

    const imagesV2 = await imageRepo.getByWorkflowOid('wf-001');
    expect(imagesV2).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // Images
  // -------------------------------------------------------------------------

  it('stores images in IImageRepository', async () => {
    const zip = buildRuntimePackageZip({
      workflowOid: 'wf-001',
      includeImages: true,
    });

    await importer.importPackage(zip);

    const images = await imageRepo.getByWorkflowOid('wf-001');
    expect(images).toHaveLength(1);
    expect(images[0].filename).toBe('step1-photo.png');
    expect(images[0].mime_type).toBe('image/png');
    expect(images[0].data).toBeInstanceOf(Uint8Array);
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  it('returns failure for corrupt ZIP', async () => {
    const corruptData = new Uint8Array([0x00, 0x01, 0x02, 0x03]);

    const result = await importer.importPackage(corruptData);

    expect(result.success).toBe(false);
    expect(result.workflowOids).toEqual([]);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('corrupt');
  });

  it('returns failure for wrong schema version', async () => {
    const files: Record<string, Uint8Array> = {
      'manifest.json': strToU8(
        JSON.stringify({
          packageVersion: '1.0',
          packageType: 'runtime',
          schemaVersion: '3.0',
          files: [{ path: 'Test.WFmaster', type: 'workflow', oid: 'wf-001' }],
        }),
      ),
      'Test.WFmaster': strToU8(JSON.stringify(makeWorkflow('wf-001'))),
    };
    const zip = zipSync(files);

    const result = await importer.importPackage(zip);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Unsupported schema version');
  });

  // -------------------------------------------------------------------------
  // Multi-workflow (.WFlibX)
  // -------------------------------------------------------------------------

  it('imports .WFlibX multi-workflow library package', async () => {
    const zip = buildLibraryPackageZip(['wf-001', 'wf-002', 'wf-003']);

    const result = await importer.importPackage(zip);

    expect(result.success).toBe(true);
    expect(result.workflowOids).toEqual(['wf-001', 'wf-002', 'wf-003']);

    const wf1 = await workflowRepo.getByOid('wf-001');
    const wf2 = await workflowRepo.getByOid('wf-002');
    const wf3 = await workflowRepo.getByOid('wf-003');
    expect(wf1).not.toBeNull();
    expect(wf2).not.toBeNull();
    expect(wf3).not.toBeNull();

    const allWorkflows = await workflowRepo.getAll();
    expect(allWorkflows).toHaveLength(3);
  });

  // -------------------------------------------------------------------------
  // deletePackage
  // -------------------------------------------------------------------------

  it('deletes master workflow and associated data', async () => {
    const zip = buildRuntimePackageZip({
      workflowOid: 'wf-001',
      includeEnv: true,
      includeAction: true,
      includeImages: true,
    });

    await importer.importPackage(zip);

    // Verify data exists
    expect(await workflowRepo.getByOid('wf-001')).not.toBeNull();
    expect(await environmentRepo.getByWorkflowOid('wf-001')).toHaveLength(1);
    expect(await imageRepo.getByWorkflowOid('wf-001')).toHaveLength(1);

    // Delete
    await importer.deletePackage('wf-001');

    // Verify all data removed
    expect(await workflowRepo.getByOid('wf-001')).toBeNull();
    expect(await environmentRepo.getByWorkflowOid('wf-001')).toHaveLength(0);
    expect(await imageRepo.getByWorkflowOid('wf-001')).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // All-or-nothing validation
  // -------------------------------------------------------------------------

  it('stores nothing when one workflow in a library has invalid JSON', async () => {
    // Build a library package where the second workflow has invalid JSON
    const files: Record<string, Uint8Array> = {
      'manifest.json': strToU8(
        JSON.stringify({
          packageVersion: '1.0',
          packageType: 'library',
          schemaVersion: '4.0',
          files: [
            { path: 'workflows/Good.WFmaster', type: 'workflow', oid: 'wf-good' },
            { path: 'workflows/Bad.WFmaster', type: 'workflow', oid: 'wf-bad' },
          ],
        }),
      ),
      'workflows/Good.WFmaster': strToU8(JSON.stringify(makeWorkflow('wf-good'))),
      'workflows/Bad.WFmaster': strToU8('{ corrupt json!!!'),
    };
    const zip = zipSync(files);

    const result = await importer.importPackage(zip);

    // The extraction phase throws PackageValidationError for bad JSON,
    // which means nothing gets stored
    expect(result.success).toBe(false);
    expect(result.error).toContain('invalid JSON');

    // Verify NOTHING was stored
    const allWorkflows = await workflowRepo.getAll();
    expect(allWorkflows).toHaveLength(0);
  });

  it('stores nothing when manifest has missing file reference', async () => {
    const files: Record<string, Uint8Array> = {
      'manifest.json': strToU8(
        JSON.stringify({
          packageVersion: '1.0',
          packageType: 'runtime',
          schemaVersion: '4.0',
          files: [
            { path: 'Workflow.WFmaster', type: 'workflow', oid: 'wf-001' },
            { path: 'environments/Missing.WFenvir', type: 'environment', oid: 'env-001' },
          ],
        }),
      ),
      'Workflow.WFmaster': strToU8(JSON.stringify(makeWorkflow('wf-001'))),
    };
    const zip = zipSync(files);

    const result = await importer.importPackage(zip);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Missing.WFenvir');

    const allWorkflows = await workflowRepo.getAll();
    expect(allWorkflows).toHaveLength(0);
  });
});
