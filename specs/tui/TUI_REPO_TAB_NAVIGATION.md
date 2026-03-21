# TUI_REPO_TAB_NAVIGATION

Specification for TUI_REPO_TAB_NAVIGATION.

## High-Level User POV

The repository tab navigation is the primary mechanism for moving between the major sections of a repository's detail screen in the Codeplane TUI. When a user opens a repository (by pressing `Enter` on the repository list), they see the repository overview screen with a horizontal tab bar immediately below the repository header. This tab bar contains six tabs: **Bookmarks**, **Changes**, **Code**, **Conflicts**, **Op Log**, and **Settings**. The currently active tab is highlighted with reverse-video styling and an underline, making it immediately obvious which section is being viewed.

The interaction model is designed for speed and discoverability. The user can cycle through tabs with `Tab` (forward) and `Shift+Tab` (backward), which wraps at both ends — pressing `Tab` on Settings cycles back to Bookmarks, and pressing `Shift+Tab` on Bookmarks wraps to Settings. For direct access, the number keys `1` through `6` jump immediately to a specific tab: `1` for Bookmarks, `2` for Changes, `3` for Code, `4` for Conflicts, `5` for Op Log, `6` for Settings. The left/right arrow keys (`h`/`l` in vim style) also move between adjacent tabs when the tab bar has focus.

Each tab number is displayed as a small prefix in the tab label (e.g., `1:Bookmarks`, `2:Changes`), so the user always knows which number key maps to which tab. This labeling serves as a built-in cheat sheet and eliminates memorization burden. The tab bar also renders left and right scroll arrows (`◀` / `▶`) when the available terminal width cannot display all tabs simultaneously, which occurs at minimum terminal size (80×24).

When the user switches tabs, the content area below the tab bar replaces instantly (within a single render frame) with the selected tab's content. Tab switching is purely a client-side operation — the new tab panel mounts and begins its own data fetch. There is no full-screen loading state for the tab switch itself; instead, each tab panel manages its own loading state internally (skeleton, spinner, or content). This means the tab bar always remains interactive and responsive even while tab content is loading.

The active tab is preserved across terminal resize. If the user is on the "Conflicts" tab and resizes their terminal from 120×40 to 80×24, the Conflicts tab remains active and the tab bar re-layouts to fit the new width (truncating labels or scrolling as needed). Similarly, the active tab is preserved when navigating away from the repository screen and back: pressing `q` to return to the repo list and then re-entering the same repo restores the last-active tab.

At the minimum terminal width (80 columns), tab labels are abbreviated to fit: `1:Bkmk`, `2:Chng`, `3:Code`, `4:Cnfl`, `5:OpLg`, `6:Sett`. At standard width (120+ columns), full labels are shown. At large widths (200+ columns), tabs are rendered with additional horizontal padding for visual breathing room.

The tab bar integrates with the global help overlay: pressing `?` on any screen includes a "Repository Tabs" group listing all tab keybindings. The tab bar also integrates with the status bar: the left section of the status bar shows the current screen's keybinding hints, which include `Tab/Shift+Tab: switch tab` and `1-6: jump to tab`.

Tab navigation is suppressed when a modal, overlay, or text input has focus. Pressing `Tab` inside an issue creation form advances to the next form field, not the next repository tab. Number keys inside a text input are typed as characters, not interpreted as tab jumps. This context-sensitivity is automatic and requires no user configuration.

## Acceptance Criteria

### Tab Bar Rendering
- [ ] The tab bar renders exactly 6 tabs: Bookmarks (1), Changes (2), Code (3), Conflicts (4), Op Log (5), Settings (6)
- [ ] Each tab label includes its numeric prefix separated by a colon (e.g., `1:Bookmarks`)
- [ ] The active tab is rendered with reverse-video (swapped foreground/background) and an underline indicator
- [ ] Inactive tabs are rendered in `muted` color (ANSI 245)
- [ ] The tab bar occupies exactly 1 row of terminal height
- [ ] The tab bar is positioned immediately below the repository header and above the content area
- [ ] Tab labels are separated by at least 2 spaces
- [ ] The tab bar does not wrap to multiple lines at any terminal width

