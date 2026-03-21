# Codeplane TUI — High-Level Engineering Architecture

This document defines the engineering architecture for the Codeplane terminal user interface. It covers the runtime stack, core abstractions, data flow, testing strategy, and dependency philosophy. It is grounded in the current repository layout, the OpenTUI framework, and the shared `@codeplane/ui-core` data layer.

This document is the engineering counterpart to [specs/tui/prd.md](./prd.md) (product requirements) and [specs/tui/design.md](./design.md) (interaction design). Where those documents describe _what_ the TUI does and _how it looks_, this document describes _how it is built_.

---

## High-Level Architecture

### Runtime Stack

```
┌──────────────────────────────────────────────────────────────┐
│                        Bun Runtime                           │
│  Entry: codeplane tui → apps/tui/src/index.tsx               │
├──────────────────────────────────────────────────────────────┤
│                     React 19 (Reconciler)                    │
│  JSX → React fiber tree → OpenTUI reconciler → native nodes │
├──────────────────────────────────────────────────────────────┤
│                  @opentui/react (Bindings)                   │
│  createRoot · useKeyboard · useTerminalDimensions            │
│  useOnResize · useTimeline · useRenderer                     │
├──────────────────────────────────────────────────────────────┤
│                  @opentui/core (Native Zig)                  │
│  CliRenderer · Flexbox layout · ANSI rendering               │
│  KeyEvent · TerminalPalette · RenderContext                  │
├──────────────────────────────────────────────────────────────┤
│                     Terminal (stdin/stdout)                   │
│  Alternate screen buffer · Raw mode · SIGWINCH               │
└──────────────────────────────────────────────────────────────┘
```

The TUI runs as a single Bun process. OpenTUI's native Zig core handles terminal I/O, flexbox layout computation, and ANSI escape sequence generation. The React 19 reconciler maps the JSX component tree to OpenTUI's native node graph. Rendering targets 60fps with a minimum of 30fps.

### Process Lifecycle

```
codeplane tui [--screen <id>] [--repo <owner/repo>] [--org <slug>]
  │
  ├─ 1. Terminal setup (alternate screen, raw mode, cursor hide)
  ├─ 2. Create CliRenderer via createCliRenderer()
  ├─ 3. Create React root via createRoot(renderer)
  ├─ 4. Mount provider tree → first render ≤ 200ms
  ├─ 5. Auth token resolution → validation → dashboard or deep-link screen
  ├─ 6. Main loop (event-driven: keyboard, resize, SSE, timers)
  └─ 7. Teardown (restore terminal, clear listeners, exit)
```

Exit triggers: `q` on root screen (code 0), `Ctrl+C` (code 0), fatal error (code 1), SIGTERM/SIGHUP (code 1).

### Provider Hierarchy

The root component mounts a strict provider hierarchy. Each provider gates or configures its subtree:

```
AppContext.Provider          ← OpenTUI renderer + key handler (from createRoot)
  └─ ErrorBoundary           ← Catches unhandled React errors
      └─ ThemeProvider        ← Color tokens, color depth detection
          └─ AuthProvider     ← Token resolution, validation, gates children
              └─ APIClientProvider  ← Configured HTTP client with auth header
                  └─ SSEProvider    ← Managed SSE connections, ticket auth
                      └─ NavigationProvider  ← Screen stack, go-to mode
                          └─ App             ← Layout shell + screen renderer
```

`AuthProvider` is a gate: it renders the loading/error screen until auth succeeds, then renders children. No child provider or screen mounts before authentication completes (or is skipped in offline mode).

### Module Organization

