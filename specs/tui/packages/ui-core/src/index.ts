// Types
export type {
  AgentSession,
  AgentSessionStatus,
  AgentMessage,
  AgentMessageRole,
  AgentPart,
  AgentPartType,
  CreateAgentSessionRequest,
  CreateAgentMessageRequest,
  AgentSessionsOptions,
  AgentMessagesOptions,
} from "./types/index.js";
export { ApiError, NetworkError, parseResponseError } from "./types/index.js";
export type { ApiErrorCode, HookError } from "./types/index.js";

// Client
export { APIClientProvider, useAPIClient, createAPIClient } from "./client/index.js";
export type { APIClient, APIRequestOptions, CreateAPIClientConfig } from "./client/index.js";

// Agent hooks
export {
  useAgentSessions,
  useAgentSession,
  useAgentMessages,
  useCreateAgentSession,
  useDeleteAgentSession,
  useSendAgentMessage,
} from "./hooks/agents/index.js";
export type {
  DeleteAgentSessionCallbacks,
  SendAgentMessageCallbacks,
} from "./hooks/agents/index.js";

// Issue hooks
export {
  useIssues,
  useIssue,
  useCreateIssue,
  useUpdateIssue,
  useIssueComments,
  useIssueEvents,
  useCreateIssueComment,
  useRepoLabels,
  useRepoMilestones,
  useRepoCollaborators,
  useAddIssueLabels,
  useRemoveIssueLabel,
} from "./hooks/issues/index.js";
export type {
  UpdateIssueCallbacks,
  CreateIssueCommentCallbacks,
  RemoveIssueLabelCallbacks,
} from "./hooks/issues/index.js";

// Workspace types
export type {
  Workspace,
  WorkspaceStatus,
  WorkspaceSession,
  WorkspaceSessionStatus,
  WorkspaceSSHInfo,
  WorkspaceSnapshot,
  CreateWorkspaceRequest,
  CreateWorkspaceSessionRequest,
  CreateWorkspaceSnapshotRequest,
  WorkspacesOptions,
  WorkspaceSessionsOptions,
  WorkspaceSnapshotsOptions,
  WorkspaceStatusEvent,
  WorkspaceSessionStatusEvent,
} from "./types/index.js";

// Workspace hooks
export {
  useWorkspaces,
  useWorkspace,
  useWorkspaceSSH,
  useWorkspaceSessions,
  useWorkspaceSnapshots,
  useCreateWorkspace,
  useSuspendWorkspace,
  useResumeWorkspace,
  useDeleteWorkspace,
  useCreateWorkspaceSession,
  useDestroyWorkspaceSession,
  useCreateWorkspaceSnapshot,
  useDeleteWorkspaceSnapshot,
} from "./hooks/workspaces/index.js";
export type {
  SuspendWorkspaceCallbacks,
  ResumeWorkspaceCallbacks,
  DeleteWorkspaceCallbacks,
  DestroyWorkspaceSessionCallbacks,
  DeleteWorkspaceSnapshotCallbacks,
} from "./hooks/workspaces/index.js";