### Tab Cycling
- [ ] `Tab` moves focus to the next tab (left to right)
- [ ] `Shift+Tab` moves focus to the previous tab (right to left)
- [ ] `Tab` on the last tab (Settings) wraps to the first tab (Bookmarks)
- [ ] `Shift+Tab` on the first tab (Bookmarks) wraps to the last tab (Settings)
- [ ] Tab cycling takes effect within one render frame (<16ms)
- [ ] Tab cycling is suppressed when a text input has focus
- [ ] Tab cycling is suppressed when a modal or overlay is open

### Direct Jump by Number
- [ ] `1` jumps to Bookmarks tab
- [ ] `2` jumps to Changes tab
- [ ] `3` jumps to Code tab
- [ ] `4` jumps to Conflicts tab
- [ ] `5` jumps to Op Log tab
- [ ] `6` jumps to Settings tab
- [ ] `7`, `8`, `9`, `0` are ignored (no-op) — no error, no visual change
- [ ] Number keys are suppressed when a text input has focus
- [ ] Number keys are suppressed when a modal or overlay is open
- [ ] Jumping to the already-active tab is a no-op (no re-render, no data refetch)

### Arrow Key Navigation
- [ ] `l` / `Right` moves to the next tab (same as `Tab`, but does not wrap)
- [ ] `h` / `Left` moves to the previous tab (same as `Shift+Tab`, but does not wrap)
- [ ] `l` / `Right` on the last tab is a no-op
- [ ] `h` / `Left` on the first tab is a no-op
- [ ] Arrow keys are suppressed when a text input has focus

### Content Area Behavior
- [ ] Switching tabs replaces the content area below the tab bar
- [ ] Tab switch does not trigger a full-screen loading state
- [ ] Each tab panel manages its own loading/skeleton/error state
- [ ] Tab content is unmounted when switching away (not preserved in background)
- [ ] The content area fills all vertical space between the tab bar and the status bar

### Active Tab Persistence
- [ ] Active tab index is stored in navigation context for the current repository
- [ ] Navigating away (`q`) and re-entering the same repo restores the last-active tab
- [ ] Navigating to a different repo resets to the default tab (Bookmarks, index 0)
- [ ] Deep-link launch with `--tab` parameter opens the specified tab directly
- [ ] Active tab persists across terminal resize events

### Tab Bar Focus Model
- [ ] The tab bar is focusable as a single unit (not per-tab focus)
- [ ] When the content area has scroll focus, `Tab`/`Shift+Tab` still switch tabs (tab bar captures these keys globally within the repo screen)
- [ ] When a child form within a tab has focus, `Tab`/`Shift+Tab` navigate form fields, not repo tabs
- [ ] `Esc` from a focused form returns tab-level focus

### Responsive Label Truncation
- [ ] At 80–99 columns: abbreviated labels `1:Bkmk`, `2:Chng`, `3:Code`, `4:Cnfl`, `5:OpLg`, `6:Sett`
- [ ] At 100–119 columns: medium labels `1:Bookmarks`, `2:Changes`, `3:Code`, `4:Conflicts`, `5:OpLog`, `6:Settings`
- [ ] At 120–199 columns: full labels with standard spacing
- [ ] At 200+ columns: full labels with expanded padding (4 spaces between tabs)
- [ ] Scroll arrows (`◀`/`▶`) shown when tabs overflow available width (only at <80 columns, which is the unsupported range)

