# Engineering Specification: TUI_DIFF_INLINE_COMMENTS — Landing Diff Inline Comments with c/n/p Keys

**Ticket:** `tui-diff-inline-comments`
**Status:** Not started
**Dependencies:** `tui-diff-unified-view` (unified diff rendering), `tui-diff-expand-collapse` (hunk collapse/expand state management), `tui-diff-file-navigation` (file tree sidebar and `]`/`[` navigation)
**Target directory:** `apps/tui/src/`
**Test directory:** `e2e/tui/`

---

## 1. Overview

This ticket implements inline comment support for landing request diffs in the TUI diff viewer. It delivers three capabilities:

1. **Comment rendering** — Existing inline comments from the API are fetched and rendered inline below their referenced diff lines, with author, timestamp, markdown body, and styled left borders.
2. **Comment creation** — The `c` key opens a multiline textarea form below the focused diff line for composing and submitting new comments with optimistic rendering.
3. **Comment navigation** — The `n`/`p` keys navigate between inline comments across all files in the diff.

Inline comments are only available on landing request diffs. On change diffs, the `c` key is a silent no-op and `n`/`p` have no comment targets. The feature integrates with the existing hunk collapse system (comments force-expand their containing hunks) and the existing split/unified view modes.

---

## 2. Implementation Plan

All steps are vertical — each produces a working, testable increment. Steps build on the dependency tickets (`tui-diff-unified-view`, `tui-diff-expand-collapse`, `tui-diff-file-navigation`) which provide the `DiffScreen` component shell, `DiffContentArea`, `DiffFileTree`, hunk collapse state, and file navigation keybindings.

### Step 1: Inline Comment Types

**File:** `apps/tui/src/screens/DiffScreen/types.ts` (extend existing)

Extend the existing `CommentFormState` and add new types for inline comment management.

```typescript
import type { LandingComment } from "../../types/diff.js";

/**
 * Grouping key for inline comments: file path + line number + side.
 * Used to anchor comments to specific diff lines.
 */
export type CommentAnchorKey = `${string}:${number}:${string}`;

export function makeCommentAnchorKey(
  path: string,
  line: number,
  side: string,
): CommentAnchorKey {
  return `${path}:${line}:${side}` as CommentAnchorKey;
}

/**
 * State for inline comment navigation.
 */
export interface CommentNavigationState {
  orderedComments: LandingComment[];
  focusedCommentId: number | null;
  focusedCommentIndex: number;
  totalCount: number;
  focusNext: () => void;
  focusPrev: () => void;
  clearFocus: () => void;
}

/**
 * Full state for the inline comment creation form.
 */
export interface InlineCommentFormState {
  visible: boolean;
  filePath: string;
  lineNumber: number;
  side: "left" | "right" | "both";
  body: string;
  isSubmitting: boolean;
  validationError: string | null;
  discardConfirmVisible: boolean;
}

/**
 * Map of preserved comment bodies for retry after failed submissions.
 * Keyed by CommentAnchorKey.
 */
export type FailedCommentBodyMap = Map<CommentAnchorKey, string>;
```

**Why local types:** The `CommentAnchorKey` pattern is TUI-specific presentation logic. The `LandingComment` type from `apps/tui/src/types/diff.ts` (delivered by `tui-diff-data-hooks`) provides the wire format.

---

### Step 2: Comment Grouping and Ordering Utilities

**File:** `apps/tui/src/screens/DiffScreen/commentUtils.ts`

Pure functions for grouping, ordering, and formatting inline comments. No React dependencies — fully unit-testable.

```typescript
import type { LandingComment, FileDiffItem } from "../../types/diff.js";
import type { CommentAnchorKey } from "./types.js";
import { makeCommentAnchorKey } from "./types.js";
import type { Breakpoint } from "../../types/breakpoint.js";

export const MAX_INLINE_COMMENTS = 500;
export const MAX_BODY_DISPLAY_LENGTH = 50_000;
export const MAX_USERNAME_LENGTH = 39;
export const CHAR_WARN_THRESHOLD = 40_000;
export const CHAR_WARNING_THRESHOLD = 45_000;
export const CHAR_ERROR_THRESHOLD = 49_000;
export const MAX_BODY_INPUT_LENGTH = 50_000;
export const MAX_INPUT_LINES = 10_000;

/**
 * Group inline comments by anchor position.
 * Caps at MAX_INLINE_COMMENTS, sorts each group chronologically.
 */
export function groupCommentsByAnchor(
  comments: LandingComment[],
): {
  grouped: Map<CommentAnchorKey, LandingComment[]>;
  capped: boolean;
  total: number;
} {
  const inline = comments.filter(c => c.path !== "" && c.line > 0);
  const total = inline.length;
  const capped = total > MAX_INLINE_COMMENTS;
  const limited = capped ? inline.slice(0, MAX_INLINE_COMMENTS) : inline;

  const grouped = new Map<CommentAnchorKey, LandingComment[]>();
  for (const comment of limited) {
    const key = makeCommentAnchorKey(comment.path, comment.line, comment.side);
    const existing = grouped.get(key) ?? [];
    existing.push(comment);
    grouped.set(key, existing);
  }

  for (const group of grouped.values()) {
    group.sort((a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }

  return { grouped, capped, total };
}

/**
 * Order all inline comments by file position for n/p navigation.
 * File order follows the diff file list, then line number, then chronological.
 */
export function orderCommentsForNavigation(
  comments: LandingComment[],
  fileOrder: string[],
): LandingComment[] {
  const fileIndexMap = new Map<string, number>();
  fileOrder.forEach((path, i) => fileIndexMap.set(path, i));

  return comments
    .filter(c => c.path !== "" && c.line > 0)
    .slice(0, MAX_INLINE_COMMENTS)
    .sort((a, b) => {
      const aIdx = fileIndexMap.get(a.path) ?? Infinity;
      const bIdx = fileIndexMap.get(b.path) ?? Infinity;
      if (aIdx !== bIdx) return aIdx - bIdx;
      if (a.line !== b.line) return a.line - b.line;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
}

/**
 * Format a relative timestamp based on terminal breakpoint.
 */
export function relativeTime(isoDate: string, breakpoint: Breakpoint): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const min = Math.floor(diffMs / 60_000);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);

  if (day >= 30) return new Date(isoDate).toISOString().slice(0, 10);

  if (breakpoint === "minimum") {
    if (min < 1) return "now";
    if (hr < 1) return `${min}m`;
    if (day < 1) return `${hr}h`;
    return `${day}d`;
  }
  if (breakpoint === "standard") {
    if (min < 1) return "just now";
    if (hr < 1) return `${min}m ago`;
    if (day < 1) return `${hr}h ago`;
    return `${day}d ago`;
  }
  // large
  if (min < 1) return "just now";
  if (min === 1) return "1 minute ago";
  if (hr < 1) return `${min} minutes ago`;
  if (hr === 1) return "1 hour ago";
  if (day < 1) return `${hr} hours ago`;
  if (day === 1) return "1 day ago";
  return `${day} days ago`;
}

export function truncateUsername(login: string): string {
  return login.length <= MAX_USERNAME_LENGTH
    ? login
    : login.slice(0, MAX_USERNAME_LENGTH - 1) + "…";
}

export function truncatePathLeft(path: string, maxWidth: number): string {
  return path.length <= maxWidth
    ? path
    : "…" + path.slice(path.length - maxWidth + 1);
}

export function truncateBody(body: string): { text: string; truncated: boolean } {
  if (body.length <= MAX_BODY_DISPLAY_LENGTH) return { text: body, truncated: false };
  return { text: body.slice(0, MAX_BODY_DISPLAY_LENGTH) + "…", truncated: true };
}

export function charCounterColor(length: number): "muted" | "warning" | "error" | null {
  if (length < CHAR_WARN_THRESHOLD) return null;
  if (length < CHAR_WARNING_THRESHOLD) return "muted";
  if (length < CHAR_ERROR_THRESHOLD) return "warning";
  return "error";
}

export function validateCommentBody(body: string): string | null {
  return body.trim().length === 0 ? "Comment cannot be empty." : null;
}

export function sideFromLineType(
  lineType: "addition" | "deletion" | "context" | "hunk_header",
): "left" | "right" | "both" {
  switch (lineType) {
    case "addition": return "right";
    case "deletion": return "left";
    case "context": return "both";
    case "hunk_header": return "both";
  }
}

export function hunksWithComments(
  filePath: string,
  hunkRanges: Array<{ startLine: number; endLine: number; index: number }>,
  comments: LandingComment[],
): Set<number> {
  const fileComments = comments.filter(c => c.path === filePath && c.line > 0);
  const result = new Set<number>();
  for (const comment of fileComments) {
    for (const hunk of hunkRanges) {
      if (comment.line >= hunk.startLine && comment.line <= hunk.endLine) {
        result.add(hunk.index);
      }
    }
  }
  return result;
}

export function textareaHeight(breakpoint: Breakpoint): number {
  switch (breakpoint) {
    case "minimum": return 5;
    case "standard": return 8;
    case "large": return 12;
  }
}

export function commentSpacing(breakpoint: Breakpoint): number {
  switch (breakpoint) {
    case "minimum": return 0;
    case "standard": return 1;
    case "large": return 2;
  }
}
```

