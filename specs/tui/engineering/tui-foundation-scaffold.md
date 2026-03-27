# Engineering Specification: tui-foundation-scaffold

## Scaffold TUI app package structure, dependencies, and directory layout

**Ticket**: tui-foundation-scaffold
**Type**: Engineering
**Dependencies**: None
**Status**: Implemented ✅
**Feature Group**: TUI_APP_SHELL
**Features touched**: TUI_BOOTSTRAP_AND_RENDERER (partial — package structure only, no runtime behavior)

---

## 1. Summary

This ticket created the foundational `apps/tui` package from scratch. It established the package manifest, TypeScript configuration, and directory layout that all subsequent TUI tickets build upon. The scaffold was the first vertical slice of the TUI codebase, proving that the dependency chain (`@opentui/core` → `@opentui/react` → React 19 → `@codeplane/sdk`) resolves correctly at both compile time and runtime.

The scaffold is **fully implemented and has been extended well beyond its original scope**. The package now contains 75+ source files across 17 directories, a full React 19 provider stack, screen router, theme system, keybinding system, overlay manager, loading states, error boundaries, and responsive layout. The e2e test file `app-shell.test.ts` has grown to 5,438 lines with 476 tests across 53 describe blocks.

This spec documents both the original scaffold requirements (all satisfied) and the current as-built state of the package structure.

---

## 2. Scope

### In scope (original ticket)

1. `apps/tui/package.json` with exact-pinned runtime dependencies and caret-ranged dev dependencies
2. `apps/tui/tsconfig.json` configured for React 19 JSX via `@opentui/react/jsx-runtime`
3. Directory structure: `src/index.tsx`, `src/providers/`, `src/components/`, `src/hooks/`, `src/theme/`, `src/screens/`, `src/util/` — all with barrel `index.ts` files
4. Compile-time import verification file (`src/verify-imports.ts`) proving the full dependency chain
5. Barrel files for pre-existing directories (`src/hooks/`, `src/lib/`, `src/screens/`) that re-export existing symbols
6. Verification that `pnpm install` succeeds from monorepo root
7. Verification that `tsc --noEmit` passes with zero errors
8. Verification that `@opentui/core` `createCliRenderer` and `@opentui/react` `createRoot` are importable
9. Test helpers in `e2e/tui/helpers.ts`
10. `e2e/tui/app-shell.test.ts` with structural and dependency verification tests

### Out of scope (original ticket — now implemented by subsequent tickets)

- Terminal setup (alternate screen, raw mode, cursor hide) — **now implemented** in `src/lib/terminal.ts`
- React component tree mounting via `createRoot` — **now implemented** in `src/index.tsx`
- Provider hierarchy — **now implemented** (8 providers in `src/providers/`)
- Visual rendering, layout, keyboard handling — **now implemented**
- SSE, auth, API client setup — **now implemented** as provider stubs

---

## 3. Current Codebase Inventory

