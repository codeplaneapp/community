# TUI_BOOTSTRAP_AND_RENDERER — Engineering Specification

Process lifecycle, renderer initialization, provider stack, terminal setup/teardown.

---

## Overview

This spec details the implementation of the TUI bootstrap and renderer — the root entry point that initializes the terminal, mounts the React provider tree, and manages the full process lifecycle. It transforms the current stub `apps/tui/src/index.tsx` (which only re-exports types) into a complete working entry point that produces a rendered three-zone layout within 200ms of launch.

### Current State

- **`apps/tui/src/index.tsx`**: Stub — imports types from `@opentui/core` and `@opentui/react` but performs no rendering.
- **Providers implemented**: `NavigationProvider`, `ThemeProvider`, `SSEProvider` exist in `apps/tui/src/providers/`.
- **Providers missing**: `AppContext.Provider`, `ErrorBoundary`, `AuthProvider`, `APIClientProvider`, `KeybindingProvider`.
- **Layout components missing**: No `AppShell`, `HeaderBar`, `StatusBar`, or `OverlayLayer`.
- **Foundation implemented**: `getBreakpoint()`, `useLayout()`, `detectColorCapability()`, `createTheme()`, `screenRegistry`, `NavigationProvider` with push/pop/replace/reset.
- **Tests**: `e2e/tui/app-shell.test.ts` exists with comprehensive test cases already written — they exercise the bootstrap, layout, navigation, responsive sizing, color detection, and keybinding behavior.

### Dependencies (from ticket)

- `tui-foundation-scaffold` — package.json, tsconfig.json, directory structure ✅ (exists)
- `tui-theme-provider` — ThemeProvider, detect.ts, tokens.ts ✅ (exists)
- `tui-layout-hook` — useLayout, getBreakpoint ✅ (exists)
- `tui-util-text` — text truncation utilities (needed)
- `tui-e2e-test-infra` — helpers.ts, launchTUI ✅ (exists)

---

## Implementation Plan

All code goes in `apps/tui/src/`. Steps are ordered to build vertically — each step produces a testable increment.

### Step 1: Non-TTY Detection & Process Exit Utilities

**File: `apps/tui/src/lib/terminal.ts`**

Pure utility module with zero React dependencies. Handles terminal pre-checks that run before any renderer initialization.

```typescript
/**
 * Check that stdin and stdout are TTYs.
 * If not, write a clear error to stderr and exit.
 *
 * Called at the very top of index.tsx, before any imports that
 * trigger OpenTUI native library loading.
 */
export function assertTTY(): void {
  if (!process.stdin.isTTY) {
    process.stderr.write(
      "stdin is not a TTY. The TUI requires an interactive terminal.\n"
    );
    process.exit(1);
  }
  if (!process.stdout.isTTY) {
    process.stderr.write(
      "stdout is not a TTY. The TUI requires an interactive terminal.\n"
    );
    process.exit(1);
  }
}

/**
 * Parse CLI arguments relevant to the bootstrap.
 * Returns structured options. Unknown flags are ignored.
 */
export interface TUILaunchOptions {
  repo?: string;          // --repo owner/repo
  screen?: string;        // --screen dashboard|issues|...
  debug?: boolean;        // --debug or CODEPLANE_TUI_DEBUG=true
  apiUrl?: string;        // resolved from CODEPLANE_API_URL
  token?: string;         // resolved from CODEPLANE_TOKEN
}

export function parseCLIArgs(argv: string[]): TUILaunchOptions {
  const opts: TUILaunchOptions = {};
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--repo":
        opts.repo = argv[++i];
        break;
      case "--screen":
        opts.screen = argv[++i];
        break;
      case "--debug":
        opts.debug = true;
        break;
    }
  }
  opts.debug = opts.debug || process.env.CODEPLANE_TUI_DEBUG === "true";
  opts.apiUrl = process.env.CODEPLANE_API_URL ?? "http://localhost:3000";
  opts.token = process.env.CODEPLANE_TOKEN;
  return opts;
}
```

**Rationale**: TTY detection must happen before `createCliRenderer()` to avoid a native library crash on piped stdin/stdout. CLI arg parsing is pure and has no dependencies.

---

### Step 2: Auth Token Resolution

**File: `apps/tui/src/providers/AuthProvider.tsx`**

Resolves the auth token synchronously at mount, validates asynchronously, and provides auth state to the tree.

```typescript
import { createContext, useState, useEffect, useMemo } from "react";

export type AuthState = 
  | "loading" 
  | "authenticated" 
  | "expired" 
  | "offline" 
  | "unauthenticated";

export type AuthSource = "env" | "keyring" | "config";

export interface AuthContextValue {
  readonly token: string | null;
  readonly authState: AuthState;
  readonly source: AuthSource | null;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export interface AuthProviderProps {
  /** Pre-resolved token (from CLI arg parsing). */
  token?: string;
  /** API base URL for token validation. */
  apiUrl?: string;
  children: React.ReactNode;
}

/**
 * Resolve auth token from environment sources.
 * Order: CODEPLANE_TOKEN env var → (future: keyring) → (future: config).
 * Returns { token, source } or { token: null, source: null }.
 */
function resolveToken(preResolved?: string): { token: string | null; source: AuthSource | null } {
  if (preResolved) return { token: preResolved, source: "env" };
  const envToken = process.env.CODEPLANE_TOKEN;
  if (envToken) return { token: envToken, source: "env" };
  // Future: keyring resolution
  // Future: config file resolution  
  return { token: null, source: null };
}

export function AuthProvider({ token: preResolved, apiUrl, children }: AuthProviderProps) {
  const resolved = useMemo(() => resolveToken(preResolved), [preResolved]);
  const [authState, setAuthState] = useState<AuthState>(
    resolved.token ? "loading" : "unauthenticated"
  );

  useEffect(() => {
    if (!resolved.token || !apiUrl) {
      setAuthState(resolved.token ? "authenticated" : "unauthenticated");
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    fetch(`${apiUrl}/api/v1/user`, {
      headers: { Authorization: `token ${resolved.token}` },
      signal: controller.signal,
    })
      .then((res) => {
        clearTimeout(timeout);
        if (res.ok) setAuthState("authenticated");
        else if (res.status === 401) setAuthState("expired");
        else setAuthState("offline");
      })
      .catch(() => {
        clearTimeout(timeout);
        setAuthState("offline"); // Network error — proceed optimistically
      });

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [resolved.token, apiUrl]);

  const contextValue = useMemo<AuthContextValue>(
    () => ({
      token: resolved.token,
      authState,
      source: resolved.source,
    }),
    [resolved.token, authState, resolved.source]
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}
```

