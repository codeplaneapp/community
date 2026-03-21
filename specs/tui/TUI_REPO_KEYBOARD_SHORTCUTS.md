# TUI_REPO_KEYBOARD_SHORTCUTS

Specification for TUI_REPO_KEYBOARD_SHORTCUTS.

## High-Level User POV

The repository keyboard shortcuts feature is the unified keybinding dispatch and discoverability layer for the entire repository screen in the Codeplane TUI. It answers the question every keyboard-driven user has when they land on a repository: "What can I do here, and how do I do it?"

When a user opens any repository — whether from the dashboard, repo list, go-to navigation (`g r`), command palette, or deep link — they are working within a complex multi-layered screen that includes a repository header, a tab bar with six tabs, tab-specific content panels, and possibly sub-panels like the code explorer's file tree and preview split. Each of these layers defines its own keybindings. The repository keyboard shortcuts feature owns the priority resolution between these layers, ensures no keybinding conflicts exist, and provides a comprehensive, always-accessible reference for every available shortcut.

The user discovers shortcuts through three complementary mechanisms. First, the **status bar** at the bottom of the screen shows a context-sensitive summary of the most relevant keybindings for the current focus state — changing dynamically as the user moves between the overview, different tabs, the file tree, the preview panel, or a form. Second, pressing `?` opens the **help overlay**, which presents every active keybinding organized into labeled groups: "Global", "Go To", "Repository", "Tab Navigation", and a group for whichever tab is currently active. Third, the **command palette** (`:`) provides fuzzy-searchable access to all repository actions by name, serving as the fallback for users who cannot remember a specific key.

The keybinding dispatch follows a strict priority hierarchy. When the user presses a key, the TUI processes it through layers in order: (1) text input fields consume all printable characters and Tab/Shift+Tab when focused; (2) modal overlays (help, command palette, confirmation dialogs) trap all keys except Esc and Ctrl+C; (3) go-to mode (`g` prefix active) intercepts the second key; (4) the active tab's content panel handles panel-specific keys; (5) the repository tab bar handles Tab/Shift+Tab and number keys 1–6; (6) repository-wide shortcuts handle cross-cutting actions like `s` (star), `c` (copy clone URL); (7) global shortcuts handle `q` (back), `Esc` (close/back), `?` (help), `:` (command palette), `Ctrl+C` (quit). Each layer either consumes the key and stops propagation, or passes it through to the next layer.

Key conflicts are resolved by context. For example, `k` means "scroll up" when a scrollable content panel has focus, but it means "navigate to wiki" from the repository overview. The `Tab` key means "next repository tab" at the repo screen level, but "next form field" when inside a settings form, and "switch focus between panels" inside the code explorer. Number keys `1`–`6` jump to repository tabs at the repo level, but are passed through as character input when a text field is focused. The user never needs to think about these rules — they work intuitively because the status bar hints always reflect the current context.

Multi-key sequences are supported for exactly two patterns: `g g` (scroll to top) and `g + destination` (go-to navigation). The `g` prefix activates a transient mode with a 1500ms timeout. The status bar shows destination hints while in go-to mode. If the timeout expires or the user presses an unrecognized second key, go-to mode cancels silently.

The repository screen also provides **quick action shortcuts** that work from any tab: `s` to star/unstar the repository, `c` to copy the clone URL to the clipboard, and `n` to create a new item in the current context (new issue from the issues tab, new landing from the landings tab). These quick actions are suppressed when a text input has focus or when a modal is open.

When the user resizes their terminal, the status bar keybinding hints adapt immediately. At minimum width (80 columns), only the three most essential hints are shown. At standard width (120 columns), six to eight hints are shown. At large width (200+ columns), all hints for the current context are displayed with comfortable spacing. The help overlay also adapts its dimensions and column layout to the terminal size.

## Acceptance Criteria

### Definition of Done