```
apps/tui/src/
├── index.tsx                    # Entry point: terminal setup + React root
├── app.tsx                      # App shell: header bar + content + status bar
├── providers/
│   ├── ThemeProvider.tsx         # Color token context
│   ├── AuthProvider.tsx          # Token resolution + validation gate
│   ├── APIClientProvider.tsx     # HTTP client context
│   ├── SSEProvider.tsx           # SSE connection manager
│   └── NavigationProvider.tsx    # Screen stack + go-to mode
├── router/
│   ├── ScreenRouter.tsx          # Renders current screen from stack
│   ├── screens.ts                # Screen registry (ID → component + title)
│   └── types.ts                  # ScreenEntry, NavigationContext types
├── components/
│   ├── HeaderBar.tsx             # Breadcrumb trail + repo context + badges
│   ├── StatusBar.tsx             # Keybinding hints + sync + notifications
│   ├── ListComponent.tsx         # Generic vim-navigable list
│   ├── DetailView.tsx            # Scrollable detail layout
│   ├── FormComponent.tsx         # Tab-navigable form with fields
│   ├── Modal.tsx                 # Overlay container with focus trap
│   ├── CommandPalette.tsx        # : keybinding → fuzzy search overlay
│   ├── HelpOverlay.tsx           # ? keybinding → current screen help
│   ├── LoadingSpinner.tsx        # Braille spinner with message
│   └── ErrorScreen.tsx           # Error display with retry/quit
├── hooks/
│   ├── useBreakpoint.ts          # Terminal size → breakpoint name
│   ├── useResponsiveValue.ts     # Breakpoint → concrete value
│   ├── useKeyboardNavigation.ts  # j/k/G/gg/Ctrl+D/Ctrl+U list helpers
│   ├── useGlobalKeybindings.ts   # q/Esc/?/:/g bindings
│   ├── usePagination.ts          # Cursor-based pagination with scroll detection
│   ├── useSSEChannel.ts          # Subscribe to named SSE channel
│   └── useTheme.ts               # Access theme context
├── theme/
│   ├── tokens.ts                 # Semantic color token definitions
│   └── detect.ts                 # Terminal color capability detection
├── screens/
│   ├── Dashboard/                # Dashboard screen + sub-components
│   ├── Repository/               # Repo overview, tabs, sub-views
│   ├── Issues/                   # Issue list, detail, create, edit
│   ├── Landings/                 # Landing request screens
│   ├── Diff/                     # Diff viewer (unified + split)
│   ├── Workspaces/               # Workspace management
│   ├── Workflows/                # Workflow runs, log streaming
│   ├── Search/                   # Global search with tabs
│   ├── Notifications/            # Notification inbox
│   ├── Agents/                   # Agent chat sessions
│   ├── Settings/                 # User settings
│   ├── Organizations/            # Org/team management
│   ├── Sync/                     # Daemon sync status
│   └── Wiki/                     # Wiki pages
└── util/
    ├── truncate.ts               # Smart text truncation with ellipsis
    ├── format.ts                 # Date, number, status formatting
    └── constants.ts              # Max stack depth, timeouts, breakpoints
```

### Data Flow

```
                  ┌─────────────┐
                  │ Codeplane   │
                  │ API Server  │
                  └──────┬──────┘
                         │
              ┌──────────┼──────────┐
              │ HTTP     │ SSE      │
              ▼          ▼          │
     ┌────────────┐ ┌──────────┐   │
     │ API Client │ │ SSE      │   │
     │ (fetch)    │ │ Provider │   │
     └─────┬──────┘ └────┬─────┘   │
           │              │         │
    ┌──────▼──────────────▼─────┐   │
    │     @codeplane/ui-core    │   │
    │  useRepos · useIssues     │   │
    │  useLandings · useSearch  │   │
    │  useNotifications         │   │
    │  useUser · useWorkflows   │   │
    └──────────┬────────────────┘   │
               │                    │
    ┌──────────▼────────────────┐   │
    │    Screen Components      │   │
    │  (React state + JSX)      │   │
    └──────────┬────────────────┘   │
               │                    │
    ┌──────────▼────────────────┐   │
    │   OpenTUI Native Nodes    │   │
    │   <box> <text> <scrollbox>│   │
    └──────────┬────────────────┘   │
               │                    │
    ┌──────────▼────────────────┐   │
    │   Terminal (stdout)       │   │
    └───────────────────────────┘   │
                                    │
    stdin (keyboard) ───────────────┘
```

