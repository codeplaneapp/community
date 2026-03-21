# TUI_COMMAND_PALETTE

Specification for TUI_COMMAND_PALETTE.

## High-Level User POV

The command palette is the primary power-user affordance in the Codeplane TUI. It is a modal overlay that appears instantly when the user presses `:` from any screen, providing a single entry point to every action and navigation target in the application.

When the palette opens, focus immediately lands in a text input at the top of the overlay. The user begins typing and results appear below, filtered in real-time using fuzzy matching. Each result row shows a command name, a brief description, and an optional keybinding hint on the right side. The list of results is keyboard-navigable with `j`/`k` or arrow keys, and pressing `Enter` on a highlighted result executes the command immediately — navigating to a screen, triggering an action, or opening a sub-form.

The command palette aggregates three categories of entries: **navigation targets** (go to Dashboard, go to Issues for the current repo, go to Notifications), **actions** (create a new issue, mark all notifications read, sign out), and **toggles** (switch diff view mode, toggle whitespace). Navigation commands that require a repository context — such as "Go to Issues" or "Go to Workflows" — only appear when the user is currently within a repository scope. Commands gated behind disabled feature flags are omitted entirely and never shown to the user.

The palette overlay is centered in the terminal, occupying roughly 60% of the width and 60% of the height on standard-size terminals, expanding to 90% on minimum-size terminals. It uses a single-line rounded border, a dark surface background, and the standard color tokens for focused/muted text. The input field at the top shows a `>` prompt character and the user's query. Below it, a scrollable results list displays up to the height of the overlay. If more results exist than fit on screen, the list scrolls as the user navigates with the keyboard.

Dismissing the palette is instant: `Esc` closes it and returns focus to whatever screen was underneath, with no state change. The palette does not persist any input between invocations — each time it opens, the input is empty and the full command list is shown. The underlying screen remains visible but dimmed or unfocused behind the overlay, providing spatial context for where the user is in the application.

The palette is designed to feel like a muscle-memory shortcut for terminal-native developers who are accustomed to Vim's command-line mode, VS Code's command palette, or tmux's command prompt. It should open in under 50ms, filter results with no perceptible lag, and execute commands without any intermediate confirmation unless the command itself requires one (e.g., sign out).

## Acceptance Criteria

### Functional Requirements

- **Activation**: Pressing `:` on any screen opens the command palette as a modal overlay.
- **Activation blocked in input fields**: If the user is focused on a text `<input>` or `<textarea>` element (e.g., typing in a search field or form), `:` must type a literal colon character instead of opening the palette.
- **Immediate focus**: When opened, keyboard focus must land on the search input field within the same render frame.
- **Fuzzy search**: Typing in the input field filters the command list using fuzzy substring matching. The algorithm must match non-contiguous characters (e.g., "gi" matches "Go to Issues").
- **Result ranking**: Fuzzy results must be ranked by match score. Exact prefix matches rank highest, followed by contiguous substring matches, then non-contiguous matches. Ties are broken by command priority (navigation > actions > toggles).
- **Empty query state**: When the input is empty, all available commands are shown, ordered by category (navigation, then actions, then toggles) and alphabetically within each category.
- **Keyboard navigation of results**: `j` / `Down` moves the highlight down, `k` / `Up` moves it up. The first result is highlighted by default when results are shown.
- **Wrap-around navigation**: Navigating past the last result wraps to the first; navigating above the first wraps to the last.
- **Execute on Enter**: Pressing `Enter` on a highlighted result executes the associated command and closes the palette.
- **Dismiss on Esc**: Pressing `Esc` closes the palette without executing anything.
- **Dismiss on command execution**: After a command is executed, the palette closes automatically.
- **No state persistence**: The palette input is cleared each time it opens. No search history is retained.
- **Context-sensitive commands**: Commands requiring a repository context (Issues, Landings, Workflows, Wiki, Code Explorer) only appear when a repository is in scope.
- **Feature-flag filtering**: Commands associated with disabled feature flags are excluded from the command list entirely.
- **Auth-gated commands**: Commands requiring authentication (all commands) are only available when a valid auth token is loaded. If no token is present, the palette shows only "Sign In" guidance.
- **Command categories**: Each command entry has a visible category label (`Navigate`, `Action`, `Toggle`) rendered in muted text.
- **Keybinding hints**: Commands that have a direct keybinding show it right-aligned in the result row (e.g., `g d` for Dashboard).
- **Focus trapping**: While the palette is open, keyboard events must not propagate to the screen underneath.