### 3.1 Package configuration

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
    "check": "tsc --noEmit",
    "test:e2e": "bun test ../../e2e/tui/ --timeout 30000"
  },
  "dependencies": {
    "@opentui/core": "0.1.90",
    "@opentui/react": "0.1.90",
    "react": "19.2.4",
    "@codeplane/sdk": "workspace:*"
  },
  "devDependencies": {
    "@microsoft/tui-test": "^0.0.3",
    "typescript": "^5",
    "@types/react": "^19.0.0",
    "bun-types": "^1.3.11"
  }
}
```

**Key design decisions**:

| Decision | Rationale |
|----------|----------|
| `"name": "@codeplane/tui"` | Scoped to match `@codeplane/sdk` convention |
| `"private": true` | App, not a published package — prevents accidental `npm publish` |
| `"type": "module"` | All Codeplane packages use ES modules; required by `@opentui/core` and `@opentui/react` |
| `"main": "src/index.tsx"` | Bun runs TypeScript directly — no compilation step |
| `@opentui/core` at `0.1.90` | Exact-pinned per architecture principle: "Pin exact versions for rendering-critical dependencies" |
| `@opentui/react` at `0.1.90` | Exact-pinned; exports `createRoot`, reconciler hooks, JSX runtime types |
| `react` at `19.2.4` | Exact-pinned to match resolved version; prevents duplicate React copies |
| `@codeplane/sdk` at `workspace:*` | Standard monorepo workspace reference |
| `@microsoft/tui-test` at `^0.0.3` | Installed as dev dependency; powers real PTY-based E2E tests |
| Dev deps use caret ranges | Acceptable for non-rendering-critical dependencies |
| `test:e2e` script | Runs all e2e/tui/ tests with 30s timeout |

### 3.2 TypeScript configuration

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

**Key design decisions**:

| Decision | Rationale |
|----------|----------|
| `jsx: "react-jsx"` + `jsxImportSource: "@opentui/react"` | OpenTUI JSX elements type-check as valid intrinsic elements (21 components: `box`, `text`, `scrollbox`, `code`, `diff`, `markdown`, `input`, etc.) |
| `lib: ["ESNext"]` — no `"DOM"` | Terminal app — including DOM types would allow accidental use of `window`, `document` |
| `isolatedModules: true` — NOT `verbatimModuleSyntax` | Existing `formatTimestamp.ts` uses `import { Breakpoint }` for a type-only export; `verbatimModuleSyntax` would error |
| `moduleResolution: "bundler"` | Supports mixed import patterns — `.js` extensions and extensionless imports |
| `types: ["bun-types"]` | Provides Bun globals (`Bun.spawn`, `Bun.file`, `process`, `import.meta`) |
| `paths: { "@/*": ["./src/*"] }` | Path alias for cleaner imports; Bun supports tsconfig paths natively |
| `noUnusedLocals: false` | Permissive during active development |
| `moduleDetection: "force"` | Forces all `.ts`/`.tsx` files to be treated as modules regardless of content |
| No `extends` | No shared root tsconfig; follows `apps/cli` standalone pattern |

### 3.3 Source directory structure (as-built)

```
apps/tui/
├── package.json
├── tsconfig.json
├── .gitignore
└── src/
    ├── index.tsx                          # Entry point — full bootstrap with provider stack
    ├── verify-imports.ts                  # Runtime import verification script
    ├── commands/                          # Command palette commands (directory exists)
    ├── components/                        # 13 shared UI components
    │   ├── index.ts                       # Barrel: AppShell, HeaderBar, StatusBar, ErrorBoundary, etc.
    │   ├── AppShell.tsx                   # Root layout: header + content + status bar
    │   ├── HeaderBar.tsx                  # Breadcrumb navigation, repo context, badges
    │   ├── StatusBar.tsx                  # Keybinding hints, sync status, notification count
    │   ├── ErrorBoundary.tsx              # React error boundary with recovery UI
    │   ├── ErrorScreen.tsx                # Generic error display
    │   ├── FullScreenError.tsx            # Full-screen error with retry/quit
    │   ├── FullScreenLoading.tsx          # Full-screen loading spinner
    │   ├── TerminalTooSmallScreen.tsx     # "Terminal too small" message
    │   ├── GlobalKeybindings.tsx          # Global keybinding registration
    │   ├── AuthErrorScreen.tsx            # Authentication error display
    │   ├── AuthLoadingScreen.tsx          # Auth loading state
    │   ├── ActionButton.tsx               # Pressable action button
    │   ├── SkeletonList.tsx               # List loading skeleton
    │   ├── SkeletonDetail.tsx             # Detail loading skeleton
    │   ├── PaginationIndicator.tsx        # "Loading more..." indicator
    │   ├── OverlayLayer.tsx               # Overlay rendering layer
    │   └── __test__/
    │       └── TestCrashHook.tsx          # Test utility for error boundary
    ├── deep-link/                         # Deep link utilities (directory exists)
    ├── providers/                         # 8 React context providers + 3 supporting modules
    │   ├── index.ts                       # Barrel: all providers + context types
    │   ├── ThemeProvider.tsx              # Color tokens via useTheme()
    │   ├── NavigationProvider.tsx         # Stack-based navigation
    │   ├── SSEProvider.tsx                # SSE connection management
    │   ├── AuthProvider.tsx               # Token resolution + validation
    │   ├── APIClientProvider.tsx          # Configured HTTP client
    │   ├── LoadingProvider.tsx            # Loading state management
    │   ├── KeybindingProvider.tsx         # Keybinding priority dispatch
    │   ├── OverlayManager.tsx             # Modal/overlay state management
    │   ├── keybinding-types.ts            # Keybinding scope/handler types
    │   ├── overlay-types.ts               # Overlay type definitions
    │   └── normalize-key.ts              # Key event normalization
    ├── hooks/                             # 17+ custom hooks
    │   ├── index.ts                       # Barrel: all hooks (25+ exports)
    │   ├── useTheme.ts                    # Theme token access
    │   ├── useColorTier.ts                # Color tier detection hook
    │   ├── useDiffSyntaxStyle.ts          # Diff syntax highlighting
    │   ├── useSpinner.ts                  # ASCII spinner animation
    │   ├── useLayout.ts                   # Terminal dimensions + breakpoint
    │   ├── useNavigation.ts               # Navigation stack access (re-export)
    │   ├── useAuth.ts                     # Auth state access
    │   ├── useLoading.ts                  # Global loading state
    │   ├── useScreenLoading.ts            # Per-screen loading state
    │   ├── useOptimisticMutation.ts       # Optimistic update pattern
    │   ├── usePaginationLoading.ts        # Pagination loading state
    │   ├── useBreakpoint.ts               # Breakpoint detection
    │   ├── useResponsiveValue.ts          # Breakpoint-conditional values
    │   ├── useSidebarState.ts             # Sidebar toggle state
    │   ├── useStatusBarHints.ts           # Context-sensitive hints
    │   ├── useScreenKeybindings.ts        # Per-screen keybinding registration
    │   ├── useGlobalKeybindings.ts        # Global keybinding registration
    │   ├── useOverlay.ts                  # Overlay state hook
    │   └── __tests__/
    │       └── useSpinner.test.ts
    ├── theme/                             # Theme system
    │   ├── index.ts                       # Barrel: detection + tokens + palettes
    │   ├── detect.ts                      # Color capability detection
    │   └── tokens.ts                      # Semantic color token definitions
    ├── screens/                           # Screen components
    │   ├── index.ts                       # Barrel (currently empty: `export {}`)
    │   ├── PlaceholderScreen.tsx           # Generic placeholder for unimplemented screens
    │   └── Agents/
    │       ├── types.ts                   # Agent message types
    │       ├── components/
    │       │   ├── index.ts               # Barrel: MessageBlock, ToolBlock
    │       │   ├── MessageBlock.tsx        # Stub
    │       │   └── ToolBlock.tsx           # Stub
    │       └── utils/
    │           └── formatTimestamp.ts      # Breakpoint-aware timestamp formatting
    ├── router/                            # Screen routing system
    │   ├── index.ts                       # Barrel: ScreenRouter, registry, types
    │   ├── ScreenRouter.tsx               # Stack-based screen router
    │   ├── registry.ts                    # Screen name → component registry
    │   └── types.ts                       # ScreenName enum, ScreenEntry, ScreenDefinition
    ├── lib/                               # Library modules
    │   ├── index.ts                       # Barrel: diff-syntax + utilities
    │   ├── diff-syntax.ts                 # Diff syntax highlighting: 3 palettes
    │   ├── crash-loop.ts                  # Crash loop detection
    │   ├── logger.ts                      # Structured logging
    │   ├── normalize-error.ts             # Error normalization
    │   ├── signals.ts                     # Signal handler registration
    │   ├── telemetry.ts                   # Telemetry stubs
    │   └── terminal.ts                    # TTY assertion, CLI arg parsing
    ├── util/                              # Utilities
    │   ├── index.ts                       # Barrel: text, format, constants
    │   ├── text.ts                        # Text wrapping utilities
    │   ├── truncate.ts                    # String truncation
    │   ├── format.ts                      # Formatting helpers
    │   └── constants.ts                   # Terminal dimensions, timeouts
    ├── loading/                           # Loading state system
    │   ├── index.ts                       # Barrel: types + constants
    │   ├── types.ts                       # Loading state type definitions
    │   └── constants.ts                   # Loading defaults
    ├── navigation/                        # Navigation utilities
    │   ├── index.ts                       # Barrel: goToBindings, deepLinks
    │   ├── deepLinks.ts                   # Deep link → initial stack builder
    │   └── goToBindings.ts                # Go-to mode key bindings
    └── types/                             # Shared type definitions
        ├── index.ts                       # Barrel: getBreakpoint, Breakpoint
        └── breakpoint.ts                  # Breakpoint type + detection function
```

**Total source files**: 75+ files across 17 directories.

### 3.4 Entry point (as-built)

**File**: `apps/tui/src/index.tsx` (107 lines)

The entry point implements the full bootstrap sequence:

1. **Shebang**: `#!/usr/bin/env bun` — makes the file directly executable
2. **TTY assertion**: `assertTTY()` verifies terminal is a TTY via `lib/terminal.js`
3. **CLI argument parsing**: `parseCLIArgs(process.argv.slice(2))` handles `--screen`, `--repo`, `--token`, `--api-url`, `--debug`
4. **Renderer creation**: `createCliRenderer({ exitOnCtrlC: false })` from `@opentui/core` — returns a `Promise<CliRenderer>` (awaited at top-level)
5. **Signal handlers**: `registerSignalHandlers(renderer)` for SIGINT/SIGTERM
6. **Deep link resolution**: `buildInitialStack()` converts CLI args to navigation stack entries
7. **Root creation**: `createRoot(renderer)` from `@opentui/react`
8. **App component**: React function component with `navResetKey` state for error recovery, `screenRef` for crash reporting, and `noColor` env detection
9. **Full provider stack** (11-level nesting):
   ```
   ErrorBoundary
     → ThemeProvider
       → KeybindingProvider
         → OverlayManager
           → AuthProvider (token, apiUrl from CLI args)
             → APIClientProvider
               → SSEProvider
                 → NavigationProvider (key=navResetKey, initialStack)
                   → LoadingProvider
                     → GlobalKeybindings
                       → AppShell
                         → ScreenRouter
   ```
