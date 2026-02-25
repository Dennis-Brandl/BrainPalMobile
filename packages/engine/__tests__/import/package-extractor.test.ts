// Package extractor tests -- validates ZIP extraction and file categorization.
// Uses fflate's zipSync and strToU8 to build in-memory ZIP files for testing.

import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { extractPackage, getMimeType } from '../../src/import/package-extractor';
import { PackageValidationError } from '../../src/import/types';
import type { MasterWorkflowSpecification } from '../../src/types/master';
import type { MasterEnvironmentLibrary } from '../../src/types/master';
import type { MasterActionLibrary } from '../../src/types/master';

// ---------------------------------------------------------------------------
// Helpers: build in-memory ZIP packages
// ---------------------------------------------------------------------------

function makeManifest(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    packageVersion: '1.0',
    packageType: 'runtime',
    workflowName: 'Test Workflow',
    workflowOid: 'wf-test-001',
    workflowVersion: '1.0.0',
    schemaVersion: '4.0',
    files: [
      { path: 'Test.WFmaster', type: 'workflow', oid: 'wf-test-001' },
    ],
    ...overrides,
  });
}

function makeWorkflowJson(oid = 'wf-test-001'): MasterWorkflowSpecification {
  return {
    local_id: 'Test Workflow',
    oid,
    version: '1.0.0',
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

function makeEnvironmentJson(oid = 'env-001'): MasterEnvironmentLibrary {
  return {
    local_id: 'Test Environment',
    oid,
    version: '1.0.0',
    last_modified_date: '2026-01-01T00:00:00Z',
    schemaVersion: '4.0',
    description: 'Test environment library',
    specifications: [],
  };
}

function makeActionJson(oid = 'act-001'): MasterActionLibrary {
  return {
    local_id: 'Test Actions',
    oid,
    version: '1.0.0',
    last_modified_date: '2026-01-01T00:00:00Z',
    schemaVersion: '4.0',
    description: 'Test action library',
    specifications: [],
  };
}

function buildZip(files: Record<string, Uint8Array>): Uint8Array {
  return zipSync(files);
}

// ---------------------------------------------------------------------------
// extractPackage
// ---------------------------------------------------------------------------

describe('extractPackage', () => {
  it('extracts a valid .WFmasterX package with single workflow', () => {
    const manifest = makeManifest();
    const workflow = makeWorkflowJson();

    const zip = buildZip({
      'manifest.json': strToU8(manifest),
      'Test.WFmaster': strToU8(JSON.stringify(workflow)),
    });

    const result = extractPackage(zip);

    expect(result.manifest.packageVersion).toBe('1.0');
    expect(result.manifest.packageType).toBe('runtime');
    expect(result.workflows).toHaveLength(1);
    expect(result.workflows[0].filename).toBe('Test.WFmaster');
    expect(result.workflows[0].content.oid).toBe('wf-test-001');
    expect(result.environments).toHaveLength(0);
    expect(result.actions).toHaveLength(0);
    expect(result.images).toHaveLength(0);
  });

  it('extracts package with environment and action files', () => {
    const manifestData = {
      packageVersion: '1.0',
      packageType: 'runtime',
      schemaVersion: '4.0',
      files: [
        { path: 'Test.WFmaster', type: 'workflow', oid: 'wf-test-001' },
        { path: 'environments/Env.WFenvir', type: 'environment', oid: 'env-001' },
        { path: 'actions/Act.WFaction', type: 'action', oid: 'act-001' },
      ],
    };

    const zip = buildZip({
      'manifest.json': strToU8(JSON.stringify(manifestData)),
      'Test.WFmaster': strToU8(JSON.stringify(makeWorkflowJson())),
      'environments/Env.WFenvir': strToU8(JSON.stringify(makeEnvironmentJson())),
      'actions/Act.WFaction': strToU8(JSON.stringify(makeActionJson())),
    });

    const result = extractPackage(zip);

    expect(result.workflows).toHaveLength(1);
    expect(result.environments).toHaveLength(1);
    expect(result.environments[0].filename).toBe('environments/Env.WFenvir');
    expect(result.environments[0].content.oid).toBe('env-001');
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].filename).toBe('actions/Act.WFaction');
    expect(result.actions[0].content.oid).toBe('act-001');
  });

  it('extracts package with images', () => {
    const manifestData = {
      packageVersion: '1.0',
      packageType: 'runtime',
      schemaVersion: '4.0',
      files: [
        { path: 'Test.WFmaster', type: 'workflow', oid: 'wf-test-001' },
        { path: 'images/step1-photo.png', type: 'image' },
        { path: 'images/demo.mp4', type: 'image' },
      ],
    };

    const pngData = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes
    const mp4Data = new Uint8Array([0x00, 0x00, 0x00, 0x18]); // MP4 header

    const zip = buildZip({
      'manifest.json': strToU8(JSON.stringify(manifestData)),
      'Test.WFmaster': strToU8(JSON.stringify(makeWorkflowJson())),
      'images/step1-photo.png': pngData,
      'images/demo.mp4': mp4Data,
    });

    const result = extractPackage(zip);

    expect(result.images).toHaveLength(2);

    const png = result.images.find((img) => img.filename === 'step1-photo.png');
    expect(png).toBeDefined();
    expect(png!.mimeType).toBe('image/png');
    expect(png!.data).toBeInstanceOf(Uint8Array);

    const mp4 = result.images.find((img) => img.filename === 'demo.mp4');
    expect(mp4).toBeDefined();
    expect(mp4!.mimeType).toBe('video/mp4');
  });

  it('throws when manifest.json is missing', () => {
    const zip = buildZip({
      'Test.WFmaster': strToU8(JSON.stringify(makeWorkflowJson())),
    });

    expect(() => extractPackage(zip)).toThrow(PackageValidationError);
    expect(() => extractPackage(zip)).toThrow('Missing manifest.json');
  });

  it('throws when a workflow file contains corrupt JSON', () => {
    const manifest = makeManifest();

    const zip = buildZip({
      'manifest.json': strToU8(manifest),
      'Test.WFmaster': strToU8('{ corrupt json!!!'),
    });

    expect(() => extractPackage(zip)).toThrow(PackageValidationError);
    expect(() => extractPackage(zip)).toThrow('invalid JSON');
  });

  it('throws when manifest references a file not in ZIP', () => {
    const manifestData = {
      packageVersion: '1.0',
      packageType: 'runtime',
      schemaVersion: '4.0',
      files: [
        { path: 'Test.WFmaster', type: 'workflow', oid: 'wf-test-001' },
        { path: 'environments/Missing.WFenvir', type: 'environment', oid: 'env-001' },
      ],
    };

    const zip = buildZip({
      'manifest.json': strToU8(JSON.stringify(manifestData)),
      'Test.WFmaster': strToU8(JSON.stringify(makeWorkflowJson())),
    });

    expect(() => extractPackage(zip)).toThrow(PackageValidationError);
    expect(() => extractPackage(zip)).toThrow('Missing.WFenvir');
  });

  it('extracts .WFlibX layout with workflows/ subdirectory', () => {
    const manifestData = {
      packageVersion: '1.0',
      packageType: 'library',
      schemaVersion: '4.0',
      files: [
        { path: 'workflows/Recipe1.WFmaster', type: 'workflow', oid: 'wf-001' },
        { path: 'workflows/Recipe2.WFmaster', type: 'workflow', oid: 'wf-002' },
        { path: 'environments/KitchenEnv.WFenvir', type: 'environment', oid: 'env-001' },
      ],
    };

    const zip = buildZip({
      'manifest.json': strToU8(JSON.stringify(manifestData)),
      'workflows/Recipe1.WFmaster': strToU8(JSON.stringify(makeWorkflowJson('wf-001'))),
      'workflows/Recipe2.WFmaster': strToU8(JSON.stringify(makeWorkflowJson('wf-002'))),
      'environments/KitchenEnv.WFenvir': strToU8(JSON.stringify(makeEnvironmentJson())),
    });

    const result = extractPackage(zip);

    expect(result.manifest.packageType).toBe('library');
    expect(result.workflows).toHaveLength(2);
    expect(result.workflows[0].content.oid).toBe('wf-001');
    expect(result.workflows[1].content.oid).toBe('wf-002');
    expect(result.environments).toHaveLength(1);
  });

  it('throws on corrupt ZIP data', () => {
    const corruptData = new Uint8Array([0x00, 0x01, 0x02, 0x03]);

    expect(() => extractPackage(corruptData)).toThrow(PackageValidationError);
    expect(() => extractPackage(corruptData)).toThrow('corrupt');
  });

  it('throws when manifest has wrong schema version', () => {
    const manifestData = {
      packageVersion: '1.0',
      packageType: 'runtime',
      schemaVersion: '3.0',
      files: [{ path: 'Test.WFmaster', type: 'workflow', oid: 'wf-001' }],
    };

    const zip = buildZip({
      'manifest.json': strToU8(JSON.stringify(manifestData)),
      'Test.WFmaster': strToU8(JSON.stringify(makeWorkflowJson())),
    });

    expect(() => extractPackage(zip)).toThrow(PackageValidationError);
    expect(() => extractPackage(zip)).toThrow('Unsupported schema version');
  });
});

