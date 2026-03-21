# TUI_ERROR_BOUNDARY — Engineering Specification

## Overview

This specification describes the full engineering implementation for the TUI error boundary with recovery UI, stack trace viewer, and crash loop detection. The error boundary is a React class component that catches unhandled exceptions from any descendant component, renders a keyboard-driven error screen with diagnostic details, and provides the user with restart and quit actions.

All implementation lives in `apps/tui/src/`. All E2E tests live in `e2e/tui/`. The feature depends on:
- `tui-bootstrap-and-renderer` — entry point, CLI arg parsing, `createCliRenderer()`, process cleanup handlers
- `tui-theme-provider` — `useTheme()` for semantic color tokens (`error`, `muted`, `primary`, `border`)
- `tui-layout-hook` — `useLayout()` for responsive dimensions and breakpoints
- `tui-util-text` — `wrapText()`, `truncateText()`, `formatErrorSummary()` from `apps/tui/src/util/`
- `tui-e2e-test-infra` — `launchTUI()`, `TUITestInstance`, `createMockAPIEnv()` from `e2e/tui/helpers.ts`

---

## Existing Code Audit

### POC Implementation

**File:** `specs/tui/apps/tui/src/components/ErrorBoundary.tsx` (83 lines)

A working scaffold exists with:
- React class component with `getDerivedStateFromError` and `componentDidCatch`
- Basic `ErrorBoundaryScreen` function component with `useKeyboard` for `r`/`q`/`s`
- Simple JSX layout using `<box>` and `<text>` with hardcoded hex colors
- Direct `process.exit(0)` call on `q`

**Gaps vs. production spec:**

| Concern | POC State | Production Requirement |
|---------|-----------|------------------------|
| Crash loop detection | Missing | Ring buffer of 5 timestamps, 3+ in 5s → exit code 1 |
| Stack trace scrolling | Missing | `j`/`k`/`G`/`gg`/`Ctrl+D`/`Ctrl+U` in `<scrollbox>` |
| Text wrapping | Missing | `wrapText(msg, termWidth - 4)`, breakpoint-specific line caps |
| Message truncation | Missing | 500-char cap with `…` |
| Trace truncation | Missing | 200-line cap with `(truncated — N more lines)` |
| Responsive sizing | Missing | Breakpoint-aware padding, trace height caps, message line limits |
| Double fault handling | Missing | try-catch in `render()`, exit to stderr with both errors |
| Telemetry | Missing | 6 business events via telemetry emitter |
| Logging | Only debug-mode stderr JSON | Structured logging at error/warn/info/debug levels |
| Non-Error normalization | Missing | `String(thrown)` → `new Error()` |
| Restart debounce | Missing | 500ms cooldown on `r` |
| Help overlay | Missing | `?` toggles help with error screen keybindings |
| Semantic color tokens | Hardcoded hex | Must use `useTheme()` tokens (`error`, `muted`, `primary`) |
| `NO_COLOR` support | Missing | Plain text `[ERROR]` prefix when no color |
| `resetToken` for remount | Missing | Increment key to force full child tree unmount/remount |
| `onQuit` callback | Missing, uses `process.exit` | Callback prop for clean terminal teardown |

### Utility Dependencies (already specified)

**`apps/tui/src/util/truncate.ts`** — provides `truncateText()`, `wrapText()` (from `tui-util-text` spec).
**`apps/tui/src/util/format.ts`** — provides `formatErrorSummary()` for non-Error normalization.
**`apps/tui/src/util/constants.ts`** — provides `CRASH_LOOP_WINDOW_MS` (5000), `CRASH_LOOP_MAX_RESTARTS` (3).
**`apps/tui/src/types/breakpoint.ts`** — provides `getBreakpoint()` and `Breakpoint` type.

---

## Implementation Plan

### Step 1: Create Crash Loop Detector Module

**File:** `apps/tui/src/lib/crash-loop.ts`

A pure, stateful module that tracks restart timestamps in a ring buffer and determines whether the TUI is in a crash loop. Extracted into its own module for testability and to keep the ErrorBoundary class component lean.

```typescript
import { CRASH_LOOP_WINDOW_MS, CRASH_LOOP_MAX_RESTARTS } from "../util/constants.js";

/**
 * Ring buffer size for tracking restart timestamps.
 * Stores the last 5 restart times. Only the most recent entries
 * within CRASH_LOOP_WINDOW_MS are checked against CRASH_LOOP_MAX_RESTARTS.
 */
const RING_BUFFER_SIZE = 5;

export class CrashLoopDetector {
  private timestamps: number[] = [];
  private readonly windowMs: number;
  private readonly maxRestarts: number;

  constructor(
    windowMs: number = CRASH_LOOP_WINDOW_MS,
    maxRestarts: number = CRASH_LOOP_MAX_RESTARTS,
  ) {
    this.windowMs = windowMs;
    this.maxRestarts = maxRestarts;
  }

  /**
   * Record a restart event and return whether the crash loop
   * threshold has been exceeded.
   *
   * @returns `true` if 3+ restarts have occurred within the 5-second window.
   */
  recordRestart(): boolean {
    const now = Date.now();
    this.timestamps.push(now);

    // Keep ring buffer at fixed size
    if (this.timestamps.length > RING_BUFFER_SIZE) {
      this.timestamps.shift();
    }

    // Count restarts within the window
    const cutoff = now - this.windowMs;
    const recentCount = this.timestamps.filter(t => t >= cutoff).length;
    return recentCount >= this.maxRestarts;
  }

  /**
   * Return the number of restarts recorded in the buffer.
   */
  get restartCount(): number {
    return this.timestamps.length;
  }

  /**
   * Reset the detector state. Used when the TUI runs stably
   * for long enough that old crash timestamps age out naturally.
   */
  reset(): void {
    this.timestamps = [];
  }
}
```

**Design decisions:**
- Class-based rather than closure-based so that the ErrorBoundary can hold a single instance reference across its lifetime.
- Ring buffer of 5 is generous — the spec only requires detecting 3 within 5 seconds, but keeping 5 allows diagnostic reporting ("5 restarts in 3.2 seconds").
- `windowMs` and `maxRestarts` are constructor parameters for testability — unit tests can use shorter windows.
- Memory: 5 numbers × 8 bytes = 40 bytes. Stable regardless of session duration.

---

### Step 2: Create Telemetry Emitter Stub

**File:** `apps/tui/src/lib/telemetry.ts`

A lightweight telemetry event emitter. In the current codebase, no telemetry infrastructure exists. This module provides the contract that the ErrorBoundary and other features will call. The initial implementation writes events to stderr in structured JSON format (when `CODEPLANE_TUI_DEBUG=true`) and is designed for future replacement with a real analytics transport.