### Boundary Constraints

- **Maximum query length**: 128 characters. Characters beyond this limit are silently ignored.
- **Maximum command count**: Up to 200 registered commands without degradation. Filtering must complete in under 16ms.
- **Result list display limit**: All matching results displayed. Viewport culling ensures only visible rows are rendered.
- **Command name max length**: 80 characters, truncated with `…`.
- **Command description max length**: 120 characters, truncated with `…`.
- **Keybinding hint max length**: 12 characters.

### Terminal Edge Cases

- **Minimum terminal (80x24)**: Palette at 90% width × 80% height. Category labels and descriptions hidden.
- **Standard terminal (120x40)**: Palette at 60% width × 60% height. All columns visible.
- **Large terminal (200x60+)**: Palette at 50% width × 50% height. All columns visible with extra padding.
- **Terminal resize while open**: Re-layout immediately. Auto-closes if terminal shrinks below 80x24.
- **No color support (TERM=dumb)**: Renders without color, focused row uses reverse video, ASCII border characters.
- **Rapid key input**: Every keystroke triggers a synchronous filter. No debounce. No input loss.
- **Paste into search**: Full pasted string applied, truncated to 128 characters.

### Definition of Done

- The `:` key opens the command palette as a modal overlay on every screen.
- Fuzzy search filters commands in real-time with correct ranking.
- All navigation targets from the go-to keybinding map are available as palette commands.
- All screen-level actions are registered as palette commands.
- Context-sensitive filtering works correctly.
- Feature-flag filtering hides commands for disabled features.
- Palette renders correctly at 80x24, 120x40, and 200x60.
- Keyboard navigation (j/k/Up/Down/Enter/Esc) works as specified.
- Focus is trapped within the palette while open.
- All verification tests pass.
- Palette opens in under 50ms and filters in under 16ms.

## Design

### TUI Screen Layout

The command palette is a modal overlay rendered on top of the current screen using absolute positioning and `zIndex` layering.

**Overlay structure (standard 120x40 terminal):**

```
┌──────────────────────────────────────────────────────────────────────┐
│ > search query here█                                                │
├──────────────────────────────────────────────────────────────────────┤
│  Navigate   Go to Dashboard                                   g d   │
│  Navigate   Go to Repository List                             g r   │
│▸ Navigate   Go to Issues                                      g i   │
│  Navigate   Go to Landings                                    g l   │
│  Navigate   Go to Notifications                               g n   │
│  Navigate   Go to Search                                      g s   │
│  Action     Create New Issue                                        │
│  Action     Mark All Notifications Read                             │
│  Toggle     Toggle Diff View (Unified/Split)                  t     │
└──────────────────────────────────────────────────────────────────────┘
```

**Component tree (OpenTUI + React 19):**

```tsx
{/* Backdrop dims the underlying screen */}
<box position="absolute" top={0} left={0} width="100%" height="100%" backgroundColor="rgba(0,0,0,0.5)" zIndex={100} />

{/* Palette container */}
<box
  position="absolute" top="center" left="center"
  width={paletteWidth} height={paletteHeight}
  borderStyle="rounded" borderColor={theme.border}
  focusedBorderColor={theme.primary}
  backgroundColor={theme.surface}
  zIndex={101} flexDirection="column" focused
>
  {/* Search input row */}
  <box flexDirection="row" height={1} paddingX={1}>
    <text color={theme.primary}>{">"}  </text>
    <input value={query} onInput={setQuery} onSubmit={executeHighlighted} placeholder="Type a command..." maxLength={128} focused />
  </box>

  {/* Separator */}
  <box height={1} borderStyle="single" />

  {/* Scrollable results list */}
  <scrollbox flexGrow={1} scrollY viewportCulling>
    <box flexDirection="column">
      {filteredCommands.map((cmd, i) => (
        <box key={cmd.id} flexDirection="row" height={1} paddingX={1}
          backgroundColor={i === highlightIndex ? theme.primary : undefined}>
          {showCategory && <text color={theme.muted} width={12}>{cmd.category}</text>}
          <text flexGrow={1}>{truncate(cmd.name, 80)}</text>
          {showDescription && <text color={theme.muted} flexShrink={1}>{truncate(cmd.description, 120)}</text>}
          {cmd.keybinding && <text color={theme.muted} width={12}>{cmd.keybinding}</text>}
        </box>
      ))}
    </box>
  </scrollbox>

  {/* Footer hints */}
  <box height={1} paddingX={1} flexDirection="row" justifyContent="space-between">
    <text color={theme.muted}>↑↓ navigate</text>
    <text color={theme.muted}>⏎ select</text>
    <text color={theme.muted}>esc dismiss</text>
  </box>
</box>
```