Data flows down from the API through shared hooks into screen components. Keyboard events flow up from stdin through OpenTUI's key handler into `useKeyboard` subscribers. SSE events flow in via a parallel channel and update React state through the SSE provider.

---

## Core Abstractions

### 1. Screen Router and Navigation Stack

The screen router manages a stack-based navigation model. Every screen is a React component registered in a screen registry with an ID, display title, and optional context requirements.

**Navigation stack entry:**
```typescript
interface ScreenEntry {
  screenId: ScreenId;
  title: string;
  context: ScreenContext;
}

interface ScreenContext {
  repo?: string;      // "owner/repo"
  org?: string;       // org slug
  issueNumber?: number;
  landingId?: string;
  // ... screen-specific context
}
```

**Stack operations:**
- `push(screenId, context)` — add screen to stack top. No-op if identical to current top.
- `pop()` — remove top screen. If stack depth is 1, quit TUI.
- `goTo(screenId, context)` — replace entire stack with logical path to destination.

Maximum stack depth: 32 entries. Stack entries preserve scroll position and focused element for back-navigation. The router re-renders only the content area on transitions — header bar and status bar remain stable.

**Go-to mode** is a two-key sequence (`g` + destination key) processed by the router. It has a 1500ms timeout, is suppressed when text input is focused or a modal is open, and replaces the stack (rather than pushing).

**Deep-link launch** parses `--screen`, `--repo`, and `--org` CLI arguments to pre-populate the stack with logical intermediate screens, so `q` walks back naturally.

### 2. Component Library

The TUI defines a set of shared components built on OpenTUI primitives. These components enforce consistent layout, keyboard interaction, and color token usage across all screens.

#### ListComponent

Generic list with vim-style navigation. Used by every list screen (issues, landings, repos, notifications, workflows, etc.).

```
Props:
  items: T[]
  renderRow: (item: T, focused: boolean) => ReactNode
  onSelect: (item: T) => void
  onLoadMore?: () => void
  loading?: boolean
  emptyMessage?: string

Keyboard:
  j/Down — move focus down
  k/Up — move focus up
  Enter — select focused item
  Space — toggle multi-select (when enabled)
  G — jump to bottom
  gg — jump to top
  Ctrl+D — page down
  Ctrl+U — page up
  / — focus inline filter

Internal:
  - Wraps <scrollbox> with focus tracking
  - Calls onLoadMore when scroll reaches 80% of content
  - Shows LoadingSpinner at bottom during pagination
  - Focused row uses `primary` color or reverse video
```

#### DetailView

Scrollable single-item view with titled sections. Used by issue detail, landing detail, workspace detail, etc.

```
Props:
  header: ReactNode
  sections: Array<{ title: string; content: ReactNode }>

Keyboard:
  j/k — scroll content
  Ctrl+D/Ctrl+U — page scroll

Internal:
  - Wraps <scrollbox>
  - Renders section titles in bold with border separators
```

#### FormComponent

Tab-navigable form system with labeled fields. Used by issue create, landing create, settings edit, etc.

```
Field types:
  <input> — single-line text
  <textarea> — multi-line text
  <select> — single/multi-select dropdown

Keyboard:
  Tab — next field
  Shift+Tab — previous field
  Enter — submit (when on submit button)
  Ctrl+S — submit from anywhere
  Esc — cancel form

Internal:
  - Field focus ring tracked by index
  - q/g/:/? passed to focused input, not intercepted as navigation
  - Submit shows "Saving..." on button, reverts on error
```

#### Modal

Positioned overlay with focus trap. Used by command palette, help overlay, confirmation dialogs.

```
Props:
  width: string    // percentage, responsive via useResponsiveValue
  height: string
  onDismiss: () => void
  children: ReactNode

Keyboard:
  Esc — dismiss

Internal:
  - <box position="absolute" top="center" left="center">
  - Focus trapped within modal children
  - Rendered in overlay layer above content
  - Width: 60% at standard, 90% at minimum, 50% at large
```

#### HeaderBar

