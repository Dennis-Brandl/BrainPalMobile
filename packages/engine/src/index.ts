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