10. **Root render**: `root.render(<App />)`
11. **Debug output**: Optional structured JSON to stderr when `--debug` is passed

### 3.5 Import verification (as-built)

**File**: `apps/tui/src/verify-imports.ts` (9 lines)

Runtime verification script that validates the dependency chain:

```ts
import { createCliRenderer } from "@opentui/core";
import { createRoot, useKeyboard, useTerminalDimensions, useOnResize } from "@opentui/react";
import React from "react";

console.log("@opentui/core:", typeof createCliRenderer);
console.log("@opentui/react:", typeof createRoot);
console.log("react:", React.version);
console.log("hooks:", [typeof useKeyboard, typeof useTerminalDimensions, typeof useOnResize].join(","));
console.log("ok");
```

Used by `bunEval()` in tests to verify runtime import resolution. Outputs `typeof` of each critical import followed by `"ok"` if all imports resolve.

### 3.6 `.gitignore`

**File**: `apps/tui/.gitignore`

```
dist/
*.tsbuildinfo
```

Only TUI-specific entries. `node_modules/` covered by root `.gitignore`.

---

## 4. Implementation Plan

The scaffold was implemented in the following vertical steps. Each step produces a verifiable result.

### Step 1: Create `apps/tui/package.json`

**File**: `apps/tui/package.json`

- Declares `@codeplane/tui` as a private ESM package
- Exact-pins rendering-critical deps: `@opentui/core@0.1.90`, `@opentui/react@0.1.90`, `react@19.2.4`
- Workspace reference: `@codeplane/sdk@workspace:*`
- Dev dependencies: `@microsoft/tui-test@^0.0.3`, `typescript@^5`, `@types/react@^19.0.0`, `bun-types@^1.3.11`
- Scripts: `dev` (run entry point), `check` (`tsc --noEmit`), `test:e2e` (run e2e test suite)
- **Verification**: `pnpm install` from monorepo root exits 0; `apps/tui` recognized as workspace package via `apps/*` glob in `pnpm-workspace.yaml`

### Step 2: Create `apps/tui/tsconfig.json`

**File**: `apps/tui/tsconfig.json`

- JSX configured for OpenTUI: `jsxImportSource: "@opentui/react"`, `jsx: "react-jsx"`
- Bun target: `ESNext` lib/target/module, `bun-types` in `types`
- No DOM lib (terminal app)
- `isolatedModules: true` (not `verbatimModuleSyntax`) for compatibility with existing `formatTimestamp.ts`
- `moduleResolution: "bundler"` for mixed `.js`/extensionless imports
- `moduleDetection: "force"` so all files are treated as modules
- Path alias: `@/*` → `./src/*`
- Includes only `src/**/*.ts` and `src/**/*.tsx`
- **Verification**: `tsc --noEmit` passes with zero errors

### Step 3: Create directory structure with barrel files

All directories were created with `index.ts` barrel files:

| Directory | File | Purpose | Initial State |
|-----------|------|---------|---------------|
| `src/` | `index.tsx` | Entry point | Type-only imports (placeholder), evolved to full bootstrap |
| `src/providers/` | `index.ts` | Provider barrel | Empty export, now exports 8 providers + types |
| `src/components/` | `index.ts` | Component barrel | Empty export, now exports 13 components |
| `src/hooks/` | `index.ts` | Hook barrel | Re-exports `useDiffSyntaxStyle`, now exports 17+ hooks + constants |
| `src/theme/` | `index.ts` | Theme barrel | Empty export, now exports detection + tokens + palettes |
| `src/screens/` | `index.ts` | Screen barrel | Empty export, still `export {}` |
| `src/lib/` | `index.ts` | Library barrel | Re-exports `diff-syntax` symbols, now exports 8 modules |
| `src/util/` | `index.ts` | Utility barrel | Empty export, now exports text/format/constants |

**Subsequent tickets added these directories** (all following the same barrel pattern):

| Directory | Added by | Contains |
|-----------|----------|----------|
| `src/router/` | Screen router ticket | `ScreenRouter.tsx`, `registry.ts`, `types.ts` |
| `src/loading/` | Loading states ticket | `types.ts`, `constants.ts` |
| `src/navigation/` | Navigation ticket | `deepLinks.ts`, `goToBindings.ts` |
| `src/types/` | Breakpoint ticket | `breakpoint.ts` |
| `src/commands/` | Command palette ticket | (directory exists) |
| `src/deep-link/` | Deep link ticket | (directory exists) |

### Step 4: Create import verification file

**File**: `apps/tui/src/verify-imports.ts`

Runtime script that `console.log`s the typeof of each critical import:
- `createCliRenderer` from `@opentui/core` — must be `"function"`
- `createRoot`, `useKeyboard`, `useTerminalDimensions`, `useOnResize` from `@opentui/react` — must be `"function"`
- `React.version` from `react` — must start with `"19."`

Used by `bunEval()` in tests to verify runtime import resolution without needing a real terminal.

### Step 5: Create `.gitignore`

**File**: `apps/tui/.gitignore`

TUI-specific ignores: `dist/` and `*.tsbuildinfo`.

### Step 6: Run `pnpm install` and verify

- `apps/tui` recognized via `apps/*` glob in `pnpm-workspace.yaml`
- All npm dependencies resolve from pnpm store
- `@codeplane/sdk` resolves via workspace protocol to `packages/sdk/`
- Exit code 0

### Step 7: Run `tsc --noEmit` and verify

- Zero errors, zero warnings, exit code 0
- Proves: tsconfig valid, JSX runtime types resolve, all source files compile, dependency chain resolves

---

## 5. File Manifest

### Files created by the original scaffold ticket

| File | Purpose | Lines (approx) |
|------|---------|----------------|
| `apps/tui/package.json` | Package manifest with pinned dependencies | 24 |
| `apps/tui/tsconfig.json` | TypeScript config for React 19 + OpenTUI JSX | 30 |
| `apps/tui/.gitignore` | Ignore dist, tsbuildinfo | 2 |
| `apps/tui/src/index.tsx` | Entry point (now full bootstrap) | 107 |
| `apps/tui/src/verify-imports.ts` | Runtime import verification | 9 |
| `apps/tui/src/providers/index.ts` | Provider barrel | varies |
| `apps/tui/src/components/index.ts` | Component barrel | varies |
| `apps/tui/src/hooks/index.ts` | Hook barrel | varies |
| `apps/tui/src/theme/index.ts` | Theme barrel | varies |
| `apps/tui/src/screens/index.ts` | Screen barrel | varies |
| `apps/tui/src/lib/index.ts` | Library barrel | varies |
| `apps/tui/src/util/index.ts` | Utility barrel | varies |

**Total scaffold files**: 12 files under `apps/tui/`.

