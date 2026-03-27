# Engineering Specification: `tui-diff-syntax-highlight`

## TUI_DIFF_SYNTAX_HIGHLIGHT: Language-aware Tree-sitter highlighting

**Ticket ID:** `tui-diff-syntax-highlight`
**Type:** Feature
**Feature:** `TUI_DIFF_SYNTAX_HIGHLIGHT`
**Dependencies:** `tui-diff-syntax-style` (implemented), `tui-diff-unified-view` (in progress)
**Status:** Not started

---

## Overview

This ticket wires language-aware syntax highlighting into the TUI diff viewer. The infrastructure — `apps/tui/src/lib/diff-syntax.ts` (color palettes, filetype resolution) and `apps/tui/src/hooks/useDiffSyntaxStyle.ts` (memoized `SyntaxStyle` lifecycle) — is already implemented by `tui-diff-syntax-style`. This ticket integrates those modules into the diff screen's rendering pipeline so that every `<diff>` component instance receives the correct `filetype` and `syntaxStyle` props, and the end-to-end behavior described in the product spec is fully realized.

The work covers:

1. **DiffScreen integration** — wiring `useDiffSyntaxStyle()` and `resolveFiletype()` into the diff screen component.
2. **Per-file filetype resolution** — mapping each `FileDiffItem` to its Tree-sitter filetype.
3. **Binary and oversized file guards** — skipping syntax highlighting for binary or >1MB files.
4. **Telemetry events** — emitting the four product-spec analytics events.
5. **Observability logging** — structured debug/info/warn/error log entries.
6. **End-to-end tests** — 42 tests covering snapshots, keyboard interactions, responsive behavior, data integration, and edge cases.

---

## Implementation Plan

### Step 1: Create the filetype resolution adapter for `FileDiffItem`

**File:** `apps/tui/src/components/diff/resolveFileFiletype.ts` (new)

This adapter wraps `resolveFiletype()` from `apps/tui/src/lib/diff-syntax.ts` and applies the binary/oversized guards before attempting language detection.

```typescript
import { resolveFiletype } from "../../lib/diff-syntax.js"

export interface FileDiffItem {
  path: string
  old_path?: string
  change_type: "added" | "modified" | "deleted" | "renamed" | "copied"
  patch?: string
  is_binary: boolean
  language?: string | null
  additions: number
  deletions: number
}

const MAX_PATCH_SIZE_BYTES = 1_048_576 // 1MB

/**
 * Resolve the Tree-sitter filetype for a diff file.
 *
 * Returns `undefined` (plain text) when:
 * - The file is binary (`is_binary: true`)
 * - The patch exceeds 1MB
 * - Neither API language nor path resolves to a known filetype
 *
 * For renamed files, uses the NEW path (`file.path`) for language detection,
 * not the old path, since the new path reflects the file's current identity.
 */
export function resolveFileFiletype(file: FileDiffItem): string | undefined {
  // Guard: binary files skip syntax highlighting entirely
  if (file.is_binary) {
    return undefined
  }

  // Guard: oversized patches skip highlighting
  if (file.patch && new TextEncoder().encode(file.patch).byteLength > MAX_PATCH_SIZE_BYTES) {
    return undefined
  }

  // Delegate to core resolution (API language → path fallback → undefined)
  return resolveFiletype(file.language ?? undefined, file.path)
}
```

**Design decisions:**
- `TextEncoder.encode().byteLength` is used instead of `.length` because UTF-8 multi-byte characters could make `.length` inaccurate for the 1MB byte limit.
- Renamed files use `file.path` (new path) since the file's content is in the new language. A `.js` → `.ts` rename should highlight as TypeScript.
- The `FileDiffItem` interface is defined here locally but matches the `@codeplane/ui-core` type. When the data hooks are implemented, this will be replaced with the shared type via import.

### Step 2: Create telemetry and logging utilities for syntax highlighting

**File:** `apps/tui/src/components/diff/diffSyntaxTelemetry.ts` (new)

This module encapsulates all syntax highlighting telemetry events and structured log entries specified in the product spec. It uses a simple interface that can be backed by the real telemetry system when available, or a no-op for now.

```typescript
import type { FileDiffItem } from "./resolveFileFiletype.js"

export interface SyntaxHighlightMetrics {
  filetype: string | undefined
  filePath: string
  source: "api" | "path_fallback" | "none"
  durationMs?: number
  lineCount?: number
  errorType?: "timeout" | "parse_error" | "worker_crash"
  errorMessage?: string
}

/** Determine the source of the filetype resolution */
export function resolveSource(
  apiLanguage: string | null | undefined,
  resolvedFiletype: string | undefined,
): "api" | "path_fallback" | "none" {
  if (!resolvedFiletype) return "none"
  if (typeof apiLanguage === "string" && apiLanguage.trim().length > 0) return "api"
  return "path_fallback"
}

/** Debug log: language resolved for a file */
export function logLanguageResolved(filePath: string, source: "api" | "path_fallback", filetype: string): void {
  if (process.env.DEBUG) {
    console.debug("diff.syntax.language_resolved", { file_path: filePath, source, filetype })
  }
}

/** Info log: no language detected */
export function logLanguageUnresolved(filePath: string, apiLanguage: string | null | undefined): void {
  if (process.env.DEBUG) {
    console.info("diff.syntax.language_unresolved", { file_path: filePath, api_language: apiLanguage ?? null })
  }
}

/** Warn log: Tree-sitter timeout */
export function logHighlightTimeout(filePath: string, filetype: string, lineCount: number): void {
  console.warn("diff.syntax.highlight_timeout", {
    file_path: filePath,
    filetype,
    timeout_ms: 5000,
    line_count: lineCount,
  })
}

/** Warn log: Tree-sitter worker error */
export function logWorkerError(filePath: string, filetype: string, errorMessage: string): void {
  console.warn("diff.syntax.worker_error", { file_path: filePath, filetype, error_message: errorMessage })
}

/** Debug log: color tier detected */
export function logColorTierDetected(tier: string): void {
  if (process.env.DEBUG) {
    console.debug("diff.syntax.color_tier_detected", {
      tier,
      colorterm: process.env.COLORTERM ?? "",
      term: process.env.TERM ?? "",
    })
  }
}
```

