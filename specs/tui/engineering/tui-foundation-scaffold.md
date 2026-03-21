# Engineering Specification: tui-foundation-scaffold

## Scaffold TUI app package structure, dependencies, and directory layout

**Ticket**: tui-foundation-scaffold
**Type**: Engineering
**Dependencies**: None
**Status**: Not started
**Feature Group**: TUI_APP_SHELL
**Features touched**: TUI_BOOTSTRAP_AND_RENDERER (partial — package structure only, no runtime behavior)

---

## 1. Summary

This ticket creates the foundational `apps/tui` package from scratch. It establishes the package manifest, TypeScript configuration, and directory layout that all subsequent TUI tickets build upon. No runnable TUI is produced — just a valid, importable, type-checking package structure that proves the dependency chain (`@opentui/core` → `@opentui/react` → React 19 → Codeplane SDK) resolves correctly.

The `apps/tui/` directory currently has:
- A `node_modules/` directory pre-populated by pnpm with symlinks to `@opentui/core@0.1.90`, `@opentui/react@0.1.90`, `react@19.2.4`, `bun-types@1.3.11`, `@types/react@19.2.14`, and `typescript@5.9.3`
- Existing source files under `src/` created by prior work: `src/hooks/useDiffSyntaxStyle.ts`, `src/lib/diff-syntax.ts`, and `src/screens/Agents/` (types, components, utils)
- An existing e2e test file: `e2e/tui/diff.test.ts`

**No `package.json` or `tsconfig.json` exist yet.** This ticket adds them, along with the remaining directory structure, to make `apps/tui` a proper, compilable workspace package.

---

## 2. Scope

### In scope

1. `apps/tui/package.json` with exact-pinned runtime dependencies and caret-ranged dev dependencies
2. `apps/tui/tsconfig.json` configured for React 19 JSX via `@opentui/react/jsx-runtime`
3. Directory structure completing the scaffold: `src/index.tsx`, `src/providers/`, `src/components/`, `src/theme/`, `src/util/` — all with barrel `index.ts` files
4. Compile-time import verification file (`src/verify-imports.ts`) proving the full dependency chain
5. Verification that `pnpm install` succeeds from monorepo root
6. Verification that `tsc --noEmit` passes with zero errors (covering both new scaffold files AND existing `src/hooks/`, `src/lib/`, `src/screens/` code)
7. Verification that `@opentui/core` `createCliRenderer` and `@opentui/react` `createRoot` are importable at runtime
8. E2E test file scaffolding (`e2e/tui/helpers.ts` and `e2e/tui/app-shell.test.ts`) with structural and dependency tests

### Out of scope

- Terminal setup (alternate screen, raw mode, cursor hide)
- React component tree mounting via `createRoot`
- Provider hierarchy (ThemeProvider, AuthProvider, NavigationProvider, etc.)
- Any visual rendering, layout, or keyboard handling
- SSE, auth, or API client setup
- `@microsoft/tui-test` integration (not yet installed in monorepo — deferred to a dedicated test infrastructure ticket)

---

## 3. Pre-existing Code Inventory

The following files already exist under `apps/tui/src/` and must be accounted for by this scaffold. The `tsconfig.json` created by this ticket must compile all of them without errors.

| File | Purpose | Lines | Imports from |
|------|---------|-------|-------------|
| `src/hooks/useDiffSyntaxStyle.ts` | React hook: creates/memoizes a `SyntaxStyle` for diff viewer | 53 | `react` (`useMemo`, `useEffect`, `useRef`), `@opentui/core` (`type SyntaxStyle`), `../lib/diff-syntax.js` (`createDiffSyntaxStyle`, `detectColorTier`, `type ColorTier`) |
| `src/lib/diff-syntax.ts` | Diff syntax highlighting: 3 palettes (truecolor/256/16), color tier detection, filetype resolution | 161 | `@opentui/core` (`RGBA`, `type StyleDefinition`, `SyntaxStyle`, `pathToFiletype`) |
| `src/screens/Agents/types.ts` | Agent message types: `MessageRole`, `MessagePart`, `AgentMessage`, `Breakpoint` | 17 | none |
| `src/screens/Agents/components/index.ts` | Barrel re-export of MessageBlock, ToolBlock | 3 | `./MessageBlock`, `./ToolBlock` |
| `src/screens/Agents/components/MessageBlock.tsx` | Stub component (`export {}`) | 2 | none |
| `src/screens/Agents/components/ToolBlock.tsx` | Stub component (`export {}`) | 2 | none |
| `src/screens/Agents/utils/formatTimestamp.ts` | Breakpoint-aware relative timestamp formatting | 34 | `../types` (`Breakpoint`) |

### Critical compatibility findings

The existing code has two patterns that constrain `tsconfig.json` choices:

**Issue 1 — `formatTimestamp.ts` value-imports a type:**
```ts
import { Breakpoint } from "../types";
```
`Breakpoint` is declared as `export type Breakpoint = ...` in `types.ts`. Under `verbatimModuleSyntax`, this import would be emitted at runtime, but the module contains only type exports. TypeScript requires `import type { Breakpoint }` or `import { type Breakpoint }` for type-only imports when `verbatimModuleSyntax` is enabled.

**Issue 2 — Agent barrel uses extensionless paths:**
```ts
export * from "./MessageBlock";
export * from "./ToolBlock";
```
These use `.tsx` files but the re-exports lack extensions. Under `moduleResolution: "bundler"`, this resolves correctly — Bun and bundler resolution both handle extensionless imports by probing `.ts`, `.tsx`, `.js` extensions. However, this is inconsistent with `useDiffSyntaxStyle.ts` which uses `.js` extensions.

**Resolution**: Do NOT enable `verbatimModuleSyntax`. The existing code was not written with this constraint. Enabling it would require modifying `formatTimestamp.ts` (out of scope — this ticket must not modify existing files). Instead, use `isolatedModules: true` which provides most of the same safety without breaking the existing value-import-of-type pattern. `isolatedModules` ensures each file can be transpiled independently (critical for Bun) without requiring `import type` annotations.

### Existing e2e test

| File | Purpose | Lines | Imports from |
|------|---------|-------|-------------|
| `e2e/tui/diff.test.ts` | Diff syntax highlighting e2e test specs (tests across 5 describe blocks) | 217 | `@microsoft/tui-test` (`createTestTui`) — not yet installed |

This test file imports `createTestTui` from `@microsoft/tui-test`, which is not installed in the monorepo. The tests have comment-only bodies (empty `async` blocks with inline specification comments). They will fail at import time until `@microsoft/tui-test` is added by a separate test infrastructure ticket. Per project policy, these tests remain as-is — they are never skipped or commented out.

### Reference test files in `specs/tui/e2e/tui/`

The `specs/tui/` directory contains reference implementations of test files that serve as specification scaffolds:

| File | Purpose |
|------|--------|
| `specs/tui/e2e/tui/helpers.ts` | Reference test helpers with `TUITestInstance` interface, `launchTUI()`, `run()`, `bunEval()`, credential store helpers, mock API env helpers, navigation helpers |
| `specs/tui/e2e/tui/app-shell.test.ts` | Reference app shell tests (~875 lines) with LOAD-* and KEY-* test IDs covering loading states and keybinding priority dispatch |
| `specs/tui/e2e/tui/diff.test.ts` | Reference diff test specs |
| `specs/tui/e2e/tui/agents.test.ts` | Reference agent session tests |
| Other test files | Reference specs for workflows, workspaces, organizations, etc. |

These reference files inform the real `e2e/tui/` test files but live in `specs/` as documentation. The real `e2e/tui/helpers.ts` created by this ticket is derived from the reference but adapted for the scaffold-only scope (no `@microsoft/tui-test` dependency, subprocess-based verification).

---

## 4. Implementation Plan

### Step 1: Create `apps/tui/package.json`

**File**: `apps/tui/package.json`

```json
{
  "name": "@codeplane/tui",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "src/index.tsx",
  "scripts": {
    "dev": "bun run src/index.tsx",
    "check": "tsc --noEmit"
  },
  "dependencies": {
    "@opentui/core": "0.1.90",
    "@opentui/react": "0.1.90",
    "react": "19.2.4",
    "@codeplane/sdk": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5",
    "@types/react": "^19.0.0",
    "bun-types": "^1.3.11"
  }
}
```

**Design decisions**:

- **Name**: `@codeplane/tui` — scoped to match `@codeplane/sdk` convention.
- **`private: true`**: This is an app, not a published package. Prevents accidental `npm publish`. Matches `apps/cli/package.json` (which also sets `private: true`).
- **`type: module`**: All Codeplane packages use ES modules. Required by `@opentui/core` and `@opentui/react` which declare `"type": "module"`. Matches `@codeplane/sdk`'s package configuration.
- **`main: src/index.tsx`**: Entry point for the TUI application. Bun runs TypeScript directly — no compilation step needed. Matches `@codeplane/sdk`'s `"main": "src/index.ts"` pattern.
- **`@opentui/core` at `0.1.90`**: Exact-pinned (no `^` or `~`). The npm-published package includes pre-compiled `.js`/`.d.ts` files and platform-specific Zig native binaries via optional dependencies (`@opentui/core-darwin-arm64`, `@opentui/core-darwin-x64`, `@opentui/core-linux-arm64`, `@opentui/core-linux-x64`, `@opentui/core-win32-arm64`, `@opentui/core-win32-x64`). Exact pinning per architecture principle: "Pin exact versions for rendering-critical dependencies."
- **`@opentui/react` at `0.1.90`**: Exact-pinned. The npm-published package exports `createRoot`, reconciler hooks, JSX runtime types, and test utilities. Its `peerDependencies` require `react >=19.0.0` — satisfied by `react@19.2.4`. It also peer-depends on `react-devtools-core@^7.0.1` and `ws@^8.18.0` — both are only needed for React DevTools remote debugging.
- **`react` at `19.2.4`**: Exact-pinned to match the version already resolved in the TUI's `node_modules/react` symlink (points to `.pnpm/react@19.2.4/node_modules/react`). The monorepo lockfile contains both `react@19.2.3` (used by some docs/mintlify packages) and `react@19.2.4`. The TUI must pin `19.2.4` to match the current resolution and avoid introducing a second React copy, which would break the React reconciler (reconciler hooks require a singleton React instance).
- **`@codeplane/sdk` at `workspace:*`**: Standard monorepo workspace reference. Provides domain types for all API entities. Resolves to `packages/sdk/`.
- **`bun-types` at `^1.3.11`**: Codeplane convention for Bun global types (see `apps/cli/tsconfig.json` with `"types": ["bun-types"]`). Lockfile resolves `bun-types@1.3.11`.
- **`@types/react` at `^19.0.0`**: Provides React type definitions. Lockfile resolves `@types/react@19.2.14`. Caret range acceptable for dev deps per architecture principle.
- **`typescript` at `^5`**: Matches all other workspace packages. Lockfile resolves `typescript@5.9.3`.
- **Scripts**: `dev` runs the entry point directly with Bun. `check` runs TypeScript type-checking without emit, matching `@codeplane/sdk`'s `"check": "tsc --noEmit"` pattern.

**What is NOT included**:

- No `@codeplane/ui-core` dependency — this package does not exist yet in the monorepo (only `packages/sdk` and `packages/workflow` exist under `packages/`). The TUI imports `@codeplane/sdk` directly until `ui-core` is created.
- No `build` script — Bun runs TypeScript directly. Added when bundling is needed for distribution.

### Step 2: Create `apps/tui/tsconfig.json`

**File**: `apps/tui/tsconfig.json`

```json
{
  "compilerOptions": {
    "lib": ["ESNext"],
    "target": "ESNext",
    "module": "ESNext",
    "moduleDetection": "force",
    "jsx": "react-jsx",
    "jsxImportSource": "@opentui/react",
    "allowJs": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "noEmit": true,
    "strict": true,
    "skipLibCheck": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noPropertyAccessFromIndexSignature": false,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "types": ["bun-types"],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
```

**Design decisions**:

- **`jsx: "react-jsx"`** + **`jsxImportSource: "@opentui/react"`**: The critical configuration that makes OpenTUI JSX elements type-check as valid JSX intrinsic elements. The `@opentui/react` package exports `jsx-runtime.d.ts` which re-exports `Fragment`, `jsx`, `jsxs` from `react/jsx-runtime` and `export type *` from `jsx-namespace.d.ts`. That namespace declares the full `JSX.IntrinsicElements` interface including all 21 OpenTUI components with their typed props: `box` (`BoxProps`), `text` (`TextProps`), `span` (`SpanProps`), `code` (`CodeProps`), `diff` (`DiffProps`), `markdown` (`MarkdownProps`), `input` (`InputProps`), `textarea` (`TextareaProps`), `select` (`SelectProps`), `scrollbox` (`ScrollBoxProps`), `ascii-font` (`AsciiFontProps`), `tab-select` (`TabSelectProps`), `line-number` (`LineNumberProps`), `b` (`SpanProps`), `i` (`SpanProps`), `u` (`SpanProps`), `strong` (`SpanProps`), `em` (`SpanProps`), `br` (`LineBreakProps`), `a` (`LinkProps`). The interface also extends `React.JSX.IntrinsicElements` and `ExtendedIntrinsicElements<OpenTUIComponents>` for forward compatibility.
- **`lib: ["ESNext"]`**: No `"DOM"` lib. The TUI runs in a terminal, not a browser — including DOM types would allow accidental use of `window`, `document`, `localStorage`, etc. `skipLibCheck: true` prevents transitive DOM references in `@opentui/react` internals (which import from `react`, whose types reference DOM) from causing errors.
- **`target: "ESNext"` + `module: "ESNext"`**: Matches `apps/cli/tsconfig.json`. No downleveling — Bun supports all ESNext features natively.
- **`moduleDetection: "force"`**: Treats all files as modules regardless of `import`/`export` presence. Prevents ambient script behavior. Matches `@opentui/react` convention.
- **`moduleResolution: "bundler"`**: Required for the existing code which uses mixed import patterns — `.js` extensions in `useDiffSyntaxStyle.ts` (`../lib/diff-syntax.js`) and extensionless imports in `Agents/components/index.ts` (`./MessageBlock`). Bundler resolution probes both patterns correctly. Matches `apps/cli/tsconfig.json`.
- **`allowImportingTsExtensions: true`**: Required alongside `noEmit: true` when `moduleResolution` is `bundler`. Allows `.ts`/`.tsx` extensions in import paths.
- **`isolatedModules: true`** (NOT `verbatimModuleSyntax`): Ensures each file can be transpiled independently — critical for Bun's single-file transpilation model. Chosen over `verbatimModuleSyntax` because the existing `formatTimestamp.ts` uses a value-import pattern (`import { Breakpoint } from "../types"`) for a type-only export. Under `verbatimModuleSyntax`, this would be a compile error. Under `isolatedModules`, it is permitted because TypeScript's type erasure handles it correctly. Switching to `verbatimModuleSyntax` can happen in a follow-up ticket that also updates the existing import to `import type { Breakpoint }`.
- **`noEmit: true`**: Bun runs TypeScript directly. No compilation step.
- **`strict: true`**: Matches `apps/cli/tsconfig.json`. Enables `strictNullChecks`, `strictFunctionTypes`, `noImplicitAny`, etc.
- **`skipLibCheck: true`**: Matches `apps/cli/tsconfig.json`. Prevents errors in `node_modules` type files — particularly important because `@opentui/core` `renderer.d.ts` imports from `bun:ffi` and `@opentui/react` references `react-reconciler` types.
- **`esModuleInterop: true`** + **`forceConsistentCasingInFileNames: true`** + **`resolveJsonModule: true`**: Matches `apps/cli/tsconfig.json` conventions.
- **`paths: { "@/*": ["./src/*"] }`**: Path alias for cleaner imports. Not yet used but configured to avoid future tsconfig changes. Bun supports tsconfig paths natively.
- **`types: ["bun-types"]`**: Provides Bun global types (`Bun.spawn`, `Bun.file`, `process`, `import.meta`). Matches `apps/cli/tsconfig.json`.
- **`noUnusedLocals: false`** + **`noUnusedParameters: false`**: Permissive during scaffold phase. The existing `diff-syntax.ts` file defines module-level RGBA constants used within `Object.freeze()` calls, and `verify-imports.ts` uses `void` expressions to suppress warnings. Strictening to `true` can happen in a follow-up ticket when lint rules are established.
- **`include: ["src/**/*.ts", "src/**/*.tsx"]`**: Covers both `.ts` and `.tsx` files. Includes the existing files in `src/hooks/`, `src/lib/`, and `src/screens/`. Only covers `src/` — test files in `e2e/tui/` have their own compilation context via `bun test`.
- **No `extends`**: The root monorepo has no shared `tsconfig.json` to extend (verified: no `/tsconfig.json` at repo root). We follow the `apps/cli` pattern: standalone tsconfig with all options declared locally.

**Compatibility with existing code**:
- `useDiffSyntaxStyle.ts` uses `import { type SyntaxStyle } from "@opentui/core"` — inline type annotations work correctly with `isolatedModules`.
- `diff-syntax.ts` uses `import { RGBA, type StyleDefinition, SyntaxStyle, pathToFiletype } from "@opentui/core"` — mixed value and inline-type imports work correctly.
- `formatTimestamp.ts` uses `import { Breakpoint } from "../types"` — a value import of a type. This works with `isolatedModules` because TypeScript erases the import during compilation. It would NOT work with `verbatimModuleSyntax`.
- `components/index.ts` uses `export * from "./MessageBlock"` without `.js` extension — works with `moduleResolution: "bundler"`.

