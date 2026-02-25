// Scope resolver: walks the scope chain workflow -> parent chain -> environment
// to look up Value Properties. See ExecutionEngineSpec.md Section 6.1 and
// Research Pitfall 5 for why scope order is critical.

import type { IValuePropertyRepository } from '../interfaces/storage';
import type { IWorkflowRepository } from '../interfaces/storage';

/**
 * Resolves property values by traversing the scope chain:
 * 1. Current workflow scope
 * 2. Parent workflow chain (if workflow is nested)
 * 3. Environment scope
 *
 * Returns the first non-null value found, or null if not found at any scope.
 */
export class ScopeResolver {
  constructor(
    private readonly valuePropertyRepo: IValuePropertyRepository,
    private readonly workflowRepo: IWorkflowRepository,
  ) {}

  /**
   * Look up a property entry value by traversing the scope chain.
   *
   * @param workflowInstanceId - The current workflow instance to start from
   * @param propertyName - The Value Property name (e.g. "GarlicResponse")
   * @param entryName - The entry name within the property (e.g. "Value")
   * @param environmentId - Optional environment OID for environment scope lookup
   * @returns The resolved value, or null if not found at any scope
   */
  async lookupProperty(
    workflowInstanceId: string,
    propertyName: string,
    entryName: string,
    environmentId?: string,
  ): Promise<string | null> {
    // Step 1: Look in current workflow scope
    const workflowProp = await this.valuePropertyRepo.getWorkflowProperty(
      workflowInstanceId,
      propertyName,
    );
    if (workflowProp) {
      const entry = workflowProp.entries.find((e) => e.name === entryName);
      if (entry !== undefined) {
        return entry.value;
      }
    }

    // Step 2: Traverse parent workflow chain
    const workflow = await this.workflowRepo.getById(workflowInstanceId);
    if (workflow?.parent_workflow_instance_id) {
      const parentResult = await this.lookupPropertyInParentChain(
        workflow.parent_workflow_instance_id,
        propertyName,
        entryName,
      );
      if (parentResult !== null) {
        return parentResult;
      }
    }

    // Step 3: Look in environment scope
    if (environmentId) {
      const envProp = await this.valuePropertyRepo.getEnvironmentProperty(
        environmentId,
        propertyName,
      );
      if (envProp) {
        const entry = envProp.entries.find((e) => e.name === entryName);
        if (entry !== undefined) {
          return entry.value;
        }
      }
    }

    return null;
  }

  /**
   * Recursively traverse the parent workflow chain looking for a property.
   */
  private async lookupPropertyInParentChain(
    workflowInstanceId: string,
    propertyName: string,
    entryName: string,
  ): Promise<string | null> {
    const prop = await this.valuePropertyRepo.getWorkflowProperty(
      workflowInstanceId,
      propertyName,
    );
    if (prop) {
      const entry = prop.entries.find((e) => e.name === entryName);
      if (entry !== undefined) {
        return entry.value;
      }
    }

    // Continue up the chain
    const workflow = await this.workflowRepo.getById(workflowInstanceId);
    if (workflow?.parent_workflow_instance_id) {
      return this.lookupPropertyInParentChain(
        workflow.parent_workflow_instance_id,
        propertyName,
        entryName,
      );
    }

    return null;
  }
}
