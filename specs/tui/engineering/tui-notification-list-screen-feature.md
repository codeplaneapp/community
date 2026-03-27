# TUI_NOTIFICATION_LIST_SCREEN Engineering Specification

## Overview
The Notification List screen is the primary notification inbox in the Codeplane TUI. It provides a full-screen, scrollable list of all notifications for the authenticated user, designed for keyboard-driven navigation. The screen adapts responsively to terminal dimensions and receives real-time updates via SSE.

## Component Structure

```tsx
// apps/tui/src/screens/notifications/NotificationListScreen.tsx
<Screen>
  <box flexDirection="column" width="100%" height="100%">
    <TitleRow unreadCount={unreadCount} />
    <FilterToolbar 
      filter={filter} 
      searchText={searchText} 
      searchFocused={searchFocused} 
    />
    {isLoading && !hasData ? (
      <LoadingState />
    ) : isError ? (
      <ErrorState error={error} onRetry={refetch} />
    ) : (
      <NotificationList 
        notifications={filteredNotifications} 
        focusedId={focusedId} 
        breakpoint={breakpoint} 
        isLoadingMore={isLoadingMore}
        atMemoryCap={atMemoryCap}
        totalCount={totalCount}
        onScrollEnd={fetchMore}
      />
    )}
  </box>
</Screen>
```

## State Management
- **Data Fetching:** Handled by `useNotifications()` from `@codeplane/ui-core`, providing pagination (`fetchMore`), optimistic mutation (`markRead`, `markAllRead`), and caching up to 500 items.
- **SSE Integration:** Subscribes to the `notifications` channel via `useSSEChannel()`. Prepending new notifications is managed internally by the data hook or locally if required by the shared layer.
- **Local UI State:** 
  - `filter`: `'all' | 'unread'`
  - `searchText`: `string`
  - `searchFocused`: `boolean`
  - `focusedIndex`: `number` (mapped to `focusedId`)
  - `selectedIds`: `Set<string>` (for multi-select via `Space`)

## Responsive Layout
The `NotificationRow` adjusts rendered columns based on the active breakpoint:
- **`minimum` (80x24):** Only Unread Indicator, Subject (truncated to remaining space minus timestamp), Timestamp.
- **`standard` (120x40):** Unread Indicator, Source Icon, Subject (40ch), Body Preview (remaining), Timestamp.
- **`large` (200x60):** Unread Indicator, Source Icon, Subject (55ch), Body Preview (remaining), Timestamp.

## Implementation Plan

### 1. Notification Row Component
**File:** `apps/tui/src/screens/notifications/NotificationRow.tsx`
- Create a stateless functional component mapping notification data to the row layout.
- Implement truncation helpers (`truncate`, `stripMarkdown`).
- Implement source type icon mapping (with `TERM` color check for emoji vs text fallback).
- Render bold text (or primary color mapping if bold unsupported) for unread items.

### 2. Main Notification List Screen
**File:** `apps/tui/src/screens/notifications/NotificationListScreen.tsx`
- Wire `useNotifications()` and map data to local list state (filtering by `filter` and `searchText` client-side).
- Render `TitleRow` and `FilterToolbar`. Use OpenTUI `<input>` for the search field.
- Render `ScrollableList` component containing `NotificationRow`s. Detect scroll-to-end to trigger `fetchMore`.
- Implement empty and error states matching the PRD.

### 3. Keybindings and Navigation
**File:** `apps/tui/src/screens/notifications/NotificationListScreen.tsx`
- Use `useScreenKeybindings` to register interactions: `j`, `k`, `Enter`, `/`, `Esc`, `G`, `g g`, `Ctrl+D`, `Ctrl+U`, `r`, `R`, `f`, `Space`, `q`.
- `Enter` triggers `push` via `useNavigation` to the corresponding resource detail screen based on `source_type` and `source_id`.
- priority delegation for `Esc`: `searchFocused ? clearSearch() : popScreen()`.

### 4. Setup SSE Real-time Updates
**File:** `apps/tui/src/screens/notifications/NotificationListScreen.tsx`
- Hook into `useSSEChannel("notifications", (event) => { ... })`.
- Flash the unread indicator or newly inserted row with reverse video for 1 cycle.

## Unit & Integration Tests

**File:** `e2e/tui/notifications.test.ts`
Implement the full suite of 111 tests specified in the PRD, categorized as follows:

### Terminal Snapshot Tests
1. `SNAP-NOTIF-001` to `SNAP-NOTIF-026` covering all permutations of responsive breakpoints, empty/error/loading states, unread/read visual differences, truncation handling, and specific UI elements like the filter toolbar and pagination footer.

### Keyboard Interaction Tests
2. `KEY-NOTIF-001` to `KEY-NOTIF-040` validating all specified keybindings, including navigation bounds, focus management, screen pushing on `Enter`, search input focus/filtering/clear priority, optimistic mark-read actions (`r`, `R`), filter toggling (`f`), and rapid interaction handling.

### Responsive Tests
3. `RESP-NOTIF-001` to `RESP-NOTIF-014` ensuring column visibilities, width calculations, and string truncations adapt correctly across `minimum`, `standard`, and `large` breakpoints, and testing synchronous resizing preservation of focus and scroll state.

### Integration Tests
4. `INT-NOTIF-001` to `INT-NOTIF-018` verifying API and environment interactions: auth expiry flows, rate limits, pagination capping, server errors (500, 404 on mark read), go-to navigation deep linking, and rigorous SSE real-time streaming behaviors including reconnection deduplication.

### Edge Case Tests
5. `EDGE-NOTIF-001` to `EDGE-NOTIF-013` checking robustness against no auth token, unicode subject clipping, null fields, rapid successive presses, disconnection during mutations, and empty-state resolutions.