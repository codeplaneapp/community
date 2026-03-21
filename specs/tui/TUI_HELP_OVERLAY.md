# TUI_HELP_OVERLAY

Specification for TUI_HELP_OVERLAY.

## High-Level User POV

When a terminal user presses `?` on any screen in the Codeplane TUI, a help overlay appears as a centered modal panel on top of the current content. This overlay shows every keybinding available in the user's current context — both the global keybindings that work everywhere (like `:` for command palette, `q` for back, and the `g`-prefixed go-to shortcuts) and the screen-specific keybindings relevant to whatever the user is currently doing (for example, `]`/`[` for file navigation while viewing a diff, or `j`/`k` for scrolling through an issue list).

The overlay organizes keybindings into labeled groups so the user can quickly scan for what they need. Global keybindings appear first under a "Global" heading, followed by screen-specific groups like "Navigation," "Actions," or "Diff Controls" depending on the active screen. Each row shows the key or key combination on the left and a short human-readable description on the right, formatted as a clean two-column table.

If the list of keybindings exceeds the visible height of the overlay, the user can scroll through them with `j`/`k` or arrow keys. The overlay is dismissed by pressing `Esc` or `?` again (toggle behavior). While the overlay is open, all other keybindings are suppressed — focus is trapped within the modal so the user cannot accidentally trigger navigation or actions underneath.

The status bar at the bottom of the TUI always shows a subtle `? Help` hint on the right side, making the help overlay discoverable even for first-time users. The overlay itself renders a title bar reading "Keybindings" at the top and a footer hint reading "Esc to close" at the bottom, providing clear orientation.

At small terminal sizes (80×24), the overlay expands to fill nearly the entire screen (90% width and height) so that keybinding text is not truncated. At standard and large terminal sizes, it occupies 60% of the terminal, leaving the underlying screen partially visible as dimmed context. The overlay responds to terminal resize events in real time — if the user resizes their terminal while the overlay is open, the layout adjusts immediately without closing or losing scroll position.

## Acceptance Criteria

- **Toggle activation**: Pressing `?` on any screen opens the help overlay. Pressing `?` again while the overlay is open closes it.
- **Esc dismissal**: Pressing `Esc` while the help overlay is open closes the overlay and returns focus to the underlying screen.
- **Focus trapping**: While the help overlay is open, all keybindings except `?`, `Esc`, `j`/`k`/Up/Down (for scrolling within the overlay), `G`/`g g` (jump to bottom/top of list), `Ctrl+D`/`Ctrl+U` (page down/up), and `Ctrl+C` (quit) are suppressed.
- **Global keybindings always shown**: The overlay always displays the global keybinding section containing: `?` (toggle help), `:` (command palette), `q` (back/quit), `Esc` (close overlay/back), `Ctrl+C` (quit), and all `g`-prefixed go-to shortcuts.
- **Screen-specific keybindings**: The overlay dynamically includes keybindings specific to the currently active screen. For example, diff navigation keys when on the diff viewer, list navigation keys when on a list view, form interaction keys when on a form.
- **Grouped display**: Keybindings are organized into labeled groups (e.g., "Global", "Navigation", "Go To", "Actions", "Diff", "Search"). Each group has a visible heading.
- **Two-column layout**: Each keybinding row shows the key/combo left-aligned and the description right-aligned (or left-aligned in a second column), with consistent column widths.
- **Key display formatting**: Keys are displayed in a readable format: `Ctrl+C` (not `^C`), `Shift+Tab` (not `S-Tab`), `Esc` (not `escape`), `Space` (not ` `). Modifier keys use `+` separator. Go-to sequences show as `g d`, `g i`, etc.
- **Scrollable content**: When the keybinding list exceeds the overlay's visible height, a `<scrollbox>` enables scrolling with `j`/`k`/Up/Down keys. A scroll position indicator is shown (e.g., "1-20 of 35").
- **Maximum key label length**: Key combination labels are truncated at 20 characters. Description text is truncated with `…` at the available column width minus key column width minus padding.
- **Minimum terminal size (80×24)**: Overlay renders at 90% width × 90% height. Group headings are still visible. Descriptions truncate as needed. The overlay is fully usable.
- **Standard terminal size (120×40)**: Overlay renders at 60% width × 60% height. All content displays without truncation for standard-length descriptions (≤60 characters).
- **Large terminal size (200×60)**: Overlay renders at 60% width × 60% height with additional padding and visual breathing room.
- **Terminal too small (<80×24)**: If the terminal is below minimum size, the overlay still renders but fills 100% of available space and shows a condensed format (key and description on the same line, separated by a dash).
- **Resize handling**: Terminal resize while the overlay is open triggers an immediate re-layout. The overlay adjusts its dimensions and content wrapping. Scroll position is preserved (clamped to valid range if content reflowed).
- **No color fallback**: On 16-color or no-color terminals, the overlay uses reverse video for the header and plain text for content. Border uses ASCII `+`, `-`, `|` fallback if Unicode box-drawing is unsupported.
- **Rapid key input**: Pressing `?` rapidly (multiple times within 100ms) does not produce flickering or inconsistent state. The overlay toggles deterministically based on the final state.
- **No data dependency**: The help overlay requires no API calls, no network access, and no authentication. It renders entirely from local keybinding registry data.
- **Overlay z-index**: The help overlay renders above all other content, including the header bar and status bar. If the command palette is open, pressing `?` closes the command palette and opens the help overlay (or vice versa — only one overlay is visible at a time).
- **Accessibility**: Every keybinding entry is readable as plain text. No reliance on color alone to convey meaning — structural formatting (columns, headings) provides the information hierarchy.

