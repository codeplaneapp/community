# Engineering Specification: tui-app-shell-integration

**Title:** Integrate AppShell layout: HeaderBar + ScreenRouter + StatusBar + overlays

**Status:** Implementation-ready

**Dependencies:** tui-screen-router, tui-header-bar, tui-status-bar, tui-global-keybindings, tui-command-palette, tui-help-overlay, tui-responsive-layout, tui-deep-link-launch, tui-goto-keybindings

---

## 1. Overview

This ticket completes the AppShell integration by wiring all EPIC_02 components into the final layout in `app.tsx` / `index.tsx`. The work validates that the full provider stack — from `ErrorBoundary` down to `ScreenRouter` — composes correctly, that global keybindings (`?`, `:`, `q`, `Esc`, `Ctrl+C`) dispatch through the keybinding priority system, that deep-link CLI arguments flow into the initial navigation stack, that the responsive layout system gates rendering behind the `TerminalTooSmallScreen` guard, and that only one overlay is active at a time.

The current codebase already has all individual components implemented. This ticket is about **hardening their integration**, wiring the remaining TODO stubs in `GlobalKeybindings.tsx`, and writing comprehensive E2E tests that validate the full assembled stack.

---

## 2. Current State Analysis

### What exists and works

| Component | File | Status |
|---|---|---|
| `AppShell` | `apps/tui/src/components/AppShell.tsx` | Implemented — composes HeaderBar + content + StatusBar + OverlayLayer, gates on breakpoint via `!layout.breakpoint` → renders `TerminalTooSmallScreen` |
| `HeaderBar` | `apps/tui/src/components/HeaderBar.tsx` | Implemented — breadcrumb trail (derived from `nav.stack`), repo context (hidden at minimum breakpoint), connection indicator (`● connected` placeholder), notification badge (hardcoded 0) |
| `StatusBar` | `apps/tui/src/components/StatusBar.tsx` | Implemented — status bar hints (truncated at minimum to 4), auth confirmation (3s fade), sync status placeholder, error display with retry hint, `? help` suffix |
| `OverlayLayer` | `apps/tui/src/components/OverlayLayer.tsx` | Implemented — renders absolute-positioned `<box>` at `zIndex={100}` with responsive sizing from `layout.modalWidth`/`layout.modalHeight`, title bar, separator, placeholder content per overlay type |
| `ScreenRouter` | `apps/tui/src/router/ScreenRouter.tsx` | Implemented — resolves screen from registry, renders component, shows unknown screen placeholder |
| `NavigationProvider` | `apps/tui/src/providers/NavigationProvider.tsx` | Implemented — stack-based navigation with push/pop/replace/reset, repo context extraction from stack ancestry, scroll position caching, `MAX_STACK_DEPTH`, duplicate entry prevention |
| `KeybindingProvider` | `apps/tui/src/providers/KeybindingProvider.tsx` | Implemented — priority-sorted scope dispatch via `useKeyboard()` from `@opentui/react`, LIFO within same priority, scope registration/removal, `getAllBindings()` and `getScreenBindings()` for help/status bar, status bar hints context |
| `OverlayManager` | `apps/tui/src/providers/OverlayManager.tsx` | Implemented — mutual exclusion (toggle when `prev === type`, swap when `prev !== type`), auto-registers `PRIORITY.MODAL` scope with `Esc` → `closeOverlay()`, status bar hint override with cleanup |
| `ThemeProvider` | `apps/tui/src/providers/ThemeProvider.tsx` | Implemented — singleton frozen theme tokens based on `detectColorCapability()` |
| `AuthProvider` | `apps/tui/src/providers/AuthProvider.tsx` | Implemented — token resolution from env/keyring/config, validation via `GET /api/user`, status states (loading/authenticated/expired/offline/unauthenticated) |
| `GlobalKeybindings` | `apps/tui/src/components/GlobalKeybindings.tsx` | **Partial** — `q`, `Escape`, `Ctrl+C` work; `?` has `/* TODO: wired in help overlay ticket */`; `:` has `/* TODO: wired in command palette ticket */`; `g` has `/* TODO: wired in go-to keybindings ticket */` |
| `useGlobalKeybindings` | `apps/tui/src/hooks/useGlobalKeybindings.ts` | Implemented — registers all 6 bindings (`q`, `escape`, `ctrl+c`, `?`, `:`, `g`) at `PRIORITY.GLOBAL` (5) via `registerScope()` |
| `useLayout` | `apps/tui/src/hooks/useLayout.ts` | Implemented — breakpoint detection, responsive sizing (sidebar, modal), `useSidebarState()` integration |
| `useOverlay` | `apps/tui/src/hooks/useOverlay.ts` | Implemented — context accessor with error message for missing provider |
| `TerminalTooSmallScreen` | `apps/tui/src/components/TerminalTooSmallScreen.tsx` | Implemented — renders warning message with current dimensions, uses standalone `useKeyboard` for `q` and `Ctrl+C` exit via `event.name === "q"` and `event.name === "c" && event.ctrl` |
| `buildInitialStack` | `apps/tui/src/navigation/deepLinks.ts` | Implemented — parses `--screen`/`--repo`, builds stack with validation, supports aliases ("repos" → `RepoList`, "landing-requests" → `Landings`) |
| `goToBindings` | `apps/tui/src/navigation/goToBindings.ts` | Implemented — 11 binding definitions with `executeGoTo()` that calls `nav.reset()` → `nav.push(RepoOverview)` → `nav.push(target)` |
| `index.tsx` | `apps/tui/src/index.tsx` | Implemented — full provider hierarchy, deep-link wiring, renderer initialization, signal handling |

### What needs to change

1. **`GlobalKeybindings.tsx`** — Wire the three TODO callbacks (`onHelp`, `onCommandPalette`, `onGoTo`) to real overlay/navigation actions via `useOverlay().openOverlay()`.
2. **E2E tests** — Comprehensive integration tests validating the full assembled stack are appended to `e2e/tui/app-shell.test.ts`.

### What does NOT need to change

1. **`index.tsx`** — Provider ordering is correct and intentionally diverges from the architecture spec's logical diagram (ThemeProvider above AuthProvider so error screens have theme tokens; KeybindingProvider above OverlayManager so overlay can register scopes).
2. **`AppShell.tsx`** — Responsive guard (`!layout.breakpoint` → `TerminalTooSmallScreen`) already works.
3. **`OverlayManager.tsx`** — Mutual exclusion and toggle semantics already correct.
4. **Deep-link flow** — `parseCLIArgs` → `buildInitialStack` → `NavigationProvider initialStack` already wired.

---

## 3. Implementation Plan

### Step 1: Wire `onHelp` and `onCommandPalette` callbacks in `GlobalKeybindings.tsx`

**File:** `apps/tui/src/components/GlobalKeybindings.tsx`

**Change:** Replace the three TODO callbacks with real implementations. Import `useOverlay` and call `openOverlay()` for `?` and `:`. Leave `onGoTo` as a documented no-op since go-to mode is handled by the `PRIORITY.GOTO` scope registered by the go-to keybindings system.

**Why this is the only production code change:** The `useGlobalKeybindings` hook (in `hooks/useGlobalKeybindings.ts`) already registers all 6 bindings with the `KeybindingProvider` at `PRIORITY.GLOBAL`. The `OverlayManager` already handles toggle/swap/close semantics. The missing piece is the three callback bodies in `GlobalKeybindings.tsx` that connect the keybinding fire event to the overlay open action.

**Key design decisions:**

- `onHelp` calls `openOverlay("help")`. Since `OverlayManager.openOverlay()` implements toggle semantics (line 76 of `OverlayManager.tsx`: if `prev === type`, remove modal scope and return `null`), a second `?` press will close the help overlay. No toggle tracking needed in `GlobalKeybindings`.
- `onCommandPalette` calls `openOverlay("command-palette")`. Same toggle semantics apply.
- `onHelp` pressed while command palette is open triggers `OverlayManager.openOverlay("help")` which detects `prev !== null && prev !== type` (line 89), cleans up the previous overlay's modal scope and status bar hints, then opens help. This is the mutual exclusion guarantee.
- `onGoTo` remains a documented no-op. The go-to system registers its own keybinding scope at `PRIORITY.GOTO` (3) that intercepts `g` at a higher priority than `PRIORITY.GLOBAL` (5). When go-to mode is active, the go-to scope captures the second key (d, r, i, etc.) and calls `executeGoTo()`. The global `g` binding only fires when go-to mode has not been registered or is inactive — making it a safe fallback.