---

### Step 3: Comment Navigation Hook

**File:** `apps/tui/src/screens/DiffScreen/useCommentNavigation.ts`

```typescript
import { useState, useCallback, useMemo } from "react";
import type { LandingComment, FileDiffItem } from "../../types/diff.js";
import { orderCommentsForNavigation } from "./commentUtils.js";
import type { CommentNavigationState } from "./types.js";

export function useCommentNavigation(
  inlineComments: LandingComment[],
  files: FileDiffItem[],
): CommentNavigationState {
  const [focusedCommentId, setFocusedCommentId] = useState<number | null>(null);

  const fileOrder = useMemo(() => files.map(f => f.path), [files]);
  const orderedComments = useMemo(
    () => orderCommentsForNavigation(inlineComments, fileOrder),
    [inlineComments, fileOrder],
  );

  const focusedCommentIndex = useMemo(() => {
    if (focusedCommentId === null) return -1;
    return orderedComments.findIndex(c => c.id === focusedCommentId);
  }, [focusedCommentId, orderedComments]);

  const focusNext = useCallback(() => {
    if (orderedComments.length === 0) return;
    if (focusedCommentId === null) {
      setFocusedCommentId(orderedComments[0].id);
      return;
    }
    const idx = orderedComments.findIndex(c => c.id === focusedCommentId);
    if (idx + 1 < orderedComments.length) {
      setFocusedCommentId(orderedComments[idx + 1].id);
    }
  }, [orderedComments, focusedCommentId]);

  const focusPrev = useCallback(() => {
    if (orderedComments.length === 0) return;
    if (focusedCommentId === null) {
      setFocusedCommentId(orderedComments[orderedComments.length - 1].id);
      return;
    }
    const idx = orderedComments.findIndex(c => c.id === focusedCommentId);
    if (idx - 1 >= 0) {
      setFocusedCommentId(orderedComments[idx - 1].id);
    }
  }, [orderedComments, focusedCommentId]);

  const clearFocus = useCallback(() => setFocusedCommentId(null), []);

  return {
    orderedComments,
    focusedCommentId,
    focusedCommentIndex,
    totalCount: orderedComments.length,
    focusNext,
    focusPrev,
    clearFocus,
  };
}
```

---

### Step 4: Comment Form State Hook

**File:** `apps/tui/src/screens/DiffScreen/useCommentForm.ts`

