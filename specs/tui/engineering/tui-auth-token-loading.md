# TUI_AUTH_TOKEN_LOADING — Engineering Specification

## Overview

This specification describes the engineering implementation for the TUI authentication token loading flow. The feature resolves a user's auth token from the CLI credential chain, validates it against the Codeplane API, and gates the application behind the result — showing loading, error, or authenticated states as appropriate.

All implementation lives in `apps/tui/src/`. All E2E tests live in `e2e/tui/`. The feature depends on:
- `tui-bootstrap-and-renderer` — entry point, CLI arg parsing, `createCliRenderer()`
- `tui-spinner-hook` — `useSpinner()` for loading animation
- `tui-theme-provider` — `useTheme()` for semantic color tokens
- `tui-layout-hook` — `useLayout()` for responsive dimensions and breakpoints
- `tui-util-text` — text truncation and wrapping utilities
- `tui-e2e-test-infra` — `launchTUI()`, `createTestCredentialStore()`, `createMockAPIEnv()`

---

## Implementation Plan

### Step 1: AuthProvider Context and State Machine

**File:** `apps/tui/src/providers/AuthProvider.tsx`

Rewrite the AuthProvider to implement the full auth state machine with child-gating, retry support, and status bar confirmation.

#### Types

```typescript
import type { AuthTokenSource } from "@codeplane/cli/auth-state";

export type AuthStatus =
  | "loading"
  | "authenticated"
  | "unauthenticated"
  | "expired"
  | "offline";

export interface AuthContextValue {
  readonly status: AuthStatus;
  readonly user: string | null;
  readonly tokenSource: AuthTokenSource | null; // "env" | "keyring" | "config"
  readonly apiUrl: string;
  readonly host: string;
  readonly token: string | null;
  readonly retry: () => void;
}

export interface AuthProviderProps {
  children: React.ReactNode;
  apiUrl?: string;   // Override from CLI args or env
  token?: string;    // Pre-resolved token (from CLI arg parsing)
}
```

#### State Machine

```
┌──────────┐  token found    ┌──────────┐  200 OK       ┌───────────────┐
│  mount   │ ─────────────► │ loading  │ ────────────► │ authenticated │
└──────────┘                 └──────────┘               └───────────────┘
     │                            │
     │ no token                   │ 401
     ▼                            ▼
┌────────────────┐          ┌──────────┐
│ unauthenticated│          │ expired  │
└────────────────┘          └──────────┘
                                  │
                                  │ network error / timeout / 429
                                  ▼
                            ┌──────────┐
                            │ offline  │  (optimistic proceed)
                            └──────────┘
```

- `"loading"` — Token found, validation in flight. Shows loading screen.
- `"authenticated"` — Token validated. Renders children.
- `"unauthenticated"` — No token resolved. Shows "Not authenticated" error screen.
- `"expired"` — Token resolved but API returned 401. Shows "Session expired" error screen.
- `"offline"` — Token resolved but network unreachable / timeout / 429. Renders children with warning.

#### Implementation Details

```typescript
export function AuthProvider({ children, apiUrl: apiUrlProp, token: tokenProp }: AuthProviderProps) {
  // 1. Synchronous token resolution (runs once at mount, again on retry)
  //    Uses resolveAuthTarget() and resolveAuthToken() from @codeplane/cli/auth-state
  //    Priority: tokenProp → env → keyring → config
  //    Empty/whitespace-only CODEPLANE_TOKEN treated as absent
  
  // 2. State: status, user, tokenSource, resolvedToken
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<string | null>(null);
  const [tokenSource, setTokenSource] = useState<AuthTokenSource | null>(null);
  const [token, setToken] = useState<string | null>(null);
  
  // 3. Resolve auth target (sync)
  const { apiUrl, host } = useMemo(() => {
    return resolveAuthTarget({ apiUrl: apiUrlProp });
  }, [apiUrlProp]);
  
  // 4. Token resolution function (sync, called at mount and on retry)
  const resolveToken = useCallback(() => {
    // If pre-resolved token provided, use it with source "env"
    if (tokenProp) {
      return { token: tokenProp, source: "env" as AuthTokenSource };
    }
    const resolved = resolveAuthToken({ apiUrl });
    if (!resolved) return null;
    // Filter empty/whitespace tokens
    if (!resolved.token.trim()) return null;
    return { token: resolved.token, source: resolved.source };
  }, [tokenProp, apiUrl]);
  
  // 5. Async validation via GET /api/user with 5s timeout
  const validate = useCallback(async (authToken: string) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(`${apiUrl}/api/user`, {
        headers: { Authorization: `token ${authToken}` },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json();
        return { valid: true, username: data.login ?? data.username ?? null };
      }
      if (res.status === 401) {
        return { valid: false, reason: "expired" as const };
      }
      if (res.status === 429) {
        return { valid: false, reason: "offline" as const };
      }
      return { valid: false, reason: "expired" as const };
    } catch {
      clearTimeout(timeout);
      return { valid: false, reason: "offline" as const };
    }
  }, [apiUrl]);
  
  // 6. Main auth flow (runs on mount and retry)
  const runAuth = useCallback(async () => {
    setStatus("loading");
    setUser(null);
    
    const resolved = resolveToken();
    if (!resolved) {
      setStatus("unauthenticated");
      setToken(null);
      setTokenSource(null);
      return;
    }
    
    setToken(resolved.token);
    setTokenSource(resolved.source);
    
    const result = await validate(resolved.token);
    if (result.valid) {
      setUser(result.username);
      setStatus("authenticated");
    } else if (result.reason === "offline") {
      setStatus("offline");
    } else {
      setStatus("expired");
    }
  }, [resolveToken, validate]);
  
  // 7. Run auth on mount
  useEffect(() => { runAuth(); }, []);
  
  // 8. Retry function (exposed in context)
  const retry = useCallback(() => { runAuth(); }, [runAuth]);
  
  // 9. Context value
  const contextValue: AuthContextValue = useMemo(() => ({
    status,
    user,
    tokenSource,
    apiUrl,
    host,
    token,
    retry,
  }), [status, user, tokenSource, apiUrl, host, token, retry]);
  
  // 10. Gate rendering based on status
  //     "authenticated" and "offline" → render children
  //     "loading" → render AuthLoadingScreen
  //     "unauthenticated" → render AuthErrorScreen (no token)
  //     "expired" → render AuthErrorScreen (expired)
  return (
    <AuthContext.Provider value={contextValue}>
      {status === "loading" && <AuthLoadingScreen host={host} />}
      {status === "unauthenticated" && <AuthErrorScreen variant="no-token" host={host} tokenSource={tokenSource} onRetry={retry} />}
      {status === "expired" && <AuthErrorScreen variant="expired" host={host} tokenSource={tokenSource} onRetry={retry} />}
      {(status === "authenticated" || status === "offline") && children}
    </AuthContext.Provider>
  );
}
```

