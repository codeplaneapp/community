# TUI ListComponent Research Findings

## 1. Keybinding System (`normalize-key.ts` & `keybinding-types.ts`)
- Key handlers expect normalized key descriptors (e.g., `j`, `k`, `G`, `ctrl+d`, `ctrl+u`, `return`, `space`, `up`, `down`).
- The alias mapping inside `normalize-key.ts` maps `enter` -> `return`, `esc` -> `escape`, and supports `arrowup`/`arrowdown`.
- The `useScreenKeybindings` hook expects an array of `KeyHandler` objects which includes `key`, `description`, `group`, `handler`, and optionally `when` (a predicate for focus gating).
- Scopes are managed by `PRIORITY` levels (`PRIORITY.SCREEN` = 4).

## 2. Theming and Styling (`tokens.ts` & `useTheme.ts`)
- `useTheme()` returns an object with pre-allocated semantic `RGBA` colors (e.g., `primary`, `surface`, `muted`, `error`, `warning`, `success`).
- `TextAttributes` handles styling across all terminal types: `TextAttributes.BOLD`, `TextAttributes.DIM`, `TextAttributes.UNDERLINE`, and `TextAttributes.REVERSE`.
- The focus highlight state per the spec relies on applying `TextAttributes.REVERSE` to text components.

## 3. Layout Context (`useLayout.ts`)
- The `useLayout()` hook provides `contentHeight`, `width`, `breakpoint`, `sidebarVisible`, and `sidebarWidth` based on the terminal size.
- `contentHeight` typically represents `terminal_height - 2` (header + status bar).
- The `ListComponent` and `ListEmptyState` should use `contentHeight` to ensure they fill the viewport properly.

## 4. OpenTUI ScrollBox (`ScrollBox.ts`)
- OpenTUI's native `ScrollBoxRenderable` exposes imperative APIs like `scrollTop`, `scrollLeft`, `scrollBy()`, `scrollTo()`, and `scrollChildIntoView()`.
- In the React reconciler, it is exported as the `<scrollbox>` intrinsic element.
- Given potential limitations on React ref forwarding for custom renderers in OpenTUI, the fallback for scroll-into-view is tracking the target top in a local `useRef` and writing to `scrollboxRef.current.scrollTop`, or calculating and applying scroll changes via state if refs aren't populated.
- `scrollbox` supports `scrollY={true}` and `flexGrow={1}`.

## 5. Loading and Pagination (`loading/types.ts` & `PaginationIndicator.tsx`)
- `PaginationIndicator` expects `status`, `spinnerFrame`, and `error` as props.
- `PaginationStatus` is typed as `"idle" | "loading" | "error"`.
- Loading state requires setting the `flexDirection="column"` on the wrapping `<box>` and rendering `PaginationIndicator` after the `<scrollbox>`.

## 6. Component Architecture
- The `ListComponent` combines several concerns: keyboard navigation (`j`/`k`, `return`, `ctrl+u`/`d`), selection (`space`), view culling/scroll tracking, and pagination (80% boundary).
- The `ListRow` acts as the structural box for rendering items, displaying the selection indicator (`●`) if selected, but text styling (like REVERSE video) must be correctly bubbled down to the children (or applied via context) as `backgroundColor` acts on the box level but text attributes are specific to `<text>` elements.