### Edge Cases
- [ ] Terminal below 80×24 shows "terminal too small" message; tab bar not rendered
- [ ] Rapid `Tab` presses (holding Tab) cycles through tabs sequentially without skipping
- [ ] Rapid number key presses (e.g., `1` `3` `5` in quick succession) lands on the last pressed (`5`)
- [ ] Terminal resize during tab transition does not crash or corrupt layout
- [ ] SSE disconnect does not affect tab navigation behavior
- [ ] API error on tab content fetch shows inline error in content area; tab bar remains interactive
- [ ] 401 response on tab content fetch shows auth error message; tab bar remains navigable

### Boundary Constraints
- [ ] Tab count is fixed at 6 (not dynamic)
- [ ] Tab label maximum length: 12 characters (full label including number prefix)
- [ ] Abbreviated label maximum length: 6 characters
- [ ] Tab bar total width: 6 tabs × 12 chars + 5 × 2-char gaps = 82 chars max at full labels
- [ ] Tab bar minimum width: 6 tabs × 6 chars + 5 × 2-char gaps = 46 chars min at abbreviated labels
- [ ] Active tab index range: 0–5 (clamped, never out of bounds)

## Design

### Screen Layout

```
┌─────────────────────────────────────────────────────────┐
│ Header: Dashboard > owner/repo          ● SYNCED  🔔 3  │
├─────────────────────────────────────────────────────────┤
│ owner/repo                          PUBLIC    ★ 42      │
│ Description text here...                                │
├─────────────────────────────────────────────────────────┤
│ [1:Bookmarks] 2:Changes  3:Code  4:Conflicts  5:OpLog  6:Settings │
├─────────────────────────────────────────────────────────┤
│                                                         │
│              Tab Content Area                           │
│         (scrollbox, screen-specific)                    │
│                                                         │
├─────────────────────────────────────────────────────────┤
│ Tab/S-Tab:switch  1-6:jump  s:star  q:back       ? help │
└─────────────────────────────────────────────────────────┘
```

### Component Structure

```jsx
<box flexDirection="column" height="100%">
  {/* Repository header — TUI_REPO_OVERVIEW handles this */}
  <RepoHeader repo={repo} />

  {/* Tab bar — this feature */}
  <box flexDirection="row" height={1} borderBottom="single" borderColor="border">
    {tabs.map((tab, index) => (
      <text
        key={tab.id}
        bold={index === activeIndex}
        inverse={index === activeIndex}
        underline={index === activeIndex}
        color={index === activeIndex ? "primary" : "muted"}
      >
        {formatTabLabel(tab, index, terminalWidth)}
      </text>
    ))}
  </box>

  {/* Tab content area */}
  <scrollbox flexGrow={1}>
    {activeIndex === 0 && <BookmarksView repo={repo} />}
    {activeIndex === 1 && <ChangesView repo={repo} />}
    {activeIndex === 2 && <CodeExplorerView repo={repo} />}
    {activeIndex === 3 && <ConflictsView repo={repo} />}
    {activeIndex === 4 && <OperationLogView repo={repo} />}
    {activeIndex === 5 && <SettingsView repo={repo} />}
  </scrollbox>
</box>
```

### Tab Definition Array

```typescript
const REPO_TABS = [
  { id: "bookmarks",  label: "Bookmarks", short: "Bkmk", key: "1" },
  { id: "changes",    label: "Changes",   short: "Chng", key: "2" },
  { id: "code",       label: "Code",      short: "Code", key: "3" },
  { id: "conflicts",  label: "Conflicts", short: "Cnfl", key: "4" },
  { id: "oplog",      label: "Op Log",    short: "OpLg", key: "5" },
  { id: "settings",   label: "Settings",  short: "Sett", key: "6" },
] as const;
```

### Keybinding Reference

**Tab switching (active when repo screen has tab-level focus):**

| Key | Action |
|-----|--------|
| `Tab` | Next tab (wraps) |
| `Shift+Tab` | Previous tab (wraps) |
| `1` | Jump to Bookmarks |
| `2` | Jump to Changes |
| `3` | Jump to Code |
| `4` | Jump to Conflicts |
| `5` | Jump to Op Log |
| `6` | Jump to Settings |
| `h` / `Left` | Previous tab (no wrap) |
| `l` / `Right` | Next tab (no wrap) |