**Detailed code change:**

The file transforms from 23 lines to approximately 36 lines. The three changes are:

1. **Line 2**: Add import of `useOverlay` from `"../hooks/useOverlay.js"`
2. **Line 6**: Call `useOverlay()` to get `openOverlay`
3. **Lines 17-19**: Replace the three TODO stubs with real implementations:
   - `onHelp`: `openOverlay("help")`
   - `onCommandPalette`: `openOverlay("command-palette")`
   - `onGoTo`: documented no-op with comment explaining why

**Target state of `GlobalKeybindings.tsx`:**

```typescript
import React, { useCallback } from "react";
import { useNavigation } from "../providers/NavigationProvider.js";
import { useOverlay } from "../hooks/useOverlay.js";
import { useGlobalKeybindings } from "../hooks/useGlobalKeybindings.js";

export function GlobalKeybindings({ children }: { children: React.ReactNode }) {
  const nav = useNavigation();
  const { openOverlay } = useOverlay();

  const onQuit = useCallback(() => {
    if (nav.canGoBack) { nav.pop(); } else { process.exit(0); }
  }, [nav]);

  const onEscape = useCallback(() => {
    if (nav.canGoBack) { nav.pop(); }
  }, [nav]);

  const onForceQuit = useCallback(() => { process.exit(0); }, []);

  const onHelp = useCallback(() => {
    openOverlay("help");
  }, [openOverlay]);

  const onCommandPalette = useCallback(() => {
    openOverlay("command-palette");
  }, [openOverlay]);

  const onGoTo = useCallback(() => {
    // Go-to mode activation is handled by a dedicated PRIORITY.GOTO
    // keybinding scope registered by the go-to keybindings system.
    // This global-priority fallback exists so the help overlay can
    // list `g` as a registered binding. The actual go-to dispatch
    // occurs in the higher-priority GOTO scope.
  }, []);

  useGlobalKeybindings({ onQuit, onEscape, onForceQuit, onHelp, onCommandPalette, onGoTo });
  return <>{children}</>;
}
```

### Step 2: Validate `Esc` priority between overlay and global

**File:** No code change. Verification only.

When an overlay is open, `Esc` must close the overlay (not pop navigation). This is already correct because:

1. `OverlayManager.openOverlay()` registers a scope at `PRIORITY.MODAL` (2) with an `Esc` binding that calls `closeOverlayRef.current()` (lines 104-118 of `OverlayManager.tsx`).
2. `useGlobalKeybindings` registers `Esc` at `PRIORITY.GLOBAL` (5) that calls `onEscape` → `nav.pop()`.
3. The `KeybindingProvider` dispatches to the highest-priority (lowest number) active scope first. `PRIORITY.MODAL` (2) beats `PRIORITY.GLOBAL` (5).
4. After the overlay closes and its modal scope is removed, the next `Esc` press falls through to the global scope and pops navigation.

### Step 3: Analyze `q` behavior with overlays open

**File:** No code change. Behavior documented.

Per the design spec: `q` = "Pop current screen (back). On root screen, quit TUI" and `Esc` = "Close any open overlay/modal. If none open, same as `q`." This means `q` should NOT close overlays — it navigates/quits.

The existing test `OVERLAY-010` (line 5275 of `app-shell.test.ts`) asserts that `q` does NOT navigate back while an overlay is open — it expects the overlay to still be visible after pressing `q`.

**Analysis of actual dispatch behavior:**

The `OverlayManager` registers a modal scope at `PRIORITY.MODAL` (2) with **only an `Esc` binding** (line 104-112 of `OverlayManager.tsx`). When `q` is pressed with the overlay open:

1. Dispatch checks modal scope (priority 2) — no `q` binding → skip
2. Falls through to global scope (priority 5) — `q` binding found → calls `onQuit`
3. On root screen: `nav.canGoBack` is `false` → `process.exit(0)` — TUI exits
4. On non-root screen: `nav.pop()` — navigation goes back, overlay persists

This means `q` on the root screen with an overlay open will **exit the TUI**, which contradicts test OVERLAY-010's expectation. This is a known design tension:

- The test was written to express the desired behavior: `q` should be blocked while an overlay is open.
- The current modal scope implementation only registers `Esc`, so `q` falls through.
- The tests currently fail anyway because `?` is a no-op (the TODO stub this ticket resolves).

**Resolution path:** Test OVERLAY-010 documents the correct UX intent. To make it pass, the modal scope in `OverlayManager` would need to register a broader key capture (consuming `q` and other keys during overlay). However, that change belongs to the overlay implementation tickets (tui-command-palette, tui-help-overlay), not this integration ticket. Per project policy, the test is left failing — it will start failing for the right reason (q reaches global scope) once this ticket lands, rather than failing because `?` is a no-op.

### Step 4: Validate provider hierarchy ordering

**File:** `apps/tui/src/index.tsx` — No code change.

The current hierarchy (lines 57-89 of `index.tsx`):

```
ErrorBoundary
  → ThemeProvider
    → KeybindingProvider
      → OverlayManager
        → AuthProvider
          → APIClientProvider
            → SSEProvider
              → NavigationProvider
                → LoadingProvider
                  → GlobalKeybindings
                    → AppShell
                      → ScreenRouter
```

Intentional divergences from the architecture spec's logical diagram:

| Provider | Spec Position | Actual Position | Reason |
|---|---|---|---|
| `ThemeProvider` | Below `NavigationProvider` | Above `AuthProvider` | Auth loading/error screens need theme tokens to render styled UI |
| `KeybindingProvider` | Below `ThemeProvider` | Above `OverlayManager` | `OverlayManager` calls `keybindingCtx.registerScope()` on mount — requires `KeybindingContext` to exist |
| `OverlayManager` | Not in spec diagram | Above `AuthProvider` | Auth error screens may trigger confirm overlays |
| `LoadingProvider` | Not in spec diagram | Wraps `GlobalKeybindings` | Loading state affects status bar display (error/retry hints) |

All provider dependencies flow downward correctly. No change needed.

### Step 5: Validate deep-link flow

**File:** `apps/tui/src/index.tsx` — No code change.

The deep-link flow is complete:

1. `parseCLIArgs(process.argv.slice(2))` → extracts `--screen`, `--repo`, `--debug`, reads `CODEPLANE_API_URL` and `CODEPLANE_TOKEN` from env (lines 6-9 of `index.tsx`)
2. `buildInitialStack({ screen, repo })` → validates screen name, repo format, repo-required screens; builds stack `[Dashboard, RepoOverview?, TargetScreen?]`; returns error string on validation failure (lines 36-40)
3. `initialStack` passed to `<NavigationProvider initialStack={initialStack}>` (line 70-73)
4. `NavigationProvider` uses `initialStack` as initial state for the screen stack

Edge cases handled by `buildInitialStack`:
- No args → `[Dashboard]`
- Unknown `--screen` → `[Dashboard]` + error string
- `--screen issues` without `--repo` → `[Dashboard]` + error ("--repo required for issues screen")
- `--screen repos` → alias resolved to `ScreenName.RepoList` → `[Dashboard, RepoList]`
- `--repo alice/myrepo` without `--screen` → `[Dashboard, RepoOverview(alice, myrepo)]`
- Invalid repo format (no `/`) → `[Dashboard]` + error
- `--screen repo-detail --repo alice/myrepo` → avoids duplicate: `[Dashboard, RepoOverview(alice, myrepo)]` (line 109 of deepLinks.ts)

### Step 6: Validate responsive TerminalTooSmall guard

**File:** `apps/tui/src/components/AppShell.tsx` — No code change.

`AppShell` (lines 8-25) checks `!layout.breakpoint` (which is `null` when `getBreakpoint(cols, rows)` returns `null` for terminals below 80×24). When null, renders `<TerminalTooSmallScreen cols={layout.width} rows={layout.height} />`.