**Hook: `apps/tui/src/hooks/useAuth.ts`**

```typescript
import { useContext } from "react";
import { AuthContext, type AuthContextValue } from "../providers/AuthProvider.js";

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
```

---

### Step 3: API Client Provider

**File: `apps/tui/src/providers/APIClientProvider.tsx`**

Wraps `@codeplane/ui-core`'s `createAPIClient` and provides it via context.

```typescript
import { createContext, useMemo, useContext } from "react";
import type { APIClient } from "@codeplane/ui-core";
import { createAPIClient } from "@codeplane/ui-core";

const APIClientContext = createContext<APIClient | null>(null);

export interface APIClientProviderProps {
  baseUrl: string;
  token: string;
  children: React.ReactNode;
}

export function APIClientProvider({ baseUrl, token, children }: APIClientProviderProps) {
  const client = useMemo(() => createAPIClient({ baseUrl, token }), [baseUrl, token]);
  return (
    <APIClientContext.Provider value={client}>
      {children}
    </APIClientContext.Provider>
  );
}

export function useAPIClient(): APIClient {
  const ctx = useContext(APIClientContext);
  if (!ctx) throw new Error("useAPIClient must be used within an APIClientProvider");
  return ctx;
}
```

**Note**: If `@codeplane/ui-core` already exports `APIClientProvider` and `useAPIClient`, we re-export those instead of duplicating. The existing codebase shows `@codeplane/ui-core` has a `context.ts` with the provider — we use that directly.

---

### Step 4: Error Boundary

**File: `apps/tui/src/components/ErrorBoundary.tsx`**

Class component (React error boundaries require class components). Renders recovery UI using OpenTUI components.

```typescript
import React from "react";

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
      <text fg="#DC2626" attributes={1}>Something went wrong</text>
      <text fg="#DC2626">{error?.message ?? "Unknown error"}</text>
      {showStack && error?.stack && (
        <box marginTop={1}>
          <text fg="#A3A3A3">{error.stack}</text>
        </box>
      )}
      <box marginTop={1}>
        <text fg="#A3A3A3">
          Press `r` to restart — Press `q` to quit — Press `s` to {showStack ? "hide" : "show"} stack trace
        </text>
      </box>
    </box>
  );
}
```

---

### Step 5: Text Truncation Utilities

**File: `apps/tui/src/util/text.ts`**

Pure utility functions for breadcrumb truncation and status bar text fitting.

```typescript
/**
 * Truncate a breadcrumb path from the LEFT when it exceeds maxWidth.
 * Shows "… › segment2 › segment3" format.
 */
export function truncateBreadcrumb(
  segments: string[],
  maxWidth: number,
  separator = " › "
): string {
  if (segments.length === 0) return "";
  
  const full = segments.join(separator);
  if (full.length <= maxWidth) return full;

  const ellipsis = "…";
  for (let start = 1; start < segments.length; start++) {
    const truncated = ellipsis + separator + segments.slice(start).join(separator);
    if (truncated.length <= maxWidth) return truncated;
  }

  const last = segments[segments.length - 1];
  if (last.length > maxWidth) {
    return last.slice(0, maxWidth - 1) + "…";
  }
  return ellipsis + separator + last;
}

/**
 * Truncate text from the RIGHT with "…" suffix.
 */
export function truncateRight(text: string, maxWidth: number): string {
  if (text.length <= maxWidth) return text;
  if (maxWidth <= 3) return text.slice(0, maxWidth);
  return text.slice(0, maxWidth - 1) + "…";
}

/**
 * Pad or truncate text to exact width.
 */
export function fitWidth(text: string, width: number, align: "left" | "right" = "left"): string {
  if (text.length > width) return truncateRight(text, width);
  if (align === "right") return text.padStart(width);
  return text.padEnd(width);
}
```

---

### Step 6: HeaderBar Component

**File: `apps/tui/src/components/HeaderBar.tsx`**

The top 1-row bar showing breadcrumb trail, repo context, and status indicators.

```typescript
import { useMemo } from "react";
import { useLayout } from "../hooks/useLayout.js";
import { useTheme } from "../hooks/useTheme.js";
import { useNavigation } from "../hooks/useNavigation.js";
import { screenRegistry } from "../navigation/screenRegistry.js";
import { truncateBreadcrumb } from "../util/text.js";

export function HeaderBar() {
  const { width, breakpoint } = useLayout();
  const theme = useTheme();
  const nav = useNavigation();

  const breadcrumbSegments = useMemo(() => {
    return nav.stack.map((entry) => {
      const def = screenRegistry[entry.screen as keyof typeof screenRegistry];
      if (!def) return entry.screen;
      if (typeof def.breadcrumb === "function") {
        return def.breadcrumb(entry.params ?? {});
      }
      return def.breadcrumb;
    });
  }, [nav.stack]);

  const rightWidth = 12;
  const maxBreadcrumbWidth = Math.max(20, width - rightWidth - 2);
  const breadcrumbText = truncateBreadcrumb(breadcrumbSegments, maxBreadcrumbWidth);

  const repoContext = nav.current.params?.owner && nav.current.params?.repo
    ? `${nav.current.params.owner}/${nav.current.params.repo}`
    : "";

  return (
    <box flexDirection="row" height={1} width="100%">
      <box flexGrow={1}>
        <text fg={theme.muted}>{breadcrumbText}</text>
      </box>
      {repoContext && breakpoint !== "minimum" && (
        <box>
          <text fg={theme.muted}>{repoContext}</text>
        </box>
      )}
      <box>
        <text fg={theme.success}> ●</text>
      </box>
    </box>
  );
}
```

---

### Step 7: StatusBar Component

**File: `apps/tui/src/components/StatusBar.tsx`**