**Suppression rules:**
- All tab keybindings are suppressed when a `<input>` or `<textarea>` has focus
- All tab keybindings are suppressed when the help overlay, command palette, or any modal is open
- `Tab`/`Shift+Tab` within a child form navigates form fields, not repo tabs
- Number keys within a text input are passed through as characters

### Keybinding Handler Flow

```
keypress event on repo screen
  ├─ Text input focused? → pass through to input
  ├─ Overlay/modal open? → pass to overlay handler
  ├─ Key is Tab? → setActiveIndex((activeIndex + 1) % 6)
  ├─ Key is Shift+Tab? → setActiveIndex((activeIndex + 5) % 6)
  ├─ Key is 1–6? → setActiveIndex(parseInt(key) - 1)
  ├─ Key is 7–9 or 0? → no-op
  ├─ Key is l/Right? → setActiveIndex(Math.min(activeIndex + 1, 5))
  ├─ Key is h/Left? → setActiveIndex(Math.max(activeIndex - 1, 0))
  └─ Other → pass to content area or global handler
```

### Responsive Behavior

| Terminal Width | Label Format | Tab Spacing | Scroll Arrows |
|---------------|-------------|-------------|---------------|
| < 80 | N/A (unsupported) | N/A | N/A |
| 80–99 cols | `1:Bkmk` (abbreviated) | 2 spaces | No |
| 100–119 cols | `1:Bookmarks` (medium) | 2 spaces | No |
| 120–199 cols | `1:Bookmarks` (full) | 2 spaces | No |
| 200+ cols | `1:Bookmarks` (full) | 4 spaces | No |

Label format selection:

```typescript
function formatTabLabel(
  tab: RepoTab,
  index: number,
  terminalWidth: number
): string {
  const num = index + 1;
  if (terminalWidth < 100) return `${num}:${tab.short}`;
  return `${num}:${tab.label}`;
}
```

### Data Hooks

| Hook | Source | Purpose |
|------|--------|---------|
| `useKeyboard()` | `@opentui/react` | Capture Tab, Shift+Tab, number keys, arrow keys |
| `useTerminalDimensions()` | `@opentui/react` | Determine label format and tab spacing |
| `useOnResize()` | `@opentui/react` | Re-layout tab bar on terminal resize |
| `useNavigation()` | Local TUI | Read/write `activeTabIndex` in navigation context |
| `useRepo()` | `@codeplane/ui-core` | Fetch repository data for the header |
| `useBookmarks()` | `@codeplane/ui-core` | Tab 1: Bookmarks list (consumed by child) |
| `useChanges()` | `@codeplane/ui-core` | Tab 2: Changes list (consumed by child) |
| `useRepoTree()` | `@codeplane/ui-core` | Tab 3: Code explorer file tree (consumed by child) |
| `useConflicts()` | `@codeplane/ui-core` | Tab 4: Conflicts list (consumed by child) |
| `useOperationLog()` | `@codeplane/ui-core` | Tab 5: Operation log (consumed by child) |
| `useRepoSettings()` | `@codeplane/ui-core` | Tab 6: Repository settings (consumed by child) |

The tab navigation component itself only uses `useKeyboard`, `useTerminalDimensions`, `useOnResize`, and `useNavigation`. The `@codeplane/ui-core` data hooks are consumed by the individual tab content panels, not by the tab bar.

### Status Bar Hints

When the repository screen is active at tab-level focus:
```
Tab/S-Tab:switch tab  1-6:jump  s:star  c:clone  q:back
```

When a child panel has internal focus (e.g., scrolling a list within a tab):
```
j/k:scroll  Enter:select  Tab:switch tab  q:back
```