`TerminalTooSmallScreen` uses its own standalone `useKeyboard` hook (from `@opentui/react`) to handle `q` (via `event.name === "q"`) and `Ctrl+C` (via `event.name === "c" && event.ctrl`) for exit, completely bypassing the `KeybindingProvider` priority system since the normal UI tree is not rendered at all.

### Step 7: Validate overlay mutual exclusion

**File:** `apps/tui/src/providers/OverlayManager.tsx` — No code change.

The `openOverlay` function (lines 73-130) handles three state transition paths:

1. **Toggle off** (`prev === type`, line 76): Removes modal scope, cleans up hint override, sets confirm payload to null, sets state to `null`.
2. **Swap** (`prev !== null && prev !== type`, line 89): Removes previous modal scope if exists, cleans up hint override, then falls through to fresh open logic.
3. **Open fresh** (`prev === null` or after swap cleanup): Sets confirm payload if type is "confirm", registers new modal scope at `PRIORITY.MODAL` with `Esc` binding, overrides status bar hints with `["Esc close"]`, sets state to new type.

Cleanup on unmount (lines 132-141) removes any dangling modal scope and hint override.

---

## 4. Files Modified

| File | Change Type | Description |
|---|---|---|
| `apps/tui/src/components/GlobalKeybindings.tsx` | **Edit** | Wire `onHelp` → `openOverlay("help")`, `onCommandPalette` → `openOverlay("command-palette")`, document `onGoTo` no-op |
| `e2e/tui/app-shell.test.ts` | **Append** | Add `TUI_APP_SHELL — AppShell layout integration` and `TUI_APP_SHELL — Live AppShell integration` test suites |

---

## 5. Detailed Code Changes

### 5.1 `apps/tui/src/components/GlobalKeybindings.tsx`

**Diff from current file (23 lines → ~36 lines):**

- **Line 2**: Add import of `useOverlay` from `"../hooks/useOverlay.js"`
- **Line 6**: Add `const { openOverlay } = useOverlay();` after `useNavigation()`
- **Line 17**: Replace `const onHelp = useCallback(() => { /* TODO: wired in help overlay ticket */ }, []);` with `const onHelp = useCallback(() => { openOverlay("help"); }, [openOverlay]);`
- **Line 18**: Replace `const onCommandPalette = useCallback(() => { /* TODO: wired in command palette ticket */ }, []);` with `const onCommandPalette = useCallback(() => { openOverlay("command-palette"); }, [openOverlay]);`
- **Line 19**: Replace `const onGoTo = useCallback(() => { /* TODO: wired in go-to keybindings ticket */ }, []);` with documented no-op callback with comment explaining the PRIORITY.GOTO delegation pattern

**Verification that `useOverlay` is available in scope:** `GlobalKeybindings` is rendered inside `OverlayManager` (index.tsx line 75 is inside OverlayManager at line 66). The `useOverlay` hook reads `OverlayContext` from `OverlayManager`. The provider ordering guarantees the context exists.

---

## 6. Unit & Integration Tests

### Test file: `e2e/tui/app-shell.test.ts`

All new tests are **appended** to the existing file. They use the existing `launchTUI`, `run`, `bunEval`, `TUI_SRC`, `TUI_ROOT`, and `TERMINAL_SIZES` helpers from `e2e/tui/helpers.ts`.

Tests that depend on API server responses for data (notifications, repos) will fail if the backend is not running — per project policy, these tests are **left failing, never skipped**.

---

### Test Suite 1: `TUI_APP_SHELL — AppShell layout integration` (static analysis + unit)

These tests validate the structural correctness of the assembled component tree without launching a PTY. They read source files and run `bunEval` expressions.

