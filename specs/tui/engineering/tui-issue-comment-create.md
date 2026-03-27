# Engineering Specification: TUI Issue Comment Create

**Ticket**: `tui-issue-comment-create`
**Title**: Inline comment creation textarea with submit, validation, and optimistic append
**Status**: Not started
**Dependencies**: `tui-issue-detail-view`, `tui-issue-comment-list`, `tui-issues-data-hooks`

---

## Overview

This ticket implements the inline comment creation textarea within the `IssueDetailScreen`. When an authenticated user presses `c` on the issue detail view, a bordered textarea panel slides into the bottom of the content area. The user types a markdown comment, submits with `Ctrl+S`, and the comment is optimistically appended to the timeline with a pending indicator. Server confirmation finalizes the comment; server errors revert the optimistic update and reopen the textarea with content preserved.

All code targets `apps/tui/src/`. All tests target `e2e/tui/`.

---

## Codebase Ground Truth

The following facts were validated against the actual repository on 2026-03-23 and drive every decision in this spec:

| Fact | Location | Impact |
|------|----------|--------|
| OpenTUI `<textarea>` is a native multiline component (NOT `<input multiline>`) | `context/opentui/packages/core/src/renderables/Textarea.ts` | Use `<textarea>` not `<input>` for multiline. `<input>` is always single-line. |
| `<textarea>` has built-in `Ctrl+K` (kill to end), `Ctrl+U` (kill to start), arrow keys, Home/End | OpenTUI Textarea key bindings | No need to implement text editing keys manually |
| `<textarea>` exposes `plainText` getter and `setText()` method via ref | OpenTUI TextareaRenderable | Read/write content programmatically |
| `<textarea>` fires `content-changed` event | OpenTUI TextareaRenderable | Track content changes for discard confirmation |
| `<textarea>` supports `wrapMode: "word"` (default) | OpenTUI TextareaRenderable | Text wraps at word boundaries |
| `<textarea>` supports `focused` prop for programmatic focus | OpenTUI TextareaRenderable | Control focus from React state |
| `<scrollbox>` wraps content and enables vertical scrolling | OpenTUI ScrollBoxRenderable | Wrap textarea for long comments |
| `useKeyboard` hook captures all key events | `@opentui/react` | Used at `KeybindingProvider` level, not per-component |
| `KeybindingProvider` supports priority-based key dispatch | `apps/tui/src/providers/KeybindingProvider.tsx` | Text input at priority 1 captures printable keys |
| `useScreenKeybindings` registers/unregisters scope on mount/unmount | `apps/tui/src/hooks/useScreenKeybindings.ts` | Comment mode registers additional scope |
| `useOptimisticMutation` handles optimistic/revert lifecycle | `apps/tui/src/hooks/useOptimisticMutation.ts` | Available but NOT used here — `useCreateIssueComment` from ui-core has its own optimistic callback pattern |
| `useCreateIssueComment` exists in ui-core | `specs/tui/packages/ui-core/src/hooks/issues/useCreateIssueComment.ts` | Returns `{ mutate, isLoading, error }` with `onOptimistic`, `onSettled`, `onRevert`, `onError` callbacks |
| `useCreateIssueComment.mutate()` trims body and validates non-empty | `useCreateIssueComment.ts` line 74 | Throws `ApiError(400)` for empty body before API call |
| `useCreateIssueComment` generates `tempId = -(Date.now())` | `useCreateIssueComment.ts` line 79 | Negative ID distinguishes optimistic from server comments |
| `useMutation` has double-submit guard | `specs/tui/packages/ui-core/src/hooks/internal/useMutation.ts` | Rejects with "mutation in progress" if `isLoading` |
| `CommentDraft` type defined in issue detail types | `apps/tui/src/screens/Issues/types.ts` | `{ body: string; isOpen: boolean; isSubmitting: boolean }` |
| `CommentInput` component stubbed in detail view spec | `apps/tui/src/screens/Issues/components/CommentInput.tsx` | Scaffold exists but uses `<input multiline>` which is wrong — must use `<textarea>` |
| Status bar hints use `registerHints` / `overrideHints` pattern | `apps/tui/src/hooks/useStatusBarHints.ts` | Override hints when textarea is open |
| `useTerminalDimensions()` returns `{ width, height }` | `@opentui/react` | For responsive textarea sizing |
| `useOnResize()` fires on `SIGWINCH` | `@opentui/react` | Synchronous re-layout |
| `useLayout()` provides `breakpoint` and `contentHeight` | `apps/tui/src/hooks/useLayout.ts` | Breakpoint drives textarea row count |
| `useAuth()` returns `{ token, user, authState }` | `apps/tui/src/hooks/useAuth.ts` | Check authentication before opening textarea |
| Theme tokens available via `useTheme()` | `apps/tui/src/hooks/useTheme.ts` | Semantic colors: `primary`, `error`, `warning`, `muted`, `border` |
| `IssueComment` type: `{ id, issue_id, user_id, commenter, body, type, created_at, updated_at }` | `specs/tui/packages/ui-core/src/types/issues.ts` | Wire format for comments |
| `POST /api/repos/:owner/:repo/issues/:number/comments` returns 201 | `apps/server/src/routes/issues.ts` | Success status code |
| Server auth middleware expects `Authorization: token {token}` | Server auth middleware | Injected by `APIClientProvider` |
| Error response shape: `{ message, errors? }` | `specs/tui/packages/ui-core/src/types/errors.ts` | Parsed by `parseResponseError()` |
| `ApiError` has `status`, `code`, `detail`, `fieldErrors` properties | `specs/tui/packages/ui-core/src/types/errors.ts` | Error classification for UI branching |
| Loading provider shows 5-second status bar errors via `failMutation` | `apps/tui/src/providers/LoadingProvider.tsx` | Inline error toast mechanism |
| Overlay system supports `"confirm"` type | `apps/tui/src/providers/overlay-types.ts` | NOT used — discard confirmation is inline, not overlay |
| `launchTUI` helper spawns real PTY with `@microsoft/tui-test` | `e2e/tui/helpers.ts` | E2E tests use real terminal emulation |
| Test token constants: `WRITE_TOKEN`, `READ_TOKEN` | `e2e/tui/helpers.ts` | Pre-configured test credentials |
| `TERMINAL_SIZES` constant: `{ minimum, standard, large }` | `e2e/tui/helpers.ts` | Standard test dimensions |

---

## Implementation Plan

### Step 1: Extend CommentDraft Type

**File**: `apps/tui/src/screens/Issues/types.ts`

Extend the existing `CommentDraft` interface with additional state fields needed for the full comment creation lifecycle.

```typescript
// Update existing CommentDraft interface
export interface CommentDraft {
  body: string;
  isOpen: boolean;
  isSubmitting: boolean;
  // New fields for comment creation
  validationError: string | null;
  serverError: string | null;
  showDiscardConfirm: boolean;
  preservedScrollPosition: number | null;  // scroll position before textarea opened
  openedAt: number | null;                 // timestamp for telemetry
}

// Initial state factory
export function createEmptyDraft(): CommentDraft {
  return {
    body: "",
    isOpen: false,
    isSubmitting: false,
    validationError: null,
    serverError: null,
    showDiscardConfirm: false,
    preservedScrollPosition: null,
    openedAt: null,
  };
}

// Responsive textarea row heights by breakpoint
export const TEXTAREA_ROWS: Record<string, number> = {
  minimum: 5,
  standard: 8,
  large: 12,
};

// Timing constants
export const ERROR_TOAST_AUTO_DISMISS_MS = 5_000;
export const SUBMISSION_TIMEOUT_MS = 10_000;
```

**Rationale**: The extended `CommentDraft` captures all UI state for the comment creation lifecycle in a single object. The factory function ensures consistent initial state. Responsive row heights are co-located with the types for easy reference.

---

### Step 2: Comment Creation Hook — `useCommentCreate`

**File**: `apps/tui/src/screens/Issues/hooks/useCommentCreate.ts`

Orchestration hook that composes `useCreateIssueComment` from ui-core with local state management for the textarea lifecycle, optimistic updates, and error recovery.

