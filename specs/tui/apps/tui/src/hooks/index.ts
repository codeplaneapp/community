export { useSpinner, BRAILLE_FRAMES, ASCII_FRAMES, BRAILLE_INTERVAL_MS, ASCII_INTERVAL_MS } from "./useSpinner.js";
export { useNavigation } from "./useNavigation.js";
export { useClipboard } from "./useClipboard.js";
export { useDiffSyntaxStyle } from "./useDiffSyntaxStyle.js";
export { useTabs } from "./useTabs.js";
export type { UseTabsOptions, UseTabsReturn } from "./useTabs.js";
export { useTabScrollState } from "./useTabScrollState.js";
export type { UseTabScrollStateReturn } from "./useTabScrollState.js";
export { useTabFilter, FILTER_MAX_LENGTH } from "./useTabFilter.js";
export type { UseTabFilterReturn } from "./useTabFilter.js";

export { useAgentStream } from "./useAgentStream.js";
export type { TUIAgentStreamState } from "./useAgentStream.js";

// Workflow data hooks
export { useWorkflowDefinitions } from "./useWorkflowDefinitions.js";
export { useWorkflowRuns } from "./useWorkflowRuns.js";
export { useWorkflowRunDetail } from "./useWorkflowRunDetail.js";
export { useWorkflowRunArtifacts } from "./useWorkflowRunArtifacts.js";
export { useWorkflowCaches, useWorkflowCacheStats } from "./useWorkflowCaches.js";
export { useDispatchWorkflow } from "./useDispatchWorkflow.js";
export {
  useWorkflowRunCancel,
  useWorkflowRunRerun,
  useWorkflowRunResume,
  useDeleteWorkflowArtifact,
  useDeleteWorkflowCache,
} from "./useWorkflowActions.js";

// Re-export types for consumer convenience
export type {
  WorkflowDefinition,
  WorkflowRun,
  WorkflowRunStatus,
  WorkflowRunNode,
  WorkflowRunDetailResponse,
  WorkflowArtifact,
  WorkflowCache,
  WorkflowCacheStats,
  WorkflowRunResult,
  WorkflowRunFilters,
  WorkflowCacheFilters,
  RepoIdentifier,
  QueryResult,
  PaginatedQueryResult,
  MutationResult,
  HookError,
} from "./workflow-types.js";
export type { DispatchInput } from "./useDispatchWorkflow.js";

export { useLayout } from "./useLayout.js";
export type { LayoutContext } from "./useLayout.js";
export { useBreakpoint } from "./useBreakpoint.js";
export { useResponsiveValue, type ResponsiveValues } from "./useResponsiveValue.js";
export { useSidebarState, type SidebarState } from "./useSidebarState.js";

export { useTheme } from "./useTheme.js";
export { useColorTier } from "./useColorTier.js";
export { useAuth } from "./useAuth.js";

export { useWorkflowLogStream } from "./useWorkflowLogStream.js";
export { useWorkflowRunSSE } from "./useWorkflowRunSSE.js";
export type {
  LogLine,
  StatusEvent,
  DoneEvent,
  WorkflowLogStreamEvent,
  WorkflowRunSSEEvent,
  WorkflowStreamConnectionState,
  ConnectionHealth,
  WorkflowLogStreamState,
  StepState,
  WorkflowRunSSEState,
} from "./workflow-stream-types.js";
export { VIRTUAL_SCROLL_WINDOW } from "./workflow-stream-types.js";
export { useLoading } from './useLoading.js';
export { useScreenLoading } from './useScreenLoading.js';
export { useOptimisticMutation } from './useOptimisticMutation.js';
export { usePaginationLoading } from './usePaginationLoading.js';

export { useWorkspaceStatusStream } from "./useWorkspaceStatusStream";
export type { UseWorkspaceStatusStreamResult, UseWorkspaceStatusStreamOptions } from "./useWorkspaceStatusStream";
export { useWorkspaceListStatusStream } from "./useWorkspaceListStatusStream";
export type { UseWorkspaceListStatusStreamResult, WorkspaceListStatusMap } from "./useWorkspaceListStatusStream";
