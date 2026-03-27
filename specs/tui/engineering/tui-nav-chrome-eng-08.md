# Engineering Specification: `tui-nav-chrome-eng-08`

## Deep-link argument parser and stack builder

**Ticket:** tui-nav-chrome-eng-08
**Status:** Not started
**Depends on:** tui-nav-chrome-eng-01 (NavigationProvider, ScreenEntry types, screen registry)
**Feature flag:** TUI_DEEP_LINK_LAUNCH (from TUI_APP_SHELL)

---

## 1. Overview

This ticket refactors the TUI's deep-link launch system from a monolithic `buildInitialStack()` function in `navigation/deepLinks.ts` into a three-step pipeline of pure functions in a dedicated `deep-link/` module. When a user launches `codeplane tui --screen issues --repo acme/api`, three discrete units of work execute synchronously before the React tree mounts:

1. **`parseDeepLinkArgs(argv)`** — Extracts `--screen`, `--repo`, and `--org` flag values from `process.argv`.
2. **`validateDeepLinkArgs(args)`** — Validates extracted values against an allowlist (screen IDs), regex patterns (repo/org slugs), and boundary constraints (max length, control character stripping). Returns a structured result with normalized values or error diagnostics.
3. **`buildInitialStack(validatedArgs)`** — Converts validated arguments into a `ScreenEntry[]` following the spec's stack pre-population rules, so backward navigation via `q` traverses the logical intermediate screens.

These three functions are pure — no side effects, no React context, no API calls. They execute during the bootstrap sequence (between `assertTTY()` and renderer creation in `index.tsx`). This separation enables comprehensive unit testing without any terminal or React infrastructure.

### 1.1 Current State

The existing implementation lives in two files:
- `apps/tui/src/lib/terminal.ts` — `parseCLIArgs()` extracts `--screen` and `--repo` (but not `--org`) alongside `--debug` and environment variables. Uses the unsafe `argv[++i]` pattern that unconditionally consumes the next token.
- `apps/tui/src/navigation/deepLinks.ts` — `buildInitialStack()` does validation and stack construction in a single function. It handles repo format validation (simple slash-split check), unknown screen detection, and repo-scoped screen requirements. Exports `DeepLinkArgs` and `DeepLinkResult` interfaces.

The existing implementation has these deficiencies that this ticket addresses:
- **No `--org` support in the CLI parser**: `parseCLIArgs()` does not extract `--org`. The `DeepLinkArgs` interface accepts `org?: string` but it's only passed through as a param — never parsed from argv.
- **No input length limits**: Pathologically long inputs could cause regex backtracking. The existing `args.repo.split("/")` has no length guard.
- **No control character sanitization**: Crafted `--screen` or `--repo` values can inject ANSI escape sequences into error messages displayed in the status bar (e.g., `--screen "\x1B[31mmalicious\x1B[0m"`).
- **Mixed concerns**: Parsing, validation, and stack building are combined in `buildInitialStack()`. Parsing is split between `parseCLIArgs()` and the deep-link function.
- **Non-discriminated error result**: `DeepLinkResult` has `error?: string` which callers can forget to check. The `error` is currently computed but never displayed — `index.tsx` ignores `deepLinkResult.error`.
- **Legacy aliases**: Includes `landing-requests`, `repositories`, `repo-detail` in the screen ID map — not in the 13-screen canonical set from the ticket description.
- **Weak repo validation**: Only checks `parts.length !== 2 || !parts[0] || !parts[1]` — no character class restriction, allowing `inv@lid/r&po` through.

### 1.2 Design Principles

- **Parse → Validate → Build**: Three pure functions with explicit boundaries.
- **Discriminated union for validation**: Callers cannot forget to check errors.
- **Reuse `createEntry` from `NavigationProvider`**: No duplication of the entry creation logic. The existing `createEntry()` at `apps/tui/src/providers/NavigationProvider.tsx:18` generates UUIDs, looks up `screenRegistry` for breadcrumb labels, and returns proper `ScreenEntry` objects.
- **Constants as single source of truth**: All screen ID mappings, regex patterns, and limits are centralized in `constants.ts`.
- **Terminal injection prevention**: All error display values are sanitized before being shown.

---

## 2. File Inventory

| File | Purpose | New/Existing |
|------|---------|-------------|
| `apps/tui/src/deep-link/types.ts` | Shared types: `RawDeepLinkArgs`, `DeepLinkValidationResult`, `DeepLinkStackResult` | New |
| `apps/tui/src/deep-link/constants.ts` | Allowlists, regex patterns, truncation limits | New |
| `apps/tui/src/deep-link/parser.ts` | `parseDeepLinkArgs(argv)` — flag extraction from argv | New |
| `apps/tui/src/deep-link/validator.ts` | `validateDeepLinkArgs(args)`, `sanitizeForDisplay()` — input validation and normalization | New |
| `apps/tui/src/deep-link/stack-builder.ts` | `buildInitialStack(validatedArgs)` — stack pre-population | New |
| `apps/tui/src/deep-link/index.ts` | Barrel exports | New |
| `apps/tui/src/index.tsx` | Updated bootstrap to use new deep-link module; pass error to `LoadingProvider` | Existing (modify) |
| `apps/tui/src/lib/terminal.ts` | Remove `--screen`/`--repo` from `TUILaunchOptions` and `parseCLIArgs` | Existing (modify) |
| `apps/tui/src/providers/LoadingProvider.tsx` | Add `initialStatusBarError` prop to display deep-link errors on launch | Existing (modify) |
| `apps/tui/src/navigation/deepLinks.ts` | Mark `@deprecated`, keep temporarily for migration safety | Existing (modify) |
| `apps/tui/src/navigation/index.ts` | Remove deprecated deep-link exports | Existing (modify) |
| `e2e/tui/app-shell.test.ts` | Unit tests (pure function imports) and E2E tests for deep-link launch | Existing (append) |

---

## 3. Detailed Design

### 3.1 `apps/tui/src/deep-link/types.ts` — Shared Types

```typescript
import type { ScreenEntry } from "../router/types.js";

/**
 * Raw parsed output from CLI argv. All values are raw strings
 * exactly as the user typed them (no normalization, no validation).
 */
export interface RawDeepLinkArgs {
  /** Raw --screen value, undefined if flag not present */
  screen?: string;
  /** Raw --repo value, undefined if flag not present */
  repo?: string;
  /** Raw --org value, undefined if flag not present */
  org?: string;
}

/**
 * Validation result from validateDeepLinkArgs().
 * Discriminated union: callers MUST check `valid` before accessing fields.
 */
export type DeepLinkValidationResult =
  | {
      valid: true;
      /** Screen ID normalized to lowercase, mapped to canonical ID */
      normalizedScreen?: string;
      /** Parsed repo owner/name, undefined if --repo not provided */
      repo?: { owner: string; name: string };
      /** Parsed org slug, undefined if --org not provided */
      org?: string;
    }
  | {
      valid: false;
      /** Human-readable error message, already truncated and sanitized */
      error: string;
    };

/**
 * Result of buildInitialStack(). Always contains a non-empty stack.
 * May contain an error message for transient status bar display.
 */
export interface DeepLinkStackResult {
  /** Pre-populated navigation stack. Always has at least one entry (Dashboard). */
  stack: ScreenEntry[];
  /**
   * Non-empty when validation failed or screen requires missing context.
   * Displayed in the status bar for 5 seconds on launch via LoadingProvider.
   */
  error?: string;
}
```

**Design rationale:**
- `RawDeepLinkArgs` is intentionally stringly-typed. Validation converts raw strings into typed, normalized values.
- `DeepLinkValidationResult` uses a discriminated union so TypeScript enforces error handling at call sites. The existing `DeepLinkResult` has `error?: string` which callers can silently ignore.
- `DeepLinkStackResult.stack` returns `ScreenEntry[]` directly, matching what `NavigationProvider.initialStack` expects (see `NavigationProviderProps` at `providers/NavigationProvider.tsx:8-16`) — no coercion needed.

### 3.2 `apps/tui/src/deep-link/constants.ts` — Allowlists, Regex, Limits

```typescript
import { ScreenName } from "../router/types.js";

/**
 * Map of CLI-facing screen ID strings to internal ScreenName enum values.
 * Keys are lowercase. Case-insensitive matching is achieved by lowercasing
 * the user's input before lookup.
 *
 * This is the SINGLE SOURCE OF TRUTH for valid deep-link screen IDs.
 * Adding a new deep-linkable screen requires adding one entry here.
 */
export const SCREEN_ID_MAP: Readonly<Record<string, ScreenName>> = {
  dashboard:     ScreenName.Dashboard,
  repos:         ScreenName.RepoList,
  issues:        ScreenName.Issues,
  landings:      ScreenName.Landings,
  workspaces:    ScreenName.Workspaces,
  workflows:     ScreenName.Workflows,
  search:        ScreenName.Search,
  notifications: ScreenName.Notifications,
  agents:        ScreenName.Agents,
  settings:      ScreenName.Settings,
  orgs:          ScreenName.Organizations,
  sync:          ScreenName.Sync,
  wiki:          ScreenName.Wiki,
} as const;

/**
 * Set of screen IDs that require --repo context.
 * If the user provides one of these screens without --repo,
 * validation produces a specific error.
 */
export const REPO_REQUIRED_SCREENS: ReadonlySet<string> = new Set([
  "issues",
  "landings",
  "workflows",
  "wiki",
]);

/**
 * Regex for validating --repo values.
 * Format: OWNER/REPO where each segment is [a-zA-Z0-9_.-]+
 * Max total length enforced separately (128 chars).
 *
 * Both anchored (^...$) and using character classes without quantifier nesting,
 * making it immune to ReDoS.
 */
export const REPO_REGEX = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;

/**
 * Regex for validating --org values.
 * Format: slug of [a-zA-Z0-9_.-]+
 * Max total length enforced separately (64 chars).
 */
export const ORG_REGEX = /^[a-zA-Z0-9_.-]+$/;

/**
 * Regex for stripping control characters from error message display values.
 * Matches ASCII 0x00-0x1F (except 0x0A newline) and ANSI escape sequences.
 */
export const CONTROL_CHAR_REGEX = /[\x00-\x09\x0B-\x1F]|\x1B\[[0-9;]*[A-Za-z]/g;

// --- Boundary constraints ---

/** Max length for --screen value before rejection */
export const SCREEN_MAX_LENGTH = 32;

/** Max length for --repo value before rejection */
export const REPO_MAX_LENGTH = 128;

/** Max length for each repo segment (owner or name) */
export const REPO_SEGMENT_MAX_LENGTH = 64;

/** Max length for --org value before rejection */
export const ORG_MAX_LENGTH = 64;

// --- Error message truncation limits ---

/** Truncation limit for unknown screen values in error messages */
export const ERROR_TRUNCATE_SCREEN = 32;

/** Truncation limit for invalid repo values in error messages */
export const ERROR_TRUNCATE_REPO = 64;

/** Truncation limit for invalid org values in error messages */
export const ERROR_TRUNCATE_ORG = 32;
```