## Design

### Screen Layout

```
┌─────────────────────────────────────────────────────┐
│  Keybindings                              Esc close │  ← Title bar
├─────────────────────────────────────────────────────┤
│                                                     │
│  Global                                             │  ← Group heading
│  ────────────────────────────────────────────────── │
│  ?              Toggle help overlay                 │
│  :              Open command palette                │
│  q              Back / quit                         │
│  Esc            Close overlay or back               │
│  Ctrl+C         Quit immediately                    │
│                                                     │
│  Go To                                              │  ← Group heading
│  ────────────────────────────────────────────────── │
│  g d            Dashboard                           │
│  g i            Issues                              │
│  g l            Landings                            │
│  g r            Repositories                        │
│  ...                                                │
│                                                     │
│  Navigation                                         │  ← Screen-specific
│  ────────────────────────────────────────────────── │
│  j / Down       Move cursor down                    │
│  k / Up         Move cursor up                      │
│  Enter          Open selected item                  │
│  ...                                                │
│  1-20 of 35                                         │  ← Scroll indicator
└─────────────────────────────────────────────────────┘
```

### Component Structure (OpenTUI + React 19)

The overlay is rendered at the app shell level as a conditionally mounted component:

```tsx
<box
  position="absolute"
  top="center"
  left="center"
  width={isSmallTerminal ? "90%" : "60%"}
  height={isSmallTerminal ? "90%" : "60%"}
  border={true}
  borderStyle="single"
  zIndex={100}
  backgroundColor="surface"
>
  <box flexDirection="row" justifyContent="space-between" paddingX={1}>
    <text bold color="primary">Keybindings</text>
    <text color="muted">Esc to close</text>
  </box>
  <text color="border">{"─".repeat(overlayWidth - 2)}</text>
  <scrollbox flexGrow={1}>
    <box flexDirection="column" gap={1}>
      {keybindingGroups.map(group => (
        <box key={group.name} flexDirection="column">
          <text bold color="primary">{group.name}</text>
          <text color="border">{"─".repeat(contentWidth)}</text>
          {group.bindings.map(binding => (
            <box key={binding.key} flexDirection="row">
              <text width={keyColumnWidth} color="warning">{formatKeyDisplay(binding.key)}</text>
              <text color="muted">{truncate(binding.description, descColumnWidth)}</text>
            </box>
          ))}
        </box>
      ))}
    </box>
  </scrollbox>
  <box flexDirection="row" justifyContent="flex-end" paddingX={1}>
    <text color="muted">{scrollStart + 1}-{Math.min(scrollStart + visibleRows, totalRows)} of {totalRows}</text>
  </box>
</box>
```

### Keybindings for the Help Overlay

| Key | Action |
|-----|--------|
| `?` | Close help overlay (toggle off) |
| `Esc` | Close help overlay |
| `j` / `Down` | Scroll down one row |
| `k` / `Up` | Scroll up one row |
| `G` | Jump to bottom of keybinding list |
| `g g` | Jump to top of keybinding list |
| `Ctrl+D` | Page down |
| `Ctrl+U` | Page up |
| `Ctrl+C` | Quit TUI (global, always active) |

All other keys are suppressed while the overlay is open.

### Keybinding Registry Model

Each screen registers its keybindings via a `HelpOverlayContext` React context:

```typescript
interface KeybindingEntry {
  key: string           // Display format: "j / Down", "Ctrl+S", "g d"
  description: string   // Human-readable: "Move cursor down", "Save form"
  group: string         // Group name: "Navigation", "Actions", "Diff"
}

interface KeybindingGroup {
  name: string
  bindings: KeybindingEntry[]
}
```

The help overlay collects keybindings by: (1) always including the hardcoded global keybinding group, (2) always including the go-to keybinding group, (3) querying the current active screen's registered keybinding groups via `HelpOverlayContext`, (4) merging and deduplicating (global entries take precedence on key collision).

### Responsive Behavior

| Terminal Size | Overlay Width | Overlay Height | Key Column | Notes |
|--------------|---------------|----------------|------------|-------|
| <80×24 | 100% | 100% | 14 chars | Condensed single-line format |
| 80×24 – 119×39 | 90% | 90% | 16 chars | Truncate descriptions >40 chars |
| 120×40 – 199×59 | 60% | 60% | 18 chars | Full display |
| 200×60+ | 60% | 60% | 20 chars | Extra padding, relaxed spacing |

On resize: `useOnResize()` triggers re-render. `useTerminalDimensions()` provides current `{ columns, rows }`. Scroll position is clamped to valid range.

### Data Hooks

The help overlay does **not** consume any `@codeplane/ui-core` data hooks. It is entirely local:

- **`useKeyboard`** (OpenTUI): Captures `?` key at the global level to toggle overlay state, and captures scroll keys when overlay is open.
- **`useTerminalDimensions`** (OpenTUI): Reads terminal columns and rows for responsive sizing.
- **`useOnResize`** (OpenTUI): Triggers re-layout on terminal size change.
- **`HelpOverlayContext`** (custom React context): Screens register/unregister keybinding groups. Provides `isOpen` and `toggle()` state.

### Interaction with Other Overlays

- If the command palette (`:`) is open when `?` is pressed, the command palette closes and the help overlay opens.
- If the help overlay is open when `:` is pressed, the key is suppressed.
- Only one overlay is visible at any time via an `OverlayManager` context tracking `null | "help" | "command-palette"`.

## Permissions & Security

### Authorization

- **No authorization required.** The help overlay displays static keybinding metadata compiled into the TUI. It does not fetch, display, or transmit any user data, repository data, or server-side state.
- The help overlay is available regardless of authentication state. Even if the user's token is expired or missing, the help overlay functions normally.

### Rate Limiting

- **Not applicable.** The help overlay makes zero API calls. There is no network activity to rate-limit.

### Token-Based Auth

- **Not applicable.** The help overlay operates entirely client-side in the terminal process. No tokens are read, validated, or transmitted.

### Security Considerations

- The help overlay must not display sensitive information (tokens, credentials, server URLs) in any keybinding description.
- Keybinding descriptions are developer-authored static strings, not user-generated content, so there is no injection risk.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Description | Trigger |
|------------|-------------|--------|
| `tui.help_overlay.opened` | User opened the help overlay | `?` pressed, overlay transitions from closed to open |
| `tui.help_overlay.closed` | User closed the help overlay | `Esc` or `?` pressed, overlay transitions from open to closed |
| `tui.help_overlay.scrolled` | User scrolled within the help overlay | Any scroll key (`j`, `k`, `G`, `g g`, `Ctrl+D`, `Ctrl+U`) while overlay is open |

### Event Properties

**`tui.help_overlay.opened`**:
- `screen`: string — the active screen when help was opened (e.g., `"dashboard"`, `"issues"`, `"diff"`)
- `terminal_columns`: number — terminal width at time of open
- `terminal_rows`: number — terminal height at time of open
- `total_keybindings`: number — total number of keybinding entries displayed
- `group_count`: number — number of keybinding groups displayed

**`tui.help_overlay.closed`**:
- `screen`: string — the active screen
- `close_method`: `"escape"` | `"toggle"` — how the user closed the overlay
- `duration_ms`: number — how long the overlay was open
- `scrolled`: boolean — whether the user scrolled at all during this session

**`tui.help_overlay.scrolled`**:
- `screen`: string — the active screen
- `scroll_direction`: `"up"` | `"down"` | `"top"` | `"bottom"` | `"page_up"` | `"page_down"`

### Success Indicators

