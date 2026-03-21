import { useMemo } from "react";
import { useWorkflowLogStream as useWorkflowLogStreamCore } from "@codeplane/ui-core/hooks/workflows";
import { useSpinner } from "./useSpinner.js";
import type { WorkflowLogStreamState } from "./workflow-stream-types.js";

export function useWorkflowLogStream(
  owner: string,
  repo: string,
  runId: number,
  options?: Parameters<typeof useWorkflowLogStreamCore>[3],
): WorkflowLogStreamState {
  const stream = useWorkflowLogStreamCore(owner, repo, runId, options);
  const isStreaming = stream.connectionHealth.state === "connected" ||
                     stream.connectionHealth.state === "reconnecting";
  const spinnerFrame = useSpinner(isStreaming);

  return useMemo(() => ({
    ...stream,
    spinnerFrame,
  }), [
    stream.logs,
    stream.steps,
    stream.runStatus,
    stream.connectionHealth,
    stream.reconnect,
    stream.lastEventId,
    spinnerFrame,
  ]);
}