**Design rationale:**
- All constants are `Readonly` or `ReadonlySet` to prevent accidental mutation.
- Regex patterns are precompiled module-level constants, not constructed per call.
- The existing `navigation/deepLinks.ts` includes legacy aliases (`landing-requests`, `repositories`, `repo-detail`). The new module drops these — only the 13 canonical screen IDs from the ticket description are supported.
- `CONTROL_CHAR_REGEX` strips both raw control characters and ANSI escape sequences to prevent terminal injection via crafted `--screen` or `--repo` values.
- The existing `deepLinks.ts` `resolveScreenName()` uses 16 entries. This reduces to exactly 13 — matching the ticket's supported screen list.

### 3.3 `apps/tui/src/deep-link/parser.ts` — Argument Parsing

```typescript
import type { RawDeepLinkArgs } from "./types.js";

/**
 * Parse deep-link flags from process.argv.
 *
 * Extracts --screen, --repo, and --org values from the argument vector.
 * No validation or normalization is performed — raw string values are
 * returned exactly as provided by the user.
 *
 * Unknown flags are silently ignored (they may be consumed by other
 * parts of the CLI bootstrap like --debug or --api-url).
 *
 * @param argv - The argument vector, typically process.argv.slice(2)
 * @returns Raw parsed arguments with optional screen, repo, org fields
 *
 * @example
 * parseDeepLinkArgs(["--screen", "issues", "--repo", "acme/api"])
 * // => { screen: "issues", repo: "acme/api" }
 *
 * @example
 * parseDeepLinkArgs(["--screen"])  // missing value
 * // => { screen: undefined }  // flag present but no value
 *
 * @example
 * parseDeepLinkArgs([])  // no deep-link flags
 * // => {}
 */
export function parseDeepLinkArgs(argv: string[]): RawDeepLinkArgs {
  const args: RawDeepLinkArgs = {};

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];

    // Only consume the next token as a value if it exists and does not
    // look like another flag (starts with "--"). This prevents
    // --screen --repo from treating --repo as the screen value.
    const hasValue = value !== undefined && !value.startsWith("--");

    switch (flag) {
      case "--screen":
        if (hasValue) {
          args.screen = value;
          i++; // skip the value token
        }
        break;
      case "--repo":
        if (hasValue) {
          args.repo = value;
          i++;
        }
        break;
      case "--org":
        if (hasValue) {
          args.org = value;
          i++;
        }
        break;
      // All other flags are ignored — handled by parseCLIArgs in lib/terminal.ts
    }
  }

  return args;
}
```

**Design rationale:**
- **Flag-then-value convention**: Each deep-link flag expects the next argv token as its value. If the next token starts with `--`, it's treated as another flag and the current flag gets `undefined`.
- **Last-occurrence wins**: If `--screen` appears twice, the second value overwrites the first. This is standard POSIX behavior.
- **No lowercasing here**: Case normalization is the validator's job, not the parser's. Parser is dumb extraction.
- **No side effects**: This function is pure. No `process.exit()`, no console output, no mutations.
- **Separate from `parseCLIArgs`**: The existing `parseCLIArgs` in `lib/terminal.ts` handles `--debug`, env vars, etc. Deep-link parsing is isolated into its own module for single-responsibility and testability.

**Behavioral difference from existing `parseCLIArgs`:** The existing parser uses `argv[++i]` (line 29-32 in `terminal.ts`) which unconditionally increments `i` and consumes the next token even if it's another flag. The new parser checks `hasValue` before consuming, which is safer — `--screen --repo acme/api` correctly leaves `screen` as undefined and parses `repo`.

### 3.4 `apps/tui/src/deep-link/validator.ts` — Input Validation

```typescript
import type { RawDeepLinkArgs, DeepLinkValidationResult } from "./types.js";
import {
  SCREEN_ID_MAP,
  REPO_REQUIRED_SCREENS,
  REPO_REGEX,
  ORG_REGEX,
  CONTROL_CHAR_REGEX,
  SCREEN_MAX_LENGTH,
  REPO_MAX_LENGTH,
  REPO_SEGMENT_MAX_LENGTH,
  ORG_MAX_LENGTH,
  ERROR_TRUNCATE_SCREEN,
  ERROR_TRUNCATE_REPO,
  ERROR_TRUNCATE_ORG,
} from "./constants.js";

/**
 * Sanitize a raw input value for safe display in error messages.
 * Strips control characters and ANSI escape sequences, then truncates.
 *
 * @param raw - The raw string to sanitize
 * @param maxLen - Maximum display length (characters after truncation)
 * @returns Sanitized string, truncated with "…" suffix if over maxLen
 */
export function sanitizeForDisplay(raw: string, maxLen: number): string {
  const stripped = raw.replace(CONTROL_CHAR_REGEX, "");
  if (stripped.length <= maxLen) return stripped;
  return stripped.slice(0, maxLen - 1) + "…";
}

/**
 * Validate parsed deep-link arguments.
 *
 * Validation order (matters for error priority):
 * 1. --screen format: length check → allowlist lookup
 * 2. --repo format: length check → regex check → segment length check
 * 3. --org format: length check → regex check
 * 4. Context dependency: repo-required screens must have --repo
 *
 * Format errors are reported before context-dependency errors.
 * If --repo is malformed AND --screen requires repo, the format error
 * takes precedence.
 *
 * @param args - Raw parsed arguments from parseDeepLinkArgs()
 * @returns Discriminated union: valid with normalized values, or invalid with error
 */
export function validateDeepLinkArgs(
  args: RawDeepLinkArgs,
): DeepLinkValidationResult {
  // No deep-link flags at all → valid, default to dashboard
  if (!args.screen && !args.repo && !args.org) {
    return { valid: true };
  }

  // --- Validate --screen ---
  let normalizedScreen: string | undefined;

  if (args.screen !== undefined) {
    // Length check before any other processing
    if (args.screen.length > SCREEN_MAX_LENGTH) {
      return {
        valid: false,
        error: `Unknown screen: ${sanitizeForDisplay(args.screen, ERROR_TRUNCATE_SCREEN)}`,
      };
    }

    const lowered = args.screen.toLowerCase();
    const screenName = SCREEN_ID_MAP[lowered];

    if (!screenName) {
      return {
        valid: false,
        error: `Unknown screen: ${sanitizeForDisplay(args.screen, ERROR_TRUNCATE_SCREEN)}`,
      };
    }

    normalizedScreen = lowered;
  }

  // --- Validate --repo ---
  let parsedRepo: { owner: string; name: string } | undefined;

  if (args.repo !== undefined) {
    // Length check
    if (args.repo.length > REPO_MAX_LENGTH) {
      return {
        valid: false,
        error: `Invalid repository format: ${sanitizeForDisplay(args.repo, ERROR_TRUNCATE_REPO)} (expected OWNER/REPO)`,
      };
    }

    // Regex check
    if (!REPO_REGEX.test(args.repo)) {
      return {
        valid: false,
        error: `Invalid repository format: ${sanitizeForDisplay(args.repo, ERROR_TRUNCATE_REPO)} (expected OWNER/REPO)`,
      };
    }

    // Segment length check
    const [owner, name] = args.repo.split("/");
    if (owner.length > REPO_SEGMENT_MAX_LENGTH || name.length > REPO_SEGMENT_MAX_LENGTH) {
      return {
        valid: false,
        error: `Invalid repository format: ${sanitizeForDisplay(args.repo, ERROR_TRUNCATE_REPO)} (segment too long, max ${REPO_SEGMENT_MAX_LENGTH})`,
      };
    }

    parsedRepo = { owner, name };
  }

  // --- Validate --org ---
  let parsedOrg: string | undefined;

  if (args.org !== undefined) {
    // Length check
    if (args.org.length > ORG_MAX_LENGTH) {
      return {
        valid: false,
        error: `Invalid organization format: ${sanitizeForDisplay(args.org, ERROR_TRUNCATE_ORG)}`,
      };
    }

    // Regex check
    if (!ORG_REGEX.test(args.org)) {
      return {
        valid: false,
        error: `Invalid organization format: ${sanitizeForDisplay(args.org, ERROR_TRUNCATE_ORG)}`,
      };
    }

    parsedOrg = args.org;
  }

  // --- Context dependency check ---
  if (normalizedScreen && REPO_REQUIRED_SCREENS.has(normalizedScreen) && !parsedRepo) {
    return {
      valid: false,
      error: `--repo required for ${normalizedScreen}`,
    };
  }

  return {
    valid: true,
    normalizedScreen,
    repo: parsedRepo,
    org: parsedOrg,
  };
}
```

