# Research Report: `tui-notification-list-scaffold`

Based on the analysis of the `apps/tui/src` directory, here is the context and guidance for implementing the Notification List Screen Scaffold ticket.

## 1. Screen Registration (`apps/tui/src/router/registry.ts`)

The screen registry currently assigns a placeholder for the `Notifications` screen. You will need to update this to point to the new `NotificationListScreen` component.

```typescript
import { PlaceholderScreen } from "../screens/PlaceholderScreen.js";
// ADD THIS:
import { NotificationListScreen } from "../screens/Notifications/NotificationListScreen.js";

// UPDATE THIS:
  [ScreenName.Notifications]: {
    component: NotificationListScreen, // <-- Changed from PlaceholderScreen
    requiresRepo: false,
    requiresOrg: false,
    breadcrumbLabel: () => "Notifications",
  },
```

## 2. Global Navigation State

### Go-to Bindings (`apps/tui/src/navigation/goToBindings.ts`)

The navigation binding for `g n` is already correctly wired to `ScreenName.Notifications`:
```typescript
{ key: "n", screen: ScreenName.Notifications, requiresRepo: false, description: "Notifications" }
```
No changes are needed here.

### Deep Links (`apps/tui/src/navigation/deepLinks.ts`)

The command line flag `--screen notifications` is already handled correctly by `resolveScreenName`:
```typescript
notifications: ScreenName.Notifications,
```
No changes are needed here.

## 3. Timestamp Formatting

The specification requires a very specific timestamp format for the notifications: `just now` / `Nm ago` / `Nh ago` / `Nd ago` / `MMM DD` / `MMM DD YYYY`.

We looked at the existing `apps/tui/src/screens/Agents/utils/formatTimestamp.ts` implementation:
```typescript
export function formatTimestamp(isoString: string, breakpoint: Breakpoint): string | null { ... }
```
It supports returning `<1m`, `just now`, `1 minute ago` depending on breakpoints, but does not format `MMM DD` or `MMM DD YYYY` format.

**Action:** For the Notifications screen, you should implement the exact formatting required within `apps/tui/src/screens/Notifications/types.ts` as specified by the spec (`formatRelativeTime`). It differs enough from the Agents util that creating a dedicated implementation inside `types.ts` (as the specification outlines) is correct. Check `apps/tui/src/util/format.ts` if it exists for base functions, but per the spec, placing `formatRelativeTime` in `types.ts` is expected.

## 4. Scaffold Components context

You are expected to use these existing TUI components to scaffold the loading states:

- `<SkeletonList columns={3} metaWidth={6} statusWidth={5} />` (`apps/tui/src/components/SkeletonList.tsx`)
- `<FullScreenLoading spinnerFrame={...} label="..." />` (`apps/tui/src/components/FullScreenLoading.tsx`)
- `<FullScreenError screenLabel="..." error={...} />` (`apps/tui/src/components/FullScreenError.tsx`)
- `<PaginationIndicator status={...} spinnerFrame={...} error={...} />` (`apps/tui/src/components/PaginationIndicator.tsx`)

### Example Hooks Usage:
For keybindings and layout management inside the main `NotificationListScreen` and `NotificationRow` components, make sure to use these hooks that exist in `apps/tui/src/hooks/`:
- `useLayout()` to calculate the height for the scrollbox and width bounds.
- `useScreenKeybindings(keybindings)` to map `j`, `k`, `Enter`, `/`, `a`, `u`.
- `useBreakpoint()` to drive the visibility logic of the columns per the specification.
- `useTheme()` for pulling standard UI colors (`theme.primary`, `theme.muted`, `theme.error`, `theme.success`, `theme.warning`).

## 5. Types Definition (`apps/tui/src/screens/Notifications/types.ts`)

The spec provides the full schema for `NotificationItem` and enum lists. Since the backend hook (`useNotifications()`) is deferred, you'll need to mock `const notifications: NotificationItem[] = []` inside the component initially to build out the layout and empty states.

## 6. Implementation Checklist

1.  **Directory Creation:** `mkdir -p apps/tui/src/screens/Notifications`
2.  **Types:** Implement `types.ts` adhering perfectly to Section 3.1.
3.  **Row Component:** Implement `NotificationRow.tsx`. Rely heavily on standard terminal widths and `useTheme()` for colors.
4.  **List Screen:** Implement `NotificationListScreen.tsx`. Set up local state for `filter` (all/unread) and `searchQuery`.
5.  **Barrels:** Update `apps/tui/src/screens/Notifications/index.ts` and `apps/tui/src/screens/index.ts`.
6.  **Registry:** Update `apps/tui/src/router/registry.ts` to attach the new screen to `ScreenName.Notifications`.
7.  **Tests:** Create `e2e/tui/notifications.test.ts` according to Section 9 of the specification.
