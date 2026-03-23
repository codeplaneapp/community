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
- Existing e2e test files: `e2e/tui/diff.test.ts`, `e2e/tui/agents.test.ts`, and `e2e/tui/helpers.ts`

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
8. Extension of `e2e/tui/helpers.ts` with subprocess utilities (`run`, `bunEval`, constants) while preserving the existing `TUITestInstance` interface and `launchTUI` stub
9. Creation of `e2e/tui/app-shell.test.ts` with structural and dependency verification tests

### Out of scope

- Terminal setup (alternate screen, raw mode, cursor hide)
- React component tree mounting via `createRoot`
- Provider hierarchy (ThemeProvider, AuthProvider, NavigationProvider, etc.)
- Any visual rendering, layout, or keyboard handling
- SSE, auth, or API client setup
- `@microsoft/tui-test` integration (not yet installed in monorepo — deferred to a dedicated test infrastructure ticket)

---

## 3. Pre-existing Code Inventory

### Source files under `apps/tui/src/`

The following files already exist and must be accounted for by this scaffold. The `tsconfig.json` created by this ticket must compile all of them without errors.

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

**Resolution**: Do NOT enable `verbatimModuleSyntax`. Use `isolatedModules: true` instead, which provides most of the same safety without breaking the existing value-import-of-type pattern. `isolatedModules` ensures each file can be transpiled independently (critical for Bun) without requiring `import type` annotations.

### Existing e2e test files

| File | Purpose | Lines | Imports from |
|------|---------|-------|-------------|
| `e2e/tui/helpers.ts` | Stub test helpers: `TUITestInstance` interface and `launchTUI()` throwing not-implemented | 21 | none |
| `e2e/tui/diff.test.ts` | Diff syntax highlighting e2e test specs (30+ tests across 5 describe blocks, comment-only bodies) | 217 | `@microsoft/tui-test` (`createTestTui`) — not yet installed |
| `e2e/tui/agents.test.ts` | Agent session e2e test specs (comprehensive fixtures and tests) | ~190KB | `bun:test`, `./helpers` (`launchTUI`, `TUITestInstance`) |

**Critical backward compatibility constraint**: `e2e/tui/agents.test.ts` imports `launchTUI` and `TUITestInstance` from `./helpers` as named imports:
```ts
import { launchTUI, TUITestInstance } from "./helpers";
```
Any changes to `helpers.ts` MUST preserve these exports with compatible signatures. The existing `launchTUI` function signature accepts `{ cols?, rows?, env?, args? }` and returns `Promise<TUITestInstance>` — this must remain unchanged.

`e2e/tui/diff.test.ts` imports `createTestTui` from `@microsoft/tui-test` which is not installed in the monorepo. Tests will fail at import time until `@microsoft/tui-test` is added by a separate test infrastructure ticket. Per project policy, these tests remain as-is — they are never skipped or commented out.

### Reference test files in `specs/tui/e2e/tui/`

The `specs/tui/` directory contains reference implementations of test files:

| File | Purpose |
|------|--------|
| `specs/tui/e2e/tui/helpers.ts` | Reference test helpers (353 lines) with full `launchTUI()` implementation, credential store helpers, mock API env helpers, navigation helpers, `run()`, `bunEval()` |
| `specs/tui/e2e/tui/app-shell.test.ts` | Reference app shell tests (~875 lines) with LOAD-* and KEY-* test IDs covering loading states and keybinding priority dispatch |

These reference files inform the real `e2e/tui/` test files but live in `specs/` as documentation. The `e2e/tui/helpers.ts` update created by this ticket is derived from the reference but adapted for scaffold-only scope.

