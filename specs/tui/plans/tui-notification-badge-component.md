# Implementation Plan: Notification Badge Components

## Step 1: Create `NotificationBadge.tsx`
**File:** `apps/tui/src/components/NotificationBadge.tsx`
**Action:** Create a new file exporting `HeaderBadge` and `StatusBarBadge`.

**Code:**
```tsx
import React, { useEffect, useState, useRef } from "react";
import { useTheme } from "../hooks/useTheme.js";
import { useNotifications } from "@codeplane/ui-core";

const formatCount = (count: number): string => (count > 99 ? "99+" : count.toString());

export function HeaderBadge() {
  const theme = useTheme();
  const { unreadCount } = useNotifications();

  if (unreadCount === 0) return null;

  return (
    <box flexShrink={0}>
      <text fg={theme.warning}>[{formatCount(unreadCount)}]</text>
    </box>
  );
}

export function StatusBarBadge() {
  const theme = useTheme();
  const { unreadCount } = useNotifications();
  const [isPulsing, setIsPulsing] = useState(false);
  const previousCount = useRef(unreadCount);

  useEffect(() => {
    if (unreadCount > previousCount.current) {
      setIsPulsing(true);
      const timer = setTimeout(() => setIsPulsing(false), 2000);
      return () => clearTimeout(timer);
    }
    previousCount.current = unreadCount;
  }, [unreadCount]);

  const color = unreadCount > 0 ? theme.primary : theme.muted;

  return (
    <box flexShrink={0} width={6}>
      <text fg={color} bold={isPulsing}>◆ {formatCount(unreadCount)}</text>
    </box>
  );
}
```

## Step 2: Update `HeaderBar` Component
**File:** `apps/tui/src/components/HeaderBar.tsx`
**Action:** Integrate `HeaderBadge` into the header layout.

**Modifications:**
1. Import `HeaderBadge`: `import { HeaderBadge } from "./NotificationBadge.js";`
2. Remove the placeholder `const unreadCount = 0; // placeholder`
3. Locate the right-side section and replace the existing placeholder logic:
```tsx
      <box>
        <text fg={connectionColor}> ●</text>
        <HeaderBadge />
      </box>
```

## Step 3: Update `StatusBar` Component
**File:** `apps/tui/src/components/StatusBar.tsx`
**Action:** Integrate `StatusBarBadge` into the status bar layout.

**Modifications:**
1. Import `StatusBarBadge`: `import { StatusBarBadge } from "./NotificationBadge.js";`
2. Locate the right-side section before the help hint and insert the badge:
```tsx
      <box>
        <StatusBarBadge />
        <text fg={theme.muted}>  </text>
        <text fg={theme.primary}>?</text>
        <text fg={theme.muted}> help</text>
      </box>
```

## Step 4: Create E2E Tests
**File:** `e2e/tui/notifications.test.ts`
**Action:** Implement the 6 test scenarios defined in the engineering specification using `@microsoft/tui-test` and the `launchTUI` helper.

**Test Scenarios to Implement:**
1. **HeaderBadge Rendering and Hiding:** Verify header does not contain `[\d+]` when count is 0, contains `[5]` with `\x1b[38;5;178m` when count is 5, and contains `[99+]` when count is 150.
2. **StatusBarBadge Rendering and Styling:** Verify status bar contains `◆ 0` with `\x1b[38;5;245m` when count is 0, and `◆ 12` with `\x1b[38;5;33m` when count is 12.
3. **StatusBarBadge Pulse Animation:** Trigger SSE event, verify status bar updates to `◆ 3` with `\x1b[1m` (bold), wait 2100ms, and verify bold sequence is removed.
4. **Layout Constraints:** Launch with 150 notifications, resize terminal to 80x24, and verify `[99+]` and `◆ 99+` remain fully visible without being squished.
5. **Optimistic Decrements:** Press `g n` to navigate to notifications, trigger mark as read shortcut, and immediately verify counts drop before server response.
6. **SSE Disconnect Retainment:** Force SSE disconnect and verify both badges retain the last known count without resetting to 0 or disappearing.