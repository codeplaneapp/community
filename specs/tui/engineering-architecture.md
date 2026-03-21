# Codeplane TUI — High-Level Engineering Architecture

This document defines the engineering architecture for the Codeplane terminal user interface. It is the technical companion to [prd.md](./prd.md) and [design.md](./design.md), describing the systems, abstractions, and patterns that must exist before feature-level implementation begins.

All implementation targets `apps/tui/src/`. All tests target `e2e/tui/`.

---

## High-Level Architecture

### System Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Terminal (stdin/stdout)                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    OpenTUI Zig Native Core                   │   │
│  │  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌──────────────┐  │   │
│  │  │ Renderer │ │  Layout  │ │   Input   │ │  Tree-sitter │  │   │
│  │  │ (stdout) │ │  (Yoga)  │ │  (stdin)  │ │  Highlight   │  │   │
│  │  └──────────┘ └──────────┘ └───────────┘ └──────────────┘  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              ▲                                      │
│                              │ @opentui/react reconciler            │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                      React 19 Application                    │   │
│  │                                                              │   │
│  │  ┌────────────────────────────────────────────────────────┐ │   │
│  │  │                   Provider Stack                        │ │   │
│  │  │                                                         │ │   │
│  │  │  AppContext.Provider                                    │ │   │
│  │  │    → ErrorBoundary                                      │ │   │
│  │  │      → AuthProvider                                     │ │   │
│  │  │        → APIClientProvider                              │ │   │
│  │  │          → SSEProvider                                  │ │   │
│  │  │            → NavigationProvider                         │ │   │
│  │  │              → ThemeProvider                             │ │   │
│  │  │                → KeybindingProvider                      │ │   │
│  │  │                  → AppShell                              │ │   │
│  │  └────────────────────────────────────────────────────────┘ │   │
│  │                                                              │   │
│  │  ┌──────────────────────────────────────────────────────┐   │   │
│  │  │                     AppShell                          │   │   │
│  │  │  ┌────────────────────────────────────────────────┐  │   │   │
│  │  │  │ HeaderBar: breadcrumb │ repo context │ badges  │  │   │   │
│  │  │  ├────────────────────────────────────────────────┤  │   │   │
│  │  │  │                                                │  │   │   │
│  │  │  │            ScreenRouter (stack-based)          │  │   │   │
│  │  │  │          renders top-of-stack screen           │  │   │   │
│  │  │  │                                                │  │   │   │
│  │  │  ├────────────────────────────────────────────────┤  │   │   │
│  │  │  │ StatusBar: hints │ sync │ notifs │ ? help      │  │   │   │
│  │  │  └────────────────────────────────────────────────┘  │   │   │
│  │  │                                                       │   │   │
│  │  │  ┌────────────────────────────────────────────────┐  │   │   │
│  │  │  │ Overlay layer (command palette, help, modals)  │  │   │   │
│  │  │  └────────────────────────────────────────────────┘  │   │   │
│  │  └──────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              ▲                                      │
│                              │ @codeplane/ui-core hooks             │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                     Data Layer                               │   │
│  │  ┌──────────┐ ┌──────────┐ ┌────────────┐ ┌────────────┐   │   │
│  │  │ API      │ │ SSE      │ │ Auth Token │ │ Pagination  │   │   │
│  │  │ Client   │ │ Streams  │ │ Resolver   │ │ Cache       │   │   │
│  │  └──────────┘ └──────────┘ └────────────┘ └────────────┘   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              ▲                                      │
│                              │ HTTP + SSE                           │
│                              ▼                                      │
│                     Codeplane API Server                            │
└─────────────────────────────────────────────────────────────────────┘
```

### Bootstrap Sequence

The TUI launches via `codeplane tui` and executes the following startup sequence:

1. **Terminal setup** (<100ms) — Switch to alternate screen buffer, enable raw mode, hide cursor, query terminal capabilities, detect dimensions.
2. **Auth token resolution** (sync) — Resolve token from `CODEPLANE_TOKEN` env var → system keyring → legacy config. If no token found, render "Not authenticated" screen and exit.
3. **Renderer initialization** — Create `CliRenderer` via `createCliRenderer()` from `@opentui/core`. Create React root via `createRoot(renderer)` from `@opentui/react`.
4. **Provider stack mount** — Mount the provider hierarchy (see Provider Stack below).
5. **Token validation** (async, 5s timeout) — `GET /api/user` to validate token. On 401: error screen. On network error: proceed optimistically with `⚠ offline` indicator. On success: status bar confirmation for 3 seconds.
6. **SSE connection** — Post-auth, `SSEProvider` obtains ticket via `POST /api/auth/sse-ticket` and opens EventSource for notification streaming.
7. **Initial screen render** — Push initial screen onto navigation stack. Deep-link args (`--screen`, `--repo`) determine the initial stack. Default: Dashboard.
8. **First meaningful paint** — Target: <200ms from launch.

### Provider Stack

The React component tree is wrapped in a strict provider hierarchy. Each provider adds a single concern. Order matters — each provider may depend on its ancestors.

```
AppContext.Provider          — global config: API base URL, terminal capabilities
  → ErrorBoundary           — catches unhandled React errors, renders recovery UI
    → AuthProvider           — resolved token, user identity, auth state
      → APIClientProvider    — configured HTTP client with auth headers
        → SSEProvider        — singleton SSE connection, event dispatch
          → NavigationProvider — screen stack, push/pop/replace, breadcrumb state
            → ThemeProvider    — color tokens resolved for detected terminal capability
              → KeybindingProvider — global/contextual keybinding registry, go-to mode state
                → AppShell     — header bar, content area, status bar, overlay layer