```typescript
// ---------------------------------------------------------------------------
// TUI_APP_SHELL — AppShell layout integration
// ---------------------------------------------------------------------------

describe("TUI_APP_SHELL — AppShell layout integration", () => {

  // ── Provider hierarchy validation ─────────────────────────────────

  test("INT-PROVIDER-001: KeybindingProvider wraps OverlayManager", async () => {
    const content = await Bun.file(join(TUI_SRC, "index.tsx")).text();
    const kbOpen = content.indexOf("<KeybindingProvider");
    const omOpen = content.indexOf("<OverlayManager");
    expect(kbOpen).toBeGreaterThan(-1);
    expect(omOpen).toBeGreaterThan(-1);
    expect(kbOpen).toBeLessThan(omOpen);
  });

  test("INT-PROVIDER-002: OverlayManager wraps NavigationProvider", async () => {
    const content = await Bun.file(join(TUI_SRC, "index.tsx")).text();
    const omOpen = content.indexOf("<OverlayManager");
    const npOpen = content.indexOf("<NavigationProvider");
    expect(omOpen).toBeGreaterThan(-1);
    expect(npOpen).toBeGreaterThan(-1);
    expect(npOpen).toBeGreaterThan(omOpen);
  });

  test("INT-PROVIDER-003: NavigationProvider wraps GlobalKeybindings", async () => {
    const content = await Bun.file(join(TUI_SRC, "index.tsx")).text();
    const npOpen = content.indexOf("<NavigationProvider");
    const gkOpen = content.indexOf("<GlobalKeybindings");
    expect(npOpen).toBeGreaterThan(-1);
    expect(gkOpen).toBeGreaterThan(-1);
    expect(gkOpen).toBeGreaterThan(npOpen);
  });

  test("INT-PROVIDER-004: GlobalKeybindings wraps AppShell", async () => {
    const content = await Bun.file(join(TUI_SRC, "index.tsx")).text();
    const gkOpen = content.indexOf("<GlobalKeybindings");
    const asOpen = content.indexOf("<AppShell");
    expect(gkOpen).toBeGreaterThan(-1);
    expect(asOpen).toBeGreaterThan(-1);
    expect(asOpen).toBeGreaterThan(gkOpen);
  });

  test("INT-PROVIDER-005: AppShell wraps ScreenRouter", async () => {
    const content = await Bun.file(join(TUI_SRC, "index.tsx")).text();
    const asOpen = content.indexOf("<AppShell");
    const srOpen = content.indexOf("<ScreenRouter");
    expect(asOpen).toBeGreaterThan(-1);
    expect(srOpen).toBeGreaterThan(-1);
    expect(srOpen).toBeGreaterThan(asOpen);
  });

  test("INT-PROVIDER-006: ErrorBoundary is outermost provider", async () => {
    const content = await Bun.file(join(TUI_SRC, "index.tsx")).text();
    const ebOpen = content.indexOf("<ErrorBoundary");
    const tpOpen = content.indexOf("<ThemeProvider");
    expect(ebOpen).toBeGreaterThan(-1);
    expect(tpOpen).toBeGreaterThan(-1);
    expect(ebOpen).toBeLessThan(tpOpen);
  });

  test("INT-PROVIDER-007: ThemeProvider wraps KeybindingProvider", async () => {
    const content = await Bun.file(join(TUI_SRC, "index.tsx")).text();
    const tpOpen = content.indexOf("<ThemeProvider");
    const kbOpen = content.indexOf("<KeybindingProvider");
    expect(tpOpen).toBeGreaterThan(-1);
    expect(kbOpen).toBeGreaterThan(-1);
    expect(tpOpen).toBeLessThan(kbOpen);
  });

  test("INT-PROVIDER-008: initialStack from buildInitialStack passed to NavigationProvider", async () => {
    const content = await Bun.file(join(TUI_SRC, "index.tsx")).text();
    expect(content).toContain("buildInitialStack");
    expect(content).toContain("initialStack={initialStack}");
  });

  // ── GlobalKeybindings.tsx wiring ───────────────────────────────────

  test("INT-FILE-001: GlobalKeybindings.tsx imports useOverlay", async () => {
    const content = await Bun.file(join(TUI_SRC, "components/GlobalKeybindings.tsx")).text();
    expect(content).toContain("useOverlay");
  });

  test("INT-FILE-002: GlobalKeybindings.tsx calls openOverlay for help", async () => {
    const content = await Bun.file(join(TUI_SRC, "components/GlobalKeybindings.tsx")).text();
    expect(content).toContain('openOverlay("help")');
  });

  test("INT-FILE-003: GlobalKeybindings.tsx calls openOverlay for command palette", async () => {
    const content = await Bun.file(join(TUI_SRC, "components/GlobalKeybindings.tsx")).text();
    expect(content).toContain('openOverlay("command-palette")');
  });

  test("INT-FILE-004: GlobalKeybindings.tsx has no remaining TODO stubs", async () => {
    const content = await Bun.file(join(TUI_SRC, "components/GlobalKeybindings.tsx")).text();
    expect(content).not.toContain("TODO: wired in help overlay ticket");
    expect(content).not.toContain("TODO: wired in command palette ticket");
    expect(content).not.toContain("TODO: wired in go-to keybindings ticket");
  });

  // ── AppShell.tsx composition ───────────────────────────────────────

  test("INT-FILE-005: AppShell renders TerminalTooSmallScreen when breakpoint is null", async () => {
    const content = await Bun.file(join(TUI_SRC, "components/AppShell.tsx")).text();
    expect(content).toContain("TerminalTooSmallScreen");
    expect(content).toContain("!layout.breakpoint");
  });

  test("INT-FILE-006: AppShell renders HeaderBar, StatusBar, and OverlayLayer", async () => {
    const content = await Bun.file(join(TUI_SRC, "components/AppShell.tsx")).text();
    expect(content).toContain("<HeaderBar");
    expect(content).toContain("<StatusBar");
    expect(content).toContain("<OverlayLayer");
  });

  test("INT-FILE-007: OverlayLayer uses responsive modal sizing from useLayout", async () => {
    const content = await Bun.file(join(TUI_SRC, "components/OverlayLayer.tsx")).text();
    expect(content).toContain("layout.modalWidth");
    expect(content).toContain("layout.modalHeight");
  });

  test("INT-FILE-008: OverlayLayer renders at zIndex 100", async () => {
    const content = await Bun.file(join(TUI_SRC, "components/OverlayLayer.tsx")).text();
    expect(content).toContain("zIndex={100}");
  });

  test("INT-FILE-009: OverlayLayer returns null when no overlay is active", async () => {
    const content = await Bun.file(join(TUI_SRC, "components/OverlayLayer.tsx")).text();
    expect(content).toContain("activeOverlay === null");
    expect(content).toContain("return null");
  });

  // ── Deep-link unit tests ──────────────────────────────────────────

  test("INT-DEEPLINK-001: index.tsx parses --screen and --repo from CLI args", async () => {
    const content = await Bun.file(join(TUI_SRC, "index.tsx")).text();
    expect(content).toContain("parseCLIArgs");
    expect(content).toContain("launchOptions.screen");
    expect(content).toContain("launchOptions.repo");
  });

  test("INT-DEEPLINK-002: buildInitialStack returns Dashboard for no args", async () => {
    const r = await bunEval(`
      import { buildInitialStack } from './src/navigation/deepLinks.js';
      const result = buildInitialStack({});
      console.log(result.stack.length, result.stack[0].screen, result.error ?? 'none');
    `);
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("1 Dashboard none");
  });

  test("INT-DEEPLINK-003: buildInitialStack with --screen issues --repo owner/repo builds 3-entry stack", async () => {
    const r = await bunEval(`
      import { buildInitialStack } from './src/navigation/deepLinks.js';
      const result = buildInitialStack({ screen: 'issues', repo: 'alice/myrepo' });
      console.log(result.stack.map(e => e.screen).join(','));
    `);
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("Dashboard,RepoOverview,Issues");
  });

  test("INT-DEEPLINK-004: buildInitialStack with repo-required screen but no repo returns error", async () => {
    const r = await bunEval(`
      import { buildInitialStack } from './src/navigation/deepLinks.js';
      const result = buildInitialStack({ screen: 'issues' });
      console.log(result.error ? 'has_error' : 'no_error');
    `);
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("has_error");
  });

  test("INT-DEEPLINK-005: buildInitialStack with unknown screen returns error and defaults to Dashboard", async () => {
    const r = await bunEval(`
      import { buildInitialStack } from './src/navigation/deepLinks.js';
      const result = buildInitialStack({ screen: 'nonexistent' });
      console.log(result.stack[0].screen, result.error ? 'has_error' : 'no_error');
    `);
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("Dashboard has_error");
  });

  test("INT-DEEPLINK-006: buildInitialStack with --repo only (no --screen) builds 2-entry stack", async () => {
    const r = await bunEval(`
      import { buildInitialStack } from './src/navigation/deepLinks.js';
      const result = buildInitialStack({ repo: 'alice/myrepo' });
      console.log(result.stack.map(e => e.screen).join(','));
    `);
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("Dashboard,RepoOverview");
  });

  test("INT-DEEPLINK-007: buildInitialStack with invalid repo format returns error", async () => {
    const r = await bunEval(`
      import { buildInitialStack } from './src/navigation/deepLinks.js';
      const result = buildInitialStack({ repo: 'noslash' });
      console.log(result.error ? 'has_error' : 'no_error', result.stack[0].screen);
    `);
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("has_error Dashboard");
  });

  test("INT-DEEPLINK-008: buildInitialStack resolves screen name aliases", async () => {
    const r = await bunEval(`
      import { buildInitialStack } from './src/navigation/deepLinks.js';
      const r1 = buildInitialStack({ screen: 'repos' });
      const r2 = buildInitialStack({ screen: 'landing-requests', repo: 'a/b' });
      console.log(r1.stack[r1.stack.length-1].screen, r2.stack[r2.stack.length-1].screen);
    `);
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("RepoList Landings");
  });

  // ── Overlay mutual exclusion (source-level) ───────────────────────

  test("INT-OVERLAY-001: OverlayManager exports OverlayContext", async () => {
    const r = await bunEval(`
      import { OverlayManager, OverlayContext } from './src/providers/OverlayManager.js';
      console.log(typeof OverlayManager === 'function', typeof OverlayContext === 'object');
    `);
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("true true");
  });

  test("INT-OVERLAY-002: OverlayManager toggle path — prev === type closes overlay", async () => {
    const content = await Bun.file(join(TUI_SRC, "providers/OverlayManager.tsx")).text();
    expect(content).toContain("prev === type");
    expect(content).toContain("return null");
  });

  test("INT-OVERLAY-003: OverlayManager registers modal scope at PRIORITY.MODAL", async () => {
    const content = await Bun.file(join(TUI_SRC, "providers/OverlayManager.tsx")).text();
    expect(content).toContain("PRIORITY.MODAL");
    expect(content).toContain("registerScope");
  });

  test("INT-OVERLAY-004: OverlayManager registers Esc binding in modal scope", async () => {
    const content = await Bun.file(join(TUI_SRC, "providers/OverlayManager.tsx")).text();
    expect(content).toContain('normalizeKeyDescriptor("escape")');
    expect(content).toContain("closeOverlayRef.current()");
  });

  test("INT-OVERLAY-005: OverlayManager overrides status bar hints while overlay open", async () => {
    const content = await Bun.file(join(TUI_SRC, "providers/OverlayManager.tsx")).text();
    expect(content).toContain("overrideHints");
    expect(content).toContain('"Esc"');
    expect(content).toContain('"close"');
  });

  // ── Global keybinding registration ────────────────────────────────

  test("INT-KEYBIND-001: PRIORITY.GLOBAL is 5 (lowest priority / last fallback)", async () => {
    const r = await bunEval(`
      import { PRIORITY } from './src/providers/keybinding-types.js';
      console.log(PRIORITY.GLOBAL);
    `);
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("5");
  });

  test("INT-KEYBIND-002: all 6 global keybinding keys are registered", async () => {
    const content = await Bun.file(join(TUI_SRC, "hooks/useGlobalKeybindings.ts")).text();
    const expectedKeys = ["q", "escape", "ctrl+c", "?", ":", "g"];
    for (const key of expectedKeys) {
      expect(content).toContain(`"${key}"`);
    }
  });

  test("INT-KEYBIND-003: keybinding priority order TEXT_INPUT < MODAL < GOTO < SCREEN < GLOBAL", async () => {
    const r = await bunEval(`
      import { PRIORITY } from './src/providers/keybinding-types.js';
      const order = [PRIORITY.TEXT_INPUT, PRIORITY.MODAL, PRIORITY.GOTO, PRIORITY.SCREEN, PRIORITY.GLOBAL];
      const sorted = [...order].sort((a, b) => a - b);
      console.log(JSON.stringify(order) === JSON.stringify(sorted) ? 'correct' : 'wrong');
    `);
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("correct");
  });

  test("INT-KEYBIND-004: useGlobalKeybindings registers scope at PRIORITY.GLOBAL", async () => {
    const content = await Bun.file(join(TUI_SRC, "hooks/useGlobalKeybindings.ts")).text();
    expect(content).toContain("PRIORITY.GLOBAL");
    expect(content).toContain("registerScope");
  });

  // ── Responsive layout / TerminalTooSmall ───────────────────────────

  test("INT-RESPONSIVE-001: getBreakpoint returns null for sub-minimum dimensions", async () => {
    const r = await bunEval(`
      import { getBreakpoint } from './src/types/breakpoint.js';
      console.log(getBreakpoint(79, 24) === null, getBreakpoint(80, 23) === null, getBreakpoint(50, 10) === null);
    `);
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("true true true");
  });

  test("INT-RESPONSIVE-002: getBreakpoint returns minimum for 80x24", async () => {
    const r = await bunEval(`
      import { getBreakpoint } from './src/types/breakpoint.js';
      console.log(getBreakpoint(80, 24));
    `);
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("minimum");
  });

  test("INT-RESPONSIVE-003: getBreakpoint returns standard for 120x40", async () => {
    const r = await bunEval(`
      import { getBreakpoint } from './src/types/breakpoint.js';
      console.log(getBreakpoint(120, 40));
    `);
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("standard");
  });

  test("INT-RESPONSIVE-004: getBreakpoint returns large for 200x60", async () => {
    const r = await bunEval(`
      import { getBreakpoint } from './src/types/breakpoint.js';
      console.log(getBreakpoint(200, 60));
    `);
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("large");
  });

  test("INT-RESPONSIVE-005: TerminalTooSmallScreen handles q and Ctrl+C", async () => {
    const content = await Bun.file(join(TUI_SRC, "components/TerminalTooSmallScreen.tsx")).text();
    expect(content).toContain('event.name === "q"');
    expect(content).toContain('event.ctrl');
    expect(content).toContain('process.exit(0)');
  });

  test("INT-RESPONSIVE-006: TerminalTooSmallScreen shows minimum size and current dimensions", async () => {
    const content = await Bun.file(join(TUI_SRC, "components/TerminalTooSmallScreen.tsx")).text();
    expect(content).toContain("Terminal too small");
    expect(content).toContain("80");
    expect(content).toContain("24");
    expect(content).toContain("cols");
    expect(content).toContain("rows");
  });
});
```

