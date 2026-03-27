# TUI DetailView Research Findings

## 1. Existing TUI Architecture and Hooks (`apps/tui/src/`)

### `useLayout`
Found in `apps/tui/src/hooks/useLayout.ts`. Provides synchronous, resize-aware dimensions for the TUI. 
Key properties:
- `contentHeight`: Always `height - 2` (excluding header and status bar).
- `width`: Total terminal width.
- `breakpoint`: `'minimum' | 'standard' | 'large' | null`.
The DetailView component should use `contentHeight` to restrict the vertical height of the main scroll container, and use `width` combined with `breakpoint` to decide when to hide section indices or wrap metadata.

### `useTheme` and `tokens.ts`
Found in `apps/tui/src/hooks/useTheme.ts` and `apps/tui/src/theme/tokens.ts`.
- `useTheme()` returns an object of resolved `RGBA` tokens (`primary`, `success`, `warning`, `error`, `muted`, `border`, `surface`, etc.).
- `statusToToken(status: string)` maps API state strings like "open" or "closed" directly to a semantic token name.
- `TextAttributes` provides bitwise flags for styling like `TextAttributes.BOLD` and `TextAttributes.DIM`.
These will be necessary for `DetailHeader`'s status badge and `DetailSection`'s titles.

### `useScreenKeybindings`
Found in `apps/tui/src/hooks/useScreenKeybindings.ts`.
- Maps an array of `KeyHandler` definitions (with `key`, `description`, `group`, `handler`) into the active screen priority scope.
- Auto-generates status bar hints for the bindings.
The `useDetailNavigation` hook will need to return `KeyHandler` objects that `DetailView` passes directly into `useScreenKeybindings(bindings, hints)`.

### `SkeletonDetail`
Found in `apps/tui/src/components/SkeletonDetail.tsx`.
- Implements the layout logic we need to visually match: full width column, `gap={1}`, rendering section titles via `theme.muted` and block characters for content.
- Uses `useLayout()` and `useTheme()`.

## 2. OpenTUI Components (`context/opentui/`)

### `<scrollbox>`
The core native container we'll rely on. Reviewed `context/opentui/packages/core/src/renderables/ScrollBox.ts`:
- `scrollBy(delta, unit = "absolute")`: Used for generic up/down scrolling. Supports object delta `{ x: dx, y: dy }` or just `number`. Can pass `"absolute"` (rows) or `"viewport"` (percentages).
  - `j/k` keys will map to `scrollboxRef.current.scrollBy({ y: 1 }, "absolute")` or `-1`.
  - `Ctrl+D / Ctrl+U` map to `scrollboxRef.current.scrollBy({ y: 0.5 }, "viewport")`.
- `scrollChildIntoView(childId: string)`: Brings a nested box with a matching `id` attribute into the viewport. This makes section jumping (`Tab`, `1-9`) trivial to implement. We just need to ensure `DetailSection` wraps its content in a `<box id={sectionId}>`.

### `<markdown>` and `<code>`
Found usages in `context/opentui/packages/react/README.md` and `context/opentui/packages/core/src/examples/code-demo.ts`.
- Markdown handles standard text formatting, lists, tables, and nested code blocks.
- `syntaxStyle` is usually passed in from `useDiffSyntaxStyle()` or similar.
- They take `content` (string), `filetype` (string) for `<code>`.
- These will be slotted into the `content` prop of `DetailViewSection` by the consuming screens.

## 3. Keyboard Interaction Details

From `keybinding-types.ts`:
- Allowed keys include single chars (`"j"`, `"k"`, `"1"`), modifiers (`"ctrl+d"`, `"shift+tab"`), and specials (`"tab"`, `"q"`).
- A binding's `handler` is executed upon dispatch. 
- The specification calls for a predicate `isNavigationActive` to optionally block detail navigation keys (e.g. when an overlay is active). `useDetailNavigation` should wrap all its handlers in this check before triggering scrolls.

## 4. Implementation Strategy Derived from Research

1. **State Isolation**: `useDetailNavigation` will be a pure React hook managing the logical `focusedSection` integer. It will return `bindings` (the `KeyHandler` array) and `hints`.
2. **Component Composition**: 
   - `DetailHeader` takes semantic layout of title, status, metadata.
   - `DetailSection` takes care of the header row (bold title + dim index) and drawing the horizontal box-drawing line (`theme.border`). Width logic should adapt via `useLayout()`.
   - `DetailView` wraps everything in `<scrollbox>`, holds the `ref`, and wires the callbacks from `useDetailNavigation` to the native `scrollbox.scrollBy` and `scrollbox.scrollChildIntoView` methods.
3. **Responsiveness**: `useLayout().breakpoint === "minimum"` is the key trigger to hide `[N]` index hints in `DetailSection` and flex the `DetailHeader` metadata horizontally vs vertically.
4. **Testing**: `e2e/tui/detail-view.test.ts` will leverage `launchTUI()` from existing helpers to assert standard snapshots and simulated keystrokes.

All required native and layout primitives are present and stable.