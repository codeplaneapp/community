# Codeplane TUI Design Specification

This design specification describes the architecture, navigation model, component patterns, and interaction design for the Codeplane terminal user interface. It is grounded in the current `apps/tui/` implementation using React 19 + OpenTUI and the shared `@codeplane/ui-core` data layer.

## Status Model

The same maturity labels used in the platform design doc apply here:

- `Implemented`
- `Partial`
- `Gated`
- `Cloud-only / future`

## 1. Screen Model & Navigation

### 1.1 Stack-based navigation

`Partial`

The TUI uses a stack-based navigation model:

- **Push**: Navigate to a new screen by pushing it onto the stack
- **Pop**: Return to the previous screen by popping the current one
- The stack is rendered as a breadcrumb trail in the header bar
- Deep-link launch support: `codeplane tui --screen issues --repo owner/repo` opens directly to the specified screen

### 1.2 Global keybindings

These keybindings are active on every screen:

| Key | Action |
|-----|--------|
| `?` | Toggle help overlay (shows all keybindings for current screen) |
| `:` | Open command palette |
| `q` | Pop current screen (back). On root screen, quit TUI |
| `Esc` | Close any open overlay/modal. If none open, same as `q` |
| `Ctrl+C` | Quit TUI immediately |

### 1.3 Go-to keybindings

Prefix `g` activates go-to mode (shown in status bar):

| Key sequence | Destination |
|-------------|-------------|
| `g d` | Dashboard |
| `g i` | Issues (requires repo context) |
| `g l` | Landings (requires repo context) |
| `g r` | Repository list |
| `g w` | Workspaces |
| `g n` | Notifications |
| `g s` | Search |
| `g a` | Agents |
| `g o` | Organizations |
| `g f` | Workflows (requires repo context) |
| `g k` | Wiki (requires repo context) |

### 1.4 Tab navigation

Screens with multiple tabs (repository, search, settings) use:

| Key | Action |
|-----|--------|
| `Tab` / `Shift+Tab` | Cycle forward/backward through tabs |
| `1`-`9` | Jump to tab by number |

## 2. Layout System

### 2.1 Global layout structure

```
┌─────────────────────────────────────────────────┐
│ Header: breadcrumb path │ repo context │ status  │
├─────────────────────────────────────────────────┤
│                                                 │
│                 Content Area                    │
│            (flexible, screen-specific)          │
│                                                 │
├─────────────────────────────────────────────────┤
│ Status: keybindings │ sync │ notif count │ help  │
└─────────────────────────────────────────────────┘
```

### 2.2 Header bar

- Left: breadcrumb navigation showing screen stack (e.g., `Dashboard > owner/repo > Issues > #42`)
- Center: current repository context (if applicable)
- Right: connection status indicator, notification badge

### 2.3 Content area

- Full height between header and status bar
- Screen-specific layout: single column, sidebar+main split, or tabbed panels
- Uses `<box>` with flexbox layout primitives from OpenTUI

### 2.4 Status bar

- Left: context-sensitive keybinding hints for the current screen
- Center: sync status indicator (connected/syncing/conflict/disconnected)
- Right: unread notification count, help hint (`?` for help)

### 2.5 Sidebar + main split

Used for code explorer and diff file tree:

```
┌──────────┬──────────────────────────────────────┐
│ File     │                                      │
│ Tree     │         Main Content                 │
│ (25%)    │         (75%)                         │
│          │                                      │
└──────────┴──────────────────────────────────────┘
```

- Sidebar width: 25% at standard size, collapsible to 0% at minimum terminal width
- `Ctrl+B` toggles sidebar visibility

## 3. Keyboard Interaction Model

### 3.1 Navigation within lists

| Key | Action |
|-----|--------|
| `j` / `Down` | Move cursor down |
| `k` / `Up` | Move cursor up |
| `Enter` | Select / open focused item |
| `Space` | Toggle selection (multi-select lists) |
| `G` | Jump to bottom of list |
| `g g` | Jump to top of list |
| `Ctrl+D` | Page down |
| `Ctrl+U` | Page up |

### 3.2 Search and filtering

| Key | Action |
|-----|--------|
| `/` | Focus search/filter input |
| `Esc` | Clear search and return focus to list |

### 3.3 Form interaction