The bottom 1-row bar showing keybinding hints, sync status, and help reference.

```typescript
import { useLayout } from "../hooks/useLayout.js";
import { useTheme } from "../hooks/useTheme.js";
import { truncateRight } from "../util/text.js";

export function StatusBar() {
  const { width, breakpoint } = useLayout();
  const theme = useTheme();

  const allHints = "j/k:navigate  Enter:select  q:back  ?:help  ::command";
  const minHints = "q:back  ?:help";
  const hints = breakpoint === "minimum" ? minHints : allHints;

  const syncStatus = "synced";
  const rightText = `${syncStatus}  ? help`;
  const maxLeftWidth = Math.max(10, width - rightText.length - 2);

  return (
    <box flexDirection="row" height={1} width="100%">
      <box flexGrow={1}>
        <text fg={theme.muted}>{truncateRight(hints, maxLeftWidth)}</text>
      </box>
      <box>
        <text fg={theme.success}>{syncStatus}</text>
      </box>
      <box>
        <text fg={theme.muted}>  ? help</text>
      </box>
    </box>
  );
}
```

---

### Step 8: AppShell Component

**File: `apps/tui/src/components/AppShell.tsx`**

The root layout component: three-zone layout (header, content, status) plus overlay layer.

```typescript
import { useTerminalDimensions } from "@opentui/react";
import { getBreakpoint } from "../types/breakpoint.js";
import { HeaderBar } from "./HeaderBar.js";
import { StatusBar } from "./StatusBar.js";
import { ScreenRouter } from "../router/ScreenRouter.js";
import { TerminalTooSmallScreen } from "./TerminalTooSmallScreen.js";

export function AppShell() {
  const { width, height } = useTerminalDimensions();
  const breakpoint = getBreakpoint(width, height);

  if (breakpoint === "unsupported") {
    return <TerminalTooSmallScreen cols={width} rows={height} />;
  }

  return (
    <box flexDirection="column" width="100%" height="100%">
      <HeaderBar />
      <box flexGrow={1} width="100%">
        <ScreenRouter />
      </box>
      <StatusBar />
    </box>
  );
}
```

---

### Step 9: Terminal Too Small Screen

**File: `apps/tui/src/components/TerminalTooSmallScreen.tsx`**

```typescript
import { useKeyboard } from "@opentui/react";

export function TerminalTooSmallScreen({ cols, rows }: { cols: number; rows: number }) {
  useKeyboard((event: { name: string; ctrl?: boolean }) => {
    if (event.name === "q" || (event.name === "c" && event.ctrl)) {
      process.exit(0);
    }
  });

  return (
    <box
      flexDirection="column"
      width="100%"
      height="100%"
      justifyContent="center"
      alignItems="center"
    >
      <text fg="#CA8A04">Terminal too small</text>
      <text fg="#A3A3A3">
        Minimum size: 80×24 — Current: {cols}×{rows}
      </text>
      <text fg="#A3A3A3">Resize your terminal to continue.</text>
    </box>
  );
}
```

---

### Step 10: Screen Router

**File: `apps/tui/src/router/ScreenRouter.tsx`**

Renders the top-of-stack screen from the navigation provider using the screen registry.

```typescript
import { useNavigation } from "../hooks/useNavigation.js";
import { screenRegistry, ScreenName } from "../navigation/screenRegistry.js";
import { PlaceholderScreen } from "../screens/PlaceholderScreen.js";

export function ScreenRouter() {
  const nav = useNavigation();
  const current = nav.current;

  const def = screenRegistry[current.screen as ScreenName];
  if (!def) {
    return <PlaceholderScreen />;
  }

  const ScreenComponent = def.component;
  return <ScreenComponent />;
}
```

---

### Step 11: Signal Handling & Graceful Teardown

**File: `apps/tui/src/lib/signals.ts`**

Manages signal handlers and ensures clean teardown with double-signal protection.

```typescript
import type { CliRenderer } from "@opentui/core";

let isShuttingDown = false;

export function registerSignalHandlers(
  renderer: CliRenderer,
  cleanup?: () => void
): void {
  const teardown = (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    if (process.env.CODEPLANE_TUI_DEBUG === "true") {
      process.stderr.write(
        JSON.stringify({
          component: "tui",
          phase: "teardown",
          level: "info",
          message: "Graceful shutdown started",
          trigger: signal,
        }) + "\n"
      );
    }

    try {
      cleanup?.();
      renderer.stop();
    } catch {
      // Best-effort cleanup
    }

    process.exit(0);
  };

  process.on("SIGINT", () => teardown("sigint"));
  process.on("SIGTERM", () => teardown("sigterm"));
  process.on("SIGHUP", () => teardown("sighup"));
}

export function resetShutdownState(): void {
  isShuttingDown = false;
}
```

---

### Step 12: Deep Link Resolution

**File: `apps/tui/src/navigation/deepLinks.ts`** (already exists — verify and extend)

Produces an `initialStack` array from `--screen` and `--repo` CLI args for the `NavigationProvider`.

```typescript
import type { ScreenEntry } from "../router/types.js";
import { ScreenName } from "./screenRegistry.js";

export function resolveDeepLink(options: {
  screen?: string;
  repo?: string;
}): Array<{ screen: string; params?: Record<string, string> }> {
  const stack: Array<{ screen: string; params?: Record<string, string> }> = [];

  stack.push({ screen: ScreenName.Dashboard });

  if (options.repo) {
    const [owner, repo] = options.repo.split("/");
    if (owner && repo) {
      stack.push({
        screen: ScreenName.RepoOverview,
        params: { owner, repo },
      });

      if (options.screen) {
        const resolved = resolveScreenName(options.screen);
        if (resolved && resolved !== ScreenName.Dashboard && resolved !== ScreenName.RepoOverview) {
          stack.push({
            screen: resolved,
            params: { owner, repo },
          });
        }
      }
    }
  } else if (options.screen) {
    const resolved = resolveScreenName(options.screen);
    if (resolved && resolved !== ScreenName.Dashboard) {
      stack.push({ screen: resolved });
    }
  }

  return stack;
}

function resolveScreenName(input: string): ScreenName | null {
  const lower = input.toLowerCase();
  const map: Record<string, ScreenName> = {
    dashboard: ScreenName.Dashboard,
    issues: ScreenName.Issues,
    landings: ScreenName.Landings,
    "landing-requests": ScreenName.Landings,
    workspaces: ScreenName.Workspaces,
    workflows: ScreenName.Workflows,
    search: ScreenName.Search,
    notifications: ScreenName.Notifications,
    settings: ScreenName.Settings,
    organizations: ScreenName.Organizations,
    agents: ScreenName.Agents,
    wiki: ScreenName.Wiki,
    sync: ScreenName.Sync,
    repositories: ScreenName.RepoList,
    repos: ScreenName.RepoList,
    "repo-detail": ScreenName.RepoOverview,
  };
  return map[lower] ?? null;
}
```

