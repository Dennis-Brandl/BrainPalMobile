// Package extractor -- unzips .WFmasterX and .WFlibX packages, categorizes files.
// Source: PackageFormatSpec.md Sections 1,4; Research Code Examples

import { unzipSync, strFromU8 } from 'fflate';

import type { ExtractedPackage, ManifestSchema } from './types';
import { PackageValidationError } from './types';
import type { MasterWorkflowSpecification } from '../types/master';
import type { MasterEnvironmentLibrary } from '../types/master';
import type { MasterActionLibrary } from '../types/master';
import { parseManifest, validateFileReferences } from './manifest-parser';

/**
 * MIME type mapping for media files in packages.
 * Source: PackageFormatSpec.md Section 4.2
 */
const MIME_MAP: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  mp4: 'video/mp4',
  webm: 'video/webm',
};

/**
 * Determine MIME type from a filename extension.
 * Returns 'application/octet-stream' for unknown extensions.
 */
export function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  return MIME_MAP[ext ?? ''] ?? 'application/octet-stream';
}

/**
 * Extract and parse a .WFmasterX or .WFlibX ZIP package.
 *
 * Process:
 * 1. Unzip all files using fflate
 * 2. Find and parse manifest.json
 * 3. Validate file references
 * 4. Categorize files by extension:
 *    - .WFmaster -> workflows (JSON parsed)
 *    - .WFenvir  -> environments (JSON parsed)
 *    - .WFaction -> actions (JSON parsed)
 *    - images/*  -> images (raw Uint8Array with MIME type)
 *
 * Handles both flat layout (.WFmasterX) and directory layout (.WFlibX with workflows/ subdirectory).
 * All JSON parsing errors throw PackageValidationError.
 *
 * @param zipData - Raw ZIP file bytes
 * @throws PackageValidationError for missing manifest, corrupt JSON, or missing referenced files
 */
export function extractPackage(zipData: Uint8Array): ExtractedPackage {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(zipData);
  } catch {
    throw new PackageValidationError('Failed to extract ZIP archive: file is corrupt or not a valid ZIP');
  }

  // Find and parse manifest.json
  const manifestData = files['manifest.json'];
  if (!manifestData) {
    throw new PackageValidationError('Missing manifest.json in package');
  }

  let manifest: ManifestSchema;
  try {
    manifest = parseManifest(strFromU8(manifestData));
  } catch (err) {
    if (err instanceof PackageValidationError) throw err;
    throw new PackageValidationError(`Failed to parse manifest.json: ${String(err)}`);
  }

  // Validate that all files referenced in manifest exist in the ZIP
  const availablePaths = Object.keys(files).filter((p) => p !== 'manifest.json');
  validateFileReferences(manifest, availablePaths);

  // Categorize and parse files
  const workflows: ExtractedPackage['workflows'] = [];
  const environments: ExtractedPackage['environments'] = [];
  const actions: ExtractedPackage['actions'] = [];
  const images: ExtractedPackage['images'] = [];

  for (const [path, data] of Object.entries(files)) {
    if (path === 'manifest.json') continue;

    // Skip directory entries (fflate may include zero-length entries for dirs)
    if (data.length === 0 && (path.endsWith('/') || !path.includes('.'))) continue;

    if (path.endsWith('.WFmaster')) {
      const content = parseJsonFile<MasterWorkflowSpecification>(path, data);
      workflows.push({ filename: path, content });
    } else if (path.endsWith('.WFenvir')) {
      const content = parseJsonFile<MasterEnvironmentLibrary>(path, data);
      environments.push({ filename: path, content });
    } else if (path.endsWith('.WFaction')) {
      const content = parseJsonFile<MasterActionLibrary>(path, data);
      actions.push({ filename: path, content });
    } else if (path.startsWith('images/') && data.length > 0) {
      images.push({
        filename: path.replace('images/', ''),
        data,
        mimeType: getMimeType(path),
      });
    }
  }

  return { manifest, workflows, environments, actions, images };
}

/**
 * Parse a JSON file from ZIP data, throwing PackageValidationError on failure.
 */
function parseJsonFile<T>(path: string, data: Uint8Array): T {
  try {
    return JSON.parse(strFromU8(data)) as T;
  } catch {
    throw new PackageValidationError(
      `Failed to parse JSON in file "${path}": file contains invalid JSON`,
    );
  }
}