- [ ] A `useRepoKeyboard()` hook orchestrates all keyboard dispatch for the repository screen
- [ ] The hook composes keybindings from all repository sub-features: overview, tab navigation, and the active tab's content panel
- [ ] Keybinding priority follows the documented 7-layer hierarchy: input → modal → go-to → tab content → tab bar → repo-wide → global
- [ ] No two keybindings in the same active context produce different actions for the same key
- [ ] The help overlay (`?`) displays all active keybindings organized into labeled groups
- [ ] The status bar displays context-sensitive keybinding hints that update within one render frame of focus changes
- [ ] The command palette (`:`) includes all repository actions as searchable commands
- [ ] All keybindings are suppressed when a `<input>` or `<textarea>` has focus, except `Esc` (blur/cancel) and `Ctrl+C` (quit)
- [ ] All keybindings are suppressed when a modal overlay is open, except `Esc` (close), `?` (close help), and `Ctrl+C` (quit)
- [ ] `g` prefix mode activates go-to navigation with 1500ms timeout and status bar destination hints
- [ ] Repository-wide shortcuts (`s`, `c`, `n`) work from any tab unless a tab-level conflict exists
- [ ] Number keys `1`–`6` switch repository tabs at the repo level, but are passed through in text inputs
- [ ] `Tab`/`Shift+Tab` switch repository tabs at the repo level, but navigate form fields within forms
- [ ] `q` pops the repository screen and returns to the previous screen
- [ ] `Esc` closes the topmost overlay/modal if one is open, or pops the screen if none is open
- [ ] Rapid key presses (holding down a key) are processed sequentially without dropping events
- [ ] Multi-key sequence `g g` scrolls to the top of the current scrollable content
- [ ] All keybinding handlers execute within 16ms (one frame at 60fps)
- [ ] The feature registers keybinding groups with the help overlay system so `?` shows accurate, complete information

### Keybinding Reference (Complete)

**Repository-wide shortcuts (active from any tab unless overridden):**

| Key | Action | Condition |
|-----|--------|----------|
| `s` | Star / unstar repository | No text input focused, no modal open |
| `c` | Copy clone URL to clipboard | No text input focused, no modal open |
| `n` | New item in current context | Tab-dependent: new issue on issues tab, new landing on landings tab, no-op on tabs without create actions |
| `R` | Retry last failed fetch | Error state displayed in any panel |
| `q` | Pop screen (go back) | Always (except during text input, where Esc is used instead) |
| `Esc` | Close overlay/modal or pop screen | Always |
| `?` | Toggle help overlay | Always |
| `:` | Open command palette | No text input focused |
| `Ctrl+C` | Quit TUI | Always |

**Tab navigation shortcuts:**

| Key | Action | Condition |
|-----|--------|----------|
| `Tab` | Next repository tab (wraps) | No text input focused, no modal open |
| `Shift+Tab` | Previous repository tab (wraps) | No text input focused, no modal open |
| `1`–`6` | Jump to specific tab | No text input focused, no modal open |
| `h` / `Left` | Previous tab (no wrap) | Tab bar focused, no text input |
| `l` / `Right` | Next tab (no wrap) | Tab bar focused, no text input |

**Content navigation shortcuts:**

| Key | Action | Condition |
|-----|--------|----------|
| `j` / `Down` | Move cursor / scroll down | Content panel focused |
| `k` / `Up` | Move cursor / scroll up | Content panel focused |
| `G` | Jump to bottom of list / end of content | Content panel focused |
| `g g` | Jump to top of list / start of content | Content panel focused |
| `Ctrl+D` | Page down (half viewport) | Content panel focused |
| `Ctrl+U` | Page up (half viewport) | Content panel focused |
| `Enter` | Select / open focused item | Content panel focused, item focusable |
| `Space` | Toggle multi-select on focused item | List with multi-select enabled |
| `/` | Activate search/filter input | Content panel focused |

### Priority Resolution Rules

- [ ] Layer 1 (Text Input): All printable characters, Tab, Shift+Tab, and number keys consumed. Only Esc and Ctrl+C escape.
- [ ] Layer 2 (Modal): All keys consumed by modal handler. Esc closes. Ctrl+C quits. Help allows ? to close.
- [ ] Layer 3 (Go-to): Second key checked against destinations. Recognized → navigate. `g` → scroll to top. `Esc` → cancel. `q` → cancel + pop. Unrecognized → cancel silently, stop propagation.
- [ ] Layer 4 (Tab Content): Active tab handles j/k, Enter, d, /, o, Space, G, g g, Ctrl+D/U, R.
- [ ] Layer 5 (Tab Bar): Tab/Shift+Tab, 1–6, h/l handled.
- [ ] Layer 6 (Repo-wide): s, c, n handled.
- [ ] Layer 7 (Global): q, Esc, ?, :, Ctrl+C, g handled.
- [ ] A key consumed at any layer does not propagate.

### Responsive Status Bar Hints

- [ ] At 80–99 columns: 3 most relevant hints, abbreviated (e.g., `j/k:nav  ↵:open  q:back`)
- [ ] At 100–119 columns: 5–6 hints
- [ ] At 120–199 columns: 6–8 hints
- [ ] At 200+ columns: all context-relevant hints with comfortable spacing
- [ ] Hints update synchronously when focus changes (within one render frame)
- [ ] Hints update synchronously when terminal resizes

### Edge Cases