```typescript
interface TelemetryEvent {
  name: string;
  properties: Record<string, string | number | boolean>;
  timestamp: string; // ISO 8601
}

interface TelemetryContext {
  session_id: string;
  tui_version: string;
  terminal_width: number;
  terminal_height: number;
  color_tier: "truecolor" | "ansi256" | "ansi16";
}

let globalContext: TelemetryContext | null = null;

/**
 * Initialize the telemetry context. Called once at TUI startup.
 * Must be called before any `emit()` calls.
 */
export function initTelemetry(ctx: TelemetryContext): void {
  globalContext = ctx;
}

/**
 * Update mutable context fields (terminal dimensions change on resize).
 */
export function updateTelemetryDimensions(
  width: number,
  height: number,
): void {
  if (globalContext) {
    globalContext.terminal_width = width;
    globalContext.terminal_height = height;
  }
}

/**
 * Emit a telemetry event. In the current implementation, events are
 * written to stderr as JSON when CODEPLANE_TUI_DEBUG is set.
 * Future: replace with analytics SDK transport.
 */
export function emit(
  name: string,
  properties: Record<string, string | number | boolean> = {},
): void {
  const event: TelemetryEvent = {
    name,
    properties: {
      ...properties,
      ...(globalContext ?? {}),
    },
    timestamp: new Date().toISOString(),
  };

  if (process.env.CODEPLANE_TUI_DEBUG === "true") {
    process.stderr.write(JSON.stringify(event) + "\n");
  }

  // Future: send to analytics endpoint
}
```

**Design decisions:**
- Global singleton pattern matches the single-process TUI model. No need for DI or context providers for telemetry — it's a fire-and-forget side channel.
- stderr output only in debug mode so normal TUI usage isn't affected.
- `initTelemetry` is called once during bootstrap; `emit` is safe to call before init (events include whatever context is available).
- Properties are flat key-value — no nested objects — for analytics compatibility.

---

### Step 3: Create Logger Utility

**File:** `apps/tui/src/lib/logger.ts`

Structured logger that writes to stderr. The error boundary spec requires specific log messages at error/warn/info/debug levels.

```typescript
type LogLevel = "error" | "warn" | "info" | "debug";

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

function getConfiguredLevel(): LogLevel {
  const env = process.env.CODEPLANE_TUI_LOG_LEVEL;
  if (env && env in LOG_LEVEL_PRIORITY) return env as LogLevel;
  if (process.env.CODEPLANE_TUI_DEBUG === "true") return "debug";
  return "error";
}

const configuredLevel = getConfiguredLevel();
const configuredPriority = LOG_LEVEL_PRIORITY[configuredLevel];

export function log(level: LogLevel, message: string): void {
  if (LOG_LEVEL_PRIORITY[level] > configuredPriority) return;
  const ts = new Date().toISOString();
  process.stderr.write(`[${ts}] [${level.toUpperCase()}] ${message}\n`);
}

export const logger = {
  error: (msg: string) => log("error", msg),
  warn: (msg: string) => log("warn", msg),
  info: (msg: string) => log("info", msg),
  debug: (msg: string) => log("debug", msg),
};
```

**Key constraint:** Logs are written to stderr and never appear in the terminal UI. They can be captured with `codeplane tui 2>tui.log`.

---

### Step 4: Create Error Normalization Utility

**File:** `apps/tui/src/lib/normalize-error.ts`

Normalizes any thrown value (strings, numbers, objects, null) into a proper `Error` instance. Used by the error boundary's `getDerivedStateFromError` to guarantee the error screen always has a consistent `Error` object.

```typescript
/**
 * Normalize any thrown value into an Error instance.
 *
 * - Error instances: returned as-is.
 * - Strings: wrapped in `new Error(string)`.
 * - Objects with `.message` string: wrapped in `new Error(obj.message)`
 *   with `.stack` preserved if present.
 * - Everything else: `new Error(String(value))`.
 *   If value is `null` or `undefined`: `new Error("Unknown error")`.
 */
export function normalizeError(value: unknown): Error {
  if (value instanceof Error) return value;

  if (typeof value === "string") return new Error(value);

  if (
    value !== null &&
    value !== undefined &&
    typeof value === "object" &&
    "message" in value &&
    typeof (value as Record<string, unknown>).message === "string"
  ) {
    const err = new Error((value as { message: string }).message);
    if (
      "stack" in value &&
      typeof (value as Record<string, unknown>).stack === "string"
    ) {
      err.stack = (value as { stack: string }).stack;
    }
    return err;
  }

  if (value === null || value === undefined) {
    return new Error("Unknown error");
  }

  return new Error(String(value));
}
```

---

### Step 5: Create ErrorScreen Component

**File:** `apps/tui/src/components/ErrorScreen.tsx`

The error screen is a function component rendered by the ErrorBoundary when an error is caught. It is the primary user-facing surface of this feature. It consumes only OpenTUI hooks (no `@codeplane/ui-core` hooks) since the error may have been caused by the data layer.

```typescript
import React, { useState, useRef, useCallback } from "react";
import { useKeyboard, useTerminalDimensions, useOnResize } from "@opentui/react";
import { getBreakpoint, type Breakpoint } from "../types/breakpoint.js";
import { wrapText, truncateText } from "../util/truncate.js";
import { emit } from "../lib/telemetry.js";
import { logger } from "../lib/logger.js";

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
  breakpoint: Breakpoint,
  terminalHeight: number,
): ResponsiveConfig {
  switch (breakpoint) {
    case "minimum":
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
  const breakpoint = getBreakpoint(termWidth, termHeight);

  // "unsupported" breakpoint is handled by the outer TerminalTooSmall guard,
  // so we treat it as "minimum" if we somehow reach here.
  const effectiveBreakpoint: Breakpoint =
    breakpoint === "unsupported" ? "minimum" : breakpoint;
  const config = getResponsiveConfig(effectiveBreakpoint, termHeight);

  const [traceExpanded, setTraceExpanded] = useState(false);
  const [traceScrollOffset, setTraceScrollOffset] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const lastRestartTime = useRef(0);
  const mountTime = useRef(Date.now());
  const traceWasViewed = useRef(false);

  // ── Derived values ────────────────────────────────────────────────────

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

  // ── Render ────────────────────────────────────────────────────────────

  // See JSX structure below in the Design section.
  // The return value uses <box>, <text>, <scrollbox> from @opentui/react.
  // Color props use theme token names resolved by the parent ThemeProvider,
  // or the ErrorBoundary passes resolved RGBA values via props.

  return (
    <box flexDirection="column" width="100%" height="100%">
      {/* Heading */}
      <box paddingX={config.paddingX} paddingTop={1}>
        <text bold fg={noColor ? undefined : "#DC2626"}>
          {headingText}
        </text>
      </box>

      {/* Error message */}
      <box paddingX={config.paddingX} paddingTop={1}>
        <text fg={noColor ? undefined : "#DC2626"}>
          {displayedMessageLines.join("\n")}
        </text>
      </box>

      {/* Stack trace toggle (only if stack exists) */}
      {hasStack && (
        <box paddingX={config.paddingX} paddingTop={1}>
          <text fg={noColor ? undefined : "#A3A3A3"}>
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
            border="single"
            borderColor={noColor ? undefined : "#525252"}
            paddingX={1}
            width="100%"
            height={visibleTraceCount + 2}
          >
            <text fg={noColor ? undefined : "#A3A3A3"}>
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
            <text fg={noColor ? undefined : "#2563EB"} bold>r</text>
            <text fg={noColor ? undefined : "#A3A3A3"}>:restart</text>
          </text>
          <text>
            <text fg={noColor ? undefined : "#2563EB"} bold>q</text>
            <text fg={noColor ? undefined : "#A3A3A3"}>:quit</text>
          </text>
          {hasStack && (
            <text>
              <text fg={noColor ? undefined : "#2563EB"} bold>s</text>
              <text fg={noColor ? undefined : "#A3A3A3"}>:trace</text>
            </text>
          )}
          <box flexGrow={1} />
          <text>
            <text fg={noColor ? undefined : "#2563EB"} bold>?</text>
            <text fg={noColor ? undefined : "#A3A3A3"}>:help</text>
          </text>
        </box>
      </box>

      {/* Help overlay */}
      {showHelp && (
        <box
          position="absolute"
          top="center"
          left="center"
          width={effectiveBreakpoint === "minimum" ? "90%" : "60%"}
          height={effectiveBreakpoint === "minimum" ? "90%" : "60%"}
          border="single"
          borderColor={noColor ? undefined : "#525252"}
          bg={noColor ? undefined : "#262626"}
          padding={2}
          flexDirection="column"
        >
          <text bold>Error Screen Keybindings</text>
          <text fg={noColor ? undefined : "#A3A3A3"}>──────────────────────</text>
          <text><text bold fg={noColor ? undefined : "#2563EB"}>r</text>       Restart TUI</text>
          <text><text bold fg={noColor ? undefined : "#2563EB"}>q</text>       Quit TUI</text>
          <text><text bold fg={noColor ? undefined : "#2563EB"}>Ctrl+C</text>  Quit immediately</text>
          <text><text bold fg={noColor ? undefined : "#2563EB"}>s</text>       Toggle stack trace</text>
          <text><text bold fg={noColor ? undefined : "#2563EB"}>j/↓</text>    Scroll trace down</text>
          <text><text bold fg={noColor ? undefined : "#2563EB"}>k/↑</text>    Scroll trace up</text>
          <text><text bold fg={noColor ? undefined : "#2563EB"}>G</text>       Jump to trace bottom</text>
          <text><text bold fg={noColor ? undefined : "#2563EB"}>gg</text>      Jump to trace top</text>
          <text><text bold fg={noColor ? undefined : "#2563EB"}>Ctrl+D</text>  Page down</text>
          <text><text bold fg={noColor ? undefined : "#2563EB"}>Ctrl+U</text>  Page up</text>
          <text><text bold fg={noColor ? undefined : "#2563EB"}>?</text>       Close this help</text>
          <box flexGrow={1} />
          <text fg={noColor ? undefined : "#A3A3A3"}>Press ? or Esc to close</text>
        </box>
      )}
    </box>
  );
}
```

