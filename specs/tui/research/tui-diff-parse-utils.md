# Research Findings: Diff Parsing Utilities

## 1. Monorepo Architecture Context
Based on exploration of the repository, the monorepo scaffold does not currently contain `apps/ui/` or `packages/ui-core/`. Existing components and domain models are present within `packages/sdk/`, `apps/tui/`, and the external submodule `context/opentui/`. The implementation of the new pure-function parsing utilities will strictly rely on `@codeplane/sdk` definitions and align with OpenTUI's low-level component consumption patterns.

## 2. Shared Data Models (`packages/sdk/`)
Found `FileDiffItem` interface inside `packages/sdk/src/services/repohost.ts`:
```typescript
export interface FileDiffItem {
  path: string;
  old_path?: string;
  change_type: string;
  patch?: string;
  is_binary: boolean;
  language?: string;
  additions: number;
  deletions: number;
  old_content?: string;
  new_content?: string;
}
```
The `patch` property will be the primary string mapped to the `empty` type for the specified TUI `filler` type.

## 4. Existing TUI Diff Logic (`apps/tui/src/`)
The `apps/tui/src/lib/diff-syntax.ts` already sets the standard for decoupling TUI utilities. It holds constants and standard functions without directly invoking React context. Our target files (`diff-types.ts` and `diff-parse.ts`) will safely map visual line indices mapping without clashing with the underlying syntax highlighters or OpenTUI's internal rendering trees.

## 5. Key Edge Cases Verified
- **No-newline-at-end-of-file markers:** As seen in OpenTUI's `DiffRenderable` parser, `\\` line prefixes are skipped completely from sequence counting. This guarantees they do not desync actual line numbers or visually bloat split views.
- **Empty / Null Safety:** Re-enforced by OpenTUI's own `if (!this._diff) return`, the utilities must gracefully return empty arrays and flag `isEmpty: true` if an empty patch or string without hunks is provided, bypassing `parsePatch` crashes.