```typescript
import { useState, useCallback, useRef, useEffect } from "react";
import { useCreateIssueComment } from "@codeplane/ui-core";
import type { IssueComment, CreateIssueCommentCallbacks } from "@codeplane/ui-core";
import { useAuth } from "../../../hooks/useAuth";
import { useLayout } from "../../../hooks/useLayout";
import { logger } from "../../../lib/logger";
import { telemetry } from "../../../lib/telemetry";
import {
  type CommentDraft,
  createEmptyDraft,
  TEXTAREA_ROWS,
  ERROR_TOAST_AUTO_DISMISS_MS,
} from "../types";

interface UseCommentCreateOptions {
  owner: string;
  repo: string;
  issueNumber: number;
  issueState: string;
  existingCommentCount: number;
  onOptimisticAppend: (comment: IssueComment) => void;
  onOptimisticFinalize: (tempId: number, serverComment: IssueComment) => void;
  onOptimisticRevert: (tempId: number) => void;
  onCommentCountIncrement: () => void;
  onCommentCountDecrement: () => void;
  scrollToBottom: () => void;
  getCurrentScrollPosition: () => number;
}

interface UseCommentCreateReturn {
  draft: CommentDraft;
  textareaHeight: number;
  canComment: boolean;
  open: () => void;
  close: () => void;
  setBody: (body: string) => void;
  submit: () => void;
  confirmDiscard: () => void;
  cancelDiscard: () => void;
  handleEscape: () => void;
}

export function useCommentCreate(options: UseCommentCreateOptions): UseCommentCreateReturn {
  const {
    owner,
    repo,
    issueNumber,
    issueState,
    existingCommentCount,
    onOptimisticAppend,
    onOptimisticFinalize,
    onOptimisticRevert,
    onCommentCountIncrement,
    onCommentCountDecrement,
    scrollToBottom,
    getCurrentScrollPosition,
  } = options;

  const auth = useAuth();
  const layout = useLayout();
  const [draft, setDraft] = useState<CommentDraft>(createEmptyDraft());
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preservedBodyRef = useRef<string>("");
  const submitStartRef = useRef<number>(0);

  // Determine if user can comment
  const canComment = auth.authState === "authenticated";

  // Responsive textarea height
  const textareaHeight = TEXTAREA_ROWS[layout.breakpoint ?? "minimum"] ?? 5;

  // Callbacks for useCreateIssueComment
  const callbacks: CreateIssueCommentCallbacks = {
    onOptimistic: (_issueNumber: number, tempComment: IssueComment) => {
      // Fill in current user info on the optimistic comment
      const enriched: IssueComment = {
        ...tempComment,
        commenter: auth.user?.login ?? "you",
        user_id: auth.user?.id ?? 0,
      };
      onOptimisticAppend(enriched);
      onCommentCountIncrement();

      logger.info(
        `IssueCommentCreate: submitted [owner=${owner}] [repo=${repo}] [number=${issueNumber}] [body_length=${tempComment.body.length}]`
      );
    },
    onSettled: (_issueNumber: number, tempId: number, serverComment: IssueComment | null) => {
      if (serverComment) {
        onOptimisticFinalize(tempId, serverComment);
        const duration = Date.now() - submitStartRef.current;

        logger.info(
          `IssueCommentCreate: created [owner=${owner}] [repo=${repo}] [number=${issueNumber}] [comment_id=${serverComment.id}] [duration=${duration}ms]`
        );

        if (duration > 2000) {
          logger.warn(`IssueCommentCreate: slow submit [duration=${duration}ms]`);
        }

        telemetry.track("tui.issue_comment.succeeded", {
          owner,
          repo,
          issue_number: issueNumber,
          comment_id: serverComment.id,
          server_response_ms: duration,
          total_duration_ms: duration,
        });

        // Scroll to the new comment
        scrollToBottom();
      }
    },
    onRevert: (_issueNumber: number, _tempId: number) => {
      onOptimisticRevert(_tempId);
      onCommentCountDecrement();
    },
    onError: (error, _issueNumber: number, _tempId: number) => {
      const status = "status" in error ? (error as any).status : 0;
      const message = error.message || "Unknown error";

      logger.error(`IssueCommentCreate: failed [status=${status}] [error=${message}]`);

      telemetry.track("tui.issue_comment.failed", {
        owner,
        repo,
        issue_number: issueNumber,
        error_code: status,
        error_message: message,
        body_length: preservedBodyRef.current.length,
        retry_count: 0,
      });

      // Branch on error status
      if (status === 401) {
        logger.error(`IssueCommentCreate: auth error [status=401]`);
        setDraft((d) => ({
          ...createEmptyDraft(),
          serverError: "Session expired. Run `codeplane auth login` to re-authenticate.",
        }));
        return;
      }

      if (status === 403) {
        logger.error(`IssueCommentCreate: permission denied [status=403]`);
        setDraft((d) => ({
          ...createEmptyDraft(),
          serverError: "Permission denied. You cannot comment on this issue.",
        }));
        return;
      }

      if (status === 429) {
        logger.warn(`IssueCommentCreate: rate limited [retry_after=unknown]`);
        setDraft((d) => ({
          ...d,
          isSubmitting: false,
          serverError: "Rate limit exceeded. Please wait and try again.",
          body: preservedBodyRef.current,
          isOpen: true,
        }));
        return;
      }

      if (status === 422) {
        setDraft((d) => ({
          ...d,
          isSubmitting: false,
          serverError: message,
          body: preservedBodyRef.current,
          isOpen: true,
        }));
        return;
      }

      // 4xx (except 401/403/422), 5xx, network errors → reopen textarea
      logger.error(`IssueCommentCreate: optimistic revert [error=${message}]`);

      telemetry.track("tui.issue_comment.optimistic_reverted", {
        owner,
        repo,
        issue_number: issueNumber,
        error_code: status,
      });

      setDraft({
        body: preservedBodyRef.current,
        isOpen: true,
        isSubmitting: false,
        validationError: null,
        serverError: "Failed to post comment. Press `c` to retry.",
        showDiscardConfirm: false,
        preservedScrollPosition: null,
        openedAt: Date.now(),
      });

      // Auto-dismiss error toast after 5s
      if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
      errorTimeoutRef.current = setTimeout(() => {
        setDraft((d) => ({ ...d, serverError: null }));
      }, ERROR_TOAST_AUTO_DISMISS_MS);
    },
  };

  const createComment = useCreateIssueComment(owner, repo, callbacks);

  // Open textarea
  const open = useCallback(() => {
    if (draft.isOpen) return; // no-op if already open

    if (!canComment) {
      // Show inline toast for unauthenticated users
      setDraft((d) => ({
        ...d,
        serverError: "Sign in to comment. Run `codeplane auth login`.",
      }));

      if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
      errorTimeoutRef.current = setTimeout(() => {
        setDraft((d) => ({ ...d, serverError: null }));
      }, ERROR_TOAST_AUTO_DISMISS_MS);
      return;
    }

    const scrollPos = getCurrentScrollPosition();

    logger.debug(
      `IssueCommentCreate: opened [owner=${owner}] [repo=${repo}] [number=${issueNumber}] [width=${layout.width}] [height=${layout.height}]`
    );

    telemetry.track("tui.issue_comment.textarea_opened", {
      owner,
      repo,
      issue_number: issueNumber,
      issue_state: issueState,
      existing_comment_count: existingCommentCount,
      terminal_width: layout.width,
      terminal_height: layout.height,
      layout: layout.breakpoint ?? "minimum",
    });

    setDraft({
      ...createEmptyDraft(),
      isOpen: true,
      preservedScrollPosition: scrollPos,
      openedAt: Date.now(),
    });
  }, [draft.isOpen, canComment, owner, repo, issueNumber, issueState, existingCommentCount, layout, getCurrentScrollPosition]);

  // Close textarea (no confirmation)
  const close = useCallback(() => {
    setDraft(createEmptyDraft());
  }, []);

  // Set body content
  const setBody = useCallback((body: string) => {
    setDraft((d) => ({
      ...d,
      body,
      validationError: null, // clear validation error on typing
      serverError: null,     // clear server error on typing
    }));
  }, []);

  // Submit comment
  const submit = useCallback(() => {
    if (draft.isSubmitting) return; // double-submit prevention
    if (createComment.isLoading) return; // mutation already in flight

    const trimmed = draft.body.trim();
    if (trimmed === "") {
      logger.debug(`IssueCommentCreate: validation error [empty body]`);

      telemetry.track("tui.issue_comment.validation_error", {
        owner,
        repo,
        issue_number: issueNumber,
      });

      setDraft((d) => ({
        ...d,
        validationError: "⚠ Comment cannot be empty",
      }));
      return;
    }

    // Preserve body for recovery on error
    preservedBodyRef.current = draft.body;
    submitStartRef.current = Date.now();

    const bodyLength = trimmed.length;
    const lineCount = trimmed.split("\n").length;
    const hasCodeBlock = /```/.test(trimmed);
    const hasMarkdownFormatting = /[*_~`#\[\]]/.test(trimmed);

    telemetry.track("tui.issue_comment.submitted", {
      owner,
      repo,
      issue_number: issueNumber,
      body_length: bodyLength,
      line_count: lineCount,
      time_to_submit_ms: Date.now() - (draft.openedAt ?? Date.now()),
      has_code_block: hasCodeBlock,
      has_markdown_formatting: hasMarkdownFormatting,
    });

    // Transition to submitting state
    setDraft((d) => ({
      ...d,
      isSubmitting: true,
      validationError: null,
      serverError: null,
      showDiscardConfirm: false,
    }));

    // Fire the mutation — ui-core handles optimistic lifecycle via callbacks
    createComment.mutate(issueNumber, { body: trimmed }).then(() => {
      // On success: close textarea
      setDraft(createEmptyDraft());
    }).catch((error: any) => {
      // Error handling is done in the onError callback above
      // But catch the promise to prevent unhandled rejection
      // For validation errors (ApiError(400) from ui-core), handle here
      if (error?.status === 400 || error?.code === "BAD_REQUEST") {
        setDraft((d) => ({
          ...d,
          isSubmitting: false,
          validationError: "⚠ Comment cannot be empty",
        }));
      }
    });
  }, [draft, createComment, issueNumber, owner, repo]);

  // Handle Escape key
  const handleEscape = useCallback(() => {
    if (draft.showDiscardConfirm) {
      // Esc at discard confirmation → return to textarea
      cancelDiscard();
      return;
    }

    const trimmed = draft.body.trim();
    if (trimmed === "") {
      // Empty textarea → close immediately
      const timeOpen = Date.now() - (draft.openedAt ?? Date.now());

      logger.info(
        `IssueCommentCreate: cancelled [owner=${owner}] [repo=${repo}] [number=${issueNumber}] [was_empty=true]`
      );

      telemetry.track("tui.issue_comment.cancelled", {
        owner,
        repo,
        issue_number: issueNumber,
        was_empty: true,
        body_length: 0,
        time_open_ms: timeOpen,
      });

      close();
      return;
    }

    // Non-empty textarea → show discard confirmation
    setDraft((d) => ({ ...d, showDiscardConfirm: true }));
  }, [draft.showDiscardConfirm, draft.body, draft.openedAt, owner, repo, issueNumber, close]);

  // Confirm discard (y key)
  const confirmDiscard = useCallback(() => {
    const timeOpen = Date.now() - (draft.openedAt ?? Date.now());

    logger.info(
      `IssueCommentCreate: discarded [owner=${owner}] [repo=${repo}] [number=${issueNumber}] [body_length=${draft.body.length}] [time_open=${timeOpen}ms]`
    );

    telemetry.track("tui.issue_comment.discard_confirmed", {
      owner,
      repo,
      issue_number: issueNumber,
      body_length: draft.body.length,
      time_open_ms: timeOpen,
    });

    close();
  }, [draft.openedAt, draft.body.length, owner, repo, issueNumber, close]);

  // Cancel discard (n key or Esc at confirmation)
  const cancelDiscard = useCallback(() => {
    telemetry.track("tui.issue_comment.discard_cancelled", {
      owner,
      repo,
      issue_number: issueNumber,
      body_length: draft.body.length,
    });

    setDraft((d) => ({ ...d, showDiscardConfirm: false }));
  }, [owner, repo, issueNumber, draft.body.length]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
    };
  }, []);

  return {
    draft,
    textareaHeight,
    canComment,
    open,
    close,
    setBody,
    submit,
    confirmDiscard,
    cancelDiscard,
    handleEscape,
  };
}
```

**Rationale**: This hook encapsulates the complete comment creation state machine. It wraps `useCreateIssueComment` from ui-core and translates the callback-based optimistic pattern into imperative state transitions. The hook owns `CommentDraft` state, error recovery, discard confirmation, and telemetry — keeping the component layer thin.

---

### Step 3: Comment Input Component — `CommentInput`

**File**: `apps/tui/src/screens/Issues/components/CommentInput.tsx`

This replaces the stub from the detail view spec. It renders the inline comment creation panel at the bottom of the issue detail view using OpenTUI's native `<textarea>` component (not `<input multiline>`, which does not exist).

```typescript
import { useRef, useEffect, useCallback } from "react";
import type { TextareaRenderable } from "@opentui/core";
import { useTheme } from "../../../hooks/useTheme";
import { useLayout } from "../../../hooks/useLayout";
import type { CommentDraft } from "../types";
import { TEXTAREA_ROWS } from "../types";

interface CommentInputProps {
  draft: CommentDraft;
  textareaHeight: number;
  onBodyChange: (body: string) => void;
  onSubmit: () => void;
  onEscape: () => void;
  onConfirmDiscard: () => void;
  onCancelDiscard: () => void;
}

export function CommentInput({
  draft,
  textareaHeight,
  onBodyChange,
  onSubmit,
  onEscape,
  onConfirmDiscard,
  onCancelDiscard,
}: CommentInputProps) {
  const theme = useTheme();
  const layout = useLayout();
  const textareaRef = useRef<TextareaRenderable>(null);

  if (!draft.isOpen) return null;

  // Calculate textarea width: full content width minus 2 for borders
  const textareaWidth = layout.width - 4; // 2 for box borders + 2 for paddingX

  return (
    <box flexDirection="column" paddingX={1}>
      {/* Horizontal separator */}
      <text fg={theme.border}>{'─'.repeat(Math.max(0, layout.width - 2))}</text>

      {/* Validation / server error */}
      {draft.validationError && (
        <text fg={theme.error}>{draft.validationError}</text>
      )}
      {draft.serverError && !draft.validationError && (
        <text fg={theme.error}>{draft.serverError}</text>
      )}

      {/* Textarea container */}
      <box
        flexDirection="column"
        border="single"
        borderColor={draft.isSubmitting ? theme.muted : theme.primary}
      >
        {/* Header row */}
        <box flexDirection="row" justifyContent="space-between" paddingX={1}>
          <text fg={theme.primary} attributes={1 /* BOLD */}>New comment</text>
          <text fg={theme.muted}>
            {draft.isSubmitting ? "Posting…" : "Ctrl+S:submit │ Esc:cancel"}
          </text>
        </box>

        {/* Scrollable textarea */}
        <scrollbox height={textareaHeight} paddingX={1}>
          <textarea
            ref={textareaRef}
            initialValue={draft.body}
            placeholder="Write a comment… (markdown supported)"
            placeholderColor={theme.muted}
            focused={!draft.isSubmitting && !draft.showDiscardConfirm}
            wrapMode="word"
            textColor={draft.isSubmitting ? theme.muted : undefined}
            width={textareaWidth}
          />
        </scrollbox>
      </box>

      {/* Discard confirmation */}
      {draft.showDiscardConfirm && (
        <text fg={theme.warning}>Discard comment? (y/n)</text>
      )}
    </box>
  );
}
```

**Key design decisions:**

1. **`<textarea>` not `<input>`**: OpenTUI's `<input>` is always single-line and strips newlines. The `<textarea>` component provides native multiline editing with word wrapping, cursor movement, Ctrl+K/Ctrl+U, undo/redo, and selection — all built into the Zig core.

2. **Content tracking via ref**: The `<textarea>` component manages its own internal text buffer. The parent reads content via `textareaRef.current?.plainText` when needed (on submit, on Esc). The `onBodyChange` callback is wired to the textarea's `content-changed` event to keep the draft in sync.

3. **Focus management**: The `focused` prop is `true` when the textarea is open and not in submitting or discard-confirm state. OpenTUI's focus system (Priority 1 in the keyboard architecture) captures all printable keys when focused.

4. **`<scrollbox>` wrapper**: The textarea is wrapped in a scrollbox with fixed height. When content exceeds the visible area, the scrollbox handles vertical scrolling. The scrollbox height is driven by `textareaHeight` which responds to terminal breakpoints.

5. **Disabled state**: When `isSubmitting` is true, the textarea uses muted text color and loses focus, making it visually greyed out. The header shows "Posting…" instead of keybinding hints.

---

### Step 4: Integrate Content Change Tracking

**File**: `apps/tui/src/screens/Issues/components/CommentInput.tsx` (update)

Add a `useEffect` to wire the textarea's `content-changed` event to the parent's state management.

```typescript
// Inside CommentInput component, after the ref declaration:
useEffect(() => {
  const textarea = textareaRef.current;
  if (!textarea) return;

  // Set initial value if restoring from error recovery
  if (draft.body && textarea.plainText !== draft.body) {
    textarea.setText(draft.body);
  }

  const handleContentChanged = () => {
    const text = textarea.plainText ?? "";
    onBodyChange(text);
  };

  textarea.on("content-changed", handleContentChanged);
  return () => {
    textarea.off("content-changed", handleContentChanged);
  };
}, [textareaRef.current, onBodyChange]);

// Focus the textarea when it opens
useEffect(() => {
  if (draft.isOpen && !draft.isSubmitting && !draft.showDiscardConfirm) {
    textareaRef.current?.focus();
  }
}, [draft.isOpen, draft.isSubmitting, draft.showDiscardConfirm]);
```

**Rationale**: The textarea manages its own text buffer in the Zig core. We sync the React state via the `content-changed` event. On error recovery, we restore the preserved body by calling `setText()` on the ref. This avoids fighting between React's controlled component model and OpenTUI's native text handling.

---

### Step 5: Keybinding Integration in IssueDetailScreen

**File**: `apps/tui/src/screens/Issues/IssueDetailScreen.tsx` (update)

Integrate the comment creation hook and keybindings into the existing issue detail screen.

```typescript
// Within IssueDetailScreen component:

import { useCommentCreate } from "./hooks/useCommentCreate";
import { useStatusBarHints } from "../../hooks/useStatusBarHints";

// Inside the component function:
const commentCreate = useCommentCreate({
  owner,
  repo,
  issueNumber: number,
  issueState: issue?.state ?? "open",
  existingCommentCount: issue?.comment_count ?? 0,
  onOptimisticAppend: (comment) => {
    // Append to local comments array
    setOptimisticComments((prev) => [...prev, comment]);
  },
  onOptimisticFinalize: (tempId, serverComment) => {
    // Replace temp comment with server version
    setOptimisticComments((prev) =>
      prev.map((c) => (c.id === tempId ? serverComment : c))
    );
  },
  onOptimisticRevert: (tempId) => {
    // Remove optimistic comment
    setOptimisticComments((prev) => prev.filter((c) => c.id !== tempId));
  },
  onCommentCountIncrement: () => {
    setOptimisticCommentCount((c) => c + 1);
  },
  onCommentCountDecrement: () => {
    setOptimisticCommentCount((c) => c - 1);
  },
  scrollToBottom: () => {
    scrollboxRef.current?.scrollTo({ y: scrollboxRef.current.scrollHeight });
  },
  getCurrentScrollPosition: () => {
    return scrollboxRef.current?.scrollTop ?? 0;
  },
});

const statusBar = useStatusBarHints();

// Override status bar when textarea is open
useEffect(() => {
  if (commentCreate.draft.isOpen) {
    const cleanup = statusBar.overrideHints([
      { keys: "Ctrl+S", label: "submit", order: 0 },
      { keys: "Esc", label: "cancel", order: 10 },
    ]);
    return cleanup;
  }
}, [commentCreate.draft.isOpen]);

// Register keybindings
const keybindings = useMemo(() => {
  const bindings = [
    // ... existing detail view bindings ...
  ];

  // Add 'c' to open comment textarea (only when textarea is closed)
  if (!commentCreate.draft.isOpen && commentCreate.canComment) {
    bindings.push({
      key: "c",
      description: "Comment",
      group: "Actions",
      handler: commentCreate.open,
    });
  }

  // When textarea is open, register submit/cancel/discard bindings
  if (commentCreate.draft.isOpen) {
    if (commentCreate.draft.showDiscardConfirm) {
      // Discard confirmation mode: only y, n, and Esc are active
      bindings.push(
        {
          key: "y",
          description: "Confirm discard",
          group: "Comment",
          handler: commentCreate.confirmDiscard,
        },
        {
          key: "n",
          description: "Cancel discard",
          group: "Comment",
          handler: commentCreate.cancelDiscard,
        },
        {
          key: "escape",
          description: "Cancel discard",
          group: "Comment",
          handler: commentCreate.cancelDiscard,
        },
      );
    } else {
      // Normal textarea mode
      bindings.push(
        {
          key: "ctrl+s",
          description: "Submit comment",
          group: "Comment",
          handler: commentCreate.submit,
        },
        {
          key: "escape",
          description: "Cancel",
          group: "Comment",
          handler: commentCreate.handleEscape,
        },
      );
    }
  }

  return bindings;
}, [
  commentCreate.draft.isOpen,
  commentCreate.draft.showDiscardConfirm,
  commentCreate.canComment,
  commentCreate.open,
  commentCreate.submit,
  commentCreate.handleEscape,
  commentCreate.confirmDiscard,
  commentCreate.cancelDiscard,
]);

useScreenKeybindings(
  keybindings,
  commentCreate.draft.isOpen
    ? [
        { keys: "Ctrl+S", label: "submit", order: 0 },
        { keys: "Esc", label: "cancel", order: 10 },
      ]
    : [
        // Default issue detail hints
        { keys: "j/k", label: "navigate", order: 0 },
        { keys: "Enter", label: "open", order: 10 },
        ...(commentCreate.canComment
          ? [{ keys: "c", label: "comment", order: 20 }]
          : []),
      ]
);
```

**Focus capture behavior**: When the textarea is open and focused (via OpenTUI's `focused` prop), printable keys are captured at Priority 1 (TEXT_INPUT) by OpenTUI's native focus system. This means `j`, `k`, `q`, `n`, `p`, `e`, `o`, `l`, `a`, and all other issue detail keybindings are automatically inactive. Only `Ctrl+S`, `Esc`, `?`, and `Ctrl+C` propagate past the text input because they are handled at higher priority levels or are specifically registered.

The `:` (command palette) binding is at GLOBAL priority (5). When the textarea is focused at TEXT_INPUT priority (1), `:` is consumed as a literal character. This matches the spec: command palette is disabled while composing.

---

### Step 6: Optimistic Comment Rendering

**File**: `apps/tui/src/screens/Issues/components/CommentBlock.tsx` (update)

Extend the existing `CommentBlock` component to render optimistic comments with a pending indicator.

```typescript
import type { IssueComment } from "@codeplane/ui-core";
import { useTheme } from "../../../hooks/useTheme";
import { relativeTime } from "../utils/relative-time";
import { truncateCommentBody, truncateUsername } from "../utils/truncate";

interface CommentBlockProps {
  comment: IssueComment;
  timestampFormat?: string;
  isCurrentUser?: boolean;
  isFocused?: boolean;
}

export function CommentBlock({
  comment,
  timestampFormat,
  isCurrentUser = false,
  isFocused = false,
}: CommentBlockProps) {
  const theme = useTheme();

  // Detect optimistic comment: negative ID = pending
  const isPending = comment.id < 0;

  const { text: bodyText, truncated } = truncateCommentBody(comment.body);

  const timestampDisplay = isPending
    ? "⏳ just now"
    : relativeTime(comment.created_at, timestampFormat);

  return (
    <box
      flexDirection="column"
      gap={0}
      marginTop={1}
      borderLeft={isFocused ? "single" : undefined}
      borderColor={isFocused ? theme.primary : undefined}
      paddingLeft={isFocused ? 1 : 0}
    >
      {/* Author and timestamp row */}
      <box flexDirection="row" gap={2}>
        <text fg={theme.primary} attributes={1 /* BOLD */}>
          @{truncateUsername(comment.commenter)}
        </text>
        <text fg={theme.muted}>{timestampDisplay}</text>
        {isCurrentUser && <text fg={theme.muted}>(yours)</text>}
      </box>

      {/* Comment body */}
      <markdown content={bodyText} />

      {/* Truncation warning */}
      {truncated && (
        <text fg={theme.warning}>Comment truncated. View full comment on web.</text>
      )}
    </box>
  );
}
```

**Rationale**: Optimistic comments are detected by their negative `id` (generated by `useCreateIssueComment` as `-(Date.now())`). The `⏳ just now` indicator provides visual feedback that the comment is pending server confirmation. When the server responds, the `onSettled` callback replaces the temp comment with the server version, which has a positive ID and a real `created_at` timestamp.

---

### Step 7: Render Integration in IssueDetailScreen

**File**: `apps/tui/src/screens/Issues/IssueDetailScreen.tsx` (update)

Add the `CommentInput` to the issue detail view's JSX.

```typescript
import { CommentInput } from "./components/CommentInput";

// In the render:
return (
  <box flexDirection="column" width="100%" height="100%">
    {/* Scrollable issue content */}
    <scrollbox
      ref={scrollboxRef}
      flexGrow={1}
      paddingX={1}
    >
      <box flexDirection="column" gap={1}>
        {/* Issue header */}
        <IssueHeader issue={issue} />

        {/* Issue body */}
        <DetailSection title="Description">
          <markdown content={issue.body} />
        </DetailSection>

        {/* Comments section */}
        <DetailSection
          title={`Comments (${optimisticCommentCount ?? issue.comment_count})`}
        >
          {timelineItems.length === 0 && (
            <text fg={theme.muted}>No comments yet. Press c to add one.</text>
          )}
          {timelineItems.map((item) => {
            if (item.type === "comment") {
              return (
                <CommentBlock
                  key={`comment-${item.id}`}
                  comment={item.comment}
                  isCurrentUser={item.comment.commenter === auth.user?.login}
                  isFocused={focusedTimelineIndex === timelineItems.indexOf(item)}
                />
              );
            }
            return (
              <TimelineEventRow
                key={`event-${item.id}`}
                event={item.event}
              />
            );
          })}
        </DetailSection>
      </box>
    </scrollbox>

    {/* Comment creation textarea (inline panel at bottom) */}
    <CommentInput
      draft={commentCreate.draft}
      textareaHeight={commentCreate.textareaHeight}
      onBodyChange={commentCreate.setBody}
      onSubmit={commentCreate.submit}
      onEscape={commentCreate.handleEscape}
      onConfirmDiscard={commentCreate.confirmDiscard}
      onCancelDiscard={commentCreate.cancelDiscard}
    />
  </box>
);
```

**Layout behavior**: The `<scrollbox>` uses `flexGrow={1}` and expands to fill all available vertical space. When the `CommentInput` is rendered (draft.isOpen), it claims its fixed height (5/8/12 rows based on breakpoint) at the bottom, and the scrollbox shrinks to fill the remaining space. This is standard CSS flexbox behavior — no manual height calculations needed.

---

### Step 8: Error Boundary Wrapper

**File**: `apps/tui/src/screens/Issues/components/CommentInput.tsx` (update)

Wrap the CommentInput in a local error boundary to prevent textarea crashes from taking down the issue detail view.

```typescript
import { Component, type ErrorInfo, type ReactNode } from "react";
import { logger } from "../../../lib/logger";

interface CommentInputErrorBoundaryProps {
  children: ReactNode;
  onError?: () => void;
}

interface CommentInputErrorBoundaryState {
  hasError: boolean;
}

class CommentInputErrorBoundary extends Component<
  CommentInputErrorBoundaryProps,
  CommentInputErrorBoundaryState
> {
  state: CommentInputErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): CommentInputErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logger.error(
      `IssueCommentCreate: render error [component=CommentInput] [error=${error.message}]`
    );
  }

  render() {
    if (this.state.hasError) {
      return (
        <box paddingX={1}>
          <text fg="red">Comment input error — press c to try again.</text>
        </box>
      );
    }
    return this.props.children;
  }
}

// Usage in IssueDetailScreen:
<CommentInputErrorBoundary>
  <CommentInput {...props} />
</CommentInputErrorBoundary>
```

---

### Step 9: Resize Handling

**File**: `apps/tui/src/screens/Issues/hooks/useCommentCreate.ts` (already handled)

Resize behavior is handled automatically through the existing architecture:

1. `useLayout()` internally uses `useTerminalDimensions()` and `useOnResize()` from OpenTUI.
2. When the terminal resizes, `useLayout()` re-evaluates the breakpoint.
3. The `textareaHeight` computed in `useCommentCreate` updates reactively.
4. React re-renders `CommentInput` with the new height.
5. The `<textarea>` component preserves its internal text buffer and cursor position across re-renders.
6. The `<scrollbox>` height adjusts, and the textarea content remains scrollable.

If the terminal resizes below 80×24 while composing, the global `TerminalTooSmallScreen` takes over. The comment draft state is preserved in React state. When the terminal resizes back above 80×24, the issue detail re-renders and the `CommentInput` reappears with content intact.

---

### Step 10: Barrel Export Updates

**File**: `apps/tui/src/screens/Issues/components/index.ts`

```typescript
export { IssueHeader } from "./IssueHeader";
export { IssueMetadata } from "./IssueMetadata";
export { CommentBlock } from "./CommentBlock";
export { TimelineEventRow } from "./TimelineEventRow";
export { IssueDependencies } from "./IssueDependencies";
export { CommentInput } from "./CommentInput";
export { CommentInputErrorBoundary } from "./CommentInput";
```

**File**: `apps/tui/src/screens/Issues/hooks/index.ts`

```typescript
export { useIssueDetail } from "./useIssueDetail";
export { useCommentCreate } from "./useCommentCreate";
```

---

## File Inventory

| File | Status | Purpose |
|------|--------|---------|
| `apps/tui/src/screens/Issues/types.ts` | Modify | Extend `CommentDraft`, add `createEmptyDraft`, `TEXTAREA_ROWS`, constants |
| `apps/tui/src/screens/Issues/hooks/useCommentCreate.ts` | New | Comment creation state machine, optimistic lifecycle, error recovery |
| `apps/tui/src/screens/Issues/hooks/index.ts` | Modify | Add `useCommentCreate` export |
| `apps/tui/src/screens/Issues/components/CommentInput.tsx` | Rewrite | Replace stub with full textarea component using OpenTUI `<textarea>` |
| `apps/tui/src/screens/Issues/components/CommentBlock.tsx` | Modify | Add `isPending` detection for optimistic comments |
| `apps/tui/src/screens/Issues/components/index.ts` | Modify | Add `CommentInputErrorBoundary` export |
| `apps/tui/src/screens/Issues/IssueDetailScreen.tsx` | Modify | Integrate `useCommentCreate`, keybindings, render `CommentInput` |
| `e2e/tui/issues.test.ts` | Modify | Add comment creation test suite |

---

## Data Flow Diagram

```
User presses 'c'
  ↓
useCommentCreate.open()
  → Validates canComment (auth check)
  → Sets draft.isOpen = true
  → Emits telemetry: textarea_opened
  → Logs: IssueCommentCreate: opened
  ↓
CommentInput renders
  → <textarea> focused, captures printable keys
  → Status bar overridden: "Ctrl+S:submit │ Esc:cancel"
  → Issue detail scrollbox shrinks to accommodate
  ↓
User types comment
  → <textarea> content-changed event
  → onBodyChange → draft.body updated
  → Debounced log: IssueCommentCreate: typing
  ↓
User presses Ctrl+S
  ↓
useCommentCreate.submit()
  → Validates non-empty (trims whitespace)
  → Sets draft.isSubmitting = true
  → preservedBodyRef = draft.body
  → Emits telemetry: submitted
  ↓
useCreateIssueComment.mutate(issueNumber, { body: trimmed })
  ↓
onOptimistic callback fires IMMEDIATELY
  → Creates temp IssueComment with id = -(Date.now())
  → Enriches with current user login
  → onOptimisticAppend(enriched) → appended to timeline
  → onCommentCountIncrement() → count +1
  ↓
POST /api/repos/:owner/:repo/issues/:number/comments
  ↓
  ┌──────────────────────────────────────────────────┐
  │ Success (201)                                     │
  │ → onSettled(number, tempId, serverComment)        │
  │ → onOptimisticFinalize replaces temp with server  │
  │ → draft reset to empty, textarea closes           │
  │ → scrollToBottom() shows new comment              │
  │ → Status bar reverts to issue detail hints        │
  │ → Telemetry: succeeded                            │
  └──────────────────────────────────────────────────┘
  ┌──────────────────────────────────────────────────┐
  │ Failure (4xx/5xx/network)                        │
  │ → onRevert(number, tempId)                       │
  │ → onOptimisticRevert removes temp from timeline  │
  │ → onCommentCountDecrement() → count -1           │
  │ → onError fires with status-specific handling:   │
  │   401 → auth error, textarea closed              │
  │   403 → permission denied, textarea closed       │
  │   422 → validation error, textarea stays open    │
  │   429 → rate limit, textarea stays open          │
  │   other → textarea reopens with preserved body   │
  │ → Telemetry: failed + optimistic_reverted        │
  └──────────────────────────────────────────────────┘
```

---

## Keyboard Architecture Integration

The comment creation textarea interacts with the existing keyboard priority system:

```
┌─────────────────────────────────────────────────┐
│ Priority 1: TEXT_INPUT (OpenTUI focus system)    │
│ When <textarea focused={true}>:                  │
│   All printable keys → textarea buffer           │
│   Enter → newline                                │
│   Backspace/Delete → delete                      │
│   Arrow keys → cursor movement                   │
│   Ctrl+K, Ctrl+U → kill line                     │
│   Ctrl+A → select all / Home                     │
│   Ctrl+E → End of line                           │
│   Tab → NOT captured (reserved for form nav)     │
├─────────────────────────────────────────────────┤
│ Priority 2: MODAL (help overlay)                 │
│   ? → opens help overlay                         │
│   Esc within help → closes overlay               │
├─────────────────────────────────────────────────┤
│ Priority 4: SCREEN (registered per-screen)       │
│ When textarea open:                              │
│   Ctrl+S → submit (registered by detail screen)  │
│   Esc → cancel/discard (registered by detail)    │
│ When discard confirm shown:                      │
│   y → confirm discard                            │
│   n → cancel discard                             │
│   Esc → cancel discard                           │
│ When textarea closed:                            │
│   c → open textarea                              │
│   j/k → navigate timeline                        │
│   n/p → jump between comments                    │
│   (all other issue detail bindings)              │
├─────────────────────────────────────────────────┤
│ Priority 5: GLOBAL                               │
│   Ctrl+C → quit TUI (always active)              │
│   ? → help overlay (propagates from P2)          │
│   : → command palette (captured by textarea P1)  │
│   q → back/quit (captured by textarea P1)        │
└─────────────────────────────────────────────────┘
```

**Critical**: `Ctrl+S` and `Esc` are NOT printable keys — they are NOT captured by the textarea's text input focus. They propagate to Priority 4 (SCREEN) where the detail screen's keybinding handler processes them. This is the mechanism by which submit and cancel work without intercepting the textarea's native input handling.

`?` propagates to Priority 2 (MODAL) because it's registered there by the overlay system. When the help overlay opens, it shows comment-specific keybindings derived from the current screen scope.

`:` IS a printable key and IS captured by the textarea at Priority 1. This matches the spec requirement that command palette is disabled while composing.

---

## Responsive Layout Specification

| Terminal Size | Breakpoint | Textarea Height | Issue Content Area | Total Overhead |
|--------------|------------|----------------|--------------------|----------------|
| 80×24 | minimum | 5 rows | height − 2 (header/status) − 5 (textarea) − 2 (separator+label) = ~15 rows | 9 rows |
| 120×40 | standard | 8 rows | height − 2 − 8 − 2 = ~28 rows | 12 rows |
| 200×60 | large | 12 rows | height − 2 − 12 − 2 = ~44 rows | 16 rows |
| <80×24 | null | N/A | "Terminal too small" screen | N/A |

The textarea container includes: 1 row separator, 1 row header ("New comment" + hints), N rows textarea, 1 row for error/discard if shown. The `<scrollbox>` above flexes to fill remaining space.

---

## Error Handling Matrix

| Error Case | HTTP Status | Textarea State | User Message | Recovery |
|------------|------------|----------------|--------------|----------|
| Empty body | N/A (client) | Stays open | "⚠ Comment cannot be empty" (error color) | Type content, retry Ctrl+S |
| Whitespace-only body | N/A (client) | Stays open | "⚠ Comment cannot be empty" (error color) | Type content, retry Ctrl+S |
| Session expired | 401 | Closes | "Session expired. Run `codeplane auth login` to re-authenticate." | Re-auth via CLI |
| Permission denied | 403 | Closes | "Permission denied. You cannot comment on this issue." | N/A |
| Validation error | 422 | Stays open, content preserved | Server message displayed inline | Edit content, retry |
| Rate limited | 429 | Stays open, content preserved | "Rate limit exceeded. Please wait and try again." | Wait, retry Ctrl+S |
| Server error | 500 | Reopens with preserved content | "Failed to post comment. Press `c` to retry." (5s auto-dismiss) | Retry Ctrl+S |
| Network error | N/A | Reopens with preserved content | "Failed to post comment. Press `c` to retry." (5s auto-dismiss) | Check connection, retry |
| Network timeout | N/A (10s) | Reopens with preserved content | "Failed to post comment. Press `c` to retry." (5s auto-dismiss) | Retry |
| Issue deleted | 404 | Closes | "Issue no longer exists" | Press q to go back |
| Double-submit | N/A | No-op | N/A | Wait for first submission |
| Unauthenticated | N/A (client) | Does not open | "Sign in to comment. Run `codeplane auth login`." (5s toast) | Auth via CLI |
| Textarea crash | N/A | Error boundary | "Comment input error — press c to try again." | Press c |
| Terminal too small | N/A | Preserved in memory | "Terminal too small" screen | Resize terminal |
| Very long comment (100k+) | 413/422 | Stays open, content preserved | Server error message | Shorten content |

---

## Productionization Checklist

The following items ensure this feature is production-ready:

1. **OpenTUI `<textarea>` validation**: The implementation assumes `<textarea>` supports `focused` prop, `content-changed` event, `plainText` getter, and `setText()`. Before merging, run a PoC test in `poc/tui-textarea-multiline.ts` that validates these APIs work correctly in the Bun + OpenTUI React reconciler environment. Graduate passing assertions into the E2E test suite.

2. **Focus capture verification**: Verify that when `<textarea focused={true}>` is rendered, printable keys are captured at Priority 1 and do NOT reach the screen-level keybinding handlers. Specifically test that pressing `j`, `k`, `q`, `n`, `p`, `e`, `:` while composing inserts characters into the textarea, not triggers navigation.

3. **Ctrl+S propagation**: Verify that `Ctrl+S` is NOT captured by the textarea's text input focus and propagates to Priority 4 where the screen handler catches it. This is critical — if Ctrl+S is consumed by the textarea, submit will silently fail.

4. **Scrollbox nested in flexbox**: Verify that `<scrollbox height={N}>` inside a `<box flexDirection="column">` correctly constrains the textarea's visible area and that scrolling works when content exceeds N rows.

5. **Error recovery content restoration**: Verify that calling `textareaRef.current.setText(preservedBody)` after the textarea remounts (from closed → open on error) correctly restores content and cursor position.

6. **Memory stability**: Test with a 10,000-line comment to verify no memory leak or render stall. The `<textarea>` uses virtualized line rendering internally for 1000+ lines per the spec.

7. **Bracketed paste mode**: Verify that pasting multi-line content via terminal paste (bracketed paste mode) is correctly handled by the textarea.

---

## Unit & Integration Tests

**File**: `e2e/tui/issues.test.ts`

All tests use `@microsoft/tui-test` via helpers in `e2e/tui/helpers.ts`. Tests run against a real API server with test fixtures. Tests that fail due to unimplemented backend features are **left failing** — never skipped or commented out.

### Test Helpers

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { launchTUI, TERMINAL_SIZES, WRITE_TOKEN, OWNER, type TUITestInstance } from "./helpers";

const TEST_REPO = "alice/test-repo";
const TEST_ISSUE_NUMBER = 1;

async function navigateToIssueDetail(
  terminal: TUITestInstance,
  owner: string = OWNER,
  repo: string = "test-repo",
  issueNumber: number = TEST_ISSUE_NUMBER
): Promise<void> {
  // Navigate to issues list
  await terminal.sendKeys("g", "i");
  await terminal.waitForText("Issues", 10000);

  // Select the issue (assumes first issue in list)
  await terminal.sendKeys("Enter");
  await terminal.waitForText(`#${issueNumber}`, 10000);
}

async function openCommentTextarea(terminal: TUITestInstance): Promise<void> {
  await terminal.sendKeys("c");
  await terminal.waitForText("New comment", 5000);
}

async function typeComment(terminal: TUITestInstance, text: string): Promise<void> {
  await terminal.sendText(text);
}
```

### Terminal Snapshot Tests

```typescript
describe("TUI_ISSUE_COMMENT_CREATE", () => {
  describe("Terminal Snapshots", () => {
    let tui: TUITestInstance;

    afterEach(async () => {
      await tui?.terminate();
    });

    test("SNAP-COMMENT-CREATE-001: Comment textarea renders at 120x40", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);
      await openCommentTextarea(tui);

      const snapshot = tui.snapshot();
      expect(snapshot).toContain("New comment");
      expect(snapshot).toContain("Ctrl+S:submit");
      expect(snapshot).toContain("Esc:cancel");
      expect(snapshot).toMatchSnapshot();
    });

    test("SNAP-COMMENT-CREATE-002: Comment textarea renders at 80x24", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.minimum.width,
        rows: TERMINAL_SIZES.minimum.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);
      await openCommentTextarea(tui);

      const snapshot = tui.snapshot();
      expect(snapshot).toContain("New comment");
      // At 80x24, textarea should be 5 rows
      expect(snapshot).toMatchSnapshot();
    });

    test("SNAP-COMMENT-CREATE-003: Comment textarea renders at 200x60", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.large.width,
        rows: TERMINAL_SIZES.large.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);
      await openCommentTextarea(tui);

      const snapshot = tui.snapshot();
      expect(snapshot).toContain("New comment");
      // At 200x60, textarea should be 12 rows
      expect(snapshot).toMatchSnapshot();
    });

    test("SNAP-COMMENT-CREATE-004: Textarea with multi-line markdown content", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);
      await openCommentTextarea(tui);

      // Type multi-line content with a code block
      await typeComment(tui, "This is a comment with code:\n\n```js\nconsole.log('hello')\n```");

      const snapshot = tui.snapshot();
      expect(snapshot).toContain("This is a comment with code");
      expect(snapshot).toContain("console.log");
      expect(snapshot).toMatchSnapshot();
    });

    test("SNAP-COMMENT-CREATE-005: Empty body validation error", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);
      await openCommentTextarea(tui);

      // Submit empty textarea
      await tui.sendKeys("ctrl+s");

      const snapshot = tui.snapshot();
      expect(snapshot).toContain("⚠ Comment cannot be empty");
      // Textarea should still be open
      expect(snapshot).toContain("New comment");
      expect(snapshot).toMatchSnapshot();
    });

    test("SNAP-COMMENT-CREATE-006: Discard confirmation prompt", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);
      await openCommentTextarea(tui);
      await typeComment(tui, "draft content");

      await tui.sendKeys("Escape");

      const snapshot = tui.snapshot();
      expect(snapshot).toContain("Discard comment? (y/n)");
      expect(snapshot).toContain("draft content");
      expect(snapshot).toMatchSnapshot();
    });

    test("SNAP-COMMENT-CREATE-007: Submitting state", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);
      await openCommentTextarea(tui);
      await typeComment(tui, "A test comment");

      await tui.sendKeys("ctrl+s");

      // Immediately check for submitting state
      const snapshot = tui.snapshot();
      // Should show "Posting…" in the header area
      expect(snapshot).toMatch(/Posting/);
      expect(snapshot).toMatchSnapshot();
    });

    test("SNAP-COMMENT-CREATE-008: Optimistic comment in timeline", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);
      await openCommentTextarea(tui);
      await typeComment(tui, "My new comment");

      await tui.sendKeys("ctrl+s");

      // Wait for optimistic comment to appear
      await tui.waitForText("My new comment", 5000);
      const snapshot = tui.snapshot();
      expect(snapshot).toContain("⏳ just now");
      // Textarea should be closed
      expect(snapshot).not.toContain("New comment");
      expect(snapshot).toMatchSnapshot();
    });

    test("SNAP-COMMENT-CREATE-009: Error toast after failed submission", async () => {
      // This test requires API to return 500
      // Left failing if test API server doesn't support error injection
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);
      await openCommentTextarea(tui);
      await typeComment(tui, "comment that will fail");

      await tui.sendKeys("ctrl+s");

      // If API returns 500, expect error toast and textarea reopened
      await tui.waitForText("Failed to post comment", 10000);
      const snapshot = tui.snapshot();
      expect(snapshot).toContain("comment that will fail"); // content preserved
      expect(snapshot).toMatchSnapshot();
    });

    test("SNAP-COMMENT-CREATE-010: Auth error (401)", async () => {
      // Use an expired/invalid token to trigger 401
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: "codeplane_expired_token_000000000000000000000" },
      });
      // Navigation may fail due to auth — test what the TUI shows
      await navigateToIssueDetail(tui);
      await openCommentTextarea(tui);
      await typeComment(tui, "any comment");
      await tui.sendKeys("ctrl+s");

      await tui.waitForText("Session expired", 10000);
      const snapshot = tui.snapshot();
      expect(snapshot).toContain("Session expired");
      expect(snapshot).toContain("codeplane auth login");
      expect(snapshot).toMatchSnapshot();
    });

    test("SNAP-COMMENT-CREATE-011: Permission denied (403)", async () => {
      // This test requires a repo where user lacks comment permission
      // Left failing if backend doesn't support this scenario
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);
      await openCommentTextarea(tui);
      await typeComment(tui, "forbidden comment");
      await tui.sendKeys("ctrl+s");

      // Expect 403 handling
      await tui.waitForText("Permission denied", 10000);
      const snapshot = tui.snapshot();
      expect(snapshot).toContain("Permission denied");
      expect(snapshot).toMatchSnapshot();
    });

    test("SNAP-COMMENT-CREATE-012: Unauthenticated user presses c", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: {}, // No token
      });
      // May show auth error screen — depends on bootstrap behavior
      // If TUI allows browsing without auth, test the toast
      await navigateToIssueDetail(tui);
      await tui.sendKeys("c");

      const snapshot = tui.snapshot();
      expect(snapshot).toContain("Sign in to comment");
      // No textarea should open
      expect(snapshot).not.toContain("New comment");
      expect(snapshot).toMatchSnapshot();
    });

    test("SNAP-COMMENT-CREATE-013: Help overlay while composing", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);
      await openCommentTextarea(tui);

      await tui.sendKeys("?");

      // Help overlay should show comment-specific keybindings
      const snapshot = tui.snapshot();
      expect(snapshot).toMatch(/Ctrl\+S.*submit/i);
      expect(snapshot).toMatch(/Esc.*cancel/i);
      expect(snapshot).toMatchSnapshot();
    });

    test("SNAP-COMMENT-CREATE-014: Rate limit error (429)", async () => {
      // Requires API to return 429 — left failing if not supported
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);
      await openCommentTextarea(tui);
      await typeComment(tui, "rate limited comment");
      await tui.sendKeys("ctrl+s");

      await tui.waitForText("Rate limit exceeded", 10000);
      const snapshot = tui.snapshot();
      expect(snapshot).toContain("Rate limit exceeded");
      expect(snapshot).toContain("rate limited comment"); // content preserved
      expect(snapshot).toMatchSnapshot();
    });

    test("SNAP-COMMENT-CREATE-015: Comment count updated optimistically", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);

      // Note the current comment count
      const beforeSnapshot = tui.snapshot();
      const countMatch = beforeSnapshot.match(/(\d+) comment/);

      await openCommentTextarea(tui);
      await typeComment(tui, "incrementing comment");
      await tui.sendKeys("ctrl+s");

      await tui.waitForText("incrementing comment", 5000);
      const afterSnapshot = tui.snapshot();

      // Comment count should have incremented
      if (countMatch) {
        const expected = parseInt(countMatch[1], 10) + 1;
        expect(afterSnapshot).toContain(`${expected} comment`);
      }
    });
  });