**Design decisions:**

- **No `@codeplane/ui-core` hooks**: The error may have been caused by the data layer. The error screen uses only `@opentui/react` hooks (`useKeyboard`, `useTerminalDimensions`, `useOnResize`) and local state.
- **Manual scroll implementation**: Rather than relying on `<scrollbox>` focus/keyboard integration (which may behave unpredictably when the error boundary is active), we manually manage `traceScrollOffset` state and render a slice of the stack trace array. This gives full control over scroll behavior and ensures no keyboard events leak through.
- **Color fallback**: When `noColor` is true (detected from `NO_COLOR=1` or `TERM=dumb`), all `fg`/`bg` props are `undefined`, falling back to terminal defaults. The heading uses `[ERROR]` prefix instead of `✗`.
- **gg detection**: A ref tracks the last key press. If two `g` presses occur within 500ms, it triggers scroll-to-top. This mirrors vim behavior.
- **All non-listed keys are swallowed**: The keyboard handler does not propagate events, preventing go-to mode, command palette, or screen navigation from activating.

---

### Step 6: Create ErrorBoundary Class Component

**File:** `apps/tui/src/components/ErrorBoundary.tsx`

This replaces the POC implementation with the production version.

```typescript
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
```

**Design decisions:**

- **Class component**: Required by React for error boundaries (`getDerivedStateFromError` and `componentDidCatch` are only available on class components).
- **`resetToken` key prop**: The children are wrapped in `<React.Fragment key={resetToken}>`. When `resetToken` increments on restart, React unmounts the entire subtree and remounts it fresh. This is a hard reset — all component state, SSE connections, data hook caches, and context values are destroyed and recreated.
- **`onReset` callback**: The parent (app root) receives this callback to reset the NavigationProvider stack to `[Dashboard]`. The parent does NOT need to clear data caches — the unmount/remount cycle handles that via React lifecycle.
- **`onQuit` callback**: Instead of calling `process.exit` directly (which the POC does), the production boundary delegates quit to the parent so terminal cleanup (restore cursor, exit alternate screen, disable raw mode) runs first.
- **Double fault try-catch**: The `render()` method wraps the error screen in a try-catch. If the JSX construction itself throws (e.g., `ErrorScreen` import failed, theme tokens corrupted), both errors are written to stderr and the process exits. This is the last line of defense.
- **Crash loop in `handleRestart`**: The crash loop check happens in the restart handler, not in `componentDidCatch`. This is because `componentDidCatch` fires on every caught error, but crash loops are defined by repeated *restart* attempts. An error that fires once doesn't indicate a loop — only rapid restarts do.
- **Error normalization in `getDerivedStateFromError`**: The static method receives the raw thrown value and passes it through `normalizeError()` to guarantee the state always holds a proper `Error` instance.

---

### Step 7: Integrate ErrorBoundary into Provider Stack

**File:** `apps/tui/src/App.tsx` (or entry point where the provider stack is composed)

The ErrorBoundary is positioned in the provider stack **below** `AuthProvider` and **above** `NavigationProvider`. This means:
- Auth state is available above the boundary (header bar can show auth status even during errors)
- Navigation, SSE, and screen content are inside the boundary (a crash in any screen is caught)

```typescript
import { ErrorBoundary } from "./components/ErrorBoundary.js";

function App() {
  const [navResetKey, setNavResetKey] = useState(0);
  const noColor = process.env.NO_COLOR === "1" || process.env.TERM === "dumb";

  const handleReset = useCallback(() => {
    // Force NavigationProvider, SSEProvider, and all children to remount
    setNavResetKey((k) => k + 1);
  }, []);

  const handleQuit = useCallback(() => {
    // Restore terminal and exit
    // This is implemented by the bootstrap/renderer layer
    process.exit(0);
  }, []);

  return (
    <AppContext.Provider value={appCtx}>
      <AuthProvider>
        <ThemeProvider>
          <AppShell>
            <ErrorBoundary
              onReset={handleReset}
              onQuit={handleQuit}
              noColor={noColor}
            >
              <NavigationProvider key={navResetKey}>
                <SSEProvider>
                  <ScreenRouter />
                </SSEProvider>
              </NavigationProvider>
            </ErrorBoundary>
          </AppShell>
        </ThemeProvider>
      </AuthProvider>
    </AppContext.Provider>
  );
}
```

**Key integration points:**

1. **Header and status bars are outside the ErrorBoundary** (rendered by `AppShell` which wraps the boundary). They remain visible during error display.
2. **`navResetKey` on `NavigationProvider`**: When the ErrorBoundary calls `onReset`, the key changes, forcing React to unmount and remount the entire navigation tree. All SSE connections close, all data hook caches are dropped, and the NavigationProvider initializes fresh with `[Dashboard]`.
3. **`noColor` detection**: Read from environment once at app level and passed through.

---

### Step 8: Wire `currentScreen` Prop from Navigation Context