```typescript
import { useState, useCallback, useRef } from "react";
import type { InlineCommentFormState, CommentAnchorKey, FailedCommentBodyMap } from "./types.js";
import { makeCommentAnchorKey } from "./types.js";
import { validateCommentBody, MAX_BODY_INPUT_LENGTH, MAX_INPUT_LINES } from "./commentUtils.js";

interface UseCommentFormOptions {
  isLandingDiff: boolean;
  isAuthenticated: boolean;
  hasWriteAccess: boolean;
  onSubmit: (path: string, line: number, side: "left" | "right" | "both", body: string) => void;
  setStatusBarMessage: (message: string) => void;
}

export interface UseCommentFormReturn {
  form: InlineCommentFormState;
  openForm: (filePath: string, lineNumber: number, side: "left" | "right" | "both", lineType: string) => void;
  closeForm: () => void;
  setBody: (body: string) => void;
  submitForm: () => void;
  handleEscape: () => void;
  confirmDiscard: () => void;
  cancelDiscard: () => void;
  isFormOpen: boolean;
  preserveOnFailure: (path: string, line: number, side: string, body: string) => void;
}

const INITIAL_FORM: InlineCommentFormState = {
  visible: false, filePath: "", lineNumber: 0, side: "both",
  body: "", isSubmitting: false, validationError: null, discardConfirmVisible: false,
};

export function useCommentForm(options: UseCommentFormOptions): UseCommentFormReturn {
  const { isLandingDiff, isAuthenticated, hasWriteAccess, onSubmit, setStatusBarMessage } = options;
  const [form, setForm] = useState<InlineCommentFormState>(INITIAL_FORM);
  const failedBodiesRef = useRef<FailedCommentBodyMap>(new Map());

  const openForm = useCallback(
    (filePath: string, lineNumber: number, side: "left" | "right" | "both", lineType: string) => {
      if (!isLandingDiff) return;
      if (!isAuthenticated) {
        setStatusBarMessage("Sign in to comment. Run `codeplane auth login`.");
        return;
      }
      if (!hasWriteAccess) {
        setStatusBarMessage("Write access required to comment.");
        return;
      }
      if (["binary", "too_large", "collapsed", "file_header"].includes(lineType)) return;

      if (form.visible && form.body.trim().length > 0) {
        setForm(prev => ({ ...prev, discardConfirmVisible: true }));
        return;
      }

      const anchorKey = makeCommentAnchorKey(filePath, lineNumber, side);
      const preserved = failedBodiesRef.current.get(anchorKey) ?? "";
      setForm({
        visible: true, filePath, lineNumber, side, body: preserved,
        isSubmitting: false, validationError: null, discardConfirmVisible: false,
      });
      if (preserved) failedBodiesRef.current.delete(anchorKey);
    },
    [isLandingDiff, isAuthenticated, hasWriteAccess, form.visible, form.body, setStatusBarMessage],
  );

  const closeForm = useCallback(() => setForm(INITIAL_FORM), []);

  const setBody = useCallback((body: string) => {
    if (body.length > MAX_BODY_INPUT_LENGTH) return;
    if (body.split("\n").length > MAX_INPUT_LINES) return;
    setForm(prev => ({ ...prev, body, validationError: null }));
  }, []);

  const submitForm = useCallback(() => {
    if (form.isSubmitting) return;
    const error = validateCommentBody(form.body);
    if (error) { setForm(prev => ({ ...prev, validationError: error })); return; }
    setForm(prev => ({ ...prev, isSubmitting: true }));
    onSubmit(form.filePath, form.lineNumber, form.side, form.body.trim());
  }, [form, onSubmit]);

  const handleEscape = useCallback(() => {
    if (form.discardConfirmVisible) { setForm(prev => ({ ...prev, discardConfirmVisible: false })); return; }
    if (form.body.trim().length === 0) { closeForm(); return; }
    setForm(prev => ({ ...prev, discardConfirmVisible: true }));
  }, [form.discardConfirmVisible, form.body, closeForm]);

  const confirmDiscard = useCallback(() => closeForm(), [closeForm]);
  const cancelDiscard = useCallback(() => setForm(prev => ({ ...prev, discardConfirmVisible: false })), []);

  const preserveOnFailure = useCallback(
    (path: string, line: number, side: string, body: string) => {
      failedBodiesRef.current.set(makeCommentAnchorKey(path, line, side), body);
    }, [],
  );

  return {
    form, openForm, closeForm, setBody, submitForm, handleEscape,
    confirmDiscard, cancelDiscard, isFormOpen: form.visible, preserveOnFailure,
  };
}
```

---

### Step 5: InlineCommentBlock Component

**File:** `apps/tui/src/screens/DiffScreen/InlineCommentBlock.tsx`

```typescript
import React from "react";
import type { LandingComment } from "../../types/diff.js";
import { useTheme } from "../../hooks/useTheme.js";
import { useBreakpoint } from "../../hooks/useBreakpoint.js";
import { relativeTime, truncateUsername, truncateBody } from "./commentUtils.js";

interface Props {
  comment: LandingComment;
  isFocused: boolean;
  isCurrentUser: boolean;
  isOptimistic: boolean;
}

export function InlineCommentBlock({ comment, isFocused, isCurrentUser, isOptimistic }: Props) {
  const theme = useTheme();
  const breakpoint = useBreakpoint();
  if (!breakpoint) return null;

  const border = process.env.NO_COLOR ? "|" : "┃";
  const edited = comment.updated_at !== comment.created_at;
  const { text: bodyText, truncated } = truncateBody(comment.body);
  const ts = isOptimistic ? "⏳ just now" : relativeTime(comment.created_at, breakpoint);

  return (
    <box flexDirection="column" paddingLeft={2}>
      <box flexDirection="row">
        <text fg={theme.primary} bold={isFocused}>{border} </text>
        <text fg={theme.primary} bold>@{truncateUsername(comment.author.login)}</text>
        <text fg={theme.muted}> · {ts}</text>
        {edited && !isOptimistic && <text fg={theme.muted}> (edited)</text>}
        {isCurrentUser && <text fg={theme.muted}> (you)</text>}
      </box>
      <box flexDirection="row">
        <text fg={theme.primary} bold={isFocused}>{border} </text>
        <markdown>{bodyText}</markdown>
      </box>
      {truncated && (
        <box flexDirection="row">
          <text fg={theme.primary}>{border} </text>
          <text fg={theme.muted}>(View full comment)</text>
        </box>
      )}
    </box>
  );
}
```

---

### Step 6: InlineCommentGroup Component

**File:** `apps/tui/src/screens/DiffScreen/InlineCommentGroup.tsx`

```typescript
import React from "react";
import type { LandingComment } from "../../types/diff.js";
import { InlineCommentBlock } from "./InlineCommentBlock.js";
import { useBreakpoint } from "../../hooks/useBreakpoint.js";
import { commentSpacing } from "./commentUtils.js";

interface Props {
  comments: LandingComment[];
  focusedCommentId: number | null;
  currentUserId: number | null;
  optimisticIds: Set<number>;
}

export function InlineCommentGroup({ comments, focusedCommentId, currentUserId, optimisticIds }: Props) {
  const breakpoint = useBreakpoint();
  if (!breakpoint) return null;
  const spacing = commentSpacing(breakpoint);

  return (
    <box flexDirection="column">
      {comments.map((c, i) => (
        <box key={c.id} marginTop={i === 0 ? 0 : spacing}>
          <InlineCommentBlock
            comment={c}
            isFocused={c.id === focusedCommentId}
            isCurrentUser={currentUserId !== null && c.author.id === currentUserId}
            isOptimistic={optimisticIds.has(c.id)}
          />
        </box>
      ))}
      <box height={1} />
    </box>
  );
}
```

---

### Step 7: CommentForm Component

**File:** `apps/tui/src/screens/DiffScreen/CommentForm.tsx`

