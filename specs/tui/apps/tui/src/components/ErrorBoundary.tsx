import React from "react";
import { ErrorScreen } from "./ErrorScreen.js";
import { CrashLoopDetector } from "../lib/crash-loop.js";
import { normalizeError } from "../lib/normalize-error.js";
import { emit } from "../lib/telemetry.js";
import { logger } from "../lib/logger.js";

// ── Types ────────────────────────────────────────────────────────────────────

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /**
   * Called when user presses 'r' to restart.
   * Parent should: reset navigation stack → increment a key prop to
   * force full child remount → clear SSE/data caches.
   */
  onReset: () => void;
  /**
   * Called when user presses 'q' to quit.
   * Parent should: restore terminal → process.exit(0).
   */
  onQuit: () => void;
  /**
   * The current screen name, used for telemetry context.
   * Updated by the NavigationProvider (or parent) on navigation.
   */
  currentScreen?: string;
  /**
   * Whether color output is disabled (NO_COLOR=1 or TERM=dumb).
   */
  noColor?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  /** Incremented on each restart to force child remount via key prop. */
  resetToken: number;
}

// ── Component ────────────────────────────────────────────────────────────────

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  private crashLoopDetector = new CrashLoopDetector();
  private restartCount = 0;

  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    resetToken: 0,
  };

  static getDerivedStateFromError(thrown: unknown): Partial<ErrorBoundaryState> {
    const error = normalizeError(thrown);
    return { hasError: true, error };
  }

  componentDidMount(): void {
    logger.debug("ErrorBoundary: mounted");
  }

  componentDidCatch(thrown: unknown, info: React.ErrorInfo): void {
    const error = normalizeError(thrown);
    const screen = this.props.currentScreen ?? "unknown";

    // Log the error
    logger.error(
      `ErrorBoundary: caught unhandled error [screen=${screen}] [error=${error.name}: ${error.message}]`,
    );
    if (error.stack) {
      logger.error(`ErrorBoundary: stack trace:\n${error.stack}`);
    }

    // Emit telemetry
    emit("tui.error_boundary.caught", {
      error_name: error.name,
      error_message_truncated: error.message.slice(0, 100),
      screen,
      stack_depth: 0, // Would need NavigationContext access; parent can provide
      terminal_width: 0, // Set by telemetry context
      terminal_height: 0,
    });
  }

  private handleRestart = (): void => {
    this.restartCount++;

    // Check crash loop
    const isCrashLoop = this.crashLoopDetector.recordRestart();
    if (isCrashLoop) {
      const msg = `Repeated crash detected. Exiting. [${this.crashLoopDetector.restartCount} restarts]`;
      logger.warn(
        `ErrorBoundary: crash loop detected [${this.crashLoopDetector.restartCount} restarts in ${5000}ms] — exiting`,
      );
      emit("tui.error_boundary.crash_loop_exit", {
        error_name: this.state.error?.name ?? "unknown",
        restart_count: this.restartCount,
        time_window_ms: 5000,
      });
      process.stderr.write(msg + "\n");
      process.exit(1);
      return;
    }

    // Clear error state and increment resetToken to force child remount
    this.setState((prev) => ({
      hasError: false,
      error: null,
      resetToken: prev.resetToken + 1,
    }));

    // Notify parent to reset navigation stack, SSE, caches
    this.props.onReset();
  };

  private handleQuit = (): void => {
    this.props.onQuit();
  };

  render(): React.ReactNode {
    if (this.state.hasError && this.state.error) {
      // Double fault protection: if the error screen itself throws,
      // catch it and exit cleanly to stderr.
      try {
        return (
          <ErrorScreen
            error={this.state.error}
            onRestart={this.handleRestart}
            onQuit={this.handleQuit}
            screenName={this.props.currentScreen}
            noColor={this.props.noColor}
          />
        );
      } catch (secondaryError: unknown) {
        // Double fault: the error screen itself crashed.
        const primary = this.state.error;
        const secondary = normalizeError(secondaryError);

        logger.error(
          `ErrorBoundary: error during error screen render [primary=${primary.message}] [secondary=${secondary.message}]`,
        );
        emit("tui.error_boundary.double_fault", {
          primary_error_name: primary.name,
          secondary_error_name: secondary.name,
        });

        process.stderr.write(
          `Fatal: TUI error boundary failed.\n` +
            `Primary error: ${primary.message}\n` +
            `Secondary error: ${secondary.message}\n`,
        );
        process.exit(1);
        return null; // unreachable, satisfies TypeScript
      }
    }

    // Normal render: wrap children with resetToken key to force remount on restart
    return (
      <React.Fragment key={this.state.resetToken}>
        {this.props.children}
      </React.Fragment>
    );
  }
}