### Step 3: Create directory structure with placeholder files

All new directories are created with `index.ts` barrel files that export an empty set. Existing directories (`src/hooks/`, `src/lib/`, `src/screens/`) already have content and receive barrel files that re-export existing symbols.

#### 3a. Entry point

**File**: `apps/tui/src/index.tsx`

```tsx
/**
 * Codeplane TUI — Entry point
 *
 * This file will bootstrap the terminal renderer, mount the React provider
 * tree, and start the main render loop.
 *
 * Planned bootstrap sequence (see: specs/tui/engineering-architecture.md):
 *   1. Terminal setup — alternate screen, raw mode, cursor hide, capabilities
 *   2. Auth token resolution — CODEPLANE_TOKEN → keyring → config
 *   3. Renderer init — createCliRenderer() + createRoot()
 *   4. Provider stack mount — AppContext → ErrorBoundary → Auth → API → SSE → Nav → Theme → Keys → Shell
 *   5. Token validation — GET /api/user (async, 5s timeout)
 *   6. SSE connection — POST /api/auth/sse-ticket → EventSource
 *   7. Initial screen render — push initial screen to navigation stack
 *   8. First meaningful paint — target <200ms from launch
 */

// Verify core dependencies are importable at the type level
import type { CliRenderer } from "@opentui/core"
import type { Root } from "@opentui/react"

export type { CliRenderer, Root }
```

**Why type-only imports**: This entry point is a placeholder. It must type-check to prove the dependency chain resolves, but it does not execute any runtime code. Using `import type` avoids runtime side effects. Real runtime imports (`createCliRenderer`, `createRoot`) are added by the *TUI Bootstrap and Renderer* ticket.

#### 3b. Provider directory

**File**: `apps/tui/src/providers/index.ts`

```ts
/**
 * Provider components for the TUI application.
 *
 * Planned providers (in mount order per engineering-architecture.md § Provider Stack):
 *   AppContext.Provider   — global config: API base URL, terminal capabilities
 *   ErrorBoundary         — catches unhandled React errors, renders recovery UI
 *   AuthProvider          — token resolution, validation, auth state
 *   APIClientProvider     — configured HTTP client with auth headers
 *   SSEProvider           — singleton SSE connection, event dispatch
 *   NavigationProvider    — screen stack, push/pop/replace, breadcrumb state
 *   ThemeProvider         — color tokens resolved for detected terminal capability
 *   KeybindingProvider    — global/contextual keybinding registry, go-to mode state
 */

export {}
```

#### 3c. Components directory

**File**: `apps/tui/src/components/index.ts`

```ts
/**
 * Shared TUI components built on OpenTUI primitives.
 *
 * Planned components (see: specs/tui/engineering-architecture.md § Core Abstractions):
 *   AppShell         — Root layout: header bar + content area + status bar + overlay layer
 *   HeaderBar        — Breadcrumb trail + repo context + connection status + notification badge
 *   StatusBar        — Keybinding hints + sync status + notification count + help hint
 *   ScrollableList   — Generic vim-navigable list with j/k/G/gg/Ctrl+D/Ctrl+U and pagination
 *   DetailView       — Scrollable structured layout for entity detail screens
 *   FormSystem       — Tab-navigable form with validation, Ctrl+S submit
 *   ModalSystem      — Overlay rendering with focus trap and z-index stacking
 *   CommandPalette   — : keybinding → fuzzy search over command registry
 *   HelpOverlay      — ? keybinding → grouped keybinding list for current screen
 *   DiffViewer       — Wraps OpenTUI <diff> with file tree, mode toggle, inline comments
 *   MarkdownRenderer — Wraps OpenTUI <markdown> for issue bodies, comments, wiki
 *   LoadingSpinner   — Braille spinner with message text
 *   ErrorScreen      — Error display with stack trace, retry (r), quit (q)
 */

export {}
```

#### 3d. Theme directory

**File**: `apps/tui/src/theme/index.ts`

```ts
/**
 * Theme system for the TUI application.
 *
 * Planned modules (see: specs/tui/engineering-architecture.md § Theme and Color Token System):
 *   tokens.ts   — 12 semantic color tokens: primary, success, warning, error, muted,
 *                 surface, border, diffAddedBg, diffRemovedBg, diffAddedText,
 *                 diffRemovedText, diffHunkHeader
 *   detect.ts   — Terminal color capability detection: truecolor | 256 | 16
 *                 Checks COLORTERM env for truecolor/24bit, TERM for 256color
 *   resolve.ts  — Token resolution: semantic token × color capability → concrete ANSI value
 *
 * Note: src/lib/diff-syntax.ts already implements ColorTier detection and palette
 * resolution for diff-specific syntax highlighting. The theme system will provide
 * a broader set of semantic tokens for all UI elements and may consume the same
 * detectColorTier() utility from lib/diff-syntax.ts.
 */

export {}
```

#### 3e. Utilities directory

**File**: `apps/tui/src/util/index.ts`

```ts
/**
 * Utility functions for the TUI application.
 *
 * Planned modules:
 *   truncate.ts   — Smart text truncation with ellipsis for breadcrumbs, list rows, metadata
 *   format.ts     — Date (relative timestamps), number, status badge formatting
 *   constants.ts  — Max stack depth (32), timeouts (5s auth, 1500ms go-to, 30s SSE reconnect),
 *                   breakpoint thresholds (80x24 min, 120x40 std, 200x60 lg),
 *                   pagination (500 item memory cap, 80% scroll threshold)
 *
 * Note: src/screens/Agents/utils/formatTimestamp.ts already implements relative
 * timestamp formatting. This may be generalized and promoted to src/util/ in a
 * future ticket.
 */

export {}
```

#### 3f. Hooks barrel file

**File**: `apps/tui/src/hooks/index.ts`

The `src/hooks/` directory already exists with `useDiffSyntaxStyle.ts`. This ticket adds the barrel file.

```ts
/**
 * Custom hooks for the TUI application.
 *
 * Existing hooks:
 *   useDiffSyntaxStyle — Creates/memoizes SyntaxStyle for diff viewer
 *
 * Planned hooks (see: specs/tui/engineering-architecture.md § Core Abstractions):
 *   useLayout              — Terminal dimensions → breakpoint + layout values
 *   useScreen              — Screen-level keybinding registration, loading, error
 *   useScreenKeybindings   — Push/pop keybinding scope on mount/unmount
 *   useGoToMode            — g-prefix mode with 1500ms timeout, 11 destinations
 *   usePagination          — Cursor-based pagination with 80% scroll detection
 *   useSSEChannel          — Subscribe to named SSE channel
 *   useTheme               — Access frozen ThemeTokens from ThemeProvider
 *   useOptimisticMutation  — Optimistic update with revert on error
 *
 * OpenTUI hooks (from @opentui/react, used directly — not re-exported):
 *   useKeyboard            — keyboard event handler (receives KeyEvent)
 *   useTerminalDimensions  — { width, height }
 *   useOnResize            — resize callback (returns CliRenderer)
 *   useTimeline            — animation timeline (returns Timeline)
 *   useRenderer            — CliRenderer instance
 */

export { useDiffSyntaxStyle } from "./useDiffSyntaxStyle.js"
```

#### 3g. Screens barrel file

**File**: `apps/tui/src/screens/index.ts`

The `src/screens/` directory already has `Agents/`. This ticket adds the barrel file.

```ts
/**
 * Screen components for the TUI application.
 *
 * Existing screens:
 *   Agents/          — Agent session components (MessageBlock, ToolBlock stubs)
 *
 * Planned screens (see: specs/tui/prd.md § Screen Inventory):
 *   Dashboard/       — Overview: recent repos, orgs, starred, activity feed
 *   Repository/      — Repo list, overview with tab navigation
 *   Issues/          — Issue list, detail, create, edit, close/reopen
 *   Landings/        — Landing request list, detail with stack/reviews/checks
 *   Diff/            — Unified + split diff views, file tree, syntax highlight
 *   Workspaces/      — Workspace list, detail, create/suspend/resume
 *   Workflows/       — Workflow list, run detail, log streaming
 *   Search/          — Global search across repos/issues/users/code
 *   Notifications/   — Notification inbox, mark read, SSE badge updates
 *   Settings/        — User profile, emails, SSH keys, tokens
 *   Organizations/   — Org list, org overview with members/teams
 *   Sync/            — Daemon sync status, conflict list
 *   Wiki/            — Wiki page list, detail with markdown rendering
 *
 * Screen registry maps ScreenName enum → { component, requiresRepo, params, keybindings }
 */

export {}
```

#### 3h. Lib barrel file

**File**: `apps/tui/src/lib/index.ts`

The `src/lib/` directory already has `diff-syntax.ts`. This ticket adds the barrel file.