### Help Overlay — Repository Tabs Group

```
── Repository Tabs ──────────────────
Tab / Shift+Tab    Cycle tabs
1                  Bookmarks
2                  Changes
3                  Code
4                  Conflicts
5                  Op Log
6                  Settings
h / Left           Previous tab
l / Right          Next tab
```

## Permissions & Security

### Authorization
- Tab navigation is a client-side UI mechanism and requires no specific authorization role
- All authenticated users who can view the repository can navigate between tabs
- Authorization for tab content is enforced at the API layer when individual tab data hooks execute
- Settings tab (tab 6) content may render an "insufficient permissions" message for non-admin users, but the tab itself is always navigable
- Read-only collaborators can navigate to all tabs; write-only actions within tabs are disabled per-component

### Token-Based Auth
- Tab navigation does not read, transmit, display, or log any auth tokens
- Token state does not affect tab switching behavior
- The TUI uses token-based auth from CLI keychain or `CODEPLANE_TOKEN` env var — no OAuth browser flow is triggered by tab navigation
- If the auth token expires while on a tab, subsequent data fetches within tab panels show "Session expired. Run `codeplane auth login` to re-authenticate." The tab bar remains interactive.

### Rate Limiting
- Tab switching itself generates zero API requests — it only remounts React components
- Each tab panel's data hooks may trigger API requests on mount, subject to standard rate limits (5,000 req/hr authenticated, 60 req/hr unauthenticated)
- Rapid tab switching (e.g., pressing 1-2-3-4-5-6 in quick succession) causes each panel to mount and potentially fire a fetch, then unmount. The last-mounted panel's fetch completes; others are cancelled via AbortController
- No client-side rate limiting is needed for tab switching; the unmount-on-switch pattern naturally prevents request accumulation

### Input Validation
- Active tab index is clamped to 0–5. Values outside this range are ignored.
- Tab IDs come from a hardcoded constant array, not from user input or API responses.
- No user-provided text is executed or passed to the API by the tab navigation mechanism itself.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `tui.repo.tab_switched` | User switches to a different tab | `repo_id`, `repo_full_name`, `from_tab`, `to_tab`, `switch_method` (`cycle`, `number`, `arrow`), `tab_index` |
| `tui.repo.tab_viewed` | Tab content becomes visible (after data load) | `repo_id`, `repo_full_name`, `tab_id`, `tab_index`, `load_time_ms`, `from_cache` |
| `tui.repo.tab_error` | Tab content fails to load | `repo_id`, `repo_full_name`, `tab_id`, `tab_index`, `error_code`, `error_message` |

### Common Event Properties

All events include: `session_id`, `timestamp` (ISO 8601), `terminal_width`, `terminal_height`, `viewer_id`

### Success Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Tab switch adoption | >50% of repo sessions | % of repo detail sessions that use tab navigation |
| Number-key jump rate | >30% of tab switches | % of switches using number keys (power-user adoption) |
| Tab cycle rate | >40% of tab switches | % using Tab/Shift+Tab (discoverability) |
| Arrow key rate | <30% of tab switches | Arrow keys as alternative navigation |
| Most-visited tab | Track distribution | Which tabs are most/least used (informs tab ordering) |
| Tab switch latency (p50) | <16ms | Render frame time for tab switch |
| Tab content load (p50) | <200ms | Time from tab switch to content visible |
| Settings tab error rate | Track | % of Settings tab visits resulting in permission errors |
| Tab switches per session | >2 per repo session | Users exploring multiple tabs |

## Observability

### Logging Requirements

