# Engineering Specification: `tui-notification-list-scaffold`

## Notification List Screen Scaffold — Layout, Screen Registration, Filter Toolbar

**Ticket:** `tui-notification-list-scaffold`
**Status:** `Partial`
**Dependencies:** `tui-screen-router`, `tui-responsive-layout`, `tui-goto-keybindings`, `tui-command-palette`

---

## 1. Overview

This specification defines the `NotificationListScreen` component, its sub-components, screen registry wiring, navigation integration, and E2E test scaffold. The notification list is a top-level screen (no repo context required) that displays the user's notification inbox with filtering, keyboard navigation, and responsive layout.

The screen replaces the `PlaceholderScreen` currently mapped to `ScreenName.Notifications` in the screen registry.

---

## 2. File Inventory

### New files

| File | Purpose |
|------|---------|
| `apps/tui/src/screens/Notifications/NotificationListScreen.tsx` | Main screen component |
| `apps/tui/src/screens/Notifications/NotificationRow.tsx` | Single notification row component |
| `apps/tui/src/screens/Notifications/types.ts` | Notification-specific type definitions |
| `apps/tui/src/screens/Notifications/index.ts` | Barrel export |
| `e2e/tui/notifications.test.ts` | E2E test scaffold |

### Modified files

| File | Change |
|------|--------|
| `apps/tui/src/router/registry.ts` | Replace `PlaceholderScreen` with `NotificationListScreen` for `ScreenName.Notifications` |
| `apps/tui/src/screens/index.ts` | Add barrel export for `Notifications` |

---

## 3. Data Types

### 3.1 `apps/tui/src/screens/Notifications/types.ts`

```typescript
export type NotificationSourceType =
  | "issue"
  | "landing"
  | "workflow"
  | "repository"
  | "agent"
  | "workspace"
  | "wiki"
  | "unknown";

export type NotificationReason =
  | "assign"
  | "mention"
  | "review_requested"
  | "comment"
  | "state_change"
  | "subscribed"
  | "manual"
  | "unknown";

export interface NotificationItem {
  id: string;
  unread: boolean;
  sourceType: NotificationSourceType;
  subject: string;
  bodyPreview: string;
  repoFullName: string | null;
  updatedAt: string;
  reason: NotificationReason;
}

export type NotificationFilter = "all" | "unread";

export interface NotificationColumnVisibility {
  unreadDot: true;
  sourceIcon: true;
  subject: true;
  bodyPreview: boolean;
  repoName: boolean;
  timestamp: true;
  reason: boolean;
}
```

### 3.2 Source type icon mapping

| Source Type | Icon | Color Token |
|-------------|------|-------------|
| `issue` | `◉` | `success` |
| `landing` | `⇡` | `primary` |
| `workflow` | `⚙` | `warning` |
| `repository` | `◆` | `muted` |
| `agent` | `▸` | `primary` |
| `workspace` | `⊞` | `muted` |
| `wiki` | `☰` | `muted` |
| `unknown` | `·` | `muted` |

All icons are single-character Unicode symbols (1-cell width in monospace terminals).

---

## 4. Component Specifications

### 4.1 NotificationListScreen

**File:** `apps/tui/src/screens/Notifications/NotificationListScreen.tsx`
**Props:** `ScreenComponentProps`

**Layout:**
```
┌──────────────────────────────────────────┐
│  Notifications (3 unread)                │  ← Title row (1 line)
├──────────────────────────────────────────┤
│  [All] [Unread]    /search…              │  ← Filter toolbar (1 line)
├──────────────────────────────────────────┤
│  ● ◉  Fix login bug…     alice/app 2m   │  ← Scrollbox rows
│  ● ⇡  Landing !42…       alice/app 5m   │
│    ⚙  Workflow #123…     bob/lib  15m   │
│  ─ Loading more… ─                       │  ← Pagination indicator
└──────────────────────────────────────────┘
```

**Title row:** `Notifications (N unread)` — bold title, muted count. When N=0: `Notifications (all read)`.

**Filter toolbar:** Left: `[All]`/`[Unread]` toggle (active=bold+primary, inactive=muted). Right: search input activated by `/`. Toggle via `a`/`u` keys.

**Scrollbox:** Wraps `NotificationRow` components. Vim-style navigation (j/k/Enter/G/gg/Ctrl+D/Ctrl+U).

**Empty state:** Centered `No notifications` + `You're all caught up!` in muted text.

**Loading state:** `<SkeletonList>` → `<FullScreenLoading>` (after 80ms) → `<FullScreenError>` (on error with R retry).

**Keybindings (12 total via useScreenKeybindings):**

| Key | Action | Group |
|-----|--------|-------|
| `j`/`Down` | Move focus down | Navigation |
| `k`/`Up` | Move focus up | Navigation |
| `Enter` | Open notification | Navigation |
| `G` | Jump to bottom | Navigation |
| `g g` | Jump to top | Navigation |
| `Ctrl+D` | Page down | Navigation |
| `Ctrl+U` | Page up | Navigation |
| `/` | Search | Filtering |
| `a` | Show all | Filtering |
| `u` | Show unread | Filtering |
| `Space` | Toggle select | Selection |
| `R` | Retry | Actions |

### 4.2 NotificationRow

**File:** `apps/tui/src/screens/Notifications/NotificationRow.tsx`

**Props:** `{ item: NotificationItem; focused: boolean; selected: boolean; columns: NotificationColumnVisibility; width: number }`

