# Implementation Plan: TUI Wiki Detail View

## Overview
This document outlines the step-by-step implementation for the Codeplane TUI Wiki Detail View, including the main rendering screen, responsive metadata header, edit form, delete confirmation, keyboard navigation, and corresponding E2E tests. This implementation leverages OpenTUI components and Codeplane's shared UI hooks.

## 1. Prerequisites

**Data Hooks Dependency**: The data access hooks (`useWikiPage`, `useWikiPages`, `useWikiUpdate`, `useWikiDelete`) are presumed to be provided by `@codeplane/ui-core` (typically addressed in a separate ticket like `tui-wiki-data-hooks`). If they are not yet available, they must be stubbed or mocked during this implementation to ensure the UI can be developed and tested.

## 2. Component Implementation

### Step 2.1: Create `WikiPageHeader` Component
**File**: `apps/tui/src/screens/Wiki/components/WikiPageHeader.tsx`
- **Purpose**: Render the title and metadata of the wiki page, adjusting layout based on terminal dimensions.
- **Implementation Details**:
  - Import `useLayout` from `apps/tui/src/hooks/useLayout.ts` and `useTheme` from `apps/tui/src/hooks/useTheme.ts`.
  - Define props: `title` (string), `slug` (string), `author` (object/string), `createdAt` (string/Date).
  - Read `layout.breakpoint`.
  - **Compact Mode** (`breakpoint === null` or small width): Render `<box flexDirection="row">` containing the title (using `theme.primary`), author, and compact timestamp. Omit the slug.
  - **Standard Mode**: Render title, author, full timestamp, and the slug (using `theme.muted`).

### Step 2.2: Create `WikiEditForm` Component
**File**: `apps/tui/src/screens/Wiki/components/WikiEditForm.tsx`
- **Purpose**: An inline overlay form for editing the wiki page title and body.
- **Implementation Details**:
  - Use OpenTUI's `<box position="absolute" zIndex={100} ...>` to act as a modal covering the main content.
  - State: `title`, `body`, `isDirty`.
  - Form inputs: `<input label="Title" ... />` and `<textarea label="Body" ... />`.
  - Provide local keybindings:
    - `Ctrl+S`: Call `onSubmit` with updated data.
    - `Esc`: If `isDirty` is true, prompt for discard confirmation (inline or via `useOverlay`). If confirmed or not dirty, call `onCancel`.
  - Render inline validation errors using `theme.error` if the parent passes an error state.

### Step 2.3: Implement `WikiDetailScreen`
**File**: `apps/tui/src/screens/Wiki/WikiDetailScreen.tsx`
- **Purpose**: The primary screen component that fetches data, renders the markdown, and orchestrates actions.
- **Implementation Details**:
  - **State**: `isEditing` (boolean) to toggle the `<WikiEditForm>`.
  - **Hooks**:
    - `const { page, isLoading, error } = useWikiPage(slug);`
    - `const { deletePage } = useWikiDelete();`
    - `const { openOverlay } = useOverlay();`
    - `const { popScreen, pushScreen } = useNavigation();` // standard stack navigation hook
  - **Loading/Error States**:
    - If `isLoading`: Render `<box><text>Loading...</text></box>`.
    - If `error` (e.g., 404): Render `<box><text color={theme.error}>Wiki page not found</text></box>`.
  - **Layout**:
    - Render `<WikiPageHeader>`.
    - Render `<scrollbox><markdown>{page.body}</markdown></scrollbox>`. Add truncation handling (`EDGE-WIKI-DET-002`) by checking `page.body.length` and appending/prepending a warning text if it exceeds a massive limit.
  - **Keybindings** (via `useScreenKeybindings`):
    - `]`: Next page (fetch next slug from `useWikiPages` or adjacent context, push to stack).
    - `[`: Previous page.
    - `e`: Set `isEditing(true)`.
    - `d`: Call `openOverlay("confirm", { title: "Delete wiki page?", message: "...", onConfirm: async () => { await deletePage(slug); popScreen(); } })`.
    - `q`: Call `popScreen()` to return to the list.

## 3. Routing & Stack Integration

**File**: `apps/tui/src/App.tsx` (or your central router definition)
- Ensure the `WikiDetailScreen` is registered in the screen registry so it can be pushed onto the stack via `pushScreen("WikiDetail", { slug: "..." })`.

## 4. End-to-End Testing

**File**: `e2e/tui/wiki.test.ts`
- Setup: Use `@microsoft/tui-test` helpers (`launchTUI()`, mock API responses).
- **Test Cases**:
  - `SNAP-WIKI-DET-001` (Layout): Load a standard wiki page fixture. Assert the output matches the golden file snapshot, ensuring the header and markdown body are correctly formatted.
  - `KEY-WIKI-DET-006` (Navigation): Load the screen. Simulate `tui.press("]")`. Assert the screen transitions to the next wiki page fixture. Simulate `tui.press("[")` to go back.
  - `KEY-WIKI-DET-010` (Edit Flow): Press `e`. Assert form appears. Modify `<input>` text. Press `Ctrl+S`. Assert API receives PUT/PATCH request and UI reflects optimistic update.
  - `KEY-WIKI-DET-012` (Discard Flow): Press `e`. Modify text. Press `Esc`. Assert "Discard changes?" overlay appears. Press `y`. Assert form closes without saving.
  - `KEY-WIKI-DET-016` (Delete Flow): Press `d`. Assert confirm overlay appears. Press `y`. Assert DELETE API call is made and screen pops back to Wiki List.
  - `DATA-WIKI-DET-003` (404 Handling): Mock 404 response. Assert "Wiki page not found" error text is rendered.
  - `DATA-WIKI-DET-007` (Validation): Open edit form, enter bad slug/title, press `Ctrl+S`. Mock 400 response. Assert inline validation error renders and form remains open.
  - `EDGE-WIKI-DET-002` (Truncation): Mock page with 105,000 char body. Assert truncation warning text is visible in the tree.