### Current total file inventory

| Category | File Count | Directory |
|----------|------------|----------|
| Configuration | 3 | `apps/tui/` (package.json, tsconfig.json, .gitignore) |
| Source files | 75+ | `apps/tui/src/` (across 17 directories) |
| Barrel files | 14 | `apps/tui/src/*/index.ts` |
| Test files | 7 | `e2e/tui/` |

### Test files (current)

| File | Purpose | Size |
|------|---------|------|
| `e2e/tui/helpers.ts` | Test infrastructure: `TUITestInstance`, `launchTUI`, `run`, `bunEval`, key resolution, credential store | 492 lines |
| `e2e/tui/app-shell.test.ts` | Scaffold + theme + layout + keybinding + router + auth + loading + overlay tests | 5,438 lines |
| `e2e/tui/diff.test.ts` | Diff syntax highlighting tests | 8.6 KB |
| `e2e/tui/agents.test.ts` | Agent session tests | 190.8 KB |
| `e2e/tui/keybinding-normalize.test.ts` | Key normalization tests | 2.8 KB |
| `e2e/tui/util-text.test.ts` | Text utility tests | 15.7 KB |
| `e2e/tui/bunfig.toml` | Bun test configuration (`timeout = 30000`) | 23 B |

---

## 6. Unit & Integration Tests

### 6.1 Test infrastructure

**File**: `e2e/tui/helpers.ts` (492 lines)

The helpers file provides comprehensive test infrastructure for all TUI E2E tests.

**Constants**:

| Constant | Value | Purpose |
|----------|-------|--------|
| `TUI_ROOT` | Absolute path to `apps/tui` | Package root for file assertions |
| `TUI_SRC` | `TUI_ROOT/src` | Source root for file assertions |
| `TUI_ENTRY` | `TUI_SRC/index.tsx` | Entry point for process spawning |
| `BUN` | `Bun.which("bun") ?? process.execPath` | Subprocess execution |
| `API_URL` | `http://localhost:3000` (env override via `API_URL`) | Test API server |
| `WRITE_TOKEN` | `codeplane_deadbeef...` (env override via `CODEPLANE_WRITE_TOKEN`) | Auth token for write tests |
| `READ_TOKEN` | `codeplane_feedface...` (env override via `CODEPLANE_READ_TOKEN`) | Auth token for read tests |
| `OWNER` | `alice` (env override via `CODEPLANE_E2E_OWNER`) | Default repo owner |
| `ORG` | `acme` (env override via `CODEPLANE_E2E_ORG`) | Default organization |
| `TERMINAL_SIZES` | `{ minimum: {80×24}, standard: {120×40}, large: {200×60} }` | Design spec breakpoints |
| `DEFAULT_WAIT_TIMEOUT_MS` | `10000` | Text wait timeout |
| `DEFAULT_LAUNCH_TIMEOUT_MS` | `15000` | Process launch timeout |
| `POLL_INTERVAL_MS` | `100` | Text polling interval |

**Interfaces**:

```typescript
interface TUITestInstance {
  sendKeys(...keys: string[]): Promise<void>;    // Send key sequence via PTY
  sendText(text: string): Promise<void>;          // Send literal text
  waitForText(text: string, timeoutMs?: number): Promise<void>;    // Poll for text appearance
  waitForNoText(text: string, timeoutMs?: number): Promise<void>;  // Poll for text disappearance
  snapshot(): string;                              // Full terminal buffer capture
  getLine(lineNumber: number): string;            // Single line (0-indexed)
  resize(cols: number, rows: number): Promise<void>;  // Resize virtual terminal
  terminate(): Promise<void>;                      // Kill process and cleanup
  rows: number;                                    // Current terminal height (getter)
  cols: number;                                    // Current terminal width (getter)
}

interface LaunchTUIOptions {
  cols?: number;              // Default: 120 (standard.width)
  rows?: number;              // Default: 40 (standard.height)
  env?: Record<string, string>;  // Additional env vars
  args?: string[];            // CLI arguments
  launchTimeoutMs?: number;   // Default: 15000
}
```

**Helper functions**:

| Function | Signature | Purpose |
|----------|----------|--------|
| `createTestCredentialStore` | `(token?: string) → { path, token, cleanup }` | Creates isolated temp credential file with JSON structure `{ version: 1, tokens: [{ host, token, created_at }] }` |
| `createMockAPIEnv` | `(options?) → Record<string, string>` | Returns env vars for `CODEPLANE_API_URL`, `CODEPLANE_TOKEN`, optional `CODEPLANE_DISABLE_SSE` |
| `resolveKey` | `(key: string) → ResolvedKey` | Maps human-readable keys (Enter, Escape, Tab, arrows, F1-F12, ctrl/shift/alt combos) to `@microsoft/tui-test` terminal events. Returns either `KeyAction` (type="press") or `SpecialKeyAction` (type="special" for arrow keys and ctrl+c/ctrl+d) |
| `launchTUI` | `(options?) → Promise<TUITestInstance>` | Spawns real TUI process via `@microsoft/tui-test`'s `spawn()` from `lib/terminal/term.js` using `Shell.Bash`. Creates isolated config dir, deterministic env (TERM=xterm-256color, COLORTERM=truecolor, LANG=en_US.UTF-8), 500ms startup delay. Uses `getViewableBuffer()` for screen capture |
| `run` | `(cmd[], opts?) → Promise<{ exitCode, stdout, stderr }>` | Subprocess execution via `Bun.spawn` with 30s default timeout and kill-on-timeout |
| `bunEval` | `(expression: string) → Promise<{ exitCode, stdout, stderr }>` | Runs `bun -e` expression in TUI package context (cwd=TUI_ROOT) |
| `sleep` | `(ms: number) → Promise<void>` | Async delay helper |

**Backward compatibility**: `TUITestInstance` interface and `launchTUI` function signatures are stable — `agents.test.ts`, `diff.test.ts`, and all other test files import from this file.

### 6.2 Test specification

**File**: `e2e/tui/app-shell.test.ts` (5,438 lines, 476 tests, 53 describe blocks)

#### Original scaffold tests (first 4 describe blocks)

##### describe: "TUI_APP_SHELL — Package scaffold" (21 tests)