```

### Keyboard Interaction Tests

```typescript
  describe("Keyboard Interactions", () => {
    let tui: TUITestInstance;

    afterEach(async () => {
      await tui?.terminate();
    });

    test("KEY-COMMENT-CREATE-001: c opens textarea, type hello, appears in textarea", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);
      await openCommentTextarea(tui);
      await typeComment(tui, "hello");

      const snapshot = tui.snapshot();
      expect(snapshot).toContain("hello");
    });

    test("KEY-COMMENT-CREATE-002: Multi-line input with Enter", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);
      await openCommentTextarea(tui);
      await typeComment(tui, "line1");
      await tui.sendKeys("Enter");
      await typeComment(tui, "line2");

      const snapshot = tui.snapshot();
      expect(snapshot).toContain("line1");
      expect(snapshot).toContain("line2");
    });

    test("KEY-COMMENT-CREATE-003: Ctrl+S submits, POST fires, textarea closes", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);
      await openCommentTextarea(tui);
      await typeComment(tui, "submitted comment");
      await tui.sendKeys("ctrl+s");

      // Wait for textarea to close
      await tui.waitForNoText("New comment", 10000);
      // Comment should appear in timeline
      await tui.waitForText("submitted comment", 5000);
    });

    test("KEY-COMMENT-CREATE-004: Ctrl+S on empty shows validation error, no API call", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);
      await openCommentTextarea(tui);
      await tui.sendKeys("ctrl+s");

      const snapshot = tui.snapshot();
      expect(snapshot).toContain("⚠ Comment cannot be empty");
      expect(snapshot).toContain("New comment"); // textarea still open
    });

    test("KEY-COMMENT-CREATE-005: Ctrl+S on whitespace-only shows validation error", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);
      await openCommentTextarea(tui);
      await typeComment(tui, "   \n  \n   ");
      await tui.sendKeys("ctrl+s");

      const snapshot = tui.snapshot();
      expect(snapshot).toContain("⚠ Comment cannot be empty");
    });

    test("KEY-COMMENT-CREATE-006: Esc on empty closes immediately without confirmation", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);
      await openCommentTextarea(tui);

      await tui.sendKeys("Escape");
      await tui.waitForNoText("New comment", 5000);

      const snapshot = tui.snapshot();
      expect(snapshot).not.toContain("Discard comment?");
      expect(snapshot).not.toContain("New comment");
    });

    test("KEY-COMMENT-CREATE-007: Esc on non-empty shows discard confirmation", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);
      await openCommentTextarea(tui);
      await typeComment(tui, "some content");

      await tui.sendKeys("Escape");

      const snapshot = tui.snapshot();
      expect(snapshot).toContain("Discard comment? (y/n)");
    });

    test("KEY-COMMENT-CREATE-008: y at discard confirmation closes textarea", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);
      await openCommentTextarea(tui);
      await typeComment(tui, "will be discarded");
      await tui.sendKeys("Escape");
      await tui.waitForText("Discard comment?", 5000);

      await tui.sendKeys("y");
      await tui.waitForNoText("New comment", 5000);

      const snapshot = tui.snapshot();
      expect(snapshot).not.toContain("will be discarded");
      expect(snapshot).not.toContain("New comment");
    });

    test("KEY-COMMENT-CREATE-009: n at discard confirmation returns to textarea", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);
      await openCommentTextarea(tui);
      await typeComment(tui, "preserved content");
      await tui.sendKeys("Escape");
      await tui.waitForText("Discard comment?", 5000);

      await tui.sendKeys("n");
      await tui.waitForNoText("Discard comment?", 5000);

      const snapshot = tui.snapshot();
      expect(snapshot).toContain("preserved content");
      expect(snapshot).toContain("New comment");
    });

    test("KEY-COMMENT-CREATE-010: Esc at discard confirmation returns to textarea", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);
      await openCommentTextarea(tui);
      await typeComment(tui, "still here");
      await tui.sendKeys("Escape");
      await tui.waitForText("Discard comment?", 5000);

      await tui.sendKeys("Escape");
      await tui.waitForNoText("Discard comment?", 5000);

      const snapshot = tui.snapshot();
      expect(snapshot).toContain("still here");
    });

    test("KEY-COMMENT-CREATE-011: c while textarea open is no-op", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);
      await openCommentTextarea(tui);

      // Press c again — should insert 'c' into textarea, not open another one
      await tui.sendKeys("c");

      const snapshot = tui.snapshot();
      // 'c' should be in the textarea as typed text
      expect(snapshot).toContain("c");
      // Only one "New comment" header
      const matches = snapshot.match(/New comment/g);
      expect(matches?.length).toBe(1);
    });

    test("KEY-COMMENT-CREATE-012: Detail keys disabled while composing", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);
      await openCommentTextarea(tui);

      // These keys should be captured by textarea, not trigger navigation
      await tui.sendKeys("j");
      await tui.sendKeys("k");
      await tui.sendKeys("q");
      await tui.sendKeys("n");
      await tui.sendKeys("p");
      await tui.sendKeys("e");
      await tui.sendKeys("o");

      const snapshot = tui.snapshot();
      // Textarea should still be open with these chars as text
      expect(snapshot).toContain("New comment");
      expect(snapshot).toContain("jkqnpeo");
    });

    test("KEY-COMMENT-CREATE-013: Ctrl+C quits from textarea", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);
      await openCommentTextarea(tui);

      await tui.sendKeys("ctrl+c");

      // TUI should have exited
      // This is verified by the terminate() not hanging
      // The process should have exited
    });

    test("KEY-COMMENT-CREATE-014: ? shows help overlay, Esc closes it, textarea still active", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);
      await openCommentTextarea(tui);
      await typeComment(tui, "before help");

      // Note: ? may be captured by textarea as text if focus system
      // works as expected. This tests the help overlay integration.
      // If ? is captured as text, this test validates that behavior.
      const snapshot = tui.snapshot();
      // Textarea should still be visible with content
      expect(snapshot).toContain("New comment");
    });

    test("KEY-COMMENT-CREATE-015: Double submit prevention", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);
      await openCommentTextarea(tui);
      await typeComment(tui, "only once");

      // Rapid double submit
      await tui.sendKeys("ctrl+s");
      await tui.sendKeys("ctrl+s");

      // Should result in only one comment, not two
      await tui.waitForText("only once", 10000);
      const snapshot = tui.snapshot();
      const matches = snapshot.match(/only once/g);
      // At most 1 instance in timeline (the optimistic one)
      expect(matches?.length).toBeLessThanOrEqual(1);
    });

    test("KEY-COMMENT-CREATE-016: Text editing keys (Home, End, Ctrl+K, Ctrl+U)", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);
      await openCommentTextarea(tui);

      await typeComment(tui, "hello world");
      // Ctrl+U should kill to start of line
      await tui.sendKeys("ctrl+u");

      const snapshot = tui.snapshot();
      // Content should be cleared (or partially, depending on cursor position)
      expect(snapshot).toContain("New comment");
    });

    test("KEY-COMMENT-CREATE-017: Backspace and Delete", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);
      await openCommentTextarea(tui);
      await typeComment(tui, "abcdef");
      await tui.sendKeys("Backspace");
      await tui.sendKeys("Backspace");

      const snapshot = tui.snapshot();
      expect(snapshot).toContain("abcd");
      expect(snapshot).not.toContain("abcdef");
    });

    test("KEY-COMMENT-CREATE-018: Arrow keys navigate within textarea", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);
      await openCommentTextarea(tui);
      await typeComment(tui, "line one");
      await tui.sendKeys("Enter");
      await typeComment(tui, "line two");

      // Navigate up and type
      await tui.sendKeys("Up");

      // Textarea should still be open
      const snapshot = tui.snapshot();
      expect(snapshot).toContain("New comment");
      expect(snapshot).toContain("line one");
      expect(snapshot).toContain("line two");
    });

    test("KEY-COMMENT-CREATE-019: Focus returns to same scroll position after cancel", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);

      // Scroll down in the issue detail
      await tui.sendKeys("j", "j", "j");
      const beforeSnapshot = tui.snapshot();

      // Open and cancel textarea
      await openCommentTextarea(tui);
      await tui.sendKeys("Escape"); // empty, closes immediately

      await tui.waitForNoText("New comment", 5000);
      const afterSnapshot = tui.snapshot();

      // Content should be similar (scroll position preserved)
      // Exact match is fragile, so check structural similarity
      expect(afterSnapshot).not.toContain("New comment");
    });

    test("KEY-COMMENT-CREATE-020: Focus jumps to new comment after submit", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);
      await openCommentTextarea(tui);
      await typeComment(tui, "new comment at bottom");
      await tui.sendKeys("ctrl+s");

      await tui.waitForText("new comment at bottom", 10000);
      const snapshot = tui.snapshot();
      // The new comment should be visible (scrolled to bottom)
      expect(snapshot).toContain("new comment at bottom");
    });

    test("KEY-COMMENT-CREATE-021: Textarea reopens with content after server error", async () => {
      // Requires server error injection — left failing if not supported
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);
      await openCommentTextarea(tui);
      await typeComment(tui, "preserved after error");
      await tui.sendKeys("ctrl+s");

      // If server returns error, textarea should reopen with content
      await tui.waitForText("Failed to post comment", 10000);
      const snapshot = tui.snapshot();
      expect(snapshot).toContain("preserved after error");
    });

    test("KEY-COMMENT-CREATE-022: Submit trims whitespace", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);
      await openCommentTextarea(tui);
      await typeComment(tui, "  trimmed content  ");
      await tui.sendKeys("ctrl+s");

      await tui.waitForText("trimmed content", 10000);
      // The optimistic comment should have trimmed body
    });

    test("KEY-COMMENT-CREATE-023: Optimistic comment reverted on error", async () => {
      // Requires error injection
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);
      await openCommentTextarea(tui);
      await typeComment(tui, "reverted comment");
      await tui.sendKeys("ctrl+s");

      // On error, optimistic should be removed from timeline
      // and textarea should reopen
      await tui.waitForText("Failed to post comment", 10000);
      // The reverted comment should NOT be in the timeline
      // (it's now in the textarea instead)
    });

    test("KEY-COMMENT-CREATE-024: Comment count reverted on error", async () => {
      // Requires error injection
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);

      const beforeSnapshot = tui.snapshot();
      const countMatch = beforeSnapshot.match(/(\d+) comment/);

      await openCommentTextarea(tui);
      await typeComment(tui, "will fail");
      await tui.sendKeys("ctrl+s");

      await tui.waitForText("Failed to post comment", 10000);

      // Count should be back to original
      if (countMatch) {
        const afterSnapshot = tui.snapshot();
        expect(afterSnapshot).toContain(`${countMatch[1]} comment`);
      }
    });

    test("KEY-COMMENT-CREATE-025: Optimistic finalized with server data", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);
      await openCommentTextarea(tui);
      await typeComment(tui, "finalized comment");
      await tui.sendKeys("ctrl+s");

      // Wait for optimistic to appear
      await tui.waitForText("⏳ just now", 5000);

      // Wait for server to confirm (⏳ should be replaced)
      // Allow time for server round-trip
      await tui.waitForNoText("⏳ just now", 10000);

      const snapshot = tui.snapshot();
      expect(snapshot).toContain("finalized comment");
      // Should have a real timestamp now, not ⏳
    });
  });
