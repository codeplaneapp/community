# Engineering Specification: TUI Responsive Layout System

**Ticket:** `tui-responsive-layout`
**Title:** Implement responsive layout system with breakpoints, sidebar toggle, and size adaptations
**Type:** Feature
**Dependencies:** `tui-bootstrap-and-renderer`, `tui-theme-and-color-tokens`
**Status:** Ready for implementation

---

## 1. Executive Summary

This ticket completes the responsive layout system for the Codeplane TUI. The system detects terminal dimensions, classifies them into named breakpoints, and drives layout adaptations across every component in the UI — header bar, status bar, sidebar, list views, diff views, and modal overlays.

The implementation builds on existing hooks (`useBreakpoint`, `useResponsiveValue`, `useSidebarState`, `useLayout`) and components (`AppShell`, `HeaderBar`, `StatusBar`, `TerminalTooSmallScreen`, `OverlayLayer`) delivered by `tui-bootstrap-and-renderer` and `tui-theme-and-color-tokens`. This ticket closes the gaps between what those hooks/components currently do and what the full `TUI_RESPONSIVE_LAYOUT` specification requires.

---

## 2. Current State Assessment

### 2.1 Already Implemented (no changes needed)

| Component/Hook | File | Status |
|---|---|---|
| `Breakpoint` type + `getBreakpoint()` | `apps/tui/src/types/breakpoint.ts` | ✅ Complete — 3 breakpoints + null for unsupported |
| `useBreakpoint()` | `apps/tui/src/hooks/useBreakpoint.ts` | ✅ Complete — reads `useTerminalDimensions()`, memoized |
| `useResponsiveValue()` | `apps/tui/src/hooks/useResponsiveValue.ts` | ✅ Complete — maps `{ minimum, standard, large }` → T |
| `resolveSidebarVisibility()` | `apps/tui/src/hooks/useSidebarState.ts` | ✅ Complete — pure function (but needs spec deviation fix; see §3 Step 11) |
| `useSidebarState()` | `apps/tui/src/hooks/useSidebarState.ts` | ✅ Complete — user preference + auto-override (but needs spec deviation fix) |
| `useLayout()` | `apps/tui/src/hooks/useLayout.ts` | ✅ Core complete — returns breakpoint, sidebarVisible, sidebarWidth, modalWidth, modalHeight |
| `TerminalTooSmallScreen` | `apps/tui/src/components/TerminalTooSmallScreen.tsx` | ✅ Complete — centered warning + dimensions + `Ctrl+C`/`q` to quit |
| `AppShell` breakpoint null guard | `apps/tui/src/components/AppShell.tsx` | ✅ Complete — renders `TerminalTooSmallScreen` when `breakpoint === null` |
| `OverlayLayer` responsive sizing | `apps/tui/src/components/OverlayLayer.tsx` | ✅ Complete — uses `layout.modalWidth` / `layout.modalHeight` |
| `HeaderBar` repo context hiding | `apps/tui/src/components/HeaderBar.tsx` | ✅ Partial — hides repo context at minimum breakpoint |
| `StatusBar` hint limiting | `apps/tui/src/components/StatusBar.tsx` | ✅ Partial — limits hints to 4 at minimum |
| Breadcrumb truncation (full trail) | `apps/tui/src/util/text.ts` | ✅ Complete — `truncateBreadcrumb()` with `…` |
| Text truncation utilities | `apps/tui/src/util/text.ts` | ✅ Complete — `truncateRight()`, `fitWidth()`, `truncateText()` |
| Telemetry infrastructure | `apps/tui/src/lib/telemetry.ts` | ✅ Complete — `initTelemetry()`, `updateTelemetryDimensions()`, `emit()` |
| Logger | `apps/tui/src/lib/logger.ts` | ✅ Complete — `logger.error/warn/info/debug()`, writes to stderr |
| KeybindingProvider with `hasActiveModal()` | `apps/tui/src/providers/KeybindingProvider.tsx` | ✅ Complete — priority dispatch, modal detection |
| OverlayManager with MODAL scope | `apps/tui/src/providers/OverlayManager.tsx` | ✅ Complete — Escape binding at MODAL priority |

### 2.2 Gaps to Fill (this ticket)