```

### Screen Router and Navigation Stack

Navigation uses a **stack-based model** inspired by mobile navigation controllers:

- **Push**: Navigate forward by pushing a `ScreenEntry` onto the stack. The new screen renders in the content area.
- **Pop**: Navigate back by popping the current screen. The previous screen re-renders from its cached state.
- **Replace**: Swap the top-of-stack screen without growing the stack (used for tab switches within a screen).
- **Reset**: Clear the stack and push a new root screen (used for go-to navigation from `g` prefix).

```typescript
interface ScreenEntry {
  id: string;                    // unique instance ID
  screen: ScreenName;            // enum of all screen types
  params: Record<string, string>; // screen-specific params (repo, issue number, etc.)
  breadcrumb: string;            // display text for header bar
}

interface NavigationContext {
  stack: ScreenEntry[];
  push(screen: ScreenName, params?: Record<string, string>): void;
  pop(): void;
  replace(screen: ScreenName, params?: Record<string, string>): void;
  reset(screen: ScreenName, params?: Record<string, string>): void;
  canGoBack: boolean;
  currentScreen: ScreenEntry;
  repoContext: { owner: string; repo: string } | null;
}
```

**Stack constraints:**
- Maximum depth: 32 entries. Push beyond 32 drops the oldest entry.
- The breadcrumb trail in the header bar is derived from `stack.map(e => e.breadcrumb)`.
- Deep-link launch (`codeplane tui --screen issues --repo owner/repo`) pre-populates the stack: `[Dashboard, RepoOverview(owner/repo), Issues(owner/repo)]`.

**Screen registry:**

Every screen is registered in a central map that associates a `ScreenName` enum value with:
- The React component to render
- Required params (validated at push time)
- Whether the screen requires repo context
- The screen's keybinding set (registered with `KeybindingProvider` on mount)

```typescript
const screenRegistry: Record<ScreenName, ScreenDefinition> = {
  Dashboard:      { component: DashboardScreen,    requiresRepo: false },
  RepoList:       { component: RepoListScreen,     requiresRepo: false },
  RepoOverview:   { component: RepoOverviewScreen, requiresRepo: true },
  Issues:         { component: IssueListScreen,     requiresRepo: true },
  IssueDetail:    { component: IssueDetailScreen,   requiresRepo: true },
  Landings:       { component: LandingListScreen,   requiresRepo: true },
  LandingDetail:  { component: LandingDetailScreen, requiresRepo: true },
  DiffView:       { component: DiffScreen,          requiresRepo: true },
  Workspaces:     { component: WorkspaceListScreen, requiresRepo: false },
  Workflows:      { component: WorkflowListScreen,  requiresRepo: true },
  Search:         { component: SearchScreen,        requiresRepo: false },
  Notifications:  { component: NotificationScreen,  requiresRepo: false },
  Agents:         { component: AgentListScreen,     requiresRepo: false },
  Settings:       { component: SettingsScreen,      requiresRepo: false },
  Organizations:  { component: OrgListScreen,       requiresRepo: false },
  Sync:           { component: SyncScreen,          requiresRepo: false },
  Wiki:           { component: WikiListScreen,      requiresRepo: true },
  // ... detail/create/edit variants
};
```

### Keyboard Input Architecture

Keyboard input flows through a layered priority system. The first layer to handle a key event consumes it; unhandled events propagate down.

```
┌─────────────────────────────────────┐
│ Priority 1: Text Input              │  When a <input> or <textarea> is focused,
│ (captures all printable keys)        │  printable keys and Backspace go to input.
├─────────────────────────────────────┤  Esc, Ctrl+C, Ctrl+S still propagate.
│ Priority 2: Modal/Overlay           │
│ (command palette, help, confirm)     │  Focus trapped. Esc dismisses.
├─────────────────────────────────────┤
│ Priority 3: Go-to Mode             │
│ (active for 1500ms after `g`)       │  Second key resolves destination.
├─────────────────────────────────────┤  Timeout or invalid key cancels.
│ Priority 4: Screen-specific         │
│ (issue shortcuts, diff nav, etc.)    │  Registered per-screen via hook.
├─────────────────────────────────────┤
│ Priority 5: Global                  │
│ (?, :, q, Esc, Ctrl+C)              │  Always active as fallback.
└─────────────────────────────────────┘
```

**Implementation:**

The `KeybindingProvider` maintains a stack of keybinding scopes. Each scope is a `Map<string, KeyHandler>` where the key is a normalized key descriptor (e.g., `"ctrl+c"`, `"g"`, `"shift+tab"`).

```typescript
interface KeybindingScope {
  id: string;
  priority: number;
  bindings: Map<string, KeyHandler>;
  active: boolean;
}