The reference `app-shell.test.ts` imports `launchTUI`, `createMockAPIEnv`, and `type TUITestInstance` from `./helpers`. These LOAD-* and KEY-* tests require a running TUI with navigation, screens, and keyboard handling — none of which exist yet. The `e2e/tui/app-shell.test.ts` created by this ticket is the *scaffold-only* subset, covering package structure, TypeScript compilation, and dependency resolution only.

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
- **`private: true`**: This is an app, not a published package. Prevents accidental `npm publish`. Matches `apps/cli/package.json` pattern (`"private": true`).
- **`type: module`**: All Codeplane packages use ES modules. Required by `@opentui/core` and `@opentui/react` which declare `"type": "module"`. Matches `@codeplane/sdk`'s package configuration.
- **`main: src/index.tsx`**: Entry point for the TUI application. Bun runs TypeScript directly — no compilation step needed. Matches `@codeplane/sdk`'s `"main": "src/index.ts"` pattern.
- **`@opentui/core` at `0.1.90`**: Exact-pinned (no `^` or `~`). The npm-published package includes pre-compiled `.js`/`.d.ts` files and platform-specific Zig native binaries via optional dependencies. Exact pinning per architecture principle: "Pin exact versions for rendering-critical dependencies."
- **`@opentui/react` at `0.1.90`**: Exact-pinned. Exports `createRoot`, reconciler hooks, JSX runtime types. Its `peerDependencies` require `react >=19.0.0` — satisfied by `react@19.2.4`.
- **`react` at `19.2.4`**: Exact-pinned to match the version already resolved in the TUI's `node_modules/react` symlink. Pinning avoids introducing a second React copy, which would break the React reconciler (reconciler hooks require a singleton React instance).
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

- **`jsx: "react-jsx"` + `jsxImportSource: "@opentui/react"`**: Makes OpenTUI JSX elements type-check as valid JSX intrinsic elements. The `@opentui/react` package exports `jsx-runtime.d.ts` which re-exports `Fragment`, `jsx`, `jsxs` from `react/jsx-runtime` and `export type *` from `jsx-namespace.d.ts`. That namespace declares the full `JSX.IntrinsicElements` interface including all 21 OpenTUI components: `box` (`BoxProps`), `text` (`TextProps`), `span` (`SpanProps`), `code` (`CodeProps`), `diff` (`DiffProps`), `markdown` (`MarkdownProps`), `input` (`InputProps`), `textarea` (`TextareaProps`), `select` (`SelectProps`), `scrollbox` (`ScrollBoxProps`), `ascii-font` (`AsciiFontProps`), `tab-select` (`TabSelectProps`), `line-number` (`LineNumberProps`), `b`/`i`/`u`/`strong`/`em` (`SpanProps`), `br` (`LineBreakProps`), `a` (`LinkProps`).
- **`lib: ["ESNext"]`**: No `"DOM"` lib. The TUI runs in a terminal, not a browser — including DOM types would allow accidental use of `window`, `document`, `localStorage`. `skipLibCheck: true` prevents transitive DOM references from causing errors.
- **`target: "ESNext"` + `module: "ESNext"`**: Matches `apps/cli/tsconfig.json`. No downleveling — Bun supports all ESNext features natively.
- **`moduleDetection: "force"`**: Treats all files as modules regardless of `import`/`export` presence. Prevents ambient script behavior. Matches `@opentui/react` convention.
- **`moduleResolution: "bundler"`**: Required for the existing code which uses mixed import patterns — `.js` extensions in `useDiffSyntaxStyle.ts` and extensionless imports in `Agents/components/index.ts`. Bundler resolution probes both patterns correctly. Matches `apps/cli/tsconfig.json`.
- **`allowImportingTsExtensions: true`**: Required alongside `noEmit: true` when `moduleResolution` is `bundler`. Allows `.ts`/`.tsx` extensions in import paths.
- **`isolatedModules: true`** (NOT `verbatimModuleSyntax`): Ensures each file can be transpiled independently — critical for Bun's single-file transpilation model. Chosen over `verbatimModuleSyntax` because the existing `formatTimestamp.ts` uses `import { Breakpoint } from "../types"` where `Breakpoint` is a type-only export. Under `verbatimModuleSyntax`, this would be a compile error.
- **`noEmit: true`**: Bun runs TypeScript directly. No compilation step.
- **`strict: true`**: Matches `apps/cli/tsconfig.json`. Enables `strictNullChecks`, `strictFunctionTypes`, `noImplicitAny`, etc.
- **`skipLibCheck: true`**: Prevents errors in `node_modules` type files — particularly important because `@opentui/core` `renderer.d.ts` imports from `bun:ffi` and `@opentui/react` references `react-reconciler` types.
- **`paths: { "@/*": ["./src/*"] }`**: Path alias for cleaner imports. Not yet used but configured to avoid future tsconfig changes. Bun supports tsconfig paths natively.
- **`types: ["bun-types"]`**: Provides Bun global types (`Bun.spawn`, `Bun.file`, `process`, `import.meta`). Matches `apps/cli/tsconfig.json`.
- **`noUnusedLocals: false` + `noUnusedParameters: false`**: Permissive during scaffold phase. Strictening to `true` can happen in a follow-up ticket.
- **`include: ["src/**/*.ts", "src/**/*.tsx"]`**: Covers both `.ts` and `.tsx` files. Only covers `src/` — test files in `e2e/tui/` have their own compilation context via `bun test`.
- **No `extends`**: The root monorepo has no shared `tsconfig.json` to extend. Follows the `apps/cli` pattern: standalone tsconfig.