| Log Level | Event | Message Format |
|-----------|-------|----------------|
| `debug` | Tab switched | `RepoTabs: switched [repo={full_name}] [from={from_tab}] [to={to_tab}] [method={method}]` |
| `debug` | Tab content mount | `RepoTabs: content mount [repo={full_name}] [tab={tab_id}]` |
| `debug` | Tab key suppressed | `RepoTabs: key suppressed [key={key}] [reason={reason}]` (input_focused, overlay_open) |
| `info` | Tab content loaded | `RepoTabs: content loaded [repo={full_name}] [tab={tab_id}] [load_time_ms={ms}]` |
| `warn` | Tab content fetch failed | `RepoTabs: fetch failed [repo={full_name}] [tab={tab_id}] [error_code={code}] [error={msg}]` |
| `error` | Tab render error | `RepoTabs: render error [repo={full_name}] [tab={tab_id}] [error={msg}] [stack={trace}]` |

Logs written to stderr. Level controlled by `CODEPLANE_LOG_LEVEL` (default: `warn`).

### Error Cases

| Error Case | Detection | Recovery |
|------------|-----------|----------|
| Terminal resize during tab switch | `useOnResize()` fires mid-render | Re-layout tab bar. Active tab preserved. Labels may change format. |
| SSE disconnect while on streaming tab | SSE provider emits disconnect | Sync indicator updates. Tab bar unaffected. Streaming content shows "Reconnecting..." |
| API 401 on tab content fetch | Data hook returns 401 | Content area shows auth error message. Tab bar remains interactive. User can switch tabs. |
| API 500 on tab content fetch | Data hook returns 500 | Content area shows "Error loading {tab}. Press R to retry." Tab bar interactive. |
| API timeout on tab content fetch | Data hook timeout (10s) | Content area shows timeout message. Tab bar interactive. Press `R` to retry. |
| Rapid tab switching causes abandoned fetches | AbortController cancellation | Silently cancelled. No error displayed. Last-switched-to tab loads normally. |
| Tab index out of range (bug) | Clamped to 0–5 | Logs error. Falls back to tab 0 (Bookmarks). No crash. |
| Tab content component throws | React error boundary per-tab | Error message in content area. Tab bar remains interactive. Other tabs unaffected. |
| Navigation context lost (unmount) | Context provider check | Falls back to default tab (0). Logs warning. |

### Failure Modes

- **Stuck tab state**: Active index is a simple integer in React state. If the component re-renders, state is consistent. No timeout needed.
- **Content area blank after switch**: Each tab panel has its own loading state. If mount fails, the per-tab error boundary catches it.
- **Tab bar unresponsive**: `useKeyboard` handler is registered at mount. If handler stops firing, the TUI-level error boundary captures the React error.
- **Memory accumulation from rapid switching**: Tab content is unmounted (not hidden) on switch. React cleanup runs. AbortController cancels pending fetches.

## Verification

### Test File: `e2e/tui/repository.test.ts`

All tests use `@microsoft/tui-test`. Tests that fail due to unimplemented backends are left failing (never skipped).

#### Terminal Snapshot Tests

1. **`repo-tab-bar-default-state`** — Navigate to a repo at 120×40. Snapshot. Assert tab bar visible with 6 tabs. Bookmarks tab active (reverse video). Other tabs in muted color.
2. **`repo-tab-bar-changes-active`** — Navigate to repo. Press `2`. Snapshot. Assert Changes tab active. Bookmarks tab muted. Content area shows changes view.
3. **`repo-tab-bar-code-active`** — Navigate to repo. Press `3`. Snapshot. Assert Code tab active with code explorer content.
4. **`repo-tab-bar-conflicts-active`** — Navigate to repo. Press `4`. Snapshot. Assert Conflicts tab active.
5. **`repo-tab-bar-oplog-active`** — Navigate to repo. Press `5`. Snapshot. Assert Op Log tab active.
6. **`repo-tab-bar-settings-active`** — Navigate to repo. Press `6`. Snapshot. Assert Settings tab active.
7. **`repo-tab-bar-abbreviated-80col`** — Navigate to repo at 80×24. Snapshot. Assert abbreviated labels (`1:Bkmk`, `2:Chng`, etc.). All 6 tabs visible. No overflow.
8. **`repo-tab-bar-full-labels-120col`** — Navigate to repo at 120×40. Snapshot. Assert full labels (`1:Bookmarks`, `2:Changes`, etc.).
9. **`repo-tab-bar-expanded-200col`** — Navigate to repo at 200×60. Snapshot. Assert full labels with expanded spacing.
10. **`repo-tab-bar-number-prefix-visible`** — Navigate to repo at 120×40. Snapshot. Assert each tab label starts with `N:` where N is the tab number.
11. **`repo-tab-bar-underline-active-tab`** — Navigate to repo. Press `3`. Snapshot. Assert Code tab has underline styling.
12. **`repo-tab-bar-content-loading-state`** — Navigate to repo. Press `2` (Changes). Snapshot before data arrives. Assert tab bar shows Changes active. Content area shows loading indicator.