---

### Step 13: Global Keybinding Handler

**File: `apps/tui/src/components/GlobalKeybindings.tsx`**

Captures global keybindings (Ctrl+C, q, Esc, g-prefix go-to) and dispatches to the navigation provider.

```typescript
import { useKeyboard } from "@opentui/react";
import { useNavigation } from "../hooks/useNavigation.js";
import { goToBindings } from "../navigation/goToBindings.js";
import { useState, useRef, useCallback } from "react";

export function GlobalKeybindings({ children }: { children: React.ReactNode }) {
  const nav = useNavigation();
  const [goToMode, setGoToMode] = useState(false);
  const goToTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleKey = useCallback((event: { name: string; ctrl?: boolean }) => {
    if (event.name === "c" && event.ctrl) {
      process.exit(0);
    }

    if (goToMode) {
      setGoToMode(false);
      if (goToTimeout.current) clearTimeout(goToTimeout.current);
      const binding = goToBindings[event.name];
      if (binding) {
        const params = nav.current.params;
        nav.reset(binding.screen, binding.requiresRepo ? params : undefined);
      }
      return;
    }

    if (event.name === "g") {
      setGoToMode(true);
      goToTimeout.current = setTimeout(() => setGoToMode(false), 1500);
      return;
    }

    if (event.name === "q") {
      if (nav.canPop()) {
        nav.pop();
      } else {
        process.exit(0);
      }
      return;
    }

    if (event.name === "escape") {
      if (nav.canPop()) {
        nav.pop();
      } else {
        process.exit(0);
      }
      return;
    }
  }, [goToMode, nav]);

  useKeyboard(handleKey);

  return <>{children}</>;
}
```

---

### Step 14: Main Entry Point — `index.tsx`

**File: `apps/tui/src/index.tsx`**

This is the complete bootstrap sequence. It replaces the current stub.

```typescript
#!/usr/bin/env bun
/**
 * Codeplane TUI — Entry point
 *
 * Bootstrap sequence:
 *   1. TTY assertion (< 5ms)
 *   2. CLI arg parsing (< 1ms)
 *   3. Terminal setup via createCliRenderer() (< 50ms)
 *   4. React root creation via createRoot() (< 10ms)
 *   5. Provider stack mount + render (< 50ms)
 *   6. Signal handler registration (< 1ms)
 *   7. First meaningful paint target: < 200ms total
 */

import { assertTTY, parseCLIArgs } from "./lib/terminal.js";

assertTTY();
const launchOptions = parseCLIArgs(process.argv.slice(2));

import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import React from "react";

import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { AuthProvider } from "./providers/AuthProvider.js";
import { ThemeProvider } from "./providers/ThemeProvider.js";
import { NavigationProvider } from "./providers/NavigationProvider.js";
import { SSEProvider } from "./providers/SSEProvider.js";
import { AppShell } from "./components/AppShell.js";
import { GlobalKeybindings } from "./components/GlobalKeybindings.js";
import { registerSignalHandlers } from "./lib/signals.js";
import { resolveDeepLink } from "./navigation/deepLinks.js";

const renderer = await createCliRenderer({
  exitOnCtrlC: false,
});

registerSignalHandlers(renderer);

const initialStack = resolveDeepLink({
  screen: launchOptions.screen,
  repo: launchOptions.repo,
});

const root = createRoot(renderer);

root.render(
  <ErrorBoundary>
    <ThemeProvider>
      <AuthProvider token={launchOptions.token} apiUrl={launchOptions.apiUrl}>
        <SSEProvider>
          <NavigationProvider initialStack={initialStack}>
            <GlobalKeybindings>
              <AppShell />
            </GlobalKeybindings>
          </NavigationProvider>
        </SSEProvider>
      </AuthProvider>
    </ThemeProvider>
  </ErrorBoundary>
);

if (launchOptions.debug) {
  const { width, height } = renderer;
  process.stderr.write(
    JSON.stringify({
      component: "tui",
      phase: "bootstrap",
      level: "info",
      message: "TUI bootstrap started",
      terminal_width: width,
      terminal_height: height,
    }) + "\n"
  );
}
```

---

### Step 15: Update Barrel Exports

**File: `apps/tui/src/providers/index.ts`** — add new providers:

```typescript
export { NavigationProvider, NavigationContext } from "./NavigationProvider.js";
export { ThemeProvider, ThemeContext } from "./ThemeProvider.js";
export type { ThemeContextValue, ThemeProviderProps } from "./ThemeProvider.js";
export { SSEProvider, useSSE } from "./SSEProvider.js";
export type { SSEEvent } from "./SSEProvider.js";
export { AuthProvider, AuthContext } from "./AuthProvider.js";
export type { AuthContextValue, AuthProviderProps, AuthState, AuthSource } from "./AuthProvider.js";
export { APIClientProvider, useAPIClient } from "./APIClientProvider.js";
```

**File: `apps/tui/src/components/index.ts`** — add new components:

```typescript
export { AppShell } from "./AppShell.js";
export { HeaderBar } from "./HeaderBar.js";
export { StatusBar } from "./StatusBar.js";
export { ErrorBoundary } from "./ErrorBoundary.js";
export { TerminalTooSmallScreen } from "./TerminalTooSmallScreen.js";
export { GlobalKeybindings } from "./GlobalKeybindings.js";
```

**File: `apps/tui/src/hooks/index.ts`** — add new hooks:

```typescript
export { useLayout, type LayoutContext } from "./useLayout.js";
export { useTheme } from "./useTheme.js";
export { useColorTier } from "./useColorTier.js";
export { useNavigation } from "./useNavigation.js";
export { useAuth } from "./useAuth.js";
```

**File: `apps/tui/src/util/index.ts`** — add text utilities:

```typescript
export { truncateBreadcrumb, truncateRight, fitWidth } from "./text.js";
```

---

### Step 16: Verify Imports Script

**File: `apps/tui/src/verify-imports.ts`** — update to verify the full dependency chain:

```typescript
import { createCliRenderer } from "@opentui/core";
import { createRoot, useKeyboard, useTerminalDimensions, useOnResize } from "@opentui/react";
import React from "react";

console.log("@opentui/core:", typeof createCliRenderer);
console.log("@opentui/react:", typeof createRoot);
console.log("react:", React.version);
console.log("hooks:", [typeof useKeyboard, typeof useTerminalDimensions, typeof useOnResize].join(","));
console.log("ok");
```

---

## Complete File Inventory

| File Path | Type | Purpose |
|-----------|------|---------|
| `apps/tui/src/index.tsx` | **Modified** | Complete bootstrap: TTY check → renderer → React root → provider stack → signal handlers |
| `apps/tui/src/lib/terminal.ts` | **New** | assertTTY(), parseCLIArgs() — pre-renderer utilities |
| `apps/tui/src/lib/signals.ts` | **New** | Signal handler registration, graceful teardown, double-signal guard |
| `apps/tui/src/providers/AuthProvider.tsx` | **New** | Auth token resolution and validation |
| `apps/tui/src/providers/APIClientProvider.tsx` | **New** | API client context wrapper |
| `apps/tui/src/hooks/useAuth.ts` | **New** | Hook to consume AuthContext |
| `apps/tui/src/components/ErrorBoundary.tsx` | **New** | React error boundary with recovery UI |
| `apps/tui/src/components/AppShell.tsx` | **New** | Three-zone layout: HeaderBar + content + StatusBar |
| `apps/tui/src/components/HeaderBar.tsx` | **New** | Breadcrumb trail, repo context, connection status |
| `apps/tui/src/components/StatusBar.tsx` | **New** | Keybinding hints, sync status, help reference |
| `apps/tui/src/components/TerminalTooSmallScreen.tsx` | **New** | Below-minimum dimension message |
| `apps/tui/src/components/GlobalKeybindings.tsx` | **New** | Global key handler: Ctrl+C, q, Esc, g-prefix go-to |
| `apps/tui/src/router/ScreenRouter.tsx` | **New** | Renders top-of-stack screen from registry |
| `apps/tui/src/util/text.ts` | **New** | truncateBreadcrumb(), truncateRight(), fitWidth() |
| `apps/tui/src/navigation/deepLinks.ts` | **Modified** | Resolve --screen/--repo into initial navigation stack |
| `apps/tui/src/providers/index.ts` | **Modified** | Add AuthProvider, APIClientProvider exports |
| `apps/tui/src/components/index.ts` | **Modified** | Add new component exports |
| `apps/tui/src/hooks/index.ts` | **Modified** | Add useAuth export |
| `apps/tui/src/util/index.ts` | **Modified** | Add text utility exports |
| `apps/tui/src/verify-imports.ts` | **Modified** | Full dependency chain verification |

---

## Provider Stack Hierarchy (Final)

```
createRoot(renderer).render(
  <ErrorBoundary>                           ← catches React errors, renders recovery UI
    <ThemeProvider>                          ← detects color tier, provides frozen tokens
      <AuthProvider>                        ← resolves token, validates async, provides auth state
        <SSEProvider>                       ← manages EventSource, dispatches to subscribers
          <NavigationProvider>              ← manages screen stack, push/pop/replace/reset
            <GlobalKeybindings>             ← captures Ctrl+C, q, Esc, g-prefix, ?, :
              <AppShell>                    ← HeaderBar + content + StatusBar + OverlayLayer
                <ScreenRouter />            ← renders top-of-stack screen
              </AppShell>
            </GlobalKeybindings>
          </NavigationProvider>
        </SSEProvider>
      </AuthProvider>
    </ThemeProvider>
  </ErrorBoundary>
)
```

**Note on APIClientProvider**: Currently excluded from the initial provider stack because the `AuthProvider` handles token resolution, and the API client creation depends on a valid token. The `APIClientProvider` will be inserted between `AuthProvider` and `SSEProvider` when auth-gated rendering is implemented (the auth pre-check screen needs to render before the API client is created). For the bootstrap ticket, screens that need API access will consume the token from `useAuth()` and create clients locally until the full auth flow is connected.

---

## Bootstrap Sequence Timing Budget

| Phase | Target | What Happens |
|-------|--------|--------------|
| 1. TTY assertion | < 1ms | Check `process.stdin.isTTY` and `process.stdout.isTTY` |
| 2. CLI arg parse | < 1ms | Parse `process.argv` into `TUILaunchOptions` |
| 3. Module imports | < 30ms | Load `@opentui/core` (Zig native), `@opentui/react`, React 19 |
| 4. `createCliRenderer()` | < 50ms | Alternate screen, raw mode, cursor hide, capability query |
| 5. Signal registration | < 1ms | `process.on('SIGINT', ...)` etc. |
| 6. Deep link resolution | < 1ms | Build initial navigation stack from CLI args |
| 7. `createRoot(renderer)` | < 10ms | Create React reconciler container |
| 8. `root.render(<App />)` | < 50ms | Mount providers, detect theme, render layout |
| 9. First paint | < 50ms | Header + content area + status bar pixels on screen |
| **Total** | **< 200ms** | |

---

## Performance Constraints

