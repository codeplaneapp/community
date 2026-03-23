# Engineering Specification: `tui-color-detection`

## Ticket

**Title:** Implement terminal color capability detection module  
**Type:** Engineering  
**Feature Flag:** `TUI_THEME_AND_COLOR_TOKENS` (within `TUI_APP_SHELL`)  
**Dependency:** `tui-foundation-scaffold` (completed ✅)  

---

## 1. Overview

This ticket implements the color capability detection module at `apps/tui/src/theme/detect.ts`. The module is a pure function module with zero React dependencies and zero API calls. It reads only environment variables and is consumed by ThemeProvider at startup to determine which color tier to use for semantic token resolution.

### Relationship to Existing Code

The codebase already has a `detectColorTier()` function in `apps/tui/src/lib/diff-syntax.ts` (lines 103–121). That function serves diff-specific syntax highlighting. The `apps/tui/src/hooks/useDiffSyntaxStyle.ts` hook imports `detectColorTier` and `ColorTier` from `../lib/diff-syntax.js` and uses them to create a `SyntaxStyle` instance.

The `apps/tui/src/lib/index.ts` barrel re-exports `detectColorTier`, `ColorTier`, and all palette-related symbols from `diff-syntax.js`.

This ticket creates a **canonical, centralized** detection module in the theme directory that:

1. Adds `NO_COLOR` and `TERM=dumb` handling (missing from the existing implementation)
2. Exports a proper `ColorTier` type from the theme module (the current export lives in `lib/diff-syntax.ts`)
3. Adds `isUnicodeSupported()` for spinner/indicator character selection
4. Becomes the single source of truth — existing callers (`lib/diff-syntax.ts`, `hooks/useDiffSyntaxStyle.ts`) will be migrated to re-export from this module in a follow-up ticket

### Current Filesystem State

The `tui-foundation-scaffold` prerequisite is **complete**. The actual `apps/tui/` directory contains:

```
apps/tui/
├── package.json           (@codeplane/tui v0.0.1, react 19.2.4, @opentui 0.1.90)
├── tsconfig.json          (ESNext, jsx: react-jsx, jsxImportSource: @opentui/react)
└── src/
    ├── index.tsx           (TUI entry point)
    ├── verify-imports.ts   (dependency chain validation)
    ├── theme/
    │   └── index.ts        (stub: export {})
    ├── hooks/
    │   ├── index.ts        (re-exports useDiffSyntaxStyle)
    │   └── useDiffSyntaxStyle.ts  (imports from ../lib/diff-syntax.js)
    ├── lib/
    │   ├── index.ts        (re-exports ColorTier, detectColorTier, palettes)
    │   └── diff-syntax.ts  (161 lines — ColorTier type, detectColorTier, palettes, SyntaxStyle)
    ├── screens/
    │   ├── index.ts
    │   └── Agents/
    │       ├── components/  (MessageBlock.tsx, ToolBlock.tsx stubs)
    │       ├── types.ts     (message types)
    │       └── utils/
    │           └── formatTimestamp.ts
    ├── components/
    │   └── index.ts
    ├── providers/
    │   └── index.ts
    └── util/
        └── index.ts
```

**E2E test infrastructure is already in place:**

```
e2e/tui/
├── helpers.ts          (492 lines — TUI_ROOT, TUI_SRC, BUN, run(), bunEval(), launchTUI(), etc.)
├── app-shell.test.ts   (875 lines — scaffold, compilation, dependency, infrastructure, loading, keybinding tests)
├── diff.test.ts        (diff syntax highlighting tests)
└── agents.test.ts      (agent screen tests)
```

**Key observations about the current state:**

- `apps/tui/src/theme/index.ts` exists but is an empty stub (`export {};`)
- `apps/tui/src/theme/detect.ts` does **not** exist — this ticket creates it
- `e2e/tui/helpers.ts` already exists with `run()`, `bunEval()`, `TUI_SRC`, `BUN` exports
- `e2e/tui/app-shell.test.ts` already exists with 5 `describe` blocks — this ticket adds a 6th
- `apps/tui/package.json` and `apps/tui/tsconfig.json` exist (scaffold complete)
- TypeScript strict mode is enabled with `isolatedModules: true`

---

## 2. Implementation Plan

### Step 1: Create `apps/tui/src/theme/detect.ts`

**File:** `apps/tui/src/theme/detect.ts`  
**Action:** Create new file  
**Source blueprint:** `specs/tui/apps/tui/src/theme/detect.ts` (102 lines, verbatim)

This is the primary deliverable. It contains three exports:

#### 1.1 `ColorTier` type export

```typescript
/**
 * Terminal color capability tiers, ordered from most capable to least.
 *
 * - `truecolor`: 24-bit RGB (16.7M colors). Detected via COLORTERM env var.
 * - `ansi256`:   256-color palette. Detected via TERM containing '256color'.
 * - `ansi16`:    Basic 16-color ANSI. Used for constrained/dumb terminals.
 */
export type ColorTier = "truecolor" | "ansi256" | "ansi16";
```

#### 1.2 `detectColorCapability(): ColorTier`

Pure function. No side effects. Reads `process.env` only.

**Detection cascade (order matters — first match wins):**

