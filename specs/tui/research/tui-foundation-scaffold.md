# TUI Foundation Scaffold: Research Findings

## 1. Directory Structure Context
Based on an exhaustive file system exploration of the allowed workspace (`/Users/williamcory/codeplane/specs/tui`), several assumptions in the engineering specification diverge from the actual state of the codebase.

### Unavailable Directories
The prompt asks to investigate several related directories, but these do not exist in the current isolated workspace environment:
- `context/opentui/`: Not found.
- `packages/ui-core/`: Not found.
- `apps/ui/src/`: Not found.

Our focus is solely restricted to the `apps/tui/` and `e2e/tui/` directories, which exist but differ from the baseline described in the specification.

## 2. Discrepancies Between Spec and Existing Code

### 2.1 E2E Test Scaffolding Already Exists
- The spec assumes `e2e/tui/app-shell.test.ts` must be created with 32 structural, dependency resolution, and typescript compilation tests.
- **Reality**: `e2e/tui/app-shell.test.ts` **already exists** and is populated with high-level terminal snapshot, keyboard interaction, and edge-case integration tests (e.g., `NAV-SNAP-001`, `NAV-KEY-001`).
- **Reality**: `e2e/tui/helpers.ts` also already exists with a `TUITestInstance` interface and `launchTUI()` stub, exactly as the spec mentioned as a "specs/tui/e2e/tui/helpers.ts" reference.

### 2.2 Existing Module Resolution Compatibility
The spec raises concerns over "Issue 1" (`import { Breakpoint }` causing verbatimModuleSyntax issues) and "Issue 2" (extensionless imports in barrel files).
- **Reality**: `apps/tui/src/screens/Agents/utils/formatTimestamp.ts` uses `import type { Breakpoint } from "../types.js";`.
- **Reality**: `apps/tui/src/screens/Agents/components/index.ts` uses explicit `.js` extensions (`export * from "./MessageBlock.js";`).
- **Impact**: The existing code is actually more strictly typed and bundler-friendly than the spec suggests. `verbatimModuleSyntax` could safely be used, or `isolatedModules` as the spec dictates, without breaking the existing files.

### 2.3 Existing Barrels and Scaffolding
The spec says to create placeholder barrel files for `providers/`, `hooks/`, etc., because they supposedly don't exist yet.
- **Reality**: Several directories and their `index.ts` files have already been created:
  - `src/providers/index.ts` exists and exports `NavigationProvider`.
  - `src/hooks/index.ts` exists and exports `useNavigation`.
  - `src/router/index.ts` and `types.ts` exist.
- **Reality**: `src/lib/diff-syntax.ts` does **not** export `SYNTAX_TOKEN_COUNT`. The spec's instructions to re-export it in `src/lib/index.ts` will cause a TypeScript compiler error.

### 2.4 Missing Core Configuration
As correctly identified by the spec:
- `apps/tui/package.json` is missing.
- `apps/tui/tsconfig.json` is missing.
- `apps/tui/.gitignore` is missing.
- `apps/tui/src/index.tsx` (entry point) is missing.
- `apps/tui/src/verify-imports.ts` is missing.

## 3. Implementation Recommendations
When proceeding with the execution of `tui-foundation-scaffold`, the following tactical adjustments should be applied to avoid conflicts or compiler errors:

1. **App Shell Tests**: Do not blindly overwrite `e2e/tui/app-shell.test.ts`. Append the new structural tests to the existing file or create a separate test file strictly for dependency validation (e.g., `dependency-scaffold.test.ts`) so as not to destroy the existing navigation tests.
2. **Lib Barrel**: In `src/lib/index.ts`, do NOT try to re-export `SYNTAX_TOKEN_COUNT` from `./diff-syntax.js` since it doesn't exist.
3. **Hooks Barrel**: Update `src/hooks/index.ts` by appending `export { useDiffSyntaxStyle } from "./useDiffSyntaxStyle.js";` to the file, preserving the existing `useNavigation` export.
4. **Providers Barrel**: Similarly, append placeholder comments or exports to `src/providers/index.ts` without removing the existing `NavigationProvider` export.