**Design rationale:**
- **Validation order**: Screen format → repo format → org format → context dependency. This ensures the most specific error is returned. If `--screen issues --repo inv@lid`, the repo format error is shown, not `--repo required for issues`.
- **`sanitizeForDisplay`** is exported as a public function for reuse in status bar error rendering and for testing.
- **Case-insensitive screen matching**: The user's input is lowercased before lookup. `--screen Issues`, `--screen ISSUES`, and `--screen issues` all resolve to the same screen.
- **Length limits are checked first** within each validation block. This prevents regex backtracking on pathologically long inputs.
- **Stronger repo validation than existing**: The existing `deepLinks.ts` only checks `parts.length !== 2 || !parts[0] || !parts[1]`, allowing `inv@lid/r&po` through. The new validator uses `REPO_REGEX` to enforce `[a-zA-Z0-9_.-]+` character classes.

### 3.5 `apps/tui/src/deep-link/stack-builder.ts` — Stack Pre-Population

```typescript
import type { ScreenEntry } from "../router/types.js";
import { ScreenName } from "../router/types.js";
import { createEntry } from "../providers/NavigationProvider.js";
import type { DeepLinkValidationResult, DeepLinkStackResult } from "./types.js";
import { SCREEN_ID_MAP, REPO_REQUIRED_SCREENS } from "./constants.js";

/**
 * Build the initial navigation stack from validated deep-link arguments.
 *
 * Stack pre-population rules:
 *
 * | Scenario                              | Stack                                        | Depth |
 * |----------------------------------------|----------------------------------------------|-------|
 * | No flags                               | [Dashboard]                                  |     1 |
 * | --screen dashboard                     | [Dashboard]                                  |     1 |
 * | --screen repos                         | [Dashboard, RepoList]                        |     2 |
 * | --screen notifications                 | [Dashboard, Notifications]                   |     2 |
 * | --screen search                        | [Dashboard, Search]                          |     2 |
 * | --screen workspaces                    | [Dashboard, Workspaces]                      |     2 |
 * | --screen agents                        | [Dashboard, Agents]                          |     2 |
 * | --screen settings                      | [Dashboard, Settings]                        |     2 |
 * | --screen sync                          | [Dashboard, Sync]                            |     2 |
 * | --screen orgs                          | [Dashboard, Organizations]                   |     2 |
 * | --repo acme/api (no --screen)          | [Dashboard, RepoOverview(acme/api)]          |     2 |
 * | --screen issues --repo acme/api        | [Dashboard, RepoOverview(acme/api), Issues]  |     3 |
 * | --screen landings --repo acme/api      | [Dashboard, RepoOverview(acme/api), Landings]|     3 |
 * | --screen workflows --repo acme/api     | [Dashboard, RepoOverview(acme/api), Workflows]|    3 |
 * | --screen wiki --repo acme/api          | [Dashboard, RepoOverview(acme/api), Wiki]    |     3 |
 * | --org acme (no --screen)               | [Dashboard, OrgOverview(acme)]               |     2 |
 * | --screen orgs --org acme               | [Dashboard, OrgOverview(acme)]               |     2 |
 *
 * @param validated - Result from validateDeepLinkArgs(). If invalid, returns Dashboard + error.
 * @returns Stack entries and optional error message for status bar display.
 */
export function buildInitialStack(
  validated: DeepLinkValidationResult,
): DeepLinkStackResult {
  // --- Invalid input → Dashboard fallback with error ---
  if (!validated.valid) {
    return {
      stack: [createEntry(ScreenName.Dashboard)],
      error: validated.error,
    };
  }

  const { normalizedScreen, repo, org } = validated;
  const dashboardEntry = createEntry(ScreenName.Dashboard);

  // --- No screen specified ---
  if (!normalizedScreen) {
    // --repo only → [Dashboard, RepoOverview]
    if (repo) {
      return {
        stack: [
          dashboardEntry,
          createEntry(ScreenName.RepoOverview, {
            owner: repo.owner,
            repo: repo.name,
          }),
        ],
      };
    }

    // --org only → [Dashboard, OrgOverview]
    if (org) {
      return {
        stack: [
          dashboardEntry,
          createEntry(ScreenName.OrgOverview, { org }),
        ],
      };
    }

    // No flags at all → [Dashboard]
    return { stack: [dashboardEntry] };
  }

  // --- Screen specified ---
  const screenName = SCREEN_ID_MAP[normalizedScreen]!;

  // Dashboard is depth 1
  if (screenName === ScreenName.Dashboard) {
    return { stack: [dashboardEntry] };
  }

  // Org-context screens: --screen orgs --org acme → [Dashboard, OrgOverview(acme)]
  if (screenName === ScreenName.Organizations) {
    if (org) {
      return {
        stack: [
          dashboardEntry,
          createEntry(ScreenName.OrgOverview, { org }),
        ],
      };
    }
    // --screen orgs without --org → [Dashboard, Organizations]
    return {
      stack: [
        dashboardEntry,
        createEntry(ScreenName.Organizations),
      ],
    };
  }

  // Repo-context screens: [Dashboard, RepoOverview, Screen]
  // repo is guaranteed to exist here because validateDeepLinkArgs
  // already checked that repo-required screens have --repo.
  if (repo && REPO_REQUIRED_SCREENS.has(normalizedScreen)) {
    const repoParams = { owner: repo.owner, repo: repo.name };
    return {
      stack: [
        dashboardEntry,
        createEntry(ScreenName.RepoOverview, repoParams),
        createEntry(screenName, repoParams),
      ],
    };
  }

  // Context-free screens: [Dashboard, Screen]
  // If --repo was provided for a non-repo-required screen,
  // the repo context is stored in params but no RepoOverview
  // intermediate screen is inserted.
  const params: Record<string, string> = {};
  if (repo) {
    params.owner = repo.owner;
    params.repo = repo.name;
  }
  if (org) {
    params.org = org;
  }

  return {
    stack: [
      dashboardEntry,
      createEntry(screenName, params),
    ],
  };
}
```

**Design rationale:**
- **Reuses `createEntry` from `NavigationProvider.tsx`**: The existing `createEntry` (line 18-29) already generates UUIDs via `crypto.randomUUID()`, looks up `screenRegistry` for breadcrumb labels via `definition.breadcrumbLabel(params)`, and returns proper `ScreenEntry` objects. No duplication.
- **Accepts `DeepLinkValidationResult`, not `RawDeepLinkArgs`**: The stack builder never receives unvalidated input. This is enforced at the type level.
- **Org + screen override**: `--screen orgs --org acme` produces `[Dashboard, OrgOverview(acme)]`, not `[Dashboard, Organizations, OrgOverview(acme)]`. The `--org` flag promotes the destination to the org detail, skipping the list.
- **Behavioral difference from existing**: The old `buildInitialStack()` pushes `agents` as a context-free screen with `{ owner, repo }` params. The new one does the same — but for the 4 repo-required screens (`issues`, `landings`, `workflows`, `wiki`), it correctly inserts `RepoOverview` as an intermediate stack entry, which the old one also does. The key difference: the new version separates `agents` (which IS context-free per registry) from true repo-required screens.

### 3.6 `apps/tui/src/deep-link/index.ts` — Barrel Exports

```typescript
export { parseDeepLinkArgs } from "./parser.js";
export { validateDeepLinkArgs, sanitizeForDisplay } from "./validator.js";
export { buildInitialStack } from "./stack-builder.js";
export type {
  RawDeepLinkArgs,
  DeepLinkValidationResult,
  DeepLinkStackResult,
} from "./types.js";
export {
  SCREEN_ID_MAP,
  REPO_REQUIRED_SCREENS,
  REPO_REGEX,
  ORG_REGEX,
  SCREEN_MAX_LENGTH,
  REPO_MAX_LENGTH,
  ORG_MAX_LENGTH,
} from "./constants.js";
```

### 3.7 Changes to `apps/tui/src/index.tsx` — Bootstrap Integration

The existing bootstrap sequence (lines 6-9, 28, 36-41):

```typescript
import { assertTTY, parseCLIArgs } from "./lib/terminal.js";
assertTTY();
const launchOptions = parseCLIArgs(process.argv.slice(2));
// ...
import { buildInitialStack } from "./navigation/deepLinks.js";
// ...
const deepLinkResult = buildInitialStack({
  screen: launchOptions.screen,
  repo: launchOptions.repo,
});
const initialStack = deepLinkResult.stack;
```

Updated to:

```typescript
import { assertTTY, parseCLIArgs } from "./lib/terminal.js";
assertTTY();
const launchOptions = parseCLIArgs(process.argv.slice(2));

import {
  parseDeepLinkArgs,
  validateDeepLinkArgs,
  buildInitialStack,
} from "./deep-link/index.js";

const rawArgs = parseDeepLinkArgs(process.argv.slice(2));
const validated = validateDeepLinkArgs(rawArgs);
const deepLinkResult = buildInitialStack(validated);
const initialStack = deepLinkResult.stack;
const deepLinkError = deepLinkResult.error ?? null;
```

The old `import { buildInitialStack } from "./navigation/deepLinks.js"` (line 28) is removed. The `launchOptions.screen` and `launchOptions.repo` fields are no longer accessed.

Additionally, the `deepLinkError` is threaded into the component tree via `LoadingProvider`:

```typescript
// In the App component JSX (around line 74):
<LoadingProvider initialStatusBarError={deepLinkError}>
```

### 3.8 Changes to `apps/tui/src/lib/terminal.ts`

Remove `--screen` and `--repo` from `TUILaunchOptions` and `parseCLIArgs`:

```typescript
export interface TUILaunchOptions {
  debug?: boolean;        // --debug or CODEPLANE_TUI_DEBUG=true
  apiUrl?: string;        // CODEPLANE_API_URL
  token?: string;         // CODEPLANE_TOKEN
}

export function parseCLIArgs(argv: string[]): TUILaunchOptions {
  const opts: TUILaunchOptions = {};
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--debug":
        opts.debug = true;
        break;
    }
  }
  opts.debug = opts.debug || process.env.CODEPLANE_TUI_DEBUG === "true";
  opts.apiUrl = process.env.CODEPLANE_API_URL ?? "http://localhost:3000";
  opts.token = process.env.CODEPLANE_TOKEN;
  return opts;
}
```

### 3.9 Changes to `apps/tui/src/providers/LoadingProvider.tsx`

The `LoadingProvider` currently has no mechanism to display the deep-link error on launch. The existing `deepLinkResult.error` in `index.tsx` is computed but never used. This ticket adds an `initialStatusBarError` prop:

```typescript
// Updated interface (line 16):
export function LoadingProvider({
  children,
  initialStatusBarError,
}: {
  children: React.ReactNode;
  initialStatusBarError?: string | null;
}) {
  // ... existing state declarations ...
  const [statusBarError, setStatusBarError] = useState<string | null>(
    initialStatusBarError ?? null,
  );

  // Auto-clear initial status bar error after STATUS_BAR_ERROR_DURATION_MS
  useEffect(() => {
    if (initialStatusBarError) {
      if (statusBarTimerRef.current) {
        clearTimeout(statusBarTimerRef.current);
      }
      statusBarTimerRef.current = setTimeout(() => {
        setStatusBarError(null);
      }, STATUS_BAR_ERROR_DURATION_MS);
    }
  }, []); // only on mount
  // ... rest unchanged ...
}
```

This ensures that errors like "Unknown screen: foobar" or "--repo required for issues" are visible in the status bar for 5 seconds after launch, leveraging the same display mechanism as optimistic mutation errors.

### 3.10 Deprecation of `apps/tui/src/navigation/deepLinks.ts`

The file header receives a `@deprecated` JSDoc comment:

```typescript
/**
 * @deprecated Use `deep-link/index.ts` instead.
 * This module is retained temporarily for migration safety.
 * Remove in a follow-up commit after all consumers have migrated.
 */
```

The barrel export in `navigation/index.ts` is updated to remove deep-link exports:

```typescript
// Before:
export { goToBindings, executeGoTo } from "./goToBindings.js";
export type { GoToBinding } from "./goToBindings.js";
export { buildInitialStack } from "./deepLinks.js";
export type { DeepLinkArgs, DeepLinkResult } from "./deepLinks.js";

// After:
export { goToBindings, executeGoTo } from "./goToBindings.js";
export type { GoToBinding } from "./goToBindings.js";
// Deep-link exports removed — use @codeplane/tui/deep-link instead
```

**Key behavioral differences from the existing implementation:**

| Aspect | Old (`navigation/deepLinks.ts`) | New (`deep-link/`) |
|--------|--------------------------------|--------------------|
| Separation of concerns | Single `buildInitialStack` does validation + building; parsing in separate `parseCLIArgs` | Three separate pure functions in dedicated module |
| Error type | `{ error?: string }` — easy to forget check | Discriminated union with `valid: boolean` — TypeScript enforces |
| Error display | Computed but never displayed (ignored in `index.tsx`) | Threaded to `LoadingProvider.initialStatusBarError`, shown for 5s |
| Control char sanitization | None | `sanitizeForDisplay` strips ANSI + control chars |
| Length limits | None | 32/128/64 char limits enforced before regex |
| Repo validation | `parts.length !== 2 || !parts[0] || !parts[1]` (allows special chars) | `REPO_REGEX` with `[a-zA-Z0-9_.-]+` character class |
| Screen ID allowlist | 16 entries including aliases (`landing-requests`, `repositories`, `repo-detail`) | 13 canonical entries only |
| `--org` parser support | Not parsed by `parseCLIArgs` (only in `DeepLinkArgs` interface) | Parsed by `parseDeepLinkArgs` from argv |
| Org stack building | `--org` only passed as param, no OrgOverview intermediate | `--org` without `--screen` → `[Dashboard, OrgOverview]` |
| `--screen orgs --org acme` | `[Dashboard, Organizations]` with `{params: {org}}` | `[Dashboard, OrgOverview(acme)]` |
| Flag-next-flag safety | `argv[++i]` consumes unconditionally | Checks `!value.startsWith("--")` before consuming |

---

## 4. Implementation Plan

The implementation is broken into vertical steps. Each step produces a working, testable artifact.

### Step 1: Create `deep-link/types.ts` and `deep-link/constants.ts`

**Files created:**
- `apps/tui/src/deep-link/types.ts`
- `apps/tui/src/deep-link/constants.ts`

**Work:**
1. Create the `apps/tui/src/deep-link/` directory.
2. Implement `types.ts` with `RawDeepLinkArgs`, `DeepLinkValidationResult`, `DeepLinkStackResult` as specified in §3.1.
3. Implement `constants.ts` with all 13 screen ID mappings, regex patterns, length limits, and truncation limits as specified in §3.2.
4. Verify `SCREEN_ID_MAP` keys exactly match the 13 supported screen IDs: `dashboard`, `repos`, `issues`, `landings`, `workspaces`, `workflows`, `search`, `notifications`, `agents`, `settings`, `orgs`, `sync`, `wiki`.
5. Verify `SCREEN_ID_MAP` values reference the correct `ScreenName` enum values from `router/types.ts` (all 13 must exist in the 32-member enum).

**Verification:** `tsc --noEmit` passes from `apps/tui/`. Types are importable from sibling files.

### Step 2: Implement `deep-link/parser.ts`

**Files created:**
- `apps/tui/src/deep-link/parser.ts`

**Work:**
1. Implement `parseDeepLinkArgs(argv)` as specified in §3.3.
2. Handle edge cases: missing values, `--flag --flag` patterns, empty argv, trailing flags without values, duplicate flags (last wins).
3. No validation — raw string pass-through only.

**Verification:** Unit-testable in isolation with simple arrays. Run parser tests (DL-PARSE-001 through DL-PARSE-012).

### Step 3: Implement `deep-link/validator.ts`

**Files created:**
- `apps/tui/src/deep-link/validator.ts`

**Work:**
1. Implement `sanitizeForDisplay(raw, maxLen)` as specified.
2. Implement `validateDeepLinkArgs(args)` with the validation order: screen format → repo format → org format → context dependency.
3. Ensure control character stripping works with ANSI escape sequences, null bytes, BEL character, etc.

**Verification:** Unit-testable with constructed `RawDeepLinkArgs` objects. Run validator tests (DL-VAL-001 through DL-VAL-025, DL-SAN-001 through DL-SAN-005).

### Step 4: Implement `deep-link/stack-builder.ts`

**Files created:**
- `apps/tui/src/deep-link/stack-builder.ts`

**Work:**
1. Implement `buildInitialStack(validated)` as specified in §3.5.
2. Import `createEntry` from `../providers/NavigationProvider.js` — do NOT duplicate this function.
3. Cover all 17 stack pre-population scenarios from the table in §3.5.
4. Ensure returned `ScreenEntry[]` has valid `id`, `screen`, `params`, `breadcrumb` fields (all populated by `createEntry` via `screenRegistry` lookups).

**Verification:** Unit-testable by passing `DeepLinkValidationResult` objects and inspecting returned stacks. Run stack builder tests (DL-STACK-001 through DL-STACK-023).

### Step 5: Create barrel export and wire into bootstrap

**Files created:**
- `apps/tui/src/deep-link/index.ts`

**Files modified:**
- `apps/tui/src/index.tsx` — Replace old deep-link import with new three-step pipeline. Pass `deepLinkError` to `LoadingProvider`.
- `apps/tui/src/lib/terminal.ts` — Remove `screen` and `repo` from `TUILaunchOptions` interface and `parseCLIArgs` function.
- `apps/tui/src/providers/LoadingProvider.tsx` — Add `initialStatusBarError` prop.
- `apps/tui/src/navigation/deepLinks.ts` — Add `@deprecated` JSDoc comment.
- `apps/tui/src/navigation/index.ts` — Remove `buildInitialStack` and `DeepLinkArgs`/`DeepLinkResult` exports.

**Work:**
1. Create barrel export in `deep-link/index.ts`.
2. Update `index.tsx` to use the new three-step pipeline (§3.7).
3. Update `lib/terminal.ts` to remove `--screen`/`--repo` parsing (§3.8).
4. Update `LoadingProvider` to accept `initialStatusBarError` prop (§3.9).
5. Deprecate `navigation/deepLinks.ts` and update `navigation/index.ts` (§3.10).

**Verification:**
- Manual smoke test: `bun run apps/tui/src/index.tsx` (no args → Dashboard)
- `bun run apps/tui/src/index.tsx --screen repos` (→ Repositories with breadcrumb "Dashboard › Repositories")
- `bun run apps/tui/src/index.tsx --screen issues --repo acme/api` (→ Issues with breadcrumb "Dashboard › acme/api › Issues")
- `bun run apps/tui/src/index.tsx --screen foobar` (→ Dashboard with status bar error "Unknown screen: foobar")
- `bun run apps/tui/src/index.tsx --screen issues` (→ Dashboard with status bar error "--repo required for issues")
- TypeScript compilation (`tsc --noEmit` from `apps/tui/`) passes.