- [ ] Terminal resize during keybinding dispatch: handler completes before re-layout
- [ ] Rapid key presses (>30 keys/second): all events processed sequentially, no drops
- [ ] `g g` distinguished from go-to mode: second `g` recognized as "scroll to top"
- [ ] `g q`: go-to mode cancelled AND screen popped
- [ ] `g Esc`: go-to mode cancelled, no pop
- [ ] `g` then timeout (1500ms): cancelled silently, no error
- [ ] Key press during SSE disconnect: all keybindings functional
- [ ] Key press during in-flight API request: handler fires immediately, action queued if needed
- [ ] Unicode key input: ignored by keybinding system, passed through only to text inputs
- [ ] Terminal with no color support: hints rendered without color, functionality unchanged
- [ ] Tab key in terminals that don't distinguish Tab from Ctrl+I: treated as Tab

### Boundary Constraints

- [ ] Maximum keybinding groups in help overlay: 8
- [ ] Maximum keybindings per group: 20 entries
- [ ] Maximum total keybindings in help overlay: 80
- [ ] Status bar hint string max: `terminal_width - 20` characters
- [ ] Status bar truncation: rightmost hints dropped first
- [ ] Go-to mode timeout: 1500ms (not configurable)
- [ ] Keybinding handler execution budget: 16ms per key event
- [ ] Key event queue depth: 64 events maximum (overflow silently dropped)

## Design

### Layout Integration

The repository keyboard shortcuts feature does not own a visible screen region. It operates as an invisible orchestration layer that integrates with three visible components: the status bar (bottom), the help overlay (modal), and the command palette (modal).

```
┌─────────────────────────────────────────────────────────┐
│ Header: Dashboard > owner/repo           ● SYNCED  🔔 3  │
├─────────────────────────────────────────────────────────┤
│ owner/repo                            PUBLIC    ★ 42     │
├─────────────────────────────────────────────────────────┤
│ [1:Bookmarks] 2:Changes  3:Code  4:Conflicts  5:OpLog  6:Settings │
├─────────────────────────────────────────────────────────┤
│                                                          │
│   Content Area (keyboard dispatch target, Layer 4)       │
│   - Scrollbox navigation: j/k, Ctrl+D/U, G, gg          │
│   - Item actions: Enter, d, o, Space                     │
│   - Search: /                                            │
│                                                          │
├─────────────────────────────────────────────────────────┤
│ j/k:navigate  Enter:select  d:diff  Tab:tab  q:back  ? │
└─────────────────────────────────────────────────────────┘
```

Help overlay (rendered as modal over content):

```jsx
<box
  position="absolute"
  top="center"
  left="center"
  width={overlayWidth}    // 90% at 80col, 70% at 120col, 60% at 200col
  height={overlayHeight}  // 90% at 80×24, 70% at 120×40, 60% at 200×60
  border="single"
  borderColor="primary"
>
  <box flexDirection="row" height={1} borderBottom="single">
    <text bold> Keyboard Shortcuts </text>
  </box>
  <scrollbox flexGrow={1}>
    <box flexDirection={columns > 1 ? "row" : "column"} gap={2}>
      {helpGroups.map(group => (
        <box key={group.label} flexDirection="column" flexGrow={1}>
          <text bold color="primary">── {group.label} ──</text>
          {group.entries.map(entry => (
            <box key={entry.key} flexDirection="row" height={1}>
              <box width={keyColumnWidth}>
                <text bold>{entry.key}</text>
              </box>
              <text color="muted">{entry.description}</text>
            </box>
          ))}
        </box>
      ))}
    </box>
  </scrollbox>
</box>
```

Status bar hint rendering:

```jsx
<box flexDirection="row" height={1} width="100%">
  <box flexGrow={1}>
    <text color="muted">
      {statusHints.map(h => `${h.key}:${h.label}`).join("  ")}
    </text>
  </box>
  <box>
    <text color="muted">? help</text>
  </box>
</box>
```

### Keybinding Dispatch Flow

