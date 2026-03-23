import React from "react";
import { detectColorCapability } from "../theme/detect.js";
import { createTheme, TextAttributes } from "../theme/tokens.js";

const fallbackTheme = createTheme(detectColorCapability());

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  showStack: boolean;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; onRestart?: () => void },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, error: null, showStack: false };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (process.env.CODEPLANE_TUI_DEBUG === "true") {
      process.stderr.write(
        JSON.stringify({
          component: "tui",
          phase: "render",
          level: "error",
          message: error.message,
          stack: error.stack,
          componentStack: info.componentStack,
        }) + "\n"
      );
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return <ErrorBoundaryScreen 
      error={this.state.error} 
      showStack={this.state.showStack}
      onToggleStack={() => this.setState(s => ({ showStack: !s.showStack }))}
      onRestart={() => {
        this.setState({ hasError: false, error: null, showStack: false });
        this.props.onRestart?.();
      }}
    />;
  }
}

function ErrorBoundaryScreen({
  error,
  showStack,
  onToggleStack,
  onRestart,
}: {
  error: Error | null;
  showStack: boolean;
  onToggleStack: () => void;
  onRestart: () => void;
}) {
  const { useKeyboard } = require("@opentui/react");

  useKeyboard((event: { name: string }) => {
    if (event.name === "r") onRestart();
    if (event.name === "q") process.exit(0);
    if (event.name === "s") onToggleStack();
  });

  return (
    <box flexDirection="column" width="100%" height="100%" padding={2}>
      <text fg={fallbackTheme.error} attributes={TextAttributes.BOLD}>Something went wrong</text>
      <text fg={fallbackTheme.error}>{error?.message ?? "Unknown error"}</text>
      {showStack && error?.stack && (
        <box marginTop={1}>
          <text fg={fallbackTheme.muted}>{error.stack}</text>
        </box>
      )}
      <box marginTop={1}>
        <text fg={fallbackTheme.muted}>
          Press `r` to restart — Press `q` to quit — Press `s` to {showStack ? "hide" : "show"} stack trace
        </text>
      </box>
    </box>
  );
}