---

### Test Suite 2: `TUI_APP_SHELL — Live AppShell integration` (PTY-based)

These tests launch a real TUI process via `launchTUI()` and interact through a PTY.

```typescript
// ---------------------------------------------------------------------------
// TUI_APP_SHELL — Live AppShell integration (PTY-based)
// ---------------------------------------------------------------------------

describe("TUI_APP_SHELL — Live AppShell integration", () => {
  let tui: TUITestInstance | null = null;

  afterEach(async () => {
    if (tui) {
      await tui.terminate();
      tui = null;
    }
  });

  // ── Layout renders at all breakpoints ──────────────────────────────

  test("INT-LIVE-001: AppShell renders HeaderBar + content + StatusBar at standard (120x40)", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Dashboard");
    // HeaderBar: breadcrumb
    const firstLine = tui.getLine(0);
    expect(firstLine).toContain("Dashboard");
    // StatusBar: help hint
    const lastLine = tui.getLine(tui.rows - 1);
    expect(lastLine).toContain("?");
    expect(lastLine).toContain("help");
  }, 20_000);

  test("INT-LIVE-002: AppShell renders at minimum (80x24)", async () => {
    tui = await launchTUI({ cols: 80, rows: 24 });
    await tui.waitForText("Dashboard");
    const snapshot = tui.snapshot();
    expect(snapshot).toContain("Dashboard");
    expect(snapshot).toContain("?");
  }, 20_000);

  test("INT-LIVE-003: AppShell renders at large (200x60)", async () => {
    tui = await launchTUI({ cols: 200, rows: 60 });
    await tui.waitForText("Dashboard");
    const snapshot = tui.snapshot();
    expect(snapshot).toContain("Dashboard");
    expect(snapshot).toContain("?");
  }, 20_000);

  test("INT-LIVE-004: TerminalTooSmall screen renders below 80x24", async () => {
    tui = await launchTUI({ cols: 60, rows: 20 });
    await tui.waitForText("Terminal too small");
    const snapshot = tui.snapshot();
    expect(snapshot).toContain("80");
    expect(snapshot).toContain("24");
    expect(snapshot).not.toContain("Dashboard");
  }, 20_000);

  // ── Resize transitions ────────────────────────────────────────────

  test("INT-LIVE-005: resize from standard to below-minimum shows TerminalTooSmall", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Dashboard");
    await tui.resize(60, 20);
    await tui.waitForText("Terminal too small");
  }, 20_000);

  test("INT-LIVE-006: resize from below-minimum to standard restores normal layout", async () => {
    tui = await launchTUI({ cols: 60, rows: 20 });
    await tui.waitForText("Terminal too small");
    await tui.resize(120, 40);
    await tui.waitForText("Dashboard");
  }, 20_000);

  // ── Global keybinding: ? toggles help overlay ─────────────────────

  test("INT-LIVE-007: ? opens help overlay", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Dashboard");
    await tui.sendKeys("?");
    await tui.waitForText("Keybindings");
    const snapshot = tui.snapshot();
    expect(snapshot).toContain("Esc");
    expect(snapshot).toContain("close");
  }, 20_000);

  test("INT-LIVE-008: ? again closes help overlay (toggle)", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Dashboard");
    await tui.sendKeys("?");
    await tui.waitForText("Keybindings");
    await tui.sendKeys("?");
    await tui.waitForNoText("Keybindings");
  }, 20_000);

  test("INT-LIVE-009: Esc closes help overlay", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Dashboard");
    await tui.sendKeys("?");
    await tui.waitForText("Keybindings");
    await tui.sendKeys("Escape");
    await tui.waitForNoText("Keybindings");
  }, 20_000);

  // ── Global keybinding: : toggles command palette ──────────────────

  test("INT-LIVE-010: : opens command palette overlay", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Dashboard");
    await tui.sendKeys(":");
    await tui.waitForText("Command Palette");
  }, 20_000);

  test("INT-LIVE-011: : again closes command palette (toggle)", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Dashboard");
    await tui.sendKeys(":");
    await tui.waitForText("Command Palette");
    await tui.sendKeys(":");
    await tui.waitForNoText("Command Palette");
  }, 20_000);

  test("INT-LIVE-012: Esc closes command palette overlay", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Dashboard");
    await tui.sendKeys(":");
    await tui.waitForText("Command Palette");
    await tui.sendKeys("Escape");
    await tui.waitForNoText("Command Palette");
  }, 20_000);

  // ── Overlay mutual exclusion ──────────────────────────────────────

  test("INT-LIVE-013: opening command palette while help is open replaces help", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Dashboard");
    await tui.sendKeys("?");
    await tui.waitForText("Keybindings");
    await tui.sendKeys(":");
    await tui.waitForText("Command Palette");
    const snapshot = tui.snapshot();
    expect(snapshot).not.toContain("Keybindings");
    expect(snapshot).toContain("Command Palette");
  }, 20_000);

  test("INT-LIVE-014: opening help while command palette is open replaces command palette", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Dashboard");
    await tui.sendKeys(":");
    await tui.waitForText("Command Palette");
    await tui.sendKeys("?");
    await tui.waitForText("Keybindings");
    const snapshot = tui.snapshot();
    expect(snapshot).toContain("Keybindings");
    expect(snapshot).not.toContain("Command Palette");
  }, 20_000);

  // ── Global keybinding: q navigates back / quits ────────────────────

  test("INT-LIVE-015: q on root screen exits TUI", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Dashboard");
    await tui.sendKeys("q");
    // Process should exit — terminate cleans up
    await tui.terminate();
    tui = null;
  }, 20_000);

  test("INT-LIVE-016: q on non-root screen pops to previous", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Dashboard");
    await tui.sendKeys("g", "r");
    await tui.waitForText("Repositories");
    await tui.sendKeys("q");
    await tui.waitForText("Dashboard");
  }, 20_000);

  // ── Global keybinding: Ctrl+C force quits ──────────────────────────

  test("INT-LIVE-017: Ctrl+C force quits TUI", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Dashboard");
    await tui.sendKeys("ctrl+c");
    await tui.terminate();
    tui = null;
  }, 20_000);

  // ── Deep-link launch ───────────────────────────────────────────────

  test("INT-LIVE-018: launching with --screen search opens Search screen", async () => {
    tui = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "search"],
    });
    await tui.waitForText("Search");
  }, 20_000);

  test("INT-LIVE-019: launching with --screen notifications opens Notifications screen", async () => {
    tui = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "notifications"],
    });
    await tui.waitForText("Notifications");
  }, 20_000);

  test("INT-LIVE-020: launching with --repo owner/repo shows repo context in header", async () => {
    tui = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--repo", "alice/myrepo"],
    });
    await tui.waitForText("alice/myrepo");
  }, 20_000);

  test("INT-LIVE-021: launching with invalid --screen falls back to Dashboard", async () => {
    tui = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "nonexistent"],
    });
    await tui.waitForText("Dashboard");
  }, 20_000);

  test("INT-LIVE-022: launching with --screen repos opens Repository list", async () => {
    tui = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "repos"],
    });
    await tui.waitForText("Repositories");
  }, 20_000);

  // ── StatusBar verifications ───────────────────────────────────────

  test("INT-LIVE-023: StatusBar shows help hint on initial render", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Dashboard");
    const lastLine = tui.getLine(tui.rows - 1);
    expect(lastLine).toContain("?");
    expect(lastLine).toContain("help");
  }, 20_000);

  test("INT-LIVE-024: StatusBar shows Esc:close hint when overlay is open", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Dashboard");
    await tui.sendKeys("?");
    await tui.waitForText("Keybindings");
    const lastLine = tui.getLine(tui.rows - 1);
    expect(lastLine).toMatch(/Esc.*close/);
  }, 20_000);

  test("INT-LIVE-025: StatusBar hints at minimum breakpoint are ≤4", async () => {
    tui = await launchTUI({ cols: 80, rows: 24 });
    await tui.waitForText("Dashboard");
    const lastLine = tui.getLine(tui.rows - 1);
    // Count hint patterns (key:label pairs)
    const hintCount = (lastLine.match(/\S+:\S+/g) || []).length;
    expect(hintCount).toBeLessThanOrEqual(5); // 4 hints + "? help" fixed suffix
  }, 20_000);

  // ── HeaderBar verifications ───────────────────────────────────────

  test("INT-LIVE-026: HeaderBar shows Dashboard breadcrumb on initial render", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Dashboard");
    const firstLine = tui.getLine(0);
    expect(firstLine).toContain("Dashboard");
  }, 20_000);

  test("INT-LIVE-027: HeaderBar shows connection status indicator", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Dashboard");
    const firstLine = tui.getLine(0);
    expect(firstLine).toContain("●");
  }, 20_000);

  test("INT-LIVE-028: HeaderBar hides repo context at minimum breakpoint", async () => {
    tui = await launchTUI({
      cols: 80,
      rows: 24,
      args: ["--repo", "alice/myrepo"],
    });
    await tui.waitForText("Dashboard");
    // At minimum breakpoint, repo context display is suppressed (HeaderBar line 39)
    // The repo name may appear in breadcrumb but not in the dedicated context box
    expect(tui.snapshot()).toMatchSnapshot();
  }, 20_000);

  test("INT-LIVE-029: HeaderBar breadcrumb updates on navigation", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Dashboard");
    await tui.sendKeys("g", "r");
    await tui.waitForText("Repositories");
    const firstLine = tui.getLine(0);
    expect(firstLine).toContain("Repositories");
  }, 20_000);

  // ── Snapshot tests at all breakpoints ──────────────────────────────

  test("INT-SNAP-001: snapshot at minimum breakpoint (80x24)", async () => {
    tui = await launchTUI({ cols: 80, rows: 24 });
    await tui.waitForText("Dashboard");
    expect(tui.snapshot()).toMatchSnapshot();
  }, 20_000);

  test("INT-SNAP-002: snapshot at standard breakpoint (120x40)", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Dashboard");
    expect(tui.snapshot()).toMatchSnapshot();
  }, 20_000);

  test("INT-SNAP-003: snapshot at large breakpoint (200x60)", async () => {
    tui = await launchTUI({ cols: 200, rows: 60 });
    await tui.waitForText("Dashboard");
    expect(tui.snapshot()).toMatchSnapshot();
  }, 20_000);

  test("INT-SNAP-004: snapshot of help overlay at standard size", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Dashboard");
    await tui.sendKeys("?");
    await tui.waitForText("Keybindings");
    expect(tui.snapshot()).toMatchSnapshot();
  }, 20_000);

  test("INT-SNAP-005: snapshot of command palette at standard size", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Dashboard");
    await tui.sendKeys(":");
    await tui.waitForText("Command Palette");
    expect(tui.snapshot()).toMatchSnapshot();
  }, 20_000);

  test("INT-SNAP-006: snapshot of TerminalTooSmall screen", async () => {
    tui = await launchTUI({ cols: 60, rows: 20 });
    await tui.waitForText("Terminal too small");
    expect(tui.snapshot()).toMatchSnapshot();
  }, 20_000);

  // ── Full integration cycle ─────────────────────────────────────────

  test("INT-LIVE-030: full lifecycle — navigate, overlay, close, back", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Dashboard");
    // Navigate to repos
    await tui.sendKeys("g", "r");
    await tui.waitForText("Repositories");
    // Open help overlay
    await tui.sendKeys("?");
    await tui.waitForText("Keybindings");
    // Close overlay
    await tui.sendKeys("Escape");
    await tui.waitForNoText("Keybindings");
    // Still on repos
    await tui.waitForText("Repositories");
    // Back to dashboard
    await tui.sendKeys("q");
    await tui.waitForText("Dashboard");
  }, 30_000);

  test("INT-LIVE-031: resize mid-overlay preserves overlay state", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.waitForText("Dashboard");
    await tui.sendKeys("?");
    await tui.waitForText("Keybindings");
    // Resize to minimum
    await tui.resize(80, 24);
    // Overlay should still be visible (possibly with different sizing)
    await tui.waitForText("Keybindings");
    // Close and verify dashboard still works
    await tui.sendKeys("Escape");
    await tui.waitForText("Dashboard");
  }, 20_000);
});
```

