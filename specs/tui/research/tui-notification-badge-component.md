# Research: Notification Badge Components

## Overview
This document outlines the findings and implementation plan for the `tui-notification-badge-component` ticket. The goal is to create `HeaderBadge` and `StatusBarBadge` components that display real-time notification counts, and integrate them into the existing TUI layout.

## 1. Creating `NotificationBadge.tsx`
**Target Path:** `apps/tui/src/components/NotificationBadge.tsx`

Based on the OpenTUI usage in the repository, OpenTUI primitives like `<box>` and `<text>` are intrinsic elements and do not need to be imported. The `useTheme` hook is available at `apps/tui/src/hooks/useTheme.js`.

```tsx
import React, { useEffect, useState, useRef } from "react";
import { useTheme } from "../hooks/useTheme.js";
// Note: @codeplane/ui-core is currently either external or not yet implemented in this repository.
// The specification expects this import to resolve eventually.
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

## 2. Integrating into `HeaderBar.tsx`
**File:** `apps/tui/src/components/HeaderBar.tsx`

Currently, `HeaderBar.tsx` contains a placeholder for `unreadCount` at lines 14 and 44-48.

**Modifications needed:**
1. Import the component: `import { HeaderBadge } from "./NotificationBadge.js";`
2. Remove `const unreadCount = 0; // placeholder`
3. Update the render logic at the end of the return statement:

**Before:**
```tsx
      <box>
        <text fg={connectionColor}> ●</text>
        {unreadCount > 0 && <text fg={theme.primary}> {unreadCount}</text>}
      </box>
```

**After:**
```tsx
      <box>
        <text fg={connectionColor}> ●</text>
        <HeaderBadge />
      </box>
```

## 3. Integrating into `StatusBar.tsx`
**File:** `apps/tui/src/components/StatusBar.tsx`

The `StatusBar` component needs the badge positioned right before the help hint.

**Modifications needed:**
1. Import the component: `import { StatusBarBadge } from "./NotificationBadge.js";`
2. Update the final `<box>` containing the help hint:

**Before:**
```tsx
      <box>
        <text fg={theme.muted}>  </text>
        <text fg={theme.primary}>?</text>
        <text fg={theme.muted}> help</text>
      </box>
```

**After:**
```tsx
      <box>
        <StatusBarBadge />
        <text fg={theme.muted}>  </text>
        <text fg={theme.primary}>?</text>
        <text fg={theme.muted}> help</text>
      </box>
```

## 4. End-to-End Tests
**Target Path:** `e2e/tui/notifications.test.ts`

A new E2E test file must be created to implement the 6 test scenarios defined in the engineering spec.

The repository uses `@microsoft/tui-test`. A robust helper exists at `e2e/tui/helpers.ts` which provides `launchTUI()` to spawn a real headless PTY terminal and returns a `TUITestInstance`. This instance provides methods like `.getLine()`, `.resize()`, `.waitForText()`, and `.sendKeys()`.

The test file should mock or configure the E2E backend through environment variables provided to `launchTUI({ env: ... })` (e.g., configuring `CODEPLANE_API_URL` to point to a test API that can stream SSE events).