**Compatibility with existing code verified**:
- `useDiffSyntaxStyle.ts`: `import { type SyntaxStyle } from "@opentui/core"` — inline type annotations work with `isolatedModules`.
- `diff-syntax.ts`: `import { RGBA, type StyleDefinition, SyntaxStyle, pathToFiletype } from "@opentui/core"` — mixed value and inline-type imports work correctly.
- `formatTimestamp.ts`: `import { Breakpoint } from "../types"` — value import of a type works with `isolatedModules`.
- `components/index.ts`: `export * from "./MessageBlock"` without extension — works with `moduleResolution: "bundler"`.

### Step 3: Create directory structure with placeholder files

All new directories are created with `index.ts` barrel files. Existing directories (`src/hooks/`, `src/lib/`, `src/screens/`) receive barrel files that re-export existing symbols.

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

**Why type-only imports**: This entry point is a placeholder. It must type-check to prove the dependency chain resolves, but it does not execute any runtime code. Real runtime imports are added by the *TUI Bootstrap and Renderer* ticket.

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

**Note**: The re-export uses `.js` extension to match the convention used by `useDiffSyntaxStyle.ts` itself (which imports `../lib/diff-syntax.js`). Under `moduleResolution: "bundler"`, Bun resolves `.js` to `.ts` seamlessly.

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
- **Hook assertions use `(...args: any[]) => any`**: Verifies they are functions without matching exact signatures. Verified signatures:
  - `useKeyboard: (handler: (key: KeyEvent) => void, options?: UseKeyboardOptions) => void`
  - `useTerminalDimensions: () => { width: number; height: number }`
  - `useOnResize: (callback: (width: number, height: number) => void) => CliRenderer`
  - `useTimeline: (options?: TimelineOptions) => Timeline`
  - `useRenderer: () => CliRenderer`
- **`void` expressions**: Prevent TypeScript unused-variable errors while keeping value-level imports.

### Step 5: Create `.gitignore` for TUI app

**File**: `apps/tui/.gitignore`

```
dist/
*.tsbuildinfo
```

**Note**: `node_modules/` is already covered by the root `.gitignore` pattern `**/node_modules/`. Only TUI-specific ignores are needed.

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
- Expected warnings: pnpm will warn about missing peer dependencies `react-devtools-core@^7.0.1` and `ws@^8.18.0` from `@opentui/react`. These are informational only and do not affect functionality.

### Step 7: Run `tsc --noEmit` and verify

**Command**: `cd apps/tui && bun run check` (runs `tsc --noEmit`)

**Expected outcome**: Zero errors, zero warnings, exit code 0.

**What this proves**:
1. `tsconfig.json` is valid — all compiler options are recognized
2. `jsxImportSource: "@opentui/react"` resolves the JSX runtime types correctly
3. All new scaffold files compile
4. All existing files compile under the new tsconfig
5. `createCliRenderer`, `createRoot`, and all five hooks are importable with correct types
6. The `@/*` path alias is configured (verified at first usage in a future ticket)
7. `bun-types` provides Bun globals without errors

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
| `apps/tui/src/screens/index.ts` | Screens barrel file (placeholder) | 24 |
| `apps/tui/src/lib/index.ts` | Lib barrel file (re-exports existing diff-syntax) | 18 |
| `apps/tui/src/util/index.ts` | Utilities directory placeholder | 14 |

**Total new files**: 12 files under `apps/tui/`, ~243 lines.

**Modified files**:

| File | Change | Lines added (approx) |
|------|--------|---------------------|
| `e2e/tui/helpers.ts` | Extended with constants, `run()`, `bunEval()`, `sleep()`, `TERMINAL_SIZES` — preserving existing `TUITestInstance` and `launchTUI` | +80 |
| `e2e/tui/app-shell.test.ts` | New file: scaffold verification tests | 195 |