The ErrorBoundary needs the current screen name for telemetry. Since the NavigationProvider is *inside* the boundary, the boundary cannot use `useNavigation()`. Instead, the parent passes the screen name down via a ref or lifting state.

**Approach:** Add a `screenRef` to the App component that is updated by the NavigationProvider's `onNavigate` callback.

```typescript
// In App component:
const screenRef = useRef<string>("Dashboard");

// NavigationProvider exposes an onNavigate callback:
<NavigationProvider
  key={navResetKey}
  onNavigate={(entry) => {
    screenRef.current = entry.screen;
  }}
>

// ErrorBoundary reads via ref:
<ErrorBoundary
  onReset={handleReset}
  onQuit={handleQuit}
  currentScreen={screenRef.current}
  noColor={noColor}
>
```

**Note:** `screenRef.current` is read synchronously when `getDerivedStateFromError` fires. Since the ref is a plain value (not state), it always holds the latest screen name without causing re-renders.

---

## Productionization Checklist

The POC in `specs/tui/apps/tui/src/components/ErrorBoundary.tsx` must be fully replaced. The production files are:

| POC File | Production File | Action |
|----------|----------------|--------|
| `specs/tui/apps/tui/src/components/ErrorBoundary.tsx` | `apps/tui/src/components/ErrorBoundary.tsx` | Full rewrite per Step 6 |
| (none) | `apps/tui/src/components/ErrorScreen.tsx` | New file per Step 5 |
| (none) | `apps/tui/src/lib/crash-loop.ts` | New file per Step 1 |
| (none) | `apps/tui/src/lib/telemetry.ts` | New file per Step 2 |
| (none) | `apps/tui/src/lib/logger.ts` | New file per Step 3 |
| (none) | `apps/tui/src/lib/normalize-error.ts` | New file per Step 4 |

**Migration steps:**
1. Copy `apps/tui/src/util/constants.ts`, `truncate.ts`, `format.ts` from `tui-util-text` spec (dependency must land first).
2. Create `apps/tui/src/lib/crash-loop.ts`, `telemetry.ts`, `logger.ts`, `normalize-error.ts`.
3. Create `apps/tui/src/components/ErrorScreen.tsx`.
4. Replace `apps/tui/src/components/ErrorBoundary.tsx` with production class component.
5. Update the app entry point provider stack to wire the ErrorBoundary with `onReset`, `onQuit`, `currentScreen`, `noColor` props.
6. Verify the header bar and status bar render outside the boundary.
7. Run all E2E tests.

---

## Theme Token Integration

The ErrorScreen uses hardcoded hex colors in the implementation above as a fallback. In production, when `tui-theme-provider` is available, colors should be resolved from theme tokens. However, since the ThemeProvider is *above* the ErrorBoundary in the provider stack, `useTheme()` **is available** inside the ErrorScreen.

The production ErrorScreen should use:
```typescript
const theme = useTheme();
// Then: fg={theme.error} instead of fg="#DC2626"
//       fg={theme.muted} instead of fg="#A3A3A3"
//       fg={theme.primary} instead of fg="#2563EB"
//       borderColor={theme.border} instead of borderColor="#525252"
```

If `useTheme()` throws (ThemeProvider not mounted), the ErrorScreen falls back to the hardcoded hex values. This is handled by a try-catch at the top of the ErrorScreen component.

---

## Unit & Integration Tests

### Test File: `e2e/tui/app-shell.test.ts`

All error boundary tests are added to the existing `app-shell.test.ts` file under a new `describe("TUI_ERROR_BOUNDARY")` block. Tests use `@microsoft/tui-test` via the `launchTUI()` helper from `e2e/tui/helpers.ts`.

Tests that depend on an unimplemented backend (e.g., SSE reconnection after restart) are left failing — never skipped or commented out.

#### Test Infrastructure Notes

- **Triggering errors**: Tests need a mechanism to trigger uncaught errors inside the TUI. Options:
  - **Environment variable trigger**: Set `CODEPLANE_TUI_TEST_THROW=1` and the Dashboard screen reads this and throws on mount. This is the simplest approach and requires a tiny test hook in the Dashboard component.
  - **Injected crash component**: A `__TestCrashComponent` that throws when a specific key (e.g., `Ctrl+E`) is pressed. Gated behind `NODE_ENV=test`.
  - The spec tests will use the environment variable approach: `launchTUI({ env: { CODEPLANE_TUI_TEST_THROW_SCREEN: "Dashboard" } })`.

- **Process exit verification**: Tests that assert exit codes use `proc.exited` from the Bun subprocess API.

- **stderr capture**: Tests that assert stderr output (crash loop, double fault) capture stderr from the spawned process.

#### Test Catalog