### Keybindings

**Global:** `:` opens command palette (blocked when focused on text input).

**While palette is open:**

| Key | Action |
|-----|--------|
| Printable chars | Append to search query, trigger fuzzy filter |
| `Backspace` | Remove last character from query |
| `Ctrl+U` | Clear search query entirely |
| `j` / `Down` | Highlight next result (wraps) |
| `k` / `Up` | Highlight previous result (wraps) |
| `Ctrl+D` | Page down in results |
| `Ctrl+U` | Page up (when query empty or cursor at 0) |
| `Enter` | Execute highlighted command, close palette |
| `Esc` | Close palette without action |
| `Ctrl+C` | Close palette without action |

### Responsive Behavior

| Terminal Size | Width | Height | Visible Columns |
|---------------|-------|--------|----------------|
| 80x24 | 90% | 80% | Name + Keybinding only |
| 120x40 | 60% | 60% | Category + Name + Description + Keybinding |
| 200x60 | 50% | 50% | All columns with extra padding |

Resizes recalculate synchronously via `useTerminalDimensions()` and `useOnResize()`. Auto-closes if terminal shrinks below 80x24.

### Data Hooks

| Hook | Source | Purpose |
|------|--------|---------|
| `useCommands()` | `@codeplane/ui-core` | Full command registry with metadata |
| `useFeatureFlags()` | `@codeplane/ui-core` | Enabled feature flags for filtering |
| `useRepoContext()` | `@codeplane/ui-core` | Current repo context for scoped commands |
| `useUser()` | `@codeplane/ui-core` | Current authenticated user |
| `fuzzyMatch()` | `@codeplane/ui-core` | Shared fuzzy matching with scoring |
| `useNavigation()` | TUI app shell | Screen navigation (push/pop) |
| `useKeyboard()` | `@opentui/react` | Keyboard event capture |
| `useTerminalDimensions()` | `@opentui/react` | Terminal size |
| `useOnResize()` | `@opentui/react` | Resize events |

### Command Registry Shape

```typescript
interface PaletteCommand {
  id: string
  name: string
  description: string
  category: "Navigate" | "Action" | "Toggle"
  keybinding?: string
  action: () => void
  contextRequirements?: { repo?: boolean; authenticated?: boolean }
  featureFlag?: string
  priority: number
}
```

## Permissions & Security

### Authorization Roles

| Condition | Palette Behavior |
|-----------|------------------|
| Authenticated user with valid token | Full palette with all context-appropriate commands |
| Token expired or invalid (401) | Palette shows only "Session expired. Run `codeplane auth login` to re-authenticate." |
| No token loaded at startup | Palette shows only sign-in guidance |
| `CODEPLANE_TOKEN` env var set | Token used for auth; palette fully functional |

The command palette itself makes no API calls — it is a client-side navigation and dispatch surface. Commands that trigger API actions carry the same token-based auth as all other TUI requests.

### Rate Limiting

- Purely client-side feature; no API requests on open/filter/close.
- Commands triggering API actions are subject to platform-wide rate limiting.
- Rapid open/close cycling has no server-side cost and requires no client-side throttling.

### Security Notes

- No sensitive data (tokens, secrets) displayed in the palette.
- Command names/descriptions are static strings, not user-generated content.
- Input is only used as a fuzzy filter against a fixed command registry — no arbitrary command execution.
- Action callbacks are trusted function references, not eval-able strings.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `TUICommandPaletteOpened` | User presses `:` and palette opens | `screen_context`, `repo_context`, `terminal_size`, `available_commands_count` |
| `TUICommandPaletteExecuted` | User selects and executes a command | `command_id`, `command_name`, `command_category`, `query_text`, `query_length`, `result_index`, `total_results`, `time_to_execute_ms`, `screen_context`, `repo_context` |
| `TUICommandPaletteDismissed` | User presses Esc/Ctrl+C to close without executing | `query_text`, `query_length`, `time_open_ms`, `screen_context` |
| `TUICommandPaletteFiltered` | User types in search input (debounced 500ms for analytics) | `query_text`, `query_length`, `result_count`, `screen_context` |