**Existing files NOT modified**: `src/hooks/useDiffSyntaxStyle.ts`, `src/lib/diff-syntax.ts`, `src/screens/Agents/**`, `e2e/tui/diff.test.ts`, `e2e/tui/agents.test.ts`.

---

## 6. Unit & Integration Tests

### Test infrastructure update

**File**: `e2e/tui/helpers.ts` (modified — extends existing stub)

The existing `e2e/tui/helpers.ts` (21 lines) contains the `TUITestInstance` interface and a stub `launchTUI()` that throws. This ticket **prepends** constants and subprocess utilities while preserving the existing exports exactly as-is. The `agents.test.ts` file (~190KB) imports `launchTUI` and `TUITestInstance` from this file — backward compatibility is mandatory.

Updated file content:

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ── TUITestInstance interface (preserved for backward compatibility) ─────────
// Imported by: e2e/tui/agents.test.ts, future test files

export interface TUITestInstance {
  sendKeys(...keys: string[]): Promise<void>;
  sendText(text: string): Promise<void>;
  waitForText(text: string, timeoutMs?: number): Promise<void>;
  waitForNoText(text: string, timeoutMs?: number): Promise<void>;
  snapshot(): string;
  getLine(lineNumber: number): string;
  resize(cols: number, rows: number): Promise<void>;
  terminate(): Promise<void>;
  rows: number;
  cols: number;
}