#### Keyboard Interaction Tests — Tab Cycling

13. **`repo-tab-cycle-forward`** — Navigate to repo (Bookmarks active). Press `Tab`. Assert Changes tab active (index 1).
14. **`repo-tab-cycle-forward-twice`** — Press `Tab` twice. Assert Code tab active (index 2).
15. **`repo-tab-cycle-backward`** — Navigate to repo. Press `Shift+Tab`. Assert Settings tab active (wrapped to index 5).
16. **`repo-tab-cycle-forward-wrap`** — Navigate to repo. Press `6` (Settings). Press `Tab`. Assert Bookmarks active (wrapped to index 0).
17. **`repo-tab-cycle-backward-wrap`** — Navigate to repo (Bookmarks active). Press `Shift+Tab`. Assert Settings active (index 5).
18. **`repo-tab-full-cycle-forward`** — Press `Tab` 6 times. Assert back to Bookmarks (index 0).
19. **`repo-tab-full-cycle-backward`** — Press `Shift+Tab` 6 times. Assert back to Bookmarks (index 0).

#### Keyboard Interaction Tests — Number Jump

20. **`repo-tab-jump-1`** — Navigate to repo. Press `3` then `1`. Assert Bookmarks active.
21. **`repo-tab-jump-2`** — Press `2`. Assert Changes active.
22. **`repo-tab-jump-3`** — Press `3`. Assert Code active.
23. **`repo-tab-jump-4`** — Press `4`. Assert Conflicts active.
24. **`repo-tab-jump-5`** — Press `5`. Assert Op Log active.
25. **`repo-tab-jump-6`** — Press `6`. Assert Settings active.
26. **`repo-tab-jump-7-noop`** — Press `7`. Assert no change (still on previous tab).
27. **`repo-tab-jump-8-noop`** — Press `8`. Assert no change.
28. **`repo-tab-jump-9-noop`** — Press `9`. Assert no change.
29. **`repo-tab-jump-0-noop`** — Press `0`. Assert no change.
30. **`repo-tab-jump-same-tab-noop`** — On Bookmarks (index 0). Press `1`. Assert no re-render. Content unchanged.

#### Keyboard Interaction Tests — Arrow Keys

31. **`repo-tab-arrow-right`** — On Bookmarks. Press `l`. Assert Changes active.
32. **`repo-tab-arrow-left`** — On Changes. Press `h`. Assert Bookmarks active.
33. **`repo-tab-arrow-right-no-wrap`** — On Settings (index 5). Press `l`. Assert still Settings (no wrap).
34. **`repo-tab-arrow-left-no-wrap`** — On Bookmarks (index 0). Press `h`. Assert still Bookmarks (no wrap).
35. **`repo-tab-arrow-right-key`** — On Bookmarks. Press `Right`. Assert Changes active.
36. **`repo-tab-arrow-left-key`** — On Changes. Press `Left`. Assert Bookmarks active.

#### Keyboard Interaction Tests — Suppression