interface KeyHandler {
  key: string;
  description: string;      // shown in help overlay and status bar
  handler: () => void;
  when?: () => boolean;      // conditional activation
}
```

Screens register their keybindings via `useScreenKeybindings(bindings)` which pushes a scope on mount and pops on unmount. The `useKeyboard` hook from OpenTUI is used once at the `KeybindingProvider` level to capture all input, then dispatched through the priority stack.

### Data Layer Integration

The TUI consumes `@codeplane/ui-core` for all server communication. This package provides framework-agnostic data hooks that internally use the configured API client.

```
@codeplane/ui-core
├── hooks/
│   ├── useRepos(options?)         → { repos, isLoading, error, hasMore, refetch }
│   ├── useIssues(owner, repo, options?)   → { issues, isLoading, error, hasMore, refetch }
│   ├── useLandings(owner, repo, options?) → { landings, ... }
│   ├── useNotifications(options?) → { notifications, unreadCount, ... }
│   ├── useSearch(query, options?) → { results, ... }
│   ├── useUser()                  → { user, isLoading, error }
│   ├── useWorkflows(owner, repo?) → { workflows, runs, ... }
│   ├── useWorkspaces()            → { workspaces, ... }
│   └── useOrgs()                  → { orgs, ... }
├── client/
│   ├── createAPIClient(config)    → configured fetch wrapper
│   └── types                      → request/response DTOs
├── sse/
│   ├── createSSEConnection(url, options) → EventSource wrapper
│   └── useSSE(channel)            → subscribe to SSE events
└── commands/
    ├── commandRegistry            → all command palette entries
    └── fuzzySearch(query, commands) → ranked results
```

**Pagination pattern:**

All list hooks use cursor-based pagination. The TUI's `<ScrollableList>` component detects when scroll position reaches 80% of content height and calls `fetchMore()` on the hook. Loaded pages are cached in-memory for instant back-navigation. Memory cap: 500 items per list, oldest pages evicted.

```typescript
interface PaginatedResult<T> {
  items: T[];
  cursor: string | null;    // null = no more pages
  hasMore: boolean;
  totalCount: number;
  isLoading: boolean;
  error: Error | null;
  fetchMore: () => void;
  refetch: () => void;
}
```

**Optimistic updates:**

Mutations (close issue, mark notification read, submit comment) apply local state changes immediately. On server error, the local state reverts and an error message renders inline. The pattern:

```typescript
const optimistic = useOptimisticMutation({
  mutate: (id) => apiClient.post(`/issues/${id}/close`),
  onOptimistic: (id) => updateIssueState(id, "closed"),
  onRevert: (id) => updateIssueState(id, "open"),
  onError: (error) => showInlineError(error.message),
});
```

### SSE Streaming Infrastructure

SSE powers four real-time features: notification updates, workflow log streaming, workspace status, and agent response streaming. All share a common connection and dispatch architecture.

**Connection lifecycle:**

```
Mount SSEProvider
  → POST /api/auth/sse-ticket (get one-time ticket, 30s TTL)
  → Open EventSource: GET /api/notifications?ticket={ticket}
  → On message: dispatch to subscribers via React context
  → On error: exponential backoff reconnect (1s → 2s → 4s → 8s → max 30s)
  → On reconnect: send Last-Event-ID header for replay
  → Keep-alive: server sends comment every 15s, client treats 45s silence as dead
  → On unmount: close EventSource