| Test Name | Assertion Type | What It Verifies |
|-----------|---------------|------------------|
| `package.json exists and declares correct name` | File read + JSON parse | `name === "@codeplane/tui"`, `type === "module"`, `private === true` |
| `package.json pins @opentui/core at exact version` | String equality | `dependencies["@opentui/core"] === "0.1.90"` (no `^` or `~`) |
| `package.json pins @opentui/react at exact version` | String equality | `dependencies["@opentui/react"] === "0.1.90"` (no `^` or `~`) |
| `package.json pins react 19.x at exact version` | Regex match | `dependencies.react` matches `/^19\.\d+\.\d+$/` |
| `package.json declares @codeplane/sdk workspace dependency` | String equality | `dependencies["@codeplane/sdk"] === "workspace:*"` |
| `package.json has typescript dev dependency` | Existence | `devDependencies.typescript` is defined |
| `package.json has @types/react dev dependency` | Existence | `devDependencies["@types/react"]` is defined |
| `package.json has bun-types dev dependency` | Existence | `devDependencies["bun-types"]` is defined |
| `package.json has check script that runs tsc --noEmit` | String equality | `scripts.check === "tsc --noEmit"` |
| `tsconfig.json exists and configures OpenTUI JSX import source` | String contains | Content contains `jsxImportSource`, `@opentui/react`, `react-jsx` |
| `tsconfig.json configures bun-types` | String contains | Content contains `bun-types` |
| `tsconfig.json does not include DOM lib` | Negative match | Content does NOT contain `"DOM"` |
| `tsconfig.json uses isolatedModules for Bun compatibility` | String contains | Content contains `isolatedModules` |
| `entry point exists at src/index.tsx` | File existence | `existsSync(TUI_SRC + "/index.tsx")` |
| `verify-imports.ts exists for dependency chain validation` | File existence | `existsSync(TUI_SRC + "/verify-imports.ts")` |
| `providers directory exists with barrel export` | File existence | `src/providers/index.ts` exists |
| `components directory exists with barrel export` | File existence | `src/components/index.ts` exists |
| `hooks directory exists with barrel export` | File existence | `src/hooks/index.ts` exists |
| `theme directory exists with barrel export` | File existence | `src/theme/index.ts` exists |
| `screens directory exists with barrel export` | File existence | `src/screens/index.ts` exists |
| `lib directory exists with barrel export` | File existence | `src/lib/index.ts` exists |
| `util directory exists with barrel export` | File existence | `src/util/index.ts` exists |

##### describe: "TUI_APP_SHELL — TypeScript compilation" (3 tests)

| Test Name | Assertion Type | What It Verifies |
|-----------|---------------|------------------|
| `tsc --noEmit passes with zero errors` | Process exit code | `bun run check` exits 0 (30s timeout) |
| `existing diff-syntax code compiles under new tsconfig` | Process exit code | Same compilation pass (validates backward compat) |
| `existing Agent screen code compiles under new tsconfig` | Process exit code | Same compilation pass (validates backward compat) |

##### describe: "TUI_APP_SHELL — Dependency resolution" (7 tests)

| Test Name | Assertion Type | What It Verifies |
|-----------|---------------|------------------|
| `@opentui/core is resolvable at runtime` | `bunEval` stdout | Dynamic import of `@opentui/core` succeeds, outputs `"ok"` |
| `@opentui/react is resolvable at runtime` | `bunEval` stdout | Dynamic import of `@opentui/react` succeeds, outputs `"ok"` |
| `createCliRenderer is importable from @opentui/core and is a function` | `bunEval` stdout | `typeof createCliRenderer === 'function'`, outputs `"function"` |
| `createRoot is importable from @opentui/react and is a function` | `bunEval` stdout | `typeof createRoot === 'function'`, outputs `"function"` |
| `OpenTUI React hooks are importable` | `bunEval` stdout | `useKeyboard`, `useTerminalDimensions`, `useOnResize`, `useTimeline`, `useRenderer` all `typeof === 'function'` |
| `react 19.x is resolvable with correct major version` | `bunEval` stdout regex | `React.version` starts with `"19."` |
| `@codeplane/sdk is resolvable via workspace protocol` | `bunEval` stdout | Dynamic import succeeds, outputs `"ok"` |

##### describe: "TUI_APP_SHELL — E2E test infrastructure" (8 tests)

| Test Name | Assertion Type | What It Verifies |
|-----------|---------------|------------------|
| `createTestCredentialStore creates valid credential file` | JSON structure | File contains `version: 1`, `tokens` array, valid `token`, `host` |
| `createTestCredentialStore generates random token when none provided` | Regex match | Token starts with `codeplane_test_` |
| `createTestCredentialStore cleanup removes files` | File nonexistence | File deleted after `cleanup()` call |
| `createMockAPIEnv returns correct default values` | Object equality | Default API URL `http://localhost:13370`, token `test-token-for-e2e` |
| `createMockAPIEnv respects custom options` | Object equality | Custom URL, token, and SSE disable values respected |
| `launchTUI is a function` | typeof check | `typeof launchTUI === 'function'` |
| `@microsoft/tui-test is importable` | `bunEval` stdout | Dynamic import succeeds, outputs `"ok"` |
| `TUITestInstance interface matches expected shape` | Type validation | All 10 members verified: `sendKeys`, `sendText`, `waitForText`, `waitForNoText`, `snapshot`, `getLine`, `resize`, `terminate`, `rows`, `cols` |
| `TERMINAL_SIZES matches design.md breakpoints` | Object comparison | minimum=80×24, standard=120×40, large=200×60 |

#### Additional test suites (added by subsequent tickets)

The remaining 49 describe blocks cover features built on top of the scaffold:

| Describe block | Line | Feature area |
|----------------|------|-------------|
| Color capability detection | 317 | `theme/detect.ts` |
| Theme token definitions | 650 | `theme/tokens.ts` |
| ThemeProvider and useTheme hook | 983 | Provider integration |
| useSpinner hook scaffold | 1238 | Loading animation |
| getBreakpoint pure function | 1339 | Responsive breakpoints |
| useLayout computed values | 1433 | Layout dimensions |
| Layout module resolution | 1562 | Import verification |
| Responsive layout E2E | 1658 | PTY-based resize tests |
| TUI_THEME_AND_COLOR_TOKENS — Color Detection | 1797 | Theme E2E |
| TUI_THEME_AND_COLOR_TOKENS — Theme Token Application | 1849 | Theme E2E |
| TUI_THEME_AND_COLOR_TOKENS — NO_COLOR and TERM=dumb | 1925 | Theme E2E |
| TUI_THEME_AND_COLOR_TOKENS — Keyboard Interaction | 1958 | Theme E2E |
| TUI_THEME_AND_COLOR_TOKENS — Responsive Size | 2017 | Theme E2E |
| TUI_THEME_AND_COLOR_TOKENS — Error States | 2092 | Theme E2E |
| TUI_THEME_AND_COLOR_TOKENS — Consistency | 2144 | Theme E2E |
| TUI_THEME_AND_COLOR_TOKENS — Token System Unit Tests | 2221 | Theme unit |
| TUI_ERROR_BOUNDARY (parent) | 2320 | Error recovery |
| TUI_ERROR_BOUNDARY — Snapshot Tests | 2327 | Error snapshots |
| TUI_ERROR_BOUNDARY — Keyboard Interaction Tests | 2480 | Error keys |
| TUI_ERROR_BOUNDARY — Responsive Tests | 2648 | Error responsive |
| TUI_ERROR_BOUNDARY — Crash Loop and Double Fault Tests | 2735 | Crash loop |
| TUI_ERROR_BOUNDARY — Integration Tests | 2770 | Error integration |
| TUI_ERROR_BOUNDARY — Unit Tests (parent) | 2821 | Error unit |
| TUI_ERROR_BOUNDARY — CrashLoopDetector | 2822 | Crash loop unit |
| TUI_ERROR_BOUNDARY — normalizeError | 2876 | Error normalization |
| TUI_AUTH_TOKEN_LOADING (parent) | 2931 | Auth flow |
| TUI_AUTH_TOKEN_LOADING — loading screen | 2935 | Auth loading |
| TUI_AUTH_TOKEN_LOADING — no-token error screen | 2996 | Auth error |
| TUI_AUTH_TOKEN_LOADING — expired-token error screen | 3056 | Auth expired |
| TUI_AUTH_TOKEN_LOADING — offline mode | 3096 | Auth offline |
| TUI_AUTH_TOKEN_LOADING — successful authentication | 3124 | Auth success |
| TUI_AUTH_TOKEN_LOADING — security | 3199 | Auth security |
| TUI_AUTH_TOKEN_LOADING — keyboard interactions | 3222 | Auth keys |
| TUI_AUTH_TOKEN_LOADING — responsive layout | 3328 | Auth responsive |
| TUI_AUTH_TOKEN_LOADING — token resolution edge cases | 3360 | Auth edge cases |
| TUI_LOADING_STATES (parent + 10 sub-describes) | 3390 | Loading/skeleton |
| TUI_SCREEN_ROUTER — navigation stack | 4089 | Navigation |
| TUI_SCREEN_ROUTER — breadcrumb rendering | 4182 | Breadcrumbs |
| TUI_SCREEN_ROUTER — deep link launch | 4229 | Deep links |
| TUI_SCREEN_ROUTER — placeholder screen | 4301 | Placeholder |
| TUI_SCREEN_ROUTER — registry completeness | 4343 | Registry |
| TUI_SCREEN_ROUTER — snapshot tests | 4386 | Router snapshots |
| TUI_SCREEN_ROUTER — go-to context validation | 4436 | Go-to mode |
| KeybindingProvider — Priority Dispatch | 4474 | Keybinding dispatch |
| TUI_APP_SHELL — useBreakpoint hook | 4763 | Responsive hooks |
| TUI_APP_SHELL — useResponsiveValue hook | 4808 | Responsive hooks |
| TUI_APP_SHELL — resolveSidebarVisibility pure function | 4913 | Sidebar |
| TUI_APP_SHELL — useLayout sidebar integration | 5023 | Sidebar integration |
| TUI_APP_SHELL — sidebar toggle E2E | 5094 | Sidebar E2E |
| TUI_OVERLAY_MANAGER — overlay mutual exclusion | 5160 | Overlay |

### 6.3 Test categories

| Category | Count (scaffold only) | Count (total in app-shell.test.ts) | Notes |
|----------|----------------------|-----------------------------------|-------|
| Structural (package/tsconfig/dirs) | 21 | 21 | All original scaffold tests |
| TypeScript compilation | 3 | 3 | `tsc --noEmit` |
| Dependency resolution | 7 | 7 | Runtime import via `bunEval` |
| E2E infrastructure | 9 | 9 | Test helper verification |
| Color/theme | 0 | ~105 | Added by theme ticket |
| Error boundary | 0 | ~50 | Added by error boundary ticket |
| Auth/loading | 0 | ~90 | Added by auth/loading tickets |
| Navigation/router | 0 | ~50 | Added by router ticket |
| Keybinding/overlay | 0 | ~45 | Added by keybinding ticket |
| Responsive layout | 0 | ~50 | Added by layout ticket |
| Sidebar | 0 | ~46 | Added by sidebar ticket |

**Total tests in app-shell.test.ts**: 476 (53 describe blocks across 5,438 lines).

### 6.4 Tests left intentionally failing

Per project policy, tests that fail due to unimplemented backends remain as-is:

- `e2e/tui/diff.test.ts` — imports `createTestTui` from `@microsoft/tui-test` (may have resolution differences)
- `e2e/tui/agents.test.ts` — depends on agent backend and full TUI runtime
- Some E2E tests in `app-shell.test.ts` that launch the TUI process may fail without a running API server

These tests are **never skipped or commented out**. A failing test is a signal, not a problem to hide.

### 6.5 Test execution

```bash
# Run scaffold verification tests only
bun test e2e/tui/app-shell.test.ts -t "Package scaffold" --timeout 30000

# Run all TUI tests
cd apps/tui && bun run test:e2e

# Run with specific test filter
bun test e2e/tui/app-shell.test.ts -t "Dependency resolution" --timeout 30000

# Run TypeScript compilation check
cd apps/tui && bun run check
```

### 6.6 Test configuration

**File**: `e2e/tui/bunfig.toml`

```toml
[test]
timeout = 30000
```

Global test timeout of 30 seconds. This accommodates the TypeScript compilation tests which can take 10-20 seconds on cold cache.

---

## 7. Acceptance Criteria

| # | Criterion | Verification | Status |
|---|-----------|--------------|--------|
| AC-1 | `apps/tui/package.json` exists with `@opentui/core@0.1.90`, `@opentui/react@0.1.90`, `react@19.2.4`, and `@codeplane/sdk@workspace:*` as dependencies | Tests: package.json pins @opentui/core, @opentui/react, react, sdk | ✅ Pass |
| AC-2 | `apps/tui/package.json` has `bun-types`, `@types/react`, `typescript`, and `@microsoft/tui-test` as dev dependencies | Tests: package.json has bun-types, @types/react, typescript | ✅ Pass |
| AC-3 | `apps/tui/tsconfig.json` configures `jsxImportSource: "@opentui/react"` with `jsx: "react-jsx"` | Test: tsconfig.json exists and configures OpenTUI JSX import source | ✅ Pass |
| AC-4 | `apps/tui/tsconfig.json` uses `bun-types`, excludes DOM lib, enables `isolatedModules` | Tests: tsconfig.json configures bun-types, no DOM, isolatedModules | ✅ Pass |
| AC-5 | `apps/tui/src/index.tsx` exists as entry point | Test: entry point exists at src/index.tsx | ✅ Pass |
| AC-6 | All subdirectories exist under `src/` with `index.ts` barrel files: `providers/`, `components/`, `hooks/`, `theme/`, `screens/`, `lib/`, `util/` (plus `router/`, `loading/`, `navigation/`, `types/` added later) | Tests: directory barrel existence checks | ✅ Pass |
| AC-7 | `apps/tui/src/verify-imports.ts` exists with import verification | Test: verify-imports.ts exists | ✅ Pass |
| AC-8 | `pnpm install` succeeds from monorepo root | Manual verification + CI | ✅ Pass |
| AC-9 | `tsc --noEmit` passes with zero errors (all 75+ source files) | Tests: tsc --noEmit passes | ✅ Pass |
| AC-10 | `createCliRenderer` from `@opentui/core` is importable at runtime and is a function | Test: createCliRenderer is importable | ✅ Pass |
| AC-11 | `createRoot` from `@opentui/react` is importable at runtime and is a function | Test: createRoot is importable | ✅ Pass |
| AC-12 | All five OpenTUI React hooks are importable: `useKeyboard`, `useTerminalDimensions`, `useOnResize`, `useTimeline`, `useRenderer` | Test: OpenTUI React hooks are importable | ✅ Pass |
| AC-13 | `react` resolves to version 19.x at runtime | Test: react 19.x is resolvable | ✅ Pass |
| AC-14 | `@codeplane/sdk` resolves via workspace protocol at runtime | Test: @codeplane/sdk is resolvable | ✅ Pass |
| AC-15 | `e2e/tui/helpers.ts` preserves `TUITestInstance` interface and `launchTUI` signature | agents.test.ts/diff.test.ts imports without errors | ✅ Pass |
| AC-16 | `@microsoft/tui-test` is installed and importable | Test: @microsoft/tui-test is importable | ✅ Pass |