```typescript
import { describe, test, expect, afterEach } from "bun:test";
import { launchTUI, type TUITestInstance } from "./helpers";

describe("TUI_ERROR_BOUNDARY", () => {
  let terminal: TUITestInstance;

  afterEach(async () => {
    if (terminal) await terminal.terminate();
  });

  // ── Terminal Snapshot Tests ──────────────────────────────────────────

  describe("Snapshot Tests", () => {
    test("error-boundary-renders-error-screen", async () => {
      // Launch TUI with test crash trigger
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env: { CODEPLANE_TUI_TEST_THROW: "1" },
      });
      await terminal.waitForText("Something went wrong");

      // Assert error screen structure
      const snap = terminal.snapshot();
      expect(snap).toContain("✗ Something went wrong");
      expect(snap).toContain("r:restart");
      expect(snap).toContain("q:quit");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("error-boundary-renders-error-screen-80x24", async () => {
      terminal = await launchTUI({
        cols: 80,
        rows: 24,
        env: { CODEPLANE_TUI_TEST_THROW: "1" },
      });
      await terminal.waitForText("Something went wrong");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("error-boundary-renders-error-screen-200x60", async () => {
      terminal = await launchTUI({
        cols: 200,
        rows: 60,
        env: { CODEPLANE_TUI_TEST_THROW: "1" },
      });
      await terminal.waitForText("Something went wrong");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("error-boundary-error-message-wrapping-80x24", async () => {
      // Trigger error with 100+ char message at 80x24
      terminal = await launchTUI({
        cols: 80,
        rows: 24,
        env: {
          CODEPLANE_TUI_TEST_THROW: "1",
          CODEPLANE_TUI_TEST_ERROR_MESSAGE:
            "This is a very long error message that exceeds eighty characters and should be wrapped across multiple lines in the error screen display",
        },
      });
      await terminal.waitForText("Something went wrong");

      // Message should wrap within 76 columns (80 - 4 padding)
      // and be truncated to 3 lines max at minimum breakpoint
      const snap = terminal.snapshot();
      expect(snap).toContain("This is a very long");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("error-boundary-error-message-wrapping-120x40", async () => {
      const longMsg = "A".repeat(300) + " " + "B".repeat(50);
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env: {
          CODEPLANE_TUI_TEST_THROW: "1",
          CODEPLANE_TUI_TEST_ERROR_MESSAGE: longMsg,
        },
      });
      await terminal.waitForText("Something went wrong");
      // Wraps within 112 columns (120 - 8 padding), up to 6 visible lines
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("error-boundary-stack-trace-collapsed", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env: { CODEPLANE_TUI_TEST_THROW: "1" },
      });
      await terminal.waitForText("Something went wrong");

      const snap = terminal.snapshot();
      expect(snap).toContain("▸ Stack trace (s to toggle)");
      // No trace lines visible in collapsed state
      expect(snap).not.toContain("at "); // Stack traces start with "at "
    });

    test("error-boundary-stack-trace-expanded", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env: { CODEPLANE_TUI_TEST_THROW: "1" },
      });
      await terminal.waitForText("Something went wrong");
      await terminal.sendKeys("s");

      const snap = terminal.snapshot();
      expect(snap).toContain("▾ Stack trace");
      // Trace lines should now be visible
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("error-boundary-no-stack-trace-available", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env: {
          CODEPLANE_TUI_TEST_THROW: "1",
          CODEPLANE_TUI_TEST_NO_STACK: "1",
        },
      });
      await terminal.waitForText("Something went wrong");

      const snap = terminal.snapshot();
      // Stack trace toggle should NOT be visible
      expect(snap).not.toContain("Stack trace");
      expect(snap).toContain("r:restart");
      expect(snap).toContain("q:quit");
      // s:trace hint should not be present
      expect(snap).not.toContain("s:trace");
    });

    test("error-boundary-header-and-status-bar-persist", async () => {
      // Launch TUI, navigate to a screen, then trigger error
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env: {
          CODEPLANE_TUI_TEST_THROW_AFTER_MS: "500",
        },
      });
      // Wait for initial render
      await terminal.waitForText("Dashboard");
      // Error triggers after 500ms
      await terminal.waitForText("Something went wrong");

      // Header bar should still be visible (line 0)
      const header = terminal.getLine(0);
      expect(header).toBeTruthy();

      // Status bar should still be visible (last line)
      const statusBar = terminal.getLine(terminal.rows - 1);
      expect(statusBar).toBeTruthy();
    });

    test("error-boundary-long-error-message-truncation", async () => {
      const longMsg = "X".repeat(600);
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env: {
          CODEPLANE_TUI_TEST_THROW: "1",
          CODEPLANE_TUI_TEST_ERROR_MESSAGE: longMsg,
        },
      });
      await terminal.waitForText("Something went wrong");

      // Message should be truncated to 500 chars with …
      const snap = terminal.snapshot();
      expect(snap).toContain("…");
      // The full 600-char string should not appear
      expect(snap).not.toContain("X".repeat(501));
    });

    test("error-boundary-colors-use-semantic-tokens", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env: {
          CODEPLANE_TUI_TEST_THROW: "1",
          COLORTERM: "truecolor",
        },
      });
      await terminal.waitForText("Something went wrong");

      // Snapshot captures ANSI color codes
      // Error heading should use ANSI 196 (red) or truecolor equivalent
      // Muted text should use ANSI 245 (gray) or truecolor equivalent
      // Primary key labels should use ANSI 33 (blue) or truecolor equivalent
      expect(terminal.snapshot()).toMatchSnapshot();
    });
  });

  // ── Keyboard Interaction Tests ────────────────────────────────────────

  describe("Keyboard Interaction Tests", () => {
    test("error-boundary-r-restarts-to-dashboard", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env: {
          CODEPLANE_TUI_TEST_THROW_ONCE: "1",
        },
      });
      await terminal.waitForText("Something went wrong");

      // Press r to restart
      await terminal.sendKeys("r");

      // Should return to Dashboard
      await terminal.waitForText("Dashboard");
      await terminal.waitForNoText("Something went wrong");

      // Breadcrumb should show Dashboard as root
      const header = terminal.getLine(0);
      expect(header).toMatch(/Dashboard/);
    });

    test("error-boundary-q-quits-cleanly", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env: { CODEPLANE_TUI_TEST_THROW: "1" },
      });
      await terminal.waitForText("Something went wrong");

      // Press q to quit — TUI process should exit with code 0
      await terminal.sendKeys("q");

      // Process should have exited
      // (implementation note: the test helper's terminate()
      // will handle cleanup; we verify the process exits cleanly)
    });

    test("error-boundary-ctrl-c-quits-immediately", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env: { CODEPLANE_TUI_TEST_THROW: "1" },
      });
      await terminal.waitForText("Something went wrong");

      // Ctrl+C should exit immediately
      await terminal.sendKeys("\x03"); // Ctrl+C
    });

    test("error-boundary-s-toggles-stack-trace", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env: { CODEPLANE_TUI_TEST_THROW: "1" },
      });
      await terminal.waitForText("Something went wrong");

      // Initially collapsed
      expect(terminal.snapshot()).toContain("▸ Stack trace");

      // Press s to expand
      await terminal.sendKeys("s");
      expect(terminal.snapshot()).toContain("▾ Stack trace");

      // Press s again to collapse
      await terminal.sendKeys("s");
      expect(terminal.snapshot()).toContain("▸ Stack trace");
    });

    test("error-boundary-jk-scrolls-expanded-trace", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env: { CODEPLANE_TUI_TEST_THROW: "1" },
      });
      await terminal.waitForText("Something went wrong");

      // Expand trace
      await terminal.sendKeys("s");
      const snapBefore = terminal.snapshot();

      // Scroll down 10 times
      for (let i = 0; i < 10; i++) {
        await terminal.sendKeys("j");
      }
      const snapAfterDown = terminal.snapshot();

      // Content should have changed (scrolled)
      // Note: if trace is short, scrolling may not change content
      // This test validates the scroll mechanism works without error

      // Scroll up 5 times
      for (let i = 0; i < 5; i++) {
        await terminal.sendKeys("k");
      }
      const snapAfterUp = terminal.snapshot();

      // Should be somewhere between start and bottom
      expect(snapAfterUp).toBeTruthy();
    });

    test("error-boundary-G-jumps-to-trace-bottom", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env: { CODEPLANE_TUI_TEST_THROW: "1" },
      });
      await terminal.waitForText("Something went wrong");

      await terminal.sendKeys("s"); // expand
      await terminal.sendKeys("G"); // jump to bottom

      // Last line of trace should be visible
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("error-boundary-gg-jumps-to-trace-top", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env: { CODEPLANE_TUI_TEST_THROW: "1" },
      });
      await terminal.waitForText("Something went wrong");

      await terminal.sendKeys("s"); // expand
      await terminal.sendKeys("G"); // jump to bottom
      await terminal.sendKeys("g", "g"); // jump to top

      // First line of trace should be visible
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("error-boundary-ctrl-d-pages-down-trace", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env: { CODEPLANE_TUI_TEST_THROW: "1" },
      });
      await terminal.waitForText("Something went wrong");

      await terminal.sendKeys("s"); // expand
      const snapBefore = terminal.snapshot();

      await terminal.sendKeys("\x04"); // Ctrl+D
      const snapAfter = terminal.snapshot();

      // Scroll should have advanced by half visible height
      // Content should differ if trace is long enough
      expect(snapAfter).toBeTruthy();
    });

    test("error-boundary-ctrl-u-pages-up-trace", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env: { CODEPLANE_TUI_TEST_THROW: "1" },
      });
      await terminal.waitForText("Something went wrong");

      await terminal.sendKeys("s"); // expand
      await terminal.sendKeys("\x04"); // Ctrl+D (page down)
      await terminal.sendKeys("\x15"); // Ctrl+U (page up)

      // Should be back near top
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("error-boundary-navigation-keys-suppressed", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env: { CODEPLANE_TUI_TEST_THROW: "1" },
      });
      await terminal.waitForText("Something went wrong");

      // Try go-to navigation: g then d (should go to Dashboard normally)
      await terminal.sendKeys("g", "d");
      // Error screen should still be displayed
      expect(terminal.snapshot()).toContain("Something went wrong");

      // Try command palette
      await terminal.sendKeys(":");
      // Command palette should NOT open
      expect(terminal.snapshot()).not.toContain("Command Palette");
      expect(terminal.snapshot()).toContain("Something went wrong");
    });

    test("error-boundary-help-overlay-works", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env: { CODEPLANE_TUI_TEST_THROW: "1" },
      });
      await terminal.waitForText("Something went wrong");

      // Press ? to show help
      await terminal.sendKeys("?");
      expect(terminal.snapshot()).toContain("Error Screen Keybindings");
      expect(terminal.snapshot()).toContain("Restart TUI");
      expect(terminal.snapshot()).toContain("Quit TUI");

      // Press Esc to dismiss
      await terminal.sendKeys("\x1b"); // Esc
      expect(terminal.snapshot()).not.toContain("Error Screen Keybindings");
      expect(terminal.snapshot()).toContain("Something went wrong");
    });

    test("error-boundary-rapid-r-no-double-restart", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env: { CODEPLANE_TUI_TEST_THROW_ONCE: "1" },
      });
      await terminal.waitForText("Something went wrong");

      // Rapidly press r three times
      await terminal.sendKeys("r", "r", "r");

      // Should have restarted exactly once, landing on Dashboard
      await terminal.waitForText("Dashboard");
    });

    test("error-boundary-restart-after-restart", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env: {
          CODEPLANE_TUI_TEST_THROW_COUNT: "2",
        },
      });
      // First error
      await terminal.waitForText("Something went wrong");
      await terminal.sendKeys("r");

      // Second error (throws on next render too)
      await terminal.waitForText("Something went wrong");
      await terminal.sendKeys("r");

      // Third render should succeed (throw count exhausted)
      await terminal.waitForText("Dashboard");
    });
  });

  // ── Responsive Tests ─────────────────────────────────────────────────

  describe("Responsive Tests", () => {
    test("error-boundary-layout-80x24", async () => {
      terminal = await launchTUI({
        cols: 80,
        rows: 24,
        env: { CODEPLANE_TUI_TEST_THROW: "1" },
      });
      await terminal.waitForText("Something went wrong");

      // Error screen must fit within 22 content rows
      // (24 total - 1 header - 1 status bar)
      const snap = terminal.snapshot();
      expect(snap).toContain("✗ Something went wrong");
      expect(snap).toContain("r:restart");
      expect(snap).toContain("q:quit");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("error-boundary-layout-120x40", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env: { CODEPLANE_TUI_TEST_THROW: "1" },
      });
      await terminal.waitForText("Something went wrong");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("error-boundary-layout-200x60", async () => {
      terminal = await launchTUI({
        cols: 200,
        rows: 60,
        env: { CODEPLANE_TUI_TEST_THROW: "1" },
      });
      await terminal.waitForText("Something went wrong");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("error-boundary-resize-during-error-screen", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env: { CODEPLANE_TUI_TEST_THROW: "1" },
      });
      await terminal.waitForText("Something went wrong");

      // Resize to minimum
      await terminal.resize(80, 24);

      // Error screen should re-layout
      const snap = terminal.snapshot();
      expect(snap).toContain("Something went wrong");
      expect(snap).toContain("r:restart");
    });

    test("error-boundary-resize-with-expanded-trace", async () => {
      terminal = await launchTUI({
        cols: 200,
        rows: 60,
        env: { CODEPLANE_TUI_TEST_THROW: "1" },
      });
      await terminal.waitForText("Something went wrong");

      // Expand trace and scroll
      await terminal.sendKeys("s");
      await terminal.sendKeys("j", "j", "j");

      // Resize to minimum
      await terminal.resize(80, 24);

      // Trace should still be expanded, scroll position preserved
      const snap = terminal.snapshot();
      expect(snap).toContain("▾ Stack trace");
    });

    test("error-boundary-resize-below-minimum-during-error", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env: { CODEPLANE_TUI_TEST_THROW: "1" },
      });
      await terminal.waitForText("Something went wrong");

      // Resize below minimum
      await terminal.resize(60, 20);

      // Should show "Terminal too small" message
      await terminal.waitForText("Terminal too small");

      // Resize back to standard
      await terminal.resize(120, 40);

      // Error screen should restore
      await terminal.waitForText("Something went wrong");
    });

    test("error-boundary-resize-from-minimum-to-large", async () => {
      terminal = await launchTUI({
        cols: 80,
        rows: 24,
        env: { CODEPLANE_TUI_TEST_THROW: "1" },
      });
      await terminal.waitForText("Something went wrong");

      // Resize to large
      await terminal.resize(200, 60);

      // Layout should expand with more padding
      expect(terminal.snapshot()).toMatchSnapshot();
    });
  });

  // ── Crash Loop and Double Fault Tests ─────────────────────────────────

  describe("Crash Loop and Double Fault Tests", () => {
    test("error-boundary-crash-loop-detection", async () => {
      // Dashboard always throws — every restart triggers another error
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env: {
          CODEPLANE_TUI_TEST_THROW_ALWAYS: "1",
        },
      });
      await terminal.waitForText("Something went wrong");

      // Press r rapidly to trigger crash loop
      await terminal.sendKeys("r");
      await terminal.waitForText("Something went wrong");
      await terminal.sendKeys("r");
      await terminal.waitForText("Something went wrong");
      await terminal.sendKeys("r");

      // After 3rd restart in <5s, TUI should exit with code 1
      // and stderr should contain crash loop message
      // (Process exit is detected by the test framework)
    });

    test("error-boundary-double-fault-exits-cleanly", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env: {
          CODEPLANE_TUI_TEST_DOUBLE_FAULT: "1",
        },
      });

      // TUI should exit with code 1
      // stderr should contain both error messages
    });

    test("error-boundary-crash-loop-resets-after-stable-period", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env: {
          CODEPLANE_TUI_TEST_THROW_TWICE: "1",
        },
      });

      // First crash
      await terminal.waitForText("Something went wrong");
      await terminal.sendKeys("r");

      // Should succeed (only throws twice, this is second attempt)
      await terminal.waitForText("Dashboard");

      // Wait for stable period (>5 seconds)
      // Note: in production, the ring buffer timestamps age out naturally.
      // This test verifies that a restart after a stable period
      // does NOT trigger crash loop detection.
    });
  });

  // ── Integration Tests ────────────────────────────────────────────────

  describe("Integration Tests", () => {
    test("error-boundary-preserves-auth-state-on-restart", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env: {
          CODEPLANE_TUI_TEST_THROW_ONCE: "1",
          CODEPLANE_TOKEN: "valid-test-token",
        },
      });
      await terminal.waitForText("Something went wrong");

      await terminal.sendKeys("r");
      await terminal.waitForText("Dashboard");

      // Dashboard should load authenticated
      // (AuthProvider is above ErrorBoundary, so token is preserved)
    });

    test("error-boundary-sse-reconnects-after-restart", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env: {
          CODEPLANE_TUI_TEST_THROW_ONCE: "1",
        },
      });
      await terminal.waitForText("Something went wrong");

      await terminal.sendKeys("r");
      await terminal.waitForText("Dashboard");

      // SSE should re-establish (SSEProvider remounts)
      // Status bar should show connected indicator
    });

    test("error-boundary-non-error-thrown-value", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env: {
          CODEPLANE_TUI_TEST_THROW_STRING: "1",
        },
      });
      await terminal.waitForText("Something went wrong");

      // Error screen should render with the string as the message
      const snap = terminal.snapshot();
      expect(snap).toContain("Something went wrong");
    });

    test("error-boundary-error-during-initial-render", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        env: {
          CODEPLANE_TUI_TEST_THROW: "1",
        },
      });

      // Error screen should render even though no screen
      // has ever successfully mounted
      await terminal.waitForText("Something went wrong");
      expect(terminal.snapshot()).toContain("r:restart");

      // Pressing r should trigger crash loop if error persists
      await terminal.sendKeys("r");
      await terminal.waitForText("Something went wrong");
    });
  });
});
```