Single-row header rendering breadcrumb trail, repo context, and status indicators.

```
Sections:
  Left: breadcrumb segments joined by " > " (current in primary, previous in muted)
  Center: repo context (hidden at minimum breakpoint)
  Right: connection dot (success/warning/error) + notification badge

Responsive:
  Minimum: breadcrumb truncated from left with "…", repo context hidden
  Standard: full breadcrumb up to ~80 chars, all sections visible
  Large: no truncation
```

#### StatusBar

Single-row footer rendering keybinding hints, sync status, and help prompt.

```
Sections:
  Left: context-sensitive keybinding hints for current screen
  Center: sync status indicator (connected/syncing/disconnected)
  Right: unread notification count + "? help"

States:
  Go-to mode: shows "-- GO TO --" in warning color
  Input focused: shows applicable keybinding subset
```

### 3. Data Hooks Integration with @codeplane/ui-core

The TUI consumes the same data access layer as the web UI. `@codeplane/ui-core` provides React hooks that wrap the `@codeplane/sdk` service layer and manage fetch state, pagination, and optimistic updates.

**Shared hooks consumed by TUI screens:**

| Hook | Returns | Used by |
|------|---------|---------|
| `useRepos(filters)` | `{ repos, loading, loadMore }` | Dashboard, Repo list |
| `useIssues(repo, filters)` | `{ issues, loading, loadMore }` | Issue list |
| `useIssue(repo, number)` | `{ issue, loading, mutate }` | Issue detail |
| `useLandings(repo, filters)` | `{ landings, loading, loadMore }` | Landing list |
| `useLanding(repo, id)` | `{ landing, loading, mutate }` | Landing detail |
| `useNotifications(filters)` | `{ notifications, unreadCount, markRead }` | Notification inbox, badge |
| `useSearch(query, type)` | `{ results, loading }` | Search screen |
| `useUser()` | `{ user, loading }` | Auth, settings, header |
| `useWorkflows(repo)` | `{ workflows, runs, loading }` | Workflow list |
| `useWorkspaces()` | `{ workspaces, loading }` | Workspace list |

**API client configuration:**

The `APIClientProvider` wraps children with a configured HTTP client context:
- Base URL from `CODEPLANE_API_URL` or CLI config
- `Authorization: Bearer <token>` header
- 30-second request timeout
- Response parsing with error extraction

**Optimistic UI:**
- Form submissions apply local state updates immediately
- Reverts on server error with user-visible error message
- List mutations (close issue, mark read) apply optimistically
- Rollback re-renders the previous state seamlessly

**Pagination:**
- Cursor-based pagination via scroll-to-end detection in `<scrollbox>`
- `usePagination` hook calls `loadMore` when scroll position reaches 80% of content height
- Loading indicator shown at list bottom during fetch
- Loaded pages cached for instant back-navigation

### 4. SSE Streaming Infrastructure

Real-time data is delivered via Server-Sent Events over four channels:

| Channel | Data | Used by |
|---------|------|---------|
| Notifications | Inbox updates, unread count | Badge, notification list |
| Workflow logs | Line-by-line log output with ANSI | Workflow run detail |
| Workspace status | State transitions (creating → running → suspended) | Workspace detail |
| Agent responses | Incremental tokens with markdown | Agent chat |

**Connection lifecycle:**

```
1. AuthProvider supplies token
2. SSEProvider exchanges token for SSE ticket via POST /api/auth/sse-ticket
3. EventSource opened to GET /api/notifications (or appropriate endpoint) with ticket
4. Events dispatched to subscribers via useSSEChannel(channel) hook
5. On disconnect: exponential backoff reconnection (1s, 2s, 4s, 8s, ..., max 30s)
6. On reconnect: Last-Event-ID header sent for event replay
7. Keep-alive: server sends comment every 15s; client times out at 45s
```

**Provider API:**

```typescript
interface SSEContextValue {
  status: "connected" | "connecting" | "disconnected";
  subscribe(channel: string, handler: (event: SSEEvent) => void): () => void;
}
```