```ts
/**
 * Library modules for the TUI application.
 *
 * Existing modules:
 *   diff-syntax.ts  — Syntax highlighting palettes, color tier detection, filetype resolution
 */

export {
  TRUECOLOR_PALETTE,
  ANSI256_PALETTE,
  ANSI16_PALETTE,
  SYNTAX_TOKEN_COUNT,
  detectColorTier,
  getPaletteForTier,
  resolveFiletype,
  createDiffSyntaxStyle,
  pathToFiletype,
} from "./diff-syntax.js"

export type { ColorTier } from "./diff-syntax.js"
```

**Verification**: All 9 value exports and 1 type export listed above have been confirmed present as named exports in `diff-syntax.ts`:
- `TRUECOLOR_PALETTE` (line 22), `ANSI256_PALETTE` (line 51), `ANSI16_PALETTE` (line 79) — `export const`
- `SYNTAX_TOKEN_COUNT` (line 99) — `export const`
- `detectColorTier` (line 103) — `export function`
- `getPaletteForTier` (line 123) — `export function`
- `resolveFiletype` (line 133) — `export function`
- `createDiffSyntaxStyle` (line 154) — `export function`
- `pathToFiletype` (line 160) — re-export from `@opentui/core`
- `ColorTier` (line 101) — `export type`

### Step 4: Create import verification file

**File**: `apps/tui/src/verify-imports.ts`

This file exists solely to verify that the critical dependency imports type-check correctly. It exercises both type-level and value-level imports to prove the full dependency chain resolves.

```ts
/**
 * Import verification — proves the dependency chain resolves.
 *
 * This file is a build-time check only. It imports key symbols from
 * @opentui/core and @opentui/react to verify they are resolvable
 * and correctly typed. It will be removed once src/index.tsx gains
 * real runtime imports in the TUI Bootstrap and Renderer ticket.
 *
 * What this file proves when tsc --noEmit passes:
 *   1. @opentui/core exports createCliRenderer as a callable function
 *      returning Promise<CliRenderer>
 *   2. @opentui/react exports createRoot as a callable function
 *      accepting CliRenderer and returning Root (with render/unmount)
 *   3. @opentui/react hooks (useKeyboard, useTerminalDimensions, useOnResize,
 *      useTimeline, useRenderer) are importable
 *   4. The React 19 peer dependency is satisfied
 *   5. The JSX namespace from @opentui/react/jsx-runtime is loadable
 *   6. @codeplane/sdk is resolvable via workspace:* protocol
 */

// Value-level imports — these resolve at runtime
import { createCliRenderer } from "@opentui/core"
import { createRoot, useKeyboard, useTerminalDimensions, useOnResize, useTimeline, useRenderer } from "@opentui/react"

// Type-level imports — compile-time only
import type { CliRenderer } from "@opentui/core"
import type { Root } from "@opentui/react"

// Verify createCliRenderer is callable (returns Promise<CliRenderer>)
type _AssertRendererReturn = ReturnType<typeof createCliRenderer> extends Promise<CliRenderer> ? true : never

// Verify createRoot takes a CliRenderer and returns Root
type _AssertRootReturn = ReturnType<typeof createRoot> extends Root ? true : never

// Verify hooks are callable
type _AssertUseKeyboard = typeof useKeyboard extends (...args: any[]) => any ? true : never
type _AssertUseTerminalDimensions = typeof useTerminalDimensions extends (...args: any[]) => any ? true : never
type _AssertUseOnResize = typeof useOnResize extends (...args: any[]) => any ? true : never
type _AssertUseTimeline = typeof useTimeline extends (...args: any[]) => any ? true : never
type _AssertUseRenderer = typeof useRenderer extends (...args: any[]) => any ? true : never

// Suppress unused variable warnings — referenced to prevent tree-shaking
void createCliRenderer
void createRoot
void useKeyboard
void useTerminalDimensions
void useOnResize
void useTimeline
void useRenderer

export type { CliRenderer, Root }
```

**Design notes**:

- **`ReturnType<typeof createCliRenderer>` assertion**: Verified from `@opentui/core/renderer.d.ts`: `export declare function createCliRenderer(config?: CliRendererConfig): Promise<CliRenderer>` — the return type check confirms the async factory pattern.
- **`ReturnType<typeof createRoot>` assertion**: Verified from `@opentui/react/src/reconciler/renderer.d.ts`: `export declare function createRoot(renderer: CliRenderer): Root` where `Root = { render: (node: ReactNode) => void; unmount: () => void }`.
- **Hook assertions use `(...args: any[]) => any`**: Verifies they are functions without matching exact signatures. Specific verified signatures:
  - `useKeyboard: (handler: (key: KeyEvent) => void, options?: UseKeyboardOptions) => void`
  - `useTerminalDimensions: () => { width: number; height: number }`
  - `useOnResize: (callback: (width: number, height: number) => void) => CliRenderer` (note: returns `CliRenderer`, not `void`)
  - `useTimeline: (options?: TimelineOptions) => Timeline`
  - `useRenderer: () => CliRenderer`
- **`void` expressions**: Prevent TypeScript unused-variable errors while keeping the value-level imports (needed to prove runtime resolution). This is the standard TypeScript pattern for intentionally unused bindings.

### Step 5: Create `.gitignore` for TUI app

**File**: `apps/tui/.gitignore`

```
dist/
*.tsbuildinfo
```

**Note**: `node_modules/` is already covered by the root `.gitignore` pattern `**/node_modules/`. We only need TUI-specific ignores: `dist/` (for future build output) and `*.tsbuildinfo` (for incremental compilation artifacts).

### Step 6: Run `pnpm install` and verify

**Command**: `pnpm install` from the monorepo root.

**Expected outcome**:
- `apps/tui` is recognized as a workspace package (covered by `apps/*` glob in `pnpm-workspace.yaml`; also listed in root `package.json` `workspaces: ["apps/*", ...]`)
- `@opentui/core@0.1.90` resolves from npm (already in pnpm store)
- `@opentui/react@0.1.90` resolves from npm (already in pnpm store)
- `react@19.2.4` resolves from npm (already in pnpm store)
- `@codeplane/sdk` resolves via workspace protocol (exists at `packages/sdk/`)
- Dev deps install: `bun-types@^1.3.11`, `@types/react@^19.0.0`, `typescript@^5`
- Exit code 0
- Expected warnings: pnpm will warn about missing peer dependencies `react-devtools-core@^7.0.1` and `ws@^8.18.0` from `@opentui/react`. These are listed as `peerDependencies` and `@opentui/react` has no `peerDependenciesMeta` field (confirmed from the published `package.json`), so pnpm cannot know they are optional. The warnings are informational only and do not affect functionality.

### Step 7: Run `tsc --noEmit` and verify

**Command**: `cd apps/tui && bun run check` (runs `tsc --noEmit`)

**Expected outcome**: Zero errors, zero warnings, exit code 0.

**What this proves**:
1. `tsconfig.json` is valid — all compiler options are recognized
2. `jsxImportSource: "@opentui/react"` resolves the JSX runtime types from `@opentui/react/jsx-runtime.d.ts` → `@opentui/react/jsx-namespace.d.ts` → `JSX.IntrinsicElements` with all 21 OpenTUI components
3. All new scaffold files (`index.tsx`, barrel files, `verify-imports.ts`) compile
4. All existing files (`useDiffSyntaxStyle.ts`, `diff-syntax.ts`, `types.ts`, `formatTimestamp.ts`, `MessageBlock.tsx`, `ToolBlock.tsx`, `components/index.ts`) compile under the new tsconfig
5. `createCliRenderer`, `createRoot`, and all five hooks are importable with correct types
6. The `@/*` path alias is configured (verified at first usage in a future ticket)
7. `bun-types` provides Bun globals without errors

**Import resolution verification**:
- `../lib/diff-syntax.js` in `useDiffSyntaxStyle.ts` → resolves to `src/lib/diff-syntax.ts` via `moduleResolution: "bundler"` (`.js` → `.ts` probing)
- `./MessageBlock` in `Agents/components/index.ts` → resolves to `MessageBlock.tsx` via `moduleResolution: "bundler"` (extensionless → `.tsx` probing)
- `../types` in `formatTimestamp.ts` → resolves to `Agents/types.ts` via `moduleResolution: "bundler"`
- `@opentui/core` → resolves via `node_modules/@opentui/core/index.d.ts` which re-exports from `./Renderable.js`, `./types.js`, `./renderer.js`, `./syntax-style.js`, etc.
- `@opentui/react` → resolves via `node_modules/@opentui/react/src/index.d.ts` which re-exports from `./reconciler/renderer.js`, `./hooks/index.js`, `./components/index.js`, `./components/app.js`, `./plugins/slot.js`, `./time-to-first-draw.js`, `./types/components.js`

---

## 5. File Manifest

Complete list of files created by this ticket:

| File | Purpose | Lines (approx) |
|------|---------|----------------|
| `apps/tui/package.json` | Package manifest with pinned dependencies | 22 |
| `apps/tui/tsconfig.json` | TypeScript config for React 19 + OpenTUI JSX | 29 |
| `apps/tui/.gitignore` | Ignore dist, tsbuildinfo | 2 |
| `apps/tui/src/index.tsx` | Entry point placeholder with type imports | 20 |
| `apps/tui/src/verify-imports.ts` | Compile-time import verification | 42 |
| `apps/tui/src/providers/index.ts` | Provider directory placeholder | 14 |
| `apps/tui/src/components/index.ts` | Components directory placeholder | 20 |
| `apps/tui/src/hooks/index.ts` | Hooks barrel file (re-exports existing hook) | 22 |
| `apps/tui/src/theme/index.ts` | Theme directory placeholder | 16 |
| `apps/tui/src/screens/index.ts` | Screens barrel file (placeholder, existing Agents/ untouched) | 24 |
| `apps/tui/src/lib/index.ts` | Lib barrel file (re-exports existing diff-syntax) | 18 |
| `apps/tui/src/util/index.ts` | Utilities directory placeholder | 14 |
| `e2e/tui/helpers.ts` | Shared test utilities for TUI E2E tests | 55 |
| `e2e/tui/app-shell.test.ts` | Scaffold verification tests | 195 |

**Total**: 14 files, ~493 lines.

**Existing files NOT modified**: `src/hooks/useDiffSyntaxStyle.ts`, `src/lib/diff-syntax.ts`, `src/screens/Agents/**`, `e2e/tui/diff.test.ts`.

---

## 6. Unit & Integration Tests

### Test file location

**File**: `e2e/tui/app-shell.test.ts`

Per the testing architecture, this file covers the `TUI_APP_SHELL` feature group. At this stage, it contains structural scaffold verification tests and dependency resolution tests. As subsequent tickets add bootstrap, auth, routing, and chrome behavior, tests are appended.

### Test infrastructure

**File**: `e2e/tui/helpers.ts`

Shared test helpers for TUI E2E tests. Modeled after the existing `e2e/cli/helpers.ts` patterns and the reference implementation at `specs/tui/e2e/tui/helpers.ts`.

```ts
import { join } from "node:path"

/** Absolute path to the TUI app root */
export const TUI_ROOT = join(import.meta.dir, "../../apps/tui")

/** Absolute path to the TUI source directory */
export const TUI_SRC = join(TUI_ROOT, "src")

/** TUI entry point for spawning in tests */
export const TUI_ENTRY = join(TUI_SRC, "index.tsx")

/** Bun binary path */
export const BUN = Bun.which("bun") ?? process.execPath

// Server config (shared with CLI e2e tests)
export const API_URL = process.env.API_URL ?? "http://localhost:3000"
export const WRITE_TOKEN = process.env.CODEPLANE_WRITE_TOKEN ?? "codeplane_deadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
export const READ_TOKEN = process.env.CODEPLANE_READ_TOKEN ?? "codeplane_feedfacefeedfacefeedfacefeedfacefeedface"
export const OWNER = process.env.CODEPLANE_E2E_OWNER ?? "alice"
export const ORG = process.env.CODEPLANE_E2E_ORG ?? "acme"

/** Standard terminal sizes for snapshot tests (matches design.md § 8.1 Breakpoints) */
export const TERMINAL_SIZES = {
  minimum: { width: 80, height: 24 },
  standard: { width: 120, height: 40 },
  large: { width: 200, height: 60 },
} as const

/**
 * Run a command in a subprocess and capture output.
 * Used for tsc, bun eval, and other verification commands.
 */
export async function run(
  cmd: string[],
  opts: { cwd?: string; env?: Record<string, string>; timeout?: number } = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(cmd, {
    cwd: opts.cwd ?? TUI_ROOT,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env as Record<string, string>, ...opts.env },
  })

  const timeout = opts.timeout ?? 30_000
  const timer = setTimeout(() => proc.kill(), timeout)

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  const exitCode = await proc.exited
  clearTimeout(timer)

  return { exitCode, stdout, stderr }
}

/**
 * Run a `bun -e` expression in the TUI package context.
 * Useful for verifying runtime import resolution.
 */
export async function bunEval(expression: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return run([BUN, "-e", expression])
}
```

**Design notes**:

- **`bunEval` uses `bun -e`**: Matches the `bun -e` flag for evaluating inline expressions. The reference `specs/tui/e2e/tui/helpers.ts` also uses `[BUN, "-e", expression]`.
- **No `@microsoft/tui-test` import**: This helper file is for scaffold verification tests that use subprocess-based assertions. The `TUITestInstance` interface, `launchTUI()`, and `createTestCredentialStore()` from the reference helpers in `specs/tui/e2e/tui/helpers.ts` will be added to this file when the test infrastructure ticket installs `@microsoft/tui-test` and enables interactive terminal testing.
- **Constants match CLI e2e**: `API_URL`, `WRITE_TOKEN`, `READ_TOKEN`, `OWNER`, `ORG` mirror `e2e/cli/helpers.ts` for consistency.

### Test specification

**File**: `e2e/tui/app-shell.test.ts`