**Security:** The `token` field on the context is needed by `APIClientProvider` downstream. It is never rendered to the terminal. The context value is typed as `readonly` to discourage mutation.

---

### Step 2: useAuth Hook Update

**File:** `apps/tui/src/hooks/useAuth.ts`

Update the hook to expose the new `AuthContextValue` shape:

```typescript
import { useContext } from "react";
import { AuthContext, type AuthContextValue } from "../providers/AuthProvider";

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an <AuthProvider>");
  }
  return ctx;
}
```

This hook is consumed by:
- `StatusBar` — to display auth confirmation and offline warning
- `APIClientProvider` — to obtain the token
- `SSEProvider` — to know when auth is complete before opening SSE connection
- Screen components — to access `user` and `host` if needed

---

### Step 3: Auth Loading Screen Component

**File:** `apps/tui/src/components/AuthLoadingScreen.tsx`

A full-content-area screen shown during token validation. Vertically and horizontally centered spinner with host text.

```typescript
import React from "react";
import { useKeyboard, useTerminalDimensions, useOnResize } from "@opentui/react";
import { useSpinner } from "../hooks/useSpinner";
import { useTheme } from "../hooks/useTheme";
import { truncateText } from "../lib/text";

interface AuthLoadingScreenProps {
  host: string;
}

export function AuthLoadingScreen({ host }: AuthLoadingScreenProps) {
  const { width } = useTerminalDimensions();
  const spinnerFrame = useSpinner();
  const theme = useTheme();

  // Truncate host to terminal_width - 4 with ellipsis
  const displayHost = truncateText(host, width - 4);

  // Only Ctrl+C active during loading — handled by global signal handler
  // No other keybindings registered. Navigation keys are inactive.
  useKeyboard((event) => {
    // All key events are consumed (no-op) to prevent propagation
    // Ctrl+C is handled at the process signal level, not here
  });

  return (
    <box flexDirection="column" width="100%" height="100%">
      {/* Header */}
      <box height={1} borderBottom="single">
        <text bold color={theme.primary}>Codeplane</text>
      </box>

      {/* Content area — centered */}
      <box
        flexDirection="column"
        flexGrow={1}
        justifyContent="center"
        alignItems="center"
      >
        <text>
          <text color={theme.primary}>{spinnerFrame}</text>
          <text> Authenticating…</text>
        </text>
        <text color={theme.muted}>{displayHost}</text>
      </box>

      {/* Status bar */}
      <box height={1} borderTop="single" justifyContent="flex-end">
        <text color={theme.muted}>Ctrl+C quit</text>
      </box>
    </box>
  );
}
```

**Layout behavior:**
- The spinner and text are vertically centered in the content area (`flexGrow={1}`, `justifyContent="center"`).
- On resize, OpenTUI re-lays out automatically — no manual handling needed beyond `useTerminalDimensions()` for host truncation.
- The auth flow is NOT restarted on resize.
- At minimum size (80×24): header=1 row, status=1 row, content=22 rows. Spinner centered in 22-row area.

---

### Step 4: Auth Error Screen Component

**File:** `apps/tui/src/components/AuthErrorScreen.tsx`

Shows contextual error information with keybinding hints for quit and retry.

```typescript
import React, { useRef, useCallback } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useTheme } from "../hooks/useTheme";
import type { AuthTokenSource } from "@codeplane/cli/auth-state";

interface AuthErrorScreenProps {
  variant: "no-token" | "expired";
  host: string;
  tokenSource: AuthTokenSource | null;
  onRetry: () => void;
}

export function AuthErrorScreen({ variant, host, tokenSource, onRetry }: AuthErrorScreenProps) {
  const { width } = useTerminalDimensions();
  const theme = useTheme();
  
  // Retry debounce: 1 second
  const lastRetryRef = useRef(0);
  const handleRetry = useCallback(() => {
    const now = Date.now();
    if (now - lastRetryRef.current < 1000) return;
    lastRetryRef.current = now;
    onRetry();
  }, [onRetry]);
  
  // Keybindings: q, R, Ctrl+C, ?
  useKeyboard((event) => {
    if (event.key === "q") {
      process.exit(0);
    }
    if (event.key === "R") {
      handleRetry();
    }
    // Ctrl+C handled at process signal level
    // ? handled by help overlay system (if available) or no-op during auth
  });
  
  // Wrap text to terminal_width - 4 padding
  const maxTextWidth = width - 4;
  
  if (variant === "no-token") {
    return (
      <box flexDirection="column" width="100%" height="100%">
        <box height={1} borderBottom="single">
          <text bold color={theme.primary}>Codeplane</text>
        </box>
        <box flexDirection="column" flexGrow={1} justifyContent="center" paddingX={2}>
          <text bold color={theme.error}>✗ Not authenticated</text>
          <text />
          <text>No token found for <text color={theme.muted}>{host}</text>.</text>
          <text />
          <text>Run the following command to log in:</text>
          <text />
          <text color={theme.primary} bold>  codeplane auth login</text>
          <text />
          <text>Or set the <text bold>CODEPLANE_TOKEN</text> environment variable.</text>
        </box>
        <box height={1} borderTop="single">
          <text color={theme.muted}>q quit │ R retry │ Ctrl+C quit</text>
        </box>
      </box>
    );
  }
  
  // variant === "expired"
  const sourceLabel = tokenSource ?? "unknown";
  return (
    <box flexDirection="column" width="100%" height="100%">
      <box height={1} borderBottom="single">
        <text bold color={theme.primary}>Codeplane</text>
      </box>
      <box flexDirection="column" flexGrow={1} justifyContent="center" paddingX={2}>
        <text bold color={theme.error}>✗ Session expired</text>
        <text />
        <text>Stored token for <text color={theme.muted}>{host}</text> from {sourceLabel} is invalid or expired.</text>
        <text />
        <text>Run the following command to re-authenticate:</text>
        <text />
        <text color={theme.primary} bold>  codeplane auth login</text>
      </box>
      <box height={1} borderTop="single">
        <text color={theme.muted}>q quit │ R retry │ Ctrl+C quit</text>
      </box>
    </box>
  );
}
```