**Segments:** Unread dot (2ch) + Source icon (2ch) + Subject (flex, bold if unread) + Body preview (20ch, hidden@min) + Repo name (15ch, hidden@min) + Reason (10ch, large only) + Timestamp (8ch).

**Focused:** Reverse video. **Selected:** Prepend `✓`.

**Responsive column visibility:**
- Minimum (80×24): dot + icon + subject + timestamp
- Standard (120×40): + body preview + repo name
- Large (200×60): + reason

**Timestamp format:** `just now` / `Nm ago` / `Nh ago` / `Nd ago` / `MMM DD` / `MMM DD YYYY`

---

## 5. Screen Registration

### 5.1 Registry update

In `apps/tui/src/router/registry.ts`, replace `PlaceholderScreen` with `NotificationListScreen` for `ScreenName.Notifications`. All other fields (`requiresRepo: false`, `requiresOrg: false`, `breadcrumbLabel: () => "Notifications"`) unchanged.

### 5.2 Navigation wiring

- **Go-to:** `g n` already mapped in `goToBindings.ts` — no changes needed.
- **Deep-link:** `--screen notifications` already resolved by `deepLinks.ts` — no changes needed.
- **Breadcrumb:** `Dashboard › Notifications` — automatic from stack.
- **Command palette:** Deferred to `tui-command-palette` ticket.

---

## 6. State Management

Local state: `filter` (NotificationFilter), `searchQuery` (string), `searchActive` (boolean), `focusedIndex` (number), `selectedIds` (Set<string>).

Data placeholder: hardcoded empty array until `useNotifications()` hook is implemented.

Client-side filtering: `useMemo` over notifications applying filter toggle and search query.

---

## 7. Responsive Behavior

| Behavior | Minimum (80×24) | Standard (120×40) | Large (200×60) |
|----------|------------------|--------------------|----------------|
| Title | `Notifications (N)` | Full | Full |
| Filter toolbar | `[A] [U] /…` | `[All] [Unread]  / search…` | Full |
| Row columns | dot+icon+subject+timestamp | +bodyPreview+repoName | +reason |

---

## 8. Implementation Plan

### Phase 1: Types and scaffolding
1. Create `apps/tui/src/screens/Notifications/` directory
2. Create `types.ts` with all types, `formatRelativeTime`, `getColumnVisibility`, `getSourceIcon`
3. Create `index.ts` barrel export

### Phase 2: NotificationRow component
4. Create `NotificationRow.tsx` with column-visibility-driven layout
5. Implement source type icon mapping, unread dot, bold subject, truncation, timestamp
6. Implement focused/selected visual states

### Phase 3: NotificationListScreen component
7. Create `NotificationListScreen.tsx` with title row, filter toolbar, scrollbox, empty state
8. Wire local state, breakpoint-driven column visibility, keybindings, loading states
9. Add `<PaginationIndicator>` and `<SkeletonList>`/`<FullScreenError>` integration

### Phase 4: Screen registry wiring
10. Update `registry.ts` to import and use `NotificationListScreen`
11. Update `screens/index.ts` barrel export
12. Verify `g n` and `--screen notifications` work

### Phase 5: E2E test scaffold
13. Create `e2e/tui/notifications.test.ts` with 33 tests

---

## 9. Unit & Integration Tests

### Test file: `e2e/tui/notifications.test.ts`

**33 tests across 12 describe blocks:**

| Category | Tests | Method |
|----------|-------|--------|
| File structure | 4 | `existsSync` |
| Type exports | 4 | `bunEval` + JSON parse |
| Component exports | 2 | `bunEval` + typeof |
| Screen registry | 3 | `bunEval` + property checks |
| TypeScript compilation | 1 | `bun run check` |
| Timestamp formatting | 4 | `bunEval` + string equality |
| Column visibility | 3 | `bunEval` + JSON checks |
| Source icon mapping | 2 | `bunEval` + validation |
| Go-to navigation | 2 | `launchTUI` + breadcrumb assertions |
| Layout rendering | 4 | `launchTUI` + snapshots at all breakpoints |
| Filter toolbar | 3 | `launchTUI` + sendKeys |
| Keyboard navigation | 1 | `launchTUI` + q returns |

Per project policy: integration tests that fail due to unimplemented backends are **never skipped or commented out**.

---

## 10. Acceptance Criteria

1. All 4 new files exist under `apps/tui/src/screens/Notifications/`
2. All types compile without errors
3. `screenRegistry[ScreenName.Notifications].component` is `NotificationListScreen`
4. `g n` reaches notification screen with correct breadcrumb
5. `--screen notifications` deep-link works
6. Layout renders at all 3 breakpoints without overflow
7. Column visibility adapts per breakpoint
8. `a`/`u` toggle filter, `/` activates search
9. Empty state renders when list is empty
10. Loading/error states use existing components
11. All 12 keybindings registered and shown in status bar
12. No new tsc errors
13. E2E test file exists with 33 tests

---

## 11. Out of Scope

| Item | Future Ticket |
|------|---------------|
| `useNotifications()` data hook | `tui-notification-data-hook` |
| Mark read / batch mark-all-read | `tui-notification-mark-read` |
| SSE streaming badge | `tui-notification-sse-stream` |
| Navigate to referenced resource | `tui-notification-detail-nav` |
| Command palette entry | `tui-command-palette` |

---

## 12. Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Unicode icon width varies | Use single-cell BMP symbols only |
| Duplicate timestamp util | Check Agents util compatibility first |
| Empty data limits layout testing | `__DEV__` mock injection (not committed to tests) |
| Keybinding conflict with search input | `when: () => !searchActive` predicate + Priority 1 text input capture |