---

## 8. Risks and Mitigations

| Risk | Impact | Status | Mitigation |
|------|--------|--------|------------|
| `formatTimestamp.ts` value-imports type `Breakpoint` — incompatible with `verbatimModuleSyntax` | tsc error | **Resolved** | Use `isolatedModules` instead of `verbatimModuleSyntax` |
| Agent component barrel uses extensionless paths while `useDiffSyntaxStyle.ts` uses `.js` | Inconsistent but functional | **Resolved** | Both patterns resolve under `moduleResolution: "bundler"` |
| `@opentui/core@0.1.90` native Zig bindings not available for current platform | Runtime import errors | **Resolved** | Verified: pnpm store contains platform-specific binary |
| React version mismatch → duplicate React copies | "Invalid hook call" errors | **Resolved** | Exact pinning at `19.2.4` matches resolved version |
| `@opentui/react` peer dependency warnings for `react-devtools-core` and `ws` | Noisy install output | **Accepted** | Optional dependencies; informational warnings only |
| `@opentui/core` index.d.ts imports from `bun:ffi` | Potential type errors | **Resolved** | `bun-types` provides declarations; `skipLibCheck: true` as safety net |
| `@codeplane/ui-core` does not exist yet | TUI must use `@codeplane/sdk` directly | **Accepted** | Will add `"@codeplane/ui-core": "workspace:*"` when created |

---

## 9. Productionization Notes

### What this ticket produced

A **scaffolded, type-checking package structure** that has become the permanent foundation of the TUI application. Every file created by this ticket persists and has been extended in-place by subsequent tickets. **Nothing is POC code** — all scaffold artifacts are production code.

### What the scaffold became

The original 12 scaffold files have grown into 75+ source files across 17 directories. The package now contains:

- **Full React 19 application** with 11-level nested provider stack
- **Screen router** with stack-based navigation and 15+ registered screens
- **Theme system** with 3-tier color detection (truecolor, ansi256, ansi16)
- **Keybinding system** with priority dispatch and go-to mode
- **Overlay manager** for command palette, help, and modals
- **Loading state system** with screen-level and pagination loading
- **Error boundary** with crash loop detection and recovery UI
- **Auth provider** with token resolution and validation
- **Responsive layout** with 3 breakpoints and sidebar toggle

### Dependency version contract

Established by this ticket and enforced by tests:

| Package | Pinned version | Change policy |
|---------|---------------|---------------|
| `@opentui/core` | `0.1.90` | Never bump without re-running all snapshot tests |
| `@opentui/react` | `0.1.90` | Never bump without re-running all snapshot tests |
| `react` | `19.2.4` | Never bump without verifying reconciler compatibility |

### Transition path for remaining items

| What | Status | Next step |
|------|--------|----------|
| `src/verify-imports.ts` | Still present as runtime verification | Retain — it provides a lightweight standalone validation mechanism for CI that is independent of the full bootstrap sequence. Zero maintenance cost. |
| `package.json` gains `@codeplane/ui-core` | Not yet — package doesn't exist | Add `"@codeplane/ui-core": "workspace:*"` when `packages/ui-core` is created |
| `package.json` gains `build` script | Not yet needed | Add when bundling for distribution |
| `tsconfig.json` gains `verbatimModuleSyntax` | Blocked by `formatTimestamp.ts` | Enable after updating `import { Breakpoint }` to `import type { Breakpoint }` in `apps/tui/src/screens/Agents/utils/formatTimestamp.ts` |

### Directory barrel lifecycle

Every `index.ts` barrel file created by this ticket has been populated with real exports:

| Directory | Current exports |
|-----------|----------------|
| `providers/` | 8 providers + context types + utility types: `ThemeProvider`, `ThemeContext`, `ThemeContextValue`, `ThemeProviderProps`, `NavigationProvider`, `NavigationContext`, `useNavigation`, `useScrollPositionCache`, `NavigationProviderProps`, `SSEProvider`, `useSSE`, `SSEEvent`, `AuthProvider`, `AuthContext`, `AuthContextValue`, `AuthProviderProps`, `AuthState`, `AuthSource`, `APIClientProvider`, `useAPIClient`, `LoadingProvider`, `LoadingContext`, `OverlayManager`, `OverlayContext`, `OverlayContextType`, `OverlayState`, `OverlayType`, `ConfirmPayload` |
| `components/` | 13 components: `AppShell`, `HeaderBar`, `StatusBar`, `ErrorBoundary`, `TerminalTooSmallScreen`, `GlobalKeybindings`, `FullScreenLoading`, `FullScreenError`, `SkeletonList`, `SkeletonDetail`, `PaginationIndicator`, `ActionButton`, `OverlayLayer` |
| `hooks/` | 17+ hooks + constants: `useDiffSyntaxStyle`, `useTheme`, `useColorTier`, `useSpinner`, `BRAILLE_FRAMES`, `ASCII_FRAMES`, `BRAILLE_INTERVAL_MS`, `ASCII_INTERVAL_MS`, `useLayout`, `LayoutContext` (type), `useNavigation`, `useAuth`, `useLoading`, `useScreenLoading`, `useOptimisticMutation`, `usePaginationLoading`, `useBreakpoint`, `useResponsiveValue`, `ResponsiveValues` (type), `useSidebarState`, `resolveSidebarVisibility`, `SidebarState` (type) |
| `theme/` | `detectColorCapability`, `detectColorTier` (alias), `isUnicodeSupported`, `ColorTier` (type), `ThemeTokens` (type), `SemanticTokenName` (type), `CoreTokenName` (type), `TextAttribute` (type), `TextAttributes`, `createTheme`, `statusToToken`, `TRUECOLOR_TOKENS`, `ANSI256_TOKENS`, `ANSI16_TOKENS`, `THEME_TOKEN_COUNT` |
| `screens/` | Empty barrel (`export {}`) + `PlaceholderScreen`, `Agents/` subdirectory with `MessageBlock`, `ToolBlock` stubs |
| `lib/` | `TRUECOLOR_PALETTE`, `ANSI256_PALETTE`, `ANSI16_PALETTE`, `detectColorTier`, `getPaletteForTier`, `resolveFiletype`, `createDiffSyntaxStyle`, `pathToFiletype`, `ColorTier` (type) |
| `util/` | `truncateText`, `truncateLeft`, `wrapText`, `formatAuthConfirmation`, `formatErrorSummary`, `truncateBreadcrumb`, `truncateRight`, `fitWidth` + constants: `MIN_COLS`, `MIN_ROWS`, `STANDARD_COLS`, `STANDARD_ROWS`, `LARGE_COLS`, `LARGE_ROWS`, `AUTH_VALIDATION_TIMEOUT_MS`, `MAX_STACK_DEPTH`, `LOADING_TIMEOUT_MS`, `RETRY_DEBOUNCE_MS`, `STATUS_BAR_CONFIRMATION_MS`, `CRASH_LOOP_WINDOW_MS`, `CRASH_LOOP_MAX_RESTARTS` |
| `router/` | `ScreenRouter`, `screenRegistry`, `ScreenName` (enum), `MAX_STACK_DEPTH`, `DEFAULT_ROOT_SCREEN`, `ScreenEntry` (type), `NavigationContext` (type), `ScreenDefinition` (type), `ScreenComponentProps` (type) |
| `loading/` | Types: `ScreenLoadingStatus`, `PaginationStatus`, `ActionStatus`, `ScreenLoadingState`, `MutationState`, `LoadingError`, `LoadingContextValue`, `UseScreenLoadingOptions`, `SkeletonRowConfig` + Constants: `LOADING_TIMEOUT_MS`, `SPINNER_SKIP_THRESHOLD_MS`, `STATUS_BAR_ERROR_DURATION_MS`, `RETRY_DEBOUNCE_MS`, `SKELETON_BLOCK_CHAR`, `SKELETON_DASH_CHAR`, `LOADING_LABEL_PADDING`, `ERROR_SUMMARY_MAX_LENGTH`, `STATUS_BAR_ERROR_PADDING`, `PAGINATION_INDICATOR_PADDING`, `MIN_SAVING_BUTTON_WIDTH` |
| `navigation/` | `goToBindings`, `executeGoTo`, `GoToBinding` (type), `buildInitialStack`, `DeepLinkArgs` (type), `DeepLinkResult` (type) |
| `types/` | `getBreakpoint`, `Breakpoint` (type) |