- **Adoption**: Percentage of TUI sessions where the help overlay is opened at least once.
- **Discovery**: Frequency of help overlay opens per session, segmented by new vs. returning users.
- **Effectiveness**: Average time the overlay remains open (shorter over time suggests users learn keybindings and need help less frequently).
- **Screen coverage**: Distribution of `screen` values across help overlay open events (identifies which screens users find most confusing).
- **Scroll depth**: Percentage of users who scroll within the overlay (indicates whether all keybindings fit on screen or users need to hunt).

## Observability

### Logging Requirements

| Log Level | Event | Details |
|-----------|-------|---------|
| `debug` | Help overlay toggled | `{ action: "open" \| "close", screen, keybindingCount }` |
| `debug` | Keybinding groups registered | `{ screen, groups: string[], totalBindings: number }` |
| `warn` | Keybinding collision detected | `{ key, existingGroup, newGroup }` — when a screen registers a key that conflicts with global bindings |
| `debug` | Overlay resize triggered | `{ newColumns, newRows, newWidth, newHeight }` |

### Error Cases

| Error Case | Detection | Recovery |
|------------|-----------|----------|
| Terminal resize during overlay open | `useOnResize` callback fires | Re-render overlay at new dimensions. Clamp scroll position. No user action required. |
| Terminal shrinks below minimum during overlay | `columns < 20 \|\| rows < 5` | Collapse overlay to full-screen single-column mode. Show as many entries as fit. |
| React render error in overlay | Error boundary at overlay component level | Close overlay, log error, show brief error flash in status bar: "Help overlay error — press ? to retry". |
| Screen unmounts while overlay is open | Screen's `useEffect` cleanup calls `unregisterKeybindings()` | Overlay continues showing global keybindings. Screen-specific section gracefully disappears. |
| Keybinding registry returns empty groups | Groups array has length 0 for a screen | Overlay shows only global keybindings with no screen-specific section. No error displayed. |
| Rapid toggle (debounce) | Multiple `?` presses within 50ms | State settles on final value. No intermediate renders. React batching handles this naturally. |

### Failure Modes

- **Overlay fails to render**: If the overlay component throws during render, the error boundary catches it. The underlying screen remains functional. The user can continue working and retry `?` later.
- **Focus not restored on close**: If focus fails to return to the underlying screen after overlay dismissal, the app shell's focus manager re-focuses the active screen on the next keypress. This is a graceful degradation — the user may need to press a key to "wake up" focus.
- **Memory**: The help overlay component is unmounted (not hidden) when closed. No keybinding data or scroll state is retained between opens. This keeps memory stable during long sessions.

## Verification

### Test File: `e2e/tui/app-shell.test.ts`

All tests target the `TUI_HELP_OVERLAY` feature using `@microsoft/tui-test`. Tests that fail due to unimplemented backends are left failing (never skipped).

#### Rendering & Snapshot Tests

1. **`help overlay renders on ? keypress`** — Press `?` on dashboard. Assert overlay is visible with "Keybindings" title, global keybinding group, and at least one screen-specific group. Snapshot full terminal output.
2. **`help overlay shows correct global keybindings`** — Press `?`. Assert overlay contains rows for `?`, `:`, `q`, `Esc`, `Ctrl+C`. Assert each row has a key column and description column.
3. **`help overlay shows go-to keybindings`** — Press `?`. Assert "Go To" group heading is visible. Assert entries for `g d`, `g i`, `g l`, `g r`, `g w`, `g n`, `g s`, `g a`, `g o`, `g f`, `g k`.
4. **`help overlay shows screen-specific keybindings for issue list`** — Navigate to issue list. Press `?`. Assert screen-specific group (e.g., "Navigation") includes `j / Down`, `k / Up`, `Enter`, `Space`, `/`. Snapshot.
5. **`help overlay shows screen-specific keybindings for diff viewer`** — Navigate to diff viewer. Press `?`. Assert diff-specific group includes `]`, `[`, `t`, `w`, `x`, `z`. Snapshot.
6. **`help overlay shows screen-specific keybindings for form`** — Navigate to issue create form. Press `?`. Assert form-specific group includes `Tab`, `Shift+Tab`, `Ctrl+S`. Snapshot.
7. **`help overlay renders title and footer`** — Press `?`. Assert "Keybindings" text in top row of overlay. Assert "Esc to close" text visible.
8. **`help overlay renders border with box-drawing characters`** — Press `?`. Assert overlay border uses Unicode box-drawing characters (┌, ┐, └, ┘, ─, │) in terminal output.
9. **`help overlay key column uses warning color`** — Press `?`. Assert key labels are rendered with ANSI color code for warning (yellow/178).
10. **`help overlay group headings use primary color and bold`** — Press `?`. Assert group heading text uses ANSI bold and primary color (blue/33).

