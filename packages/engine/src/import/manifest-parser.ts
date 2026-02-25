// Manifest parser -- validates manifest.json from workflow packages.
// Source: PackageFormatSpec.md Section 2, Research Code Examples

import type { ManifestSchema } from './types';
import { PackageValidationError } from './types';

/**
 * Supported schema version. Only packages with this schema version are accepted.
 */
const SUPPORTED_SCHEMA_VERSION = '4.0';

/**
 * Parse and validate a manifest.json string from a workflow package.
 *
 * Validates:
 * - JSON is parseable
 * - Required fields exist (packageVersion, packageType, schemaVersion, files)
 * - schemaVersion matches supported version (4.0)
 * - files is a non-empty array
 * - Each file entry has required fields (path, type)
 *
 * @throws PackageValidationError for any validation failure
 */
export function parseManifest(jsonString: string): ManifestSchema {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    throw new PackageValidationError('Manifest is not valid JSON');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new PackageValidationError('Manifest must be a JSON object');
  }

  const obj = parsed as Record<string, unknown>;

  // Required: packageVersion
  if (typeof obj.packageVersion !== 'string' || obj.packageVersion.length === 0) {
    throw new PackageValidationError('Manifest missing required field: packageVersion');
  }

  // Required: packageType
  if (obj.packageType !== 'runtime' && obj.packageType !== 'library') {
    throw new PackageValidationError(
      'Manifest field packageType must be "runtime" or "library"',
    );
  }

  // Required: schemaVersion
  if (typeof obj.schemaVersion !== 'string' || obj.schemaVersion.length === 0) {
    throw new PackageValidationError('Manifest missing required field: schemaVersion');
  }

  if (obj.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    throw new PackageValidationError(
      `Unsupported schema version "${obj.schemaVersion}". Only "${SUPPORTED_SCHEMA_VERSION}" is supported`,
    );
  }

  // Required: files array
  if (!Array.isArray(obj.files)) {
    throw new PackageValidationError('Manifest missing required field: files (must be an array)');
  }

  // Validate each file entry
  for (let i = 0; i < obj.files.length; i++) {
    const entry = obj.files[i] as Record<string, unknown>;
    if (typeof entry !== 'object' || entry === null) {
      throw new PackageValidationError(`Manifest files[${i}] must be an object`);
    }
    if (typeof entry.path !== 'string' || entry.path.length === 0) {
      throw new PackageValidationError(`Manifest files[${i}] missing required field: path`);
    }
    if (
      entry.type !== 'workflow' &&
      entry.type !== 'environment' &&
      entry.type !== 'action' &&
      entry.type !== 'image'
    ) {
      throw new PackageValidationError(
        `Manifest files[${i}] field type must be "workflow", "environment", "action", or "image"`,
      );
    }
  }

  return obj as unknown as ManifestSchema;
}

/**
 * Validate that every file path listed in the manifest exists in the available files.
 *
 * @param manifest - The parsed manifest schema
 * @param availableFiles - List of file paths present in the ZIP archive
 * @throws PackageValidationError if any referenced file is missing
 */
export function validateFileReferences(
  manifest: ManifestSchema,
  availableFiles: string[],
): void {
  const fileSet = new Set(availableFiles);
  for (const entry of manifest.files) {
    if (!fileSet.has(entry.path)) {
      throw new PackageValidationError(
        `Manifest references file "${entry.path}" which is not present in the package`,
      );
    }
  }
}