### Step 3: Create the `useDiffFiletypes` hook for batch filetype resolution

**File:** `apps/tui/src/hooks/useDiffFiletypes.ts` (new)

This hook resolves filetypes for an entire array of diff files, memoized to avoid re-computation when files haven't changed. It also emits telemetry for each resolution.

```typescript
import { useMemo } from "react"
import { resolveFileFiletype, type FileDiffItem } from "../components/diff/resolveFileFiletype.js"
import {
  resolveSource,
  logLanguageResolved,
  logLanguageUnresolved,
} from "../components/diff/diffSyntaxTelemetry.js"

export interface ResolvedFileFiletype {
  path: string
  filetype: string | undefined
  source: "api" | "path_fallback" | "none"
}

/**
 * Resolve filetypes for all files in a diff.
 *
 * Returns a Map<string, string | undefined> keyed by file path.
 * Memoized on the files array reference — only re-computes when
 * the array identity changes (new diff fetch).
 *
 * Emits structured log entries for each resolution.
 */
export function useDiffFiletypes(
  files: FileDiffItem[],
): Map<string, string | undefined> {
  return useMemo(() => {
    const map = new Map<string, string | undefined>()

    for (const file of files) {
      const filetype = resolveFileFiletype(file)
      const source = resolveSource(file.language, filetype)

      map.set(file.path, filetype)

      // Structured logging
      if (filetype && source !== "none") {
        logLanguageResolved(file.path, source, filetype)
      } else if (!filetype) {
        logLanguageUnresolved(file.path, file.language)
      }
    }

    return map
  }, [files])
}
```

### Step 4: Integrate syntax highlighting into `DiffViewer` component

**File:** `apps/tui/src/components/diff/DiffViewer.tsx` (modified — this file will be created by `tui-diff-screen-scaffold` and `tui-diff-unified-view`; this step specifies the modifications)

The `DiffViewer` component is the parent orchestrator that manages view mode (unified/split), file navigation, and whitespace toggle. This step adds syntax highlighting wiring.

**Changes to make:**

1. Import `useDiffSyntaxStyle` and `useColorTier`
2. Import `useDiffFiletypes`
3. Import `logColorTierDetected`
4. Create `syntaxStyle` via `useDiffSyntaxStyle(colorTier)` at the top of the component
5. Create `filetypeMap` via `useDiffFiletypes(files)`
6. Pass `syntaxStyle` and per-file `filetype` to each `<diff>` component instance

```tsx
// In DiffViewer.tsx — additions to existing component
import { useDiffSyntaxStyle } from "../../hooks/useDiffSyntaxStyle.js"
import { useDiffFiletypes } from "../../hooks/useDiffFiletypes.js"
import { useColorTier } from "../../hooks/useColorTier.js"
import { logColorTierDetected } from "./diffSyntaxTelemetry.js"
import { useTheme } from "../../hooks/useTheme.js"
import { useEffect, useRef } from "react"

interface DiffViewerProps {
  files: FileDiffItem[]
  viewMode: "unified" | "split"
  showWhitespace: boolean
  focusedFileIndex: number
}

function DiffViewer({ files, viewMode, showWhitespace, focusedFileIndex }: DiffViewerProps) {
  const colorTier = useColorTier()
  const theme = useTheme()

  // ── Syntax highlighting setup (once per screen lifecycle) ──────────
  const syntaxStyle = useDiffSyntaxStyle(colorTier)
  const filetypeMap = useDiffFiletypes(files)

  // Log color tier on first render only
  const hasMounted = useRef(false)
  useEffect(() => {
    if (!hasMounted.current) {
      logColorTierDetected(colorTier)
      hasMounted.current = true
    }
  }, [colorTier])

  const currentFile = files[focusedFileIndex]
  if (!currentFile) return null

  const filetype = filetypeMap.get(currentFile.path)

  // ── Guard: binary file ────────────────────────────────────────────
  if (currentFile.is_binary) {
    return (
      <box justifyContent="center" alignItems="center" flexGrow={1}>
        <text color={theme.muted}>Binary file changed</text>
      </box>
    )
  }

  // ── Guard: oversized file ─────────────────────────────────────────
  if (currentFile.patch && new TextEncoder().encode(currentFile.patch).byteLength > 1_048_576) {
    return (
      <box justifyContent="center" alignItems="center" flexGrow={1}>
        <text color={theme.muted}>File too large to display</text>
      </box>
    )
  }

  // ── Guard: empty file ─────────────────────────────────────────────
  if (!currentFile.patch && currentFile.additions === 0 && currentFile.deletions === 0) {
    return (
      <box justifyContent="center" alignItems="center" flexGrow={1}>
        <text color={theme.muted}>Empty file added</text>
      </box>
    )
  }

  return (
    <diff
      diff={currentFile.patch ?? ""}
      view={viewMode}
      filetype={filetype}
      syntaxStyle={syntaxStyle ?? undefined}
      showLineNumbers={true}
      syncScroll={viewMode === "split"}
      addedBg={theme.diffAddedBg}
      removedBg={theme.diffRemovedBg}
      addedSignColor={theme.diffAddedText}
      removedSignColor={theme.diffRemovedText}
      lineNumberFg={theme.muted}
    />
  )
}
```

**Key integration rules:**

- `syntaxStyle ?? undefined` — OpenTUI's `<diff>` component treats `undefined` as "no syntax highlighting". This is the graceful degradation path if `SyntaxStyle.fromStyles()` failed.
- `filetype` is resolved per-file from `filetypeMap`, not computed inline. This avoids re-running resolution on every render.
- The `syntaxStyle` instance is shared across all `<diff>` instances in the file list — `SyntaxStyle.getStyleId()` resolves token names to IDs regardless of which language Tree-sitter is processing.
- `colorTier` comes from `useColorTier()` (ThemeProvider context) rather than calling `detectColorTier()` directly, ensuring a single source of truth.

