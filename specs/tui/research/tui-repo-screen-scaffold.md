# Research Document: tui-repo-screen-scaffold

## 1. File Structure and Existential Checks

- `apps/tui/src/screens/PlaceholderScreen.tsx` exists and currently serves as a stub for unimplemented screens.
- `apps/tui/src/router/registry.ts` has `ScreenName.RepoOverview` currently set to `PlaceholderScreen`.
- `apps/tui/src/hooks/useScreenLoading.ts`, `apps/tui/src/components/FullScreenLoading.tsx`, `apps/tui/src/components/FullScreenError.tsx`, and `apps/tui/src/components/SkeletonDetail.tsx` are fully implemented and their APIs match the spec.
- `apps/tui/src/hooks/useLayout.ts` returns `{ width, breakpoint, contentHeight, ... }` which maps perfectly to the requirements for responsive rendering and determining whether we're on the `minimum` breakpoint.
- `apps/tui/src/util/format.ts` **does NOT** contain the `formatCompactNumber` utility mentioned in the spec (which claims it "already exists"). It will need to be implemented as part of this ticket.
- `apps/tui/src/hooks/data/` **does NOT** exist. The `useRepo` hook and the `Repository` type will need to be fully stubbed out per the spec's "Dependencies and Their Status" instructions.

## 2. OpenTUI Components API

Based on reading `context/opentui/packages/react/src/components/text.ts` and related files:
- `<box>`: Uses full flexbox layout (`flexDirection`, `flexGrow`, `justifyContent`, `alignItems`, `width`, `height`, `padding`, `paddingX`, `paddingY`, `gap`).
- `<text>`: Attributes can be configured using numeric bitfields (e.g., `1` for bold, `8` for underline, `9` for both). It supports `fg` (foreground) and `bg` (background) colors.
- `<b>` / `<strong>`: Provide built-in bold formatting over `<span>`.
- `<span>`: Used to style parts of a string inline using `fg`, `bg`, and `attributes`.
- `<scrollbox>`: Similar to `<box>` but supports scrolling properties (`scrollX`, `scrollY`, `focused`).

## 3. Data Hook Stubs Required

Since `packages/ui-core` / `apps/tui/src/hooks/data` don't contain the `Repository` type or `useRepo` hook, the scaffold requires these stubs to be created:

**`apps/tui/src/hooks/data/types.ts`:**
```typescript
export interface Repository {
  fullName: string;
  isPrivate: boolean;
  isArchived?: boolean;
  numStars: number;
  numForks: number;
  numWatches: number;
  numIssues: number;
  description?: string;
}
```

**`apps/tui/src/hooks/data/useRepo.ts`:**
```typescript
import { useState, useEffect } from "react";
import type { Repository } from "./types.js";

// STUB: Replace with import from @codeplane/ui-core when tui-repo-data-hooks ships
export function useRepo(owner: string, repo: string) {
  const [data, setData] = useState<Repository | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);

  useEffect(() => {
    setIsLoading(true);
    const timer = setTimeout(() => {
      if (repo.includes("404")) {
        setError({ message: "Not found", status: 404 });
        setIsLoading(false);
        return;
      }
      setData({
        fullName: `${owner}/${repo}`,
        isPrivate: false,
        isArchived: false,
        numStars: 42,
        numForks: 7,
        numWatches: 12,
        numIssues: 23,
        description: "A temporary repository stub for testing.",
      });
      setIsLoading(false);
    }, 100);
    return () => clearTimeout(timer);
  }, [owner, repo]);

  return { repo: data, isLoading, error, refetch: () => {} };
}
```

## 4. `formatCompactNumber` Stub Required

The spec incorrectly assumed `formatCompactNumber` existed in `apps/tui/src/util/format.ts`. We need to export it there:

**In `apps/tui/src/util/format.ts`:**
```typescript
/**
 * Format a number into a compact string representation (e.g., 1.2k, 3.5M).
 */
export function formatCompactNumber(num: number): string {
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  }
  if (num >= 1_000) {
    return (num / 1_000).toFixed(1).replace(/\.0$/, "") + "k";
  }
  return num.toString();
}
```

## 5. Integration Notes

- The `RepoOverviewScreen` logic detailed in the specification can be applied verbatim once the above stubs are in place.
- The `InlineTabBar` mentioned in the spec's fallback section will be necessary because `tui-repo-tab-bar-component` (which exports `TabBar`) has not yet been built.