```
keypress event received
│
├─ Is <input>/<textarea> focused?
│   ├─ Yes → Is key Esc? → Blur input, stop propagation
│   ├─ Yes → Is key Ctrl+C? → Quit TUI
│   └─ Yes → Pass key to input, stop propagation
│
├─ Is modal/overlay open?
│   ├─ Yes → Is key Esc or ? (for help)? → Close modal
│   ├─ Yes → Is key Ctrl+C? → Quit TUI
│   └─ Yes → Pass key to modal handler, stop propagation
│
├─ Is go-to mode active?
│   ├─ Yes → Is key a recognized destination? → Navigate, exit go-to
│   ├─ Yes → Is key g? → Execute "scroll to top" (g g), exit go-to
│   ├─ Yes → Is key Esc? → Cancel go-to, no cascade
│   ├─ Yes → Is key q? → Cancel go-to AND pop screen
│   └─ Yes → Unrecognized key → Cancel go-to silently, stop propagation
│
├─ Does active tab content panel handle this key?
│   └─ Yes → Execute tab handler, stop propagation
│
├─ Does tab bar handle this key?
│   └─ Yes → Execute tab switch, stop propagation
│
├─ Is key a repo-wide shortcut?
│   └─ Yes → Execute repo action, stop propagation
│
├─ Is key a global shortcut?
│   ├─ g → Enter go-to mode, start 1500ms timeout
│   ├─ q → Pop screen
│   ├─ Esc → Pop screen (no overlay to close)
│   ├─ ? → Open help overlay
│   ├─ : → Open command palette
│   └─ Ctrl+C → Quit TUI
│
└─ Unrecognized key → No-op
```

### Responsive Behavior

**Status bar hints by terminal width:**

| Width | Hints shown | Example |
|-------|-------------|--------|
| 80–99 | 3 hints | `j/k:nav  ↵:open  q:back` |
| 100–119 | 5–6 hints | `j/k:navigate  Enter:open  d:diff  Tab:tab  q:back` |
| 120–199 | 6–8 hints | `j/k:navigate  Enter:select  d:diff  /:search  Tab:switch tab  s:star  c:clone  q:back` |
| 200+ | All hints | Full display with 3-space gaps |

**Help overlay by terminal size:**

| Size | Overlay dimensions | Columns |
|------|-------------------|--------|
| 80×24 | 90% width × 90% height | Single column, scrollable |
| 120×40 | 70% width × 70% height | Single column, scrollable |
| 200×60 | 60% width × 60% height | Two columns (groups side by side) |

### Data Hooks

| Hook | Source | Purpose |
|------|--------|--------|
| `useKeyboard()` | `@opentui/react` | Register key event handlers with priority dispatch |
| `useTerminalDimensions()` | `@opentui/react` | Determine status bar hint count and help overlay size |
| `useOnResize()` | `@opentui/react` | Recompute status bar hints on terminal resize |
| `useNavigation()` | Local TUI | `push()`, `pop()`, `goTo()`, read navigation context |
| `useRepo(owner, repo)` | `@codeplane/ui-core` | Repository data for repo-wide actions |
| `useStarRepo(owner, repo)` | `@codeplane/ui-core` | Star/unstar toggle with optimistic UI |
| `useClipboard()` | Local TUI | Clipboard write for clone URL copy |
| `useRepoTabState(repo)` | Local TUI | Active tab index read/write with persistence |
| `useHelpOverlay()` | Local TUI | Register keybinding groups for help overlay |
| `useStatusBar()` | Local TUI | Set context-sensitive keybinding hints |
| `useGoToMode()` | Local TUI | Manage go-to prefix state and timeout |

### Navigation Context

The keyboard shortcut dispatch reads: `repo` (current repository full name), `activeTabIndex` (which tab is active), `focusLayer` (which sub-panel has focus), `errorState` (whether error is displayed), `modalState` (whether overlay is open).

## Permissions & Security

### Authorization Roles

| Action | Read-Only | Member | Admin | Owner |
|--------|-----------|--------|-------|-------|
| View all keybinding hints | ✅ | ✅ | ✅ | ✅ |
| Open help overlay | ✅ | ✅ | ✅ | ✅ |
| Star / unstar repository | ✅ (any authenticated user) | ✅ | ✅ | ✅ |
| Copy clone URL | ✅ | ✅ | ✅ | ✅ |
| Create new issue (`n` on issues tab) | ❌ | ✅ | ✅ | ✅ |
| Create new landing (`n` on landings tab) | ❌ | ✅ | ✅ | ✅ |
| Access settings tab (`6`) content | ❌ | ❌ | ✅ | ✅ |

- The TUI requires authentication at bootstrap; unauthenticated sessions never reach this screen
- All keyboard shortcut dispatch is client-side; authorization is enforced at the API layer when the resulting action makes a server request
- Keybindings for unauthorized actions are still shown in the help overlay (the action itself returns an inline permission error, not a hidden shortcut)
- The `n` keybinding shows "Permission denied" in the status bar for 2 seconds if the user lacks write access

### Token Handling

- Token loaded from CLI keychain or `CODEPLANE_TOKEN` environment variable at bootstrap
- Token is never displayed in keybinding hints, help overlay, or status bar messages
- 401 responses from actions triggered by keybindings propagate to the app-shell auth error screen
- Token state does not affect keybinding registration or dispatch — all keybindings are always registered regardless of auth state