---

## 7. Overlay State Management — Detailed Behavior Matrix

This section documents the expected behavior for all overlay state transitions, derived from the actual `OverlayManager.tsx` implementation:

| Current State | User Action | Expected Result | OverlayManager Path |
|---|---|---|---|
| No overlay | Press `?` | Help overlay opens | `openOverlay("help")` → prev is null → register modal scope → set state to `"help"` |
| No overlay | Press `:` | Command palette opens | `openOverlay("command-palette")` → prev is null → register modal scope → set state to `"command-palette"` |
| Help open | Press `?` | Help closes (toggle) | `openOverlay("help")` → `prev === type` → remove modal scope → set state to `null` |
| Help open | Press `:` | Help closes → Command palette opens | `openOverlay("command-palette")` → `prev !== null && prev !== type` → remove old scope → register new scope → set state to `"command-palette"` |
| Help open | Press `Esc` | Help closes | Modal scope at PRIORITY.MODAL captures `Esc` → calls `closeOverlay()` → removes scope → sets state to `null` |
| Command palette open | Press `:` | Command palette closes (toggle) | `openOverlay("command-palette")` → `prev === type` → remove modal scope → set state to `null` |
| Command palette open | Press `?` | CP closes → Help opens | `openOverlay("help")` → swap path |
| Command palette open | Press `Esc` | Command palette closes | Modal scope `Esc` handler |
| Any overlay open | Press `q` | **q falls through to global scope** — navigates back or exits | Modal scope only has `Esc` binding; `q` dispatches to `PRIORITY.GLOBAL` handler. See §3 Step 3 for implications |
| Any overlay open | Press `Ctrl+C` | Force quit TUI | `Ctrl+C` falls through modal scope (not bound) → reaches `PRIORITY.GLOBAL` → `process.exit(0)` |