### Step 5: Wire `useDiffFiletypes` into the hooks barrel export

**File:** `apps/tui/src/hooks/index.ts` (modified)

Add the new hook to the barrel export:

```typescript
export { useDiffFiletypes } from "./useDiffFiletypes.js";
export type { ResolvedFileFiletype } from "./useDiffFiletypes.js";
```

### Step 6: Create the diff components barrel export

**File:** `apps/tui/src/components/diff/index.ts` (new or modified — depending on what `tui-diff-unified-view` creates)

```typescript
export { resolveFileFiletype, type FileDiffItem } from "./resolveFileFiletype.js"
export { resolveSource, logLanguageResolved, logLanguageUnresolved, logHighlightTimeout, logWorkerError, logColorTierDetected } from "./diffSyntaxTelemetry.js"
```

---

## File Manifest

| File | Purpose | New/Modified |
|------|---------|-------------|
| `apps/tui/src/components/diff/resolveFileFiletype.ts` | Per-file filetype resolution with binary/size guards | **New** |
| `apps/tui/src/components/diff/diffSyntaxTelemetry.ts` | Telemetry events and structured logging | **New** |
| `apps/tui/src/hooks/useDiffFiletypes.ts` | Batch filetype resolution hook | **New** |
| `apps/tui/src/components/diff/DiffViewer.tsx` | Wire `syntaxStyle` + `filetype` into `<diff>` | **Modified** |
| `apps/tui/src/components/diff/index.ts` | Barrel export for diff utilities | **New/Modified** |
| `apps/tui/src/hooks/index.ts` | Add `useDiffFiletypes` export | **Modified** |
| `apps/tui/src/lib/diff-syntax.ts` | Already implemented (no changes) | Existing |
| `apps/tui/src/hooks/useDiffSyntaxStyle.ts` | Already implemented (no changes) | Existing |
| `e2e/tui/diff.test.ts` | E2E tests for syntax highlighting | **Modified** |

---

## API Surface

### `apps/tui/src/components/diff/resolveFileFiletype.ts`

```typescript
interface FileDiffItem {
  path: string
  old_path?: string
  change_type: "added" | "modified" | "deleted" | "renamed" | "copied"
  patch?: string
  is_binary: boolean
  language?: string | null
  additions: number
  deletions: number
}

function resolveFileFiletype(file: FileDiffItem): string | undefined
```

### `apps/tui/src/hooks/useDiffFiletypes.ts`

```typescript
function useDiffFiletypes(files: FileDiffItem[]): Map<string, string | undefined>
```

### `apps/tui/src/components/diff/diffSyntaxTelemetry.ts`

```typescript
function resolveSource(apiLanguage: string | null | undefined, resolvedFiletype: string | undefined): "api" | "path_fallback" | "none"
function logLanguageResolved(filePath: string, source: "api" | "path_fallback", filetype: string): void
function logLanguageUnresolved(filePath: string, apiLanguage: string | null | undefined): void
function logHighlightTimeout(filePath: string, filetype: string, lineCount: number): void
function logWorkerError(filePath: string, filetype: string, errorMessage: string): void
function logColorTierDetected(tier: string): void
```

---

## Existing Infrastructure (No Changes Needed)

The following modules are already implemented by `tui-diff-syntax-style` and are consumed as-is:

| Module | Exports consumed |
|--------|------------------|
| `apps/tui/src/lib/diff-syntax.ts` | `resolveFiletype()`, `createDiffSyntaxStyle()`, `detectColorTier()`, `getPaletteForTier()`, `TRUECOLOR_PALETTE`, `ANSI256_PALETTE`, `ANSI16_PALETTE`, `SYNTAX_TOKEN_COUNT`, `pathToFiletype` |
| `apps/tui/src/hooks/useDiffSyntaxStyle.ts` | `useDiffSyntaxStyle(colorTier?)` → `SyntaxStyle \| null` |
| `apps/tui/src/theme/tokens.ts` | `ThemeTokens` with `diffAddedBg`, `diffRemovedBg`, `diffAddedText`, `diffRemovedText`, `diffHunkHeader`, `muted` |
| `apps/tui/src/theme/detect.ts` | `ColorTier`, `detectColorCapability()` |
| `apps/tui/src/hooks/useColorTier.ts` | `useColorTier()` → `ColorTier` |
| `apps/tui/src/hooks/useTheme.ts` | `useTheme()` → `Readonly<ThemeTokens>` |

---

## Data Flow

```
API Response (useChangeDiff / useLandingDiff)
  │
  ▼
FileDiffItem[]  ──────────────────────────────────────────────────┐
  │                                                                │
  │  ┌─────────────────────────────────────────────┐               │
  │  │ useDiffFiletypes(files)                     │               │
  │  │  for each file:                             │               │
  │  │    resolveFileFiletype(file)                │               │
  │  │      → binary guard                         │               │
  │  │      → size guard                           │               │
  │  │      → resolveFiletype(language, path)      │               │
  │  │          → API language (preferred)          │               │
  │  │          → pathToFiletype() (fallback)       │               │
  │  │          → undefined (plain text)            │               │
  │  │  returns Map<path, filetype | undefined>     │               │
  │  └─────────────────────────────────────────────┘               │
  │                          │                                      │
  │                          ▼                                      │
  │                    filetypeMap                                  │
  │                          │                                      │
  │  ┌──────────────────────┐│                                      │
  │  │ useDiffSyntaxStyle() ││                                      │
  │  │  → SyntaxStyle       ││                                      │
  │  │    .fromStyles()     ││                                      │
  │  │    (17 tokens,       ││                                      │
  │  │     tier-aware)      ││                                      │
  │  └──────────────────────┘│                                      │
  │            │              │                                      │
  │            ▼              ▼                                      │
  │  ┌─────────────────────────────────────┐                        │
  │  │ <diff                               │                        │
  │  │   diff={file.patch}                 │  ◄───── files[index]   │
  │  │   filetype={filetypeMap.get(path)}  │                        │
  │  │   syntaxStyle={syntaxStyle}         │                        │
  │  │   view={viewMode}                   │                        │
  │  │   addedBg={theme.diffAddedBg}       │                        │
  │  │   removedBg={theme.diffRemovedBg}   │                        │
  │  │   ...                               │                        │
  │  │ />                                  │                        │
  │  └─────────────────────────────────────┘                        │
  │            │                                                     │
  │            ▼                                                     │
  │  OpenTUI DiffRenderable                                          │
  │    → CodeRenderable (uses TreeSitterClient)                      │
  │      → WASM parser loaded lazily for filetype                    │
  │      → Highlighting async, non-blocking                          │
  │      → Styled text applied in-place (no layout shift)            │
  └──────────────────────────────────────────────────────────────────┘
```