| Gap | Description |
|---|---|
| **Sidebar rendering in AppShell** | `AppShell` has no sidebar `<box>` in its JSX. It needs a split layout with sidebar + main content when `sidebarVisible` is true and the current screen declares sidebar support. |
| **Sidebar `Ctrl+B` keybinding** | No keybinding registered for `Ctrl+B`. Must be added as a global keybinding calling `sidebar.toggle()`. |
| **Sidebar max width cap** | `useLayout()` does not cap sidebar at 60 columns. The `getSidebarWidth()` helper returns `"25%"` / `"30%"` but OpenTUI's `<box maxWidth>` must enforce the 60-column cap. |
| **Screen `hasSidebar` flag** | `ScreenDefinition` has no `hasSidebar` field. Sidebar should only render on screens that declare sidebar support (code explorer, diff view, wiki). |
| **Sidebar toggle at minimum breakpoint** | Current `resolveSidebarVisibility` always returns `{ visible: false, autoOverride: true }` at minimum. The product spec allows user-forced sidebar at minimum via `Ctrl+B`. |
| **HeaderBar per-segment truncation** | Individual breadcrumb segments exceeding 24 characters need truncation with `…` before joining. Current implementation passes raw segments to `truncateBreadcrumb()`. |
| **HeaderBar large breakpoint** | At large breakpoint, breadcrumb should have no max width limit. Notification badge at minimum shows number only (no icon text). Currently the badge rendering does not differentiate by breakpoint. |
| **StatusBar large breakpoint extended hints** | At large breakpoint, hints should show descriptive labels (e.g., `q quit` instead of `q:quit`). Sync status hidden at minimum. Current implementation limits to 4 hints at minimum but does not differentiate standard from large. |
| **List column configuration types** | No shared types or helpers for breakpoint-dependent column layouts. Screens need a `ColumnDef` abstraction and `resolveColumns()` helper. |
| **Diff view responsive constraints** | At minimum breakpoint, the `t` key for split toggle must be disabled with a transient status bar message. No helper exists for diff layout constraints. |
| **LayoutContext extensions** | `useLayout()` needs `maxBreadcrumbSegmentLength`, `diffContextLines`, `lineNumberGutterWidth`, `splitDiffAvailable`. |
| **Breakpoint lifecycle logging/telemetry** | No hook tracks breakpoint transitions to emit telemetry events and log at appropriate levels. |
| **CJK/wide character truncation** | `truncateText()` counts by `string.length`, not display width. Needs width-aware truncation for Unicode wide characters. |
| **OverlayLayer minimum inner width** | No guard for modal minimum inner width of 40 columns when terminal is narrow. |

---

## 3. Implementation Plan

### Step 1: Extend `ScreenDefinition` with `hasSidebar` flag

**File:** `apps/tui/src/router/types.ts`

Add `hasSidebar: boolean` to the `ScreenDefinition` interface. The current interface (lines 90–99) has `component`, `requiresRepo`, `requiresOrg`, and `breadcrumbLabel`. Add `hasSidebar` after `requiresOrg`:

```typescript
export interface ScreenDefinition {
  component: React.ComponentType<ScreenComponentProps>;
  requiresRepo: boolean;
  requiresOrg: boolean;
  /** Whether this screen renders a sidebar panel (file tree, outline, etc.) */
  hasSidebar: boolean;
  breadcrumbLabel: (params: Record<string, string>) => string;
}
```

**File:** `apps/tui/src/router/registry.ts`

Update every entry in `screenRegistry` to include `hasSidebar`. Screens with sidebar support:
- `RepoOverview` (code explorer tab) → `hasSidebar: true`
- `DiffView` (file tree) → `hasSidebar: true`
- `Wiki` (page tree) → `hasSidebar: true`
- `WikiDetail` (page tree) → `hasSidebar: true`

All other 28 screens: `hasSidebar: false`.

The existing exhaustiveness check at lines 199–207 ensures no screen is skipped.

### Step 2: Extend `LayoutContext` with additional responsive values

**File:** `apps/tui/src/hooks/useLayout.ts`

Add four computed values to `LayoutContext` interface:

```typescript
export interface LayoutContext {
  // ... existing fields ...
  maxBreadcrumbSegmentLength: number;  // Always 24
  diffContextLines: number;            // 3 at min/std, 5 at large
  lineNumberGutterWidth: number;       // 4/5/6 by breakpoint
  splitDiffAvailable: boolean;         // false at minimum
}
```

Add exported pure helper functions `getDiffContextLines()`, `getLineNumberGutterWidth()`, `isSplitDiffAvailable()`. Update `getSidebarWidth()` to return `"25%"` for minimum when visible.