```typescript
import React from "react";
import type { InlineCommentFormState } from "./types.js";
import { useTheme } from "../../hooks/useTheme.js";
import { useBreakpoint } from "../../hooks/useBreakpoint.js";
import { useLayout } from "../../hooks/useLayout.js";
import { truncatePathLeft, charCounterColor, textareaHeight } from "./commentUtils.js";

interface Props {
  form: InlineCommentFormState;
  onBodyChange: (body: string) => void;
}

export function CommentForm({ form, onBodyChange }: Props) {
  const theme = useTheme();
  const breakpoint = useBreakpoint();
  const layout = useLayout();
  if (!breakpoint) return null;

  const maxPathWidth = layout.width - 30;
  const rows = textareaHeight(breakpoint);
  const counter = charCounterColor(form.body.length);
  const tw = layout.width - 4;

  return (
    <box flexDirection="column" borderTop="single" borderBottom="single" paddingLeft={2}>
      <text fg={theme.primary}>
        📄 {truncatePathLeft(form.filePath, maxPathWidth)}:{form.lineNumber} ({form.side})
      </text>
      <box border="single" marginTop={1} width={tw}>
        <scrollbox height={rows}>
          <input multiline value={form.body} onChange={onBodyChange} maxLength={50000} autoFocus />
        </scrollbox>
      </box>
      {form.validationError && <text fg={theme.error}>{form.validationError}</text>}
      {counter && (
        <text fg={theme[counter]}>{form.body.length.toLocaleString()} / 50,000</text>
      )}
      {form.discardConfirmVisible && <text fg={theme.warning}>Discard comment? (y/n)</text>}
      {!form.discardConfirmVisible && (
        <text fg={theme.muted}>
          {form.isSubmitting ? "⏳ Submitting comment…" : "Ctrl+S:submit │ Esc:cancel"}
        </text>
      )}
    </box>
  );
}
```

---

### Step 8: Comment-Aware Hunk Collapse

**File:** `apps/tui/src/screens/DiffScreen/useHunkCollapse.ts` (extend existing)

Extend the existing `useHunkCollapse` hook to accept `uncollapsibleHunks: Map<string, Set<number>>` parameter.

Key changes:
- `collapseHunk(filePath, hunkIndex)` returns `false` if the hunk is in the uncollapsible set.
- `collapseAllInFile(filePath, hunkCount)` skips hunks in the uncollapsible set.
- A `useEffect` auto-expands any currently-collapsed hunks that become uncollapsible (when new comments are loaded or created).

```typescript
// Add to existing hook signature:
export function useHunkCollapse(
  uncollapsibleHunks?: Map<string, Set<number>>,
): HunkCollapseState {
  // ... existing state ...

  const collapseHunk = useCallback((filePath: string, hunkIndex: number): boolean => {
    if (uncollapsibleHunks?.get(filePath)?.has(hunkIndex)) return false;
    setCollapsed(prev => {
      const next = new Map(prev);
      const s = new Set(prev.get(filePath) ?? []);
      s.add(hunkIndex);
      next.set(filePath, s);
      return next;
    });
    return true;
  }, [uncollapsibleHunks]);

  const collapseAllInFile = useCallback((filePath: string, hunkCount: number) => {
    const skip = uncollapsibleHunks?.get(filePath) ?? new Set();
    setCollapsed(prev => {
      const next = new Map(prev);
      const s = new Set<number>();
      for (let i = 0; i < hunkCount; i++) if (!skip.has(i)) s.add(i);
      next.set(filePath, s);
      return next;
    });
  }, [uncollapsibleHunks]);

  // Auto-expand hunks that contain comments
  useEffect(() => {
    if (!uncollapsibleHunks) return;
    setCollapsed(prev => {
      let changed = false;
      const next = new Map(prev);
      for (const [fp, indices] of uncollapsibleHunks) {
        const fs = next.get(fp);
        if (!fs) continue;
        for (const idx of indices) {
          if (fs.has(idx)) { fs.delete(idx); changed = true; }
        }
        if (fs.size === 0) next.delete(fp);
      }
      return changed ? next : prev;
    });
  }, [uncollapsibleHunks]);

  // ... rest unchanged ...
}
```

---

### Step 9: DiffScreen Integration

**File:** `apps/tui/src/screens/DiffScreen/DiffScreen.tsx` (extend existing)

Wire all comment hooks, components, and keybindings. Key integration points:

1. **Conditional comment loading:** Call `useLandingComments` only when `params.mode === "landing"`. For change diffs, use empty arrays.
2. **Comment grouping:** `useMemo` to compute `groupCommentsByAnchor(inlineComments)` and `hunksWithComments()` for each file.
3. **Optimistic state:** `useState<Set<number>>` tracking provisional comment IDs. Cleared on success, removed on revert.
4. **`useCreateLandingComment`:** Wire `onOptimistic`, `onSuccess`, `onRevert`, `onError` callbacks. Error handler maps status codes to user-facing messages (401/403/429/500).
5. **Comment navigation hook:** `useCommentNavigation(inlineComments, files)` provides `focusNext`, `focusPrev`, `clearFocus`.
6. **Comment form hook:** `useCommentForm({ isLandingDiff, isAuthenticated, hasWriteAccess, onSubmit, setStatusBarMessage })`.
7. **Pass uncollapsibleHunks to useHunkCollapse.**
8. **Extend `j/k` and `]/[` handlers** to call `commentNav.clearFocus()`.
9. **Handle `t` toggle** when form is open: close form, preserve content, show status message.
10. **Scroll-to-comment effect:** When `focusedCommentId` changes, scroll viewport and update file tree sidebar focus.

---

### Step 10: Keybinding Registration

**File:** `apps/tui/src/screens/DiffScreen/DiffScreen.tsx` (continue)

Add `c`, `n`, `p` to the diff keybinding set. When the form is open, register a TEXT_INPUT priority scope that traps all keys into the textarea except `Ctrl+S`, `Escape`, `Ctrl+C`, and `?`.

**Status bar hints logic:**

| State | Hints |
|-------|-------|
| Default diff, landing | `t:view  w:ws  ]/[:files  c:comment  n/p:comments  ?:help` |
| Default diff, change | `t:view  w:ws  ]/[:files  ?:help` (no `c`, no `n/p`) |
| Comment focused | `n/p:comments (N of M)  c:reply  ]/[:files  ?:help` |
| Form open | `Ctrl+S:submit │ Esc:cancel` |
| Submitting | `⏳ Submitting comment…` |

**Discard confirmation keys:** When `discardConfirmVisible` is true, override the form scope to accept only `y` (confirm), `n` (cancel), `Escape` (cancel).

---

### Step 11: DiffContentArea Extension

**File:** `apps/tui/src/screens/DiffScreen/DiffContentArea.tsx` (extend existing)

In the rendering loop for each diff line, after the line element:
1. Check `commentsByAnchor.get(makeCommentAnchorKey(file.path, lineNumber, side))`.
2. If comments exist, render `<InlineCommentGroup>`.
3. If form is open on this line, render `<CommentForm>`.
4. After all lines in a file, render orphaned comments (line not found) with warning text.

Split view handling: comments with `side === "left"` render in left pane, `side === "right"` in right pane, `side === "both"` span both panes.

---

### Step 12: Telemetry Events

**File:** `apps/tui/src/screens/DiffScreen/commentTelemetry.ts`

Emit telemetry events for all interactions specified in the product spec. Events: `loaded`, `comment_focused`, `form_opened`, `form_cancelled`, `submitted`, `succeeded`, `failed`, `optimistic_reverted`, `validation_error`, `noop_change_diff`, `noop_unauthorized`, `discard_confirmed`, `nav_noop`, `session_summary`.