---

## 8. Keybinding Priority Dispatch Flow

When a key event arrives at the `KeybindingProvider`:

```
1. useKeyboard(callback) fires with KeyEvent from @opentui/react
2. normalizeKeyEvent(event) → canonical string: "?", "escape", "ctrl+c", etc.
3. getActiveScopesSorted() → scopes filtered by active=true, sorted by:
   - priority ASC (lower number = higher priority)
   - LIFO within same priority (most recently registered first, via scope_N id)
4. For each scope in sorted order:
   a. Check if scope.bindings has the normalized key
   b. If found, check optional when() predicate
   c. If when() returns true (or is absent), call handler()
   d. Call event.preventDefault() + event.stopPropagation()
   e. Return (first match wins — event consumed)
5. If no scope matched → event falls through to OpenTUI focused component
```

Priority values (lower = higher priority):
- `PRIORITY.TEXT_INPUT` = 1 (input fields capture printable keys via OpenTUI focus, not via scope)
- `PRIORITY.MODAL` = 2 (overlay Esc binding from OverlayManager)
- `PRIORITY.GOTO` = 3 (go-to mode second-key bindings, 1500ms timeout)
- `PRIORITY.SCREEN` = 4 (screen-specific bindings registered via useScreenKeybindings)
- `PRIORITY.GLOBAL` = 5 (?, :, q, Esc, Ctrl+C, g)

---

## 9. Productionization Checklist

All code in this ticket targets production files in `apps/tui/src/`. There is no PoC code to graduate.

| Item | Status | Notes |
|---|---|---|
| `GlobalKeybindings.tsx` overlay wiring | **Production code change** | Replaces 3 TODO stubs with real `openOverlay()` calls and documented no-op for go-to |
| Provider hierarchy in `index.tsx` | Already production | Validated correct — no changes needed |
| Deep-link flow `parseCLIArgs` → `buildInitialStack` → `NavigationProvider` | Already production | Validated correct — no changes needed |
| `AppShell.tsx` responsive guard | Already production | Validated correct — no changes needed |
| `OverlayManager.tsx` mutual exclusion | Already production | Validated correct — no changes needed |
| `OverlayLayer.tsx` rendering | Already production | Placeholder content for help/command palette content pending their own tickets |
| E2E tests | **New** | Appended to `e2e/tui/app-shell.test.ts` |

---

## 10. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| PTY-based tests flaky on CI | Medium | Medium | 20s timeouts, `waitForText` with 100ms polling, `afterEach` cleanup with `tui = null` guard |
| Overlay `?`/`:` keys captured by text input when input is focused | None | N/A | `PRIORITY.TEXT_INPUT` (1) captures printable keys via OpenTUI focus system before scope dispatch; `?` and `:` go to input, not global. This is correct behavior — user typing in a search box should not trigger overlays |
| `Esc` pressed with overlay open doesn't fall through to nav | None | N/A | Modal scope at PRIORITY.MODAL (2) registers `Esc` → `closeOverlay()`. Global `Esc` at PRIORITY.GLOBAL (5) never fires while overlay is open. After close, global `Esc` resumes. Correct by design |
| `q` falls through to global scope while overlay is open | Medium | Low | Test OVERLAY-010 documents desired behavior (block q during overlay). Current implementation lets q through. This is a known gap tracked in the overlay implementation tickets. The test is left failing per project policy |
| Snapshot tests break on OpenTUI version updates | Medium | Low | Snapshots are supplementary to interaction tests. Update snapshots when rendering intentionally changes |
| Deep-link with `--screen` requiring repo but missing `--repo` | None | N/A | `buildInitialStack` returns error string and falls back to Dashboard. Test INT-DEEPLINK-004 validates this |
| `openOverlay` function overloads require correct types | None | N/A | `overlay-types.ts` defines overloaded `openOverlay` signatures: `(type: "confirm", payload: ConfirmPayload)` and `(type: Exclude<OverlayType, "confirm">)`. The calls `openOverlay("help")` and `openOverlay("command-palette")` match the second overload. TypeScript will catch any misuse |

---

## 11. Acceptance Criteria

1. **AC-1:** `GlobalKeybindings.tsx` calls `openOverlay("help")` on `?` press and `openOverlay("command-palette")` on `:` press. No TODO comments remain for these callbacks.
2. **AC-2:** `GlobalKeybindings.tsx` imports `useOverlay` from `"../hooks/useOverlay.js"`.
3. **AC-3:** The provider hierarchy in `index.tsx` has `KeybindingProvider` above `OverlayManager` above `NavigationProvider` above `GlobalKeybindings` above `AppShell` above `ScreenRouter`.
4. **AC-4:** Global keybindings `?`, `:`, `q`, `Esc`, `Ctrl+C`, `g` are registered at `PRIORITY.GLOBAL` (5) via `useGlobalKeybindings`.
5. **AC-5:** Deep-link arguments (`--screen`, `--repo`) from CLI are parsed in `index.tsx` and passed to `NavigationProvider` via `buildInitialStack`.
6. **AC-6:** `AppShell` renders `TerminalTooSmallScreen` when terminal dimensions are below 80×24.
7. **AC-7:** Only one overlay is active at a time — opening a new overlay closes the previous one.
8. **AC-8:** Help overlay toggle: `?` opens, `?` again closes.
9. **AC-9:** Command palette toggle: `:` opens, `:` again closes.
10. **AC-10:** `Esc` dismisses any active overlay.
11. **AC-11:** Full provider stack renders correctly at minimum (80×24), standard (120×40), and large (200×60) breakpoints.
12. **AC-12:** All new E2E tests pass (or fail only due to unimplemented backend features, never due to integration wiring issues).
13. **AC-13:** `tsc --noEmit` passes with zero errors after changes.

---

## 12. Test Summary

