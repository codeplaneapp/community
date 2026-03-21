// JJHub workflow components (extend Smithers with triggers, optional output, etc.)
export { Workflow, Task } from "./components";
export type { WorkflowProps, TaskProps } from "./components";
export { createWorkflowArtifactHelpers } from "./artifacts";
export type {
  JJHubWorkflowCtx,
  WorkflowArtifactClient,
  WorkflowArtifactRecord,
  WorkflowArtifactUploadOptions,
} from "./artifacts";
export { createWorkflowCacheHelpers } from "./cache";
export type {
  WorkflowCacheDescriptor,
  WorkflowCacheHelpers,
  WorkflowCacheRestoreDescriptor,
  WorkflowCacheSaveDescriptor,
} from "./cache";

// Schema-driven API (createSmithers pattern).
export { createSmithers } from "./create";
export type { CreateJJHubSmithersApi } from "./create";

// Re-export Smithers components that don't need JJHub extensions.
export { Sequence, Parallel, Branch, Ralph } from "smithers-orchestrator";

// Re-export Smithers core API for schema-driven workflows.
export { runWorkflow } from "smithers-orchestrator";
export type { SmithersCtx } from "smithers-orchestrator";
export type { SmithersWorkflow } from "smithers-orchestrator";
export type { SmithersWorkflowOptions } from "smithers-orchestrator";
export type { OutputKey } from "smithers-orchestrator";
export type { OutputAccessor, InferOutputEntry } from "smithers-orchestrator";

// Trigger builders.
export { on } from "./triggers";
export type { TriggerDescriptor } from "./triggers";

// Workspace, preview, and CI DSL.
export { defineWorkspace, definePreview, defineCI } from "./workspace";
export type {
  WorkspaceConfig,
  WorkspaceDefinition,
  PreviewConfig,
  PreviewDefinition,
  ServiceConfig,
  WorkspaceHandle,
  CIConfig,
  CIDefinition,
  CIStepConfig,
  CIGroupConfig,
} from "./workspace";