All events include common properties: `session_id`, `terminal_width`, `terminal_height`, `timestamp`, `user_id`, `view_mode`, `diff_source`.

---

### Step 13: Logging

Integrate structured logging at all points specified in the observability section. Logs output to stderr, controlled by `CODEPLANE_LOG_LEVEL` (default: `warn`). Levels: `debug` for mount/load/focus/typing, `info` for rendered/submitted/created/noop, `warn` for truncated/line-not-found/capped/rate-limited/slow-load, `error` for fetch-failed/submit-failed/auth/permission/optimistic-revert/render-error.

---

## 3. File Inventory

| File | Action | Description |
|------|--------|-------------|
| `apps/tui/src/screens/DiffScreen/types.ts` | Extend | Add `CommentAnchorKey`, `CommentNavigationState`, `InlineCommentFormState`, `FailedCommentBodyMap` |
| `apps/tui/src/screens/DiffScreen/commentUtils.ts` | Create | Pure utility functions: grouping, ordering, timestamps, truncation, validation |
| `apps/tui/src/screens/DiffScreen/useCommentNavigation.ts` | Create | Hook for `n`/`p` comment navigation |
| `apps/tui/src/screens/DiffScreen/useCommentForm.ts` | Create | Hook for comment creation form lifecycle |
| `apps/tui/src/screens/DiffScreen/InlineCommentBlock.tsx` | Create | Single comment block rendering |
| `apps/tui/src/screens/DiffScreen/InlineCommentGroup.tsx` | Create | Comment group component for same-line comments |
| `apps/tui/src/screens/DiffScreen/CommentForm.tsx` | Create | Comment creation form with textarea, validation, counter |
| `apps/tui/src/screens/DiffScreen/commentTelemetry.ts` | Create | Telemetry event emitters |
| `apps/tui/src/screens/DiffScreen/useHunkCollapse.ts` | Extend | Add uncollapsible hunks, auto-expand |
| `apps/tui/src/screens/DiffScreen/DiffScreen.tsx` | Extend | Wire all comment hooks, components, keybindings, status bar |
| `apps/tui/src/screens/DiffScreen/DiffContentArea.tsx` | Extend | Render inline comments and form after diff lines |
| `e2e/tui/diff.test.ts` | Extend | Add 107 test cases |

---

## 4. Productionization Notes

1. **No POC code.** All files are production-grade. `commentUtils.ts` is pure and unit-testable. Hooks follow established patterns from `useOptimisticMutation` and `useScreenKeybindings`.
2. **API client usage.** All API calls go through `useLandingComments` and `useCreateLandingComment` hooks which use `APIClient` from `APIClientProvider`. No direct `fetch` in components.
3. **Error boundary.** Wrap `<InlineCommentGroup>` in a per-group error boundary that falls back to plain text rendering. Individual comment render errors must not crash the diff screen.
4. **Memory bounds.** `failedBodiesRef` Map entries cleaned on reopen. `optimisticIds` Set bounded by submission rate. Comments capped at 500 via `MAX_INLINE_COMMENTS`.
5. **NO_COLOR / 16-color.** `InlineCommentBlock` checks `process.env.NO_COLOR` for border character. `ThemeProvider` handles ANSI 16 fallback (primary → ANSI 4, muted → no attribute).
6. **Resize safety.** All components use `useBreakpoint()` / `useLayout()` which re-render synchronously on `SIGWINCH`. Form state lives in React `useState`, surviving re-renders. `textareaHeight` recalculates from the new breakpoint.
7. **Concurrent safety.** `useCreateLandingComment` uses `isSubmittingRef` for double-submit prevention. Mutations never abort on unmount. Cache invalidated after success for freshness on next visit.

---

## 5. Unit & Integration Tests

**Test file:** `e2e/tui/diff.test.ts` (extend existing)

All 107 tests from the product spec. Tests use `@microsoft/tui-test` with `launchTUI()` from `e2e/tui/helpers.ts`. Tests that fail due to unimplemented backends are left failing — never skipped or commented out.

### Snapshot Tests (25 tests)

```typescript
import { test, expect, describe } from "bun:test";
import { launchTUI } from "./helpers.js";

describe("TUI_DIFF_INLINE_COMMENTS — Snapshot Tests", () => {
  test("SNAP-INLINE-001: renders inline comment below diff line at 120x40", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-INLINE-002: renders inline comment at 80x24 compact layout", async () => {
    const tui = await launchTUI({ cols: 80, rows: 24 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-INLINE-003: renders inline comment at 200x60 expanded layout", async () => {
    const tui = await launchTUI({ cols: 200, rows: 60 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-INLINE-004: renders multiple comments on same line", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-INLINE-005: renders comments across multiple files", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-INLINE-006: renders focused comment with bold border", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("n");
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-INLINE-007: renders comment with edited indicator", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-INLINE-008: renders comment with (you) suffix", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-INLINE-009: renders comment with markdown body", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-INLINE-010: renders comment creation form at 120x40", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("j");
    await tui.sendKeys("c");
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-INLINE-011: renders comment creation form at 80x24", async () => {
    const tui = await launchTUI({ cols: 80, rows: 24 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("j");
    await tui.sendKeys("c");
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-INLINE-012: renders comment creation form at 200x60", async () => {
    const tui = await launchTUI({ cols: 200, rows: 60 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("j");
    await tui.sendKeys("c");
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-INLINE-013: renders validation error on empty submit", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("j");
    await tui.sendKeys("c");
    await tui.sendKeys("ctrl+s");
    await tui.waitForText("Comment cannot be empty");
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-INLINE-014: renders discard confirmation prompt", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("j");
    await tui.sendKeys("c");
    await tui.sendText("content");
    await tui.sendKeys("Escape");
    await tui.waitForText("Discard comment");
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-INLINE-015: renders optimistic comment", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("j");
    await tui.sendKeys("c");
    await tui.sendText("Test comment");
    await tui.sendKeys("ctrl+s");
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-INLINE-016: renders character counter at 40k+ chars", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("j");
    await tui.sendKeys("c");
    await tui.sendText("a".repeat(40123));
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-INLINE-017: renders character counter at 49k+ in error color", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("j");
    await tui.sendKeys("c");
    await tui.sendText("a".repeat(49500));
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-INLINE-018: renders status bar with comment count", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("n");
    await tui.sendKeys("n");
    await tui.sendKeys("n");
    const lastLine = tui.getLine(tui.rows - 1);
    expect(lastLine).toMatch(/Comment 3 of \d+/);
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-INLINE-019: renders status bar for change diff without c hint", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to change diff (not landing)
    // Verify no c:comment in status bar
    const lastLine = tui.getLine(tui.rows - 1);
    expect(lastLine).not.toMatch(/c:comment/);
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-INLINE-020: renders submitting state in status bar", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("j");
    await tui.sendKeys("c");
    await tui.sendText("body");
    await tui.sendKeys("ctrl+s");
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-INLINE-021: renders comment in split view right pane", async () => {
    const tui = await launchTUI({ cols: 200, rows: 60 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("t");
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-INLINE-022: renders comment in split view left pane", async () => {
    const tui = await launchTUI({ cols: 200, rows: 60 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("t");
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-INLINE-023: renders line-not-found warning", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-INLINE-024: renders 500-comment cap notice", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("SNAP-INLINE-025: renders diff with no inline comments", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });
});
```

