import { useWorkflowRunSSE as useWorkflowRunSSECore } from "@codeplane/ui-core/hooks/workflows";
import type { WorkflowRunSSEState } from "./workflow-stream-types.js";

export { useWorkflowRunSSECore as useWorkflowRunSSE };

// Re-export for consumers that want the TUI-level import path
export type { WorkflowRunSSEState };