// ---------------------------------------------------------------------------
// getMimeType
// ---------------------------------------------------------------------------

describe('getMimeType', () => {
  it('returns correct MIME type for known extensions', () => {
    expect(getMimeType('photo.png')).toBe('image/png');
    expect(getMimeType('photo.jpg')).toBe('image/jpeg');
    expect(getMimeType('photo.jpeg')).toBe('image/jpeg');
    expect(getMimeType('anim.gif')).toBe('image/gif');
    expect(getMimeType('photo.webp')).toBe('image/webp');
    expect(getMimeType('icon.svg')).toBe('image/svg+xml');
    expect(getMimeType('bitmap.bmp')).toBe('image/bmp');
    expect(getMimeType('favicon.ico')).toBe('image/x-icon');
    expect(getMimeType('video.mp4')).toBe('video/mp4');
    expect(getMimeType('video.webm')).toBe('video/webm');
  });

  it('returns application/octet-stream for unknown extension', () => {
    expect(getMimeType('file.xyz')).toBe('application/octet-stream');
    expect(getMimeType('noextension')).toBe('application/octet-stream');
  });

  it('handles uppercase extensions via lowercase conversion', () => {
    expect(getMimeType('photo.PNG')).toBe('image/png');
    expect(getMimeType('video.MP4')).toBe('video/mp4');
  });

  it('handles paths with directories', () => {
    expect(getMimeType('images/step1-photo.png')).toBe('image/png');
    expect(getMimeType('deep/path/to/video.webm')).toBe('video/webm');
  });
});