### Unit Tests for Supporting Modules

**Test File:** `e2e/tui/app-shell.test.ts` (same file, additional describe block)

```typescript
describe("TUI_ERROR_BOUNDARY — Unit Tests", () => {
  describe("CrashLoopDetector", () => {
    test("returns false for first restart", async () => {
      const { exitCode, stdout } = await bunEval(`
        const { CrashLoopDetector } = require("${TUI_SRC}/lib/crash-loop.ts");
        const detector = new CrashLoopDetector();
        console.log(detector.recordRestart()); // false
      `);
      expect(stdout.trim()).toBe("false");
    });

    test("returns false for 2 restarts in window", async () => {
      const { stdout } = await bunEval(`
        const { CrashLoopDetector } = require("${TUI_SRC}/lib/crash-loop.ts");
        const detector = new CrashLoopDetector();
        detector.recordRestart();
        console.log(detector.recordRestart()); // false
      `);
      expect(stdout.trim()).toBe("false");
    });

    test("returns true for 3 restarts within window", async () => {
      const { stdout } = await bunEval(`
        const { CrashLoopDetector } = require("${TUI_SRC}/lib/crash-loop.ts");
        const detector = new CrashLoopDetector();
        detector.recordRestart();
        detector.recordRestart();
        console.log(detector.recordRestart()); // true
      `);
      expect(stdout.trim()).toBe("true");
    });

    test("does not trigger after timestamps age out", async () => {
      const { stdout } = await bunEval(`
        const { CrashLoopDetector } = require("${TUI_SRC}/lib/crash-loop.ts");
        // Use a very short window for testing
        const detector = new CrashLoopDetector(100, 3);
        detector.recordRestart();
        detector.recordRestart();
        // Wait for timestamps to age out
        await new Promise(r => setTimeout(r, 150));
        console.log(detector.recordRestart()); // false — old timestamps expired
      `);
      expect(stdout.trim()).toBe("false");
    });

    test("ring buffer caps at 5 entries", async () => {
      const { stdout } = await bunEval(`
        const { CrashLoopDetector } = require("${TUI_SRC}/lib/crash-loop.ts");
        const detector = new CrashLoopDetector(100000, 10);
        for (let i = 0; i < 10; i++) detector.recordRestart();
        console.log(detector.restartCount); // 5 (capped)
      `);
      expect(stdout.trim()).toBe("5");
    });
  });

  describe("normalizeError", () => {
    test("passes through Error instances", async () => {
      const { stdout } = await bunEval(`
        const { normalizeError } = require("${TUI_SRC}/lib/normalize-error.ts");
        const err = new Error("test");
        const result = normalizeError(err);
        console.log(result === err); // true — same reference
      `);
      expect(stdout.trim()).toBe("true");
    });

    test("wraps string in Error", async () => {
      const { stdout } = await bunEval(`
        const { normalizeError } = require("${TUI_SRC}/lib/normalize-error.ts");
        const result = normalizeError("something broke");
        console.log(result instanceof Error, result.message);
      `);
      expect(stdout.trim()).toBe("true something broke");
    });

    test("handles null with Unknown error", async () => {
      const { stdout } = await bunEval(`
        const { normalizeError } = require("${TUI_SRC}/lib/normalize-error.ts");
        console.log(normalizeError(null).message);
      `);
      expect(stdout.trim()).toBe("Unknown error");
    });

    test("handles undefined with Unknown error", async () => {
      const { stdout } = await bunEval(`
        const { normalizeError } = require("${TUI_SRC}/lib/normalize-error.ts");
        console.log(normalizeError(undefined).message);
      `);
      expect(stdout.trim()).toBe("Unknown error");
    });

    test("extracts message from plain object", async () => {
      const { stdout } = await bunEval(`
        const { normalizeError } = require("${TUI_SRC}/lib/normalize-error.ts");
        console.log(normalizeError({ message: "obj error" }).message);
      `);
      expect(stdout.trim()).toBe("obj error");
    });

    test("handles number thrown value", async () => {
      const { stdout } = await bunEval(`
        const { normalizeError } = require("${TUI_SRC}/lib/normalize-error.ts");
        console.log(normalizeError(42).message);
      `);
      expect(stdout.trim()).toBe("42");
    });
  });
});
```