**Status bar integration:** Connection status is shown as a colored dot — green (connected), yellow (connecting), red (disconnected with retry countdown).

**SSE rendering contract:** All SSE-driven content renders incrementally as events arrive. Workflow logs render line-by-line with ANSI color passthrough. Agent responses render token-by-token with progressive markdown formatting. The TUI never buffers-then-flushes.

### 5. Keyboard Input Handling

Keyboard input flows through three layers:

```
stdin (raw mode)
  └─ OpenTUI CliRenderer (parses ANSI/Kitty escape sequences)
      └─ KeyEvent { name, raw, shift?, ctrl?, meta?, repeated?, eventType }
          └─ useKeyboard(handler) subscribers (React components)
```

**Global keybinding system:**

The `useGlobalKeybindings` hook registers router-level bindings that are active on all screens. It uses a priority system:

1. **Always active:** `Ctrl+C` (quit)
2. **Active unless text input focused:** `q` (pop), `Esc` (close overlay / pop), `?` (help), `:` (command palette), `g` (go-to mode)
3. **Screen-specific bindings:** registered by individual screens, lower priority than global

When a `<input>` or `<textarea>` has focus, single-character keys (`q`, `g`, `?`, `:`, `/`) are passed to the input. Only `Esc` and `Ctrl+C` remain active at the global level.

**Go-to mode** is a stateful key chord:
1. `g` pressed → enter go-to mode (status bar shows `-- GO TO --`)
2. Second key within 1500ms → navigate or cancel
3. Timeout after 1500ms → cancel silently

**Key processing budget:** 16ms maximum (one frame at 60fps). No key events are dropped during rapid input.

**vim-style navigation helpers** are encapsulated in `useKeyboardNavigation`:
- `j`/`k` — cursor movement (wraps at boundaries)
- `G` — jump to end
- `g g` — jump to start (reuses go-to mode timeout)
- `Ctrl+D`/`Ctrl+U` — page up/down (half viewport height)
- `Enter` — select
- `Space` — toggle

### 6. Responsive Layout System

Terminal dimensions drive layout decisions through three named breakpoints:

| Breakpoint | Terminal Size | Behavior |
|------------|--------------|----------|
| _(unsupported)_ | < 80×24 | "Terminal too small" message, all content hidden |
| `minimum` | 80×24 – 119×39 | Sidebar hidden, metadata columns hidden, breadcrumb truncated, modals 90% |
| `standard` | 120×40 – 199×59 | Full layout, sidebar at 25%, all columns visible, modals 60% |
| `large` | 200×60+ | Expanded spacing, extra context lines in diffs, modals 50% |

**Hooks:**

```typescript
useBreakpoint(): "minimum" | "standard" | "large"
useResponsiveValue({ minimum: A, standard: B, large: C }): A | B | C
useTerminalDimensions(): { width: number, height: number }
useOnResize(callback: (width, height) => void): void
```

**Resize handling:** Layout recalculation is synchronous on SIGWINCH. No animation, no intermediate states. A resize from valid-to-unsupported immediately shows the "too small" message. A resize from unsupported-to-valid immediately restores the full layout with preserved navigation stack, scroll positions, and focus.

**Sidebar:** 25% width at standard/large (capped at 60 columns), 0% at minimum. Toggled via `Ctrl+B`. Toggle state persists across screen transitions.

**Content area:** Terminal height minus 2 rows (1 header + 1 status bar). All available space goes to the active screen.

### 7. Theme and Color Token System

The TUI uses a single dark theme with semantic color tokens. No light theme is supported.

**Color detection cascade:**
1. `COLORTERM=truecolor` or `COLORTERM=24bit` → 24-bit RGB
2. ANSI 256 (default fallback)
3. ANSI 16 (for `TERM=linux`, `TERM=xterm`, or `NO_COLOR` environments)

**Semantic tokens:**