### Step 3: Add sidebar rendering to `AppShell`

**File:** `apps/tui/src/components/AppShell.tsx`

Add a `flexDirection="row"` split within the content area. Sidebar box has `width={layout.sidebarWidth}`, `maxWidth={60}`, `flexShrink={0}`, and a right border. Only renders when `layout.sidebarVisible && currentDef?.hasSidebar`. Calls `useBreakpointLifecycle()` for telemetry.

### Step 4: Create `SidebarPlaceholder` component

**New file:** `apps/tui/src/components/SidebarPlaceholder.tsx`

Minimal placeholder component showing `[Sidebar: {screen}]` text. Downstream tickets replace with actual content.

### Step 5: Register `Ctrl+B` sidebar toggle keybinding

**File:** `apps/tui/src/hooks/useGlobalKeybindings.ts`

Add `onSidebarToggle` to `GlobalKeybindingActions`. Add `ctrl+b` binding with `when: () => !ctx.hasActiveModal()` guard.

**File:** `apps/tui/src/components/GlobalKeybindings.tsx`

Wire `onSidebarToggle` callback that checks `currentDef.hasSidebar`, calls `layout.sidebar.toggle()`, and emits telemetry.

### Step 6: Enhance `HeaderBar` responsive adaptations

**File:** `apps/tui/src/components/HeaderBar.tsx`

1. Per-segment truncation: `truncateText(entry.breadcrumb, 24)` before joining.
2. Breakpoint-aware max breadcrumb width: large=Infinity, standard=Math.min(80, width-40), minimum=Math.max(20, width-20).
3. Notification badge: minimum shows number only, standard/large shows icon prefix.

### Step 7: Enhance `StatusBar` responsive adaptations

**File:** `apps/tui/src/components/StatusBar.tsx`

1. Minimum: 1 hint only (not 4). Sync status hidden.
2. Large: hints use space separator (`q quit`) instead of colon (`q:quit`).

### Step 8: Create list column configuration abstraction

**New file:** `apps/tui/src/components/ListColumnConfig.ts`

`ColumnDef` interface, `ISSUE_LIST_COLUMNS` array, `ISSUE_LIST_COLUMNS_LARGE` overrides, `resolveColumns()` helper.

### Step 9: Create diff view responsive constraints helper

**New file:** `apps/tui/src/components/DiffResponsive.ts`

`DiffLayoutConstraints` interface, `getDiffConstraints()` function returning split availability, context lines, gutter width, and split pane width.

### Step 10: Add CJK-aware display width truncation

**File:** `apps/tui/src/util/text.ts`

Add `charDisplayWidth()` (0 for combining, 1 for narrow, 2 for wide/CJK), `stringDisplayWidth()`, and `truncateByDisplayWidth()` that never splits wide characters or orphans combining marks.

### Step 11: Fix sidebar toggle at minimum breakpoint

**File:** `apps/tui/src/hooks/useSidebarState.ts`

Update `resolveSidebarVisibility()` so that at minimum breakpoint with `userPreference: true`, sidebar is visible (user-forced). Update `toggle()` to allow toggling at minimum breakpoint.

### Step 12: Create breakpoint lifecycle hook

**New file:** `apps/tui/src/hooks/useBreakpointLifecycle.ts`

Tracks breakpoint transitions. Logs at info/warn/debug levels. Emits telemetry events: `breakpoint_init`, `breakpoint_change`, `terminal_too_small`, `terminal_restored`.

### Step 13: Sidebar auto-collapse verification

No additional code needed beyond Step 11. The updated `resolveSidebarVisibility` pure function handles all resize scenarios correctly.

### Step 14: OverlayLayer minimum inner width guard

**File:** `apps/tui/src/components/OverlayLayer.tsx`

Compute actual pixel width from percentage. If less than 40 + border/padding, stretch to `width - 2`.

---

## 4. File Inventory

### Modified Files

