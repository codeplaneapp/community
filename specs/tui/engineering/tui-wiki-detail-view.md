# Engineering Specification: TUI Wiki Detail View

## Overview

The Wiki Detail View is the primary screen for reading wiki page content within the Codeplane TUI. It provides a full-featured markdown rendering experience optimized for terminal reading, alongside built-in support for editing, deleting, and navigating between adjacent wiki pages without returning to the list. It implements responsive adaptations to ensure readability across varying terminal dimensions (from minimum 80x24 up to large 200x60).

## Implementation Plan

### 1. Create the Wiki Page Header Component
**File**: `apps/tui/src/screens/Wiki/components/WikiPageHeader.tsx`
- Implement a responsive header component that displays the wiki page title and metadata.
- Consume `useLayout` (to get `breakpoint`) and `useTheme` for semantic colors.
- **Layout mapping**:
  - **Compact (80x24)**: Render the title (wrapped) and author username with a compact relative timestamp on a single line. Hide the slug.
  - **Standard (120x40)** / **Expanded (200x60+)**: Render the full metadata row including `createdAt` and `updatedAt` (if different). Display the slug in `theme.muted` adjacent to the title. For expanded, use full verbose timestamps.
- Draw a horizontal rule below the metadata using `theme.border` color and `width - 2` repetition of `─`.

### 2. Create the Wiki Delete Confirmation Component
**File**: `apps/tui/src/screens/Wiki/components/WikiDeleteConfirm.tsx`
- Implement an overlay dialog leveraging the TUI's `ModalSystem` to confirm destructive actions.
- **Props**: `visible`, `title`, `onConfirm`, `onCancel`, `error`.
- **Interactions**: Render a centered prompt: `Delete wiki page '<title>'? This cannot be undone. [y/n]`. Trap keyboard focus. Bind `y` to execute `onConfirm()` and `n` to execute `onCancel()`.
- Display any API `error` inline using the `theme.error` token.

### 3. Create the Wiki Edit Form Component
**File**: `apps/tui/src/screens/Wiki/components/WikiEditForm.tsx`
- Implement a full-screen or modal overlay using the TUI `FormSystem` abstractions.
- **Props**: `visible`, `initialTitle`, `initialSlug`, `initialBody`, `onSubmit`, `onCancel`, `error`.
- **Fields**:
  - `Title`: Required `<input>`.
  - `Slug`: `<input>`, must validate against a lowercase alphanumeric with hyphens regex.
  - `Body`: `<textarea>` or multi-line text equivalent for content.
- **Interactions**: 
  - Use `Tab` / `Shift+Tab` to move focus.
  - Bind `Ctrl+S` to submit form data.
  - Bind `Esc` to cancel. If any field values differ from initial values, trigger a secondary discard confirmation: `Discard changes? [y/n]`.

### 4. Implement the Wiki Detail View Screen
**File**: `apps/tui/src/screens/Wiki/WikiDetailView.tsx`
- **Data Fetching**: Use `@codeplane/ui-core`'s `useWikiPage(owner, repo, slug)`. Handle loading state with a full-screen spinner (`"Loading wiki page…"`). Handle 404 errors with a graceful `theme.error` fallback (`"Wiki page not found"`, press `q` to go back). Handle network timeouts with a retry action (`R`).
- **Body Rendering**: Wrap the OpenTUI `<markdown>` component in a `<scrollbox>`. Render `"This page has no content."` in `theme.muted` italics if empty. Enforce the 100,000 character limit by truncating `body` and appending a warning: `"Content truncated. View full page on web."`.
- **Keybindings (`useScreen` / `KeybindingProvider`)**:
  - Register `j`/`k`, `Ctrl+D`/`U`, `G`/`gg` to pass through to the scrollbox.
  - Register `[` and `]` to navigate between pages. Lazily load adjacent pages via `useWikiPages`. Show a transient status bar indicator if bounds are hit (`"First page"`/`"Last page"`).
  - Register `e` to show `WikiEditForm`.
  - Register `d` to show `WikiDeleteConfirm`.
  - Disable `e` and `d` mappings entirely if the user lacks write access.
- **Mutations & Navigation**: 
  - Hook up `useUpdateWikiPage` for optimistic edits.
  - Hook up `useDeleteWikiPage`. On successful delete, call `NavigationContext.pop()` to return to the wiki list.

### 5. Telemetry & Navigation Setup
**File**: `apps/tui/src/screens/Wiki/WikiDetailView.tsx`
- Dispatch `tui.wiki_detail.viewed` metrics on render, including terminal dimensions and body lengths.
- Bind `useStatusBarHints` dynamically: `j/k:scroll [/]:prev/next e:edit d:delete q:back`.
- Set header breadcrumb dynamically: truncate the page title to 30 characters maximum and push `... > Wiki > <title>` to the stack.

## Unit & Integration Tests

**File**: `e2e/tui/wiki.test.ts`

### Terminal Snapshot Tests
- **SNAP-WIKI-DET-001**: Render detail at `120x40`. Snapshot header, full metadata row with slug, and markdown content containing Headings, Lists, and Code blocks.
- **SNAP-WIKI-DET-002**: Render detail at `80x24`. Verify compact layout hides slug and abbreviates timestamps.
- **SNAP-WIKI-DET-003**: Render detail at `200x60`. Verify expanded layout with wide padding and full timestamps.
- **SNAP-WIKI-DET-010**: Fetch non-existent slug, assert `"Wiki page not found"` and instructions to press `q` render accurately in the center.
- **SNAP-WIKI-DET-012**: Open the Edit Form overlay. Snapshot form layout with populated title, slug, and body fields.

### Keyboard Interaction Tests
- **KEY-WIKI-DET-001**: Validate `j/k` scrolling. Mock a long markdown body, press `j` repeatedly, and assert terminal regex output reflects a shifted vertical scroll window.
- **KEY-WIKI-DET-005**: Navigate `]`. Mock list payload, press `]`, assert title and body replace instantly with the adjacent page.
- **KEY-WIKI-DET-010**: Test edit flow. Press `e`, mock changing the `<input>` title text, press `Ctrl+S`. Ensure form overlay closes and detail view reflects the new optimistic title.
- **KEY-WIKI-DET-012**: Test discard flow. Press `e`, modify title, press `Esc`. Assert `"Discard changes? [y/n]"` text is displayed. Press `y` to close form.
- **KEY-WIKI-DET-016**: Test successful delete flow. Press `d`, press `y`. Verify the API client receives a `DELETE` call and the navigation stack pops (asserting standard Wiki list view is active).

### Responsive Resize Tests
- **RESIZE-WIKI-DET-001**: Initialize at `120x40`, assert full metadata. Simulate terminal resize to `80x24`. Assert the slug immediately hides and metadata compresses to one line.
- **RESIZE-WIKI-DET-004**: Scroll to `50%` depth, trigger terminal resize event. Assert scroll bounds remain vertically anchored with no content jank.

### Data & Edge Case Tests
- **DATA-WIKI-DET-003**: 404 Handling. Fetch a non-existent slug, assert `"Wiki page not found"` text renders. Press `q` and verify stack pops.
- **DATA-WIKI-DET-007**: Test Edit form slug validation. Set an invalid slug (`"A BAD SLUG!"`), press `Ctrl+S`, assert inline validation error renders without closing the overlay.
- **EDGE-WIKI-DET-002**: Body truncation. Mock a payload with 105,000 characters. Assert the warning text (`"Content truncated. View full page on web."`) is visible in the tree at the bottom of the file.