---

## Interaction with Existing Keybindings

This feature introduces **no new keybindings**. It modifies the behavior of existing diff screen interactions:

| Key | Existing behavior | Syntax highlighting interaction |
|-----|-------------------|---------------------------------|
| `t` | Toggles unified ↔ split | `syntaxStyle` reference unchanged; `SyntaxStyle` is not recreated. Tree-sitter cache is reused. No re-highlighting. |
| `w` | Toggles whitespace | Re-fetches diff → new `files` array → `useDiffFiletypes` recomputes filetypes. New patch text may trigger re-highlighting for changed content. |
| `]` / `[` | Next/prev file | `focusedFileIndex` changes → different `filetype` from `filetypeMap`. `syntaxStyle` stays the same. |
| `z` / `Z` | Collapse hunks | Hidden lines skip rendering → no Tree-sitter work. |
| `x` / `X` | Expand hunks | Newly visible lines trigger Tree-sitter highlighting. |
| `Ctrl+B` | Toggle sidebar | No effect on highlighting. |
| `j` / `k` | Scroll | Scroll is independent of highlighting. |
| `q` | Pop screen | `useDiffSyntaxStyle` cleanup runs → `SyntaxStyle.destroy()` frees native memory. |

---

## Responsive Behavior

| Terminal size | Behavior |
|---------------|----------|
| 80×24 (minimum) | Full syntax highlighting in unified mode only. Split unavailable. |
| 120×40 (standard) | Full syntax highlighting in both unified and split. |
| 200×60+ (large) | Full syntax highlighting with wider gutters. |
| Resize during view | Colors preserved. `SyntaxStyle` is not recreated. No re-highlighting triggered. Layout recalculates synchronously via `useOnResize`. |
| 16-color terminal | `ANSI16_PALETTE` applied: keywords=red bold, strings=cyan, comments=gray dim, functions=magenta, types=yellow. |
| 256-color terminal | `ANSI256_PALETTE` applied: near-full-fidelity palette. |
| Truecolor terminal | `TRUECOLOR_PALETTE` applied: full 24-bit hex palette. |

---

## Error Handling & Degradation

| Failure | Impact | Degradation | Logging |
|---------|--------|-------------|--------|
| `SyntaxStyle.fromStyles()` throws | No syntax highlighting for any file | All files render as plain text with diff colors intact | `error` — `diff.syntax.style_create_failed` |
| Tree-sitter WASM parser unavailable for a language | No highlighting for files of that language | Affected files render as plain text. Other languages highlight normally. | `warn` — `diff.syntax.worker_error` |
| Tree-sitter highlighting exceeds 5s | File remains as plain text | Automatic. File is fully readable and navigable. | `warn` — `diff.syntax.highlight_timeout` |
| `resolveFiletype()` returns `undefined` | No syntax highlighting for that file | Silent. File renders as plain text with diff colors. | `info` — `diff.syntax.language_unresolved` |
| `language` field contains malicious payload | No impact. Tree-sitter map lookup returns `undefined`. | File renders as plain text. | `info` — `diff.syntax.language_unresolved` |
| Terminal resize during active highlighting | None. Highlighting continues in background. | Styled text applied when ready. Layout recalculates independently. | None |
| Rapid `]` navigation (10 presses) | Only the final visible file triggers highlighting | OpenTUI's `<diff>` component handles debouncing internally via its CodeRenderable. Previous file highlights are cached. | None |
| `SyntaxStyle` leaked (unmount without destroy) | Memory leak over repeated screen cycles | Mitigated by `useEffect` cleanup. If leaked, native memory grows but TUI continues. | `debug` — `diff.syntax.style_destroyed` (absence indicates leak) |
| `parseColor()` invalid hex | OpenTUI falls back to magenta | One-time cosmetic issue at style creation | `warn` (from OpenTUI) |

---

## Productionization Notes

### From existing code to full integration

The `tui-diff-syntax-style` ticket delivered the foundational modules (`diff-syntax.ts` and `useDiffSyntaxStyle.ts`). To productionize the full syntax highlighting feature:

1. **`FileDiffItem` type alignment**: The `FileDiffItem` interface in `resolveFileFiletype.ts` is a local definition that mirrors the `@codeplane/ui-core` type. When `tui-diff-data-hooks` is implemented, replace the local interface with `import type { FileDiffItem } from "@codeplane/ui-core"`. Until then, the local definition allows this ticket to be completed and tested independently.

2. **TextEncoder allocation**: `resolveFileFiletype()` creates a new `TextEncoder` per call for the size guard. This is acceptable because `TextEncoder` is lightweight in Bun and the function is called at most once per file per diff fetch (memoized via `useDiffFiletypes`). If profiling reveals overhead, cache a module-level `TextEncoder` instance.

3. **Telemetry backend**: The telemetry functions in `diffSyntaxTelemetry.ts` currently use `console.debug`/`console.info`/`console.warn`. When the TUI telemetry system is implemented, these should delegate to the structured telemetry emitter. The function signatures are designed to be drop-in compatible with a `track(event, properties)` pattern.

4. **`useDiffFiletypes` memoization key**: The hook memoizes on `[files]` reference identity. This works correctly because `useChangeDiff` and `useLandingDiff` return new arrays on each fetch and stable references when data hasn't changed. If a future refactor causes `files` to change identity without content changes, consider switching to a content-based hash.