### Step 6: Write unit and E2E tests

**Files modified:**
- `e2e/tui/app-shell.test.ts` — Add deep-link unit tests and E2E terminal tests.

**Work:**
- Write all tests specified in §5 below.
- Verify existing deep-link tests (NAV-DEEP-001 through NAV-DEEP-006) still pass with the new pipeline.
- Note: NAV-DEEP-001 uses `--screen agents --repo acme/widget` — agents is NOT repo-required, so the new pipeline should produce `[Dashboard, Agents]` with repo params, matching the existing behavior.

---

## 5. Unit & Integration Tests

### Test File: `e2e/tui/app-shell.test.ts`

All tests are appended to the existing `app-shell.test.ts` file. Tests use `bun:test` for pure function unit tests and `@microsoft/tui-test` (via `launchTUI` helper) for E2E terminal tests. Tests that depend on a running API server are left failing until backends are implemented — never skipped or commented out.

#### 5.1 Parser Unit Tests

These test `parseDeepLinkArgs()` directly via import. No terminal needed — pure function tests.

```typescript
import { parseDeepLinkArgs } from "../../apps/tui/src/deep-link/parser.js";

describe("TUI_DEEP_LINK_LAUNCH — parseDeepLinkArgs", () => {
  test("DL-PARSE-001: empty argv returns empty args", () => {
    const result = parseDeepLinkArgs([]);
    expect(result).toEqual({});
  });

  test("DL-PARSE-002: --screen extracts screen value", () => {
    const result = parseDeepLinkArgs(["--screen", "issues"]);
    expect(result).toEqual({ screen: "issues" });
  });

  test("DL-PARSE-003: --repo extracts repo value", () => {
    const result = parseDeepLinkArgs(["--repo", "acme/api"]);
    expect(result).toEqual({ repo: "acme/api" });
  });

  test("DL-PARSE-004: --org extracts org value", () => {
    const result = parseDeepLinkArgs(["--org", "acme"]);
    expect(result).toEqual({ org: "acme" });
  });

  test("DL-PARSE-005: all three flags parsed together", () => {
    const result = parseDeepLinkArgs([
      "--screen", "issues",
      "--repo", "acme/api",
      "--org", "acme",
    ]);
    expect(result).toEqual({ screen: "issues", repo: "acme/api", org: "acme" });
  });

  test("DL-PARSE-006: flags in any order", () => {
    const result = parseDeepLinkArgs([
      "--org", "acme",
      "--screen", "issues",
      "--repo", "acme/api",
    ]);
    expect(result).toEqual({ screen: "issues", repo: "acme/api", org: "acme" });
  });

  test("DL-PARSE-007: unknown flags are ignored", () => {
    const result = parseDeepLinkArgs([
      "--debug",
      "--screen", "repos",
      "--verbose",
    ]);
    expect(result).toEqual({ screen: "repos" });
  });

  test("DL-PARSE-008: --screen without value is undefined", () => {
    const result = parseDeepLinkArgs(["--screen"]);
    expect(result.screen).toBeUndefined();
  });

  test("DL-PARSE-009: --screen followed by another flag treats value as undefined", () => {
    const result = parseDeepLinkArgs(["--screen", "--repo", "acme/api"]);
    expect(result.screen).toBeUndefined();
    expect(result.repo).toBe("acme/api");
  });

  test("DL-PARSE-010: preserves case for --screen value", () => {
    const result = parseDeepLinkArgs(["--screen", "Issues"]);
    expect(result.screen).toBe("Issues");
  });

  test("DL-PARSE-011: preserves special characters in --repo value", () => {
    const result = parseDeepLinkArgs(["--repo", "inv@lid!!!"]);
    expect(result.repo).toBe("inv@lid!!!");
  });

  test("DL-PARSE-012: last occurrence wins for duplicate flags", () => {
    const result = parseDeepLinkArgs([
      "--screen", "repos",
      "--screen", "issues",
    ]);
    expect(result.screen).toBe("issues");
  });
});
```

#### 5.2 Sanitizer Unit Tests

```typescript
import { sanitizeForDisplay } from "../../apps/tui/src/deep-link/validator.js";

describe("TUI_DEEP_LINK_LAUNCH — sanitizeForDisplay", () => {
  test("DL-SAN-001: returns input unchanged when under limit", () => {
    expect(sanitizeForDisplay("foobar", 32)).toBe("foobar");
  });

  test("DL-SAN-002: truncates with ellipsis when over limit", () => {
    const long = "a".repeat(40);
    const result = sanitizeForDisplay(long, 32);
    expect(result).toHaveLength(32);
    expect(result.endsWith("…")).toBe(true);
  });

  test("DL-SAN-003: strips ANSI escape sequences", () => {
    const input = "\x1B[31mred\x1B[0m";
    const result = sanitizeForDisplay(input, 32);
    expect(result).toBe("red");
  });

  test("DL-SAN-004: strips null bytes and control characters", () => {
    const input = "foo\x00bar\x07baz";
    const result = sanitizeForDisplay(input, 32);
    expect(result).toBe("foobarbaz");
  });

  test("DL-SAN-005: strips then truncates in correct order", () => {
    const input = "\x1B[31m" + "a".repeat(35) + "\x1B[0m";
    const result = sanitizeForDisplay(input, 32);
    expect(result).toHaveLength(32);
    expect(result).not.toContain("\x1B");
  });
});
```

#### 5.3 Validator Unit Tests

```typescript
import { validateDeepLinkArgs } from "../../apps/tui/src/deep-link/validator.js";

describe("TUI_DEEP_LINK_LAUNCH — validateDeepLinkArgs", () => {
  test("DL-VAL-001: no flags returns valid with no fields", () => {
    const result = validateDeepLinkArgs({});
    expect(result.valid).toBe(true);
  });

  test("DL-VAL-002: valid --screen returns normalized lowercase", () => {
    const result = validateDeepLinkArgs({ screen: "Issues" });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.normalizedScreen).toBe("issues");
    }
  });

  test("DL-VAL-003: unknown --screen returns error", () => {
    const result = validateDeepLinkArgs({ screen: "foobar" });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain("Unknown screen");
      expect(result.error).toContain("foobar");
    }
  });

  test("DL-VAL-004: --screen over 32 chars returns error", () => {
    const result = validateDeepLinkArgs({ screen: "a".repeat(33) });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain("Unknown screen");
    }
  });

  test("DL-VAL-005: valid --repo returns parsed owner/name", () => {
    const result = validateDeepLinkArgs({ repo: "acme/api" });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.repo).toEqual({ owner: "acme", name: "api" });
    }
  });

  test("DL-VAL-006: --repo without slash returns error", () => {
    const result = validateDeepLinkArgs({ repo: "acme" });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain("Invalid repository format");
    }
  });

  test("DL-VAL-007: --repo with special characters returns error", () => {
    const result = validateDeepLinkArgs({ repo: "inv@lid/r&po" });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain("Invalid repository format");
    }
  });

  test("DL-VAL-008: --repo over 128 chars returns error", () => {
    const result = validateDeepLinkArgs({ repo: "a".repeat(65) + "/" + "b".repeat(65) });
    expect(result.valid).toBe(false);
  });

  test("DL-VAL-009: --repo segment over 64 chars returns error", () => {
    const result = validateDeepLinkArgs({ repo: "a".repeat(65) + "/api" });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain("segment too long");
    }
  });

  test("DL-VAL-010: valid --org returns parsed slug", () => {
    const result = validateDeepLinkArgs({ org: "acme" });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.org).toBe("acme");
    }
  });

  test("DL-VAL-011: --org with special characters returns error", () => {
    const result = validateDeepLinkArgs({ org: "inv@lid!!!" });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain("Invalid organization format");
    }
  });

  test("DL-VAL-012: --org over 64 chars returns error", () => {
    const result = validateDeepLinkArgs({ org: "a".repeat(65) });
    expect(result.valid).toBe(false);
  });

  test("DL-VAL-013: repo-required screen without --repo returns error", () => {
    const result = validateDeepLinkArgs({ screen: "issues" });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toBe("--repo required for issues");
    }
  });

  test("DL-VAL-014: repo-required screen with valid --repo returns valid", () => {
    const result = validateDeepLinkArgs({ screen: "issues", repo: "acme/api" });
    expect(result.valid).toBe(true);
  });

  test("DL-VAL-015: all four repo-required screens validated", () => {
    for (const screen of ["issues", "landings", "workflows", "wiki"]) {
      const result = validateDeepLinkArgs({ screen });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toBe(`--repo required for ${screen}`);
      }
    }
  });

  test("DL-VAL-016: repo format error takes priority over repo-required error", () => {
    const result = validateDeepLinkArgs({ screen: "issues", repo: "inv@lid" });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain("Invalid repository format");
    }
  });

  test("DL-VAL-017: case-insensitive screen matching", () => {
    for (const input of ["ISSUES", "Issues", "iSsUeS"]) {
      const result = validateDeepLinkArgs({ screen: input, repo: "acme/api" });
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.normalizedScreen).toBe("issues");
      }
    }
  });

  test("DL-VAL-018: all 13 screen IDs accepted", () => {
    const screens = [
      "dashboard", "repos", "issues", "landings", "workspaces",
      "workflows", "search", "notifications", "agents",
      "settings", "orgs", "sync", "wiki",
    ];
    for (const screen of screens) {
      const args: Record<string, string> = { screen };
      if (["issues", "landings", "workflows", "wiki"].includes(screen)) {
        (args as any).repo = "acme/api";
      }
      const result = validateDeepLinkArgs(args as any);
      expect(result.valid).toBe(true);
    }
  });

  test("DL-VAL-019: error messages strip control characters", () => {
    const result = validateDeepLinkArgs({ screen: "foo\x1B[31mbar\x00baz" });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).not.toContain("\x1B");
      expect(result.error).not.toContain("\x00");
    }
  });

  test("DL-VAL-020: error messages truncate long unknown screen values", () => {
    const longScreen = "x".repeat(50);
    const result = validateDeepLinkArgs({ screen: longScreen });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.length).toBeLessThan(80);
    }
  });

  test("DL-VAL-021: error messages truncate long invalid repo values", () => {
    const longRepo = "x".repeat(200);
    const result = validateDeepLinkArgs({ repo: longRepo });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.length).toBeLessThan(120);
    }
  });

  test("DL-VAL-022: --repo with dots and hyphens is valid", () => {
    const result = validateDeepLinkArgs({ repo: "my-org.co/my-repo.js" });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.repo).toEqual({ owner: "my-org.co", name: "my-repo.js" });
    }
  });

  test("DL-VAL-023: --repo with underscores is valid", () => {
    const result = validateDeepLinkArgs({ repo: "my_org/my_repo" });
    expect(result.valid).toBe(true);
  });

  test("DL-VAL-024: --repo with empty segments returns error", () => {
    const result = validateDeepLinkArgs({ repo: "/repo" });
    expect(result.valid).toBe(false);
  });

  test("DL-VAL-025: --repo with multiple slashes returns error", () => {
    const result = validateDeepLinkArgs({ repo: "a/b/c" });
    expect(result.valid).toBe(false);
  });
});
```