```

**Event dispatch:**

```typescript
interface SSEContext {
  connectionState: "connecting" | "connected" | "reconnecting" | "disconnected";
  subscribe(channel: string, handler: (event: SSEEvent) => void): () => void;
  lastEventId: string | null;
}

// Screens subscribe to specific channels:
const { connectionState } = useSSE();
useSSEChannel("notifications", (event) => {
  // Update notification list, badge count
});
useSSEChannel("workflow_logs", (event) => {
  // Append log line to streaming display
});
```

**Deduplication:** Events carry unique IDs. The SSE provider maintains a sliding window of recent event IDs (last 1000) to deduplicate replayed events on reconnection.

### Responsive Layout System

Terminal dimensions drive layout adaptation through three breakpoints.

```typescript
type Breakpoint = "minimum" | "standard" | "large";

function getBreakpoint(cols: number, rows: number): Breakpoint {
  if (cols < 80 || rows < 24) return "unsupported"; // special case
  if (cols < 120 || rows < 40) return "minimum";
  if (cols < 200 || rows < 60) return "standard";
  return "large";
}
```

**Hook:**

```typescript
function useLayout(): LayoutContext {
  const { width, height } = useTerminalDimensions(); // from @opentui/react
  const breakpoint = getBreakpoint(width, height);

  return {
    width,
    height,
    breakpoint,
    contentHeight: height - 2,  // minus header and status bar
    sidebarVisible: breakpoint !== "minimum",
    sidebarWidth: breakpoint === "large" ? "30%" : "25%",
    modalWidth: breakpoint === "minimum" ? "90%" : breakpoint === "standard" ? "60%" : "50%",
    modalHeight: breakpoint === "minimum" ? "90%" : breakpoint === "standard" ? "60%" : "50%",
  };
}
```

**Resize handling:** `useOnResize` from OpenTUI fires on `SIGWINCH`. Layout recalculations are synchronous — no animation, no debounce. Components that depend on dimensions re-render immediately.

**Below minimum (< 80x24):** Full-screen message: "Terminal too small — minimum 80×24, current {cols}×{rows}". Only `Ctrl+C` active.

### Theme and Color Token System

Color capability is detected once at startup and frozen for the session.

```typescript
type ColorCapability = "truecolor" | "256" | "16";