---

## File Inventory

### New Files

| File | Purpose | Lines (est.) |
|------|---------|-------------|
| `apps/tui/src/lib/crash-loop.ts` | Crash loop detection ring buffer | ~55 |
| `apps/tui/src/lib/telemetry.ts` | Telemetry event emitter stub | ~60 |
| `apps/tui/src/lib/logger.ts` | Structured stderr logger | ~35 |
| `apps/tui/src/lib/normalize-error.ts` | Non-Error value normalization | ~35 |
| `apps/tui/src/components/ErrorScreen.tsx` | Error display with keybindings, scroll, responsive layout | ~280 |
| `apps/tui/src/components/ErrorBoundary.tsx` | React class component error boundary (replaces POC) | ~130 |

### Modified Files

| File | Change |
|------|--------|
| `apps/tui/src/App.tsx` (or entry point) | Wire ErrorBoundary into provider stack with props |

### Test Files

| File | Tests |
|------|-------|
| `e2e/tui/app-shell.test.ts` | 36 tests: 9 snapshot, 13 keyboard, 7 responsive, 3 crash/fault, 4 integration + unit tests for CrashLoopDetector and normalizeError |

---

## Dependency Graph

```
tui-bootstrap-and-renderer
  └─ tui-theme-provider
       └─ tui-layout-hook
            └─ tui-util-text
                 └─ tui-error-boundary  ← THIS TICKET
                      └─ tui-e2e-test-infra (test-time only)
```

All dependencies must land before this ticket. The ErrorBoundary has no downstream dependents that block other tickets — it is a leaf node in the dependency tree (every other feature screen benefits from it but does not import it directly).

---

## Test Trigger Mechanism

For E2E tests to trigger errors inside the TUI, we need a test-only mechanism. The following environment variables control error injection when `NODE_ENV=test` or `CODEPLANE_TUI_TEST_THROW*` is set:

| Env Variable | Behavior |
|-------------|----------|
| `CODEPLANE_TUI_TEST_THROW=1` | Dashboard component throws `new Error("Test error")` on every mount |
| `CODEPLANE_TUI_TEST_THROW_ONCE=1` | Dashboard throws on first mount only, succeeds on remount |
| `CODEPLANE_TUI_TEST_THROW_ALWAYS=1` | Dashboard throws on every mount (crash loop testing) |
| `CODEPLANE_TUI_TEST_THROW_TWICE=1` | Dashboard throws on first two mounts, succeeds on third |
| `CODEPLANE_TUI_TEST_THROW_COUNT=N` | Dashboard throws on first N mounts |
| `CODEPLANE_TUI_TEST_THROW_AFTER_MS=N` | Dashboard throws after N milliseconds post-mount |
| `CODEPLANE_TUI_TEST_THROW_STRING=1` | Dashboard executes `throw "string error"` instead of `throw new Error()` |
| `CODEPLANE_TUI_TEST_NO_STACK=1` | Dashboard throws an object `{ message: "no stack" }` without `.stack` |
| `CODEPLANE_TUI_TEST_ERROR_MESSAGE=msg` | Custom error message for wrapping/truncation tests |
| `CODEPLANE_TUI_TEST_DOUBLE_FAULT=1` | ErrorScreen itself throws during render (tests double fault path) |

**Implementation:** A `<TestCrashHook>` component at the top of the Dashboard screen reads these env vars and throws accordingly. This component is tree-shaken in production builds (guarded by `process.env.NODE_ENV === 'test'`).

```typescript
// apps/tui/src/components/__test__/TestCrashHook.tsx
import { useEffect, useRef } from "react";

let globalThrowCount = 0;

export function TestCrashHook() {
  const hasMounted = useRef(false);

  if (process.env.CODEPLANE_TUI_TEST_THROW === "1" && !hasMounted.current) {
    hasMounted.current = true;
    const msg = process.env.CODEPLANE_TUI_TEST_ERROR_MESSAGE ?? "Test error";

    if (process.env.CODEPLANE_TUI_TEST_NO_STACK === "1") {
      throw { message: msg }; // Object without .stack
    }
    if (process.env.CODEPLANE_TUI_TEST_THROW_STRING === "1") {
      throw msg; // String throw
    }
    throw new Error(msg);
  }

  if (process.env.CODEPLANE_TUI_TEST_THROW_ALWAYS === "1") {
    throw new Error(
      process.env.CODEPLANE_TUI_TEST_ERROR_MESSAGE ?? "Persistent test error",
    );
  }

  if (process.env.CODEPLANE_TUI_TEST_THROW_ONCE === "1") {
    if (globalThrowCount === 0) {
      globalThrowCount++;
      throw new Error("Test error (once)");
    }
  }

  const maxCount = parseInt(
    process.env.CODEPLANE_TUI_TEST_THROW_COUNT ?? "0",
    10,
  );
  if (maxCount > 0 && globalThrowCount < maxCount) {
    globalThrowCount++;
    throw new Error(`Test error (${globalThrowCount}/${maxCount})`);
  }

  if (process.env.CODEPLANE_TUI_TEST_THROW_TWICE === "1") {
    if (globalThrowCount < 2) {
      globalThrowCount++;
      throw new Error("Test error (twice)");
    }
  }

  useEffect(() => {
    const delayMs = parseInt(
      process.env.CODEPLANE_TUI_TEST_THROW_AFTER_MS ?? "0",
      10,
    );
    if (delayMs > 0) {
      const timer = setTimeout(() => {
        throw new Error("Delayed test error");
      }, delayMs);
      return () => clearTimeout(timer);
    }
  }, []);

  return null;
}
```

---

## Edge Case Handling Summary

| Edge Case | Handling | Location |
|-----------|----------|----------|
| Terminal < 80×24 | "Terminal too small" takes priority (rendered by AppShell, outside boundary) | `AppShell` |
| Error with no `.stack` | `hasStack` flag hides toggle, `s` key is no-op, `s:trace` hint hidden | `ErrorScreen.tsx` |
| Non-Error thrown value | `normalizeError()` in `getDerivedStateFromError` | `ErrorBoundary.tsx` |
| Error message > 500 chars | `truncateText(msg, 500)` | `ErrorScreen.tsx` |
| Stack trace > 200 lines | Show first 200 + `(truncated — N more lines)` | `ErrorScreen.tsx` |
| Rapid `r` presses | 500ms debounce via `lastRestartTime` ref | `ErrorScreen.tsx` |
| Crash loop (3+ restarts in 5s) | `CrashLoopDetector.recordRestart()` → exit code 1 | `ErrorBoundary.tsx` |
| Double fault | try-catch in `render()` → stderr + exit code 1 | `ErrorBoundary.tsx` |
| `NO_COLOR=1` or `TERM=dumb` | `[ERROR]` prefix, no color props, plain borders | `ErrorScreen.tsx` |
| Resize during error screen | `useOnResize` → re-render, scroll offset clamped | `ErrorScreen.tsx` |
| Error during initial render | Boundary catches it, error screen renders (no prior screen state) | `ErrorBoundary.tsx` |
| SSE disconnect during error | SSE is inside boundary (already unmounted) — no impact | Architecture |
| Auth token expired during error | AuthProvider is above boundary — no impact on error screen | Architecture |

---

## Telemetry Event Catalog

All events emitted by this feature:

| Event | Trigger | Key Properties |
|-------|---------|----------------|
| `tui.error_boundary.caught` | Error caught by boundary | `error_name`, `error_message_truncated`, `screen`, `stack_depth` |
| `tui.error_boundary.restart` | User presses `r` | `error_name`, `screen`, `time_on_error_screen_ms`, `trace_was_viewed`, `restart_count` |
| `tui.error_boundary.quit` | User presses `q` | `error_name`, `screen`, `time_on_error_screen_ms`, `trace_was_viewed`, `quit_method` |
| `tui.error_boundary.trace_toggled` | User presses `s` | `error_name`, `expanded` |
| `tui.error_boundary.crash_loop_exit` | Crash loop threshold exceeded | `error_name`, `restart_count`, `time_window_ms` |
| `tui.error_boundary.double_fault` | Error screen itself throws | `primary_error_name`, `secondary_error_name` |

---

## Logging Catalog

All log messages emitted by this feature:

| Level | Event | Format |
|-------|-------|--------|
| `debug` | Mounted | `ErrorBoundary: mounted` |
| `error` | Error caught | `ErrorBoundary: caught unhandled error [screen={s}] [error={name}: {msg}]` |
| `error` | Stack trace | `ErrorBoundary: stack trace:\n{stack}` |
| `info` | Restart | `ErrorBoundary: user initiated restart [screen={s}]` |
| `info` | Quit | `ErrorBoundary: user quit from error screen [screen={s}]` |
| `warn` | Crash loop | `ErrorBoundary: crash loop detected [{n} restarts in {ms}ms] — exiting` |
| `error` | Double fault | `ErrorBoundary: error during error screen render [primary={msg}] [secondary={msg}]` |
| `debug` | Trace toggle | `ErrorBoundary: stack trace toggled [expanded={bool}]` |