### Rate Limiting

- Keyboard dispatch itself generates zero API requests — it only dispatches to action handlers
- Actions triggered by keybindings are subject to the same rate limits as their direct invocations (star toggle: 30 req/min per user per repo; API reads: 5,000 req/hr)
- If a rate-limited action is triggered via keybinding, the status bar shows "Rate limited. Retry in {N}s." for 2 seconds
- Rapid key presses that trigger the same action (e.g., holding `s`) are debounced at the action layer — the second press is queued until the first completes

### Input Sanitization

- Keybinding dispatch processes only single-byte ASCII characters and modifier keys — no user-provided text is executed
- No keybinding triggers shell command execution or eval
- Go-to destination identifiers come from a hardcoded constant array, not from user input
- Status bar hint strings are generated from hardcoded templates, not from API responses

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `tui.repo.keyboard.shortcut_used` | Any repo-level keybinding is activated | `repo_full_name`, `key`, `action`, `focus_layer`, `active_tab`, `terminal_width`, `terminal_height` |
| `tui.repo.keyboard.help_opened` | User presses `?` from repo screen | `repo_full_name`, `active_tab`, `focus_layer`, `terminal_width`, `terminal_height`, `total_keybindings_shown` |
| `tui.repo.keyboard.help_closed` | User closes help overlay | `repo_full_name`, `close_method` (Esc/question_mark/Ctrl+C), `time_open_ms`, `scroll_depth_percent` |
| `tui.repo.keyboard.goto_activated` | User presses `g` to enter go-to mode | `repo_full_name`, `active_tab` |
| `tui.repo.keyboard.goto_completed` | User completes go-to navigation | `repo_full_name`, `destination`, `time_to_second_key_ms` |
| `tui.repo.keyboard.goto_cancelled` | Go-to cancelled (timeout, Esc, unrecognized key) | `repo_full_name`, `cancel_reason` (timeout/esc/unrecognized), `time_elapsed_ms` |
| `tui.repo.keyboard.conflict_suppressed` | A keybinding was suppressed due to focus context | `repo_full_name`, `key`, `suppression_reason` (input_focused/modal_open/go_to_active), `focus_layer` |
| `tui.repo.keyboard.status_hint_truncated` | Status bar hints truncated due to terminal width | `repo_full_name`, `terminal_width`, `hints_shown`, `hints_total`, `hints_dropped` |
| `tui.repo.keyboard.action_error` | Keybinding-triggered action failed | `repo_full_name`, `key`, `action`, `error_type` (network/auth/rate_limit/permission), `http_status` |
| `tui.repo.keyboard.command_palette_used` | User executes a repo action from command palette instead of keybinding | `repo_full_name`, `action`, `search_query`, `result_position` |

### Common Event Properties

All events include: `session_id`, `timestamp` (ISO 8601), `viewer_id`, `terminal_width`, `terminal_height`

### Success Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Keybinding adoption rate | >70% of repo sessions | % of repo sessions where at least one keybinding is used (beyond q/Esc) |
| Help overlay usage | <30% of repo sessions | Users needing help decreases over time (indicates intuitiveness) |
| Command palette fallback rate | <20% of actions | % of actions via palette instead of direct keybinding |
| Go-to completion rate | >80% of activations | % of go-to activations resulting in navigation |
| Keybinding discovery time | <5s median | Median time from first repo visit to first non-navigation keybinding use |
| Conflict suppression rate | <5% of key events | % of key presses suppressed due to context |
| Action error rate | <2% of keybinding actions | % of keybinding-triggered actions that fail |
| Key event processing latency (p99) | <16ms | Dispatch latency never exceeds one frame |

## Observability

### Logging Requirements