```ts
import { describe, test, expect } from "bun:test"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { TUI_ROOT, TUI_SRC, run, bunEval } from "./helpers"

// ---------------------------------------------------------------------------
// TUI_APP_SHELL — Package scaffold
// ---------------------------------------------------------------------------

describe("TUI_APP_SHELL — Package scaffold", () => {
  test("package.json exists and declares correct name", async () => {
    const pkgPath = join(TUI_ROOT, "package.json")
    expect(existsSync(pkgPath)).toBe(true)
    const pkg = await Bun.file(pkgPath).json()
    expect(pkg.name).toBe("@codeplane/tui")
    expect(pkg.type).toBe("module")
    expect(pkg.private).toBe(true)
  })

  test("package.json pins @opentui/core at exact version", async () => {
    const pkg = await Bun.file(join(TUI_ROOT, "package.json")).json()
    const version = pkg.dependencies["@opentui/core"]
    expect(version).toBeDefined()
    // Must be exact-pinned (no ^ or ~ prefix) per architecture principle
    expect(version).toBe("0.1.90")
  })

  test("package.json pins @opentui/react at exact version", async () => {
    const pkg = await Bun.file(join(TUI_ROOT, "package.json")).json()
    const version = pkg.dependencies["@opentui/react"]
    expect(version).toBeDefined()
    expect(version).toBe("0.1.90")
  })

  test("package.json pins react 19.x at exact version", async () => {
    const pkg = await Bun.file(join(TUI_ROOT, "package.json")).json()
    const reactVersion = pkg.dependencies["react"]
    expect(reactVersion).toBeDefined()
    // Must be exact 19.x.x (no caret) — rendering-critical dependency
    expect(reactVersion).toMatch(/^19\.\d+\.\d+$/)
  })

  test("package.json declares @codeplane/sdk workspace dependency", async () => {
    const pkg = await Bun.file(join(TUI_ROOT, "package.json")).json()
    expect(pkg.dependencies["@codeplane/sdk"]).toBe("workspace:*")
  })

  test("package.json has typescript dev dependency", async () => {
    const pkg = await Bun.file(join(TUI_ROOT, "package.json")).json()
    expect(pkg.devDependencies["typescript"]).toBeDefined()
  })

  test("package.json has @types/react dev dependency", async () => {
    const pkg = await Bun.file(join(TUI_ROOT, "package.json")).json()
    expect(pkg.devDependencies["@types/react"]).toBeDefined()
  })

  test("package.json has bun-types dev dependency", async () => {
    const pkg = await Bun.file(join(TUI_ROOT, "package.json")).json()
    expect(pkg.devDependencies["bun-types"]).toBeDefined()
  })

  test("package.json has check script that runs tsc --noEmit", async () => {
    const pkg = await Bun.file(join(TUI_ROOT, "package.json")).json()
    expect(pkg.scripts?.check).toBe("tsc --noEmit")
  })

  test("tsconfig.json exists and configures OpenTUI JSX import source", async () => {
    const tsconfigPath = join(TUI_ROOT, "tsconfig.json")
    expect(existsSync(tsconfigPath)).toBe(true)
    const content = await Bun.file(tsconfigPath).text()
    // Verify the critical JSX configuration
    expect(content).toContain('"jsxImportSource"')
    expect(content).toContain("@opentui/react")
    expect(content).toContain('"react-jsx"')
  })

  test("tsconfig.json configures bun-types", async () => {
    const content = await Bun.file(join(TUI_ROOT, "tsconfig.json")).text()
    expect(content).toContain("bun-types")
  })

  test("tsconfig.json does not include DOM lib", async () => {
    const content = await Bun.file(join(TUI_ROOT, "tsconfig.json")).text()
    // TUI runs in a terminal, not a browser — no DOM types
    expect(content).not.toMatch(/"DOM"/)
  })

  test("tsconfig.json uses isolatedModules for Bun compatibility", async () => {
    const content = await Bun.file(join(TUI_ROOT, "tsconfig.json")).text()
    expect(content).toContain("isolatedModules")
  })

  test("entry point exists at src/index.tsx", () => {
    expect(existsSync(join(TUI_SRC, "index.tsx"))).toBe(true)
  })

  test("verify-imports.ts exists for dependency chain validation", () => {
    expect(existsSync(join(TUI_SRC, "verify-imports.ts"))).toBe(true)
  })

  test("providers directory exists with barrel export", () => {
    expect(existsSync(join(TUI_SRC, "providers/index.ts"))).toBe(true)
  })

  test("components directory exists with barrel export", () => {
    expect(existsSync(join(TUI_SRC, "components/index.ts"))).toBe(true)
  })

  test("hooks directory exists with barrel export", () => {
    expect(existsSync(join(TUI_SRC, "hooks/index.ts"))).toBe(true)
  })

  test("theme directory exists with barrel export", () => {
    expect(existsSync(join(TUI_SRC, "theme/index.ts"))).toBe(true)
  })

  test("screens directory exists with barrel export", () => {
    expect(existsSync(join(TUI_SRC, "screens/index.ts"))).toBe(true)
  })

  test("lib directory exists with barrel export", () => {
    expect(existsSync(join(TUI_SRC, "lib/index.ts"))).toBe(true)
  })

  test("util directory exists with barrel export", () => {
    expect(existsSync(join(TUI_SRC, "util/index.ts"))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// TUI_APP_SHELL — TypeScript compilation
// ---------------------------------------------------------------------------

describe("TUI_APP_SHELL — TypeScript compilation", () => {
  test("tsc --noEmit passes with zero errors", async () => {
    const result = await run(["bun", "run", "check"])
    if (result.exitCode !== 0) {
      // Print diagnostic output for debugging
      console.error("tsc stderr:", result.stderr)
      console.error("tsc stdout:", result.stdout)
    }
    expect(result.exitCode).toBe(0)
  }, 30_000) // generous timeout for first tsc invocation

  test("existing diff-syntax code compiles under new tsconfig", async () => {
    // This implicitly tests that the existing code at
    // src/hooks/useDiffSyntaxStyle.ts and src/lib/diff-syntax.ts
    // is compatible with the new tsconfig settings
    // (isolatedModules, moduleDetection: force, etc.)
    // If tsc --noEmit passes above, this is proven.
    // This test makes the assertion explicit and will catch
    // regressions if the tsconfig is modified.
    const result = await run(["bun", "run", "check"])
    expect(result.exitCode).toBe(0)
  }, 30_000)

  test("existing Agent screen code compiles under new tsconfig", async () => {
    // Verifies that the Agent screen files (types.ts, formatTimestamp.ts,
    // MessageBlock.tsx, ToolBlock.tsx, components/index.ts) all compile.
    // Key compatibility concerns validated:
    //   - formatTimestamp.ts: value-imports type Breakpoint (works with isolatedModules)
    //   - components/index.ts: extensionless re-exports (works with bundler resolution)
    //   - MessageBlock.tsx/ToolBlock.tsx: .tsx files with `export {}` (no JSX used yet)
    const result = await run(["bun", "run", "check"])
    expect(result.exitCode).toBe(0)
  }, 30_000)
})

// ---------------------------------------------------------------------------
// TUI_APP_SHELL — Dependency resolution
// ---------------------------------------------------------------------------

describe("TUI_APP_SHELL — Dependency resolution", () => {
  test("@opentui/core is resolvable at runtime", async () => {
    const result = await bunEval(
      "import('@opentui/core').then(() => console.log('ok')).catch(e => { console.error(e.message); process.exit(1) })",
    )
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("ok")
  })

  test("@opentui/react is resolvable at runtime", async () => {
    const result = await bunEval(
      "import('@opentui/react').then(() => console.log('ok')).catch(e => { console.error(e.message); process.exit(1) })",
    )
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("ok")
  })

  test("createCliRenderer is importable from @opentui/core and is a function", async () => {
    const result = await bunEval(
      "import { createCliRenderer } from '@opentui/core'; console.log(typeof createCliRenderer)",
    )
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("function")
  })

  test("createRoot is importable from @opentui/react and is a function", async () => {
    const result = await bunEval(
      "import { createRoot } from '@opentui/react'; console.log(typeof createRoot)",
    )
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("function")
  })

  test("OpenTUI React hooks are importable", async () => {
    const result = await bunEval(
      [
        "import { useKeyboard, useTerminalDimensions, useOnResize, useTimeline, useRenderer } from '@opentui/react';",
        "const types = [typeof useKeyboard, typeof useTerminalDimensions, typeof useOnResize, typeof useTimeline, typeof useRenderer];",
        "console.log(types.every(t => t === 'function') ? 'ok' : 'fail: ' + types.join(','));",
      ].join(" "),
    )
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("ok")
  })

  test("react 19.x is resolvable with correct major version", async () => {
    const result = await bunEval(
      "import React from 'react'; console.log(React.version)",
    )
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toMatch(/^19\./)
  })

  test("@codeplane/sdk is resolvable via workspace protocol", async () => {
    const result = await bunEval(
      "import('@codeplane/sdk').then(() => console.log('ok')).catch(e => { console.error(e.message); process.exit(1) })",
    )
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("ok")
  })
})
```

### Test categories applied

| Category | Tests | Notes |
|----------|-------|-------|
| Structural (package manifest) | 9 tests | package.json fields, exact pinning, scripts |
| Structural (tsconfig) | 4 tests | JSX config, bun-types, no DOM, isolatedModules |
| Structural (directory layout) | 9 tests | entry point, verify-imports, 7 subdirectory barrel files |
| TypeScript compilation | 3 tests | `bun run check` passes; existing diff-syntax compiles; existing Agent screen compiles |
| Dependency resolution | 7 tests | Runtime import verification via `bun -e` |
| Snapshot | 0 | No rendered output — added in bootstrap ticket |
| Keyboard interaction | 0 | No UI — added in bootstrap ticket |
| Responsive | 0 | No layout — added in responsive ticket |

**Total: 32 tests** (22 structural, 3 compilation, 7 dependency resolution)

### Tests left intentionally failing

None for this ticket. All tests validate the scaffold itself, which is fully implementable without backend dependencies.

The existing `e2e/tui/diff.test.ts` (tests across 5 describe blocks) will continue to fail at import time because it imports `createTestTui` from `@microsoft/tui-test` which is not yet installed. Per project policy, these tests remain as-is and are not modified, skipped, or commented out.

### Note on `@microsoft/tui-test`

The architecture specifies `@microsoft/tui-test` for terminal snapshot matching and keyboard simulation. This package is not yet installed in the monorepo. The existing `e2e/tui/diff.test.ts` already imports from it (proving the convention), but these tests cannot run until the package is added. A dedicated test infrastructure ticket will add it as a dev dependency and create the `launchTUI()` test helper that enables interactive terminal testing. The tests in this ticket use `bun -e` subprocesses and filesystem assertions, which do not require `@microsoft/tui-test`.

### Relationship to reference test files in `specs/tui/e2e/tui/`

The `specs/tui/e2e/tui/app-shell.test.ts` file (~875 lines) contains reference tests for loading states (LOAD-*) and keybinding priority dispatch (KEY-*). These tests require a running TUI with navigation, screens, and keyboard handling — none of which exist yet. The `e2e/tui/app-shell.test.ts` created by this ticket is the *scaffold-only* subset that validates package structure and dependency resolution. The reference tests will be migrated into the real `e2e/tui/app-shell.test.ts` as their corresponding features are implemented in subsequent tickets.

---

## 7. Acceptance Criteria

