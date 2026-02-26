// Manifest parser tests -- validates manifest.json parsing and validation.

import { describe, it, expect } from 'vitest';
import { parseManifest, validateFileReferences } from '../../src/import/manifest-parser';
import { PackageValidationError } from '../../src/import/types';

// ---------------------------------------------------------------------------
// Helper: valid manifest JSON
// ---------------------------------------------------------------------------

function validManifestJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    packageVersion: '1.0',
    packageType: 'runtime',
    workflowName: 'Test Workflow',
    workflowOid: 'wf-test-001',
    workflowVersion: '1.0.0',
    schemaVersion: '4.0',
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'BrainPal MD v3.0',
    files: [
      { path: 'Test.WFmaster', type: 'workflow', oid: 'wf-test-001' },
      { path: 'environments/Env.WFenvir', type: 'environment', oid: 'env-001' },
      { path: 'actions/Act.WFaction', type: 'action', oid: 'act-001' },
    ],
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// parseManifest
// ---------------------------------------------------------------------------

describe('parseManifest', () => {
  it('parses a valid manifest without error', () => {
    const result = parseManifest(validManifestJson());

    expect(result.packageVersion).toBe('1.0');
    expect(result.packageType).toBe('runtime');
    expect(result.schemaVersion).toBe('4.0');
    expect(result.workflowName).toBe('Test Workflow');
    expect(result.files).toHaveLength(3);
    expect(result.files[0].path).toBe('Test.WFmaster');
    expect(result.files[0].type).toBe('workflow');
  });

  it('parses a library manifest', () => {
    const result = parseManifest(validManifestJson({ packageType: 'library' }));
    expect(result.packageType).toBe('library');
  });

  it('throws on invalid JSON', () => {
    expect(() => parseManifest('not json {')).toThrow(PackageValidationError);
    expect(() => parseManifest('not json {')).toThrow('not valid JSON');
  });

  it('throws on non-object JSON', () => {
    expect(() => parseManifest('"string"')).toThrow(PackageValidationError);
    expect(() => parseManifest('[1,2,3]')).toThrow(PackageValidationError);
  });

  it('throws when packageVersion is missing', () => {
    const json = validManifestJson({ packageVersion: undefined });
    // Remove packageVersion from the JSON
    const obj = JSON.parse(json);
    delete obj.packageVersion;
    expect(() => parseManifest(JSON.stringify(obj))).toThrow(PackageValidationError);
    expect(() => parseManifest(JSON.stringify(obj))).toThrow('packageVersion');
  });

  it('throws when packageVersion is empty string', () => {
    expect(() => parseManifest(validManifestJson({ packageVersion: '' }))).toThrow(
      PackageValidationError,
    );
  });

  it('throws when packageType is invalid', () => {
    expect(() => parseManifest(validManifestJson({ packageType: 'invalid' }))).toThrow(
      PackageValidationError,
    );
    expect(() => parseManifest(validManifestJson({ packageType: 'invalid' }))).toThrow(
      'packageType',
    );
  });

  it('defaults schemaVersion to 4.0 when missing', () => {
    const obj = JSON.parse(validManifestJson());
    delete obj.schemaVersion;
    const result = parseManifest(JSON.stringify(obj));
    expect(result.schemaVersion).toBe('4.0');
  });

  it('defaults packageType to library when missing', () => {
    const obj = JSON.parse(validManifestJson());
    delete obj.packageType;
    const result = parseManifest(JSON.stringify(obj));
    expect(result.packageType).toBe('library');
  });

  it('throws when schemaVersion is wrong (e.g., "3.0")', () => {
    expect(() => parseManifest(validManifestJson({ schemaVersion: '3.0' }))).toThrow(
      PackageValidationError,
    );
    expect(() => parseManifest(validManifestJson({ schemaVersion: '3.0' }))).toThrow(
      'Unsupported schema version "3.0"',
    );
  });

  it('throws when schemaVersion is "5.0"', () => {
    expect(() => parseManifest(validManifestJson({ schemaVersion: '5.0' }))).toThrow(
      PackageValidationError,
    );
  });

  it('throws when files array is missing', () => {
    const obj = JSON.parse(validManifestJson());
    delete obj.files;
    expect(() => parseManifest(JSON.stringify(obj))).toThrow(PackageValidationError);
    expect(() => parseManifest(JSON.stringify(obj))).toThrow('files');
  });

  it('throws when files is not an array', () => {
    expect(() => parseManifest(validManifestJson({ files: 'not-array' }))).toThrow(
      PackageValidationError,
    );
  });

  it('throws when a file entry is missing path', () => {
    const files = [{ type: 'workflow', oid: 'wf-001' }];
    expect(() => parseManifest(validManifestJson({ files }))).toThrow(PackageValidationError);
    expect(() => parseManifest(validManifestJson({ files }))).toThrow('path');
  });

  it('throws when a file entry has invalid type', () => {
    const files = [{ path: 'Test.WFmaster', type: 'unknown', oid: 'wf-001' }];
    expect(() => parseManifest(validManifestJson({ files }))).toThrow(PackageValidationError);
    expect(() => parseManifest(validManifestJson({ files }))).toThrow('type');
  });

  it('accepts image type in file entry', () => {
    const files = [{ path: 'images/photo.png', type: 'image' }];
    const result = parseManifest(validManifestJson({ files }));
    expect(result.files[0].type).toBe('image');
  });

  it('preserves optional fields when present', () => {
    const result = parseManifest(validManifestJson());
    expect(result.createdAt).toBe('2026-01-01T00:00:00Z');
    expect(result.createdBy).toBe('BrainPal MD v3.0');
    expect(result.workflowOid).toBe('wf-test-001');
    expect(result.workflowVersion).toBe('1.0.0');
  });
});

// ---------------------------------------------------------------------------
// validateFileReferences
// ---------------------------------------------------------------------------

describe('validateFileReferences', () => {
  it('passes when all referenced files exist', () => {
    const manifest = parseManifest(validManifestJson());
    const availableFiles = [
      'Test.WFmaster',
      'environments/Env.WFenvir',
      'actions/Act.WFaction',
    ];

    // Should not throw
    expect(() => validateFileReferences(manifest, availableFiles)).not.toThrow();
  });

  it('passes when extra files exist beyond what manifest references', () => {
    const manifest = parseManifest(validManifestJson());
    const availableFiles = [
      'Test.WFmaster',
      'environments/Env.WFenvir',
      'actions/Act.WFaction',
      'images/extra.png',
      'README.txt',
    ];

    expect(() => validateFileReferences(manifest, availableFiles)).not.toThrow();
  });

  it('throws when a referenced file is missing', () => {
    const manifest = parseManifest(validManifestJson());
    const availableFiles = ['Test.WFmaster', 'environments/Env.WFenvir'];
    // Missing: actions/Act.WFaction

    expect(() => validateFileReferences(manifest, availableFiles)).toThrow(
      PackageValidationError,
    );
    expect(() => validateFileReferences(manifest, availableFiles)).toThrow(
      'actions/Act.WFaction',
    );
  });

  it('throws with descriptive message for missing file', () => {
    const manifest = parseManifest(validManifestJson());
    const availableFiles: string[] = [];

    expect(() => validateFileReferences(manifest, availableFiles)).toThrow(
      'not present in the package',
    );
  });
});
