# Implementation Plan: TUI_DIFF_INLINE_COMMENTS

This plan outlines the steps to implement inline comments for landing request diffs in the Codeplane TUI.

## Phase 1: Core Types and Utilities

### Step 1: Define Inline Comment Types
**File:** `apps/tui/src/screens/DiffScreen/types.ts`
- Add `CommentAnchorKey` type and `makeCommentAnchorKey` helper.
- Define `CommentNavigationState` interface.
- Define `InlineCommentFormState` and `FailedCommentBodyMap` to manage creation state.

### Step 2: Implement Comment Utilities
**File:** `apps/tui/src/screens/DiffScreen/commentUtils.ts` (Create)
- Implement pure grouping function: `groupCommentsByAnchor`.
- Implement ordering: `orderCommentsForNavigation`.
- Add formatting helpers: `relativeTime` (sensitive to terminal breakpoint), `truncateUsername`, `truncatePathLeft`, `truncateBody`.
- Add layout helpers: `textareaHeight`, `commentSpacing`, `charCounterColor`, `validateCommentBody`, `sideFromLineType`, `hunksWithComments`.

## Phase 2: State Management Hooks

### Step 3: Implement Navigation Hook
**File:** `apps/tui/src/screens/DiffScreen/useCommentNavigation.ts` (Create)
- Create `useCommentNavigation` to manage the currently focused comment ID (`focusedCommentId`).
- Implement `focusNext`, `focusPrev`, and `clearFocus` functions mapped to the `n`/`p` keybindings, preserving cross-file boundary behavior.

### Step 4: Implement Comment Form Hook
**File:** `apps/tui/src/screens/DiffScreen/useCommentForm.ts` (Create)
- Create `useCommentForm` to handle form visibility, content, discard prompts, and submission state.
- Handle previously failed submissions using a `useRef<FailedCommentBodyMap>` to preserve drafts across interactions.
- Expose state and interaction methods: `openForm`, `closeForm`, `setBody`, `submitForm`, `handleEscape`, `confirmDiscard`, `cancelDiscard`, `preserveOnFailure`.

## Phase 3: UI Components

### Step 5: Implement Single Comment Block
**File:** `apps/tui/src/screens/DiffScreen/InlineCommentBlock.tsx` (Create)
- Build the component to render a single `LandingComment` using OpenTUI primitives (`<box>`, `<text>`, `<markdown>`).
- Apply bold text colors conditionally if `isFocused` is true.
- Add `process.env.NO_COLOR` safety check to toggle between `┃` and `|` borders.

### Step 6: Implement Comment Grouping Component
**File:** `apps/tui/src/screens/DiffScreen/InlineCommentGroup.tsx` (Create)
- Wrapper component to display multiple `InlineCommentBlock` components anchored to the same diff line chronologically.
- Handle dynamic spacing between comment blocks using `useBreakpoint()`.

### Step 7: Implement Comment Creation Form
**File:** `apps/tui/src/screens/DiffScreen/CommentForm.tsx` (Create)
- Build the inline textarea using OpenTUI's `<input multiline>`.
- Render UI elements including the file path, line number context, character counter (with color transitions), validation error texts, and discard confirmation prompts.
- Utilize `useLayout()` to adjust the textarea max-width and `useBreakpoint()` for responsive height.

## Phase 4: Integration and Interactivity

### Step 8: Telemetry Setup
**File:** `apps/tui/src/screens/DiffScreen/commentTelemetry.ts` (Create)
- Implement telemetry emitters leveraging `apps/tui/src/lib/telemetry.ts` for actions like `loaded`, `comment_focused`, `form_opened`, `submitted`, `succeeded`, and `failed`.

### Step 9: Make Hunk Collapse Comment-Aware
**File:** `apps/tui/src/screens/DiffScreen/useHunkCollapse.ts` (Extend existing hook)
- Extend the hook interface to accept `uncollapsibleHunks: Map<string, Set<number>>`.
- Update `collapseHunk` and `collapseAllInFile` to skip uncollapsible items.
- Add a `useEffect` that force-expands hunks dynamically when new comments populate the uncollapsible set.

### Step 10: Wire DiffScreen Logic & Keys
**File:** `apps/tui/src/screens/DiffScreen/DiffScreen.tsx` (Extend existing)
- Invoke `useLandingComments` and `useCreateLandingComment` conditionally when `params.mode === "landing"`.
- Compute uncollapsible hunks and grouping maps inside `useMemo`.
- Register new screen-level keybindings: `c` (open form), `n` (next comment), `p` (prev comment).
- Track optimistic ID generation using a React state `Set<number>`.
- If form is open, register a `PRIORITY.TEXT_INPUT` scope to trap inputs inside the `<CommentForm>` textarea. 
- Manage status bar hints to display contextual messaging dynamically.

### Step 11: Modify Content Renderer
**File:** `apps/tui/src/screens/DiffScreen/DiffContentArea.tsx` (Extend existing)
- While iterating through diff lines, query the grouping maps for the `CommentAnchorKey`.
- Insert `<InlineCommentGroup>` immediately after matching line elements.
- Insert `<CommentForm>` if the form's target coordinates match the active render line.
- Render orphaned (unanchored) comments safely at the bottom of the diff file block with a warning message.

## Phase 5: Automated E2E Testing

### Step 12: Test Implementations
**File:** `e2e/tui/diff.test.ts` (Extend existing)
- Implement the full suite of 107 E2E tests spanning Snapshot matches, Keyboard behaviors, Responsive layout sizing limits, Integration data loading logic, and Edge cases handling.
- Leave failing implementations failing where backend support is missing, never skipping tests directly.