| Priority | Condition | Result | Rationale |
|----------|-----------|--------|----------|
| 1 | `NO_COLOR` is set and non-empty | `ansi16` | [no-color.org](https://no-color.org/) standard. Returning `ansi16` (not "none") because the TUI still needs some color tokens for structure — it just uses the most constrained palette. |
| 2 | `TERM === 'dumb'` | `ansi16` | Indicates a terminal with minimal capabilities. Checked after NO_COLOR so both paths are independently reachable. |
| 3 | `COLORTERM` is `'truecolor'` or `'24bit'` (case-insensitive) | `truecolor` | Standard env var set by modern terminals (iTerm2, Ghostty, kitty, WezTerm, Windows Terminal, etc.) |
| 4 | `TERM` contains `'256color'` (case-insensitive) | `ansi256` | Common TERM values: `xterm-256color`, `screen-256color`, `tmux-256color` |
| 5 | Default fallback | `ansi256` | Safe default. Most modern terminals support 256 colors even if TERM doesn't explicitly say so. |

**Implementation:**

```typescript
export function detectColorCapability(): ColorTier {
  // Priority 1: Respect NO_COLOR standard.
  // Checked first because it represents explicit user intent
  // to constrain color output, overriding any capability signals.
  const noColor = process.env.NO_COLOR;
  if (noColor !== undefined && noColor !== "") {
    return "ansi16";
  }

  const term = (process.env.TERM ?? "").toLowerCase();
  if (term === "dumb") {
    return "ansi16";
  }

  // Priority 2: Truecolor detection via COLORTERM.
  // Set by iTerm2, Ghostty, kitty, WezTerm, Windows Terminal, etc.
  const colorterm = (process.env.COLORTERM ?? "").toLowerCase();
  if (colorterm === "truecolor" || colorterm === "24bit") {
    return "truecolor";
  }

  // Priority 3: 256-color detection via TERM.
  // Matches xterm-256color, screen-256color, tmux-256color, etc.
  if (term.includes("256color")) {
    return "ansi256";
  }

  // Priority 4: Safe default for unknown terminals.
  // Most modern terminals support 256 colors even without explicit TERM.
  return "ansi256";
}
```

**Design decisions:**

- **`NO_COLOR` checked first, before `COLORTERM`.** A user who sets `NO_COLOR=1` explicitly wants reduced color even if their terminal supports truecolor. This follows the [no-color.org](https://no-color.org/) convention.
- **`NO_COLOR` must be non-empty.** Per the spec, `NO_COLOR` is active when set to any non-empty value. An empty `NO_COLOR=` is treated as unset. We check `!== undefined && !== ""` to handle both.
- **Returns `ansi16`, not a hypothetical `none` tier.** The TUI still needs structural colors (borders, focus indicators). `ansi16` is the most constrained tier that still allows a functional UI.
- **Case-insensitive comparisons.** While `COLORTERM=truecolor` is the convention, some environments set `COLORTERM=TrueColor`. We normalize with `.toLowerCase()`.
- **`TERM=dumb` returns `ansi16`, not `ansi256`.** Dumb terminals (used in CI, Emacs shell, some Docker containers) have genuinely limited capabilities.

#### 1.3 `isUnicodeSupported(): boolean`

Pure function for determining whether the terminal supports Unicode characters. Used by spinner and progress indicator components to choose between Unicode braille/box-drawing characters and ASCII fallbacks.

```typescript
export function isUnicodeSupported(): boolean {
  const term = (process.env.TERM ?? "").toLowerCase();
  if (term === "dumb") {
    return false;
  }

  const noColor = process.env.NO_COLOR;
  if (noColor !== undefined && noColor !== "") {
    return false;
  }

  return true;
}
```

**Design decisions:**

- **`NO_COLOR` implies no-Unicode.** While `NO_COLOR` technically only disables color, environments that set it (CI runners, accessibility tools, pipe mode) also tend to have limited or no Unicode support. This is a pragmatic heuristic.
- **Does not check `LANG` or locale.** Locale-based detection (`LANG=en_US.UTF-8`) is unreliable in containers and SSH sessions.
- **Returns `true` by default.** Most modern terminals support Unicode.

#### 1.4 Complete file

The file should be copied verbatim from `specs/tui/apps/tui/src/theme/detect.ts` (102 lines). It contains the module-level JSDoc, the `ColorTier` type, `detectColorCapability()`, and `isUnicodeSupported()`.

### Step 2: Update `apps/tui/src/theme/index.ts` barrel export

**File:** `apps/tui/src/theme/index.ts`  
**Action:** Replace the existing stub (`export {};`) with real re-exports

The current file contains only:
```typescript
/**
 * Theme system for the TUI application.
 */
export {};
```

Replace with:

```typescript
/**
 * Theme system for the TUI application.
 *
 * Modules:
 *   detect.ts      — Terminal color capability detection (pure functions)
 *
 * Planned modules (see: specs/tui/engineering-architecture.md § Theme and Color Token System):
 *   tokens.ts      — 12 semantic color tokens: primary, success, warning, error, muted,
 *                    surface, border, diffAddedBg, diffRemovedBg, diffAddedText,
 *                    diffRemovedText, diffHunkHeader
 *   syntaxStyle.ts — Singleton SyntaxStyle for markdown and code rendering
 *   resolve.ts     — Token resolution: semantic token × color capability → concrete ANSI value
 *
 * Note: src/lib/diff-syntax.ts already implements ColorTier detection and palette
 * resolution for diff-specific syntax highlighting. The theme/detect.ts module is
 * the canonical detection source. A future migration ticket will update
 * lib/diff-syntax.ts and hooks/useDiffSyntaxStyle.ts to re-export from here.
 */

export { type ColorTier, detectColorCapability, isUnicodeSupported } from "./detect.js";
```

**Rationale for excluding additional re-exports:**

The full blueprint barrel at `specs/tui/apps/tui/src/theme/index.ts` also includes:
- `import { detectColorCapability } from "./detect.js"; export const detectColorTier = detectColorCapability;` — backward-compatible alias
- `export { defaultSyntaxStyle } from "./syntaxStyle.js";` — singleton syntax style
- `export { type ThemeTokens, ... } from "./tokens.js";` — token definitions

These are deferred to their respective tickets (`tui-theme-tokens`, `tui-syntax-style-singleton`) to avoid module resolution failures for files that don't exist yet. The `detectColorTier` alias is deferred to the migration ticket that updates `lib/diff-syntax.ts` callers.

### Step 3: Add color detection tests to `e2e/tui/app-shell.test.ts`

**File:** `e2e/tui/app-shell.test.ts`  
**Action:** Append a new `describe` block after the existing 5 blocks

The existing file already has:
1. `TUI_APP_SHELL — Package scaffold` (lines 10–129)
2. `TUI_APP_SHELL — TypeScript compilation` (lines 135–155)
3. `TUI_APP_SHELL — Dependency resolution` (lines 161–221)
4. `TUI_APP_SHELL — E2E test infrastructure` (lines 227–310)
5. `TUI_LOADING_STATES` (lines within the blueprint app-shell.test.ts)
6. `KeybindingProvider — Priority Dispatch` (lines 610–874)

A 7th `describe` block for color detection tests will be appended. New imports needed: `existsSync` from `node:fs` (already imported at line 2).

Full test specifications are in Section 10 below.

---

## 3. File Inventory

| File | Action | Lines | Description |
|------|--------|-------|-------------|
| `apps/tui/src/theme/detect.ts` | **Create** | 102 | Color detection module — sole new logic file |
| `apps/tui/src/theme/index.ts` | **Modify** | ~18 | Replace stub `export {}` with re-exports from detect.ts |
| `e2e/tui/app-shell.test.ts` | **Modify** | +~230 | Append color detection `describe` block |

**No new directories need to be created** — `apps/tui/src/theme/` already exists (contains `index.ts`).

**No test infrastructure files need to be created** — `e2e/tui/helpers.ts` already exists with all required exports (`TUI_SRC`, `BUN`, `run()`, `bunEval()`).

---

## 4. API Surface

### Exports from `apps/tui/src/theme/detect.ts`

| Export | Kind | Signature | Description |
|--------|------|-----------|-------------|
| `ColorTier` | Type | `"truecolor" \| "ansi256" \| "ansi16"` | Color capability tier discriminant |
| `detectColorCapability` | Function | `() => ColorTier` | Detect terminal color tier from env vars |
| `isUnicodeSupported` | Function | `() => boolean` | Check if terminal supports Unicode characters |

### Re-exports from `apps/tui/src/theme/index.ts`

All three exports above are re-exported from the barrel.

---

## 5. Detection Cascade — Decision Matrix

This table documents every meaningful combination of environment variables and the expected output. It serves as both a specification and a test plan.

| # | `NO_COLOR` | `TERM` | `COLORTERM` | `detectColorCapability()` | `isUnicodeSupported()` | Rationale |
|---|------------|--------|-------------|---------------------------|------------------------|-----------|
| 1 | `"1"` | `"xterm-256color"` | `"truecolor"` | `ansi16` | `false` | NO_COLOR overrides everything |
| 2 | `""` | `"xterm-256color"` | `"truecolor"` | `truecolor` | `true` | Empty NO_COLOR is treated as unset |
| 3 | _(unset)_ | `"dumb"` | `"truecolor"` | `ansi16` | `false` | TERM=dumb overrides COLORTERM |
| 4 | _(unset)_ | `"xterm-256color"` | `"truecolor"` | `truecolor` | `true` | COLORTERM wins over TERM |
| 5 | _(unset)_ | `"xterm-256color"` | `"24bit"` | `truecolor` | `true` | 24bit is alias for truecolor |
| 6 | _(unset)_ | `"xterm-256color"` | _(unset)_ | `ansi256` | `true` | TERM 256color detected |
| 7 | _(unset)_ | `"screen-256color"` | _(unset)_ | `ansi256` | `true` | tmux/screen 256color |
| 8 | _(unset)_ | `"tmux-256color"` | _(unset)_ | `ansi256` | `true` | tmux native |
| 9 | _(unset)_ | `"xterm"` | _(unset)_ | `ansi256` | `true` | Unknown falls to default |
| 10 | _(unset)_ | `"linux"` | _(unset)_ | `ansi256` | `true` | Linux console → default |
| 11 | _(unset)_ | `""` | _(unset)_ | `ansi256` | `true` | Empty TERM → default |
| 12 | _(unset)_ | _(unset)_ | _(unset)_ | `ansi256` | `true` | No env vars → default |
| 13 | `"true"` | _(unset)_ | _(unset)_ | `ansi16` | `false` | Any non-empty NO_COLOR |
| 14 | _(unset)_ | `"XTERM-256COLOR"` | _(unset)_ | `ansi256` | `true` | Case-insensitive TERM |
| 15 | _(unset)_ | _(unset)_ | `"TrueColor"` | `truecolor` | `true` | Case-insensitive COLORTERM |
| 16 | `"0"` | `"xterm-256color"` | `"truecolor"` | `ansi16` | `false` | NO_COLOR="0" is non-empty, still active |

---

## 6. Divergence from Existing `detectColorTier()`

The existing `detectColorTier()` in `apps/tui/src/lib/diff-syntax.ts` (lines 103–121) differs from this new module in several ways:

| Aspect | `lib/diff-syntax.ts` (existing, line 103) | `theme/detect.ts` (new) |
|--------|--------------------------------|-------------------------|
| `NO_COLOR` handling | ❌ Not checked | ✅ Checked first (priority 1) |
| `TERM=dumb` handling | Returns `ansi16` (part of catch-all at line 115) | Returns `ansi16` (explicit check at priority 2) |
| `TERM=linux` | Returns `ansi16` (explicit match at line 115) | Returns `ansi256` (default fallback — linux console supports 256 in many configs) |
| `TERM=xterm` | Returns `ansi16` (explicit match at line 115) | Returns `ansi256` (default fallback — modern xterm supports 256) |
| `TERM=""` (empty) | Returns `ansi16` (explicit match at line 115) | Returns `ansi256` (default fallback) |
| Export name | `detectColorTier` | `detectColorCapability` |
| Unicode detection | ❌ Not provided | ✅ `isUnicodeSupported()` |
| `COLORTERM` nullish handling | Uses `?.toLowerCase()` (optional chaining) | Uses `(process.env.COLORTERM ?? "").toLowerCase()` (nullish coalescing) |

**Migration strategy:** A follow-up ticket will update `lib/diff-syntax.ts` to import `ColorTier` and optionally `detectColorCapability` from `theme/detect.ts`. The existing `detectColorTier()` is left untouched in this ticket to avoid cascading changes. The `ColorTier` type in `lib/diff-syntax.ts` is compatible (same string union: `"truecolor" | "ansi256" | "ansi16"`) so downstream code continues to work.

**Consumers that will migrate in the follow-up:**

| File | Current import | Migration target |
|------|---------------|------------------|
| `apps/tui/src/hooks/useDiffSyntaxStyle.ts` (line 3) | `import { createDiffSyntaxStyle, detectColorTier, type ColorTier } from "../lib/diff-syntax.js"` | `import { type ColorTier } from "../theme/detect.js"` (or via barrel) |
| `apps/tui/src/lib/diff-syntax.ts` (line 101) | Defines `ColorTier` locally | Re-exports from `../theme/detect.js` |
| `apps/tui/src/lib/index.ts` (line 8, 15) | `export { detectColorTier } from "./diff-syntax.js"` and `export type { ColorTier } from "./diff-syntax.js"` | Re-exports from `../theme/detect.js` |

---

## 7. Consumers

This module will be consumed by:

| Consumer | How | When |
|----------|-----|------|
| `ThemeProvider` (future ticket) | Calls `detectColorCapability()` once at mount to determine token resolution tier | `tui-theme-provider` ticket |
| `theme/tokens.ts` (future ticket) | Imports `ColorTier` type for `createTheme(tier)` function signature | `tui-theme-tokens` ticket |
| `theme/syntaxStyle.ts` (future ticket) | Calls `detectColorCapability()` at module level to create singleton `SyntaxStyle` | `tui-syntax-style-singleton` ticket |
| `AppShell` / spinner components (future) | Calls `isUnicodeSupported()` to choose spinner character set | `tui-loading-states` ticket |
| `hooks/useSpinner.ts` (future, see blueprint) | Uses `isUnicodeSupported()` for spinner frame selection | `tui-loading-states` ticket |

No existing code needs to change in this ticket. The module is additive.

---

## 8. Constraints

- **Zero React dependencies.** The module must not import React, any React hooks, or any React context. It is consumed outside the React tree (during bootstrap) and inside it (via ThemeProvider).
- **Zero API calls.** The module reads only `process.env`.
- **Zero side effects.** Functions are pure — same env vars produce same output. No global mutation, no caching, no memoization. The caller (ThemeProvider) is responsible for calling once and freezing the result.
- **Zero native dependencies beyond Bun globals.** Only `process.env` is accessed. No `@opentui/core` imports, no Node.js-specific APIs beyond `process`.
- **Zero internal imports.** The module has no imports from any other TUI source file. This ensures zero risk of circular dependencies.
- **No runtime theme switching.** The architecture doc explicitly states the tier is frozen for the session lifetime.

---

## 9. Productionization Checklist

This module is production-ready as specified. There are no POC artifacts to graduate. The implementation in `specs/tui/apps/tui/src/theme/detect.ts` (102 lines) is the production code — it should be copied verbatim to `apps/tui/src/theme/detect.ts`.

The following must be verified before marking the ticket complete:

- [ ] `apps/tui/src/theme/detect.ts` exists and contains the three exports (`ColorTier`, `detectColorCapability`, `isUnicodeSupported`)
- [ ] `apps/tui/src/theme/index.ts` has been updated from stub `export {}` to re-export from detect.ts
- [ ] `bun run check` passes with the new files (TypeScript compilation) — run from `apps/tui/`
- [ ] The barrel export from `theme/index.ts` resolves correctly when imported
- [ ] The module is importable via `import { detectColorCapability, isUnicodeSupported, type ColorTier } from "./src/theme/detect.js"` from the `apps/tui/` cwd
- [ ] No circular dependency introduced (detect.ts has zero internal imports)
- [ ] Existing `lib/diff-syntax.ts` continues to compile and function unchanged
- [ ] Existing `hooks/useDiffSyntaxStyle.ts` continues to compile and function unchanged
- [ ] Existing `lib/index.ts` barrel continues to compile and function unchanged
- [ ] All DET-* tests in `e2e/tui/app-shell.test.ts` pass
- [ ] All pre-existing tests in `e2e/tui/app-shell.test.ts` continue to pass
- [ ] Existing `e2e/tui/diff.test.ts` continues to compile unchanged
- [ ] Existing `e2e/tui/agents.test.ts` continues to compile unchanged

---

## 10. Unit & Integration Tests

### Test file: `e2e/tui/app-shell.test.ts`

Tests are appended to the existing `e2e/tui/app-shell.test.ts` file as a new `describe` block. The color detection tests belong to the `TUI_APP_SHELL` feature group (`TUI_THEME_AND_COLOR_TOKENS` feature flag).

### Test infrastructure

The tests depend on `e2e/tui/helpers.ts` which **already exists** (492 lines) and provides:

| Export | Type | Description |
|--------|------|-------------|
| `TUI_ROOT` | `string` | `join(import.meta.dir, "../../apps/tui")` |
| `TUI_SRC` | `string` | `join(TUI_ROOT, "src")` |
| `BUN` | `string` | `Bun.which("bun") ?? process.execPath` |
| `run(cmd, opts?)` | `async function` | Spawns subprocess with controlled env, merges `opts.env` with `process.env` |
| `bunEval(expression)` | `async function` | Shorthand for `run([BUN, "-e", expression])` |

The `run()` function merges `opts.env` with `process.env` (line 465: `env: { ...process.env as Record<string, string>, ...opts.env }`). This means tests must explicitly set `NO_COLOR`, `COLORTERM`, and `TERM` to override the test runner's own environment.

### Test approach

Since `detectColorCapability()` and `isUnicodeSupported()` are pure functions that read `process.env`, tests use `run()` from the test helpers to execute the functions in isolated Bun subprocesses with controlled environment variables. This avoids:

- Mutating `process.env` in the test process (which would leak between tests)
- Mocking `process.env` (which violates the "no mocking implementation details" principle)
- Needing a full TUI launch for what are essentially unit-level verifications

Each `run()` call spawns a fresh Bun subprocess with a clean, explicitly-specified environment, making tests fully isolated.

**Environment isolation detail:** Every test case explicitly sets all three env vars (`NO_COLOR`, `COLORTERM`, `TERM`) to ensure deterministic results regardless of the test runner's terminal environment. Setting `NO_COLOR: ""` or `COLORTERM: ""` is equivalent to unsetting those vars for detection purposes (empty strings are treated as unset by the detection logic).

### Test specifications

The following `describe` block is appended to the end of `e2e/tui/app-shell.test.ts`. The existing imports on line 1-4 already include `existsSync`, `join`, `TUI_SRC`, `run`, `bunEval`, and `BUN` (via the helpers import). The only addition needed to the imports is ensuring `BUN` is in the destructured import.

```typescript
// ---------------------------------------------------------------------------
// TUI_APP_SHELL — Color capability detection (theme/detect.ts)
// ---------------------------------------------------------------------------

describe("TUI_APP_SHELL — Color capability detection", () => {

  // ── File structure ─────────────────────────────────────────────────────

  test("DET-FILE-001: theme/detect.ts exists", () => {
    expect(existsSync(join(TUI_SRC, "theme/detect.ts"))).toBe(true);
  });

  test("DET-FILE-002: theme/index.ts re-exports detectColorCapability", async () => {
    const result = await bunEval(
      "import { detectColorCapability } from './src/theme/index.js'; console.log(typeof detectColorCapability)"
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("function");
  });

  test("DET-FILE-003: theme/index.ts re-exports isUnicodeSupported", async () => {
    const result = await bunEval(
      "import { isUnicodeSupported } from './src/theme/index.js'; console.log(typeof isUnicodeSupported)"
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("function");
  });

  test("DET-FILE-004: theme/index.ts re-exports ColorTier type", async () => {
    // Type-only exports are erased at runtime; verify the module loads
    // and that the value-level exports coexist with the type export.
    const result = await bunEval(
      "import { detectColorCapability } from './src/theme/index.js'; const t: import('./src/theme/detect.js').ColorTier = detectColorCapability(); console.log(typeof t)"
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("string");
  });

  test("DET-FILE-005: detect.ts has zero React imports", async () => {
    const content = await Bun.file(join(TUI_SRC, "theme/detect.ts")).text();
    expect(content).not.toContain("from 'react'");
    expect(content).not.toContain('from "react"');
    expect(content).not.toContain("import React");
  });

  test("DET-FILE-006: detect.ts has zero @opentui imports", async () => {
    const content = await Bun.file(join(TUI_SRC, "theme/detect.ts")).text();
    expect(content).not.toContain("@opentui");
  });

  // ── detectColorCapability() ────────────────────────────────────────────

  // Priority 1: NO_COLOR
  test("DET-DETECT-001: NO_COLOR=1 returns ansi16 even with truecolor COLORTERM", async () => {
    const r = await run(
      [BUN, "-e", "import { detectColorCapability } from './src/theme/detect.js'; console.log(detectColorCapability())"],
      { env: { NO_COLOR: "1", COLORTERM: "truecolor", TERM: "xterm-256color" } }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("ansi16");
  });

  test("DET-DETECT-002: NO_COLOR=0 (non-empty) returns ansi16", async () => {
    const r = await run(
      [BUN, "-e", "import { detectColorCapability } from './src/theme/detect.js'; console.log(detectColorCapability())"],
      { env: { NO_COLOR: "0", COLORTERM: "", TERM: "xterm-256color" } }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("ansi16");
  });

  test("DET-DETECT-003: NO_COLOR='' (empty string) does NOT trigger ansi16", async () => {
    const r = await run(
      [BUN, "-e", "import { detectColorCapability } from './src/theme/detect.js'; console.log(detectColorCapability())"],
      { env: { NO_COLOR: "", COLORTERM: "truecolor", TERM: "" } }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("truecolor");
  });

  // Priority 2: TERM=dumb
  test("DET-DETECT-004: TERM=dumb returns ansi16 even with truecolor COLORTERM", async () => {
    const r = await run(
      [BUN, "-e", "import { detectColorCapability } from './src/theme/detect.js'; console.log(detectColorCapability())"],
      { env: { NO_COLOR: "", TERM: "dumb", COLORTERM: "truecolor" } }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("ansi16");
  });

  // Priority 3: COLORTERM=truecolor
  test("DET-DETECT-005: COLORTERM=truecolor returns truecolor", async () => {
    const r = await run(
      [BUN, "-e", "import { detectColorCapability } from './src/theme/detect.js'; console.log(detectColorCapability())"],
      { env: { NO_COLOR: "", COLORTERM: "truecolor", TERM: "xterm-256color" } }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("truecolor");
  });

  test("DET-DETECT-006: COLORTERM=24bit returns truecolor", async () => {
    const r = await run(
      [BUN, "-e", "import { detectColorCapability } from './src/theme/detect.js'; console.log(detectColorCapability())"],
      { env: { NO_COLOR: "", COLORTERM: "24bit", TERM: "" } }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("truecolor");
  });

  test("DET-DETECT-007: COLORTERM is case-insensitive (TrueColor)", async () => {
    const r = await run(
      [BUN, "-e", "import { detectColorCapability } from './src/theme/detect.js'; console.log(detectColorCapability())"],
      { env: { NO_COLOR: "", COLORTERM: "TrueColor", TERM: "" } }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("truecolor");
  });

  // Priority 4: TERM contains 256color
  test("DET-DETECT-008: TERM=xterm-256color returns ansi256", async () => {
    const r = await run(
      [BUN, "-e", "import { detectColorCapability } from './src/theme/detect.js'; console.log(detectColorCapability())"],
      { env: { NO_COLOR: "", COLORTERM: "", TERM: "xterm-256color" } }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("ansi256");
  });

  test("DET-DETECT-009: TERM=screen-256color returns ansi256", async () => {
    const r = await run(
      [BUN, "-e", "import { detectColorCapability } from './src/theme/detect.js'; console.log(detectColorCapability())"],
      { env: { NO_COLOR: "", COLORTERM: "", TERM: "screen-256color" } }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("ansi256");
  });

  test("DET-DETECT-010: TERM=tmux-256color returns ansi256", async () => {
    const r = await run(
      [BUN, "-e", "import { detectColorCapability } from './src/theme/detect.js'; console.log(detectColorCapability())"],
      { env: { NO_COLOR: "", COLORTERM: "", TERM: "tmux-256color" } }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("ansi256");
  });

  test("DET-DETECT-011: TERM is case-insensitive (XTERM-256COLOR)", async () => {
    const r = await run(
      [BUN, "-e", "import { detectColorCapability } from './src/theme/detect.js'; console.log(detectColorCapability())"],
      { env: { NO_COLOR: "", COLORTERM: "", TERM: "XTERM-256COLOR" } }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("ansi256");
  });

  // Priority 5: Default fallback
  test("DET-DETECT-012: no env vars returns ansi256 (default)", async () => {
    const r = await run(
      [BUN, "-e", "import { detectColorCapability } from './src/theme/detect.js'; console.log(detectColorCapability())"],
      { env: { NO_COLOR: "", COLORTERM: "", TERM: "" } }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("ansi256");
  });

  test("DET-DETECT-013: TERM=xterm (no 256) returns ansi256 (default)", async () => {
    const r = await run(
      [BUN, "-e", "import { detectColorCapability } from './src/theme/detect.js'; console.log(detectColorCapability())"],
      { env: { NO_COLOR: "", COLORTERM: "", TERM: "xterm" } }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("ansi256");
  });

  test("DET-DETECT-014: TERM=linux returns ansi256 (default)", async () => {
    const r = await run(
      [BUN, "-e", "import { detectColorCapability } from './src/theme/detect.js'; console.log(detectColorCapability())"],
      { env: { NO_COLOR: "", COLORTERM: "", TERM: "linux" } }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("ansi256");
  });

  test("DET-DETECT-015: empty TERM returns ansi256 (default)", async () => {
    const r = await run(
      [BUN, "-e", "import { detectColorCapability } from './src/theme/detect.js'; console.log(detectColorCapability())"],
      { env: { NO_COLOR: "", COLORTERM: "", TERM: "" } }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("ansi256");
  });

  // Return type validation
  test("DET-DETECT-016: return value is always one of the three valid tiers", async () => {
    const envCombos = [
      { NO_COLOR: "1", COLORTERM: "", TERM: "" },
      { NO_COLOR: "", COLORTERM: "", TERM: "dumb" },
      { NO_COLOR: "", COLORTERM: "truecolor", TERM: "" },
      { NO_COLOR: "", COLORTERM: "", TERM: "xterm-256color" },
      { NO_COLOR: "", COLORTERM: "", TERM: "" },
      { NO_COLOR: "", COLORTERM: "", TERM: "rxvt-unicode" },
    ];
    for (const env of envCombos) {
      const r = await run(
        [BUN, "-e", "import { detectColorCapability } from './src/theme/detect.js'; const t = detectColorCapability(); console.log(['truecolor','ansi256','ansi16'].includes(t))"],
        { env }
      );
      expect(r.exitCode).toBe(0);
      expect(r.stdout.trim()).toBe("true");
    }
  });

  // ── isUnicodeSupported() ───────────────────────────────────────────────

  test("DET-UNICODE-001: returns false when TERM=dumb", async () => {
    const r = await run(
      [BUN, "-e", "import { isUnicodeSupported } from './src/theme/detect.js'; console.log(isUnicodeSupported())"],
      { env: { NO_COLOR: "", COLORTERM: "", TERM: "dumb" } }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("false");
  });

  test("DET-UNICODE-002: returns false when NO_COLOR=1", async () => {
    const r = await run(
      [BUN, "-e", "import { isUnicodeSupported } from './src/theme/detect.js'; console.log(isUnicodeSupported())"],
      { env: { NO_COLOR: "1", COLORTERM: "", TERM: "" } }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("false");
  });

  test("DET-UNICODE-003: returns true for xterm-256color", async () => {
    const r = await run(
      [BUN, "-e", "import { isUnicodeSupported } from './src/theme/detect.js'; console.log(isUnicodeSupported())"],
      { env: { NO_COLOR: "", COLORTERM: "", TERM: "xterm-256color" } }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("true");
  });

  test("DET-UNICODE-004: returns true when no env vars set", async () => {
    const r = await run(
      [BUN, "-e", "import { isUnicodeSupported } from './src/theme/detect.js'; console.log(isUnicodeSupported())"],
      { env: { NO_COLOR: "", COLORTERM: "", TERM: "" } }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("true");
  });

  test("DET-UNICODE-005: returns true when NO_COLOR is empty string", async () => {
    const r = await run(
      [BUN, "-e", "import { isUnicodeSupported } from './src/theme/detect.js'; console.log(isUnicodeSupported())"],
      { env: { NO_COLOR: "", COLORTERM: "", TERM: "" } }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("true");
  });

  test("DET-UNICODE-006: TERM=dumb takes priority (returns false even with NO_COLOR unset)", async () => {
    const r = await run(
      [BUN, "-e", "import { isUnicodeSupported } from './src/theme/detect.js'; console.log(isUnicodeSupported())"],
      { env: { NO_COLOR: "", COLORTERM: "", TERM: "dumb" } }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("false");
  });

  // ── TypeScript compilation ─────────────────────────────────────────────

  test("DET-TSC-001: theme/detect.ts compiles under tsc --noEmit", async () => {
    const result = await run(["bun", "run", "check"]);
    if (result.exitCode !== 0) {
      console.error("tsc stderr:", result.stderr);
      console.error("tsc stdout:", result.stdout);
    }
    expect(result.exitCode).toBe(0);
  }, 30_000);

  // ── Integration: consistent with existing detectColorTier ──────────────

  test("DET-COMPAT-001: ColorTier type is compatible with lib/diff-syntax ColorTier", async () => {
    // Both modules export the same string union type. Verify they produce
    // the same result for the truecolor case.
    const r = await run(
      [BUN, "-e", [
        "import { detectColorCapability } from './src/theme/detect.js';",
        "import { detectColorTier } from './src/lib/diff-syntax.js';",
        "const a = detectColorCapability();",
        "const b = detectColorTier();",
        "console.log(a, b);"
      ].join(" ")],
      { env: { NO_COLOR: "", COLORTERM: "truecolor", TERM: "xterm-256color" } }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("truecolor truecolor");
  });

  test("DET-COMPAT-002: both modules agree on ansi256 for TERM=xterm-256color", async () => {
    const r = await run(
      [BUN, "-e", [
        "import { detectColorCapability } from './src/theme/detect.js';",
        "import { detectColorTier } from './src/lib/diff-syntax.js';",
        "console.log(detectColorCapability(), detectColorTier());"
      ].join(" ")],
      { env: { NO_COLOR: "", COLORTERM: "", TERM: "xterm-256color" } }
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("ansi256 ansi256");
  });

  // ── Behavioral divergence: new module handles NO_COLOR ─────────────────

  test("DET-COMPAT-003: new module returns ansi16 for NO_COLOR while old module does not check NO_COLOR", async () => {
    // This documents the intentional behavioral divergence. The new module
    // respects NO_COLOR; the old one does not. Both are correct in their
    // respective contexts — the old one was designed before NO_COLOR was
    // a requirement. The migration ticket will unify behavior.
    const r = await run(
      [BUN, "-e", [
        "import { detectColorCapability } from './src/theme/detect.js';",
        "import { detectColorTier } from './src/lib/diff-syntax.js';",
        "console.log(detectColorCapability(), detectColorTier());"
      ].join(" ")],
      { env: { NO_COLOR: "1", COLORTERM: "truecolor", TERM: "xterm-256color" } }
    );
    expect(r.exitCode).toBe(0);
    // New module: ansi16 (NO_COLOR respected)
    // Old module: truecolor (NO_COLOR not checked, COLORTERM wins)
    expect(r.stdout.trim()).toBe("ansi16 truecolor");
  });
});
```

### Test summary

| Category | Count | IDs |
|----------|-------|-----|
| File structure | 6 | DET-FILE-001 through DET-FILE-006 |
| `detectColorCapability()` — NO_COLOR | 3 | DET-DETECT-001 through DET-DETECT-003 |
| `detectColorCapability()` — TERM=dumb | 1 | DET-DETECT-004 |
| `detectColorCapability()` — COLORTERM truecolor | 3 | DET-DETECT-005 through DET-DETECT-007 |
| `detectColorCapability()` — TERM 256color | 4 | DET-DETECT-008 through DET-DETECT-011 |
| `detectColorCapability()` — default fallback | 4 | DET-DETECT-012 through DET-DETECT-015 |
| `detectColorCapability()` — return type | 1 | DET-DETECT-016 |
| `isUnicodeSupported()` | 6 | DET-UNICODE-001 through DET-UNICODE-006 |
| TypeScript compilation | 1 | DET-TSC-001 |
| Compatibility with existing module | 3 | DET-COMPAT-001 through DET-COMPAT-003 |
| **Total** | **32** | |

### Test principles applied

1. **No mocking.** Tests run actual Bun subprocesses with controlled `env` objects. No `jest.mock()`, no `vi.mock()`, no `process.env` mutation.
2. **Each test validates one behavior.** Test names describe what the user/system observes, not implementation mechanics.
3. **Tests are independent.** Each `run()` call spawns a fresh subprocess. No shared state.
4. **Tests that fail due to unimplemented backends stay failing.** Not directly applicable here (this module has no backend dependencies), but the principle is upheld.
5. **No skipping.** Every test in the spec is executed.

### Environment isolation note

The `run()` helper merges `opts.env` with `process.env` (spread: `{ ...process.env, ...opts.env }`). This means the test runner's `TERM`, `COLORTERM`, and `NO_COLOR` values will be inherited unless explicitly overridden. Every test case in this spec explicitly sets all three env vars (`NO_COLOR`, `COLORTERM`, `TERM`) to ensure deterministic results regardless of the test runner's terminal environment.

### Integration with existing test file

The existing `e2e/tui/app-shell.test.ts` (875 lines) already imports from `./helpers.ts`:

```typescript
import { TUI_ROOT, TUI_SRC, run, bunEval, createTestCredentialStore, createMockAPIEnv, launchTUI } from "./helpers.ts"
```

The `BUN` export is used in the DET-* tests but is not currently in the import. The import line must be updated to include `BUN`:

```typescript
import { TUI_ROOT, TUI_SRC, BUN, run, bunEval, createTestCredentialStore, createMockAPIEnv, launchTUI } from "./helpers.ts"
```

No other imports need to change. `existsSync` and `join` are already imported.

---

## 11. Edge Cases and Error Handling

| Edge case | Handling |
|-----------|----------|
| `process.env.TERM` is `undefined` | `(process.env.TERM ?? "").toLowerCase()` defaults to empty string → falls through to default `ansi256` |
| `process.env.COLORTERM` is `undefined` | Same pattern → empty string → no match → continues cascade |
| `process.env.NO_COLOR` is `undefined` | Checked via `!== undefined` → skipped |
| `process.env.NO_COLOR` is `""` (empty) | Checked via `!== ""` → treated as unset, continues cascade |
| `process.env.NO_COLOR` is `"0"` | Non-empty string → triggers `ansi16` (per [no-color.org](https://no-color.org/) spec: any non-empty value) |
| `COLORTERM` has unexpected value (e.g., `"16m"`) | Not matched → continues cascade |
| `TERM` has unusual value (e.g., `"rxvt-unicode"`) | No `256color` substring → falls to default `ansi256` |
| Multiple signals conflict (e.g., `NO_COLOR=1` + `COLORTERM=truecolor`) | Priority order resolves: NO_COLOR wins → `ansi16` |
| `TERM=dumb` + `COLORTERM=truecolor` | Priority order resolves: TERM=dumb wins → `ansi16` |
| `NO_COLOR=1` + `TERM=dumb` | Both resolve to `ansi16` — NO_COLOR checked first, short-circuits |
| `TERM` is whitespace-only (e.g., `" "`) | `.toLowerCase()` preserves whitespace → not `"dumb"`, not containing `"256color"` → falls to default `ansi256` |
| Very long `TERM` string | `.includes("256color")` is O(n) but TERM values are always short in practice — no concern |

---

## 12. Non-Goals (Explicitly Out of Scope)

- **ThemeProvider implementation.** This ticket delivers only the detection function. ThemeProvider is a separate ticket.
- **Token resolution (semantic color → ANSI value).** Separate ticket (`tui-theme-tokens`).
- **`syntaxStyle.ts` module.** Separate ticket — depends on tokens.ts.
- **Migration of existing `detectColorTier()` callers.** Follow-up ticket to avoid cascading changes. The callers are:
  - `lib/diff-syntax.ts` (definition, line 103)
  - `hooks/useDiffSyntaxStyle.ts` (consumer, line 3)
  - `lib/index.ts` (re-export, lines 8 and 15)
- **Runtime theme switching.** Architecture doc explicitly states the tier is frozen for session lifetime.
- **Terminal capability querying via escape sequences.** Some terminals support `\e[?11;4c` DA responses. This module uses only environment variables — simpler, faster, and sufficient.
- **`FORCE_COLOR` env var support.** Could be added later if needed. Currently not in the cascade.
- **`detectColorTier` alias export.** The blueprint barrel exports `export const detectColorTier = detectColorCapability;` for backward compatibility. This alias is deferred to the migration ticket to keep this ticket's scope minimal and free of import-side complexity.

---

## 13. Acceptance Criteria

1. ✅ `apps/tui/src/theme/detect.ts` exists and exports `ColorTier`, `detectColorCapability`, and `isUnicodeSupported`
2. ✅ `apps/tui/src/theme/index.ts` re-exports all three (replacing the stub `export {}`)
3. ✅ `detectColorCapability()` returns `ansi16` when `NO_COLOR` is set (non-empty) or `TERM=dumb`
4. ✅ `detectColorCapability()` returns `truecolor` when `COLORTERM=truecolor` or `COLORTERM=24bit`
5. ✅ `detectColorCapability()` returns `ansi256` when `TERM` contains `256color`
6. ✅ `detectColorCapability()` returns `ansi256` as default fallback
7. ✅ `isUnicodeSupported()` returns `false` for `TERM=dumb` and `NO_COLOR` set
8. ✅ `isUnicodeSupported()` returns `true` by default
9. ✅ Module has zero React imports and zero `@opentui` imports
10. ✅ `bun run check` passes from `apps/tui/` (TypeScript compilation)
11. ✅ All 32 DET-* tests in `e2e/tui/app-shell.test.ts` pass
12. ✅ All pre-existing tests in `e2e/tui/app-shell.test.ts` continue to pass (scaffold, compilation, dependency, infrastructure, loading, keybinding)
13. ✅ Existing `lib/diff-syntax.ts` compiles and functions unchanged
14. ✅ Existing `hooks/useDiffSyntaxStyle.ts` compiles and functions unchanged
15. ✅ Existing `lib/index.ts` barrel compiles and functions unchanged
16. ✅ DET-COMPAT-003 documents the intentional behavioral divergence between new and old detection
17. ✅ Existing `e2e/tui/diff.test.ts` continues to compile unchanged
18. ✅ Existing `e2e/tui/agents.test.ts` continues to compile unchanged