# Research Findings for TUI FormComponent

## 1. OpenTUI React Components and Types

I investigated the `@opentui/react` and `@opentui/core` packages to confirm the availability of form primitives:
- **`InputProps`**: Readily available. It extends `InputRenderableOptions` and explicitly types `focused?: boolean`, `onInput?: (value: string) => void`, `onChange?: (value: string) => void`, and `onSubmit?: (value: string) => void`.
- **`SelectProps`**: Readily available. It types `focused?: boolean`, `onChange?: (index: number, option: SelectOption | null) => void`, and `onSelect?: (index: number, option: SelectOption | null) => void`.
- **`TextareaProps`**: The `<textarea>` component **is** exposed as a JSX intrinsic by `@opentui/react` (exported in `components.ts`). However, its type definitions (`TextareaProps`) only explicitly add `focused?: boolean`. 
  - Looking at the underlying `@opentui/core` `TextareaOptions` (which extends `EditBufferOptions`), it exposes `onContentChange?: (event: ContentChangeEvent) => void`, but this event does not carry the text payload (`// No payload - use getText() to retrieve content if needed`). 
  - *Implication for Implementation*: Since the spec suggests using `<textarea>` if it exists and expects it to support `onInput={(v: string) => onChange(v)}`, we might encounter a TypeScript error because `onInput` and `onChange` are not typed in `TextareaProps`. The safest path is to use `<input>` with multiline behavior (as it supports `onInput` natively and scales its height based on its container) or use `// @ts-expect-error` if `<textarea>` dynamically forwards these props.

## 2. Existing TUI Hooks and Components

The TUI architecture provides all required hooks and components to satisfy the specification:
- **`useTheme()`** (`apps/tui/src/hooks/useTheme.ts`): Returns a referentially stable `ThemeTokens` object with `primary`, `error`, `border`, `muted`, and `surface` fields, satisfying the required border and label coloring logic.
- **`useLayout()`** (`apps/tui/src/hooks/useLayout.ts`): Returns `{ breakpoint, contentHeight, ... }`. The `breakpoint` value is `"large" | "standard" | null` (where `null` represents the minimum unsupported size, though for styling we can treat it as minimum size).
- **`useScreenKeybindings()`** (`apps/tui/src/hooks/useScreenKeybindings.ts`): Takes `(bindings: KeyHandler[], hints?: StatusBarHint[])` and handles the `PRIORITY.SCREEN` registration. This fully supports the navigation logic for Tab, Shift+Tab, Ctrl+S, Esc, and Return.
- **`useOverlay()`** (`apps/tui/src/hooks/useOverlay.ts`): Returns the context to control modals. The `openOverlay("confirm", { ... })` method perfectly matches the requirement for the dirty-state discard dialog.
- **`ActionButton`** (`apps/tui/src/components/ActionButton.tsx`): Exists and matches the `ActionButtonProps` spec (`label`, `isLoading`, `loadingLabel`, `onPress`, `disabled`).

## 3. Keyboard Priority and Interception

The spec assumes `useScreenKeybindings` (Priority 4) correctly intercepts keys before OpenTUI's default inputs (Priority 1) because the `KeybindingProvider` dispatches keys to registered scopes first. Based on the `KeybindingProvider` architecture, this is correct. If any leak occurs (e.g., OpenTUI `<input>` capturing Tab internally bypassing the global dispatcher), we will need to inject custom `keyBindings` to the `<input>` component (e.g., `keyBindings={[{ name: "tab", action: "noop" }]}`) to disable its native Tab handler.

## Conclusion

All dependencies, hooks, and types required for the `FormComponent` are present and align with the specification. The primary deviation from the spec's assumption is the `<textarea>` API surface in `@opentui/react`, which lacks explicit `onInput`/`onChange` types compared to `<input>`. We will proceed with implementing the form components, using `<input>` for the `TextareaField` as it seamlessly handles multi-line content when constrained by a fixed-height box, fulfilling the spec's visual requirement while preserving clean event bindings.