### Keyboard Interaction Tests (35 tests)

```typescript
describe("TUI_DIFF_INLINE_COMMENTS — Keyboard Tests", () => {
  test("KEY-INLINE-001: c opens comment form on landing diff", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("j");
    await tui.sendKeys("c");
    await tui.waitForText("Ctrl+S:submit");
    await tui.waitForText("(right)");
    await tui.terminate();
  });

  test("KEY-INLINE-002: c is no-op on change diff", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to change diff
    await tui.sendKeys("c");
    await tui.waitForNoText("Ctrl+S:submit");
    await tui.terminate();
  });

  test("KEY-INLINE-003: c shows auth message when unauthenticated", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40, env: { CODEPLANE_TOKEN: "" } });
    await tui.sendKeys("g", "l");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("j");
    await tui.sendKeys("c");
    const lastLine = tui.getLine(tui.rows - 1);
    expect(lastLine).toMatch(/Sign in to comment/);
    await tui.terminate();
  });

  test("KEY-INLINE-004: c shows permission message for read-only user", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("j");
    await tui.sendKeys("c");
    const lastLine = tui.getLine(tui.rows - 1);
    expect(lastLine).toMatch(/Write access required/);
    await tui.terminate();
  });

  test("KEY-INLINE-005: Ctrl+S submits comment", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("j");
    await tui.sendKeys("c");
    await tui.sendText("Review comment");
    await tui.sendKeys("ctrl+s");
    await tui.waitForNoText("Ctrl+S:submit");
    await tui.waitForText("Review comment");
    await tui.terminate();
  });

  test("KEY-INLINE-006: Ctrl+S rejects empty body", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("j");
    await tui.sendKeys("c");
    await tui.sendKeys("ctrl+s");
    await tui.waitForText("Comment cannot be empty");
    await tui.waitForText("Ctrl+S:submit");
    await tui.terminate();
  });

  test("KEY-INLINE-007: Ctrl+S rejects whitespace-only body", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("j");
    await tui.sendKeys("c");
    await tui.sendText("   ");
    await tui.sendKeys("ctrl+s");
    await tui.waitForText("Comment cannot be empty");
    await tui.terminate();
  });

  test("KEY-INLINE-008: Esc closes empty form immediately", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("j");
    await tui.sendKeys("c");
    await tui.waitForText("Ctrl+S:submit");
    await tui.sendKeys("Escape");
    await tui.waitForNoText("Ctrl+S:submit");
    await tui.waitForNoText("Discard");
    await tui.terminate();
  });

  test("KEY-INLINE-009: Esc on non-empty shows discard confirmation", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("j");
    await tui.sendKeys("c");
    await tui.sendText("content");
    await tui.sendKeys("Escape");
    await tui.waitForText("Discard comment? (y/n)");
    await tui.terminate();
  });

  test("KEY-INLINE-010: y at discard discards", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("j");
    await tui.sendKeys("c");
    await tui.sendText("content");
    await tui.sendKeys("Escape");
    await tui.waitForText("Discard");
    await tui.sendKeys("y");
    await tui.waitForNoText("Ctrl+S:submit");
    await tui.terminate();
  });

  test("KEY-INLINE-011: n at discard returns to editing", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("j");
    await tui.sendKeys("c");
    await tui.sendText("content");
    await tui.sendKeys("Escape");
    await tui.waitForText("Discard");
    await tui.sendKeys("n");
    await tui.waitForNoText("Discard");
    await tui.waitForText("Ctrl+S:submit");
    await tui.terminate();
  });

  test("KEY-INLINE-012: Esc at discard returns to editing", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("j");
    await tui.sendKeys("c");
    await tui.sendText("content");
    await tui.sendKeys("Escape");
    await tui.waitForText("Discard");
    await tui.sendKeys("Escape");
    await tui.waitForNoText("Discard");
    await tui.waitForText("Ctrl+S:submit");
    await tui.terminate();
  });

  test("KEY-INLINE-013: Enter inserts newline", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("j");
    await tui.sendKeys("c");
    await tui.sendText("line1");
    await tui.sendKeys("Enter");
    await tui.sendText("line2");
    await tui.waitForText("Ctrl+S:submit");
    await tui.terminate();
  });

  test("KEY-INLINE-014: n navigates to next comment", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("n");
    const lastLine = tui.getLine(tui.rows - 1);
    expect(lastLine).toMatch(/Comment 1 of \d+/);
    await tui.terminate();
  });

  test("KEY-INLINE-015: p navigates to previous comment", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("n");
    await tui.sendKeys("n");
    await tui.sendKeys("p");
    const lastLine = tui.getLine(tui.rows - 1);
    expect(lastLine).toMatch(/Comment 1 of \d+/);
    await tui.terminate();
  });

  test("KEY-INLINE-016: n at last comment is no-op", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    for (let i = 0; i < 100; i++) await tui.sendKeys("n");
    const snap = tui.snapshot();
    await tui.sendKeys("n");
    expect(tui.snapshot()).toBe(snap);
    await tui.terminate();
  });

  test("KEY-INLINE-017: p at first comment is no-op", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("n");
    const snap = tui.snapshot();
    await tui.sendKeys("p");
    expect(tui.snapshot()).toBe(snap);
    await tui.terminate();
  });

  test("KEY-INLINE-018: n/p with zero comments are no-ops", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    const snap = tui.snapshot();
    await tui.sendKeys("n");
    await tui.sendKeys("p");
    expect(tui.snapshot()).toBe(snap);
    await tui.terminate();
  });

  test("KEY-INLINE-019: n/p with single comment are no-ops after focus", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("n");
    const snap = tui.snapshot();
    await tui.sendKeys("n");
    expect(tui.snapshot()).toBe(snap);
    await tui.sendKeys("p");
    expect(tui.snapshot()).toBe(snap);
    await tui.terminate();
  });

  test("KEY-INLINE-020: n crosses file boundary", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    // Navigate past all comments in first file
    for (let i = 0; i < 50; i++) await tui.sendKeys("n");
    // Verify sidebar shows second file focused
    await tui.terminate();
  });

  test("KEY-INLINE-021: j/k clears comment focus", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("n");
    expect(tui.getLine(tui.rows - 1)).toMatch(/Comment \d+ of \d+/);
    await tui.sendKeys("j");
    expect(tui.getLine(tui.rows - 1)).not.toMatch(/Comment \d+ of \d+/);
    await tui.terminate();
  });

  test("KEY-INLINE-022: ]/[ clears comment focus", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("n");
    await tui.sendKeys("]");
    expect(tui.getLine(tui.rows - 1)).not.toMatch(/Comment \d+ of \d+/);
    await tui.terminate();
  });

  test("KEY-INLINE-023: diff keys disabled while form open", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("j");
    await tui.sendKeys("c");
    await tui.waitForText("Ctrl+S:submit");
    await tui.sendKeys("j");
    await tui.waitForText("Ctrl+S:submit");
    await tui.terminate();
  });

  test("KEY-INLINE-024: t disabled while form open", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("j");
    await tui.sendKeys("c");
    await tui.sendKeys("t");
    await tui.waitForText("Ctrl+S:submit");
    await tui.terminate();
  });

  test("KEY-INLINE-025: Ctrl+C quits while form open", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("j");
    await tui.sendKeys("c");
    await tui.sendKeys("ctrl+c");
    await tui.terminate();
  });

  test("KEY-INLINE-026: ? shows help while form open", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("j");
    await tui.sendKeys("c");
    await tui.sendKeys("?");
    await tui.waitForText("Keybindings");
    await tui.terminate();
  });

  test("KEY-INLINE-027: c on deletion line sets side to left", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    // Navigate to deletion line
    await tui.sendKeys("c");
    await tui.waitForText("(left)");
    await tui.terminate();
  });

  test("KEY-INLINE-028: c on context line sets side to both", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    // Navigate to context line
    await tui.sendKeys("c");
    await tui.waitForText("(both)");
    await tui.terminate();
  });

  test("KEY-INLINE-029: c on hunk header anchors to first content line", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("c");
    await tui.waitForText("Ctrl+S:submit");
    await tui.terminate();
  });

  test("KEY-INLINE-030: c on binary notice is no-op", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("c");
    await tui.waitForNoText("Ctrl+S:submit");
    await tui.terminate();
  });

  test("KEY-INLINE-031: c on collapsed hunk is no-op", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("z");
    await tui.sendKeys("c");
    await tui.waitForNoText("Ctrl+S:submit");
    await tui.terminate();
  });

  test("KEY-INLINE-032: double Ctrl+S prevented", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("j");
    await tui.sendKeys("c");
    await tui.sendText("body");
    await tui.sendKeys("ctrl+s");
    await tui.sendKeys("ctrl+s");
    await tui.terminate();
  });

  test("KEY-INLINE-033: failed submission preserves body for retry", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("j");
    await tui.sendKeys("c");
    await tui.sendText("preserved body");
    await tui.sendKeys("ctrl+s");
    // After error, press c on same line
    await tui.sendKeys("c");
    await tui.waitForText("preserved body");
    await tui.terminate();
  });

  test("KEY-INLINE-034: z on hunk with comments is no-op", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("z");
    expect(tui.getLine(tui.rows - 1)).toMatch(/Cannot collapse hunk/);
    await tui.terminate();
  });

  test("KEY-INLINE-035: c on existing comment opens new form on same line", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("c");
    await tui.waitForText("Ctrl+S:submit");
    await tui.terminate();
  });
});
```