| # | Criterion | Verification method |
|---|-----------|--------------------|
| AC-1 | `apps/tui/package.json` exists with `@opentui/core@0.1.90`, `@opentui/react@0.1.90`, `react@19.2.4`, and `@codeplane/sdk@workspace:*` as dependencies | Tests: "package.json pins @opentui/core…", "…@opentui/react…", "…react 19.x…", "…@codeplane/sdk…" |
| AC-2 | `apps/tui/package.json` has `bun-types`, `@types/react`, and `typescript` as dev dependencies | Tests: "package.json has bun-types…", "…@types/react…", "…typescript…" |
| AC-3 | `apps/tui/tsconfig.json` configures `jsxImportSource: "@opentui/react"` with `jsx: "react-jsx"` | Test: "tsconfig.json exists and configures OpenTUI JSX import source" |
| AC-4 | `apps/tui/tsconfig.json` uses `bun-types`, excludes DOM lib, enables `isolatedModules` | Tests: "tsconfig.json configures bun-types", "…does not include DOM lib", "…uses isolatedModules" |
| AC-5 | `apps/tui/src/index.tsx` exists as entry point | Test: "entry point exists at src/index.tsx" |
| AC-6 | All seven subdirectories exist under `src/` with `index.ts` barrel files: `providers/`, `components/`, `hooks/`, `theme/`, `screens/`, `lib/`, `util/` | Tests: "providers directory exists…", "components…", "hooks…", "theme…", "screens…", "lib…", "util…" |
| AC-7 | `apps/tui/src/verify-imports.ts` exists with compile-time import assertions | Test: "verify-imports.ts exists for dependency chain validation" |
| AC-8 | `pnpm install` succeeds from monorepo root | Manual verification + CI |
| AC-9 | `tsc --noEmit` passes with zero errors (including existing code) | Tests: "tsc --noEmit passes with zero errors", "existing diff-syntax code compiles…", "existing Agent screen code compiles…" |
| AC-10 | `createCliRenderer` from `@opentui/core` is importable at runtime and is a function | Test: "createCliRenderer is importable from @opentui/core and is a function" |
| AC-11 | `createRoot` from `@opentui/react` is importable at runtime and is a function | Test: "createRoot is importable from @opentui/react and is a function" |
| AC-12 | All five OpenTUI React hooks are importable: `useKeyboard`, `useTerminalDimensions`, `useOnResize`, `useTimeline`, `useRenderer` | Test: "OpenTUI React hooks are importable" |
| AC-13 | `react` resolves to version 19.x at runtime | Test: "react 19.x is resolvable with correct major version" |
| AC-14 | `@codeplane/sdk` resolves via workspace protocol at runtime | Test: "@codeplane/sdk is resolvable via workspace protocol" |
| AC-15 | Existing source files (`useDiffSyntaxStyle.ts`, `diff-syntax.ts`, Agent screen files) are NOT modified | Manual review — existing files must have zero diffs |

---

## 8. Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| `formatTimestamp.ts` value-imports type `Breakpoint` — incompatible with `verbatimModuleSyntax` | Would cause tsc error if `verbatimModuleSyntax` were enabled | **Resolved** — we use `isolatedModules` instead | `isolatedModules` allows value imports of types (TypeScript erases them). `verbatimModuleSyntax` can be enabled in a follow-up ticket that also updates `formatTimestamp.ts` to use `import type`. |
| Agent component barrel uses extensionless paths (`export * from "./MessageBlock"`) while `useDiffSyntaxStyle.ts` uses `.js` | Inconsistent but functional | Very low — `moduleResolution: "bundler"` handles both patterns | Both extensionless and `.js` extension imports resolve correctly under bundler resolution. A style convention can be enforced later via lint rules. |
| `@opentui/core@0.1.90` native Zig bindings not available for current platform → runtime import fails | Runtime errors in `verify-imports.ts` and dependency resolution tests | Low — the npm package includes optional platform-specific native deps for darwin-arm64, darwin-x64, linux-arm64, linux-x64, win32-arm64, win32-x64 | Verified: pnpm store contains the darwin-arm64 native binary. `skipLibCheck: true` handles transitive type issues. |
| React version mismatch → pnpm installs a second React copy | Two React copies cause "Invalid hook call" errors in the reconciler (React hooks require singleton) | Low — we pin to the exact version already resolved in TUI's node_modules | Verified: TUI's `node_modules/react` symlinks to `.pnpm/react@19.2.4/node_modules/react`. The monorepo also has `react@19.2.3` used by docs/mintlify packages — these are separate pnpm dependency trees and don't conflict. |
| pnpm workspace protocol `workspace:*` doesn't resolve `@codeplane/sdk` | Install failure | Very low — `apps/*` is in `pnpm-workspace.yaml` and `packages/sdk` exists | Already verified: the glob pattern `apps/*` covers `apps/tui`. Root `package.json` also has `workspaces: ["apps/*", ...]`. |
| `@opentui/react` peer dependency warnings for `react-devtools-core` and `ws` | Noisy install output, potential confusion | Medium | Both are listed as `peerDependencies` in `@opentui/react`. The package has no `peerDependenciesMeta` field (confirmed from the published `package.json`), so pnpm will warn about missing `react-devtools-core` and `ws` but will not fail. These packages are only needed for React DevTools remote debugging and are not required for production TUI functionality. |
| The `@/*` path alias doesn't work at runtime in Bun | Runtime import errors when alias is first used | Low | Bun supports tsconfig paths natively since v1.0. Verify when the first `@/` import is added in a future ticket. Not exercised in this ticket. |
| Barrel file in `src/hooks/index.ts` re-exports `useDiffSyntaxStyle` — if the import path is wrong, tsc fails | Compile error | Low | The barrel uses `./useDiffSyntaxStyle.js` which matches the existing file at `src/hooks/useDiffSyntaxStyle.ts` via bundler resolution. This follows the same `.js` extension pattern the existing code already uses (`useDiffSyntaxStyle.ts` imports `../lib/diff-syntax.js`). |
| Barrel file in `src/lib/index.ts` re-exports symbols from `diff-syntax.ts` that may not all be exported | Compile error | Low | Verified: all 9 value exports and 1 type export are confirmed present in `diff-syntax.ts` at the specific line numbers documented in Step 3h. |
| `@opentui/core` index.d.ts imports from `bun:ffi` — could cause type errors | tsc may fail if `bun:ffi` types aren't available | Low | `bun-types` dev dependency provides `bun:ffi` type declarations. `skipLibCheck: true` prevents errors in node_modules type files. |

---

## 9. Productionization Notes

### What this ticket produces

A **scaffolded, type-checking package** with no runtime behavior. This is the permanent package structure — **not POC code**. Every file created by this ticket is intended to persist and grow.

### What this ticket does NOT produce

- No runnable TUI process
- No rendered terminal output
- No React component tree
- No network calls
- No keyboard handling

### Transition path to runnable TUI

The following changes happen in subsequent tickets. Nothing in this ticket needs to be "cleaned up" or "migrated" — it is extended in-place.

| What changes | When (ticket) | How |
|-------------|---------------|-----|
| `src/index.tsx` gains runtime bootstrap code | TUI Bootstrap and Renderer | Add `createCliRenderer()`, `createRoot()`, signal handlers, provider tree mount |
| `src/verify-imports.ts` is deleted | TUI Bootstrap and Renderer | No longer needed — `src/index.tsx` has real runtime imports that prove the dependency chain |
| `package.json` gains `@codeplane/ui-core` dependency | When `ui-core` package is created (does not exist yet — only `packages/sdk` and `packages/workflow` in monorepo) | Add `"@codeplane/ui-core": "workspace:*"` to dependencies |
| `package.json` gains `build` script | When distribution bundling is needed | Add Bun build command targeting `dist/` |
| Placeholder `index.ts` files gain real exports | Each feature ticket | Barrel file is extended, never replaced |
| `tsconfig.json` may gain `verbatimModuleSyntax` | When existing files are updated | Requires `formatTimestamp.ts` to change `import { Breakpoint }` → `import type { Breakpoint }` |
| `e2e/tui/helpers.ts` gains `TUITestInstance`, `launchTUI()` | Test infrastructure ticket | Adds `@microsoft/tui-test` dependency and full interactive terminal test support |
| `e2e/tui/app-shell.test.ts` gains LOAD-* and KEY-* tests | Loading states + keybinding tickets | Migration from reference tests in `specs/tui/e2e/tui/app-shell.test.ts` |

### Directory placeholder lifecycle

Each `index.ts` placeholder is the permanent barrel file for its directory. It is **not** replaced — it is populated:

| Directory | First real export added by |
|-----------|---------------------------|
| `providers/` | ThemeProvider (TUI_THEME_AND_COLOR_TOKENS ticket) |
| `components/` | AppShell (TUI_APP_SHELL chrome ticket) |
| `hooks/` | Already has `useDiffSyntaxStyle` re-export. `useLayout` added by TUI_RESPONSIVE_LAYOUT ticket |
| `theme/` | tokens.ts + detect.ts (TUI_THEME_AND_COLOR_TOKENS ticket) |
| `screens/` | DashboardScreen (TUI_DASHBOARD ticket) |
| `lib/` | Already has `diff-syntax` re-exports. Extended by future library modules |
| `util/` | constants.ts (TUI_BOOTSTRAP_AND_RENDERER ticket) |

### Dependency version contract

This ticket establishes a **version contract** for rendering-critical dependencies:

| Package | Pinned version | Change policy |
|---------|---------------|---------------|
| `@opentui/core` | `0.1.90` | Never bump without re-running all snapshot tests |
| `@opentui/react` | `0.1.90` | Never bump without re-running all snapshot tests |
| `react` | `19.2.4` | Never bump without verifying reconciler compatibility |

Dev dependencies (`typescript`, `@types/react`, `bun-types`) use caret ranges and can be updated freely.

---

## 10. Relationship to Feature Inventory