#### 5.4 Stack Builder Unit Tests

```typescript
import { buildInitialStack } from "../../apps/tui/src/deep-link/stack-builder.js";
import { ScreenName } from "../../apps/tui/src/router/types.js";
import type { DeepLinkValidationResult } from "../../apps/tui/src/deep-link/types.js";

describe("TUI_DEEP_LINK_LAUNCH — buildInitialStack", () => {
  // --- Invalid input → Dashboard fallback ---

  test("DL-STACK-001: invalid validation result returns Dashboard with error", () => {
    const result = buildInitialStack({
      valid: false,
      error: "Unknown screen: foobar",
    });
    expect(result.stack).toHaveLength(1);
    expect(result.stack[0].screen).toBe(ScreenName.Dashboard);
    expect(result.error).toBe("Unknown screen: foobar");
  });

  // --- No flags → Dashboard ---

  test("DL-STACK-002: no flags returns [Dashboard], depth 1", () => {
    const result = buildInitialStack({ valid: true });
    expect(result.stack).toHaveLength(1);
    expect(result.stack[0].screen).toBe(ScreenName.Dashboard);
    expect(result.error).toBeUndefined();
  });

  // --- --screen dashboard → [Dashboard], depth 1 ---

  test("DL-STACK-003: --screen dashboard returns [Dashboard], depth 1", () => {
    const result = buildInitialStack({
      valid: true,
      normalizedScreen: "dashboard",
    });
    expect(result.stack).toHaveLength(1);
    expect(result.stack[0].screen).toBe(ScreenName.Dashboard);
  });

  // --- Context-free screens → [Dashboard, Screen], depth 2 ---

  test("DL-STACK-004: --screen repos returns [Dashboard, RepoList]", () => {
    const result = buildInitialStack({
      valid: true,
      normalizedScreen: "repos",
    });
    expect(result.stack).toHaveLength(2);
    expect(result.stack[0].screen).toBe(ScreenName.Dashboard);
    expect(result.stack[1].screen).toBe(ScreenName.RepoList);
  });

  test("DL-STACK-005: --screen notifications returns depth 2", () => {
    const result = buildInitialStack({
      valid: true,
      normalizedScreen: "notifications",
    });
    expect(result.stack).toHaveLength(2);
    expect(result.stack[1].screen).toBe(ScreenName.Notifications);
  });

  test("DL-STACK-006: --screen search returns depth 2", () => {
    const result = buildInitialStack({
      valid: true,
      normalizedScreen: "search",
    });
    expect(result.stack).toHaveLength(2);
    expect(result.stack[1].screen).toBe(ScreenName.Search);
  });

  test("DL-STACK-007: --screen workspaces returns depth 2", () => {
    const result = buildInitialStack({
      valid: true,
      normalizedScreen: "workspaces",
    });
    expect(result.stack).toHaveLength(2);
    expect(result.stack[1].screen).toBe(ScreenName.Workspaces);
  });

  test("DL-STACK-008: --screen agents returns depth 2", () => {
    const result = buildInitialStack({
      valid: true,
      normalizedScreen: "agents",
    });
    expect(result.stack).toHaveLength(2);
    expect(result.stack[1].screen).toBe(ScreenName.Agents);
  });

  test("DL-STACK-009: --screen settings returns depth 2", () => {
    const result = buildInitialStack({
      valid: true,
      normalizedScreen: "settings",
    });
    expect(result.stack).toHaveLength(2);
    expect(result.stack[1].screen).toBe(ScreenName.Settings);
  });

  test("DL-STACK-010: --screen sync returns depth 2", () => {
    const result = buildInitialStack({
      valid: true,
      normalizedScreen: "sync",
    });
    expect(result.stack).toHaveLength(2);
    expect(result.stack[1].screen).toBe(ScreenName.Sync);
  });

  // --- --repo only → [Dashboard, RepoOverview], depth 2 ---

  test("DL-STACK-011: --repo only returns [Dashboard, RepoOverview]", () => {
    const result = buildInitialStack({
      valid: true,
      repo: { owner: "acme", name: "api" },
    });
    expect(result.stack).toHaveLength(2);
    expect(result.stack[0].screen).toBe(ScreenName.Dashboard);
    expect(result.stack[1].screen).toBe(ScreenName.RepoOverview);
    expect(result.stack[1].params).toEqual({ owner: "acme", repo: "api" });
  });

  // --- Repo-context screens → [Dashboard, RepoOverview, Screen], depth 3 ---

  test("DL-STACK-012: --screen issues --repo returns depth 3", () => {
    const result = buildInitialStack({
      valid: true,
      normalizedScreen: "issues",
      repo: { owner: "acme", name: "api" },
    });
    expect(result.stack).toHaveLength(3);
    expect(result.stack[0].screen).toBe(ScreenName.Dashboard);
    expect(result.stack[1].screen).toBe(ScreenName.RepoOverview);
    expect(result.stack[1].params).toEqual({ owner: "acme", repo: "api" });
    expect(result.stack[2].screen).toBe(ScreenName.Issues);
    expect(result.stack[2].params).toEqual({ owner: "acme", repo: "api" });
  });

  test("DL-STACK-013: --screen landings --repo returns depth 3", () => {
    const result = buildInitialStack({
      valid: true,
      normalizedScreen: "landings",
      repo: { owner: "acme", name: "api" },
    });
    expect(result.stack).toHaveLength(3);
    expect(result.stack[2].screen).toBe(ScreenName.Landings);
  });

  test("DL-STACK-014: --screen workflows --repo returns depth 3", () => {
    const result = buildInitialStack({
      valid: true,
      normalizedScreen: "workflows",
      repo: { owner: "acme", name: "api" },
    });
    expect(result.stack).toHaveLength(3);
    expect(result.stack[2].screen).toBe(ScreenName.Workflows);
  });

  test("DL-STACK-015: --screen wiki --repo returns depth 3", () => {
    const result = buildInitialStack({
      valid: true,
      normalizedScreen: "wiki",
      repo: { owner: "acme", name: "api" },
    });
    expect(result.stack).toHaveLength(3);
    expect(result.stack[2].screen).toBe(ScreenName.Wiki);
  });

  // --- Org-context ---

  test("DL-STACK-016: --org only returns [Dashboard, OrgOverview]", () => {
    const result = buildInitialStack({
      valid: true,
      org: "acme",
    });
    expect(result.stack).toHaveLength(2);
    expect(result.stack[1].screen).toBe(ScreenName.OrgOverview);
    expect(result.stack[1].params).toEqual({ org: "acme" });
  });

  test("DL-STACK-017: --screen orgs without --org returns [Dashboard, Organizations]", () => {
    const result = buildInitialStack({
      valid: true,
      normalizedScreen: "orgs",
    });
    expect(result.stack).toHaveLength(2);
    expect(result.stack[1].screen).toBe(ScreenName.Organizations);
  });

  test("DL-STACK-018: --screen orgs --org returns [Dashboard, OrgOverview]", () => {
    const result = buildInitialStack({
      valid: true,
      normalizedScreen: "orgs",
      org: "acme",
    });
    expect(result.stack).toHaveLength(2);
    expect(result.stack[1].screen).toBe(ScreenName.OrgOverview);
    expect(result.stack[1].params).toEqual({ org: "acme" });
  });

  // --- ScreenEntry integrity ---

  test("DL-STACK-019: every stack entry has a unique id", () => {
    const result = buildInitialStack({
      valid: true,
      normalizedScreen: "issues",
      repo: { owner: "acme", name: "api" },
    });
    const ids = result.stack.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("DL-STACK-020: every stack entry has a non-empty breadcrumb", () => {
    const result = buildInitialStack({
      valid: true,
      normalizedScreen: "issues",
      repo: { owner: "acme", name: "api" },
    });
    for (const entry of result.stack) {
      expect(entry.breadcrumb.length).toBeGreaterThan(0);
    }
  });

  test("DL-STACK-021: breadcrumb for RepoOverview includes owner/repo", () => {
    const result = buildInitialStack({
      valid: true,
      normalizedScreen: "issues",
      repo: { owner: "acme", name: "api" },
    });
    expect(result.stack[1].breadcrumb).toBe("acme/api");
  });

  test("DL-STACK-022: error is undefined on valid stacks", () => {
    const result = buildInitialStack({
      valid: true,
      normalizedScreen: "repos",
    });
    expect(result.error).toBeUndefined();
  });

  test("DL-STACK-023: context-free screen with --repo stores repo in params", () => {
    const result = buildInitialStack({
      valid: true,
      normalizedScreen: "notifications",
      repo: { owner: "acme", name: "api" },
    });
    expect(result.stack).toHaveLength(2);
    expect(result.stack[1].screen).toBe(ScreenName.Notifications);
    expect(result.stack[1].params.owner).toBe("acme");
    expect(result.stack[1].params.repo).toBe("api");
  });
});
```