| Log Level | Event | Message Format |
|-----------|-------|----------------|
| `debug` | Key event received | `RepoKeyboard: key=[{key}] modifiers=[{mods}] layer=[{focus_layer}] tab=[{active_tab}]` |
| `debug` | Key dispatched to handler | `RepoKeyboard: dispatched [key={key}] [handler={handler_name}] [layer={layer}]` |
| `debug` | Key suppressed | `RepoKeyboard: suppressed [key={key}] [reason={reason}]` |
| `debug` | Go-to mode entered | `RepoKeyboard: goto mode entered` |
| `debug` | Go-to mode resolved | `RepoKeyboard: goto resolved [destination={dest}] [elapsed_ms={ms}]` |
| `debug` | Go-to mode cancelled | `RepoKeyboard: goto cancelled [reason={reason}] [elapsed_ms={ms}]` |
| `debug` | Status hints updated | `RepoKeyboard: hints updated [count={n}] [truncated={bool}] [width={w}]` |
| `info` | Help overlay toggled | `RepoKeyboard: help overlay [action=open|close] [tab={active_tab}] [groups={n}] [entries={n}]` |
| `info` | Repo-wide action triggered | `RepoKeyboard: action [key={key}] [action={action}] [repo={repo}]` |
| `warn` | Action failed | `RepoKeyboard: action failed [key={key}] [action={action}] [error={error_type}] [status={http_status}]` |
| `warn` | Key event queue overflow | `RepoKeyboard: queue overflow [dropped={n}] [queue_depth=64]` |
| `error` | Keybinding handler exception | `RepoKeyboard: handler error [key={key}] [handler={handler}] [error={msg}] [stack={trace}]` |

Logs written to stderr. Level controlled by `CODEPLANE_LOG_LEVEL` (default: `warn`).

### Error Cases

| Error Case | Detection | Recovery |
|------------|-----------|----------|
| Keybinding handler throws exception | try/catch in dispatch loop | Error logged. Key silently ignored. No crash. Status bar shows transient error. |
| Star action fails (network) | `toggleStar()` rejects | Optimistic UI reverts. Status bar: "Star failed" for 2s. `s` remains active for retry. |
| Copy to clipboard fails | `copy()` returns false | Status bar: "Copy not available" for 2s. No retry. |
| Go-to timeout (1500ms) | Timer fires with go-to active | Cancelled silently. Status bar reverts. No error message. |
| Terminal resize during key dispatch | `useOnResize` fires mid-handler | Handler completes first. Re-layout after. Hints recomputed with new width. |
| SSE disconnect during repo screen | SSE provider emits disconnect | Status bar sync indicator updates. Keyboard dispatch unaffected. |
| 401 during keybinding action | API returns 401 | Propagates to app-shell auth error screen. |
| 429 rate limit during action | API returns 429 | Status bar: "Rate limited. Retry in {N}s." Action blocked until cooldown. |
| Multiple rapid key events | Queue depth exceeds 64 | Oldest events processed. Overflow silently dropped. Warning logged. |
| Help overlay with >80 keybindings | Count check | Entries beyond 80 not rendered. "..." shown at bottom. |
| Focus layer becomes undefined | Null check in dispatch | Falls back to global layer. Warning logged. |
| Tab content unmounted during dispatch | React concurrent mode | Handler checks mount state. Stale handlers are no-ops. |

### Failure Modes

- **Keybinding dispatch crash**: Top-level error boundary catches. TUI shows error screen with `r` to restart. Key listener re-registered on recovery.
- **Status bar hint render crash**: Status bar error boundary. Falls back to empty hints. Keybinding dispatch continues.
- **Help overlay render crash**: Overlay error boundary. Falls back to "Unable to display help. Press Esc to close." Keybindings still work.
- **Go-to timer leak**: Timer cleared on unmount via useEffect cleanup. If cleanup fails, timer fires harmlessly (checks mounted state).
- **Memory accumulation from keybinding registrations**: Handlers registered per-mount, cleaned up on unmount. Stable references via useCallback prevent re-registration.

## Verification

### Test File: `e2e/tui/repository.test.ts`

All tests use `@microsoft/tui-test`. Tests that fail due to unimplemented backends are left failing (never skipped).

#### Terminal Snapshot Tests

