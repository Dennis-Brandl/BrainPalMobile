// @brainpal/engine -- Pure TypeScript workflow execution engine.
// Zero platform dependencies. All external dependencies injected via interfaces.

export const ENGINE_VERSION = '0.0.1';

// Types
export type {
  // Common
  StepState,
  StateEvent,
  StepType,
  WorkflowState,
  ComparisonOperator,
  ResourceType,
  ResourceCommandType,
  ActionVisibility,
  // Master
  ManagedElement,
  ParameterSpecification,
  OutputParameterSpecification,
  UIParameterSpecification,
  PropertySpecification,
  PropertyEntrySpecification,
  ResourcePropertySpecification,
  ResourceCommandSpecification,
  YesNoConfig,
  ScriptConfig,
  Select1Config,
  Select1Option,
  FormLayoutEntry,
  FormElementSpec,
  MasterWorkflowConnection,
  ConditionConnection,
  MasterWorkflowStep,
  MasterWorkflowSpecification,
  IncludedAction,
  MasterEnvironmentSpecification,
  MasterEnvironmentLibrary,
  MasterActionSpecification,
  MasterActionLibrary,
  MasterWorkflowLibrary,
  // Runtime
  RuntimeWorkflow,
  RuntimeWorkflowStep,
  WorkflowConnection,
  RuntimeValueProperty,
  PropertyEntry,
  ResourcePool,
  ResourceQueueEntry,
  SyncBarrierEntry,
  StateTransition,
  ResolvedParameter,
  // Events
  LogEventType,
  ExecutionLogEntry,
  EngineEventMap,
  EngineEvent,
} from './types';

export { ACTIVE_STATES, TERMINAL_STATES, SPEC_STEP_TYPE_MAP } from './types';

// Interfaces
export type {
  IMasterWorkflowRepository,
  IMasterEnvironmentRepository,
  IMasterActionRepository,
  IImageRepository,
  PackageImage,
  IWorkflowRepository,
  IStepRepository,
  IConnectionRepository,
  IValuePropertyRepository,
  IResourcePoolRepository,
  IResourceQueueRepository,
  ISyncBarrierRepository,
  IExecutionLogger,
  IIdGenerator,
} from './interfaces';

// Events
export { EngineEventBus, EngineEventQueue } from './events';

// State Machine
export { StateMachine, InvalidTransitionError } from './state-machine';
export { ISA88_OBSERVABLE_TRANSITIONS, ISA88_OPAQUE_TRANSITIONS } from './state-machine';
export type { StateTransitionRule, StateMachineConfig, StepContext } from './state-machine';

// Scheduler
export { Scheduler } from './scheduler';
export type { AdjacencyList, SchedulerContext } from './scheduler';

// Parameter Resolver
export { ParameterResolver } from './parameter-resolver';
export { ScopeResolver } from './parameter-resolver';
export type { ResolvedParameter as ParamResolvedParameter, ParameterResolutionResult } from './parameter-resolver';

// Condition Evaluator
export { ConditionEvaluator, evaluateCondition, evaluate } from './condition-evaluator';
export { ConditionNotMatchedError } from './condition-evaluator';
export type { Select1EvalConfig, ConditionResult } from './condition-evaluator';

// Resource Manager
export { ResourceManager } from './resource-manager';
export type { ResourceRequest, AcquireResult, ReleaseResult, SyncBarrierRequest, SyncBarrierResult } from './resource-manager';

// Import Pipeline
export { PackageImporter, PackageValidationError } from './import';
export { parseManifest, validateFileReferences, extractPackage, getMimeType } from './import';
export type { ManifestSchema, ManifestFileEntry, ExtractedPackage, ImportResult } from './import';

// Runner (WorkflowRunner, lifecycle, step executor)
export { WorkflowRunner } from './runner';
export { createRuntimeWorkflow, completeWorkflow, abortWorkflow } from './runner';
export { UnsupportedStepTypeError } from './runner';
export type { RunnerConfig, WorkflowRunnerState, RecoveryResult, CreateRuntimeWorkflowResult } from './runner';

// Execution Logger
export { ExecutionLogService } from './logger';