function detectColorCapability(): ColorCapability {
  const ct = process.env.COLORTERM;
  if (ct === "truecolor" || ct === "24bit") return "truecolor";
  if (process.env.TERM?.includes("256color")) return "256";
  return "16";
}
```

**Token resolution:**

Each semantic token maps to a concrete color value based on the detected capability:

```typescript
interface ThemeTokens {
  primary:       Color;  // focused items, links, active tabs
  success:       Color;  // open issues, passed checks, diff additions
  warning:       Color;  // pending states, conflicts, syncing
  error:         Color;  // errors, failures, diff deletions
  muted:         Color;  // secondary text, metadata, timestamps
  surface:       Color;  // modal/overlay backgrounds
  border:        Color;  // box borders, separators
  diffAddedBg:   Color;  // diff addition background
  diffRemovedBg: Color;  // diff deletion background
  diffAddedText: Color;  // diff addition text
  diffRemovedText: Color; // diff deletion text
  diffHunkHeader: Color; // diff hunk header
}
```

The `ThemeProvider` creates the token object once and provides it via `useTheme()`. The object is frozen — no runtime theme switching, no light mode. All components reference semantic tokens, never raw ANSI codes.

---

## Core Abstractions

These are the foundational components and hooks that must be built before any feature screen. They form the shared vocabulary of the TUI.

### 1. AppShell

The root layout component rendered inside all providers. Provides the three-zone layout (header, content, status bar) and the overlay layer.

```typescript
function AppShell({ children }: { children: React.ReactNode }) {
  const { height } = useLayout();
  return (
    <box flexDirection="column" width="100%" height={height}>
      <HeaderBar />           {/* 1 row, fixed */}
      <box flexGrow={1}>      {/* remaining rows */}
        {children}             {/* screen content */}
      </box>
      <StatusBar />            {/* 1 row, fixed */}
      <OverlayLayer />         {/* absolute positioned, z-index above content */}
    </box>
  );
}
```

**HeaderBar:** Left breadcrumb trail (from navigation stack), center repo context, right connection status + notification badge. Truncates breadcrumb from left at minimum breakpoint.

**StatusBar:** Left keybinding hints (context-sensitive, 4 at minimum / 6 at standard / all at large), center sync status indicator, right notification count + `? help`.

**OverlayLayer:** Renders command palette, help overlay, and confirmation modals as absolute-positioned boxes with `zIndex`. Focus is trapped within the active overlay.

### 2. ScrollableList

The primary list component used across all list screens (issues, repos, landings, notifications, workflows, etc.). Wraps OpenTUI's `<scrollbox>` with vim-style navigation and pagination.

```typescript
interface ScrollableListProps<T> {
  items: T[];
  renderItem: (item: T, focused: boolean, index: number) => React.ReactNode;
  onSelect: (item: T) => void;
  onFetchMore?: () => void;
  hasMore?: boolean;
  isLoading?: boolean;
  emptyMessage?: string;
  keyExtractor: (item: T) => string;
  multiSelect?: boolean;
  onSelectionChange?: (selected: Set<string>) => void;
}
```

**Keyboard bindings (registered as a keybinding scope):**

| Key | Action |
|-----|--------|
| `j` / `Down` | Move focus down |
| `k` / `Up` | Move focus up |
| `Enter` | Select focused item → calls `onSelect` |
| `Space` | Toggle selection (when `multiSelect` enabled) |
| `G` | Jump to last item |
| `g g` | Jump to first item |
| `Ctrl+D` | Page down (half viewport height) |
| `Ctrl+U` | Page up (half viewport height) |
| `/` | Focus filter input (if present) |

**Pagination:** When scroll position reaches 80% of content height and `hasMore` is true, calls `onFetchMore()`. Shows `"Loading more..."` indicator at list bottom during fetch.

**Focus rendering:** Focused row rendered with reverse video or primary color background. Row index tracked in component state. Overflow scrolls the viewport to keep focus visible.

### 3. DetailView

A scrollable, structured layout for entity detail screens (issue, landing, workspace, etc.).

```typescript
interface DetailViewProps {
  children: React.ReactNode;
}

function DetailView({ children }: DetailViewProps) {
  return (
    <scrollbox>
      <box flexDirection="column" gap={1} padding={1}>
        {children}
      </box>
    </scrollbox>
  );
}

function DetailHeader({ title, status, metadata }: DetailHeaderProps) { ... }
function DetailSection({ title, children }: DetailSectionProps) { ... }
```

Scrollable with `j`/`k`. Sections are collapsible where appropriate.

### 4. FormSystem

A form framework for create and edit screens. Handles field navigation, validation, and submission.

```typescript
interface FormField {
  name: string;
  label: string;
  type: "text" | "textarea" | "select" | "checkbox";
  required?: boolean;
  validate?: (value: unknown) => string | null; // null = valid
}

interface FormProps {
  fields: FormField[];
  initialValues?: Record<string, unknown>;
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
  submitLabel?: string;
}
```

**Keyboard bindings:**

| Key | Action |
|-----|--------|
| `Tab` | Next field |
| `Shift+Tab` | Previous field |
| `Enter` | Submit (when submit button focused) |
| `Ctrl+S` | Submit from anywhere in form |
| `Esc` | Cancel form, call `onCancel` |

**State management:** Form tracks `focusedFieldIndex`, `values`, `errors`, and `isSubmitting`. Validation runs on blur and on submit. Submission shows "Saving..." on the submit button and disables input.

### 5. ModalSystem

An overlay rendering system for command palette, help overlay, and confirmation dialogs.

```typescript
interface ModalProps {
  visible: boolean;
  onDismiss: () => void;
  title?: string;
  children: React.ReactNode;
  width?: string;  // defaults to layout.modalWidth
  height?: string; // defaults to layout.modalHeight
}
```

**Behavior:**
- Rendered via `<OverlayLayer>` with absolute positioning and z-index
- `Esc` dismisses the modal
- Focus trapped within modal content (Tab cycles within modal)
- Background content remains rendered but non-interactive
- Multiple modals stack — only the topmost receives input

**Built-in modals:**
- `CommandPalette` — fuzzy search over command registry, `:` to open
- `HelpOverlay` — grouped keybinding list for current screen, `?` to toggle
- `ConfirmDialog` — yes/no confirmation for destructive actions

### 6. SSEProvider

React context provider that manages the singleton SSE connection and dispatches events to subscribers.

```typescript
interface SSEProviderProps {
  apiClient: APIClient;
  children: React.ReactNode;
}