#### 5.5 E2E Terminal Snapshot and Interaction Tests

These tests launch the actual TUI process and interact with it via `@microsoft/tui-test`. They extend the existing deep-link tests in `app-shell.test.ts`.

```typescript
import { launchTUI, type TUITestInstance } from "./helpers.ts";

describe("TUI_DEEP_LINK_LAUNCH — E2E terminal tests", () => {
  let terminal: TUITestInstance;

  afterEach(async () => {
    if (terminal) await terminal.terminate();
  });

  // --- Snapshot tests ---

  test("DL-E2E-SNAP-001: no flags launches to Dashboard", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    const headerLine = terminal.getLine(0);
    expect(headerLine).toContain("Dashboard");
  });

  test("DL-E2E-SNAP-002: --screen repos shows Repository list", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "repos"],
    });
    await terminal.waitForText("Repositories");
    const headerLine = terminal.getLine(0);
    expect(headerLine).toMatch(/Dashboard.*Repositories/);
  });

  test("DL-E2E-SNAP-003: --screen issues --repo acme/api shows Issues", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "issues", "--repo", "acme/api"],
    });
    await terminal.waitForText("Issues");
    const headerLine = terminal.getLine(0);
    expect(headerLine).toMatch(/acme\/api/);
  });

  test("DL-E2E-SNAP-004: --screen foobar shows Dashboard with error in status bar", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "foobar"],
    });
    await terminal.waitForText("Dashboard");
    const snapshot = terminal.snapshot();
    expect(snapshot).toMatch(/Unknown screen.*foobar/);
  });

  test("DL-E2E-SNAP-005: --screen issues without --repo shows error in status bar", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "issues"],
    });
    await terminal.waitForText("Dashboard");
    const snapshot = terminal.snapshot();
    expect(snapshot).toMatch(/--repo required/);
  });

  test("DL-E2E-SNAP-006: --repo inv@lid shows format error in status bar", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--repo", "inv@lid!!!"],
    });
    await terminal.waitForText("Dashboard");
    const snapshot = terminal.snapshot();
    expect(snapshot).toMatch(/Invalid repository format/);
  });

  test("DL-E2E-SNAP-007: 80x24 minimum truncates breadcrumb from deep-link", async () => {
    terminal = await launchTUI({
      cols: 80,
      rows: 24,
      args: ["--screen", "issues", "--repo", "acme/api"],
    });
    await terminal.waitForText("Issues");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("DL-E2E-SNAP-008: case-insensitive --screen Issues works", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "Issues", "--repo", "acme/api"],
    });
    await terminal.waitForText("Issues");
    const snapshot = terminal.snapshot();
    expect(snapshot).not.toMatch(/Unknown screen/);
  });

  // --- Keyboard interaction tests ---

  test("DL-E2E-KEY-001: q walks back from deep-linked issues to repo overview", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "issues", "--repo", "acme/api"],
    });
    await terminal.waitForText("Issues");
    await terminal.sendKeys("q");
    const snapshot = terminal.snapshot();
    expect(snapshot).toMatch(/acme\/api/);
    // Should be on RepoOverview, not Issues
    expect(snapshot).not.toMatch(/Issues.*not yet implemented/);
  });

  test("DL-E2E-KEY-002: q q walks back from repo overview to Dashboard", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "issues", "--repo", "acme/api"],
    });
    await terminal.waitForText("Issues");
    await terminal.sendKeys("q");
    await terminal.waitForText("acme/api");
    await terminal.sendKeys("q");
    await terminal.waitForText("Dashboard");
  });

  test("DL-E2E-KEY-003: q from context-free deep-link returns to Dashboard", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "notifications"],
    });
    await terminal.waitForText("Notifications");
    await terminal.sendKeys("q");
    await terminal.waitForText("Dashboard");
  });

  test("DL-E2E-KEY-004: go-to mode works from deep-linked screen", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "notifications"],
    });
    await terminal.waitForText("Notifications");
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
  });

  test("DL-E2E-KEY-005: error screen still navigable via go-to", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "foobar"],
    });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g", "n");
    await terminal.waitForText("Notifications");
  });

  // --- Responsive tests ---

  test("DL-E2E-RESP-001: resize after deep-link launch re-renders correctly", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "issues", "--repo", "acme/api"],
    });
    await terminal.waitForText("Issues");
    await terminal.resize(80, 24);
    await terminal.waitForText("Issues");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("DL-E2E-RESP-002: resize to below minimum shows size warning", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "repos"],
    });
    await terminal.waitForText("Repositories");
    await terminal.resize(60, 20);
    await terminal.waitForText("Terminal too small");
    await terminal.resize(120, 40);
    await terminal.waitForText("Repositories");
  });

  // --- --org E2E tests ---

  test("DL-E2E-ORG-001: --org acme shows OrgOverview", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--org", "acme"],
    });
    await terminal.waitForText("acme");
    const headerLine = terminal.getLine(0);
    expect(headerLine).toContain("acme");
  });

  test("DL-E2E-ORG-002: --screen orgs --org acme shows OrgOverview not list", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "orgs", "--org", "acme"],
    });
    await terminal.waitForText("acme");
  });

  // --- Error auto-clear test ---

  test("DL-E2E-ERR-001: status bar error clears after 5 seconds", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "foobar"],
    });
    await terminal.waitForText("Unknown screen");
    // Wait for STATUS_BAR_ERROR_DURATION_MS (5000ms) + buffer
    await new Promise((resolve) => setTimeout(resolve, 6000));
    const snapshot = terminal.snapshot();
    expect(snapshot).not.toMatch(/Unknown screen.*foobar/);
  });
});
```

---

## 6. Integration Points

### 6.1 Dependency: tui-nav-chrome-eng-01

This ticket depends on the following artifacts from `tui-nav-chrome-eng-01`, all of which are already implemented:

| Artifact | File | Usage |
|----------|------|-------|
| `ScreenName` enum (32 members) | `apps/tui/src/router/types.ts` | Used in `SCREEN_ID_MAP` to map CLI screen IDs to internal enum values |
| `ScreenEntry` interface | `apps/tui/src/router/types.ts` | Return type in `DeepLinkStackResult.stack` |
| `ScreenDefinition` interface | `apps/tui/src/router/types.ts` | Consumed by `screenRegistry` for breadcrumb generation |
| `screenRegistry` (32 entries) | `apps/tui/src/router/registry.ts` | Used indirectly via `createEntry()` for breadcrumb label generation |
| `createEntry(screen, params)` | `apps/tui/src/providers/NavigationProvider.tsx:18-29` | Imported by `stack-builder.ts` to create properly-formed `ScreenEntry` objects with UUID and breadcrumb |
| `NavigationProvider` with `initialStack` prop | `apps/tui/src/providers/NavigationProvider.tsx:31-157` | Consumes the `ScreenEntry[]` returned by `buildInitialStack()` |

### 6.2 Downstream Consumers

| Consumer | What it receives |
|----------|------------------|
| `apps/tui/src/index.tsx` | Calls the three-step pipeline and passes `stack` to `NavigationProvider` |
| `LoadingProvider` | Receives `deepLinkResult.error` as `initialStatusBarError` prop for transient 5-second display |
| `StatusBar` component | Already renders `statusBarError` from `LoadingContext` (no changes needed) |
| Existing E2E tests (NAV-DEEP-001 through NAV-DEEP-006) | Must continue to pass — same argv format, same behavioral outcomes |

### 6.3 Status Bar Error Display

The `deepLinkResult.error` string is threaded from `index.tsx` → `LoadingProvider.initialStatusBarError` → `LoadingContext.statusBarError` → `StatusBar` component.

The `StatusBar` component at `apps/tui/src/components/StatusBar.tsx` already renders `statusBarError` (line 64-66):
```typescript
{statusBarError ? (
  <text fg={theme.error}>{truncateRight(statusBarError, maxErrorWidth)}</text>
) : ( /* hints */ )}
```

This ticket ensures:
- Error strings are pre-truncated and sanitized (no control characters) in `validateDeepLinkArgs`.
- Error strings use the constant limits (32/64/32 chars for screen/repo/org display values).
- The `StatusBar` applies its own final width-based truncation via `truncateRight` and `maxErrorWidth` (computed from `width - STATUS_BAR_ERROR_PADDING`).
- The error auto-clears after `STATUS_BAR_ERROR_DURATION_MS` (5000ms) via the existing timer mechanism in `LoadingProvider`.

### 6.4 Compatibility with Existing E2E Tests

The existing tests in `app-shell.test.ts` (NAV-DEEP-001 through NAV-DEEP-006) launch the TUI with `--screen` and `--repo` args. These tests must continue to pass after the migration:

| Test | Args | Expected | Compatibility Notes |
|------|------|----------|-------------------|
| NAV-DEEP-001 | `--screen agents --repo acme/widget` | Opens Agents, breadcrumb shows `acme/widget` | `agents` is NOT repo-required. New pipeline: `[Dashboard, Agents({owner,repo})]`. Old: same. The repo is passed as params but agents is context-free. |
| NAV-DEEP-002 | `--screen dashboard` | Opens Dashboard as root | `[Dashboard]` — identical |
| NAV-DEEP-003 | `--screen nonexistent` | Falls back to Dashboard | Validation produces error, `buildInitialStack` returns `[Dashboard]` with error string |
| NAV-DEEP-004 | `--screen agents --repo invalid-format` | Falls back to Dashboard | **Behavioral change**: Old code accepted `invalid-format` (no slash → falls through to error). New code rejects via `REPO_REGEX` (no slash). Both fall back to Dashboard, but the error message differs. Test assertion is `waitForText("Dashboard")` — still passes. |
| NAV-DEEP-005 | `--screen agents --repo acme/api` | Opens Agents, `q` navigates back | Back nav to Dashboard (agents is depth 2: `[Dashboard, Agents]`) |
| NAV-DEEP-006 | `--screen repos` | Opens Repositories | `[Dashboard, RepoList]` — identical |

---

## 7. Edge Cases & Boundary Conditions

### 7.1 Empty or Missing Flag Values

| Input | Parser Output | Validator Output |
|-------|--------------|------------------|
| `--screen` (no value at end of argv) | `{ screen: undefined }` | Valid (no flags set) → Dashboard |
| `--screen ""` | `{ screen: "" }` | Invalid: `Unknown screen:` (empty string, not in allowlist) |
| `--repo` (no value) | `{ repo: undefined }` | Valid (no flags set) → Dashboard |
| `--repo ""` | `{ repo: "" }` | Invalid: fails REPO_REGEX (no match on empty) |
| `--org` (no value) | `{ org: undefined }` | Valid (no flags set) → Dashboard |
| `--org ""` | `{ org: "" }` | Invalid: fails ORG_REGEX (no match on empty) |

### 7.2 Unicode in Flag Values

| Input | Behavior |
|-------|----------|
| `--screen Ïssues` | Lowercased to `ïssues`, not in allowlist → Unknown screen error |
| `--repo açme/api` | Fails `REPO_REGEX` (only `[a-zA-Z0-9_.-]` allowed) → Format error |
| `--org 组织` | Fails `ORG_REGEX` → Format error |

### 7.3 Pathological Inputs

| Input | Behavior |
|-------|----------|
| `--screen` repeated 100 times | Last value wins in parser; validated normally |
| `--repo "a".repeat(10000)` | Length check rejects before regex (prevents backtracking) |
| `--screen \x1B[31mmalicious\x1B[0m` | Control chars stripped in error display via `sanitizeForDisplay` |
| argv with 10,000 entries | Parser is O(n) linear scan, completes in <1ms |

### 7.4 Flag Interaction Edge Cases

| Input | Stack | Notes |
|-------|-------|-------|
| `--screen orgs --repo acme/api` | `[Dashboard, Organizations]` | `--repo` passed in params but no RepoOverview intermediate |
| `--screen repos --org acme` | `[Dashboard, RepoList]` | `--org` stored in params but no org intermediate |
| `--screen dashboard --repo acme/api --org acme` | `[Dashboard]` | Dashboard is always depth 1, extra context ignored |
| `--screen orgs --org acme --repo acme/api` | `[Dashboard, OrgOverview(acme)]` | Org screen with --org promotes to detail, --repo in params |
| `--repo acme/api --org acme` (no --screen) | `[Dashboard, RepoOverview(acme/api)]` | --repo takes precedence over --org when no screen specified |

### 7.5 Empty String Flag Values

The parser treats `--screen ""` as `{ screen: "" }` (empty string is not undefined, and `""` does not start with `--`). The validator then rejects empty strings because they don't match any allowlist entry or regex pattern. This is correct — empty strings should be validation errors, not silently ignored.

---

## 8. Productionization Checklist

The three core functions (`parseDeepLinkArgs`, `validateDeepLinkArgs`, `buildInitialStack`) are designed as production-ready from the start. They are pure functions with well-defined input/output contracts. There is no PoC phase.

### 8.1 Pre-merge Checklist

- [ ] All parser unit tests pass (DL-PARSE-001 through DL-PARSE-012)
- [ ] All sanitizer unit tests pass (DL-SAN-001 through DL-SAN-005)
- [ ] All validator unit tests pass (DL-VAL-001 through DL-VAL-025)
- [ ] All stack builder unit tests pass (DL-STACK-001 through DL-STACK-023)
- [ ] Existing deep-link E2E tests pass (NAV-DEEP-001 through NAV-DEEP-006)
- [ ] New E2E snapshot tests produce expected golden files at 80x24 and 120x40
- [ ] New E2E keyboard tests verify q-back navigation through pre-populated stacks
- [ ] New E2E error display tests verify status bar shows deep-link errors
- [ ] `apps/tui/src/index.tsx` updated to use new three-step pipeline
- [ ] `apps/tui/src/index.tsx` passes `deepLinkError` to `LoadingProvider`
- [ ] `apps/tui/src/lib/terminal.ts` no longer parses `--screen`/`--repo`
- [ ] `apps/tui/src/providers/LoadingProvider.tsx` accepts `initialStatusBarError` prop
- [ ] `apps/tui/src/navigation/deepLinks.ts` marked `@deprecated`
- [ ] `apps/tui/src/navigation/index.ts` no longer exports deprecated deep-link functions
- [ ] TypeScript compilation succeeds with `tsc --noEmit` (strict mode) from `apps/tui/`
- [ ] No runtime dependencies added (pure TypeScript, no new npm packages)
- [ ] No consumers of `navigation/deepLinks.ts` remain except the deprecated file itself (verified via grep)

### 8.2 Migration Path

The migration from the existing `navigation/deepLinks.ts` to the new `deep-link/` module follows these steps:

1. **Create `deep-link/` module** with the new files alongside the existing `navigation/` module.
2. **Update `index.tsx`** to import from `deep-link/` instead of `navigation/deepLinks`. This is the only consumer (verified via `grep "from.*navigation/deepLinks" apps/tui/src/` — only `index.tsx:28`).
3. **Update `lib/terminal.ts`** to remove `--screen`/`--repo` from `TUILaunchOptions`.
4. **Update `LoadingProvider`** to accept `initialStatusBarError` prop.
5. **Keep `navigation/deepLinks.ts`** temporarily with `@deprecated` annotation.
6. **Update `navigation/index.ts`** to remove deprecated exports.
7. **Delete deprecated file** in a follow-up commit after verifying no other imports reference it.

### 8.3 Future Extensions

The `SCREEN_ID_MAP` in `constants.ts` is the single place to add new deep-linkable screens. When a new screen is added to the `ScreenName` enum and registry, it becomes deep-linkable by adding one line to `SCREEN_ID_MAP` and, if it requires repo context, one entry to `REPO_REQUIRED_SCREENS`.

Planned extensions (not in scope for this ticket):

| Extension | Approach |
|-----------|----------|
| `--session-id` for agent deep-links | New field in `RawDeepLinkArgs`, new validation rule, new stack branch pushing `[Dashboard, Agents, AgentChat({sessionId})]` |
| `--issue N` or `--landing N` for detail deep-links | New fields, require `--repo`, push detail screen entries `[Dashboard, RepoOverview, Issues, IssueDetail({number})]` |
| `--workspace-id` for workspace direct access | New field, no repo required, push `[Dashboard, Workspaces, WorkspaceDetail({workspaceId})]` |
| Legacy alias support period | If needed, add a `SCREEN_ALIAS_MAP` in constants that maps old IDs to canonical IDs, with deprecation warnings |

---

## 9. Performance Considerations

| Operation | Budget | Actual (estimated) |
|-----------|--------|--------------------|
| `parseDeepLinkArgs()` | <1ms | O(n) linear scan of argv, <0.1ms for typical 5-10 args |
| `validateDeepLinkArgs()` | <1ms | Regex tests + string ops, <0.1ms |
| `buildInitialStack()` | <1ms | 1-3 `crypto.randomUUID()` calls + registry lookups, <0.5ms |
| **Total deep-link pipeline** | **<2ms** | **<1ms** |

The entire deep-link pipeline executes synchronously during bootstrap before the renderer is created, contributing negligibly to the 200ms first-paint budget.

Length checks are performed before regex evaluation in the validator, preventing pathological backtracking on oversized inputs. The `REPO_REGEX` and `ORG_REGEX` are both anchored (`^...$`) and use character classes without quantifier nesting, making them immune to ReDoS.

Memory allocation is minimal: the parser creates one small `RawDeepLinkArgs` object, the validator creates one `DeepLinkValidationResult`, and the stack builder creates 1-3 `ScreenEntry` objects. No intermediate arrays, no string copies beyond what's needed.

---

## 10. Source of Truth

This engineering specification should be maintained alongside:

- `specs/tui/features.ts` — Feature inventory (`TUI_DEEP_LINK_LAUNCH` in `TUI_APP_SHELL`)
- `specs/tui/engineering/tui-nav-chrome-eng-01.md` — Dependency: navigation system
- `specs/tui/prd.md` — TUI product requirements
- `specs/tui/design.md` — TUI design specification
- `apps/tui/src/navigation/deepLinks.ts` — Existing implementation being replaced
- `apps/tui/src/providers/NavigationProvider.tsx` — `createEntry` and `NavigationProvider` consumed by this module
- `apps/tui/src/providers/LoadingProvider.tsx` — `initialStatusBarError` prop added by this module
- `apps/tui/src/components/StatusBar.tsx` — Renders `statusBarError` from `LoadingContext`