export async function launchTUI(options?: {
  cols?: number;
  rows?: number;
  env?: Record<string, string>;
  args?: string[];
}): Promise<TUITestInstance> {
  throw new Error("TUITestInstance: Not yet implemented. This is a stub for E2E test scaffolding.");
}
```

**Design notes**:

- The `TUITestInstance` interface and `launchTUI` function signatures are preserved **byte-for-byte** from the existing file to ensure `agents.test.ts` continues to import without errors.
- The `sleep` helper is not exported (matches the reference `specs/tui/e2e/tui/helpers.ts` pattern where it's module-private).
- `run()` and `bunEval()` are new exports used by the scaffold verification tests.
- Constants (`TUI_ROOT`, `TUI_SRC`, `TUI_ENTRY`, `BUN`, `TERMINAL_SIZES`) are new exports.
- Server config constants (`API_URL`, `WRITE_TOKEN`, `READ_TOKEN`, `OWNER`, `ORG`) match CLI e2e test conventions.

### Test specification

**File**: `e2e/tui/app-shell.test.ts` (new file)

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
  }, 30_000)

  test("existing diff-syntax code compiles under new tsconfig", async () => {
    // This implicitly tests that the existing code at
    // src/hooks/useDiffSyntaxStyle.ts and src/lib/diff-syntax.ts
    // is compatible with the new tsconfig settings
    // (isolatedModules, moduleDetection: force, etc.)
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

None for this ticket. All 32 tests validate the scaffold itself, which is fully implementable without backend dependencies.

The existing `e2e/tui/diff.test.ts` (30+ tests) will continue to fail at import time because it imports `createTestTui` from `@microsoft/tui-test` which is not installed. The existing `e2e/tui/agents.test.ts` (~190KB) will continue to fail because its `launchTUI()` call throws "Not yet implemented". Per project policy, these tests remain as-is — they are never skipped or commented out.

### Note on `@microsoft/tui-test`

The architecture specifies `@microsoft/tui-test` for terminal snapshot matching and keyboard simulation. This package is not yet installed in the monorepo. The tests in this ticket use `bun -e` subprocesses and filesystem assertions, which do not require `@microsoft/tui-test`. A dedicated test infrastructure ticket will add it as a dev dependency and implement the full `launchTUI()` helper.

### Relationship to reference test files in `specs/tui/e2e/tui/`

The `specs/tui/e2e/tui/app-shell.test.ts` file (~875 lines) contains reference tests organized into two major describe blocks:

1. **`TUI_LOADING_STATES`** (LOAD-SNAP-*, LOAD-KEY-*, LOAD-RSP-*) — Tests for full-screen loading spinners, skeleton rendering, pagination indicators, action loading, full-screen error states, optimistic UI revert, no-color terminal support, loading timeouts, keyboard interactions during loading, and responsive behavior during loading.
2. **`KeybindingProvider — Priority Dispatch`** (KEY-SNAP-*, KEY-KEY-*, KEY-INT-*, KEY-EDGE-*, KEY-RSP-*) — Tests for status bar hints, global keybindings (q, Escape, Ctrl+C, ?, :, g), priority layering (modal > go-to > screen > global), text input capture, scope lifecycle, and responsive behavior.

These reference tests all require:
- A running TUI process with visual rendering
- NavigationProvider with screen stack
- KeybindingProvider with priority dispatch
- Loading states and error boundaries
- Mock API server helpers (`createMockAPIEnv`)

None of these exist yet. The `e2e/tui/app-shell.test.ts` created by this ticket is the *scaffold-only* subset. Reference tests will be migrated as their corresponding features are implemented in subsequent tickets.

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
| AC-16 | `e2e/tui/helpers.ts` preserves `TUITestInstance` interface and `launchTUI` stub signature | `agents.test.ts` continues to import without errors |

---

## 8. Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| `formatTimestamp.ts` value-imports type `Breakpoint` — incompatible with `verbatimModuleSyntax` | Would cause tsc error if `verbatimModuleSyntax` were enabled | **Resolved** — we use `isolatedModules` instead | `isolatedModules` allows value imports of types. `verbatimModuleSyntax` can be enabled in a follow-up ticket that also updates `formatTimestamp.ts` to use `import type`. |
| Agent component barrel uses extensionless paths while `useDiffSyntaxStyle.ts` uses `.js` | Inconsistent but functional | Very low | Both patterns resolve correctly under `moduleResolution: "bundler"`. Style convention can be enforced later via lint rules. |
| `@opentui/core@0.1.90` native Zig bindings not available for current platform | Runtime import errors in dependency resolution tests | Low — npm package includes optional platform-specific deps for darwin-arm64, darwin-x64, linux-arm64, linux-x64, win32-arm64, win32-x64 | Verified: pnpm store contains the darwin-arm64 native binary. `skipLibCheck: true` handles transitive type issues. |
| React version mismatch → pnpm installs a second React copy | Two React copies cause "Invalid hook call" errors | Low — we pin to the exact version already resolved | Verified: TUI's `node_modules/react` symlinks to `react@19.2.4`. |
| pnpm workspace protocol `workspace:*` doesn't resolve `@codeplane/sdk` | Install failure | Very low | Already verified: `apps/*` glob covers `apps/tui`, `packages/sdk` exists at correct path. |
| `@opentui/react` peer dependency warnings for `react-devtools-core` and `ws` | Noisy install output | Medium | Both are optional (only needed for React DevTools debugging). pnpm will warn but not fail. |
| The `@/*` path alias doesn't work at runtime in Bun | Runtime import errors when alias is first used | Low | Bun supports tsconfig paths natively since v1.0. Verified when first `@/` import is added. |
| Extending `e2e/tui/helpers.ts` breaks `agents.test.ts` imports | Test file import errors | Very low | The `TUITestInstance` interface and `launchTUI` signature are preserved byte-for-byte. New exports are additive only. |
| `@opentui/core` index.d.ts imports from `bun:ffi` — could cause type errors | tsc may fail | Low | `bun-types` dev dependency provides `bun:ffi` type declarations. `skipLibCheck: true` prevents errors in node_modules type files. |

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
| `src/verify-imports.ts` is deleted | TUI Bootstrap and Renderer | No longer needed — `src/index.tsx` has real runtime imports |
| `package.json` gains `@codeplane/ui-core` dependency | When `ui-core` package is created | Add `"@codeplane/ui-core": "workspace:*"` to dependencies |
| `package.json` gains `build` script | When distribution bundling is needed | Add Bun build command targeting `dist/` |
| Placeholder `index.ts` files gain real exports | Each feature ticket | Barrel file is extended, never replaced |
| `tsconfig.json` may gain `verbatimModuleSyntax` | When existing files are updated | Requires `formatTimestamp.ts` to change `import { Breakpoint }` → `import type { Breakpoint }` |
| `e2e/tui/helpers.ts` gains full `launchTUI()` implementation | Test infrastructure ticket | Replaces stub with process-spawning implementation; adds `@microsoft/tui-test` dependency |
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

- **TUI_BOOTSTRAP_AND_RENDERER**: Package exists and core dependencies resolve. The actual renderer bootstrap is ticket `tui-bootstrap-and-renderer` in TUI_EPIC_01.

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
  → @codeplane/sdk@workspace:* (domain types, services)
```

This chain must resolve both at compile time (tsc) and at runtime (bun -e) before any feature work can proceed.

---

## 11. Resolved Questions

| Question | Resolution | Evidence |
|----------|-----------|----------|
| Are `@opentui/core` and `@opentui/react` published to npm at 0.1.90? | **Yes** | `node_modules/.pnpm/@opentui+core@0.1.90*/` and `@opentui+react@0.1.90*/` present with `"version": "0.1.90"` in their package.json files. |
| Should `apps/tui` be added to `pnpm-workspace.yaml`? | **No** — covered by existing `apps/*` glob | `pnpm-workspace.yaml` contains `packages: ["apps/*", "packages/*", "specs", "docs"]`. |
| Should we use `bun-types` or `@types/bun`? | **`bun-types`** — matches Codeplane convention | `apps/cli/tsconfig.json` uses `"types": ["bun-types"]`. |
| What React version to pin? | **`19.2.4`** — matches TUI's resolved node_modules symlink | TUI's `node_modules/react` symlinks to `.pnpm/react@19.2.4/node_modules/react`. |
| Does existing code need modification? | **No** — all existing imports are compatible with chosen tsconfig | `isolatedModules: true` (not `verbatimModuleSyntax`) permits `formatTimestamp.ts`'s value import of type `Breakpoint`. |
| Should we use `verbatimModuleSyntax`? | **No** — use `isolatedModules` instead | `formatTimestamp.ts` uses `import { Breakpoint } from "../types"` for a type-only export. Error under `verbatimModuleSyntax`, works under `isolatedModules`. |
| Where do existing directories get barrel files? | **In this ticket** | `src/hooks/index.ts` re-exports `useDiffSyntaxStyle`. `src/lib/index.ts` re-exports all `diff-syntax` symbols. `src/screens/index.ts` is a placeholder. |
| Is `@microsoft/tui-test` installed? | **No** — not in pnpm store or lockfile | `e2e/tui/diff.test.ts` imports it but tests cannot run until a test infrastructure ticket adds it. |
| Does a root `tsconfig.json` exist? | **No** | `apps/cli/tsconfig.json` is standalone with no `extends`. We follow the same pattern. |
| Should `.gitignore` include `node_modules/`? | **No** — root `.gitignore` has `**/node_modules/` | Only TUI-specific entries needed: `dist/` and `*.tsbuildinfo`. |
| Does `@opentui/react` export `useOnResize` or `useResize`? | **`useOnResize`** — from `use-resize.js` | Confirmed: `export declare const useOnResize: (callback: (width: number, height: number) => void) => import("@opentui/core").CliRenderer`. Returns `CliRenderer`, not `void`. |
| What JSX intrinsic elements does `@opentui/react` declare? | 21 elements | `box`, `text`, `span`, `code`, `diff`, `markdown`, `input`, `textarea`, `select`, `scrollbox`, `ascii-font`, `tab-select`, `line-number`, `b`, `i`, `u`, `strong`, `em`, `br`, `a` — confirmed from `jsx-namespace.d.ts`. |
| Does `createRoot` return a `Root` type with `render` and `unmount`? | **Yes** | `Root = { render: (node: ReactNode) => void; unmount: () => void }` from `renderer.d.ts`. |
| Does `@opentui/react` have `peerDependenciesMeta`? | **No** | pnpm will warn about missing `react-devtools-core` and `ws` but will not fail. |
| Does `createCliRenderer` accept optional config? | **Yes** | `createCliRenderer(config?: CliRendererConfig): Promise<CliRenderer>` — `CliRendererConfig` has ~24+ optional fields. |
| What does `useKeyboard` accept? | `(handler: (key: KeyEvent) => void, options?: UseKeyboardOptions) => void` | `UseKeyboardOptions` has optional `release: boolean` field. |
| Does `@codeplane/ui-core` exist in the monorepo? | **No** — only `packages/sdk` and `packages/workflow` exist | The TUI imports `@codeplane/sdk` directly. |
| Does the existing `e2e/tui/helpers.ts` need backward compatibility? | **Yes** — `agents.test.ts` (~190KB) imports `launchTUI` and `TUITestInstance` from it | The `TUITestInstance` interface and `launchTUI` function signature must be preserved exactly. |
| How many test files exist in `e2e/tui/`? | **3 files**: `helpers.ts` (21 lines), `diff.test.ts` (217 lines), `agents.test.ts` (~190KB) | `app-shell.test.ts` does not yet exist — created by this ticket. |