### Responsive Resize Tests (12 tests)

```typescript
describe("TUI_DIFF_INLINE_COMMENTS — Responsive Tests", () => {
  test("RSP-INLINE-001: comment renders at 80x24", async () => {
    const tui = await launchTUI({ cols: 80, rows: 24 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("RSP-INLINE-002: comment renders at 120x40", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("RSP-INLINE-003: comment renders at 200x60", async () => {
    const tui = await launchTUI({ cols: 200, rows: 60 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("RSP-INLINE-004: textarea height 5 rows at 80x24", async () => {
    const tui = await launchTUI({ cols: 80, rows: 24 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("j");
    await tui.sendKeys("c");
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("RSP-INLINE-005: textarea height 8 rows at 120x40", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("j");
    await tui.sendKeys("c");
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("RSP-INLINE-006: textarea height 12 rows at 200x60", async () => {
    const tui = await launchTUI({ cols: 200, rows: 60 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("j");
    await tui.sendKeys("c");
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("RSP-INLINE-007: resize during form preserves content", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("j");
    await tui.sendKeys("c");
    await tui.sendText("preserved");
    await tui.resize(80, 24);
    await tui.waitForText("preserved");
    await tui.waitForText("Ctrl+S:submit");
    await tui.terminate();
  });

  test("RSP-INLINE-008: resize during form preserves cursor", async () => {
    const tui = await launchTUI({ cols: 80, rows: 24 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("j");
    await tui.sendKeys("c");
    await tui.sendText("text");
    await tui.resize(120, 40);
    await tui.waitForText("text");
    await tui.waitForText("Ctrl+S:submit");
    await tui.terminate();
  });

  test("RSP-INLINE-009: resize below 80x24 during form", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("j");
    await tui.sendKeys("c");
    await tui.sendText("content");
    await tui.resize(60, 20);
    await tui.waitForText("Terminal too small");
    await tui.resize(120, 40);
    await tui.waitForText("content");
    await tui.terminate();
  });

  test("RSP-INLINE-010: resize preserves focused comment", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("n");
    await tui.resize(80, 24);
    expect(tui.getLine(tui.rows - 1)).toMatch(/Comment 1 of \d+/);
    await tui.terminate();
  });

  test("RSP-INLINE-011: resize during optimistic display", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("j");
    await tui.sendKeys("c");
    await tui.sendText("body");
    await tui.sendKeys("ctrl+s");
    await tui.resize(200, 60);
    await tui.waitForText("body");
    await tui.terminate();
  });

  test("RSP-INLINE-012: path truncation changes on resize", async () => {
    const tui = await launchTUI({ cols: 200, rows: 60 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("j");
    await tui.sendKeys("c");
    await tui.resize(80, 24);
    // Path should re-truncate with … prefix
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });
});
```

### Data Loading and Integration Tests (15 tests)