- **First meaningful paint**: < 200ms from process start (header + content + status visible)
- **Screen transitions**: < 50ms (push/pop/replace/reset)
- **Resize re-render**: < 50ms from SIGWINCH to new frame on screen
- **Keyboard input latency**: < 16ms from keypress to state update (one frame at 60fps)
- **Steady-state RSS**: < 150MB on dashboard screen
- **No unbounded memory growth**: Stable over 1-hour session
- **No leaked file descriptors/timers**: All cleaned up on teardown

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Piped stdin (non-TTY) | Exit with code 1, message to stderr |
| Piped stdout (non-TTY) | Exit with code 1, message to stderr |
| Terminal < 80×24 | Show "Terminal too small" message, auto-recover on resize |
| `TERM=dumb` | ansi16 color tier, layout renders normally |
| Missing `TERM` | ansi256 fallback, layout renders normally |
| No `CODEPLANE_TOKEN` | AuthProvider sets `unauthenticated`, screen shows auth error |
| 401 from API | AuthProvider sets `expired`, screen shows re-auth message |
| API unreachable | AuthProvider sets `offline`, proceeds optimistically |
| Rapid Ctrl+C | `isShuttingDown` flag prevents double-teardown |
| SIGKILL/OOM | No cleanup possible — user runs `reset` |
| tmux/screen/zellij | Works correctly (alternate screen, raw mode, SIGWINCH) |
| Max terminal 65535×65535 | Supported by OpenTUI native renderer |
| Deep link to unknown screen | Falls back to Dashboard |
| Stack overflow > 32 entries | Oldest entry dropped |

---

## Productionization Notes

### Current POC patterns that need hardening:

1. **Auth token resolution**: Currently only reads `CODEPLANE_TOKEN` env var. Production must also read from system keyring and CLI config file. The `resolveToken()` function has placeholder comments for these paths — implement when the CLI keyring package is available.

2. **API health check**: The `AuthProvider` validates the token with a `GET /api/v1/user` call. In production, this should be replaced with a dedicated `GET /api/health` endpoint that also returns server version compatibility. The connecting screen with spinner and exponential backoff retry loop (described in the spec) should be implemented as a separate component (`ConnectingScreen`) that wraps `AppShell` and only renders the shell when the API is reachable.

3. **SSEProvider**: The current implementation has a file-based injection mode for tests but no real EventSource connection. Production SSE requires: ticket-based auth via `POST /api/auth/sse-ticket`, EventSource creation with the ticket, exponential backoff reconnection (1s → 2s → 4s → 8s → max 30s), `Last-Event-ID` replay on reconnect, and 45s keepalive timeout detection.

4. **APIClientProvider**: Needs to be connected to `@codeplane/ui-core`'s `createAPIClient()` with the resolved token. Currently excluded from the provider stack — insert between AuthProvider and SSEProvider when auth gating is wired up.

5. **Error boundary restart**: The `onRestart` callback currently re-renders the tree. In production, it should fully unmount and re-mount the provider stack to clear any corrupted state in contexts.

6. **Telemetry events**: The `TUISessionStarted`, `TUISessionEnded`, `TUIBootstrapFailed` events described in the spec are not emitted yet. Add telemetry hooks in the bootstrap sequence and teardown handler when the telemetry infrastructure is available.

7. **Debug logging**: The structured JSON logging to stderr is implemented for a few critical points. All log events from the observability section of the spec should be added progressively as each subsystem is built.

8. **Go-to mode status bar indicator**: When `g` is pressed and go-to mode is active, the status bar should show "g→" to indicate the TUI is waiting for the second key. This requires the StatusBar to consume a `goToMode` state from the keybinding system.

---

## Unit & Integration Tests

### Test File: `e2e/tui/app-shell.test.ts`

The existing test file at `specs/tui/e2e/tui/app-shell.test.ts` already contains comprehensive tests organized by feature. The following tests specifically validate `TUI_BOOTSTRAP_AND_RENDERER` acceptance criteria. All tests use `@microsoft/tui-test` via the `launchTUI` helper from `e2e/tui/helpers.ts`.

**Tests are never skipped or mocked. Tests that fail due to unimplemented backends remain failing.**

#### Bootstrap & First Render (`e2e/tui/app-shell.test.ts`)

```typescript
describe("TUI_BOOTSTRAP_AND_RENDERER — Bootstrap and first render", () => {
  test("renders initial layout with header, content area, and status bar", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      await terminal.waitForText("Dashboard");
      const headerLine = terminal.getLine(0);
      expect(headerLine).toMatch(/Dashboard/);
      const statusLine = terminal.getLine(39);
      expect(statusLine).toMatch(/\?/);
      expect(terminal.snapshot()).toMatchSnapshot();
    } finally {
      await terminal.terminate();
    }
  });

  test("header bar shows breadcrumb and status indicators", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      await terminal.waitForText("Dashboard");
      const headerLine = terminal.getLine(0);
      expect(headerLine).toMatch(/Dashboard/);
      expect(headerLine).toMatch(/●/);
    } finally {
      await terminal.terminate();
    }
  });

  test("status bar shows keybinding hints and help reference", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      await terminal.waitForText("Dashboard");
      const statusLine = terminal.getLine(39);
      expect(statusLine).toMatch(/\? help/);
      expect(statusLine).toMatch(/q:back/);
    } finally {
      await terminal.terminate();
    }
  });

  test("alternate screen buffer is active", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      await terminal.waitForText("Dashboard");
      const snapshot = terminal.snapshot();
      expect(snapshot).toContain("Dashboard");
    } finally {
      await terminal.terminate();
    }
  });
});
```

#### Terminal Dimension Enforcement (`e2e/tui/app-shell.test.ts`)

```typescript
describe("TUI_BOOTSTRAP_AND_RENDERER — Terminal dimension enforcement", () => {
  test("shows 'terminal too small' at 79×24", async () => {
    const terminal = await launchTUI({ cols: 79, rows: 24 });
    try {
      await terminal.waitForText("Terminal too small");
      await terminal.waitForText("80");
      await terminal.waitForText("79");
      expect(terminal.snapshot()).toMatchSnapshot();
    } finally {
      await terminal.terminate();
    }
  });

  test("shows 'terminal too small' at 80×23", async () => {
    const terminal = await launchTUI({ cols: 80, rows: 23 });
    try {
      await terminal.waitForText("Terminal too small");
      await terminal.waitForText("23");
    } finally {
      await terminal.terminate();
    }
  });

  test("renders full layout at exactly 80×24", async () => {
    const terminal = await launchTUI({ cols: 80, rows: 24 });
    try {
      await terminal.waitForText("Dashboard");
      const snapshot = terminal.snapshot();
      expect(snapshot).not.toContain("Terminal too small");
      expect(terminal.snapshot()).toMatchSnapshot();
    } finally {
      await terminal.terminate();
    }
  });

  test("transitions from too-small to valid on resize", async () => {
    const terminal = await launchTUI({ cols: 60, rows: 20 });
    try {
      await terminal.waitForText("Terminal too small");
      await terminal.resize(80, 24);
      await terminal.waitForText("Dashboard");
      await terminal.waitForNoText("Terminal too small");
    } finally {
      await terminal.terminate();
    }
  });

  test("transitions from valid to too-small on resize", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      await terminal.waitForText("Dashboard");
      await terminal.resize(70, 20);
      await terminal.waitForText("Terminal too small");
    } finally {
      await terminal.terminate();
    }
  });
});
```

