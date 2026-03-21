import { useMemo } from "react";
import {
  useAgentStream as useAgentStreamCore,
  type AgentStreamOptions,
} from "@codeplane/ui-core/hooks/agents";
import { useSpinner } from "./useSpinner.js";

export interface TUIAgentStreamState {
  streaming: boolean;
  currentTokens: string;
  connected: boolean;
  reconnecting: boolean;
  error: Error | null;
  subscribe: (sessionId: string) => void;
  unsubscribe: () => void;
  /** Current spinner frame character (braille). Only meaningful when streaming === true. */
  spinnerFrame: string;
}

export function useAgentStream(
  owner: string,
  repo: string,
  sessionId: string,
  options?: AgentStreamOptions,
): TUIAgentStreamState {
  const stream = useAgentStreamCore(owner, repo, sessionId, options);
  const spinnerFrame = useSpinner(stream.streaming);

  return useMemo(() => ({
    ...stream,
    spinnerFrame,
  }), [
    stream.streaming,
    stream.currentTokens,
    stream.connected,
    stream.reconnecting,
    stream.error,
    stream.subscribe,
    stream.unsubscribe,
    spinnerFrame,
  ]);
}
