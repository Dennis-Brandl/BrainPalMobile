// Package importer -- orchestrates extract -> validate -> store pipeline.
// Source: PackageFormatSpec.md Section 4, Research Architecture Patterns

import type {
  IMasterWorkflowRepository,
  IMasterEnvironmentRepository,
  IMasterActionRepository,
  IImageRepository,
} from '../interfaces/storage';
import type { IExecutionLogger } from '../interfaces/logger';
import type { ImportResult, ExtractedPackage } from './types';
import { PackageValidationError } from './types';
import { extractPackage } from './package-extractor';

/**
 * Orchestrates the full import pipeline for .WFmasterX and .WFlibX packages.
 *
 * Pipeline: extract ZIP -> validate all content -> store to repositories.
 *
 * Key behaviors:
 * - All-or-nothing: validates everything in memory FIRST, then writes to storage.
 *   If validation fails at any point, nothing is written.
 * - Version replacement: importing a newer version of the same workflow OID
 *   deletes the old master spec and all associated data, then saves the new.
 * - Multi-workflow: .WFlibX packages with multiple workflows are fully supported.
 */
export class PackageImporter {
  constructor(
    private readonly workflowRepo: IMasterWorkflowRepository,
    private readonly environmentRepo: IMasterEnvironmentRepository,
    private readonly actionRepo: IMasterActionRepository,
    private readonly imageRepo: IImageRepository,
    private readonly logger: IExecutionLogger,
  ) {}

  /**
   * Import a .WFmasterX or .WFlibX package from raw ZIP bytes.
   *
   * Returns ImportResult with success=true and workflow OIDs on success,
   * or success=false with error message on validation failure.
   * Storage errors are unexpected and propagate as thrown exceptions.
   */
  async importPackage(zipData: Uint8Array): Promise<ImportResult> {
    // Phase 1: Extract and validate (all in memory, no writes)
    let extracted: ExtractedPackage;
    try {
      extracted = extractPackage(zipData);
    } catch (err) {
      if (err instanceof PackageValidationError) {
        return { success: false, workflowOids: [], error: err.message };
      }
      throw err;
    }

    // Collect all workflow OIDs for the result
    const workflowOids = extracted.workflows.map((w) => w.content.oid);

    // Phase 2: Store (all validation passed, safe to write)

    // For each workflow: handle version replacement
    for (const workflow of extracted.workflows) {
      const existingWorkflow = await this.workflowRepo.getByOid(workflow.content.oid);
      if (existingWorkflow) {
        // Version replacement: delete old master data for this OID
        await this.deleteAssociatedData(workflow.content.oid);
        await this.workflowRepo.deleteByOid(workflow.content.oid);
      }
      await this.workflowRepo.save(workflow.content);
    }

    // Store environments
    for (const env of extracted.environments) {
      // Associate with the workflow OID from manifest or the environment's own oid.
      // For runtime packages, the workflowOid is in the manifest.
      // For library packages, we use the first workflow OID or the manifest workflowOid.
      const workflowOid = this.resolveWorkflowOid(extracted, env.content.oid);
      await this.environmentRepo.save(workflowOid, env.content);
    }

    // Store actions
    for (const action of extracted.actions) {
      const envOid = action.content.oid;
      await this.actionRepo.save(envOid, action.content);
    }

    // Store images
    for (const image of extracted.images) {
      const workflowOid = this.resolveWorkflowOidForImages(extracted);
      await this.imageRepo.save(workflowOid, {
        filename: image.filename,
        mime_type: image.mimeType,
        data: image.data,
      });
    }

    // Log the import event
    await this.logger.log({
      workflow_instance_id: '',
      event_type: 'PACKAGE_IMPORTED',
      event_data_json: JSON.stringify({
        packageType: extracted.manifest.packageType,
        workflowOids,
        workflowCount: extracted.workflows.length,
        environmentCount: extracted.environments.length,
        actionCount: extracted.actions.length,
        imageCount: extracted.images.length,
      }),
      timestamp: new Date().toISOString(),
    });

    return { success: true, workflowOids };
  }

  /**
   * Delete a master workflow package and all associated data.
   *
   * This removes the master workflow specification and all environments,
   * actions, and images associated with the given workflow OID.
   * Runtime workflow instances are NOT deleted -- they run from
   * deep-copied data and can continue independently.
   */
  async deletePackage(workflowOid: string): Promise<void> {
    await this.deleteAssociatedData(workflowOid);
    await this.workflowRepo.deleteByOid(workflowOid);
  }

  /**
   * Delete all associated data (environments, actions, images) for a workflow OID.
   */
  private async deleteAssociatedData(workflowOid: string): Promise<void> {
    // Delete environments and their associated actions
    const environments = await this.environmentRepo.getByWorkflowOid(workflowOid);
    for (const env of environments) {
      await this.actionRepo.deleteByEnvironmentOid(env.oid);
    }
    await this.environmentRepo.deleteByWorkflowOid(workflowOid);
    await this.imageRepo.deleteByWorkflowOid(workflowOid);
  }

  /**
   * Resolve which workflow OID to associate an environment with.
   * For runtime packages: use the manifest's workflowOid.
   * For library packages: use the first workflow OID.
   * Fallback: use the environment's own OID as a scope key.
   */
  private resolveWorkflowOid(extracted: ExtractedPackage, _envOid: string): string {
    if (extracted.manifest.workflowOid) {
      return extracted.manifest.workflowOid;
    }
    if (extracted.workflows.length > 0) {
      return extracted.workflows[0].content.oid;
    }
    return _envOid;
  }

  /**
   * Resolve which workflow OID to associate images with.
   */
  private resolveWorkflowOidForImages(extracted: ExtractedPackage): string {
    if (extracted.manifest.workflowOid) {
      return extracted.manifest.workflowOid;
    }
    if (extracted.workflows.length > 0) {
      return extracted.workflows[0].content.oid;
    }
    return 'unknown';
  }
}