// Usage in screens:
function NotificationList() {
  const { connectionState } = useSSE();
  useSSEChannel("notifications", (event) => {
    // handle notification event
  });
}
```

**Responsibilities:**
- Obtain SSE ticket on mount via `POST /api/auth/sse-ticket`
- Open EventSource with ticket-based auth
- Dispatch events to channel subscribers via callback registry
- Maintain `connectionState` for status bar indicator
- Auto-reconnect with exponential backoff (1s, 2s, 4s, 8s, max 30s)
- Send `Last-Event-ID` on reconnect for event replay
- Deduplicate replayed events by ID (sliding window of 1000)
- Detect dead connection if no data for 45s (3× keep-alive interval)

### 7. AuthProvider

Resolves and validates the auth token, providing user identity to the tree.

```typescript
interface AuthContext {
  token: string;
  user: User | null;
  authState: "loading" | "authenticated" | "expired" | "offline" | "unauthenticated";
  source: "env" | "keyring" | "config";
}
```

**Token resolution (synchronous, at mount):**
1. Check `CODEPLANE_TOKEN` environment variable
2. Read from system keyring (CLI credential store)
3. Read from legacy config file
4. If none found: set `authState = "unauthenticated"`, render error screen

**Token validation (async, 5s timeout):**
- `GET /api/user` with `Authorization: Bearer {token}`
- 200: set `authState = "authenticated"`, populate `user`
- 401: set `authState = "expired"`, render error screen
- Network error/timeout: set `authState = "offline"`, proceed with warning

### 8. ThemeProvider

Provides resolved color tokens to all components via `useTheme()`.

```typescript
function useTheme(): Readonly<ThemeTokens>;
```

Tokens are created once at startup based on `detectColorCapability()` and frozen. Components use tokens like:

```typescript
const theme = useTheme();
<text fg={theme.primary}>Focused item</text>
<text fg={theme.muted}>Secondary text</text>
<box borderColor={theme.border}>...</box>
```

### 9. BaseScreen

A composition helper that screens extend. Provides screen-level keybinding registration, loading state, and error display.

```typescript
function useScreen(options: {
  name: ScreenName;
  keybindings?: KeyHandler[];
  title?: string;
}): {
  isActive: boolean;
  registerKeybinding: (binding: KeyHandler) => void;
};
```

On mount, pushes the screen's keybinding scope. On unmount, pops it. This ensures keybinding hints in the status bar and help overlay are always accurate for the visible screen.

### 10. DiffViewer

Wraps OpenTUI's `<diff>` component with file tree navigation, view mode toggling, and inline comment support.

```typescript
interface DiffViewerProps {
  files: DiffFile[];
  mode: "unified" | "split";
  onModeToggle: () => void;
  showWhitespace: boolean;
  onWhitespaceToggle: () => void;
  onComment?: (file: string, line: number, body: string) => void;
}
```

Uses OpenTUI's `<diff>` with `<code>` for syntax highlighting via Tree-sitter. At minimum breakpoint, split mode is unavailable — the `t` key shows a size hint instead.

### 11. MarkdownRenderer

Wraps OpenTUI's `<markdown>` component for issue bodies, comments, wiki pages, and READMEs.

```typescript
interface MarkdownRendererProps {
  content: string;
  maxHeight?: number;
}
```

Renders headings, lists, code blocks (with syntax highlighting), bold, italic, blockquotes, and links (underlined text with URL). No images — image references render as `[image: alt text]`.

---

## Testing Philosophy

### Framework

All TUI E2E tests use `@microsoft/tui-test`. This framework provides:

- **Terminal snapshot matching** — golden-file comparison of rendered terminal output (ANSI escape sequences, layout, colors).
- **Keyboard interaction simulation** — programmatic keypress sequences with assertions on resulting terminal state.
- **Regex text assertions** — pattern matching on terminal buffer content.
- **Resize simulation** — test responsive layout behavior at different terminal dimensions.

Tests run via Bun's test runner and are located in `e2e/tui/`.

### Test Organization

Test files map 1:1 to feature groups:

```
e2e/tui/
├── app-shell.test.ts          # TUI_APP_SHELL features
├── dashboard.test.ts          # TUI_DASHBOARD features
├── repository.test.ts         # TUI_REPOSITORY features
├── issues.test.ts             # TUI_ISSUES features
├── landings.test.ts           # TUI_LANDINGS features
├── diff.test.ts               # TUI_DIFF features
├── workspaces.test.ts         # TUI_WORKSPACES features
├── workflows.test.ts          # TUI_WORKFLOWS features
├── search.test.ts             # TUI_SEARCH features
├── notifications.test.ts      # TUI_NOTIFICATIONS features
├── agents.test.ts             # TUI_AGENTS features
├── settings.test.ts           # TUI_SETTINGS features
├── organizations.test.ts      # TUI_ORGANIZATIONS features
├── sync.test.ts               # TUI_SYNC features
├── wiki.test.ts               # TUI_WIKI features
└── helpers.ts                 # shared test utilities
```

### Test Types

**1. Terminal snapshot tests**

Capture the full terminal output at key interaction points and compare against golden files. Snapshots are captured at multiple terminal sizes to verify responsive behavior.

```typescript
test("issue list renders at 80x24", async () => {
  const terminal = await launchTUI({ cols: 80, rows: 24 });
  await terminal.sendKeys("g", "i"); // go to issues
  await terminal.waitForText("Issues");
  expect(terminal.snapshot()).toMatchSnapshot();
});