1. **`repo-keyboard-status-bar-overview`** — Navigate to repo overview at 120×40. Snapshot. Assert status bar shows context-appropriate hints including `s:star`, `c:clone`, `Tab:switch tab`, `q:back`.
2. **`repo-keyboard-status-bar-changes-tab`** — Navigate to repo, press `2` (Changes). Snapshot. Assert status bar shows `j/k:navigate`, `Enter:select`, `d:diff`, `/:search`, `Tab:switch tab`, `q:back`.
3. **`repo-keyboard-status-bar-code-explorer-tree`** — Navigate to repo, press `3` (Code). Snapshot. Assert status bar shows file tree hints: `j/k:navigate`, `Enter:open`, `/:search`, `Tab:panel`, `q:back`.
4. **`repo-keyboard-status-bar-code-explorer-preview`** — On Code tab, press `Tab` to focus preview. Snapshot. Assert status bar shows preview hints: `j/k:scroll`, `m:markdown`, `y:copy path`, `Tab:panel`, `q:back`.
5. **`repo-keyboard-status-bar-80col`** — Navigate to repo at 80×24. Snapshot. Assert only 3 hints shown: `j/k:nav`, `↵:open`, `q:back`.
6. **`repo-keyboard-status-bar-200col`** — Navigate to repo at 200×60. Snapshot. Assert all hints shown with comfortable spacing.
7. **`repo-keyboard-help-overlay-open`** — Navigate to repo, press `?`. Snapshot. Assert help overlay with "Global", "Go To", "Repository", "Tab Navigation", and active tab group.
8. **`repo-keyboard-help-overlay-changes-groups`** — On Changes tab, press `?`. Snapshot. Assert "Changes" group visible with `j/k`, `Enter`, `d`, `/`, `o`, `G`, `g g` entries.
9. **`repo-keyboard-help-overlay-code-groups`** — On Code tab, press `?`. Snapshot. Assert two code groups: "Code Explorer — File Tree" and "Code Explorer — Preview".
10. **`repo-keyboard-help-overlay-80x24`** — At 80×24, press `?`. Snapshot. Assert overlay uses 90% width, single column, scrollable.
11. **`repo-keyboard-help-overlay-200x60`** — At 200×60, press `?`. Snapshot. Assert overlay uses 60% width, two-column layout.
12. **`repo-keyboard-goto-mode-status-bar`** — Press `g`. Snapshot. Assert status bar shows go-to destination hints.
13. **`repo-keyboard-goto-mode-timeout`** — Press `g`, wait 1500ms. Snapshot. Assert status bar reverts to normal hints.

#### Keyboard Interaction Tests — Priority Dispatch

14. **`repo-keyboard-j-scrolls-in-list`** — On Changes tab with list focused, press `j`. Assert cursor moves to next item.
15. **`repo-keyboard-j-scrolls-in-preview`** — On Code tab with preview focused, press `j`. Assert preview scrolls down.
16. **`repo-keyboard-tab-switches-repo-tab`** — On Bookmarks tab (no form), press `Tab`. Assert Changes tab becomes active.
17. **`repo-keyboard-tab-in-form-advances-field`** — On Settings tab with form focused, press `Tab`. Assert next form field focused, not tab switch.
18. **`repo-keyboard-number-in-text-input`** — Focus a text input, press `3`. Assert `3` typed into input, repo tab does not switch.
19. **`repo-keyboard-esc-closes-modal`** — Open help overlay (`?`), press `Esc`. Assert overlay closes.
20. **`repo-keyboard-esc-pops-when-no-modal`** — No modal open, press `Esc`. Assert screen pops.
21. **`repo-keyboard-q-pops-screen`** — Press `q`. Assert repo screen popped.
22. **`repo-keyboard-ctrl-c-quits`** — Press `Ctrl+C`. Assert TUI exits gracefully.

#### Keyboard Interaction Tests — Repository-Wide Actions

23. **`repo-keyboard-s-stars-from-overview`** — On overview, press `s`. Assert star count increments.
24. **`repo-keyboard-s-stars-from-changes-tab`** — On Changes tab, press `s`. Assert star toggled.
25. **`repo-keyboard-s-stars-from-code-tab`** — On Code tab, press `s`. Assert star toggled.
26. **`repo-keyboard-c-copies-clone-url`** — Press `c`. Assert clipboard contains clone URL, status bar shows "Copied!".
27. **`repo-keyboard-c-clipboard-unavailable`** — On system without clipboard, press `c`. Assert status bar shows "Copy not available".
28. **`repo-keyboard-n-new-issue-from-issues-tab`** — On Issues tab, press `n`. Assert issue create form pushed.
29. **`repo-keyboard-n-noop-on-bookmarks-tab`** — On Bookmarks tab, press `n`. Assert no action.
30. **`repo-keyboard-R-retries-on-error`** — Trigger error state, press `R`. Assert retry initiated.
31. **`repo-keyboard-R-noop-when-loaded`** — No error state, press `R`. Assert no action.

#### Keyboard Interaction Tests — Go-To Mode

32. **`repo-keyboard-g-d-navigates-dashboard`** — Press `g`, then `d`. Assert dashboard loaded.
33. **`repo-keyboard-g-i-navigates-issues`** — Press `g`, then `i`. Assert issues list loaded with repo context.
34. **`repo-keyboard-g-r-navigates-repos`** — Press `g`, then `r`. Assert repo list loaded.
35. **`repo-keyboard-g-esc-cancels`** — Press `g`, then `Esc`. Assert go-to cancelled, repo screen still active.
36. **`repo-keyboard-g-q-cancels-and-pops`** — Press `g`, then `q`. Assert go-to cancelled AND screen popped.
37. **`repo-keyboard-g-g-scrolls-to-top`** — On scrolled-down list, press `g`, then `g`. Assert scrolled to top.
38. **`repo-keyboard-g-unknown-key-cancels`** — Press `g`, then `x`. Assert go-to cancelled silently.
39. **`repo-keyboard-g-timeout-cancels`** — Press `g`, wait 1600ms. Assert go-to cancelled.