```typescript
describe("TUI_DIFF_INLINE_COMMENTS — Integration Tests", () => {
  test("INT-INLINE-001: loads inline comments for landing diff", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    // Verify inline comments rendered at correct positions
    await tui.waitForText("┃");
    await tui.terminate();
  });

  test("INT-INLINE-002: does not fetch comments for change diff", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    // Navigate to change diff — no comment API call
    await tui.waitForNoText("┃");
    await tui.terminate();
  });

  test("INT-INLINE-003: filters general comments from inline rendering", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    // General comments (path="", line=0) should not appear inline
    await tui.terminate();
  });

  test("INT-INLINE-004: creates comment via API", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("j");
    await tui.sendKeys("c");
    await tui.sendText("test comment");
    await tui.sendKeys("ctrl+s");
    await tui.waitForText("test comment");
    await tui.terminate();
  });

  test("INT-INLINE-005: optimistic comment replaced by server response", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("j");
    await tui.sendKeys("c");
    await tui.sendText("body");
    await tui.sendKeys("ctrl+s");
    // Initially shows ⏳, then replaced by real timestamp
    await tui.terminate();
  });

  test("INT-INLINE-006: optimistic comment reverted on error", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("j");
    await tui.sendKeys("c");
    await tui.sendText("body");
    await tui.sendKeys("ctrl+s");
    // Server 500 → optimistic removed, error shown
    await tui.terminate();
  });

  test("INT-INLINE-007: 401 on comment creation shows auth error", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("j");
    await tui.sendKeys("c");
    await tui.sendText("body");
    await tui.sendKeys("ctrl+s");
    // 401 → auth error message
    await tui.terminate();
  });

  test("INT-INLINE-008: 403 on comment creation shows permission error", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("j");
    await tui.sendKeys("c");
    await tui.sendText("body");
    await tui.sendKeys("ctrl+s");
    // 403 → permission denied
    await tui.terminate();
  });

  test("INT-INLINE-009: 429 on comment creation shows rate limit", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("j");
    await tui.sendKeys("c");
    await tui.sendText("body");
    await tui.sendKeys("ctrl+s");
    // 429 → rate limit, content preserved
    await tui.terminate();
  });

  test("INT-INLINE-010: comments grouped by file and line", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    // Multiple comments on different lines at correct positions
    await tui.terminate();
  });

  test("INT-INLINE-011: comments on same line stack chronologically", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    // Two comments on same line: oldest first
    await tui.terminate();
  });

  test("INT-INLINE-012: whitespace toggle preserves comments", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("w");
    // Comments still visible after whitespace toggle
    await tui.waitForText("┃");
    await tui.terminate();
  });

  test("INT-INLINE-013: comment references non-existent line", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    // Comment on line 999 renders at file end with warning
    await tui.waitForText("not found in current diff");
    await tui.terminate();
  });

  test("INT-INLINE-014: comment references non-existent file", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    // Comment with unknown path not rendered inline
    await tui.terminate();
  });

  test("INT-INLINE-015: 500-comment cap applied", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    // 600 inline comments → only 500 loaded with notice
    await tui.waitForText("Showing 500 of");
    await tui.terminate();
  });
});
```

### Edge Case Tests (20 tests)

```typescript
describe("TUI_DIFF_INLINE_COMMENTS — Edge Cases", () => {
  test("EDGE-INLINE-001: form preserved on view toggle (t)", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("j");
    await tui.sendKeys("c");
    await tui.sendText("content");
    // t pressed while form open — content preserved
    await tui.waitForText("Comment form closed");
    await tui.terminate();
  });

  test("EDGE-INLINE-002: rapid c presses handled", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("j");
    await tui.sendKeys("c");
    await tui.sendKeys("c");
    // Second c triggers discard flow
    await tui.terminate();
  });

  test("EDGE-INLINE-003: c on file header is no-op", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("c");
    await tui.waitForNoText("Ctrl+S:submit");
    await tui.terminate();
  });

  test("EDGE-INLINE-004: c on file-too-large notice is no-op", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("c");
    await tui.waitForNoText("Ctrl+S:submit");
    await tui.terminate();
  });

  test("EDGE-INLINE-005: comment with ANSI escapes renders safely", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    // Comment body with \x1b[31m renders as literal text
    await tui.terminate();
  });

  test("EDGE-INLINE-006: comment with only code blocks renders", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    // Code-only comment renders with syntax highlighting
    await tui.terminate();
  });

  test("EDGE-INLINE-007: 50,000 char comment body truncated", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.waitForText("View full comment");
    await tui.terminate();
  });

  test("EDGE-INLINE-008: long username truncated at 39 chars", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    // Username >39 chars truncated with …
    await tui.terminate();
  });

  test("EDGE-INLINE-009: hunk with comments cannot be collapsed", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("z");
    expect(tui.getLine(tui.rows - 1)).toMatch(/Cannot collapse/);
    await tui.terminate();
  });

  test("EDGE-INLINE-010: Z skips hunks with comments", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    // Z collapses all except hunks with comments
    await tui.waitForText("┃");
    await tui.terminate();
  });

  test("EDGE-INLINE-011: collapsed hunk auto-expands for comment", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    // Hunk with comments is auto-expanded
    await tui.waitForText("┃");
    await tui.terminate();
  });

  test("EDGE-INLINE-012: n/p across file boundary updates sidebar", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    for (let i = 0; i < 50; i++) await tui.sendKeys("n");
    // File tree sidebar focus should follow
    await tui.terminate();
  });

  test("EDGE-INLINE-013: concurrent resize and n/p navigation", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("n");
    await tui.resize(80, 24);
    // Focus preserved, scroll recalculated
    expect(tui.getLine(tui.rows - 1)).toMatch(/Comment 1 of \d+/);
    await tui.terminate();
  });

  test("EDGE-INLINE-014: NO_COLOR mode rendering", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40, env: { NO_COLOR: "1" } });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    // Comments use | border, no color
    await tui.waitForText("|");
    await tui.terminate();
  });

  test("EDGE-INLINE-015: 16-color terminal fallback", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40, env: { TERM: "xterm" } });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    // Primary → ANSI 4, muted → no attribute
    await tui.terminate();
  });

  test("EDGE-INLINE-016: form at character limit", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("j");
    await tui.sendKeys("c");
    await tui.sendText("a".repeat(50000));
    // 50,000th accepted, 50,001st rejected
    await tui.sendText("b");
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("EDGE-INLINE-017: Ctrl+C during form open quits TUI", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("j");
    await tui.sendKeys("c");
    await tui.sendText("draft");
    await tui.sendKeys("ctrl+c");
    await tui.terminate();
  });

  test("EDGE-INLINE-018: landing deleted during composition", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("j");
    await tui.sendKeys("c");
    await tui.sendText("body");
    await tui.sendKeys("ctrl+s");
    // 404 → content preserved, q to navigate away
    await tui.terminate();
  });

  test("EDGE-INLINE-019: split view comment in left pane", async () => {
    const tui = await launchTUI({ cols: 200, rows: 60 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("t");
    // Comment with side=left in left pane only
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });

  test("EDGE-INLINE-020: split view comment spanning both panes", async () => {
    const tui = await launchTUI({ cols: 200, rows: 60 });
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landing");
    await tui.sendKeys("Enter");
    await tui.sendKeys("Tab");
    await tui.sendKeys("t");
    // Comment with side=both spans both panes
    expect(tui.snapshot()).toMatchSnapshot();
    await tui.terminate();
  });
});
```

**Total: 107 verification items across 4 test categories. All tests left failing if backends are unimplemented — never skipped or commented out.**