#### Keyboard Interaction Tests

11. **`? toggles help overlay open`** — Start on dashboard. Press `?`. Assert overlay is visible (regex match for "Keybindings").
12. **`? toggles help overlay closed`** — Press `?` to open. Press `?` again. Assert overlay is no longer visible. Assert dashboard content is visible.
13. **`Esc closes help overlay`** — Press `?` to open. Press `Esc`. Assert overlay is closed. Assert focus returns to dashboard.
14. **`j scrolls down in help overlay`** — Press `?` to open. Press `j` multiple times. Assert scroll position advances (visible rows change).
15. **`k scrolls up in help overlay`** — Press `?` to open. Press `j` 5 times, then `k` 3 times. Assert scroll position is net +2 from start.
16. **`G jumps to bottom of keybinding list`** — Press `?` to open. Press `G`. Assert last keybinding entry is visible. Assert scroll indicator shows final range.
17. **`g g jumps to top of keybinding list`** — Press `?` to open. Press `G` to go to bottom. Press `g` then `g`. Assert first keybinding entry ("Global" heading) is visible.
18. **`Ctrl+D pages down in help overlay`** — Press `?` to open. Press `Ctrl+D`. Assert scroll position advances by approximately half the visible height.
19. **`Ctrl+U pages up in help overlay`** — Press `?` to open. Press `Ctrl+D` then `Ctrl+U`. Assert scroll returns to near the top.
20. **`keybindings are suppressed while help overlay is open`** — Press `?` to open. Press `:` (command palette key). Assert command palette does not open. Assert help overlay remains open.
21. **`q does not navigate back while help overlay is open`** — Press `?` to open. Press `q`. Assert overlay remains open (or closes overlay but does not pop screen). Assert no screen navigation occurred.
22. **`Ctrl+C quits TUI even with help overlay open`** — Press `?` to open. Press `Ctrl+C`. Assert TUI process exits.

#### Responsive Tests

23. **`help overlay at 80x24 uses 90% dimensions`** — Set terminal to 80×24. Press `?`. Snapshot. Assert overlay width is approximately 72 columns (90% of 80). Assert overlay height is approximately 21 rows (90% of 24).
24. **`help overlay at 120x40 uses 60% dimensions`** — Set terminal to 120×40. Press `?`. Snapshot. Assert overlay width is approximately 72 columns (60% of 120). Assert overlay height is approximately 24 rows (60% of 40).
25. **`help overlay at 200x60 uses 60% dimensions`** — Set terminal to 200×60. Press `?`. Snapshot. Assert overlay width is approximately 120 columns (60% of 200). Assert overlay height is approximately 36 rows (60% of 60).
26. **`help overlay truncates descriptions at small terminal`** — Set terminal to 80×24. Press `?`. Assert no keybinding description line exceeds the overlay width minus padding. Assert truncated descriptions end with `…`.
27. **`help overlay resize from large to small`** — Set terminal to 200×60. Press `?`. Resize terminal to 80×24. Assert overlay re-renders at 90% dimensions. Assert content is still readable. Snapshot after resize.
28. **`help overlay resize from small to large`** — Set terminal to 80×24. Press `?`. Resize terminal to 200×60. Assert overlay re-renders at 60% dimensions. Assert descriptions are no longer truncated. Snapshot after resize.
29. **`help overlay preserves scroll position on resize`** — Set terminal to 120×40. Press `?`. Scroll down 10 rows with `j`. Resize terminal to 80×24. Assert scroll position is preserved (same or clamped content visible).

#### Context & State Tests

30. **`help overlay content changes with screen context`** — Open help on dashboard, note keybinding groups. Close. Navigate to issues list. Open help. Assert different screen-specific keybindings are shown.
31. **`help overlay shows only global keybindings when screen has none`** — Navigate to a screen with no screen-specific keybindings registered. Press `?`. Assert global and go-to groups are shown. Assert no empty screen-specific section.
32. **`help overlay mutual exclusion with command palette`** — Press `:` to open command palette. Press `Esc` to close. Press `?` to open help. Assert help overlay is visible. Assert command palette is not visible.
33. **`status bar shows ? Help hint`** — On any screen with help overlay closed. Assert status bar right section contains text matching `? Help` or `?`.
34. **`scroll indicator shows correct range`** — Press `?` on a screen with many keybindings (>20 entries). Assert footer shows scroll indicator in format "1-N of M" where N ≤ M. Scroll down. Assert indicator updates.
