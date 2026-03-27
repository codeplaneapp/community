# Implementation Plan: TUI Issue Comment Create

## Step 1: Extend Types and Constants
**File:** `apps/tui/src/screens/Issues/types.ts`
1. Extend the `CommentDraft` interface to include fields for the comment lifecycle (`validationError`, `serverError`, `showDiscardConfirm`, `preservedScrollPosition`, `openedAt`).
2. Create a `createEmptyDraft()` factory function to return initial state.
3. Export responsive constants: `TEXTAREA_ROWS` (minimum: 5, standard: 8, large: 12), `ERROR_TOAST_AUTO_DISMISS_MS` (5000), and `SUBMISSION_TIMEOUT_MS` (10000).

## Step 2: Create Orchestration Hook
**File:** `apps/tui/src/screens/Issues/hooks/useCommentCreate.ts`
1. Create and export `useCommentCreate` hook that manages the full comment creation state machine.
2. Compose `useCreateIssueComment` from `@codeplane/ui-core` implementing callbacks for `onOptimistic`, `onSettled`, `onRevert`, and `onError`.
3. Implement `open`, `close`, `setBody`, `submit`, `confirmDiscard`, `cancelDiscard`, and `handleEscape` methods.
4. Add telemetry tracking and logger statements for debugging and product insights.

## Step 3: Implement CommentInput Component
**File:** `apps/tui/src/screens/Issues/components/CommentInput.tsx`
1. Build `CommentInput` replacing the previous stub using OpenTUI's native `<textarea>`.
2. Wrap the `<textarea>` in a `<scrollbox>` whose height relies on the `textareaHeight` determined by the terminal's breakpoint layout.
3. Add a `useEffect` to capture `textarea.on("content-changed", ...)` events and sync with React's draft state via the `onBodyChange` callback.
4. Handle focus dynamically and conditionally change styles if `draft.isSubmitting` is true.
5. Create and export `CommentInputErrorBoundary` class component in the same file to wrap the input and prevent crashes from tearing down the issue detail view.

## Step 4: Update CommentBlock Component
**File:** `apps/tui/src/screens/Issues/components/CommentBlock.tsx`
1. Add logic to identify optimistic comments by their negative ID (`comment.id < 0`).
2. Show a `⏳ just now` indicator in place of the timestamp for pending comments.

## Step 5: Update Exports
**Files:** 
- `apps/tui/src/screens/Issues/components/index.ts`
- `apps/tui/src/screens/Issues/hooks/index.ts`
1. Export `CommentInput` and `CommentInputErrorBoundary` from components index.
2. Export `useCommentCreate` from hooks index.

## Step 6: Integrate with IssueDetailScreen
**File:** `apps/tui/src/screens/Issues/IssueDetailScreen.tsx`
1. Import `useCommentCreate` and initialize it, passing down required tracking/mutating callbacks for the timeline array state.
2. Integrate status bar hints using `useStatusBarHints()`, conditionally overriding them with `Ctrl+S:submit │ Esc:cancel` when the textarea is open.
3. Conditionally register keybindings inside `useMemo` so that `c` opens the textarea when closed, and `ctrl+s`, `escape`, `y`, `n` perform the relevant actions when the textarea or discard confirm dialog are open. Note that `useScreenKeybindings` handles priority correctly.
4. Append `<CommentInput />` (wrapped in `<CommentInputErrorBoundary>`) at the bottom of the flex column (below the issue scrollbox).

## Step 7: Proof of Concept Tests
**Files:**
- `poc/tui-textarea-multiline.ts`
- `poc/tui-scrollbox-textarea.ts`
1. Write simple test scripts to validate the `<textarea>` rendering in the `@opentui/react` reconciler and focus capture behavior.
2. Validate that `scrollbox` appropriately limits the text view when combined with a fixed height and `<textarea>`.

## Step 8: Update E2E Test Suite
**File:** `e2e/tui/issues.test.ts`
1. Add snapshot tests validating the UI renders at standard breakpoints (`TERMINAL_SIZES` minimum, standard, large).
2. Add snapshot tests to ensure validation messages (e.g., empty submit, 401 Auth) render properly and inline status errors operate as expected.
3. Write keyboard interaction tests leveraging `TUITestInstance` to ensure that standard keys input text appropriately and that `Ctrl+S` appropriately submits, replacing optimistic comments with final ones.
4. Validate that `Esc` launches the discard confirm dialogue if the box has content.
5. Emulate rapid terminal resizes while the user is typing/submitting to confirm responsive boundaries adjust without data loss.