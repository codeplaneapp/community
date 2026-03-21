# Implementation Plan: tui-workspace-status-badge

## 1. Setup Component Directory
**File:** `apps/tui/src/components/index.ts`
**Action:** Create file (and directory if it doesn't exist).
**Details:**
Create the initial barrel export for the TUI components directory.
```typescript
export { WorkspaceStatusBadge } from "./WorkspaceStatusBadge.js";
export type {
  WorkspaceStatusBadgeProps,
  WorkspaceDisplayStatus,
} from "./WorkspaceStatusBadge.js";
```

## 2. Implement WorkspaceStatusBadge Component
**File:** `apps/tui/src/components/WorkspaceStatusBadge.tsx`
**Action:** Create file.
**Details:**
Implement the component exactly as specified in the engineering spec.
- Define `WorkspaceDisplayStatus` extended type.
- Create immutable `STATUS_CONFIG` mapping each status to a semantic color (`tokenName`), animation state, and `label`.
- Detect terminal unicode capability for the static dot.
- Rely on `useTheme()`, `useSpinner()`, and `useLayout()` to control appearance, animation, and responsiveness.

```typescript
import React from "react";
import type { RGBA } from "@opentui/core";
import type { ThemeTokens } from "../theme/tokens.js";
import { isUnicodeSupported } from "../theme/detect.js";
import { useTheme } from "../hooks/useTheme.js";
import { useSpinner } from "../hooks/useSpinner.js";
import { useLayout } from "../hooks/useLayout.js";
```