### Success Indicators

- **Adoption rate**: ≥30% of TUI sessions use the command palette at least once.
- **Execution rate**: ≥70% of palette opens result in a command execution (not a dismiss).
- **Time to execute**: Median time from palette open to command execution under 3 seconds.
- **Top-used commands**: Track top 10 most-executed commands to inform keybinding optimization.
- **Search refinement**: Average query length > 0 indicates users filter rather than browse.
- **Failure rate**: < 1% of command executions result in an error.

## Observability

### Logging Requirements

| Log Point | Level | Structured Context |
|-----------|-------|-------------------|
| Command palette opened | `debug` | `screen_context`, `repo_context`, `available_commands_count` |
| Command executed from palette | `info` | `command_id`, `command_name`, `command_category`, `query_text` |
| Command palette dismissed | `debug` | `query_text`, `time_open_ms` |
| Command execution failed | `error` | `command_id`, `command_name`, `error_message`, `error_stack` |
| Fuzzy filter took > 16ms | `warn` | `query_text`, `candidate_count`, `filter_duration_ms` |
| Palette auto-closed (terminal too small) | `info` | `terminal_width`, `terminal_height` |
| Feature flag filtering removed commands | `debug` | `removed_command_ids`, `disabled_flags` |

### Error Cases and Failure Modes

| Error Case | Expected Behavior | Recovery |
|------------|-------------------|----------|
| Terminal resize below 80x24 while open | Auto-closes, no command executed | Reopen after resizing above minimum |
| Command action callback throws | Palette closes, error shown via error boundary, logged at `error` | Retry by reopening palette |
| SSE disconnect while open | No effect (palette is client-side only) | Status bar shows disconnect; SSE auto-reconnects |
| Auth token expires while open | Palette stays open; executed command's API call returns 401, screen shows auth-expired message | Run `codeplane auth login` and restart TUI |
| useCommands() returns empty array | Shows "No commands available" centered in results | Verify auth status and feature flag loading |
| No fuzzy match results | Shows "No matching commands" in muted text | Modify query or dismiss |
| React error boundary triggered in palette | Palette closes, top-level error boundary renders | Press `r` to restart or `q` to quit |
| Rapid key input (>30 keys/sec) | All keystrokes processed synchronously, no input loss | Expected behavior, no recovery needed |

## Verification

### E2E Tests (`e2e/tui/app-shell.test.ts`)

#### Snapshot Tests — Visual States

- **`test: command palette renders centered overlay on 120x40 terminal`** — Launch TUI at 120x40, press `:`, capture terminal snapshot. Assert overlay visible with rounded border, search input with `>` prompt, and full command list.
- **`test: command palette renders expanded overlay on 80x24 terminal`** — Launch TUI at 80x24, press `:`, capture snapshot. Assert 90% width × 80% height. Assert category labels and descriptions hidden. Only command name and keybinding hint visible.
- **`test: command palette renders on 200x60 terminal`** — Launch TUI at 200x60, press `:`, capture snapshot. Assert 50% width × 50% height. All columns visible with extra padding.
- **`test: command palette shows empty query state with all commands`** — Press `:`, capture snapshot. Assert all commands visible, ordered by category (Navigate, Action, Toggle).
- **`test: command palette shows filtered results for query`** — Press `:`, type "dash", capture snapshot. Assert only matching commands visible.
- **`test: command palette shows highlighted result row`** — Press `:`, press `j`, capture snapshot. Assert second row highlighted, first row not.
- **`test: command palette shows no results state`** — Press `:`, type "xyznonexistent", capture snapshot. Assert "No matching commands" text visible.
- **`test: command palette shows keybinding hints on result rows`** — Press `:`, capture snapshot. Assert "Go to Dashboard" row contains "g d" right-aligned.
- **`test: command palette footer shows navigation hints`** — Press `:`, capture snapshot. Assert footer contains "↑↓ navigate", "⏎ select", "esc dismiss".

#### Keyboard Interaction Tests