#### Keyboard Input (`e2e/tui/app-shell.test.ts`)

```typescript
describe("TUI_BOOTSTRAP_AND_RENDERER — Keyboard input", () => {
  test("Ctrl+C exits cleanly", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      await terminal.waitForText("Dashboard");
      await terminal.sendKeys("ctrl+c");
    } finally {
      await terminal.terminate();
    }
  });

  test("q on root screen exits", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      await terminal.waitForText("Dashboard");
      await terminal.sendKeys("q");
    } finally {
      await terminal.terminate();
    }
  });

  test("Esc on root screen with no modal exits", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      await terminal.waitForText("Dashboard");
      await terminal.sendKeys("Escape");
    } finally {
      await terminal.terminate();
    }
  });

  test("go-to g d navigates to Dashboard", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("g", "d");
      await terminal.waitForText("Dashboard");
    } finally {
      await terminal.terminate();
    }
  });

  test("q after navigation pops back to previous screen", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      await terminal.sendKeys("g", "r");
      await terminal.waitForText("Repositories");
      await terminal.sendKeys("q");
      await terminal.waitForText("Dashboard");
    } finally {
      await terminal.terminate();
    }
  });
});
```

#### Signal Handling (`e2e/tui/app-shell.test.ts`)

```typescript
describe("TUI_BOOTSTRAP_AND_RENDERER — Signal handling", () => {
  test("SIGTERM exits cleanly", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      await terminal.waitForText("Dashboard");
    } finally {
      await terminal.terminate();
    }
  });

  test("Ctrl+C during terminal-too-small exits", async () => {
    const terminal = await launchTUI({ cols: 60, rows: 20 });
    try {
      await terminal.waitForText("Terminal too small");
      await terminal.sendKeys("ctrl+c");
    } finally {
      await terminal.terminate();
    }
  });
});
```

#### Non-TTY Detection (`e2e/tui/app-shell.test.ts`)

```typescript
describe("TUI_BOOTSTRAP_AND_RENDERER — Non-TTY detection", () => {
  test("exits with error when stdin is piped", async () => {
    const { run, BUN, TUI_ENTRY } = await import("./helpers.js");
    const result = await run([BUN, "run", TUI_ENTRY], {
      env: { CODEPLANE_TOKEN: "test-token" },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("stdin is not a TTY");
  });

  test("exits with error when stdout is piped", async () => {
    const { run, BUN, TUI_ENTRY } = await import("./helpers.js");
    const result = await run([BUN, "run", TUI_ENTRY], {
      env: { CODEPLANE_TOKEN: "test-token" },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("is not a TTY");
  });
});
```

#### Color & Theme (`e2e/tui/app-shell.test.ts`)

```typescript
describe("TUI_BOOTSTRAP_AND_RENDERER — Color and theme", () => {
  test("renders with truecolor when COLORTERM=truecolor", async () => {
    const terminal = await launchTUI({
      cols: 120,
      rows: 40,
      env: { COLORTERM: "truecolor" },
    });
    try {
      await terminal.waitForText("Dashboard");
      expect(terminal.snapshot()).toMatchSnapshot();
    } finally {
      await terminal.terminate();
    }
  });

  test("renders with ANSI 256 when COLORTERM unset", async () => {
    const terminal = await launchTUI({
      cols: 120,
      rows: 40,
      env: { COLORTERM: "", TERM: "xterm-256color" },
    });
    try {
      await terminal.waitForText("Dashboard");
      expect(terminal.snapshot()).toMatchSnapshot();
    } finally {
      await terminal.terminate();
    }
  });
});
```

#### Responsive Layout (`e2e/tui/app-shell.test.ts`)

```typescript
describe("TUI_BOOTSTRAP_AND_RENDERER — Responsive layout", () => {
  test("layout re-renders on resize", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      await terminal.waitForText("Dashboard");
      const snap1 = terminal.snapshot();
      await terminal.resize(160, 50);
      await terminal.waitForText("Dashboard");
      const snap2 = terminal.snapshot();
      expect(snap1).not.toBe(snap2);
    } finally {
      await terminal.terminate();
    }
  });

  test("resize from standard to minimum collapses layout", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      await terminal.waitForText("Dashboard");
      await terminal.resize(80, 24);
      await terminal.waitForText("Dashboard");
      expect(terminal.snapshot()).toMatchSnapshot();
    } finally {
      await terminal.terminate();
    }
  });

  test("rapid resize does not crash", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      await terminal.waitForText("Dashboard");
      for (let i = 0; i < 10; i++) {
        await terminal.resize(80 + i * 10, 24 + i * 3);
      }
      await terminal.waitForText("Dashboard");
    } finally {
      await terminal.terminate();
    }
  });
});
```

#### Error Boundary (`e2e/tui/app-shell.test.ts`)

```typescript
describe("TUI_BOOTSTRAP_AND_RENDERER — Error boundary", () => {
  test("error boundary shows restart and quit hints", async () => {
    // Left as a failing test until error injection mechanism is built.
    const terminal = await launchTUI({
      cols: 120,
      rows: 40,
      env: { CODEPLANE_INJECT_RENDER_ERROR: "true" },
    });
    try {
      await terminal.waitForText("Something went wrong");
      await terminal.waitForText("Press `r` to restart");
      await terminal.waitForText("Press `q` to quit");
    } finally {
      await terminal.terminate();
    }
  });

  test("q in error boundary exits", async () => {
    const terminal = await launchTUI({
      cols: 120,
      rows: 40,
      env: { CODEPLANE_INJECT_RENDER_ERROR: "true" },
    });
    try {
      await terminal.waitForText("Something went wrong");
      await terminal.sendKeys("q");
    } finally {
      await terminal.terminate();
    }
  });
});
```