---

## 10. Relationship to Feature Inventory

This ticket is a prerequisite for **all TUI features** and **all TUI epics** (TUI_EPIC_01 through TUI_EPIC_13).

The dependency chain validated by this ticket:

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
  → @microsoft/tui-test@^0.0.3 (dev: terminal E2E testing)
```

Each layer was verified both at compile time (`tsc --noEmit`) and runtime (`bunEval()` dynamic imports).

---

## 11. Known Discrepancies

| Item | Original spec | Actual (as-built) | Impact | Resolution |
|------|--------------|-------------------|--------|------------|
| `verify-imports.ts` approach | Type-level assertions with `void` expressions | Runtime `console.log` of `typeof` | None — both validate same chain | Simplified approach is more useful for `bunEval()` testing |
| `@microsoft/tui-test` status | "Not yet installed" | Installed at `^0.0.3` in devDependencies | Positive — enables real PTY tests | Full `launchTUI()` implementation in helpers.ts |
| `launchTUI()` status | Stub throwing "Not yet implemented" | Full implementation using `@microsoft/tui-test` PTY | Positive — unblocks E2E tests | Implemented with real terminal emulation via `spawn()` from `lib/terminal/term.js` |
| `test:e2e` script | Not in original spec | Added to package.json | Positive — convenient test execution | `bun test ../../e2e/tui/ --timeout 30000` |
| Additional directories | 7 directories in original scope | 13 directories (added `router/`, `loading/`, `navigation/`, `types/`, `commands/`, `deep-link/`) | None — organic growth | New directories follow same barrel pattern |
| `src/index.tsx` content | Type-only placeholder | Full 107-line bootstrap with provider stack | Expected — subsequent tickets populated it | Entry point evolved as planned |
| Test count | ~32 tests | 476 tests across 53 describe blocks | Expected — test file accumulates as features are built | All tests follow same patterns |
| Source file count | 12 files | 75+ files | Expected — scaffold was extended by subsequent tickets | All new files placed in scaffold directories |
| Components barrel export count | 0 (empty) | 13 components | Expected — components added by feature tickets | Barrel file is the stable public API surface |
| `API_URL` env var name | `CODEPLANE_TEST_API_URL` | `API_URL` | Minor naming difference | Helpers use `process.env.API_URL` with default `http://localhost:3000` |

---

## 12. Resolved Questions

| Question | Resolution | Evidence |
|----------|-----------|----------|
| Are `@opentui/core` and `@opentui/react` published at 0.1.90? | **Yes** | Resolved in `node_modules/.pnpm/` with correct version |
| Should `apps/tui` be added to `pnpm-workspace.yaml`? | **No** — covered by `apps/*` glob | `pnpm-workspace.yaml` contains `packages: ["apps/*", "packages/*", "specs", "docs"]` |
| Should we use `bun-types` or `@types/bun`? | **`bun-types`** | Matches `apps/cli/tsconfig.json` convention |
| What React version to pin? | **`19.2.4`** | Matches resolved `node_modules/react` symlink |
| Should we use `verbatimModuleSyntax`? | **No** — use `isolatedModules` | `formatTimestamp.ts` value-imports type `Breakpoint` |
| Does existing code need modification? | **No** | All imports compatible with chosen tsconfig |
| Is `@microsoft/tui-test` installed? | **Yes** — `^0.0.3` in devDependencies | Verified importable at runtime via `bunEval` |
| Does `@codeplane/ui-core` exist? | **No** — only `packages/sdk` and `packages/workflow` exist | TUI imports `@codeplane/sdk` directly; `ui-core` dependency deferred until package is created |
| Does `createCliRenderer` return a Promise? | **Yes** | `createCliRenderer(config?): Promise<CliRenderer>` — entry point uses `await` |
| Does `createRoot` accept a CliRenderer? | **Yes** | `createRoot(renderer: CliRenderer): Root` |
| What JSX elements does `@opentui/react` declare? | 20 elements | `box`, `text`, `span`, `code`, `diff`, `markdown`, `input`, `textarea`, `select`, `scrollbox`, `ascii-font`, `tab-select`, `line-number`, `b`, `i`, `u`, `strong`, `em`, `br`, `a` |
| What hooks does `@opentui/react` export? | 5 hooks | `useKeyboard`, `useTerminalDimensions`, `useOnResize`, `useTimeline`, `useRenderer` |
| How does `launchTUI` create terminal instances? | Uses `@microsoft/tui-test`'s `spawn()` from `lib/terminal/term.js` + `Shell.Bash` | Implementation creates real PTY with `node-pty`, uses `getViewableBuffer()` for screen capture |
| What key input methods does the test harness support? | `terminal.keyPress()` for standard keys + dedicated methods (`keyUp`, `keyDown`, `keyLeft`, `keyRight`, `keyCtrlC`, `keyCtrlD`) for special keys | `resolveKey()` function dispatches to appropriate method based on key name |