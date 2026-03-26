# Codebase Research: TUI Wiki Detail View

## 1. Responsive Layout & Theming
The Codeplane TUI relies on strict, centralized hooks for handling responsive dimensions and terminal-safe semantic colors.

### `useLayout()`
**File:** `apps/tui/src/hooks/useLayout.ts`
- Returns the current terminal dimensions, calculated heights, and the active breakpoint (`"large" | "standard" | null`).
- `breakpoint === null` applies to terminals below 80x24 (handled globally by the `AppShell`, so screen components don't need to check for it).
- Important properties for `WikiPageHeader.tsx`:
  - `layout.breakpoint`: Used to toggle the compact header metadata (hide slug and update timestamps at 80x24).
  - `layout.contentHeight`: May be necessary for computing scroll limits, though `<scrollbox>` generally handles this automatically.

### `useTheme()`
**File:** `apps/tui/src/hooks/useTheme.ts`
- Returns semantic ANSI color tokens that adapt to the terminal's color capabilities (Truecolor vs 256 vs 16).
- Important properties:
  - `theme.primary` (ANSI 33): Used for usernames and focus outlines.
  - `theme.muted` (ANSI 245): Used for timestamps, slugs, and empty state text.
  - `theme.surface` & `theme.border`: Backgrounds and outlines for modals/forms.
  - `theme.error` (ANSI 196): For inline validation errors or destructive confirmation text.

## 2. Keybindings & Navigation
Screen-level keyboard interactions should not be attached to raw DOM events. The TUI provides a global keybinding context to ensure consistent dispatching and prevent scope collisions (like triggering screen actions while typing in an input).

### `useScreenKeybindings()`
**File:** `apps/tui/src/hooks/useScreenKeybindings.ts`
- Used inside `WikiDetailScreen.tsx` to bind screen-specific keys.
- Automatically registers keys at the `PRIORITY.SCREEN` scope.
- **Required bindings for Wiki Detail:**
  - `]`: Next wiki page
  - `[`: Previous wiki page
  - `e`: Open edit form
  - `d`: Trigger delete confirmation
  - `q`: Pop to the previous screen

```tsx
useScreenKeybindings([
  { key: "]", description: "Next page", group: "Navigation", handler: goNext },
  { key: "e", description: "Edit page", group: "Actions", handler: openEditForm },
  { key: "d", description: "Delete", group: "Actions", handler: triggerDelete },
  { key: "q", description: "Back", group: "Navigation", handler: goBack },
]);
```

## 3. Modals & Forms
The TUI has a global `OverlayManager` system that renders above the `AppShell`. Modals intercept keyboard events at `PRIORITY.MODAL`.

### `useOverlay()`
**File:** `apps/tui/src/hooks/useOverlay.ts`
**Renderer:** `apps/tui/src/components/OverlayLayer.tsx`
- Exposes `openOverlay(type, payload?)` and `closeOverlay()`.
- **Delete Action:** You can utilize the built-in `"confirm"` overlay type for the delete confirmation:
  ```tsx
  const { openOverlay } = useOverlay();
  
  openOverlay("confirm", {
    title: "Delete wiki page?",
    message: `Delete wiki page ${title}? This cannot be undone.`,
    confirmLabel: "Delete [y]",
    onConfirm: handleDelete
  });
  ```
- **Edit Form:** The `OverlayLayer` currently supports `"help"`, `"command-palette"`, and `"confirm"`. If the edit form is rendered as an overlay, the `OverlayLayer` component may need to be expanded to support a `"wiki-edit"` type, OR the form can be built inline within `WikiDetailScreen.tsx` using `position="absolute"` and `zIndex={100}`, manually managing focus and keyboard isolation.

## 4. OpenTUI Component Usage
The detail screen will rely heavily on native `@opentui/react` primitives:
- `<scrollbox>`: Required to wrap the `<markdown>` component to allow `j/k` scrolling for long wiki bodies.
- `<markdown>`: Standard openTUI component for parsing and rendering markdown. Will accept the `page.body` directly.
- `<box>`: Core layout building block. Flexbox props (`flexDirection`, `flexGrow`, `gap`) should be used over manual width/height calculations.

## 5. End-to-End Testing Constraints
Based on `e2e/tui/diff.test.ts` and `e2e/tui/helpers.ts`, the E2E tests for the TUI use a custom test runner matching terminal output snapshots and simulating key presses.

**Test File:** `e2e/tui/wiki.test.ts`
- Create `describe()` blocks for the major feature groups (`TUI_WIKI_DETAIL_VIEW — Layout & Responsive`, `... — Interactions`, `... — Edit Form`, `... — Edge Cases`).
- Implement tests exactly as requested in the spec (e.g., `SNAP-WIKI-DET-001`, `KEY-WIKI-DET-006`).
- Testing interactions involves:
  - Launching the TUI via `launchTUI()` helper.
  - Simulating keypresses (`tui.press("e")`).
  - Awaiting screen changes and performing regex assertions against the terminal buffer or using snapshot matches (`assert matches golden file`).

## 6. Data Hooks (Dependency Flag)
The `useWikiPage` and `useWikiPages` hooks required by the specification are slated to be built under a separate ticket (`tui-wiki-data-hooks`). They do not currently exist in `apps/tui/src/hooks/` or `@codeplane/ui-core`. 

**Actionable Insight:** When building the detail view, you will need to either mock these hooks or ensure the `tui-wiki-data-hooks` feature is merged prior to integration. The structure relies on `useWikiPage` returning `{ page, isLoading, error }` and `useWikiDelete` providing `{ deletePage, isDeleting }`.