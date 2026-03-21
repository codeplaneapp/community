# Implementation Plan: tui-foundation-scaffold

## Overview
This plan scaffolds the foundational `apps/tui` package structure, including the `package.json`, TypeScript configuration, and directory layout. Based on recent codebase research, several files (`e2e/tui/app-shell.test.ts`, `src/hooks/index.ts`, etc.) already exist. We will append to these files rather than overwrite them, ensuring existing navigation features and tests are preserved.

## Step 1: Initialize Core Package Files

**1.1. Create `apps/tui/package.json`**
Create the manifest with exact-pinned runtime dependencies to ensure render stability.

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

**1.2. Create `apps/tui/tsconfig.json`**
Create the TypeScript configuration tailored for Bun, React 19, and the OpenTUI JSX reconciler.

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

**1.3. Create `apps/tui/.gitignore`**
```text
dist/
*.tsbuildinfo
```

## Step 2: Establish Entry Points & Validation

**2.1. Create `apps/tui/src/index.tsx`**
Create the main application entry point with placeholder type imports to prove resolution.

```tsx
/**
 * Codeplane TUI — Entry point
 *
 * Planned bootstrap sequence:
 *   1. Terminal setup
 *   2. Auth token resolution
 *   3. Renderer init
 *   4. Provider stack mount
 *   5. Token validation
 *   6. SSE connection
 *   7. Initial screen render
 */

import type { CliRenderer } from "@opentui/core";
import type { Root } from "@opentui/react";

export type { CliRenderer, Root };
```

**2.2. Create `apps/tui/src/verify-imports.ts`**
Create a compile-time verification file to ensure the full OpenTUI + React dependency chain is intact.

```ts
/**
 * Import verification — proves the dependency chain resolves.
 */
import { createCliRenderer } from "@opentui/core";
import { createRoot, useKeyboard, useTerminalDimensions, useOnResize, useTimeline, useRenderer } from "@opentui/react";

import type { CliRenderer } from "@opentui/core";
import type { Root } from "@opentui/react";

type _AssertRendererReturn = ReturnType<typeof createCliRenderer> extends Promise<CliRenderer> ? true : never;
type _AssertRootReturn = ReturnType<typeof createRoot> extends Root ? true : never;

type _AssertUseKeyboard = typeof useKeyboard extends (...args: any[]) => any ? true : never;
type _AssertUseTerminalDimensions = typeof useTerminalDimensions extends (...args: any[]) => any ? true : never;
type _AssertUseOnResize = typeof useOnResize extends (...args: any[]) => any ? true : never;
type _AssertUseTimeline = typeof useTimeline extends (...args: any[]) => any ? true : never;
type _AssertUseRenderer = typeof useRenderer extends (...args: any[]) => any ? true : never;

void createCliRenderer;
void createRoot;
void useKeyboard;
void useTerminalDimensions;
void useOnResize;
void useTimeline;
void useRenderer;

export type { CliRenderer, Root };
```

## Step 3: Scaffold Directory Structure & Barrels

Existing files (`src/hooks/index.ts`, `src/providers/index.ts`) will be updated safely. Missing files will be created.

**3.1. Update `apps/tui/src/hooks/index.ts`**
Append the diff syntax style export to the existing exports.
```ts
// Append this to the bottom of the file:
export { useDiffSyntaxStyle } from "./useDiffSyntaxStyle.js";
```

**3.2. Update `apps/tui/src/providers/index.ts`**
Append planned provider documentation. Do not remove the existing `NavigationProvider` export.
```ts
// Append this to the top or bottom of the file:
/**
 * Planned providers:
 *   AppContext.Provider, ErrorBoundary, AuthProvider, APIClientProvider, 
 *   SSEProvider, ThemeProvider, KeybindingProvider
 */
```

**3.3. Create `apps/tui/src/components/index.ts`**
```ts
/**
 * Shared TUI components built on OpenTUI primitives.
 */
export {};
```

**3.4. Create `apps/tui/src/theme/index.ts`**
```ts
/**
 * Theme system for the TUI application.
 */
export {};
```

**3.5. Create `apps/tui/src/screens/index.ts`**
```ts
/**
 * Screen components for the TUI application.
 */
export {};
```

**3.6. Create `apps/tui/src/util/index.ts`**
```ts
/**
 * Utility functions for the TUI application.
 */
export {};
```

**3.7. Create `apps/tui/src/lib/index.ts`**
Export existing functions from `diff-syntax.js`. *Note: Omitted `SYNTAX_TOKEN_COUNT` per research findings as it does not exist.* 
```ts
/**
 * Library modules for the TUI application.
 */
export {
  TRUECOLOR_PALETTE,
  ANSI256_PALETTE,
  ANSI16_PALETTE,
  detectColorTier,
  getPaletteForTier,
  resolveFiletype,
  createDiffSyntaxStyle,
  pathToFiletype,
} from "./diff-syntax.js";

export type { ColorTier } from "./diff-syntax.js";
```

## Step 4: Add E2E Structural Tests

We must safely append our dependency and scaffold tests to the existing test files without overwriting the current e2e tests.

**4.1. Update `e2e/tui/helpers.ts`**
Append the CLI process runner helpers to the existing file (which currently just has a `TUITestInstance` stub).
```ts
// Append to e2e/tui/helpers.ts:
import { join } from "node:path";

export const TUI_ROOT = join(import.meta.dir, "../../apps/tui");
export const TUI_SRC = join(TUI_ROOT, "src");
export const BUN = Bun.which("bun") ?? process.execPath;

export async function run(cmd: string[], opts: { cwd?: string; env?: Record<string, string>; timeout?: number } = {}) {
  const proc = Bun.spawn(cmd, {
    cwd: opts.cwd ?? TUI_ROOT,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...(process.env as Record<string, string>), ...opts.env },
  });

  const timeout = opts.timeout ?? 30_000;
  const timer = setTimeout(() => proc.kill(), timeout);

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  clearTimeout(timer);

  return { exitCode, stdout, stderr };
}

export async function bunEval(expression: string) {
  return run([BUN, "eval", expression]);
}
```

**4.2. Update `e2e/tui/app-shell.test.ts`**
Append the `TUI_APP_SHELL — Package scaffold`, `TUI_APP_SHELL — TypeScript compilation`, and `TUI_APP_SHELL — Dependency resolution` `describe` blocks to the bottom of the file.

* The tests should explicitly verify `package.json` exact pins, `tsconfig.json` configurations, and successful `tsc --noEmit` runs.
* The tests will rely on the newly appended `run` and `bunEval` functions from `./helpers.js`.

## Step 5: Verification
1. Run `pnpm install` from monorepo root to ensure `@opentui` resolves.
2. Run `bun run check` inside `apps/tui` to verify zero TS errors across the scaffold.
3. Run `bun test e2e/tui/app-shell.test.ts` to execute both the existing navigation tests and the new structural validation tests.