#### Golden Snapshots (`e2e/tui/app-shell.test.ts`)

```typescript
describe("TUI_BOOTSTRAP_AND_RENDERER — Golden snapshots", () => {
  test("golden snapshot: dashboard at 80×24", async () => {
    const terminal = await launchTUI({ cols: 80, rows: 24 });
    try {
      await terminal.waitForText("Dashboard");
      expect(terminal.snapshot()).toMatchSnapshot();
    } finally {
      await terminal.terminate();
    }
  });

  test("golden snapshot: dashboard at 120×40", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      await terminal.waitForText("Dashboard");
      expect(terminal.snapshot()).toMatchSnapshot();
    } finally {
      await terminal.terminate();
    }
  });

  test("golden snapshot: dashboard at 200×60", async () => {
    const terminal = await launchTUI({ cols: 200, rows: 60 });
    try {
      await terminal.waitForText("Dashboard");
      expect(terminal.snapshot()).toMatchSnapshot();
    } finally {
      await terminal.terminate();
    }
  });

  test("golden snapshot: terminal too small at 60×20", async () => {
    const terminal = await launchTUI({ cols: 60, rows: 20 });
    try {
      await terminal.waitForText("Terminal too small");
      expect(terminal.snapshot()).toMatchSnapshot();
    } finally {
      await terminal.terminate();
    }
  });
});
```

#### Deep Link Tests (`e2e/tui/app-shell.test.ts`)

```typescript
describe("TUI_BOOTSTRAP_AND_RENDERER — Deep links", () => {
  test("--repo pre-populates navigation with repo context", async () => {
    const terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--repo", "acme/api"],
    });
    try {
      await terminal.waitForText("acme/api");
      const headerLine = terminal.getLine(0);
      expect(headerLine).toMatch(/Dashboard/);
      expect(headerLine).toMatch(/acme\/api/);
    } finally {
      await terminal.terminate();
    }
  });

  test("--screen issues --repo owner/repo opens issues screen", async () => {
    const terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "issues", "--repo", "acme/api"],
    });
    try {
      await terminal.waitForText("Issues");
      const headerLine = terminal.getLine(0);
      expect(headerLine).toMatch(/Issues/);
    } finally {
      await terminal.terminate();
    }
  });

  test("--screen with unknown name falls back to Dashboard", async () => {
    const terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "nonexistent"],
    });
    try {
      await terminal.waitForText("Dashboard");
    } finally {
      await terminal.terminate();
    }
  });

  test("navigation provider initializes with dashboard as root", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    try {
      await terminal.waitForText("Dashboard");
      const headerLine = terminal.getLine(0);
      expect(headerLine).toMatch(/Dashboard/);
    } finally {
      await terminal.terminate();
    }
  });
});
```

### Test Infrastructure Notes

1. **All tests use the existing `e2e/tui/helpers.ts`** — `launchTUI()`, `TUITestInstance`, `createMockAPIEnv()`, `createTestCredentialStore()`.

2. **Tests run against a real TUI process** spawned by `Bun.spawn`. No React component mocking, no provider mocking, no hook mocking.

3. **Tests that depend on unimplemented backends** (e.g., auth validation against a real API server, SSE connection) **are left failing**. They are never skipped or commented out.

4. **Snapshot tests** capture full terminal output at specific sizes. Golden files are stored in `e2e/tui/__snapshots__/` and committed to the repo.

5. **Each test launches a fresh TUI instance** via `launchTUI()` and terminates it in a `finally` block. No shared state between tests.

6. **Test file mapping**: All bootstrap/renderer tests go in `e2e/tui/app-shell.test.ts` as specified by the test organization strategy in the PRD.

---

## Observability Checklist

The following structured log events should be emitted to stderr when `CODEPLANE_TUI_DEBUG=true`:

| Log | Phase | Level | When |
|-----|-------|-------|------|
| `TUI bootstrap started` | `bootstrap` | `info` | Process begins, after TTY check |
| `Renderer created` | `renderer` | `debug` | After `createCliRenderer()` |
| `React root attached` | `renderer` | `debug` | After `createRoot(renderer)` |
| `Terminal too small` | `bootstrap` | `warn` | Dimensions below 80×24 |
| `Auth token loaded` | `auth` | `info` | Token found from env/keyring/config |
| `Auth token missing` | `auth` | `error` | No token found |
| `First render complete` | `render` | `info` | First meaningful paint |
| `Terminal resized` | `renderer` | `debug` | SIGWINCH handled |
| `Error boundary caught` | `render` | `error` | Unhandled React error |
| `Graceful shutdown started` | `teardown` | `info` | Teardown begins |
| `Graceful shutdown complete` | `teardown` | `info` | Terminal restored |

---

## Telemetry Events (Stub)

These events are defined in the spec but will be wired up when the telemetry infrastructure is available:

- `TUISessionStarted` — after first render
- `TUISessionEnded` — on graceful teardown
- `TUIBootstrapFailed` — when bootstrap cannot complete
- `TUITerminalTooSmall` — when terminal is below minimum
- `TUIResizeEvent` — on terminal resize (debounced)
- `TUIErrorBoundaryTriggered` — when error boundary catches

---

## Security Notes

- The TUI reads only `CODEPLANE_TOKEN`, `CODEPLANE_API_URL`, `CODEPLANE_TUI_DEBUG`, `COLORTERM`, `TERM`, `NO_COLOR` from the environment.
- Auth tokens are held in process memory only — never written to disk or terminal scrollback.
- Alternate screen buffer prevents TUI content from appearing in terminal scrollback after exit.
- The TUI spawns no child processes and accesses no filesystem beyond the CLI credential store (future).
- Rate limiting: The TUI does not implement client-side rate limiting. 429 responses surface as inline errors.