| File | Changes |
|---|---|
| `apps/tui/src/router/types.ts` | Add `hasSidebar: boolean` to `ScreenDefinition` |
| `apps/tui/src/router/registry.ts` | Add `hasSidebar` to every screen entry (4 true, 28 false) |
| `apps/tui/src/hooks/useLayout.ts` | Add `diffContextLines`, `lineNumberGutterWidth`, `splitDiffAvailable`, `maxBreadcrumbSegmentLength`; update `getSidebarWidth()`; export pure helpers |
| `apps/tui/src/hooks/useSidebarState.ts` | Allow toggle at minimum breakpoint; update `resolveSidebarVisibility` and `toggle()` |
| `apps/tui/src/hooks/useGlobalKeybindings.ts` | Add `onSidebarToggle` to `GlobalKeybindingActions`; add `ctrl+b` binding |
| `apps/tui/src/components/AppShell.tsx` | Add sidebar rendering, import navigation + registry, call `useBreakpointLifecycle()` |
| `apps/tui/src/components/GlobalKeybindings.tsx` | Wire `onSidebarToggle` callback with telemetry |
| `apps/tui/src/components/HeaderBar.tsx` | Per-segment truncation, breakpoint-aware breadcrumb width, badge format |
| `apps/tui/src/components/StatusBar.tsx` | 1 hint at minimum, large format, sync hiding |
| `apps/tui/src/components/OverlayLayer.tsx` | Minimum inner width guard |
| `apps/tui/src/util/text.ts` | Add `charDisplayWidth()`, `stringDisplayWidth()`, `truncateByDisplayWidth()` |

### New Files

| File | Purpose |
|---|---|
| `apps/tui/src/components/SidebarPlaceholder.tsx` | Placeholder sidebar content |
| `apps/tui/src/components/ListColumnConfig.ts` | Column definition types and `resolveColumns()` helper |
| `apps/tui/src/components/DiffResponsive.ts` | Diff view responsive constraint calculator |
| `apps/tui/src/hooks/useBreakpointLifecycle.ts` | Breakpoint transition logging and telemetry |

---

## 5. Detailed Component Specifications

### 5.1 `getBreakpoint()` — No changes needed

```
width < 80 || height < 24   → null
width < 120 || height < 40  → "minimum"
width < 200 || height < 60  → "standard"
otherwise                   → "large"
```

### 5.2 Sidebar Width and Max Width

| Breakpoint | Default Visible | Width | Max Width |
|---|---|---|---|
| `null` | No | `0%` | — |
| `minimum` (default) | No | `0%` | — |
| `minimum` (user forced) | Yes | `25%` | 60 cols |
| `standard` | Yes | `25%` | 60 cols |
| `large` | Yes | `30%` | 60 cols |

### 5.3 Modal Sizing

| Breakpoint | Width | Height | Min Inner Width |
|---|---|---|---|
| `minimum` | `90%` | `90%` | 40 cols |
| `standard` | `60%` | `60%` | 40 cols |
| `large` | `50%` | `50%` | 40 cols |

### 5.4 Text Truncation Rules

1. Truncated text always ends with `…` (U+2026)
2. Individual breadcrumb segments capped at 24 characters
3. Full trail truncated from left with `…` prefix
4. CJK double-width characters handled by `truncateByDisplayWidth()`
5. Combining characters kept with base character

---

## 6. Edge Cases

- Terminal at exactly 80×24/120×40/200×60: correct breakpoint, no too-small message
- Terminal at 79×24, 80×23, 0×0: null breakpoint, too-small screen
- Rapid resize: React 19 batching coalesces to single render
- Resize during modal: modal re-centers and resizes
- Resize during text input: cursor and content preserved
- Sidebar toggle on non-sidebar screen: no-op
- Sidebar toggle during modal: no-op (when guard)
- Resize standard→minimum with sidebar visible: auto-hides (or stays if user forced)
- Resize minimum→standard after user hid sidebar: stays hidden

---

## 7. Productionizing Placeholder Code

| Placeholder | Downstream Ticket | Action |
|---|---|---|
| `SidebarPlaceholder.tsx` | `tui-code-explorer`, `tui-diff-viewer`, `tui-wiki` | Replace with `SidebarRouter` |
| `ListColumnConfig.ts` | `tui-issues`, `tui-landings` | Import `resolveColumns()` in list screens |
| `DiffResponsive.ts` | `tui-diff-viewer` | Import `getDiffConstraints()` in DiffScreen |

---

## 8. Unit & Integration Tests

All tests added to `e2e/tui/app-shell.test.ts`.

### 8.1 Updated Sidebar Tests
- Update `HOOK-SB-003` for spec-aligned behavior (minimum + userPref true = visible)
- Add `HOOK-SB-013` (minimum + userPref false = hidden)

### 8.2 ScreenDefinition Tests (RESP-SCREEN-001–005)
- Verify `hasSidebar` field exists on all 32 screens
- Verify correct screens have `hasSidebar: true`