| Token | Truecolor | ANSI 256 | ANSI 16 | Usage |
|-------|-----------|----------|---------|-------|
| `primary` | `#2563EB` | 33 | Blue | Focus, links, active tabs |
| `success` | `#16A34A` | 34 | Green | Open, passed, additions |
| `warning` | `#CA8A04` | 178 | Yellow | Pending, conflicts, syncing |
| `error` | `#DC2626` | 196 | Red | Errors, failed, closed |
| `muted` | `#A3A3A3` | 245 | White (dim) | Metadata, timestamps |
| `surface` | `#262626` | 236 | Black (bright) | Modal backgrounds |
| `border` | `#525252` | 240 | White (dim) | Borders, separators |

**Diff tokens:**

| Token | Truecolor | ANSI 256 |
|-------|-----------|----------|
| `diffAddedBg` | `#1A4D1A` | 22 |
| `diffRemovedBg` | `#4D1A1A` | 52 |
| `diffAddedText` | `#22C55E` | 34 |
| `diffRemovedText` | `#EF4444` | 196 |
| `diffHunkHeader` | `#06B6D4` | 37 |

**Implementation:** Token values are `RGBA` objects from `@opentui/core`, created once at startup and provided via `ThemeProvider` context. Components access tokens via `useTheme()`. No component uses hardcoded color strings — every color resolves through the token system.

### 8. Auth Token Loading

Authentication is delegated to the CLI. The TUI is a read-only consumer of stored tokens.

**Token resolution chain (priority order):**
1. `CODEPLANE_TOKEN` environment variable
2. System keychain (via `resolveAuthToken()` from `@codeplane/cli/auth-state`)
3. Legacy config file

**Validation flow:**
1. Resolve token synchronously from the chain above
2. If no token → render "Not authenticated" error screen (`q` to quit, `R` to retry)
3. Validate token via `GET /api/user` (5-second timeout)
4. If 401 → render "Session expired" error screen
5. If network unreachable or timeout → proceed optimistically, show `⚠ offline` in status bar
6. If valid → transition to dashboard or deep-linked screen

The `AuthProvider` gates all child rendering. No screen, no SSE connection, no API call happens before auth resolves to `"authenticated"` or `"offline"`.

### 9. Error Handling

**Three error layers:**

1. **React error boundary** (top-level): catches unhandled component errors. Renders error message in red, collapsed stack trace, `r` to restart (reset to dashboard), `q` to quit.

2. **Network error handling** (per-screen): API request failures show inline error messages on the affected screen. `R` to retry. 429 (rate limited) shows retry-after countdown with no auto-retry.

3. **Auth error handling** (provider-level): 401 from any data hook triggers full-screen "Session expired" message. Stack is preserved — user can re-auth externally and retry.

**Terminal recovery:** Signal handlers for SIGINT, SIGTERM, SIGHUP restore terminal state (exit alternate screen, disable raw mode, show cursor). On unrecoverable crash, `reset` command recovers the terminal.

---

## Engineering Prerequisites

The following foundational work must be completed before feature screens can be implemented. Each item is a self-contained unit of work.

### P0 — Bootstrap and Render Pipeline

1. **Entry point and terminal setup** — `apps/tui/src/index.tsx` with alternate screen, raw mode, cursor hide, signal handlers, teardown.
2. **Provider tree assembly** — Mount the full provider hierarchy in correct order.
3. **ThemeProvider + color detection** — Detect terminal color depth, create frozen token object, provide via context.
4. **AuthProvider + token loading** — Resolve token, validate against API, gate children. Loading/error screens.
5. **First render target** — Header bar + empty content area + status bar rendering within 200ms.

### P1 — Navigation Infrastructure

6. **NavigationProvider + screen stack** — Push/pop/goTo operations, max depth 32, breadcrumb generation.
7. **ScreenRouter** — Screen registry, component resolution, transition rendering, scroll position preservation.
8. **Global keybinding system** — `useGlobalKeybindings` with priority layers and text-input suppression.
9. **Go-to mode** — Two-key chord with 1500ms timeout, context-dependent routing, status bar indicator.
10. **Deep-link launch** — `--screen`/`--repo`/`--org` argument parsing, stack pre-population.

