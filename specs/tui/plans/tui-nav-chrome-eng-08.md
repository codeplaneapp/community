# Implementation Plan: Deep-link Argument Parser and Stack Builder (tui-nav-chrome-eng-08)

This document outlines the step-by-step implementation plan to refactor the TUI's deep-link launch system into a robust, three-step pipeline of pure functions.

## Phase 1: Foundation (Types and Constants)
**Goal:** Define the data structures and boundary constraints for the deep-link pipeline.
**Files to create:**
1. **`apps/tui/src/deep-link/types.ts`**
   - Export `RawDeepLinkArgs` interface (`screen?`, `repo?`, `org?` as strings).
   - Export `DeepLinkValidationResult` as a discriminated union (`valid: true` with normalized fields, or `valid: false` with `error` string).
   - Export `DeepLinkStackResult` interface (`stack: ScreenEntry[]`, `error?: string`).
2. **`apps/tui/src/deep-link/constants.ts`**
   - Define `SCREEN_ID_MAP` mapping 13 canonical CLI string inputs to internal `ScreenName` enums.
   - Define `REPO_REQUIRED_SCREENS` set (`issues`, `landings`, `workflows`, `wiki`).
   - Define `REPO_REGEX` (`/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/`) and `ORG_REGEX` (`/^[a-zA-Z0-9_.-]+$/`).
   - Define `CONTROL_CHAR_REGEX` to strip ANSI and control chars (`/[\x00-\x09\x0B-\x1F]|\x1B\[[0-9;]*[A-Za-z]/g`).
   - Define length limits (`SCREEN_MAX_LENGTH = 32`, `REPO_MAX_LENGTH = 128`, `REPO_SEGMENT_MAX_LENGTH = 64`, `ORG_MAX_LENGTH = 64`) and error truncation limits (`ERROR_TRUNCATE_SCREEN = 32`, etc.).

## Phase 2: Argument Parser
**Goal:** Extract raw flag values from `process.argv` without validation or side effects.
**Files to create:**
1. **`apps/tui/src/deep-link/parser.ts`**
   - Implement and export `parseDeepLinkArgs(argv: string[]): RawDeepLinkArgs`.
   - Iterate through arguments, safely checking if the next token is a value (ensuring it exists and does not start with `--`).
   - Support `--screen`, `--repo`, and `--org`, with last-occurrence-wins behavior for duplicated flags.

## Phase 3: Input Validation and Sanitization
**Goal:** Normalize inputs, enforce constraints, and ensure error messages are safe for terminal display.
**Files to create:**
1. **`apps/tui/src/deep-link/validator.ts`**
   - Implement `sanitizeForDisplay(raw: string, maxLen: number)` using `CONTROL_CHAR_REGEX` to strip malicious characters and truncate for safe display.
   - Implement `validateDeepLinkArgs(args: RawDeepLinkArgs): DeepLinkValidationResult`.
   - Enforce validation order: Screen format (length, allowlist) -> Repo format (length, regex, segment lengths) -> Org format (length, regex) -> Context dependencies (repo-required screens).

## Phase 4: Stack Pre-Population
**Goal:** Build the initial `ScreenEntry[]` array based on the validated arguments.
**Files to create:**
1. **`apps/tui/src/deep-link/stack-builder.ts`**
   - Import `createEntry` from `../providers/NavigationProvider.js` to ensure uniform UUID and breadcrumb generation.
   - Implement `buildInitialStack(validated: DeepLinkValidationResult): DeepLinkStackResult`.
   - Cover all pre-population rules (e.g., fallback to Dashboard on error, org-context promotion, inserting RepoOverview intermediate screens).

## Phase 5: Integration and Clean-up
**Goal:** Expose the module and wire it into the TUI's bootstrap sequence.
**Files to create/modify:**
1. **`apps/tui/src/deep-link/index.ts`** (New)
   - Add barrel exports for parser, validator, stack builder, constants, and types.
2. **`apps/tui/src/index.tsx`** (Modify)
   - Replace the legacy `buildInitialStack` call with the new 3-step pipeline: `parseDeepLinkArgs` -> `validateDeepLinkArgs` -> `buildInitialStack`.
   - Ensure `deepLinkResult.error` is forwarded correctly for transient status bar display.
3. **`apps/tui/src/lib/terminal.ts`** (Modify)
   - Remove `--screen` and `--repo` fields from the `TUILaunchOptions` interface.
   - Remove parsing logic for `--screen` and `--repo` from `parseCLIArgs`.
4. **`apps/tui/src/navigation/deepLinks.ts`** (Modify)
   - Add `@deprecated` JSDoc annotation, retaining it temporarily for safety.
5. **`apps/tui/src/navigation/index.ts`** (Modify)
   - Remove exports of deprecated `buildInitialStack`, `DeepLinkArgs`, and `DeepLinkResult`.

## Phase 6: Comprehensive Testing
**Goal:** Ensure 100% compliance with edge cases, terminal safety, and backwards compatibility.
**Files to modify:**
1. **`e2e/tui/app-shell.test.ts`**
   - **Unit Tests:** Append pure-function tests using `bun:test` for `parseDeepLinkArgs` (DL-PARSE-*), `sanitizeForDisplay` (DL-SAN-*), `validateDeepLinkArgs` (DL-VAL-*), and `buildInitialStack` (DL-STACK-*).
   - **E2E Tests:** Append `launchTUI` tests (DL-E2E-SNAP-*, DL-E2E-KEY-*, DL-E2E-RESP-*, DL-E2E-ORG-*) verifying terminal snapshot renderings, `q` back-navigation paths, size constraints, and org deep links.
   - Verify existing deep-link tests (NAV-DEEP-001 through NAV-DEEP-006) continue to pass. Any tests failing due to unimplemented backends should remain failing as specified.