| Key | Action |
|-----|--------|
| `Tab` | Next form field |
| `Shift+Tab` | Previous form field |
| `Enter` | Submit form (when on submit button) |
| `Ctrl+S` | Save / submit from anywhere in form |
| `Esc` | Cancel form and go back |

### 3.4 Diff navigation

| Key | Action |
|-----|--------|
| `]` | Next file in diff |
| `[` | Previous file in diff |
| `j` / `k` | Scroll within file diff |
| `t` | Toggle unified/split view |
| `w` | Toggle whitespace visibility |
| `x` | Expand all hunks |
| `z` | Collapse all hunks |

## 4. Data Access

### 4.1 Shared hooks

`Partial`

The TUI consumes `@codeplane/ui-core` hooks adapted for React 19:

- `useRepos()` — repository list with filtering
- `useIssues()` — issue list with state/label/assignee filtering
- `useLandings()` — landing request list with state filtering
- `useNotifications()` — notification inbox with SSE streaming
- `useSearch()` — global search across entity types
- `useUser()` — current user profile and settings
- `useWorkflows()` — workflow and run listing

### 4.2 SSE context

SSE connections are managed via a React context provider:

- `<SSEProvider>` wraps the application root
- Provides `useSSE(channel)` hook for subscribing to event streams
- Handles ticket-based authentication
- Auto-reconnects with exponential backoff (1s, 2s, 4s, 8s, max 30s)

### 4.3 Optimistic UI

- Form submissions show immediate local state updates
- Reverts on server error with user-visible error message
- List operations (close issue, mark notification read) apply optimistically

### 4.4 Pagination

- List views use cursor-based pagination via `<scrollbox>` scroll-to-end detection
- Loads next page when scroll position reaches 80% of content height
- Shows loading indicator at list bottom during fetch
- Caches loaded pages for back-navigation

## 5. Component Patterns

### 5.1 List view

Used for issues, landings, repos, notifications, workflows, etc.

```
<scrollbox>
  <box flexDirection="column">
    {items.map(item => (
      <ListRow key={item.id} focused={item.id === focusedId}>
        <text>{item.title}</text>
        <text color="muted">{item.metadata}</text>
      </ListRow>
    ))}
  </box>
</scrollbox>
```

- Focused row highlighted with reverse video or accent color
- Keyboard navigation via `j/k`
- `Enter` to open detail view

### 5.2 Detail view

Used for issue detail, landing detail, workspace detail, etc.

```
<scrollbox>
  <box flexDirection="column" gap={1}>
    <DetailHeader title={item.title} status={item.status} />
    <DetailSection title="Description">
      <markdown>{item.body}</markdown>
    </DetailSection>
    <DetailSection title="Comments">
      {comments.map(c => <Comment key={c.id} {...c} />)}
    </DetailSection>
  </box>
</scrollbox>
```

### 5.3 Form

Used for issue create, landing create, settings edit, etc.

```
<box flexDirection="column" gap={1}>
  <input label="Title" value={title} onChange={setTitle} />
  <textarea label="Description" value={body} onChange={setBody} />
  <select label="Labels" options={labels} value={selected} onChange={setSelected} />
  <box flexDirection="row" gap={2}>
    <button onPress={handleSubmit}>Submit</button>
    <button onPress={handleCancel}>Cancel</button>
  </box>
</box>
```

### 5.4 Modal / Overlay

Used for command palette, help overlay, confirmation dialogs.

```
<box
  position="absolute"
  top="center"
  left="center"
  width="60%"
  height="60%"
  border="single"
>
  <ModalContent />
</box>
```

- Rendered on top of current screen content
- `Esc` dismisses
- Focus trapped within modal

### 5.5 Diff component

Uses OpenTUI's `<diff>` component with:

- Unified and split modes
- Syntax highlighting via `<code>` blocks
- Line numbers
- Green/red color coding for additions/deletions
- Hunk headers with expand/collapse controls

### 5.6 Markdown rendering

Uses OpenTUI's `<markdown>` component for:

- Issue and landing request bodies
- Wiki pages
- README files
- Comment content

Supports headings, lists, code blocks (with syntax highlighting), links (shown as underlined text with URL), bold, italic, and blockquotes.

### 5.7 Code viewer

Uses OpenTUI's `<code>` component for:

- File preview in code explorer
- Inline code snippets
- Workflow definition display

## 6. Streaming

### 6.1 Notification streaming

