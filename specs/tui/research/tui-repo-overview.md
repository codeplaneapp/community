# Research Document: TUI Repository Overview Screen

## Directory Layout
`apps/tui/src/`
- `router/registry.ts`: Has a `RepoOverview` route which correctly accepts `owner` and `repo` parameters.
- `screens/PlaceholderScreen.tsx`: The current dummy screen mapped to most un-implemented routes.
- `components/FullScreenLoading.tsx`: Centered loading state (`<FullScreenLoading spinnerFrame={...} label="Loading…" />`).
- `components/FullScreenError.tsx`: Centered error state (`<FullScreenError screenLabel="repository" error={loadingError} />`).
- `hooks/useScreenLoading.ts`: Hook for handling loading integration (timeout, error conversion, retries).
- `hooks/useScreenKeybindings.ts`: Register keyhandlers per screen scope (pushes PRIORITY.SCREEN).

## OpenTUI
`context/opentui/packages/react/src/components/index.ts`
- `<markdown>` is available as an intrinsic JSX element in OpenTUI React. Can pass children directly.

## Shared Data Layer
- `packages/ui-core/` does not exist in this CE repository. The spec correctly directs creating `useRepo`, `useRepoReadme`, `useStarRepo`, `useClipboard` locally inside `apps/tui/src/hooks/` for the TUI adapter layer.

## Theming and Layout
- `useTheme()` returns semantic colors (`primary`, `muted`, `error`, `success`, `warning`).
- `useLayout()` provides `width`, `height`, and `contentHeight`.
- `useResponsiveValue()` resolves layouts given `minimum`, `standard`, `large` sizing based on terminal breakpoints.

## Dependencies & Utilities
`apps/tui/src/util/text.ts` already contains text helpers (`truncateRight`, `fitWidth`). The spec needs new helpers added in `apps/tui/src/util/repo.ts`.

All required context matches the spec precisely. The implementation should follow the plan provided in the engineering spec directly.