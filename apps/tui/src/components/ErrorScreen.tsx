import React, { useState, useRef, useCallback } from "react";
import { useKeyboard, useTerminalDimensions, useOnResize } from "@opentui/react";
import { getBreakpoint, type Breakpoint } from "../types/breakpoint.js";
import { wrapText, truncateText } from "../util/truncate.js";
import { emit } from "../lib/telemetry.js";
import { logger } from "../lib/logger.js";
import { useTheme } from "../hooks/useTheme.js";
import { TextAttributes } from "../theme/tokens.js";

// ── Constants ────────────────────────────────────────────────────────────────

const ERROR_MESSAGE_MAX_CHARS = 500;
const STACK_TRACE_MAX_LINES = 200;
const RESTART_DEBOUNCE_MS = 500;

/** Breakpoint-specific responsive config */
interface ResponsiveConfig {
  paddingX: number;
  maxMessageLines: number;
  maxTraceHeight: number;
  centered: boolean;
}

function getResponsiveConfig(
  breakpoint: Breakpoint | "unsupported",
  terminalHeight: number,
): ResponsiveConfig {
  switch (breakpoint) {
    case "minimum":
    case "unsupported":
      return {
        paddingX: 2,
        maxMessageLines: 3,
        maxTraceHeight: Math.min(10, terminalHeight - 10),
        centered: false,
      };
    case "standard":
      return {
        paddingX: 4,
        maxMessageLines: 6,
        maxTraceHeight: Math.min(24, terminalHeight - 10),
        centered: false,
      };
    case "large":
      return {
        paddingX: 6,
        maxMessageLines: 10,
        maxTraceHeight: Math.min(44, terminalHeight - 10),
        centered: true,
      };
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

interface ErrorScreenProps {
  error: Error;
  onRestart: () => void;
  onQuit: () => void;
  /** Active screen name at time of crash, for telemetry. */
  screenName?: string;
  /** Whether NO_COLOR or TERM=dumb is active. */
  noColor?: boolean;
}

// ── Component ────────────────────────────────────────────────────────────────

export function ErrorScreen({
  error,
  onRestart,
  onQuit,
  screenName,
  noColor = false,
}: ErrorScreenProps) {
  const { width: termWidth, height: termHeight } = useTerminalDimensions();
  const bp = getBreakpoint(termWidth, termHeight);
  const breakpoint = bp === null ? "unsupported" : bp;

  const config = getResponsiveConfig(breakpoint, termHeight);

  let theme: any = null;
  try {
    theme = useTheme();
  } catch (e) {
    // Fallback if ThemeProvider is not mounted above this boundary
  }

  const [traceExpanded, setTraceExpanded] = useState(false);
  const [traceScrollOffset, setTraceScrollOffset] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const lastRestartTime = useRef(0);
  const mountTime = useRef(Date.now());
  const traceWasViewed = useRef(false);

  // ── Derived values ────────────────────────────────────────────────────

  if (process.env.CODEPLANE_TUI_TEST_DOUBLE_FAULT === "1") {
    throw new Error("Secondary fault (simulated)");
  }

  const hasStack = Boolean(error.stack);

  // Truncate message to 500 chars
  const rawMessage = truncateText(error.message, ERROR_MESSAGE_MAX_CHARS);

  // Wrap message to terminal width minus padding
  const messageWidth = termWidth - config.paddingX * 2;
  const wrappedLines = wrapText(rawMessage, messageWidth);

  // Cap displayed lines per breakpoint
  const displayedMessageLines =
    wrappedLines.length > config.maxMessageLines
      ? [
          ...wrappedLines.slice(0, config.maxMessageLines - 1),
          truncateText(
            wrappedLines[config.maxMessageLines - 1],
            messageWidth,
          ),
        ]
      : wrappedLines;

  // Process stack trace
  const stackLines = hasStack
    ? error.stack!.split("\n").filter((l) => l.trim().length > 0)
    : [];
  const truncatedStackLines =
    stackLines.length > STACK_TRACE_MAX_LINES
      ? [
          ...stackLines.slice(0, STACK_TRACE_MAX_LINES),
          `(truncated — ${stackLines.length - STACK_TRACE_MAX_LINES} more lines)`,
        ]
      : stackLines;

  // Visible lines in scrollbox
  const visibleTraceCount = Math.min(
    config.maxTraceHeight,
    truncatedStackLines.length,
  );
  const maxScrollOffset = Math.max(
    0,
    truncatedStackLines.length - visibleTraceCount,
  );

  // ── Scroll helpers ────────────────────────────────────────────────────

  const scrollDown = useCallback(
    (amount: number = 1) => {
      setTraceScrollOffset((prev) => Math.min(prev + amount, maxScrollOffset));
    },
    [maxScrollOffset],
  );

  const scrollUp = useCallback(
    (amount: number = 1) => {
      setTraceScrollOffset((prev) => Math.max(prev - amount, 0));
    },
    [],
  );

  const scrollToTop = useCallback(() => setTraceScrollOffset(0), []);
  const scrollToBottom = useCallback(
    () => setTraceScrollOffset(maxScrollOffset),
    [maxScrollOffset],
  );

  const pageSize = Math.max(1, Math.floor(visibleTraceCount / 2));

  // ── Key state for g-g detection ───────────────────────────────────────

  const lastKeyRef = useRef<{ key: string; time: number }>({ key: "", time: 0 });

  // ── Keyboard handler ──────────────────────────────────────────────────

  useKeyboard((event: { name: string }) => {
    const key = event.name;
    const now = Date.now();

    // Help overlay
    if (key === "?") {
      setShowHelp((prev) => !prev);
      return;
    }

    // If help is open, only Esc dismisses it
    if (showHelp) {
      if (key === "escape") setShowHelp(false);
      return;
    }

    // ── Primary actions ────────────────────────────────────────────────

    if (key === "r") {
      // Debounce: ignore if within 500ms of last restart
      if (now - lastRestartTime.current < RESTART_DEBOUNCE_MS) return;
      lastRestartTime.current = now;

      emit("tui.error_boundary.restart", {
        error_name: error.name,
        screen: screenName ?? "unknown",
        time_on_error_screen_ms: now - mountTime.current,
        trace_was_viewed: traceWasViewed.current,
        restart_count: 1, // Actual count tracked by ErrorBoundary
      });
      logger.info(
        `ErrorBoundary: user initiated restart [screen=${screenName}]`,
      );

      onRestart();
      return;
    }

    if (key === "q") {
      emit("tui.error_boundary.quit", {
        error_name: error.name,
        screen: screenName ?? "unknown",
        time_on_error_screen_ms: now - mountTime.current,
        trace_was_viewed: traceWasViewed.current,
        quit_method: "q",
      });
      logger.info(
        `ErrorBoundary: user quit from error screen [screen=${screenName}]`,
      );

      onQuit();
      return;
    }

    // ── Stack trace toggle ────────────────────────────────────────────

    if (key === "s" && hasStack) {
      const newExpanded = !traceExpanded;
      setTraceExpanded(newExpanded);
      if (newExpanded) traceWasViewed.current = true;

      emit("tui.error_boundary.trace_toggled", {
        error_name: error.name,
        expanded: newExpanded,
      });
      logger.debug(
        `ErrorBoundary: stack trace toggled [expanded=${newExpanded}]`,
      );
      return;
    }

    // ── Trace scrolling (only when expanded) ─────────────────────────

    if (traceExpanded) {
      if (key === "j" || key === "down") {
        scrollDown(1);
        return;
      }
      if (key === "k" || key === "up") {
        scrollUp(1);
        return;
      }
      if (key === "G") {
        scrollToBottom();
        return;
      }
      if (key === "g") {
        // Detect gg: if the previous key was 'g' within 500ms
        if (
          lastKeyRef.current.key === "g" &&
          now - lastKeyRef.current.time < 500
        ) {
          scrollToTop();
          lastKeyRef.current = { key: "", time: 0 };
          return;
        }
        lastKeyRef.current = { key: "g", time: now };
        return;
      }
      if (key === "ctrl+d") {
        scrollDown(pageSize);
        return;
      }
      if (key === "ctrl+u") {
        scrollUp(pageSize);
        return;
      }
    }

    // Track last key for gg detection
    if (key !== "g") {
      lastKeyRef.current = { key: "", time: 0 };
    }

    // All other keys are suppressed — no propagation to
    // global nav, command palette, or go-to mode.
  });

  // ── Re-layout on resize (scroll position preserved) ───────────────

  useOnResize(() => {
    // State is already reactive to useTerminalDimensions().
    // Clamp scroll offset to new max if trace became shorter.
    setTraceScrollOffset((prev) => Math.min(prev, maxScrollOffset));
  });

  // ── Heading ───────────────────────────────────────────────────────────

  const headingText = noColor
    ? "[ERROR] Something went wrong"
    : "✗ Something went wrong";

  const errColor = noColor ? undefined : theme?.error || "#DC2626";
  const mutedColor = noColor ? undefined : theme?.muted || "#A3A3A3";
  const primaryColor = noColor ? undefined : theme?.primary || "#2563EB";
  const borderColor = noColor ? undefined : theme?.border || "#525252";

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <box flexDirection="column" width="100%" height="100%">
      {/* Heading */}
      <box paddingX={config.paddingX} paddingTop={1}>
        <text attributes={TextAttributes.BOLD} fg={errColor}>
          {headingText}
        </text>
      </box>

      {/* Error message */}
      <box paddingX={config.paddingX} paddingTop={1}>
        <text fg={errColor}>
          {displayedMessageLines.join("\n")}
        </text>
      </box>

      {/* Stack trace toggle (only if stack exists) */}
      {hasStack && (
        <box paddingX={config.paddingX} paddingTop={1}>
          <text fg={mutedColor}>
            {traceExpanded ? "▾" : "▸"} Stack trace (s to toggle)
          </text>
        </box>
      )}

      {/* Expanded stack trace in scrollable region */}
      {traceExpanded && hasStack && (
        <box
          paddingX={config.paddingX}
          paddingTop={1}
          height={visibleTraceCount + 2} // +2 for border
        >
          <box
            border={true}
            borderColor={borderColor}
            paddingX={1}
            width="100%"
            height={visibleTraceCount + 2}
          >
            <text fg={mutedColor}>
              {truncatedStackLines
                .slice(
                  traceScrollOffset,
                  traceScrollOffset + visibleTraceCount,
                )
                .join("\n")}
            </text>
          </box>
        </box>
      )}

      {/* Spacer */}
      {!traceExpanded && <box flexGrow={1} />}
      {traceExpanded && <box flexGrow={1} />}

      {/* Action hints */}
      <box paddingX={config.paddingX} paddingBottom={1}>
        <box flexDirection="row" gap={2}>
          <text>
            <text fg={primaryColor} attributes={TextAttributes.BOLD}>r</text>
            <text fg={mutedColor}>:restart</text>
          </text>
          <text>
            <text fg={primaryColor} attributes={TextAttributes.BOLD}>q</text>
            <text fg={mutedColor}>:quit</text>
          </text>
          {hasStack && (
            <text>
              <text fg={primaryColor} attributes={TextAttributes.BOLD}>s</text>
              <text fg={mutedColor}>:trace</text>
            </text>
          )}
          <box flexGrow={1} />
          <text>
            <text fg={primaryColor} attributes={TextAttributes.BOLD}>?</text>
            <text fg={mutedColor}>:help</text>
          </text>
        </box>
      </box>

      {/* Help overlay */}
      {showHelp && (
        <box
          position="absolute"
          top={3}
          left="20%"
          width={breakpoint === "minimum" || breakpoint === "unsupported" ? "90%" : "60%"}
          height={breakpoint === "minimum" || breakpoint === "unsupported" ? "90%" : "60%"}
          border={true}
          borderColor={borderColor}
          padding={2}
          flexDirection="column"
        >
          <text attributes={TextAttributes.BOLD}>Error Screen Keybindings</text>
          <text fg={mutedColor}>──────────────────────</text>
          <text><text attributes={TextAttributes.BOLD} fg={primaryColor}>r</text>       Restart TUI</text>
          <text><text attributes={TextAttributes.BOLD} fg={primaryColor}>q</text>       Quit TUI</text>
          <text><text attributes={TextAttributes.BOLD} fg={primaryColor}>Ctrl+C</text>  Quit immediately</text>
          <text><text attributes={TextAttributes.BOLD} fg={primaryColor}>s</text>       Toggle stack trace</text>
          <text><text attributes={TextAttributes.BOLD} fg={primaryColor}>j/↓</text>    Scroll trace down</text>
          <text><text attributes={TextAttributes.BOLD} fg={primaryColor}>k/↑</text>    Scroll trace up</text>
          <text><text attributes={TextAttributes.BOLD} fg={primaryColor}>G</text>       Jump to trace bottom</text>
          <text><text attributes={TextAttributes.BOLD} fg={primaryColor}>gg</text>      Jump to trace top</text>
          <text><text attributes={TextAttributes.BOLD} fg={primaryColor}>Ctrl+D</text>  Page down</text>
          <text><text attributes={TextAttributes.BOLD} fg={primaryColor}>Ctrl+U</text>  Page up</text>
          <text><text attributes={TextAttributes.BOLD} fg={primaryColor}>?</text>       Close this help</text>
          <box flexGrow={1} />
          <text fg={mutedColor}>Press ? or Esc to close</text>
        </box>
      )}
    </box>
  );
}