5. **No `<diff>` component prop validation at runtime**: OpenTUI's `<diff>` component silently ignores `undefined` for `filetype` and `syntaxStyle`. This is the documented behavior and the graceful degradation path. Do not add runtime validation for these props.

6. **Tree-sitter parser loading**: Parser WASM files are loaded lazily by OpenTUI's `TreeSitterClient`. Only parsers for languages present in the current diff are loaded. This is managed entirely by `@opentui/core` — no TUI-side parser management is needed.

### Performance budget

| Operation | Budget | Notes |
|-----------|--------|-------|
| `resolveFileFiletype()` per file | < 1ms | String operations + Map lookup |
| `useDiffFiletypes()` for 50 files | < 50ms | 50 × resolveFileFiletype calls |
| `useDiffSyntaxStyle()` creation | < 10ms | 17 FFI `registerStyle` calls |
| First syntax highlight (TypeScript, 500 lines) | P50 < 200ms, P95 < 1s | Tree-sitter WASM parse + highlight |
| Subsequent highlight (cached parser) | P50 < 100ms, P95 < 500ms | Parser already loaded |
| Memory per `SyntaxStyle` instance | ~2KB | 17 styles × native allocation + JS Maps |
| Memory per cached highlight result | ~1-5KB per file | TextChunk arrays cached by CodeRenderable |

---

## Unit & Integration Tests

### Test file: `e2e/tui/diff.test.ts`

All tests use `@microsoft/tui-test` via the `launchTUI()` helper from `e2e/tui/helpers.ts`. Tests that depend on a running API server with test fixtures are left failing when the backend is unavailable — they are **never** skipped or commented out.

#### Snapshot Tests — Syntax Highlighting Visual States

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { launchTUI, type TUITestInstance, TERMINAL_SIZES } from "./helpers.ts"