### P2 — Shared Components

11. **HeaderBar** — Breadcrumb rendering with responsive truncation, repo context, connection dot, notification badge.
12. **StatusBar** — Keybinding hints, sync status, go-to mode indicator, unread count.
13. **ListComponent** — Vim-navigable scrollable list with pagination, focus tracking, inline filter.
14. **DetailView** — Scrollable sections with headers.
15. **FormComponent** — Tab-navigable fields with submit/cancel, `Ctrl+S` shortcut.
16. **Modal** — Overlay with focus trap, `Esc` dismiss, responsive sizing.
17. **CommandPalette** — `:` trigger, fuzzy search, command/navigation execution.
18. **HelpOverlay** — `?` trigger, context-sensitive keybinding display.
19. **LoadingSpinner** — Braille spinner animation (ASCII fallback for `TERM=dumb`).
20. **ErrorScreen** — Error message + stack trace + retry/quit controls.

### P3 — Data Layer

21. **APIClientProvider** — HTTP client context with base URL, auth header, timeout.
22. **SSEProvider** — Connection manager with ticket auth, exponential backoff reconnect, channel subscription.
23. **@codeplane/ui-core hooks** — If not yet available, create TUI-side wrappers around `@codeplane/sdk` services that expose the same hook API (`useRepos`, `useIssues`, etc.) with fetch state, pagination, and optimistic update patterns.

### P4 — Responsive and Polish

24. **Responsive layout hooks** — `useBreakpoint`, `useResponsiveValue`, sidebar toggle state management.
25. **Terminal-too-small gate** — Detect sub-80×24 and replace content with sized message.
26. **Text truncation utility** — Smart truncation with `…`, accounting for double-width CJK characters.

---

## Testing Philosophy

### Framework

All TUI end-to-end tests use `@microsoft/tui-test`. This framework provides:

- **Terminal snapshot matching**: capture the full rendered terminal output and compare against golden files.
- **Keyboard interaction simulation**: send keypress sequences and assert on resulting terminal state.
- **Regex text assertions**: match terminal content against patterns without brittle exact-string matching.
- **Terminal size control**: launch tests at specific dimensions (80×24, 120×40, 200×60).

### Test Organization

Test files map 1:1 to feature groups from `specs/tui/features.ts`:

```
e2e/tui/
├── app-shell.test.ts        # TUI_APP_SHELL features (bootstrap, auth, router, chrome)
├── dashboard.test.ts        # TUI_DASHBOARD features
├── repository.test.ts       # TUI_REPOSITORY features
├── issues.test.ts           # TUI_ISSUES features
├── landings.test.ts         # TUI_LANDINGS features
├── diff.test.ts             # TUI_DIFF features
├── workspaces.test.ts       # TUI_WORKSPACES features
├── workflows.test.ts        # TUI_WORKFLOWS features
├── search.test.ts           # TUI_SEARCH features
├── notifications.test.ts    # TUI_NOTIFICATIONS features
├── agents.test.ts           # TUI_AGENTS features
├── settings.test.ts         # TUI_SETTINGS features
├── organizations.test.ts    # TUI_ORGANIZATIONS features
├── sync.test.ts             # TUI_SYNC features
└── wiki.test.ts             # TUI_WIKI features
```

### Test Categories

Each test file contains three categories of tests:

**1. Terminal snapshot tests** — Capture the terminal at key states and compare against golden files. Snapshots are captured at multiple terminal sizes (80×24, 120×40, 200×60) to verify responsive behavior. Golden files are committed to the repository and updated explicitly.

```
Example: "renders issue list with filters applied"
  - Launch TUI, navigate to issues for a test repo
  - Apply "open" state filter
  - Capture terminal snapshot
  - Assert matches golden file at 120×40
```

**2. Keyboard interaction tests** — Send keypress sequences and assert on terminal content or state changes. These test user-facing behavior, not implementation details.