#### Keyboard Interaction Tests — Suppression

40. **`repo-keyboard-keys-suppressed-during-input`** — Focus text input, press `s`. Assert `s` typed into input, star not toggled.
41. **`repo-keyboard-keys-suppressed-during-help`** — Open help (`?`), press `s`. Assert no star action.
42. **`repo-keyboard-keys-suppressed-during-palette`** — Open command palette (`:`), press `2`. Assert `2` typed into palette search.
43. **`repo-keyboard-esc-from-input-blurs`** — Focus text input, press `Esc`. Assert input blurred.
44. **`repo-keyboard-ctrl-c-from-input-quits`** — Focus text input, press `Ctrl+C`. Assert TUI exits.

#### Keyboard Interaction Tests — Context Switching

45. **`repo-keyboard-status-hints-update-on-tab-switch`** — On Bookmarks tab, press `2` (Changes). Assert status bar hints change.
46. **`repo-keyboard-status-hints-update-on-focus-change`** — On Code tab, press `Tab`. Assert status bar hints change to preview hints.
47. **`repo-keyboard-help-groups-update-on-tab-switch`** — On Changes tab, press `?`, close. Press `3` (Code), press `?`. Assert Code groups shown.

#### Keyboard Interaction Tests — Rapid Input

48. **`repo-keyboard-rapid-j-presses`** — Send `j` 20 times in <500ms. Assert cursor moved exactly 20 positions.
49. **`repo-keyboard-rapid-tab-switching`** — Send `1`–`6` in <200ms. Assert Settings tab active.
50. **`repo-keyboard-rapid-star-toggle`** — Press `s` twice in <100ms. Assert only one star request sent.
51. **`repo-keyboard-rapid-mixed-keys`** — Send `j`, `j`, `Enter`, `q` in <200ms. Assert: two scrolls, item opened, then popped.

#### Responsive Tests

52. **`repo-keyboard-hints-at-80x24`** — 80×24, Changes tab. Assert 3 hints. Snapshot matches.
53. **`repo-keyboard-hints-at-120x40`** — 120×40, Changes tab. Assert 6–8 hints. Snapshot matches.
54. **`repo-keyboard-hints-at-200x60`** — 200×60, Changes tab. Assert all hints. Snapshot matches.
55. **`repo-keyboard-help-at-80x24`** — 80×24, press `?`. Assert overlay 90% width, single column.
56. **`repo-keyboard-help-at-120x40`** — 120×40, press `?`. Assert overlay 70% width.
57. **`repo-keyboard-help-at-200x60`** — 200×60, press `?`. Assert overlay 60% width, two columns.
58. **`repo-keyboard-resize-updates-hints`** — 120×40 → 80×24. Assert hints reduced to 3.
59. **`repo-keyboard-resize-preserves-state`** — In go-to mode, resize. Assert go-to still active.
60. **`repo-keyboard-resize-help-adapts`** — Help open at 120×40, resize to 80×24. Assert overlay adapts.

#### Integration Tests

61. **`repo-keyboard-full-workflow-star-then-navigate`** — Star repo, then `g i`. Assert star persisted, issues loaded.
62. **`repo-keyboard-full-workflow-explore-code`** — Press `3`, `j`, `Enter`, `Tab`, `j`, `q`. Assert complete flow.
63. **`repo-keyboard-auth-expiry-during-action`** — Star returns 401. Assert app-shell auth error screen.
64. **`repo-keyboard-rate-limit-during-action`** — Star returns 429. Assert status bar shows rate limit.
65. **`repo-keyboard-permission-denied-on-create`** — Read-only user on Issues tab presses `n`. Assert "Permission denied".
66. **`repo-keyboard-deep-link-keybindings-active`** — Launch with `--screen repo --repo owner/repo --tab 2`. Assert keybindings functional.
67. **`repo-keyboard-back-navigation-restores-hints`** — Repo → issues (`g i`) → back (`q`). Assert hints restored.
68. **`repo-keyboard-help-overlay-scrollable`** — At 80×24, press `?`, press `j` 20 times. Assert help scrolls.
69. **`repo-keyboard-command-palette-repo-actions`** — Press `:`, type "star", press `Enter`. Assert star toggled.
70. **`repo-keyboard-concurrent-actions`** — Press `c` then `s`. Assert both complete independently.