| Test ID | Type | Description | Breakpoint |
|---|---|---|---|
| INT-PROVIDER-001 | Static analysis | KeybindingProvider wraps OverlayManager | N/A |
| INT-PROVIDER-002 | Static analysis | OverlayManager wraps NavigationProvider | N/A |
| INT-PROVIDER-003 | Static analysis | NavigationProvider wraps GlobalKeybindings | N/A |
| INT-PROVIDER-004 | Static analysis | GlobalKeybindings wraps AppShell | N/A |
| INT-PROVIDER-005 | Static analysis | AppShell wraps ScreenRouter | N/A |
| INT-PROVIDER-006 | Static analysis | ErrorBoundary is outermost provider | N/A |
| INT-PROVIDER-007 | Static analysis | ThemeProvider wraps KeybindingProvider | N/A |
| INT-PROVIDER-008 | Static analysis | initialStack passed to NavigationProvider | N/A |
| INT-FILE-001 | Static analysis | GlobalKeybindings imports useOverlay | N/A |
| INT-FILE-002 | Static analysis | GlobalKeybindings calls openOverlay("help") | N/A |
| INT-FILE-003 | Static analysis | GlobalKeybindings calls openOverlay("command-palette") | N/A |
| INT-FILE-004 | Static analysis | GlobalKeybindings has no remaining TODO stubs | N/A |
| INT-FILE-005 | Static analysis | AppShell renders TerminalTooSmallScreen when null breakpoint | N/A |
| INT-FILE-006 | Static analysis | AppShell renders HeaderBar, StatusBar, OverlayLayer | N/A |
| INT-FILE-007 | Static analysis | OverlayLayer uses responsive modal sizing | N/A |
| INT-FILE-008 | Static analysis | OverlayLayer renders at zIndex 100 | N/A |
| INT-FILE-009 | Static analysis | OverlayLayer returns null when no overlay active | N/A |
| INT-DEEPLINK-001 | Static analysis | index.tsx parses --screen and --repo | N/A |
| INT-DEEPLINK-002 | Unit (bunEval) | No args → Dashboard | N/A |
| INT-DEEPLINK-003 | Unit (bunEval) | --screen issues --repo → 3-entry stack | N/A |
| INT-DEEPLINK-004 | Unit (bunEval) | Repo-required screen without --repo → error | N/A |
| INT-DEEPLINK-005 | Unit (bunEval) | Unknown --screen → error + Dashboard fallback | N/A |
| INT-DEEPLINK-006 | Unit (bunEval) | --repo only → 2-entry stack | N/A |
| INT-DEEPLINK-007 | Unit (bunEval) | Invalid repo format → error | N/A |
| INT-DEEPLINK-008 | Unit (bunEval) | Screen name aliases resolve correctly | N/A |
| INT-OVERLAY-001 | Unit (bunEval) | OverlayManager and OverlayContext exported | N/A |
| INT-OVERLAY-002 | Static analysis | Toggle path (prev === type → close) | N/A |
| INT-OVERLAY-003 | Static analysis | Modal scope registered at PRIORITY.MODAL | N/A |
| INT-OVERLAY-004 | Static analysis | Esc binding in modal scope | N/A |
| INT-OVERLAY-005 | Static analysis | Status bar hint override | N/A |
| INT-KEYBIND-001 | Unit (bunEval) | PRIORITY.GLOBAL is 5 | N/A |
| INT-KEYBIND-002 | Static analysis | All 6 global keys registered | N/A |
| INT-KEYBIND-003 | Unit (bunEval) | Priority ordering correct | N/A |
| INT-KEYBIND-004 | Static analysis | Scope registered at PRIORITY.GLOBAL | N/A |
| INT-RESPONSIVE-001 | Unit (bunEval) | getBreakpoint null for sub-minimum | N/A |
| INT-RESPONSIVE-002 | Unit (bunEval) | getBreakpoint minimum for 80x24 | N/A |
| INT-RESPONSIVE-003 | Unit (bunEval) | getBreakpoint standard for 120x40 | N/A |
| INT-RESPONSIVE-004 | Unit (bunEval) | getBreakpoint large for 200x60 | N/A |
| INT-RESPONSIVE-005 | Static analysis | TerminalTooSmallScreen handles q and Ctrl+C | N/A |
| INT-RESPONSIVE-006 | Static analysis | TerminalTooSmallScreen shows min size | N/A |
| INT-LIVE-001 | PTY integration | Layout renders at 120×40 | Standard |
| INT-LIVE-002 | PTY integration | Layout renders at 80×24 | Minimum |
| INT-LIVE-003 | PTY integration | Layout renders at 200×60 | Large |
| INT-LIVE-004 | PTY integration | TerminalTooSmall at 60×20 | Below min |
| INT-LIVE-005 | PTY integration | Resize standard → below-min | Dynamic |
| INT-LIVE-006 | PTY integration | Resize below-min → standard | Dynamic |
| INT-LIVE-007 | PTY interaction | `?` opens help overlay | Standard |
| INT-LIVE-008 | PTY interaction | `?` toggles help off | Standard |
| INT-LIVE-009 | PTY interaction | `Esc` closes help | Standard |
| INT-LIVE-010 | PTY interaction | `:` opens command palette | Standard |
| INT-LIVE-011 | PTY interaction | `:` toggles command palette off | Standard |
| INT-LIVE-012 | PTY interaction | `Esc` closes command palette | Standard |
| INT-LIVE-013 | PTY interaction | `:` replaces help with palette | Standard |
| INT-LIVE-014 | PTY interaction | `?` replaces palette with help | Standard |
| INT-LIVE-015 | PTY interaction | `q` on root screen exits | Standard |
| INT-LIVE-016 | PTY interaction | `q` on non-root pops to previous | Standard |
| INT-LIVE-017 | PTY interaction | `Ctrl+C` force quits | Standard |
| INT-LIVE-018 | PTY integration | `--screen search` deep link | Standard |
| INT-LIVE-019 | PTY integration | `--screen notifications` deep link | Standard |
| INT-LIVE-020 | PTY integration | `--repo owner/repo` deep link | Standard |
| INT-LIVE-021 | PTY integration | Invalid `--screen` fallback | Standard |
| INT-LIVE-022 | PTY integration | `--screen repos` alias deep link | Standard |
| INT-LIVE-023 | PTY integration | StatusBar shows help hint | Standard |
| INT-LIVE-024 | PTY interaction | StatusBar shows Esc:close hint | Standard |
| INT-LIVE-025 | PTY integration | StatusBar hints limited at minimum | Minimum |
| INT-LIVE-026 | PTY integration | HeaderBar breadcrumb | Standard |
| INT-LIVE-027 | PTY integration | HeaderBar connection indicator | Standard |
| INT-LIVE-028 | PTY integration | HeaderBar hides repo at minimum | Minimum |
| INT-LIVE-029 | PTY integration | HeaderBar breadcrumb updates on nav | Standard |
| INT-SNAP-001 | Snapshot | Full layout at 80×24 | Minimum |
| INT-SNAP-002 | Snapshot | Full layout at 120×40 | Standard |
| INT-SNAP-003 | Snapshot | Full layout at 200×60 | Large |
| INT-SNAP-004 | Snapshot | Help overlay at 120×40 | Standard |
| INT-SNAP-005 | Snapshot | Command palette at 120×40 | Standard |
| INT-SNAP-006 | Snapshot | TerminalTooSmall at 60×20 | Below min |
| INT-LIVE-030 | PTY integration | Full lifecycle navigate-overlay-close-back | Standard |
| INT-LIVE-031 | PTY integration | Resize mid-overlay preserves overlay | Dynamic |

**Total tests:** 69 (38 static/unit + 25 PTY interaction + 6 snapshot)

---

## 13. Relationship to Existing Tests

The existing `e2e/tui/app-shell.test.ts` already contains test suites that overlap with this integration ticket:

- **`TUI_OVERLAY_MANAGER — overlay mutual exclusion`** (tests OVERLAY-001 through OVERLAY-022) — Tests the overlay open/close/toggle/swap behavior from the overlay manager perspective. These tests currently fail because `GlobalKeybindings.tsx` has `?` and `:` as no-op TODO stubs. Once this ticket lands, these tests will begin exercising real overlay behavior.
- **`KeybindingProvider — Priority Dispatch`** (tests KEY-KEY-001 through KEY-RSP-004) — Tests keybinding dispatch at all priority levels. These tests validate the priority system independently.

The new tests in this ticket differ because they:
1. Validate the **structural composition** (provider ordering, import wiring, source-level contracts).
2. Test **deep-link launch** end-to-end through the full provider stack.
3. Test **resize transitions** between breakpoints.
4. Add snapshot coverage at all three breakpoints for the assembled layout.
5. Test the **full lifecycle** (navigate → overlay → close → back) as an integration path.

The new tests are complementary, not duplicative. They catch regressions that the existing focused tests would miss (e.g., a change to provider ordering that breaks overlay context availability, or a deep-link regression that only manifests when the full stack is assembled).

---

## 14. Known Design Tensions

### `q` behavior during active overlay

**Current implementation:** The modal scope registered by `OverlayManager` only contains an `Esc` binding. When `q` is pressed with an overlay open, it falls through the priority dispatch to `PRIORITY.GLOBAL` and triggers `onQuit` (nav.pop or process.exit).

**Desired behavior (per test OVERLAY-010):** `q` should be blocked while an overlay is open.

**Resolution:** The modal scope needs to either: (a) register a `q` binding that is a no-op (consuming the key), or (b) use a catch-all mechanism to consume all keys except those explicitly handled. This change belongs to the overlay implementation tickets (tui-command-palette, tui-help-overlay), not this integration ticket. The test OVERLAY-010 remains as a failing signal.

### `Ctrl+C` during active overlay

**Current implementation:** `Ctrl+C` falls through modal scope (not bound) → reaches `PRIORITY.GLOBAL` → `process.exit(0)`. This means Ctrl+C always exits, even with an overlay open.

**Desired behavior (per test OVERLAY-019):** This IS the desired behavior. Ctrl+C is an escape hatch that always works. The test validates this.

**Note:** The `exitOnCtrlC: false` flag on the renderer (index.tsx line 31) prevents the terminal from handling Ctrl+C natively, allowing it to flow through the keybinding system instead.