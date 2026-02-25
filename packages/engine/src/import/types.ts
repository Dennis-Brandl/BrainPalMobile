// Import pipeline types -- manifest schema, extracted package, import result.
// Source: PackageFormatSpec.md Sections 1-2, Research Code Examples

import type {
  MasterWorkflowSpecification,
  MasterEnvironmentLibrary,
  MasterActionLibrary,
} from '../types/master';

// ---------------------------------------------------------------------------
// Manifest Schema
// ---------------------------------------------------------------------------

/**
 * Describes a single file entry in the package manifest.
 */
export interface ManifestFileEntry {
  path: string;
  type: 'workflow' | 'environment' | 'action' | 'image';
  oid?: string;
}

/**
 * The manifest.json schema found inside .WFmasterX and .WFlibX packages.
 */
export interface ManifestSchema {
  packageVersion: string;
  packageType: 'runtime' | 'library';
  workflowName?: string;
  workflowOid?: string;
  workflowVersion?: string;
  schemaVersion: string;
  createdAt?: string;
  createdBy?: string;
  files: ManifestFileEntry[];
}

// ---------------------------------------------------------------------------
// Extracted Package
// ---------------------------------------------------------------------------

/**
 * The fully extracted and parsed contents of a .WFmasterX or .WFlibX package.
 */
export interface ExtractedPackage {
  manifest: ManifestSchema;
  workflows: Array<{ filename: string; content: MasterWorkflowSpecification }>;
  environments: Array<{ filename: string; content: MasterEnvironmentLibrary }>;
  actions: Array<{ filename: string; content: MasterActionLibrary }>;
  images: Array<{ filename: string; data: Uint8Array; mimeType: string }>;
}

// ---------------------------------------------------------------------------
// Import Result
// ---------------------------------------------------------------------------

/**
 * Result of a package import operation.
 */
export interface ImportResult {
  success: boolean;
  workflowOids: string[];
  error?: string;
}

// ---------------------------------------------------------------------------
// PackageValidationError
// ---------------------------------------------------------------------------

/**
 * Thrown when a package fails validation at any stage of the import pipeline.
 * All validation failures use this error type for consistent handling.
 */
export class PackageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PackageValidationError';
  }
}