```
Example: "j/k navigates issue list and Enter opens detail"
  - Launch TUI at issue list
  - Send j, j, Enter
  - Assert terminal shows issue detail for the third item
  - Send q
  - Assert terminal shows issue list with third item focused
```

**3. Responsive tests** — Verify layout adaptation at breakpoint boundaries and during resize.

```
Example: "sidebar collapses at minimum breakpoint"
  - Launch TUI at 80×24 with code explorer open
  - Assert file tree sidebar is not visible
  - Resize to 120×40
  - Assert file tree sidebar appears at 25% width
```

### Test Principles

1. **Tests validate user-facing behavior, not implementation details.** A test should describe what a user sees or does, not which React hook was called or which DOM node was mutated.

2. **Tests that fail due to unimplemented backend features stay failing.** They are never skipped, commented out, or mocked. A failing test is a specification of intended behavior. When the backend feature is implemented, the test starts passing.

3. **Tests run against a real API server with test fixtures.** No mocking of HTTP responses or SDK services. The test environment includes a running Codeplane API server (or daemon) seeded with deterministic test data.

4. **Snapshot tests are golden-file based.** Terminal output is captured as plain text (with ANSI escape sequences stripped) and compared against committed golden files. Updating a golden file is an explicit `--update-snapshots` action.

5. **No mocking of OpenTUI internals.** Tests interact with the TUI the same way a user would: keypresses and terminal output. The `@microsoft/tui-test` framework handles terminal emulation.

6. **Timing-sensitive tests use assertions, not sleeps.** Wait for specific terminal content to appear (e.g., "Loading…" text disappears) rather than sleeping for a fixed duration.

---

## 3rd Party Dependencies

### Core Framework (Non-negotiable)

| Package | Role | Why it's locked |
|---------|------|----------------|
| `@opentui/core` | Native terminal rendering, layout, input | The TUI is built _on_ OpenTUI. It is not a swappable rendering layer. All components compile to OpenTUI native nodes. |
| `@opentui/react` | React 19 reconciler for OpenTUI | Bridges React's component model to OpenTUI's native node graph. Provides `createRoot`, `useKeyboard`, `useTerminalDimensions`, `useOnResize`, `useTimeline`. |
| `react` (19.x) | Component model, state management, effects | React 19 is the component framework. Hooks, context, error boundaries, concurrent features. |

### Shared Codeplane Packages

| Package | Role |
|---------|------|
| `@codeplane/ui-core` | Shared data hooks, API client, command definitions. Consumed identically by TUI and web UI. To be created if not yet available. |
| `@codeplane/sdk` | TypeScript SDK with typed service methods for all Codeplane API endpoints. Used by `ui-core` hooks internally. |
| `@codeplane/cli` (auth-state) | `resolveAuthToken()` function shared with CLI for token resolution from env/keychain/config. |

### Test Framework

| Package | Role |
|---------|------|
| `@microsoft/tui-test` | Terminal UI E2E testing. Spawns TUI in a virtual terminal, sends keypresses, captures output, compares snapshots. |

### Dependency Addition Policy

Any dependency beyond those listed above requires justification and a proof-of-concept test before adoption:

1. **Write a PoC script** in `poc/` that demonstrates the dependency works in the TUI's runtime environment (Bun + OpenTUI + React 19).
2. **Verify terminal compatibility**: the dependency must not require a browser, DOM, or Node-specific APIs unavailable in Bun.
3. **Verify bundle impact**: measure the effect on first-render time (must remain ≤ 200ms).
4. **Verify license compatibility**: must be compatible with the project's license.
5. **Document the decision** in a brief note alongside the PoC.

Dependencies that are thin wrappers around functionality achievable with standard library APIs or existing packages are rejected in favor of writing the code directly.

---

## Source of Truth

This architecture document should be maintained alongside:

- [specs/tui/prd.md](./prd.md) — Product requirements
- [specs/tui/design.md](./design.md) — Interaction design
- [specs/tui/features.ts](./features.ts) — Feature inventory
- [specs/design.md](../design.md) — Platform design
- [context/opentui/](../../context/opentui/) — OpenTUI framework reference