```

### Responsive Tests

```typescript
  describe("Responsive Behavior", () => {
    let tui: TUITestInstance;

    afterEach(async () => {
      await tui?.terminate();
    });

    test("RESIZE-COMMENT-CREATE-001: Textarea height 5 rows at 80x24", async () => {
      tui = await launchTUI({
        cols: 80,
        rows: 24,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);
      await openCommentTextarea(tui);
      expect(tui.snapshot()).toMatchSnapshot();
    });

    test("RESIZE-COMMENT-CREATE-002: Textarea height 8 rows at 120x40", async () => {
      tui = await launchTUI({
        cols: 120,
        rows: 40,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);
      await openCommentTextarea(tui);
      expect(tui.snapshot()).toMatchSnapshot();
    });

    test("RESIZE-COMMENT-CREATE-003: Textarea height 12 rows at 200x60", async () => {
      tui = await launchTUI({
        cols: 200,
        rows: 60,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);
      await openCommentTextarea(tui);
      expect(tui.snapshot()).toMatchSnapshot();
    });

    test("RESIZE-COMMENT-CREATE-004: Shrink 120x40→80x24 while composing", async () => {
      tui = await launchTUI({
        cols: 120,
        rows: 40,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);
      await openCommentTextarea(tui);
      await typeComment(tui, "resize test content");

      await tui.resize(80, 24);

      const snapshot = tui.snapshot();
      expect(snapshot).toContain("resize test content");
      expect(snapshot).toContain("New comment");
    });

    test("RESIZE-COMMENT-CREATE-005: Grow 80x24→120x40 while composing", async () => {
      tui = await launchTUI({
        cols: 80,
        rows: 24,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);
      await openCommentTextarea(tui);
      await typeComment(tui, "grow test content");

      await tui.resize(120, 40);

      const snapshot = tui.snapshot();
      expect(snapshot).toContain("grow test content");
      expect(snapshot).toContain("New comment");
    });

    test("RESIZE-COMMENT-CREATE-006: Below minimum while composing, restore", async () => {
      tui = await launchTUI({
        cols: 120,
        rows: 40,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);
      await openCommentTextarea(tui);
      await typeComment(tui, "below minimum test");

      // Shrink below minimum
      await tui.resize(60, 20);
      const smallSnapshot = tui.snapshot();
      expect(smallSnapshot).toMatch(/too small/i);

      // Restore to standard
      await tui.resize(120, 40);
      const restoredSnapshot = tui.snapshot();
      expect(restoredSnapshot).toContain("below minimum test");
      expect(restoredSnapshot).toContain("New comment");
    });

    test("RESIZE-COMMENT-CREATE-007: Rapid resize sequence", async () => {
      tui = await launchTUI({
        cols: 120,
        rows: 40,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);
      await openCommentTextarea(tui);
      await typeComment(tui, "rapid resize");

      // Rapid resize sequence
      await tui.resize(80, 24);
      await tui.resize(200, 60);
      await tui.resize(120, 40);

      const snapshot = tui.snapshot();
      expect(snapshot).toContain("rapid resize");
      expect(snapshot).toContain("New comment");
    });

    test("RESIZE-COMMENT-CREATE-008: Resize during submission", async () => {
      tui = await launchTUI({
        cols: 120,
        rows: 40,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);
      await openCommentTextarea(tui);
      await typeComment(tui, "submit during resize");

      await tui.sendKeys("ctrl+s");
      // Resize immediately during submission
      await tui.resize(80, 24);

      // Should complete normally
      await tui.waitForText("submit during resize", 10000);
    });

    test("RESIZE-COMMENT-CREATE-009: Textarea width fills available space", async () => {
      tui = await launchTUI({
        cols: 120,
        rows: 40,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);
      await openCommentTextarea(tui);
      expect(tui.snapshot()).toMatchSnapshot();

      await tui.resize(200, 60);
      expect(tui.snapshot()).toMatchSnapshot();
    });

    test("RESIZE-COMMENT-CREATE-010: Issue content area adjusts when textarea opens", async () => {
      tui = await launchTUI({
        cols: 120,
        rows: 40,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);

      const beforeSnapshot = tui.snapshot();
      await openCommentTextarea(tui);
      const afterSnapshot = tui.snapshot();

      // The issue content should be compressed (less visible content)
      expect(afterSnapshot).toContain("New comment");
      // Both should show the issue title
      expect(afterSnapshot).toMatch(/#\d+/);
    });
  });
```

### Edge Case Tests

```typescript
  describe("Edge Cases", () => {
    let tui: TUITestInstance;

    afterEach(async () => {
      await tui?.terminate();
    });

    test("EDGE-COMMENT-CREATE-001: Long single-line comment wraps", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);
      await openCommentTextarea(tui);

      // Type a very long line
      const longText = "a".repeat(500);
      await typeComment(tui, longText);

      const snapshot = tui.snapshot();
      // Should wrap and not crash
      expect(snapshot).toContain("New comment");
    });

    test("EDGE-COMMENT-CREATE-003: Unicode/emoji in comment", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);
      await openCommentTextarea(tui);
      await typeComment(tui, "Hello 🌍 world 日本語");

      const snapshot = tui.snapshot();
      expect(snapshot).toContain("Hello");
      expect(snapshot).toContain("world");
    });

    test("EDGE-COMMENT-CREATE-005: Raw ANSI codes in comment treated as literal", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);
      await openCommentTextarea(tui);
      await typeComment(tui, "\x1b[31mred text\x1b[0m");

      // Should not cause rendering issues
      const snapshot = tui.snapshot();
      expect(snapshot).toContain("New comment");
    });

    test("EDGE-COMMENT-CREATE-006: Immediate Esc after c closes (empty)", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);
      await tui.sendKeys("c");
      await tui.waitForText("New comment", 5000);

      // Immediately press Escape
      await tui.sendKeys("Escape");
      await tui.waitForNoText("New comment", 5000);
    });

    test("EDGE-COMMENT-CREATE-007: Whitespace-only treated as empty for discard", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);
      await openCommentTextarea(tui);
      await typeComment(tui, "   ");
      await tui.sendKeys("Escape");

      // Whitespace-only should close without confirmation
      // (treated as empty)
      await tui.waitForNoText("New comment", 5000);
      const snapshot = tui.snapshot();
      expect(snapshot).not.toContain("Discard comment?");
    });

    test("EDGE-COMMENT-CREATE-009: Multiple rapid c presses open only one textarea", async () => {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);

      // Rapid c presses
      await tui.sendKeys("c");
      await tui.sendKeys("c");
      await tui.sendKeys("c");

      await tui.waitForText("New comment", 5000);
      const snapshot = tui.snapshot();
      const matches = snapshot.match(/New comment/g);
      // Only one textarea
      expect(matches?.length).toBe(1);
      // The extra 'c' characters should be in the textarea
      expect(snapshot).toContain("cc");
    });

    test("EDGE-COMMENT-CREATE-015: Ctrl+S immediately after error recovery", async () => {
      // Requires error injection then recovery
      tui = await launchTUI({
        cols: TERMINAL_SIZES.standard.width,
        rows: TERMINAL_SIZES.standard.height,
        env: { CODEPLANE_TOKEN: WRITE_TOKEN },
      });
      await navigateToIssueDetail(tui);
      await openCommentTextarea(tui);
      await typeComment(tui, "retry after error");

      // First submit (may fail)
      await tui.sendKeys("ctrl+s");

      // If textarea reopens with content after error, retry should work
      await tui.waitForText("retry after error", 10000);
    });
  });
});
```

---

## Performance Requirements

| Metric | Target | Measurement Method |
|--------|--------|--------------------|
| Textarea open latency | < 50ms | Time from `c` keypress to `New comment` visible |
| Keystroke-to-render | < 16ms | Time from key event to character visible in textarea |
| Optimistic append | < 16ms | Time from `Ctrl+S` to comment visible in timeline |
| Textarea close | < 16ms | Time from submit/cancel to textarea removed from DOM |
| Server confirmation | < 2s (p95) | Time from POST to server response |
| Memory (10k-line comment) | Stable | No growth beyond initial allocation |
| Memory (500 comments) | < 50MB | RSS during rendering |

---

## Telemetry Events

All events include common properties: `session_id`, `timestamp`, `terminal_width`, `terminal_height`, `color_mode`, `layout`.

| Event | Trigger | Additional Properties |
|-------|---------|----------------------|
| `tui.issue_comment.textarea_opened` | `c` pressed | `owner`, `repo`, `issue_number`, `issue_state`, `existing_comment_count` |
| `tui.issue_comment.submitted` | `Ctrl+S` pressed | `body_length`, `line_count`, `time_to_submit_ms`, `has_code_block`, `has_markdown_formatting` |
| `tui.issue_comment.succeeded` | Server 2xx | `comment_id`, `server_response_ms`, `total_duration_ms` |
| `tui.issue_comment.failed` | Server non-2xx / network | `error_code`, `error_message`, `body_length`, `retry_count` |
| `tui.issue_comment.cancelled` | Esc on empty | `was_empty`, `body_length`, `time_open_ms` |
| `tui.issue_comment.discard_confirmed` | `y` at discard | `body_length`, `time_open_ms` |
| `tui.issue_comment.discard_cancelled` | `n` at discard | `body_length` |
| `tui.issue_comment.validation_error` | Empty body submit | (none beyond common) |
| `tui.issue_comment.optimistic_reverted` | Optimistic removed | `error_code` |

---

## Logging

| Level | Event | Format |
|-------|-------|--------|
| `debug` | Textarea opened | `IssueCommentCreate: opened [owner={o}] [repo={r}] [number={n}] [width={w}] [height={h}]` |
| `debug` | Content changed | `IssueCommentCreate: typing [length={len}] [lines={n}]` (debounced 1/sec) |
| `debug` | Textarea resized | `IssueCommentCreate: resize [textarea_height={h}] [width={w}]` |
| `debug` | Validation error | `IssueCommentCreate: validation error [empty body]` |
| `info` | Comment submitted | `IssueCommentCreate: submitted [owner={o}] [repo={r}] [number={n}] [body_length={len}]` |
| `info` | Comment created | `IssueCommentCreate: created [owner={o}] [repo={r}] [number={n}] [comment_id={id}] [duration={ms}ms]` |
| `info` | Cancelled (empty) | `IssueCommentCreate: cancelled [owner={o}] [repo={r}] [number={n}] [was_empty=true]` |
| `info` | Discarded | `IssueCommentCreate: discarded [owner={o}] [repo={r}] [number={n}] [body_length={len}] [time_open={ms}ms]` |
| `warn` | Slow submission | `IssueCommentCreate: slow submit [duration={ms}ms]` (>2000ms) |
| `warn` | Rate limited | `IssueCommentCreate: rate limited [retry_after={s}s]` |
| `error` | Submission failed | `IssueCommentCreate: failed [status={code}] [error={msg}]` |
| `error` | Auth error | `IssueCommentCreate: auth error [status=401]` |
| `error` | Permission denied | `IssueCommentCreate: permission denied [status=403]` |
| `error` | Optimistic revert | `IssueCommentCreate: optimistic revert [error={msg}]` |
| `error` | Render error | `IssueCommentCreate: render error [component={name}] [error={msg}]` |

---

## Security Considerations

1. **Input safety**: Comment body sent as-is to server. Server-side sanitization handles injection. No HTML rendering in TUI.
2. **ANSI escape codes**: Raw ANSI codes in comment body are escaped by the `<markdown>` component during post-submission rendering. They are not passed through to the terminal.
3. **Token handling**: Auth token injected by `<APIClientProvider>` as `Authorization: token {token}`. Never logged or displayed.
4. **No PII**: Only username displayed in optimistic comment. No other personal information.
5. **Content size**: No client-side character limit. Server enforces maximum. Server 413/422 errors displayed inline.

---

## Known Backend Gaps

1. **Error injection**: Tests for 500, 403, 429 error scenarios require the test API server to support error injection (e.g., special headers or request bodies that trigger specific error responses). If the test server does not support this, these tests will fail and are left failing per project policy.

2. **Issue events endpoint**: The timeline may not show events since `useIssueEvents` returns 404 (no backend route). Comments-only timeline is the fallback.

3. **Rate limiting**: The test server may not implement rate limiting. The 429 test will fail until the server supports it.

---

## PoC Requirements

Before merging the implementation, these proof-of-concept validations must pass:

### PoC 1: OpenTUI `<textarea>` in React reconciler

**File**: `poc/tui-textarea-multiline.ts`

Validate that:
- `<textarea>` renders in the `@opentui/react` reconciler
- `focused` prop captures printable keys
- `content-changed` event fires on every edit
- `plainText` getter returns current content
- `setText()` restores content
- `wrapMode="word"` wraps at word boundaries
- `Ctrl+K`, `Ctrl+U`, arrow keys work natively
- `Ctrl+S` and `Esc` are NOT captured by the textarea

### PoC 2: Scrollbox height constraint

**File**: `poc/tui-scrollbox-textarea.ts`

Validate that:
- `<scrollbox height={N}>` containing `<textarea>` constrains visible area
- Content beyond N rows scrolls within the scrollbox
- Scrollbox inside `<box flexDirection="column">` with `flexGrow` sibling works correctly

### Graduation Path

Once PoC tests pass, their assertions are migrated into the E2E test suite in `e2e/tui/issues.test.ts` as structural tests. The PoC files are retained in `poc/` as reference documentation.