This ticket is a prerequisite for **all TUI features** in `specs/tui/features.ts` and **all TUI epics** (TUI_EPIC_01 through TUI_EPIC_13).

It does not implement any feature to completion but partially satisfies:

- **TUI_BOOTSTRAP_AND_RENDERER**: Package exists and core dependencies resolve. The actual renderer bootstrap (terminal setup, React mount, signal handling) is ticket `tui-bootstrap-and-renderer` in TUI_EPIC_01.

### Dependency chain this ticket validates

```
@codeplane/tui (this package)
  → @opentui/react@0.1.90 (npm-published)
    → @opentui/core@0.1.90 (npm-published, Zig native core)
    → react-reconciler@^0.32.0
    → react@19.2.4 (peer dependency, >=19.0.0)
  → @opentui/core@0.1.90
    → yoga-layout@3.2.1 (flexbox layout engine)
    → web-tree-sitter@0.25.10 (syntax highlighting, peer dep)
    → bun-ffi-structs (Zig FFI)
    → diff@8.0.2 (text diff computation)
    → marked@17.0.1 (markdown parsing)
    → jimp@1.6.0 (image processing — used for sixel/kitty graphics, not required by TUI)
  → @codeplane/sdk@workspace:* (domain types, services)
```

This chain must resolve both at compile time (tsc) and at runtime (bun -e) before any feature work can proceed.

---

## 11. Resolved Questions

| Question | Resolution | Evidence |
|----------|-----------|----------|
| Are `@opentui/core` and `@opentui/react` published to npm at 0.1.90? | **Yes** — both are published to npm with compiled `.js`/`.d.ts` files and pre-built binaries | `node_modules/.pnpm/@opentui+core@0.1.90*/node_modules/@opentui/core/package.json` shows `"main": "index.js"`, `"types": "index.d.ts"`, `"version": "0.1.90"`. `node_modules/.pnpm/@opentui+react@0.1.90*/node_modules/@opentui/react/package.json` shows `"main": "index.js"`, `"types": "src/index.d.ts"`, `"version": "0.1.90"`. |
| Should `apps/tui` be added to `pnpm-workspace.yaml`? | **No** — covered by existing `apps/*` glob | `pnpm-workspace.yaml` contains `packages: ["apps/*", "packages/*", "specs", "docs"]`. Root `package.json` has `workspaces: ["apps/*", "packages/*", ...]`. |
| Should we use `bun-types` or `@types/bun`? | **`bun-types`** — matches Codeplane convention | `apps/cli/tsconfig.json` uses `"types": ["bun-types"]`. Resolves to `bun-types@1.3.11` in lockfile. |
| What React version to pin? | **`19.2.4`** — matches the TUI's resolved node_modules symlink | TUI's `node_modules/react` symlinks to `.pnpm/react@19.2.4/node_modules/react`. The monorepo also has `react@19.2.3` used by docs/mintlify packages — these are separate pnpm dependency trees and don't conflict. `@opentui/react` peer dependency `react >=19.0.0` is satisfied. |
| Does existing code need modification? | **No** — all existing imports are compatible with the chosen tsconfig | `isolatedModules: true` (not `verbatimModuleSyntax`) permits `formatTimestamp.ts`'s value import of type `Breakpoint`. Both `.js` extension and extensionless imports work with `moduleResolution: "bundler"`. |
| Should we use `verbatimModuleSyntax`? | **No** — use `isolatedModules` instead | `formatTimestamp.ts` uses `import { Breakpoint } from "../types"` where `Breakpoint` is `export type`. This is a compile error under `verbatimModuleSyntax` but works under `isolatedModules`. Switching requires modifying existing files, which is out of scope. |
| Where do existing directories get barrel files? | **In this ticket** — barrel files re-export existing code | `src/hooks/index.ts` re-exports `useDiffSyntaxStyle`. `src/lib/index.ts` re-exports all `diff-syntax` symbols. `src/screens/index.ts` is a placeholder (Agents screen has its own internal barrel). |
| Is `@microsoft/tui-test` installed? | **No** — not in pnpm store or lockfile | `e2e/tui/diff.test.ts` imports it but tests cannot run until a test infrastructure ticket adds it. |
| Does a root `tsconfig.json` exist that we should extend? | **No** — the file does not exist at `/tsconfig.json` | `apps/cli/tsconfig.json` is standalone with no `extends`. We follow the CLI pattern. |
| Should `.gitignore` include `node_modules/`? | **No** — root `.gitignore` has `**/node_modules/` pattern | Only TUI-specific entries needed: `dist/` and `*.tsbuildinfo`. Root `.gitignore` confirmed to contain `**/node_modules/`. |
| Does `@opentui/react` export `useOnResize` or `useResize`? | **`useOnResize`** — exported from `use-resize.js` | Confirmed from `@opentui/react/src/hooks/use-resize.d.ts`: `export declare const useOnResize: (callback: (width: number, height: number) => void) => import("@opentui/core").CliRenderer`. Returns `CliRenderer`, not `void`. |
| What JSX intrinsic elements does `@opentui/react` declare? | 21 elements: `box`, `text`, `span`, `code`, `diff`, `markdown`, `input`, `textarea`, `select`, `scrollbox`, `ascii-font`, `tab-select`, `line-number`, `b`, `i`, `u`, `strong`, `em`, `br`, `a` | Confirmed from `@opentui/react/jsx-namespace.d.ts`. The `IntrinsicElements` interface extends `React.JSX.IntrinsicElements` and `ExtendedIntrinsicElements<OpenTUIComponents>`, plus declares all 21 elements with typed props. |
| Does `createRoot` return a `Root` type with `render` and `unmount`? | **Yes** | `Root = { render: (node: ReactNode) => void; unmount: () => void }` from `@opentui/react/src/reconciler/renderer.d.ts`. `createRoot` declared as `export declare function createRoot(renderer: CliRenderer): Root`. |
| Does `@opentui/react` have `peerDependenciesMeta` for optional peers? | **No** — there is no `peerDependenciesMeta` field in the published `package.json` | pnpm will warn about missing `react-devtools-core` and `ws` but will not fail. These packages are only needed for React DevTools remote debugging. |
| Does `createCliRenderer` accept optional config? | **Yes** — `createCliRenderer(config?: CliRendererConfig): Promise<CliRenderer>` | Confirmed from `@opentui/core/renderer.d.ts`. `CliRendererConfig` has ~24+ optional fields including `stdin`, `stdout`, `exitOnCtrlC`, `useAlternateScreen`, `useMouse`, `targetFps`, `maxFps`, `backgroundColor`, `useKittyKeyboard`, etc. |
| What does `useKeyboard` accept? | `(handler: (key: KeyEvent) => void, options?: UseKeyboardOptions) => void` | Confirmed from `@opentui/react/src/hooks/use-keyboard.d.ts`. `UseKeyboardOptions` has optional `release: boolean` field for including key release events. |
| What does `@opentui/react` re-export from its main entry? | Components, app, hooks, plugins, reconciler, time-to-first-draw, types, and `createElement` from React | Confirmed from `src/index.d.ts`: exports from `./components/index.js`, `./components/app.js`, `./hooks/index.js`, `./plugins/slot.js`, `./reconciler/renderer.js`, `./time-to-first-draw.js`, `./types/components.js`, and `{ createElement } from "react"`. |
| Does `@opentui/react` also export `flushSync` and `createPortal`? | **Yes** — from `src/reconciler/renderer.d.ts` | Available but not needed for scaffold ticket. |
| Does `@opentui/react` export test utilities? | **Yes** — from `./test-utils` export path | `testRender(node, options)` returns `{ renderer, mockInput, mockMouse, renderOnce, captureCharFrame, captureSpans, resize }`. May be useful for unit tests in future tickets. |
| Does `@codeplane/ui-core` exist in the monorepo? | **No** — only `packages/sdk` and `packages/workflow` exist under `packages/` | The TUI imports `@codeplane/sdk` directly. `@codeplane/ui-core` is referenced in the architecture docs as a planned shared data layer but has not been created yet. |
| Do reference test files exist in `specs/tui/e2e/tui/`? | **Yes** — `helpers.ts`, `app-shell.test.ts` (~875 lines), `diff.test.ts`, `agents.test.ts`, and others | These are reference specifications. The real `e2e/tui/` at repo root currently only has `diff.test.ts`. This ticket creates `helpers.ts` and `app-shell.test.ts` at `e2e/tui/` with scaffold-scope tests. |
| How many tests does the reference `specs/tui/e2e/tui/app-shell.test.ts` contain? | ~76 tests across 2 describe blocks: `TUI_LOADING_STATES` (32 tests covering spinners, skeletons, errors, pagination, actions, timeouts) and `KeybindingProvider — Priority Dispatch` (44 tests covering keybinding scopes, hints, and interactions) | Confirmed by reading the full 875-line file. These tests require a running TUI and are deferred to their respective feature tickets. |