37. **`repo-tab-suppressed-during-input`** — Open issue create form within repo. Press `Tab`. Assert form field advances, not tab switch.
38. **`repo-tab-number-suppressed-during-input`** — Focus a text input. Press `3`. Assert `3` typed into input, not tab switch.
39. **`repo-tab-suppressed-during-help-overlay`** — Press `?`. Press `Tab`. Assert help overlay scrolls, not tab switch.
40. **`repo-tab-suppressed-during-command-palette`** — Press `:`. Press `2`. Assert `2` in palette search, not tab switch.

#### Keyboard Interaction Tests — Content Area

41. **`repo-tab-switch-replaces-content`** — On Bookmarks (assert bookmarks content). Press `2`. Assert changes content visible. Bookmarks content gone.
42. **`repo-tab-switch-preserves-tab-bar`** — Switch through all 6 tabs. Assert tab bar always visible and correct tab highlighted.
43. **`repo-tab-content-error-does-not-break-tabs`** — Navigate to tab that returns API error. Assert error in content area. Press `1`. Assert Bookmarks loads normally.

#### Active Tab Persistence Tests

44. **`repo-tab-persists-across-back-navigation`** — Press `3` (Code). Press `q` (back to list). Press `Enter` on same repo. Assert Code tab active.
45. **`repo-tab-resets-for-different-repo`** — Press `4` (Conflicts) on repo A. Press `q`. Navigate to repo B. Assert Bookmarks active (index 0).
46. **`repo-tab-persists-across-resize`** — Press `3` (Code) at 120×40. Resize to 80×24. Assert Code tab still active. Labels abbreviated.

#### Rapid Input Tests

47. **`repo-tab-rapid-number-keys`** — Press `1` `3` `5` in rapid succession (<50ms between). Assert Op Log active (index 4, last pressed).
48. **`repo-tab-rapid-tab-cycling`** — Hold `Tab` key for 10 repeat events. Assert active tab advanced by 10 (mod 6) = tab at index 4.
49. **`repo-tab-rapid-mixed-input`** — Press `Tab`, `3`, `Shift+Tab`, `5` rapidly. Assert Op Log active (last effective input).

#### Responsive Tests

50. **`repo-tab-bar-at-80x24`** — 80×24. Navigate to repo. Assert all 6 tabs visible with abbreviated labels. Active tab styled. Content area fills remaining height.
51. **`repo-tab-bar-at-120x40`** — 120×40. Navigate to repo. Assert full labels. Standard spacing.
52. **`repo-tab-bar-at-200x60`** — 200×60. Navigate to repo. Assert full labels with expanded padding.
53. **`repo-tab-resize-120-to-80`** — Start at 120×40 on Code tab. Resize to 80×24. Assert Code still active. Labels switch to abbreviated.
54. **`repo-tab-resize-80-to-120`** — Start at 80×24 on Conflicts tab. Resize to 120×40. Assert Conflicts still active. Labels switch to full.
55. **`repo-tab-resize-below-minimum`** — Start at 80×24. Resize to 60×20. Assert "terminal too small" message. Resize back to 80×24. Assert repo screen restored with previous active tab.

#### Integration Tests

56. **`repo-tab-help-overlay-includes-tabs`** — Press `?`. Assert "Repository Tabs" group with all 6 entries listed.
57. **`repo-tab-status-bar-hints`** — Navigate to repo. Assert status bar shows `Tab/S-Tab:switch tab` and `1-6:jump`.
58. **`repo-tab-goto-preserves-tab`** — On Code tab (index 2). Press `g i` (go-to Issues). Press `q` back to repo. Assert Code tab still active.
59. **`repo-tab-deep-link-default`** — Launch `codeplane tui --screen repo --repo owner/repo`. Assert Bookmarks tab active.
60. **`repo-tab-with-api-error-on-mount`** — Navigate to repo with API returning 500 on bookmarks fetch. Assert tab bar renders. Content shows error. Can switch to other tabs.
