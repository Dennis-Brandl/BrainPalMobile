// Execution log service: wraps the IExecutionLogger interface to provide
// a high-level API for logging all engine events unconditionally.
// Logs EVERYTHING per the CONTEXT.md decision -- no filtering, no sampling.

import type { IExecutionLogger } from '../interfaces/logger';
import type { LogEventType, ExecutionLogEntry } from '../types/events';

/**
 * High-level execution log service.
 * Wraps the storage-layer IExecutionLogger to create properly structured
 * log entries with ISO 8601 UTC timestamps.
 */
export class ExecutionLogService {
  constructor(private readonly logger: IExecutionLogger) {}

  /**
   * Log an engine event unconditionally.
   *
   * @param workflowInstanceId - The workflow this event belongs to
   * @param eventType - The type of engine event
   * @param eventData - Arbitrary event data (serialized to JSON)
   * @param stepOid - Optional step OID (for step-level events)
   * @param stepInstanceId - Optional step instance ID (for step-level events)
   */
  async logEvent(
    workflowInstanceId: string,
    eventType: LogEventType,
    eventData: unknown,
    stepOid?: string,
    stepInstanceId?: string,
  ): Promise<void> {
    const entry: ExecutionLogEntry = {
      workflow_instance_id: workflowInstanceId,
      step_oid: stepOid,
      step_instance_id: stepInstanceId,
      event_type: eventType,
      event_data_json: JSON.stringify(eventData),
      timestamp: new Date().toISOString(),
    };

    await this.logger.log(entry);
  }

  /**
   * Get all log entries for a workflow.
   */
  async getByWorkflow(workflowInstanceId: string): Promise<ExecutionLogEntry[]> {
    return this.logger.getByWorkflow(workflowInstanceId);
  }
}
