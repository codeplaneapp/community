# TUI Diff Screen Research Context

## 1. Existing App Shell & Navigation

### Routing & Deep Links
- **Registry:** `apps/tui/src/router/registry.ts` currently registers `[ScreenName.DiffView]` pointing to `PlaceholderScreen`. This will need to be replaced with the actual `DiffScreen` component.
- **Deep Links:** `apps/tui/src/navigation/deepLinks.ts` maps strings to `ScreenName` and handles `buildInitialStack`. The implementation plan correctly requires extending `DeepLinkArgs` with `change` and `landing` properties, and updating `resolveScreenName` to map `"diff"` to `ScreenName.DiffView`.
- **CLI Args:** `apps/tui/src/lib/terminal.ts` exports `parseCLIArgs` which parses arguments into `TUILaunchOptions`. We will need to update this to capture `--change` and `--landing`.

### Keybindings Framework
- Global keybindings are managed via `apps/tui/src/providers/KeybindingProvider.tsx` and types are in `apps/tui/src/providers/keybinding-types.ts`.
- The diff screen will use a localized keybinding map returning an array of `KeyHandler` objects, mapped to specific scopes (e.g., `FocusZone === "tree"` or `"content"`).

## 2. Diff Data Hooks & Types

### Diff Hooks Context
Based on grep analysis across the `specs/` directory, the diff data hooks (`useChangeDiff`, `useLandingDiff`) are part of a separate but concurrent epic (`tui-diff-data-hooks`). 
- They reside at `apps/tui/src/hooks/useChangeDiff.ts` and `apps/tui/src/hooks/useLandingDiff.ts`.
- They fetch diffs from `GET /api/repos/:owner/:repo/changes/:change_id/diff` and `GET /api/repos/:owner/:repo/landings/:number/diff`.
- Both accept an optional `{ ignore_whitespace: boolean }` parameter.
- The return signature for change diffs is roughly: `{ files: FileDiffItem[], isLoading: boolean, error: any, refetch: () => void }`.
- For landings, it returns `{ changes: LandingChangeDiff[], isLoading, error, refetch }`, which requires flattening `changes.flatMap(c => c.file_diffs)` to get a flat array of `FileDiffItem`.

### FileDiffItem Interface
`FileDiffItem` is a mirrored type (originating from `@codeplane/sdk` in `packages/sdk/src/services/repohost.ts`) and is expected to be localized in `apps/tui/src/types/diff.ts`.
Properties include:
- `path: string`
- `old_path?: string`
- `change_type: "added" | "deleted" | "modified" | "renamed" | "copied"`
- `patch?: string` (raw unified diff string)
- `is_binary?: boolean`
- `additions: number`
- `deletions: number`
- `language?: string`

## 3. OpenTUI Capabilities (`<diff>`)

Review of `context/opentui/packages/react/examples/diff.tsx` provides the API surface for the `<diff>` OpenTUI component:

```tsx
import { diff } from "@opentui/react"

<diff
  diff={exampleDiff}             // The unified diff patch string
  view={view}                    // "unified" | "split"
  filetype="typescript"          // For syntax highlighting mapping
  syntaxStyle={syntaxStyle}      // Instance from SyntaxStyle.fromStyles(...)
  showLineNumbers={true}         
  wrapMode="none"                
  addedBg={theme.addedBg}
  removedBg={theme.removedBg}
  contextBg={theme.contextBg}
  addedSignColor={theme.addedSignColor}
  removedSignColor={theme.removedSignColor}
  lineNumberFg={theme.lineNumberFg}
  // etc...
/>
```

### Existing TUI Hooks for OpenTUI Integration
- `useTheme()`: Provides all the necessary color mappings for the diff component (e.g., `theme.diffAddedBg`, `theme.diffRemovedBg`).
- `useDiffSyntaxStyle()`: Already exists at `apps/tui/src/hooks/useDiffSyntaxStyle.ts` and returns the pre-configured `SyntaxStyle` instance.
- `useLayout()`: Used for responsive breakpoints (`breakpoint === "large"`, `layout.width`, etc.), matching the TUI constraint requirements.

## 4. Implementation Readiness

The target directory `apps/tui/src/screens/DiffScreen/` does not currently exist in the codebase. All files listed in the `TUI_DIFF_SCREEN` spec (types, hooks, layout components, telemetry, the main React screen component, and keybindings) will need to be written from scratch as outlined in the plan. 

The testing framework in `e2e/tui/diff.test.ts` exists and is ready to ingest the new layout snapshots and interaction assertions.