test("issue list renders at 120x40", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  await terminal.sendKeys("g", "i");
  await terminal.waitForText("Issues");
  expect(terminal.snapshot()).toMatchSnapshot();
});
```

**2. Keyboard interaction tests**

Verify that keypress sequences produce the expected state changes.

```typescript
test("j/k navigates issue list", async () => {
  const terminal = await launchTUI();
  await terminal.sendKeys("g", "i"); // navigate to issues
  await terminal.waitForText("Issues");

  await terminal.sendKeys("j"); // move down
  // Assert second item is focused (reverse video)
  expect(terminal.getLine(4)).toMatch(/.*\x1b\[7m.*Issue #2/);

  await terminal.sendKeys("k"); // move back up
  expect(terminal.getLine(3)).toMatch(/.*\x1b\[7m.*Issue #1/);
});
```

**3. Screen transition tests**

Verify that navigation between screens works correctly and breadcrumbs update.

```typescript
test("Enter on issue navigates to detail view", async () => {
  const terminal = await launchTUI();
  await terminal.sendKeys("g", "i");
  await terminal.waitForText("Issues");
  await terminal.sendKeys("Enter");

  // Breadcrumb should show issue path
  expect(terminal.getLine(0)).toMatch(/Dashboard.*›.*Issues.*›.*#\d+/);

  // q should return to list
  await terminal.sendKeys("q");
  await terminal.waitForText("Issues");
  expect(terminal.getLine(0)).not.toMatch(/#\d+/);
});
```

**4. Regex assertions on terminal content**

For dynamic content that varies between runs, regex assertions verify structure without brittle exact matching.

```typescript
test("notification badge shows count", async () => {
  const terminal = await launchTUI();
  // Status bar should show notification count
  const lastLine = terminal.getLine(terminal.rows - 1);
  expect(lastLine).toMatch(/◆\s+\d+/);
});
```

### Foundational Principles

1. **Tests that fail due to unimplemented backends stay failing.** Tests are never skipped, commented out, or mocked to hide missing backend functionality. A failing test is a signal, not a problem to hide.

2. **No mocking of implementation details.** Tests run against a real API server (or daemon) with test fixtures. Internal hooks, state management, and component internals are never mocked. Tests validate user-visible behavior.

3. **Each test validates one behavior.** Test names describe the user-facing behavior being verified, not the implementation mechanism. Bad: "test NavigationProvider push method". Good: "Enter on repo opens repo overview".

4. **Snapshot tests are supplementary, not primary.** Snapshots catch unintended visual regressions. Interaction tests are the primary verification mechanism. A passing snapshot with broken keyboard navigation is still a bug.

5. **Tests run at representative sizes.** Critical screens are snapshot-tested at minimum (80×24), standard (120×40), and large (200×60) to catch responsive layout regressions.

6. **Tests are independent.** Each test launches a fresh TUI instance. No shared state between tests. Test order does not matter.

### Test Helpers

```typescript
// e2e/tui/helpers.ts

interface TUITestInstance {
  sendKeys(...keys: string[]): Promise<void>;
  sendText(text: string): Promise<void>;
  waitForText(text: string, timeoutMs?: number): Promise<void>;
  waitForNoText(text: string, timeoutMs?: number): Promise<void>;
  snapshot(): string;
  getLine(lineNumber: number): string;
  resize(cols: number, rows: number): Promise<void>;
  terminate(): Promise<void>;
  rows: number;
  cols: number;
}

async function launchTUI(options?: {
  cols?: number;
  rows?: number;
  env?: Record<string, string>;
  args?: string[];
}): Promise<TUITestInstance>;
```

---

## 3rd Party Dependencies

### Core (non-negotiable)

| Package | Role | Notes |
|---------|------|-------|
| `@opentui/core` | Native terminal rendering, layout (Yoga), input handling, Tree-sitter syntax highlighting | The foundation. Not swappable. Provides `<box>`, `<scrollbox>`, `<text>`, `<input>`, `<select>`, `<code>`, `<diff>`, `<markdown>`, and all layout primitives. |
| `@opentui/react` | React 19 reconciler for OpenTUI | Provides `createRoot()`, JSX component mapping, and hooks (`useKeyboard`, `useTerminalDimensions`, `useOnResize`, `useTimeline`). |
| `react` (19.x) | Component model, hooks, context, error boundaries | Standard React. Used with OpenTUI's reconciler, not react-dom. |
| `@codeplane/ui-core` | Shared data hooks, API client, SSE utilities, command registry | The data access layer shared with the web UI. All API communication goes through this package. |
| `@codeplane/sdk` | Domain types and service interfaces | Provides TypeScript types for all API entities (Repository, Issue, Landing, etc.). |

### Testing

| Package | Role | Notes |
|---------|------|-------|
| `@microsoft/tui-test` | Terminal E2E testing framework | Snapshot matching, keyboard simulation, terminal buffer assertions. Used in all `e2e/tui/` test files. |
| `bun:test` | Test runner | Bun's built-in test framework. Provides `describe`, `test`, `expect`. No additional test runner needed. |

### Dependency Principles

1. **No new runtime dependency without a PoC test.** Before adding any package beyond the core set, a proof-of-concept test must demonstrate that the dependency works correctly in a Bun + OpenTUI React environment, handles terminal lifecycle properly, and does not conflict with existing dependencies. PoC tests live in `poc/` and their passing assertions graduate into the real test suite.

2. **Prefer @opentui/core builtins over npm packages.** OpenTUI provides layout, text rendering, syntax highlighting, diff viewing, and markdown rendering natively. Do not introduce npm alternatives for capabilities that OpenTUI already covers.

3. **No polyfills for browser APIs.** The TUI runs in Bun, not a browser. Do not add packages that assume `window`, `document`, `localStorage`, or other browser globals. If a dependency requires browser APIs, it is not compatible.

4. **Pin exact versions for rendering-critical dependencies.** OpenTUI and React versions are pinned exactly (not with `^` ranges) because minor version changes can alter rendering output, breaking snapshot tests. Testing dependencies can use caret ranges.

5. **Shared packages over TUI-specific packages.** If functionality exists in `@codeplane/ui-core` or `@codeplane/sdk`, use it. Do not create TUI-specific alternatives. If the shared package needs adaptation for terminal use, extend it in the shared package so other clients benefit.

6. **Zero native dependencies beyond OpenTUI.** OpenTUI's Zig core is the only native dependency. No other native addons, no node-gyp builds, no platform-specific binaries. This keeps the TUI portable and the build fast.

---

## Source of Truth

This engineering architecture document should be maintained alongside:

- [specs/tui/prd.md](./prd.md) — Product requirements
- [specs/tui/design.md](./design.md) — Design specification
- [specs/tui/features.ts](./features.ts) — Codified feature inventory
- [specs/prd.md](../prd.md) — Platform PRD
- [specs/design.md](../design.md) — Platform design
- [context/opentui/](../../context/opentui/) — OpenTUI component reference