- SSE channel: notification updates
- Updates the notification badge count in the status bar in real-time
- New notifications appear at the top of the inbox list
- Connection status shown in status bar

### 6.2 Workflow log streaming

- SSE channel: workflow run logs
- Logs render line-by-line as they arrive
- ANSI color codes in log output are passed through to the terminal
- Auto-scroll follows new output (toggleable with `f` key)

### 6.3 Workspace status streaming

- SSE channel: workspace status updates
- Status transitions (creating → running → suspended) update inline
- SSH connection info appears when workspace becomes ready

### 6.4 Agent response streaming

- SSE channel: agent message responses
- Tokens render incrementally as they arrive
- Markdown formatting applied progressively

### 6.5 Reconnection

- All SSE connections auto-reconnect on disconnect
- Exponential backoff: 1s, 2s, 4s, 8s, capped at 30s
- Status bar shows disconnection state
- Reconnection re-fetches missed events via cursor/timestamp

## 7. Theme & Colors

### 7.1 Color baseline

- ANSI 256 color is the baseline
- Truecolor (24-bit) used when `COLORTERM=truecolor` is detected
- Falls back gracefully to 16-color terminals

### 7.2 Semantic color tokens

| Token | Purpose | ANSI 256 |
|-------|---------|----------|
| `primary` | Focused items, links, active tabs | Blue (33) |
| `success` | Open issues, passed checks, additions | Green (34) |
| `warning` | Pending states, conflict indicators | Yellow (178) |
| `error` | Errors, failed checks, closed/rejected items | Red (196) |
| `muted` | Secondary text, metadata, timestamps | Gray (245) |
| `surface` | Background for modals and overlays | Dark gray (236) |
| `border` | Box borders, separators | Gray (240) |

### 7.3 Diff colors

- Additions: green background (ANSI 22) with green text (ANSI 34)
- Deletions: red background (ANSI 52) with red text (ANSI 196)
- Context: default terminal colors
- Hunk headers: cyan (ANSI 37)

### 7.4 Dark theme

The TUI uses a single dark theme. Light theme is not supported. The theme assumes a dark terminal background.

## 8. Responsive Sizing

### 8.1 Breakpoints

| Range | Classification | Behavior |
|-------|---------------|----------|
| < 80x24 | Unsupported | Show "terminal too small" message |
| 80x24 – 119x39 | Minimum | Collapse sidebar, truncate long text, hide optional columns |
| 120x40 – 199x59 | Standard | Full layout with sidebar, all columns visible |
| 200x60+ | Large | Wider diffs, more context lines, expanded metadata |

### 8.2 Resize handling

- `useTerminalDimensions()` hook provides current terminal size
- `useOnResize()` hook triggers re-layout on terminal resize events
- Layout recalculations happen synchronously on resize
- No animation or transition during resize

### 8.3 Minimum size adaptations

At 80x24:

- File tree sidebar is hidden (toggle with `Ctrl+B`)
- List views show only title and status (hide metadata columns)
- Breadcrumb path truncates from the left
- Diff view uses unified mode only (split unavailable)
- Modal overlays use 90% width instead of 60%

## 9. Error Handling

### 9.1 Error boundary

A top-level React error boundary catches unhandled errors and displays:

- Error message in red
- Stack trace (collapsed, expandable)
- "Press `r` to restart" prompt
- "Press `q` to quit" prompt

### 9.2 Network errors

- API request failures show inline error messages on the affected screen
- Retry hint shown: "Press `R` to retry"
- SSE disconnections show status bar indicator, auto-reconnect

### 9.3 Auth errors

- 401 responses show "Session expired. Run `codeplane auth login` to re-authenticate."
- TUI does not attempt to re-authenticate interactively

## 10. Loading States

### 10.1 Screen loading

- Full-screen spinner with "Loading..." text on initial screen data fetch
- Skeleton rendering where possible (list outlines before data arrives)

### 10.2 Inline loading

- List pagination shows "Loading more..." at the bottom of the scrollbox
- Form submission shows "Saving..." on the submit button
- Action buttons show spinner while operation is in progress

## 11. Source of Truth

This TUI design spec should be maintained alongside:

- [specs/tui/prd.md](./prd.md)
- [specs/tui/features.ts](./features.ts)
- [specs/design.md](../design.md)
- [context/opentui/](../../context/opentui/)