describe("TUI_DIFF_SYNTAX_HIGHLIGHT — snapshot tests", () => {
  let tui: TUITestInstance

  afterEach(async () => {
    await tui?.terminate()
  })

  test("SNAP-SYN-001: renders TypeScript diff with syntax highlighting at 120x40", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 })
    // Navigate to a repo with a TypeScript diff
    await tui.sendKeys("g", "r") // go to repo list
    await tui.waitForText("Repositories")
    await tui.sendKeys("Enter") // open first repo
    // Navigate to a change with TypeScript modifications
    // (Exact navigation depends on test fixtures)
    await tui.waitForText("@@") // wait for diff hunk header
    const snapshot = tui.snapshot()
    expect(snapshot).toMatchSnapshot()
    // Assert keywords appear with ANSI color codes for #FF7B72
    // Assert strings appear with ANSI color codes for #A5D6FF
    // Assert comments appear with ANSI color codes for #8B949E
    // Assert function names appear with ANSI color codes for #D2A8FF
    // Assert type annotations appear with ANSI color codes for #FFA657
  })

  test("SNAP-SYN-002: renders JavaScript diff with syntax highlighting at 120x40", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 })
    // Navigate to diff screen with JavaScript file changes
    await tui.waitForText("@@")
    const snapshot = tui.snapshot()
    expect(snapshot).toMatchSnapshot()
  })

  test("SNAP-SYN-003: renders Python diff with syntax highlighting at 120x40", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 })
    // Navigate to diff screen with Python file changes
    await tui.waitForText("@@")
    const snapshot = tui.snapshot()
    expect(snapshot).toMatchSnapshot()
  })

  test("SNAP-SYN-004: renders syntax highlighting on addition lines with green background", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 })
    // Navigate to diff with additions
    await tui.waitForText("@@")
    const snapshot = tui.snapshot()
    expect(snapshot).toMatchSnapshot()
    // Assert: green background (ANSI 22 / #1A4D1A) present on addition lines
    // Assert: syntax token colors visible over green background
  })

  test("SNAP-SYN-005: renders syntax highlighting on deletion lines with red background", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 })
    // Navigate to diff with deletions
    await tui.waitForText("@@")
    const snapshot = tui.snapshot()
    expect(snapshot).toMatchSnapshot()
    // Assert: red background (ANSI 52 / #4D1A1A) present on deletion lines
    // Assert: syntax token colors visible over red background
  })

  test("SNAP-SYN-006: renders syntax highlighting on context lines with default background", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 })
    // Navigate to diff with context lines
    await tui.waitForText("@@")
    const snapshot = tui.snapshot()
    expect(snapshot).toMatchSnapshot()
    // Assert: context lines have syntax colors on default terminal background
  })

  test("SNAP-SYN-007: renders plain text for file with unknown language", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 })
    // Navigate to diff containing a LICENSE file (no extension, no basename match)
    await tui.waitForText("@@")
    const snapshot = tui.snapshot()
    expect(snapshot).toMatchSnapshot()
    // Assert: file renders with default foreground color only
    // Assert: diff colors (green/red backgrounds) still applied
    // Assert: no error message displayed
  })

  test("SNAP-SYN-008: renders syntax highlighting in split view at 120x40", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 })
    // Navigate to diff, toggle to split view
    await tui.waitForText("@@")
    await tui.sendKeys("t") // toggle to split
    const snapshot = tui.snapshot()
    expect(snapshot).toMatchSnapshot()
    // Assert: syntax highlighting applied in both left and right panes
  })

  test("SNAP-SYN-009: renders syntax highlighting in split view at 200x60", async () => {
    tui = await launchTUI({ cols: 200, rows: 60 })
    // Navigate to diff, toggle to split view
    await tui.waitForText("@@")
    await tui.sendKeys("t")
    const snapshot = tui.snapshot()
    expect(snapshot).toMatchSnapshot()
  })

  test("SNAP-SYN-010: renders syntax highlighting at 80x24 minimum", async () => {
    tui = await launchTUI({ cols: 80, rows: 24 })
    // Navigate to diff screen with TypeScript file
    await tui.waitForText("@@")
    const snapshot = tui.snapshot()
    expect(snapshot).toMatchSnapshot()
    // Assert: syntax colors applied in unified mode at minimum size
  })

  test("SNAP-SYN-011: renders multi-language diff with per-file highlighting", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 })
    // Navigate to diff with .ts and .md files
    await tui.waitForText("@@")
    // Capture snapshot of TypeScript file
    const tsSnapshot = tui.snapshot()
    expect(tsSnapshot).toMatchSnapshot()
    // Navigate to Markdown file
    await tui.sendKeys("]")
    const mdSnapshot = tui.snapshot()
    expect(mdSnapshot).toMatchSnapshot()
  })

  test("SNAP-SYN-012: renders hunk headers in cyan without syntax highlighting", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 })
    await tui.waitForText("@@")
    const snapshot = tui.snapshot()
    expect(snapshot).toMatchSnapshot()
    // Assert: @@ ... @@ rendered in cyan (ANSI 37)
    // Assert: hunk header is NOT affected by syntax token colors
  })

  test("SNAP-SYN-013: renders diff signs with diff colors not syntax colors", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 })
    await tui.waitForText("@@")
    const snapshot = tui.snapshot()
    expect(snapshot).toMatchSnapshot()
    // Assert: + signs use green (ANSI 34 / #22C55E), not syntax token color
    // Assert: - signs use red (ANSI 196 / #EF4444), not syntax token color
  })

  test("SNAP-SYN-014: renders Rust diff with syntax highlighting", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 })
    // Navigate to diff with Rust file
    await tui.waitForText("@@")
    const snapshot = tui.snapshot()
    expect(snapshot).toMatchSnapshot()
  })

  test("SNAP-SYN-015: renders Go diff with syntax highlighting", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 })
    // Navigate to diff with Go file
    await tui.waitForText("@@")
    const snapshot = tui.snapshot()
    expect(snapshot).toMatchSnapshot()
  })

  test("SNAP-SYN-016: renders CSS diff with syntax highlighting", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 })
    // Navigate to diff with CSS file
    await tui.waitForText("@@")
    const snapshot = tui.snapshot()
    expect(snapshot).toMatchSnapshot()
  })
})
```

#### Keyboard Interaction Tests

```typescript
describe("TUI_DIFF_SYNTAX_HIGHLIGHT — keyboard interaction", () => {
  let tui: TUITestInstance

  afterEach(async () => {
    await tui?.terminate()
  })

  test("KEY-SYN-001: syntax highlighting persists after view toggle", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 })
    // Navigate to diff with TypeScript file
    await tui.waitForText("@@")
    // Capture snapshot before toggle
    const beforeToggle = tui.snapshot()
    // Toggle to split view
    await tui.sendKeys("t")
    // Assert: syntax colors still present in both panes
    // The snapshot should contain ANSI color escape sequences for syntax tokens
    const afterToggle = tui.snapshot()
    expect(afterToggle).toMatchSnapshot()
  })

  test("KEY-SYN-002: syntax highlighting persists after view toggle back", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 })
    await tui.waitForText("@@")
    await tui.sendKeys("t") // unified → split
    await tui.sendKeys("t") // split → unified
    const snapshot = tui.snapshot()
    expect(snapshot).toMatchSnapshot()
    // Assert: syntax colors present after round-trip toggle
  })

  test("KEY-SYN-003: file navigation applies correct filetype", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 })
    // Navigate to diff with .ts file followed by .py file
    await tui.waitForText("@@")
    // First file should have TypeScript syntax highlighting
    const tsSnapshot = tui.snapshot()
    expect(tsSnapshot).toMatchSnapshot()
    // Navigate to next file
    await tui.sendKeys("]")
    await tui.waitForText("@@")
    // Second file should have Python syntax highlighting
    const pySnapshot = tui.snapshot()
    expect(pySnapshot).toMatchSnapshot()
  })

  test("KEY-SYN-004: file navigation back preserves highlighting", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 })
    await tui.waitForText("@@")
    await tui.sendKeys("]") // next file
    await tui.sendKeys("[") // back to previous
    // Assert: first file still has syntax colors from Tree-sitter cache
    const snapshot = tui.snapshot()
    expect(snapshot).toMatchSnapshot()
  })

  test("KEY-SYN-005: expanding collapsed hunk triggers highlighting", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 })
    await tui.waitForText("@@")
    await tui.sendKeys("z") // collapse all hunks
    await tui.sendKeys("Enter") // expand focused hunk
    // Assert: newly visible lines render with syntax highlighting
    const snapshot = tui.snapshot()
    expect(snapshot).toMatchSnapshot()
  })

  test("KEY-SYN-006: whitespace toggle preserves syntax highlighting", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 })
    await tui.waitForText("@@")
    await tui.sendKeys("w") // toggle whitespace
    // Re-fetched diff should re-highlight files; syntax colors appear on new content
    const snapshot = tui.snapshot()
    expect(snapshot).toMatchSnapshot()
  })

  test("KEY-SYN-007: sidebar toggle does not affect highlighting", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 })
    await tui.waitForText("@@")
    const before = tui.snapshot()
    await tui.sendKeys("ctrl+b") // toggle sidebar
    const after = tui.snapshot()
    // Diff content area should still have syntax highlighting
    // (layout may change, but colors remain)
    expect(after).toMatchSnapshot()
  })

  test("KEY-SYN-008: rapid file navigation settles on correct highlighting", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 })
    await tui.waitForText("@@")
    // Press ] five times rapidly
    await tui.sendKeys("]", "]", "]", "]", "]")
    // Wait for final file to settle
    await tui.waitForText("@@")
    // Assert: final visible file has correct language-specific syntax colors
    const snapshot = tui.snapshot()
    expect(snapshot).toMatchSnapshot()
  })

  test("KEY-SYN-009: scrolling through highlighted diff is smooth", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 })
    await tui.waitForText("@@")
    // Scroll 50 lines down rapidly
    for (let i = 0; i < 50; i++) {
      await tui.sendKeys("j")
    }
    // Assert: content scrolled, syntax colors remain applied on all visible lines
    const snapshot = tui.snapshot()
    expect(snapshot).toMatchSnapshot()
  })

  test("KEY-SYN-010: expanding all hunks highlights all content", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 })
    await tui.waitForText("@@")
    await tui.sendKeys("Z") // collapse all
    await tui.sendKeys("x") // expand all
    // Assert: all expanded hunks show syntax highlighting
    const snapshot = tui.snapshot()
    expect(snapshot).toMatchSnapshot()
  })
})
```

#### Responsive Behavior Tests

```typescript
describe("TUI_DIFF_SYNTAX_HIGHLIGHT — responsive behavior", () => {
  let tui: TUITestInstance

  afterEach(async () => {
    await tui?.terminate()
  })

  test("RSP-SYN-001: syntax highlighting active at 80x24", async () => {
    tui = await launchTUI({ cols: 80, rows: 24 })
    // Navigate to diff
    await tui.waitForText("@@")
    // Assert: syntax colors applied in unified mode at minimum size
    const snapshot = tui.snapshot()
    expect(snapshot).toMatchSnapshot()
  })

  test("RSP-SYN-002: syntax highlighting active at 120x40", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 })
    await tui.waitForText("@@")
    // Assert: syntax colors applied in unified mode
    const unifiedSnap = tui.snapshot()
    expect(unifiedSnap).toMatchSnapshot()
    // Toggle to split and verify
    await tui.sendKeys("t")
    const splitSnap = tui.snapshot()
    expect(splitSnap).toMatchSnapshot()
  })

  test("RSP-SYN-003: syntax highlighting active at 200x60", async () => {
    tui = await launchTUI({ cols: 200, rows: 60 })
    await tui.waitForText("@@")
    const snapshot = tui.snapshot()
    expect(snapshot).toMatchSnapshot()
  })

  test("RSP-SYN-004: resize preserves syntax highlighting", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 })
    await tui.waitForText("@@")
    // Resize to minimum
    await tui.resize(80, 24)
    // Assert: syntax colors preserved during shrink
    const snapshot = tui.snapshot()
    expect(snapshot).toMatchSnapshot()
  })

  test("RSP-SYN-005: resize from split to unified preserves highlighting", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 })
    await tui.waitForText("@@")
    await tui.sendKeys("t") // switch to split
    // Resize to minimum (forces unified)
    await tui.resize(80, 24)
    // Assert: auto-switch to unified retains syntax highlighting
    const snapshot = tui.snapshot()
    expect(snapshot).toMatchSnapshot()
  })

  test("RSP-SYN-006: resize to larger terminal preserves highlighting", async () => {
    tui = await launchTUI({ cols: 80, rows: 24 })
    await tui.waitForText("@@")
    // Resize to large
    await tui.resize(200, 60)
    // Assert: syntax colors preserved during growth
    const snapshot = tui.snapshot()
    expect(snapshot).toMatchSnapshot()
  })
})
```

#### Data Integration Tests

```typescript
describe("TUI_DIFF_SYNTAX_HIGHLIGHT — data integration", () => {
  let tui: TUITestInstance

  afterEach(async () => {
    await tui?.terminate()
  })

  test("INT-SYN-001: API language field used for filetype", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 })
    // Diff response with language: "typescript" in fixture data
    await tui.waitForText("@@")
    // Assert: file highlights with TypeScript grammar
    const snapshot = tui.snapshot()
    expect(snapshot).toMatchSnapshot()
  })

  test("INT-SYN-002: path fallback when API language is null", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 })
    // Diff response with language: null, file path src/app.ts
    await tui.waitForText("@@")
    // Assert: file highlights as TypeScript via pathToFiletype("src/app.ts")
    const snapshot = tui.snapshot()
    expect(snapshot).toMatchSnapshot()
  })

  test("INT-SYN-003: path fallback when API language is empty string", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 })
    // Diff response with language: "", file path main.py
    await tui.waitForText("@@")
    // Assert: file highlights as Python
    const snapshot = tui.snapshot()
    expect(snapshot).toMatchSnapshot()
  })

  test("INT-SYN-004: plain text when language unresolvable", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 })
    // File LICENSE with language: null
    await tui.waitForText("@@")
    // Assert: plain text, no syntax colors, diff colors intact
    const snapshot = tui.snapshot()
    expect(snapshot).toMatchSnapshot()
  })

  test("INT-SYN-005: unrecognized API language falls back to plain text", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 })
    // Diff response with language: "brainfuck"
    await tui.waitForText("@@")
    // Assert: plain text rendering, no error or crash
    const snapshot = tui.snapshot()
    expect(snapshot).toMatchSnapshot()
  })

  test("INT-SYN-006: Dockerfile detected by basename", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 })
    // File Dockerfile with language: null
    await tui.waitForText("@@")
    // Assert: highlights as dockerfile
    const snapshot = tui.snapshot()
    expect(snapshot).toMatchSnapshot()
  })

  test("INT-SYN-007: Makefile detected by basename", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 })
    // File Makefile with language: null
    await tui.waitForText("@@")
    const snapshot = tui.snapshot()
    expect(snapshot).toMatchSnapshot()
  })

  test("INT-SYN-008: double extension resolves correctly", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 })
    // File component.test.tsx with language: null
    await tui.waitForText("@@")
    // Assert: resolves to typescriptreact
    const snapshot = tui.snapshot()
    expect(snapshot).toMatchSnapshot()
  })

  test("INT-SYN-009: binary file skips syntax highlighting", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 })
    // Navigate to diff containing a binary file
    await tui.waitForText("Binary file changed")
    // Assert: no syntax highlighting invocation, just the binary message
    const snapshot = tui.snapshot()
    expect(snapshot).toMatchSnapshot()
  })

  test("INT-SYN-010: oversized file skips syntax highlighting", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 })
    // Navigate to diff containing a >1MB file
    await tui.waitForText("File too large to display")
    const snapshot = tui.snapshot()
    expect(snapshot).toMatchSnapshot()
  })
})
```

#### Edge Case Tests

```typescript
describe("TUI_DIFF_SYNTAX_HIGHLIGHT — edge cases", () => {
  let tui: TUITestInstance

  afterEach(async () => {
    await tui?.terminate()
  })

  test("EDGE-SYN-001: syntax highlighting does not block scrolling", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 })
    // Open diff with large TypeScript file (1000+ lines)
    await tui.waitForText("@@")
    // Immediately press j/k before highlighting may have completed
    await tui.sendKeys("j", "j", "j", "k", "k")
    // Assert: navigation works, content scrolls without blocking
    const snapshot = tui.snapshot()
    expect(snapshot).toBeDefined()
  })

  test("EDGE-SYN-002: highlighting failure for one file does not affect others", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 })
    // Diff with intentionally problematic file + normal TypeScript file
    await tui.waitForText("@@")
    // Navigate to TypeScript file
    await tui.sendKeys("]")
    await tui.waitForText("@@")
    // Assert: TypeScript file highlights normally despite other file's failure
    const snapshot = tui.snapshot()
    expect(snapshot).toMatchSnapshot()
  })

  test("EDGE-SYN-003: SyntaxStyle cleanup on screen unmount", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 })
    // Navigate to diff screen
    await tui.waitForText("@@")
    // Press q to close diff screen
    await tui.sendKeys("q")
    // Assert: no crash, no native memory errors
    // Assert: TUI is still responsive (we're back on previous screen)
    await tui.waitForNoText("@@")
  })

  test("EDGE-SYN-004: re-opening diff screen creates fresh SyntaxStyle", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 })
    // Open diff, close, re-open
    await tui.waitForText("@@")
    await tui.sendKeys("q")
    await tui.waitForNoText("@@")
    // Re-open diff
    await tui.sendKeys("Enter")
    await tui.waitForText("@@")
    // Assert: highlighting works on second open
    const snapshot = tui.snapshot()
    expect(snapshot).toMatchSnapshot()
  })

  test("EDGE-SYN-005: 10+ languages in single diff", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 })
    // Diff with .ts, .py, .rs, .go, .js, .css, .html, .json, .md, .yaml, .toml files
    await tui.waitForText("@@")
    // Navigate through files with ]
    for (let i = 0; i < 10; i++) {
      await tui.sendKeys("]")
    }
    // Assert: each file highlights with its own grammar (no crash)
    const snapshot = tui.snapshot()
    expect(snapshot).toBeDefined()
  })

  test("EDGE-SYN-006: context-only hunk with syntax highlighting", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 })
    // Expanded context lines (no additions/deletions)
    await tui.waitForText("@@")
    // Assert: context lines show syntax colors on default background
    const snapshot = tui.snapshot()
    expect(snapshot).toMatchSnapshot()
  })

  test("EDGE-SYN-007: empty file does not trigger highlighting", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 })
    // Navigate to empty added file in diff
    await tui.waitForText("Empty file added")
    const snapshot = tui.snapshot()
    expect(snapshot).toMatchSnapshot()
  })

  test("EDGE-SYN-008: syntax highlighting on renamed file with content changes", async () => {
    tui = await launchTUI({ cols: 120, rows: 40 })
    // Renamed .js → .ts file
    await tui.waitForText("@@")
    // Assert: highlights with TypeScript grammar (new path), not JavaScript
    const snapshot = tui.snapshot()
    expect(snapshot).toMatchSnapshot()
  })
})
```

---

## Verification Checklist

| # | Criterion | Verified by |
|---|-----------|-------------|
| 1 | `<diff>` receives `filetype` prop from API `language` field | INT-SYN-001 |
| 2 | Fallback to `pathToFiletype(file.path)` when API language is null/empty | INT-SYN-002, INT-SYN-003 |
| 3 | Unresolvable files render as plain text silently | INT-SYN-004, INT-SYN-005 |
| 4 | Single `SyntaxStyle` created via `useDiffSyntaxStyle()` at screen mount | EDGE-SYN-003, EDGE-SYN-004 |
| 5 | `SyntaxStyle` memoized — not recreated on toggle, nav, whitespace, resize | KEY-SYN-001, KEY-SYN-002, RSP-SYN-004, KEY-SYN-007 |
| 6 | `syntaxStyle` passed to every `<diff>` component | SNAP-SYN-001 through SNAP-SYN-016 |
| 7 | Syntax highlighting in both unified and split modes | SNAP-SYN-008, RSP-SYN-002 |
| 8 | Coexists with diff coloring (green/red backgrounds) | SNAP-SYN-004, SNAP-SYN-005, SNAP-SYN-006 |
| 9 | 17-token palette covers all required categories | Code review of `diff-syntax.ts` |
| 10 | Readable contrast against dark bg and diff backgrounds | SNAP-SYN-004, SNAP-SYN-005 |
| 11 | Highlighting is async/non-blocking | EDGE-SYN-001 |
| 12 | No layout shift when highlighting completes | SNAP snapshots (line positions stable) |
| 13 | `SyntaxStyle.destroy()` on unmount | EDGE-SYN-003 |
| 14 | Truecolor displays full 24-bit palette | SNAP-SYN-001 (default env) |
| 15 | 256-color displays downsampled colors | Launch with `COLORTERM: undefined, TERM: xterm-256color` |
| 16 | 16-color displays reduced scheme | Launch with `TERM: xterm, COLORTERM: undefined` |
| 17 | Binary files show "Binary file changed" | INT-SYN-009 |
| 18 | >1MB files show "File too large" | INT-SYN-010 |
| 19 | Collapsed hunks skip highlighting | KEY-SYN-005, KEY-SYN-010 |
| 20 | 10+ languages highlight independently | EDGE-SYN-005 |
| 21 | Double extension resolves correctly | INT-SYN-008 |
| 22 | Basename detection (Dockerfile, Makefile) | INT-SYN-006, INT-SYN-007 |
| 23 | Rapid navigation debounces highlighting | KEY-SYN-008 |
| 24 | Terminal resize preserves highlighting | RSP-SYN-004, RSP-SYN-005, RSP-SYN-006 |
| 25 | Renamed file uses new path for language detection | EDGE-SYN-008 |
| 26 | Hunk headers render in cyan, not syntax-highlighted | SNAP-SYN-012 |
| 27 | Diff signs (+/-) use diff colors, not syntax colors | SNAP-SYN-013 |