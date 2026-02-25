// Execution logger interface.
// The engine logs all events for audit and debugging.

import type { ExecutionLogEntry } from '../types/events';

export interface IExecutionLogger {
  log(entry: ExecutionLogEntry): Promise<void>;
  getByWorkflow(workflowInstanceId: string): Promise<ExecutionLogEntry[]>;
}