- **`test: colon key opens command palette`** — Assert palette not visible, press `:`, assert palette visible with focused input.
- **`test: Esc key closes command palette`** — Press `:` to open, press `Esc`, assert palette not visible.
- **`test: Ctrl+C closes command palette`** — Press `:` to open, press `Ctrl+C`, assert palette closed and TUI still running.
- **`test: Enter on highlighted command navigates to target`** — Press `:`, assert "Go to Dashboard" highlighted, press `Enter`, assert palette closes and Dashboard screen active.
- **`test: j/k keys navigate result list`** — Press `:`, assert first item highlighted, press `j`, assert second highlighted, press `k`, assert first highlighted.
- **`test: Down/Up arrow keys navigate result list`** — Press `:`, press `Down`, assert second highlighted, press `Up`, assert first highlighted.
- **`test: navigation wraps from bottom to top`** — Press `:`, press `k` from first item, assert last item highlighted.
- **`test: navigation wraps from top to bottom`** — Press `:`, navigate to last item, press `j`, assert first item highlighted.
- **`test: typing filters results in real-time`** — Press `:`, type "iss", assert only commands matching "iss" visible.
- **`test: backspace removes characters from query`** — Press `:`, type "dash", press `Backspace`, assert query shows "das" and results update.
- **`test: Ctrl+U clears search query`** — Press `:`, type "dashboard", press `Ctrl+U`, assert query empty and all commands shown.
- **`test: executing command closes palette and performs action`** — Press `:`, type "notif", press `Enter` on "Go to Notifications", assert palette closed and Notifications screen active.
- **`test: focus is trapped within palette`** — Navigate to list screen, press `:`, press `j` three times, press `Esc`, assert underlying list cursor unchanged.
- **`test: colon does not open palette when input is focused`** — Navigate to search screen, focus search input with `/`, type `:`, assert palette does not open and `:` appears in search input.
- **`test: palette input is cleared between invocations`** — Press `:`, type "test", press `Esc`, press `:` again, assert input empty.
- **`test: Ctrl+D pages down in results`** — Launch at 80x24, press `:`, press `Ctrl+D`, assert highlight moved down by ~half viewport.

#### Context-Sensitive Command Tests

- **`test: repo-scoped commands hidden when no repo context`** — On Dashboard, press `:`, assert "Go to Issues" NOT in results. Assert "Go to Dashboard" IS in results.
- **`test: repo-scoped commands visible when repo is in context`** — Navigate into a repository, press `:`, assert "Go to Issues" IS in results.
- **`test: feature-flag-disabled commands are hidden`** — Launch with wiki flag disabled, press `:`, assert "Go to Wiki" NOT in results.
- **`test: all navigation go-to targets appear as palette commands`** — In repo context, press `:`, assert all go-to targets present: Dashboard, Repository List, Issues, Landings, Workspaces, Notifications, Search, Agents, Organizations, Workflows, Wiki.

#### Responsive Tests

- **`test: palette resizes on terminal resize from 120x40 to 80x24`** — Launch at 120x40, press `:`, resize to 80x24, capture snapshot. Assert 90% × 80%, category and description hidden.
- **`test: palette auto-closes when terminal shrinks below 80x24`** — Launch at 120x40, press `:`, resize to 79x23, assert palette closed.
- **`test: palette resizes on terminal resize from 80x24 to 200x60`** — Launch at 80x24, press `:`, resize to 200x60, capture snapshot. Assert 50% × 50%, all columns visible.

#### Fuzzy Search Tests

- **`test: fuzzy match finds non-contiguous characters`** — Press `:`, type "gi", assert "Go to Issues" appears.
- **`test: fuzzy match ranks exact prefix higher`** — Press `:`, type "Go", assert "Go to Dashboard" ranks above non-"Go" prefixed commands.
- **`test: fuzzy match is case-insensitive`** — Press `:`, type "DASHBOARD", assert "Go to Dashboard" appears.
- **`test: empty results for nonsense query`** — Press `:`, type "zzzzzzzzz", assert "No matching commands" message.

#### Edge Case Tests

- **`test: palette handles maximum query length (128 chars)`** — Press `:`, type 130 characters, assert only 128 accepted.
- **`test: rapid open/close does not cause errors`** — Rapidly press `:` then `Esc` 20 times, assert TUI responsive and no error boundary.
- **`test: palette works after screen navigation`** — Navigate Dashboard → Repo List → Repo → Issues, press `:`, assert palette opens with repo-scoped commands.