### 8.3 Extended LayoutContext Tests (RESP-LAY-EXT-001–012)
- Verify `getDiffContextLines()`, `getLineNumberGutterWidth()`, `isSplitDiffAvailable()` pure functions
- Verify `maxBreadcrumbSegmentLength` is 24

### 8.4 Column Resolution Tests (RESP-COL-001–006)
- Minimum shows title+status only
- Standard shows all 6 columns
- Large shows expanded widths

### 8.5 Diff Constraints Tests (RESP-DIFF-001–005)
- Minimum: split unavailable, 3 context, 4 gutter
- Standard: split available, 3 context, 5 gutter
- Large: split available, 5 context, 6 gutter
- Split pane width calculations

### 8.6 Display Width Tests (RESP-TRUNC-001–012)
- ASCII=1, CJK=2, Hangul=2, Fullwidth=2, Combining=0
- Mixed string width calculation
- Truncation never splits wide characters
- Combining characters not orphaned

### 8.7 Terminal Snapshot Tests (RESPONSIVE_SNAPSHOT_01–19)
- Minimum/standard/large layout snapshots
- Too-small screen at various dimensions
- Modal sizing at each breakpoint
- Boundary dimension rendering

### 8.8 Keyboard Tests (RESPONSIVE_KEY_03–11)
- Ctrl+B no-op on dashboard
- Ctrl+B no-op during modal
- j/k at all breakpoints
- Ctrl+C/q from too-small screen

### 8.9 Resize Tests (RESPONSIVE_RESIZE_01–16)
- Breakpoint transitions in both directions
- Too-small entry and recovery
- Resize during modal and text input
- Within-breakpoint resize stability
- Skipping breakpoints (80×24 → 200×60)

### 8.10 Integration Tests (RESPONSIVE_INTEGRATION_01–11)
- Navigation stack preservation through too-small
- Colors at all breakpoints
- Go-to navigation at minimum
- Modal sizing across breakpoints
- Deep-link size respect
- Rapid resize stress test

### 8.11 File Structure Tests (RESP-FILE-001–013)
- New files exist
- Correct imports in modified files
- TypeScript compilation passes

---

## 9. Test Philosophy

1. Tests that fail due to unimplemented backends stay failing
2. No mocking — real PTY via @microsoft/tui-test
3. Each test validates one user-facing behavior
4. Snapshots supplement interaction tests
5. Tests at minimum (80×24), standard (120×40), large (200×60)
6. Tests are independent — fresh TUI per test

---

## 10. Acceptance Criteria Traceability

Full mapping from acceptance criteria → implementation steps → test IDs provided in specification body.

---

## 11. Dependencies and Ordering

```
tui-bootstrap-and-renderer (DONE)
  └── tui-theme-and-color-tokens (DONE)
       └── tui-responsive-layout (THIS TICKET)
            ├── tui-code-explorer
            ├── tui-diff-viewer
            ├── tui-issues
            ├── tui-landings
            ├── tui-repository
            ├── tui-wiki
            └── tui-command-palette
```

---

## 12. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| OpenTUI `maxWidth` incompatibility | PoC test; fallback to computed absolute width |
| React 19 batching gaps | OpenTUI Zig-level debounce covers it |
| CJK width edge cases | Comprehensive Unicode range coverage + tests |
| Existing test breakage (HOOK-SB-003) | Intentional — update to match spec |

---

## 13. Implementation Checklist

- [ ] Step 1: hasSidebar on ScreenDefinition + registry
- [ ] Step 2: Extended LayoutContext values
- [ ] Step 3: Sidebar rendering in AppShell
- [ ] Step 4: SidebarPlaceholder component
- [ ] Step 5: Ctrl+B keybinding registration
- [ ] Step 6: HeaderBar enhancements
- [ ] Step 7: StatusBar enhancements
- [ ] Step 8: ListColumnConfig.ts
- [ ] Step 9: DiffResponsive.ts
- [ ] Step 10: CJK-aware truncation
- [ ] Step 11: Sidebar toggle at minimum fix
- [ ] Step 12: useBreakpointLifecycle hook
- [ ] Step 13: Sidebar auto-collapse verification
- [ ] Step 14: OverlayLayer min width guard
- [ ] Update existing tests for spec alignment
- [ ] Add all new test groups
- [ ] tsc --noEmit passes
- [ ] Full E2E suite passes