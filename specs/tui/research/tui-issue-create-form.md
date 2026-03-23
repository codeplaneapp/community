# Research Document: TUI Issue Create Form

## Overview
This document consolidates findings from the Codeplane TUI codebase and OpenTUI package to support the implementation of the `tui-issue-create-form` feature.

## 1. OpenTUI React Components (`context/opentui/packages/react/src/types/components.ts`)
The OpenTUI React package exposes several intrinsic UI elements that will be used for the form layout:
- `<box>`: Container component (props: `flexDirection`, `gap`, `paddingX`, `border`, `focused`, `width`, `height`).
- `<scrollbox>`: Scrollable container (similar props to `<box>`).
- `<text>`: Text rendering component (props: `fg`, `bold`, `color`).
- `<input>`: Text input field. It accepts `focused`, `onInput` (returns `string`), `onChange`, `onSubmit`, `placeholder`, and a `multiline` prop for textareas.
- `ReactProps`: Contains standard React props like `key` and `ref`.

## 2. Shared TUI Hooks & Utilities (`apps/tui/src/`)
Several standard hooks and utilities are available and must be consumed for styling, layout, navigation, and telemetry:

### 2.1 Layout & Theme
- **`useLayout()`** (`apps/tui/src/hooks/useLayout.ts`): Returns `LayoutContext` with responsive properties.
  - `breakpoint`: Can be `"compact"`, `"standard"`, `"large"`, or null.
  - `width`, `height`: Terminal dimensions.
  - `contentHeight`: Usable vertical space.
- **`useTheme()`** (`apps/tui/src/hooks/useTheme.ts`): Provides theme token colors (`primary`, `error`, `muted`, `warning`, `border`, etc.).

### 2.2 Navigation
- **`useNavigation()`** (`apps/tui/src/providers/NavigationProvider.tsx`): Returns an object containing `push`, `pop`, `replace`.
  - `nav.replace(ScreenName.IssueDetail, { owner, repo, number })` is supported.
  - `nav.pop()` pops the current screen.
- **`ScreenRegistry`** (`apps/tui/src/router/registry.ts`): Currently maps `ScreenName.IssueCreate` to `PlaceholderScreen`. This entry must be updated to point to the new `IssueCreateForm`.

### 2.3 Keybindings
- **`useScreenKeybindings(bindings, hints)`** (`apps/tui/src/hooks/useScreenKeybindings.ts`): Registers screen-specific keybindings automatically pushing to `PRIORITY.SCREEN`.
  - `bindings` is an array of objects: `{ key: "ctrl+s", description: "Submit", group: "Form", handler: () => void }`.
  - `when` conditions can be applied to conditionally enable certain mappings (e.g. `when: () => anySelectorOpen`).

### 2.4 Actions & Components
- **`ActionButton`** (`apps/tui/src/components/ActionButton.tsx`): Exposes an `isLoading` prop and updates its label with a spinner and `loadingLabel` (default: "Saving..."). Used for form submission and cancel buttons.
- **`LabelBadge`**: Does not currently exist in the codebase. As per the spec, if `tui-label-badge-component` is not available, we should fall back to plain text labels or simple color rendering inside `SelectorDropdown`.

### 2.5 Logging & Telemetry
- **`logger`** (`apps/tui/src/lib/logger.ts`): Standard logging object with `logger.debug()`, `logger.info()`, `logger.error()`.
- **`emit`** (`apps/tui/src/lib/telemetry.ts`): Issues telemetry events. E.g., `emit("tui.issue_create_form.opened", { ...props })`.

## 3. Data Hooks (`@codeplane/ui-core`)
The `@codeplane/ui-core` package is not physically present in `packages/` or `apps/` in this tree (likely un-published or simulated). Based on the spec, the form must import data hooks from `@codeplane/ui-core`:
- `useCreateIssue`
- `useRepoLabels`
- `useRepoMilestones`
- `useRepoCollaborators`

*Note:* The spec dictates that if the backend is unimplemented, imports may fail or result in HTTP errors. Tests are written to expect failures or ignore missing backend functionalities.

## 4. Architectural Patterns & Next Steps
- The form relies on new state primitives `useFormState` and `useSelectorState`. These do not exist yet and are scoped as Step 1 & 2 of the implementation plan.
- OpenTUI's text input components inherently catch characters. Form-level keybindings like `Ctrl+S`, `Tab`, and `Esc` must be mapped via `useScreenKeybindings` to bypass or wrap input contexts properly.
- The `TerminalTooSmallScreen` behavior is managed externally by `AppShell`, meaning `useLayout` breakpoints simply control internal flex sizing and `shortLabel` truncations as spec'd.