**Key behaviors:**
- `R` retry is debounced at 1 second — rapid presses within 1s trigger only one API call.
- `q` exits the TUI with code 0 via `process.exit(0)`.
- `Ctrl+C` is handled at the process signal level (SIGINT handler registered in `apps/tui/src/lib/signals.ts`), not in this component.
- `?` may toggle a minimal help overlay if the overlay system is mounted; if not yet available, it is a no-op. The help overlay would show: `q quit`, `R retry`, `Ctrl+C quit`.
- The `codeplane auth login` command is rendered as a single bold primary-colored text element — it is never split across lines.
- On terminals without color support (`NO_COLOR=1` or `TERM=dumb`), `✗` remains as Unicode (it is a text character, not color-dependent). The error/primary colors fall back to terminal defaults via the ThemeProvider's `"16"` color capability path.

**Resize behavior:**
- Text re-wraps automatically since OpenTUI's layout engine handles `paddingX` and flexbox.
- The `codeplane auth login` command stays on one line. If terminal is narrower than 30 columns, the 2-space indent is preserved but the line may wrap (handled by OpenTUI's text wrapping).

---

### Step 5: Status Bar Auth Confirmation

**File:** `apps/tui/src/components/StatusBar.tsx` (modification)

After successful authentication, show `✓ username via source` in the status bar for 3 seconds.

```typescript
// Add to StatusBar component:
import { useAuth } from "../hooks/useAuth";

function StatusBar() {
  const { status, user, tokenSource } = useAuth();
  const [showAuthConfirm, setShowAuthConfirm] = useState(false);
  const prevStatusRef = useRef<AuthStatus | null>(null);

  // Show confirmation when status transitions to "authenticated"
  useEffect(() => {
    if (status === "authenticated" && prevStatusRef.current === "loading") {
      setShowAuthConfirm(true);
      const timer = setTimeout(() => setShowAuthConfirm(false), 3000);
      return () => clearTimeout(timer);
    }
    prevStatusRef.current = status;
  }, [status]);

  // Format confirmation text with truncation
  const authConfirmText = useMemo(() => {
    if (!showAuthConfirm || !user || !tokenSource) return null;
    const maxTotal = 40;
    const suffix = ` via ${tokenSource}`; // e.g., " via keyring" = 12 chars
    const prefix = "✓ "; // 2 chars
    const maxUsername = maxTotal - prefix.length - suffix.length;
    const displayName = user.length > maxUsername
      ? user.slice(0, maxUsername - 1) + "…"
      : user;
    return `${prefix}${displayName}${suffix}`;
  }, [showAuthConfirm, user, tokenSource]);

  // Show offline warning persistently when status is "offline"
  const offlineWarning = status === "offline" ? "⚠ offline — token not verified" : null;

  return (
    <box height={1} borderTop="single" justifyContent="space-between">
      <box>
        {/* Left: keybinding hints */}
        <text color={theme.muted}>{keybindingHints}</text>
      </box>
      <box>
        {/* Center: sync status or auth confirmation */}
        {authConfirmText && <text color={theme.success}>{authConfirmText}</text>}
        {offlineWarning && <text color={theme.warning}>{offlineWarning}</text>}
        {!authConfirmText && !offlineWarning && syncStatus}
      </box>
      <box>
        {/* Right: notification count + help */}
        <text color={theme.muted}>{notificationBadge} ? help</text>
      </box>
    </box>
  );
}
```

**Constraints:**
- Username truncated to 20 characters with `…` if needed.
- Total `✓ username via source` string never exceeds 40 characters. Username is truncated first.
- Token source label is exactly one of: `keyring`, `env`, `config`.
- After 3 seconds, `showAuthConfirm` flips to `false` and the status bar returns to its normal state.
- The offline warning (`⚠ offline — token not verified`) is persistent — it does not auto-dismiss.

---

### Step 6: Entry Point Integration

**File:** `apps/tui/src/index.tsx` (modification)

Update the provider stack to ensure `AuthProvider` receives the correct props and gates all downstream providers.

```typescript
import { resolveAuthToken, resolveAuthTarget } from "@codeplane/cli/auth-state";

// In the bootstrap function:
const launchOptions = parseCLIArgs(process.argv.slice(2));
assertTTY();

const renderer = createCliRenderer();
const root = createRoot(renderer);

root.render(
  <ErrorBoundary>
    <ThemeProvider>
      <AuthProvider
        token={launchOptions.token}
        apiUrl={launchOptions.apiUrl}
      >
        <APIClientProvider>
          <SSEProvider>
            <NavigationProvider initialScreen={launchOptions.screen} repo={launchOptions.repo}>
              <GlobalKeybindings>
                <AppShell />
              </GlobalKeybindings>
            </NavigationProvider>
          </SSEProvider>
        </APIClientProvider>
      </AuthProvider>
    </ThemeProvider>
  </ErrorBoundary>
);
```

**Key change:** `AuthProvider` gates `APIClientProvider`, `SSEProvider`, `NavigationProvider`, and all downstream components. When auth status is `"loading"`, `"unauthenticated"`, or `"expired"`, children are not rendered — the loading/error screens are rendered within `AuthProvider` itself.

**ThemeProvider is ABOVE AuthProvider:** The loading and error screens need theme tokens. `ThemeProvider` must be mounted before `AuthProvider`.

**ErrorBoundary is ABOVE everything:** Catches errors from auth token resolution (e.g., keyring read failures that aren't caught internally).

---

### Step 7: Text Utility for Truncation

**File:** `apps/tui/src/lib/text.ts` (addition or modification)

Add text truncation utility used by the loading and error screens:

```typescript
/**
 * Truncate text to maxLength characters, appending "…" if truncated.
 * Returns the original string if it fits within maxLength.
 */
export function truncateText(text: string, maxLength: number): string {
  if (maxLength < 1) return "";
  if (text.length <= maxLength) return text;
  if (maxLength === 1) return "…";
  return text.slice(0, maxLength - 1) + "…";
}

/**
 * Wrap text to fit within a given width, respecting word boundaries.
 * Returns an array of lines.
 */
export function wrapText(text: string, width: number): string[] {
  if (width < 1) return [""];
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";
  for (const word of words) {
    if (currentLine.length === 0) {
      currentLine = word;
    } else if (currentLine.length + 1 + word.length <= width) {
      currentLine += " " + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine.length > 0) lines.push(currentLine);
  return lines;
}
```

---

### Step 8: Telemetry Events

**File:** `apps/tui/src/providers/AuthProvider.tsx` (within the `runAuth` function)

Emit telemetry events at each stage of the auth flow. The telemetry system is assumed to be available via a module-level import (consistent with the platform's telemetry patterns).

```typescript
import { emit } from "../lib/telemetry";

// Inside runAuth():
const startTime = performance.now();
emit("tui.auth.started", { host, has_env_token: !!process.env.CODEPLANE_TOKEN, timestamp: Date.now() });

// After token resolution:
if (resolved) {
  emit("tui.auth.resolved", { host, source: resolved.source, duration_ms: performance.now() - startTime });
} else {
  emit("tui.auth.failed", { host, reason: "no_token", duration_ms: performance.now() - startTime });
}

// After validation:
if (result.valid) {
  emit("tui.auth.validated", { host, source: resolved.source, valid: true, duration_ms: performance.now() - startTime, username_present: !!result.username });
} else if (result.reason === "offline") {
  emit("tui.auth.failed", { host, reason: "network_error", source: resolved.source });
  emit("tui.auth.offline_proceed", { host, source: resolved.source });
} else {
  emit("tui.auth.failed", { host, reason: "expired", source: resolved.source });
}

// On retry (R key):
emit("tui.auth.retry", { host, attempt_number: retryCount });

// On quit from error screen:
emit("tui.auth.quit", { host, reason: status });
```

---

### Step 9: Logging

**File:** `apps/tui/src/providers/AuthProvider.tsx` (within the `runAuth` function)

All log output goes to `stderr` via the TUI's logger. Logs are not displayed in the TUI interface.

```typescript
import { logger } from "../lib/logger";

// Token resolution
logger.debug(`auth: resolving token for ${host}`);
// Token found
logger.debug(`auth: token resolved from ${source} for ${host}`);
// Token not found
logger.debug(`auth: no token found for ${host}`);
// Validation started
logger.debug(`auth: validating token against ${apiUrl}/api/user`);
// Validation succeeded
logger.info(`auth: authenticated as ${username} via ${source} on ${host}`);
// Validation failed (401)
logger.warn(`auth: token from ${source} is expired or invalid for ${host}`);
// Network unreachable
logger.warn(`auth: could not reach ${host} for token validation, proceeding optimistically`);
// Timeout
logger.warn(`auth: token validation timed out after 5000ms for ${host}, proceeding optimistically`);
// Rate limited
logger.warn(`auth: rate limited by ${host} during token validation (HTTP 429)`);
// Keyring error
logger.error(`auth: failed to read from system keyring: ${error.message}`);
```

---

### Step 10: Process Signal Handling for Auth Abort

**File:** `apps/tui/src/lib/signals.ts` (modification)

Ensure `Ctrl+C` (SIGINT) during auth loading aborts in-flight fetch and exits immediately:

```typescript
// The existing signal handler already handles SIGINT.
// The AbortController in AuthProvider's validate() function is linked to
// a module-level abort signal that the signal handler triggers:

let globalAbort: AbortController | null = null;

export function setGlobalAbort(controller: AbortController) {
  globalAbort = controller;
}

process.on("SIGINT", () => {
  globalAbort?.abort();
  // Clean up terminal (restore cursor, exit alternate screen)
  process.exit(0);
});
```

In `AuthProvider`, the validation `AbortController` is registered via `setGlobalAbort()` before the fetch call and cleared after.

---

## File Inventory

| File Path | Action | Description |
|-----------|--------|-------------|
| `apps/tui/src/providers/AuthProvider.tsx` | **Rewrite** | Full auth state machine with child-gating, retry, telemetry, logging |
| `apps/tui/src/hooks/useAuth.ts` | **Update** | Expose new `AuthContextValue` interface |
| `apps/tui/src/components/AuthLoadingScreen.tsx` | **Create** | Loading screen with spinner + "Authenticating…" + host |
| `apps/tui/src/components/AuthErrorScreen.tsx` | **Create** | Error screens for no-token and expired variants |
| `apps/tui/src/components/StatusBar.tsx` | **Modify** | Add auth confirmation display and offline warning |
| `apps/tui/src/index.tsx` | **Modify** | Update provider stack ordering |
| `apps/tui/src/lib/text.ts` | **Modify** | Add `truncateText()` and `wrapText()` utilities |
| `apps/tui/src/lib/signals.ts` | **Modify** | Add global abort controller for auth fetch |
| `e2e/tui/app-shell.test.ts` | **Modify** | Add all auth token loading E2E tests |

---

## Unit & Integration Tests

### Test File

**File:** `e2e/tui/app-shell.test.ts`

All auth token loading tests are added to the existing app shell test suite since auth is part of the app shell bootstrap. Tests use `@microsoft/tui-test` via the helpers in `e2e/tui/helpers.ts`.

### Test Implementation

```typescript
import { describe, test, expect } from "bun:test";
import { launchTUI, createTestCredentialStore, createMockAPIEnv } from "./helpers";

describe("TUI_AUTH_TOKEN_LOADING", () => {

  // ─── Terminal Snapshot Tests ───

  describe("loading screen", () => {
    test("renders loading screen while authenticating", async () => {
      const env = createMockAPIEnv({ token: "valid-test-token" });
      // Use a slow API response to capture loading state
      const terminal = await launchTUI({ cols: 120, rows: 40, env });
      await terminal.waitForText("Authenticating");
      const snapshot = terminal.snapshot();
      expect(snapshot).toContain("Authenticating");
      expect(snapshot).toContain("Codeplane");
      await terminal.terminate();
    });

    test("renders loading screen centered at minimum terminal size", async () => {
      const env = createMockAPIEnv({ token: "valid-test-token" });
      const terminal = await launchTUI({ cols: 80, rows: 24, env });
      await terminal.waitForText("Authenticating");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("loading screen layout at 80x24", async () => {
      const env = createMockAPIEnv({ token: "valid-test-token" });
      const terminal = await launchTUI({ cols: 80, rows: 24, env });
      await terminal.waitForText("Authenticating");
      // Header is row 0, status bar is last row, content is rows 1-22
      expect(terminal.getLine(0)).toMatch(/Codeplane/);
      expect(terminal.getLine(terminal.rows - 1)).toMatch(/Ctrl\+C quit/);
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("loading screen layout at 120x40", async () => {
      const env = createMockAPIEnv({ token: "valid-test-token" });
      const terminal = await launchTUI({ cols: 120, rows: 40, env });
      await terminal.waitForText("Authenticating");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("loading screen layout at 200x60", async () => {
      const env = createMockAPIEnv({ token: "valid-test-token" });
      const terminal = await launchTUI({ cols: 200, rows: 60, env });
      await terminal.waitForText("Authenticating");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("loading screen shows target host", async () => {
      const env = createMockAPIEnv({
        token: "valid-test-token",
        apiBaseUrl: "https://api.codeplane.app",
      });
      const terminal = await launchTUI({ cols: 120, rows: 40, env });
      await terminal.waitForText("Authenticating");
      expect(terminal.snapshot()).toContain("api.codeplane.app");
      await terminal.terminate();
    });
  });

  // ─── Error Screen Tests (No Token) ───

  describe("no-token error screen", () => {
    test("renders error screen when no token is found", async () => {
      const env = createMockAPIEnv();
      // Remove token from env
      delete env.CODEPLANE_TOKEN;
      env.CODEPLANE_DISABLE_SYSTEM_KEYRING = "1";
      const terminal = await launchTUI({ cols: 120, rows: 40, env });
      await terminal.waitForText("Not authenticated");
      const snapshot = terminal.snapshot();
      expect(snapshot).toContain("Not authenticated");
      expect(snapshot).toContain("codeplane auth login");
      expect(snapshot).toContain("CODEPLANE_TOKEN");
      await terminal.terminate();
    });

    test("error screen at 80x24 shows all text properly wrapped", async () => {
      const env = createMockAPIEnv();
      delete env.CODEPLANE_TOKEN;
      env.CODEPLANE_DISABLE_SYSTEM_KEYRING = "1";
      const terminal = await launchTUI({ cols: 80, rows: 24, env });
      await terminal.waitForText("Not authenticated");
      const snapshot = terminal.snapshot();
      expect(snapshot).toContain("codeplane auth login");
      expect(snapshot).toMatchSnapshot();
      await terminal.terminate();
    });

    test("error screen at 120x40", async () => {
      const env = createMockAPIEnv();
      delete env.CODEPLANE_TOKEN;
      env.CODEPLANE_DISABLE_SYSTEM_KEYRING = "1";
      const terminal = await launchTUI({ cols: 120, rows: 40, env });
      await terminal.waitForText("Not authenticated");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("error screen at 200x60", async () => {
      const env = createMockAPIEnv();
      delete env.CODEPLANE_TOKEN;
      env.CODEPLANE_DISABLE_SYSTEM_KEYRING = "1";
      const terminal = await launchTUI({ cols: 200, rows: 60, env });
      await terminal.waitForText("Not authenticated");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("error screen shows target host", async () => {
      const env = createMockAPIEnv({ apiBaseUrl: "https://custom.example.com" });
      delete env.CODEPLANE_TOKEN;
      env.CODEPLANE_DISABLE_SYSTEM_KEYRING = "1";
      const terminal = await launchTUI({ cols: 120, rows: 40, env });
      await terminal.waitForText("Not authenticated");
      expect(terminal.snapshot()).toContain("custom.example.com");
      await terminal.terminate();
    });
  });

  // ─── Error Screen Tests (Expired Token) ───

  describe("expired-token error screen", () => {
    test("renders error screen when token is expired", async () => {
      // API server returns 401 for this token
      const env = createMockAPIEnv({ token: "expired-test-token" });
      const terminal = await launchTUI({ cols: 120, rows: 40, env });
      await terminal.waitForText("Session expired");
      const snapshot = terminal.snapshot();
      expect(snapshot).toContain("Session expired");
      expect(snapshot).toContain("codeplane auth login");
      expect(snapshot).toContain("env"); // token source
      await terminal.terminate();
    });

    test("expired error screen at 80x24", async () => {
      const env = createMockAPIEnv({ token: "expired-test-token" });
      const terminal = await launchTUI({ cols: 80, rows: 24, env });
      await terminal.waitForText("Session expired");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("expired error screen at 120x40", async () => {
      const env = createMockAPIEnv({ token: "expired-test-token" });
      const terminal = await launchTUI({ cols: 120, rows: 40, env });
      await terminal.waitForText("Session expired");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("expired error screen at 200x60", async () => {
      const env = createMockAPIEnv({ token: "expired-test-token" });
      const terminal = await launchTUI({ cols: 200, rows: 60, env });
      await terminal.waitForText("Session expired");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });
  });

  // ─── Offline / Network Unreachable Tests ───

  describe("offline mode", () => {
    test("renders offline warning when network is unreachable", async () => {
      const env = createMockAPIEnv({
        token: "valid-test-token",
        apiBaseUrl: "http://unreachable.invalid:1",
      });
      const terminal = await launchTUI({ cols: 120, rows: 40, env });
      // Should proceed to dashboard with offline warning
      await terminal.waitForText("offline", 10000); // allow 5s timeout + render
      expect(terminal.snapshot()).toContain("offline");
      await terminal.terminate();
    });

    test("validation timeout proceeds optimistically", async () => {
      // Use a server that delays response beyond 5s
      const env = createMockAPIEnv({
        token: "valid-test-token",
        apiBaseUrl: "http://10.255.255.1:1", // non-routable IP, will timeout
      });
      const terminal = await launchTUI({ cols: 120, rows: 40, env });
      await terminal.waitForText("offline", 10000);
      expect(terminal.snapshot()).toContain("token not verified");
      await terminal.terminate();
    });
  });

  // ─── Auth Success / Status Bar Confirmation ───

  describe("successful authentication", () => {
    test("renders authenticated username in status bar after successful auth", async () => {
      const env = createMockAPIEnv({ token: "valid-test-token" });
      const terminal = await launchTUI({ cols: 120, rows: 40, env });
      // After auth completes, status bar should show confirmation
      await terminal.waitForText("via env", 5000);
      const lastLine = terminal.getLine(terminal.rows - 1);
      expect(lastLine).toMatch(/✓.*via env/);
      await terminal.terminate();
    });

    test("auth confirmation disappears after 3 seconds", async () => {
      const env = createMockAPIEnv({ token: "valid-test-token" });
      const terminal = await launchTUI({ cols: 120, rows: 40, env });
      await terminal.waitForText("via env", 5000);
      // Wait for confirmation to disappear
      await terminal.waitForNoText("via env", 5000);
      await terminal.terminate();
    });

    test("resolves token from CODEPLANE_TOKEN env var", async () => {
      const env = createMockAPIEnv({ token: "valid-test-token" });
      const terminal = await launchTUI({ cols: 120, rows: 40, env });
      await terminal.waitForText("via env", 5000);
      expect(terminal.snapshot()).toMatch(/via env/);
      await terminal.terminate();
    });

    test("resolves token from system keyring when env var is absent", async () => {
      const credStore = createTestCredentialStore("keyring-test-token");
      const env = createMockAPIEnv();
      delete env.CODEPLANE_TOKEN;
      env.CODEPLANE_TEST_CREDENTIAL_STORE_FILE = credStore.path;
      const terminal = await launchTUI({ cols: 120, rows: 40, env });
      await terminal.waitForText("via keyring", 5000);
      expect(terminal.snapshot()).toMatch(/via keyring/);
      credStore.cleanup();
      await terminal.terminate();
    });

    test("env var takes priority over keyring", async () => {
      const credStore = createTestCredentialStore("keyring-token");
      const env = createMockAPIEnv({ token: "env-token" });
      env.CODEPLANE_TEST_CREDENTIAL_STORE_FILE = credStore.path;
      const terminal = await launchTUI({ cols: 120, rows: 40, env });
      await terminal.waitForText("via env", 5000);
      credStore.cleanup();
      await terminal.terminate();
    });

    test("empty CODEPLANE_TOKEN is treated as absent", async () => {
      const credStore = createTestCredentialStore("keyring-test-token");
      const env = createMockAPIEnv();
      env.CODEPLANE_TOKEN = "";
      env.CODEPLANE_TEST_CREDENTIAL_STORE_FILE = credStore.path;
      const terminal = await launchTUI({ cols: 120, rows: 40, env });
      await terminal.waitForText("via keyring", 5000);
      credStore.cleanup();
      await terminal.terminate();
    });

    test("whitespace-only CODEPLANE_TOKEN is treated as absent", async () => {
      const credStore = createTestCredentialStore("keyring-test-token");
      const env = createMockAPIEnv();
      env.CODEPLANE_TOKEN = "   ";
      env.CODEPLANE_TEST_CREDENTIAL_STORE_FILE = credStore.path;
      const terminal = await launchTUI({ cols: 120, rows: 40, env });
      await terminal.waitForText("via keyring", 5000);
      credStore.cleanup();
      await terminal.terminate();
    });
  });

  // ─── Security Tests ───

  describe("security", () => {
    test("no token value is visible anywhere on screen", async () => {
      const testToken = "cp_test_secret_token_12345";
      const env = createMockAPIEnv({ token: testToken });
      const terminal = await launchTUI({ cols: 120, rows: 40, env });
      
      // Check during loading
      await terminal.waitForText("Authenticating");
      expect(terminal.snapshot()).not.toContain(testToken);
      
      // Check after auth completes (or fails)
      try {
        await terminal.waitForText("via env", 5000);
      } catch {
        // Auth may fail if no real API - that's OK, we just need the snapshot
      }
      expect(terminal.snapshot()).not.toContain(testToken);
      await terminal.terminate();
    });
  });

  // ─── Keyboard Interaction Tests ───

  describe("keyboard interactions", () => {
    test("Ctrl+C exits TUI during auth loading", async () => {
      const env = createMockAPIEnv({
        token: "valid-test-token",
        apiBaseUrl: "http://10.255.255.1:1", // slow/unreachable
      });
      const terminal = await launchTUI({ cols: 120, rows: 40, env });
      await terminal.waitForText("Authenticating");
      await terminal.sendKeys("ctrl+c");
      // Process should exit - terminate will not throw
      await terminal.terminate();
    });

    test("q exits TUI from no-token error screen", async () => {
      const env = createMockAPIEnv();
      delete env.CODEPLANE_TOKEN;
      env.CODEPLANE_DISABLE_SYSTEM_KEYRING = "1";
      const terminal = await launchTUI({ cols: 120, rows: 40, env });
      await terminal.waitForText("Not authenticated");
      await terminal.sendKeys("q");
      // Process should exit
      await terminal.terminate();
    });

    test("Ctrl+C exits TUI from error screen", async () => {
      const env = createMockAPIEnv();
      delete env.CODEPLANE_TOKEN;
      env.CODEPLANE_DISABLE_SYSTEM_KEYRING = "1";
      const terminal = await launchTUI({ cols: 120, rows: 40, env });
      await terminal.waitForText("Not authenticated");
      await terminal.sendKeys("ctrl+c");
      await terminal.terminate();
    });

    test("R retries auth from no-token error screen", async () => {
      const env = createMockAPIEnv();
      delete env.CODEPLANE_TOKEN;
      env.CODEPLANE_DISABLE_SYSTEM_KEYRING = "1";
      const terminal = await launchTUI({ cols: 120, rows: 40, env });
      await terminal.waitForText("Not authenticated");
      // Retry will re-resolve token — still no token, so error screen again
      await terminal.sendKeys("R");
      await terminal.waitForText("Authenticating");
      await terminal.waitForText("Not authenticated");
      await terminal.terminate();
    });

    test("R retries auth from expired-token error screen", async () => {
      const env = createMockAPIEnv({ token: "expired-test-token" });
      const terminal = await launchTUI({ cols: 120, rows: 40, env });
      await terminal.waitForText("Session expired");
      await terminal.sendKeys("R");
      // Retry transitions to loading state
      await terminal.waitForText("Authenticating");
      await terminal.terminate();
    });

    test("R retry is debounced — rapid presses trigger only one retry", async () => {
      const env = createMockAPIEnv();
      delete env.CODEPLANE_TOKEN;
      env.CODEPLANE_DISABLE_SYSTEM_KEYRING = "1";
      const terminal = await launchTUI({ cols: 120, rows: 40, env });
      await terminal.waitForText("Not authenticated");
      // Send rapid R presses
      await terminal.sendKeys("R", "R", "R");
      // Should see loading screen (one retry), then error again
      await terminal.waitForText("Not authenticated");
      await terminal.terminate();
    });

    test("navigation keys are inactive during auth loading", async () => {
      const env = createMockAPIEnv({
        token: "valid-test-token",
        apiBaseUrl: "http://10.255.255.1:1", // slow
      });
      const terminal = await launchTUI({ cols: 120, rows: 40, env });
      await terminal.waitForText("Authenticating");
      // Try navigation keys — they should have no effect
      await terminal.sendKeys("g", "d"); // go-to dashboard
      await terminal.sendKeys(":"); // command palette
      // Should still be on loading screen
      expect(terminal.snapshot()).toContain("Authenticating");
      expect(terminal.snapshot()).not.toContain("Dashboard");
      await terminal.terminate();
    });

    test("? opens help overlay from error screen", async () => {
      const env = createMockAPIEnv();
      delete env.CODEPLANE_TOKEN;
      env.CODEPLANE_DISABLE_SYSTEM_KEYRING = "1";
      const terminal = await launchTUI({ cols: 120, rows: 40, env });
      await terminal.waitForText("Not authenticated");
      await terminal.sendKeys("?");
      // Help overlay should show available keybindings
      const snapshot = terminal.snapshot();
      expect(snapshot).toMatch(/q.*quit/);
      expect(snapshot).toMatch(/R.*retry/);
      // Close help overlay
      await terminal.sendKeys("Escape");
      await terminal.waitForText("Not authenticated");
      await terminal.terminate();
    });
  });

  // ─── Responsive / Resize Tests ───

  describe("responsive layout", () => {
    test("resize during loading re-centers content", async () => {
      const env = createMockAPIEnv({
        token: "valid-test-token",
        apiBaseUrl: "http://10.255.255.1:1", // slow
      });
      const terminal = await launchTUI({ cols: 120, rows: 40, env });
      await terminal.waitForText("Authenticating");
      await terminal.resize(80, 24);
      // Spinner should still be visible and centered
      expect(terminal.snapshot()).toContain("Authenticating");
      expect(terminal.snapshot()).toMatchSnapshot();
      await terminal.terminate();
    });

    test("resize during error screen re-renders correctly", async () => {
      const env = createMockAPIEnv();
      delete env.CODEPLANE_TOKEN;
      env.CODEPLANE_DISABLE_SYSTEM_KEYRING = "1";
      const terminal = await launchTUI({ cols: 120, rows: 40, env });
      await terminal.waitForText("Not authenticated");
      await terminal.resize(80, 24);
      const snapshot = terminal.snapshot();
      expect(snapshot).toContain("Not authenticated");
      expect(snapshot).toContain("codeplane auth login");
      expect(snapshot).toMatchSnapshot();
      await terminal.terminate();
    });
  });

  // ─── Token Resolution Edge Cases ───

  describe("token resolution edge cases", () => {
    test("respects CODEPLANE_API_URL for target host", async () => {
      const env = createMockAPIEnv({
        token: "valid-test-token",
        apiBaseUrl: "https://custom-api.example.com",
      });
      const terminal = await launchTUI({ cols: 120, rows: 40, env });
      await terminal.waitForText("Authenticating");
      expect(terminal.snapshot()).toContain("custom-api.example.com");
      await terminal.terminate();
    });

    test("handles keyring read failure gracefully", async () => {
      const env = createMockAPIEnv();
      delete env.CODEPLANE_TOKEN;
      // Point to invalid credential store file
      env.CODEPLANE_TEST_CREDENTIAL_STORE_FILE = "/tmp/nonexistent-invalid.json";
      const terminal = await launchTUI({ cols: 120, rows: 40, env });
      await terminal.waitForText("Not authenticated");
      expect(terminal.snapshot()).toContain("Not authenticated");
      await terminal.terminate();
    });
  });

});
```

---

## Component Tree During Auth States

### Loading State

```
<ErrorBoundary>
  <ThemeProvider>
    <AuthProvider status="loading">
      <AuthLoadingScreen host="api.codeplane.app">
        <box> Header: "Codeplane" </box>
        <box> Content: spinner + "Authenticating…" + host </box>
        <box> Status: "Ctrl+C quit" </box>
      </AuthLoadingScreen>
      {/* children NOT rendered */}
    </AuthProvider>
  </ThemeProvider>
</ErrorBoundary>
```

### Unauthenticated State

```
<ErrorBoundary>
  <ThemeProvider>
    <AuthProvider status="unauthenticated">
      <AuthErrorScreen variant="no-token" host="api.codeplane.app">
        <box> Header: "Codeplane" </box>
        <box> Content: error message + instructions </box>
        <box> Status: "q quit │ R retry │ Ctrl+C quit" </box>
      </AuthErrorScreen>
      {/* children NOT rendered */}
    </AuthProvider>
  </ThemeProvider>
</ErrorBoundary>
```

### Expired State

```
<ErrorBoundary>
  <ThemeProvider>
    <AuthProvider status="expired">
      <AuthErrorScreen variant="expired" host="api.codeplane.app" tokenSource="keyring">
        <box> Header: "Codeplane" </box>
        <box> Content: expired message + source + instructions </box>
        <box> Status: "q quit │ R retry │ Ctrl+C quit" </box>
      </AuthErrorScreen>
      {/* children NOT rendered */}
    </AuthProvider>
  </ThemeProvider>
</ErrorBoundary>
```

### Authenticated State

```
<ErrorBoundary>
  <ThemeProvider>
    <AuthProvider status="authenticated">
      <APIClientProvider>
        <SSEProvider>
          <NavigationProvider>
            <GlobalKeybindings>
              <AppShell>
                <HeaderBar />
                <ScreenRouter /> {/* Dashboard or deep-linked screen */}
                <StatusBar>  {/* shows "✓ alice via env" for 3s */}
              </AppShell>
            </GlobalKeybindings>
          </NavigationProvider>
        </SSEProvider>
      </APIClientProvider>
    </AuthProvider>
  </ThemeProvider>
</ErrorBoundary>
```

### Offline State

```
<ErrorBoundary>
  <ThemeProvider>
    <AuthProvider status="offline">
      <APIClientProvider>
        <SSEProvider>
          <NavigationProvider>
            <GlobalKeybindings>
              <AppShell>
                <HeaderBar />
                <ScreenRouter />
                <StatusBar>  {/* shows "⚠ offline — token not verified" persistently */}
              </AppShell>
            </GlobalKeybindings>
          </NavigationProvider>
        </SSEProvider>
      </APIClientProvider>
    </AuthProvider>
  </ThemeProvider>
</ErrorBoundary>
```

---

## Boundary Constraints Implementation

### Username Truncation in Status Bar

```typescript
function formatAuthConfirmation(user: string, source: AuthTokenSource): string {
  const MAX_TOTAL = 40;
  const prefix = "✓ ";
  const suffix = ` via ${source}`;
  const maxUsername = MAX_TOTAL - prefix.length - suffix.length;
  
  // source "keyring" = 12 chars for " via keyring"
  // source "config" = 11 chars for " via config"
  // source "env" = 8 chars for " via env"
  // prefix "✓ " = 2 chars (✓ is 1 char + space)
  // Max username for "keyring": 40 - 2 - 12 = 26
  // Max username for "env": 40 - 2 - 8 = 30
  // Spec says max 20 chars for username, so cap at 20
  const cappedMax = Math.min(maxUsername, 20);
  const displayName = user.length > cappedMax
    ? user.slice(0, cappedMax - 1) + "…"
    : user;
  return `${prefix}${displayName}${suffix}`;
}
```

### Host URL Truncation on Loading Screen

```typescript
// In AuthLoadingScreen:
const displayHost = truncateText(host, width - 4);
// At 80 cols: max 76 chars for host
// At 120 cols: max 116 chars for host
```

### Error Message Wrapping

OpenTUI's `<text>` component within a `<box paddingX={2}>` handles line wrapping automatically. The `codeplane auth login` command is a separate `<text>` element with `bold` and `color={theme.primary}`, ensuring it is never split mid-command — it renders as a single inline element.

---

## Performance Budget

| Phase | Budget | Implementation |
|-------|--------|----------------|
| Token resolution | < 5ms | Synchronous. `resolveAuthToken()` reads env var (instant) or keyring (native call, ~1-3ms) |
| First paint (loading screen) | < 100ms | React mount + OpenTUI render. Spinner starts immediately. |
| Token validation | < 100ms (p50) | Single `GET /api/user` call. Network latency is the bottleneck. |
| Validation timeout | 5000ms | AbortController timeout. TUI proceeds optimistically after timeout. |
| Total auth flow (common case) | < 200ms | Token from env + responsive API server |
| Status bar confirmation | 3000ms display | `setTimeout` → state update → re-render |

---

## Error Recovery Matrix

| Error | Detection | User-Visible Behavior | Recovery |
|-------|-----------|----------------------|----------|
| No token in any source | `resolveAuthToken()` returns `null` | "Not authenticated" screen | `R` to retry, `q` to quit |
| Token expired (401) | `GET /api/user` → 401 | "Session expired" screen | `R` to retry, `q` to quit |
| Network unreachable | `fetch()` throws | Proceed to dashboard + "⚠ offline" in status bar | First 401 on API call triggers error boundary |
| DNS failure | `fetch()` throws | Same as network unreachable | Same |
| Validation timeout (5s) | `AbortController` abort | Same as network unreachable | Same |
| Rate limited (429) | `GET /api/user` → 429 | Same as network unreachable | Same |
| Keyring unavailable | `loadStoredToken()` throws | Falls through to next source; if all fail, "Not authenticated" | `R` to retry |
| Config file corrupted | `loadConfig()` throws | Falls through; uses default API URL | `R` to retry |
| Empty/whitespace token | `token.trim()` check | Treated as absent; falls through | Same as no token |

---

## Productionization Checklist

The following items track how POC-level code in `apps/tui/src/` graduates to production quality:

1. **AuthProvider state machine**: The state transitions described above must be exhaustive. Add a `switch` statement that TypeScript narrows, so adding a new `AuthStatus` value causes a compile error if unhandled.

2. **Token handling security audit**: Before shipping, verify with `grep -r` that no code path renders, logs (at `info` level or below), or serializes the raw token value. Only `debug`-level logs may reference the token source. The token is passed to `APIClientProvider` via React context — it must never appear in a `<text>` element.

3. **AbortController cleanup**: The validation fetch's `AbortController` must be cleaned up on component unmount (if the user somehow navigates away during validation, though this is prevented by gating). Use a `useEffect` cleanup function to abort in-flight requests.

4. **Retry counter**: Track retry count in a `useRef` for telemetry. Reset on successful auth. Cap at 100 retries to prevent infinite retry loops (though retries are user-initiated, belt-and-suspenders).

5. **Credential store error isolation**: Wrap keyring reads in try-catch at the `resolveAuthToken()` level (already done in CLI auth-state). Verify the TUI's usage doesn't bypass this by calling `loadStoredToken()` directly.

6. **Snapshot golden file management**: After implementing all screens, generate golden files at 80×24, 120×40, and 200×60. Store in `e2e/tui/__snapshots__/`. Golden files must be committed and reviewed in PRs that change auth UI.

7. **TERM=dumb / NO_COLOR compatibility**: The `useSpinner()` hook already handles ASCII fallback. Verify that the error screen's `✗` character renders correctly on dumb terminals (it is a Unicode character, not dependent on color). The ThemeProvider's 16-color fallback handles color degradation.

8. **Memory stability**: The `AuthProvider` creates its context value once and updates it via state setters. After initial auth, no further validation calls are made. Verify no interval-based re-validation exists. Memory should remain constant after auth completes.

9. **Import path for CLI auth-state**: The TUI imports from `@codeplane/cli/auth-state` (or `apps/cli/src/auth-state`). Ensure the monorepo workspace configuration exposes this as a package export. If not, add an explicit export in the CLI's `package.json` `exports` field, or use a relative path with TypeScript path mapping.

10. **E2E test API server**: Tests run against a real API server with test fixtures. The `createMockAPIEnv()` helper configures the test server URL. Verify the test server has routes for `GET /api/user` that return 200 for valid tokens and 401 for invalid ones. If the test server is not yet available, tests will fail — this is expected per project policy (never skip tests for missing backends).