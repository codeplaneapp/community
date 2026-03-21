# Engineering Specification: `tui-nav-chrome-eng-08`

## Deep-link argument parser and stack builder

**Ticket:** tui-nav-chrome-eng-08  
**Status:** Not started  
**Depends on:** tui-nav-chrome-eng-01 (NavigationProvider, ScreenEntry types, screen registry)  
**Feature flag:** TUI_DEEP_LINK_LAUNCH (from TUI_APP_SHELL)  

---

## 1. Overview

This ticket implements the CLI argument parser for deep-link launch flags and the stack pre-population logic that determines the TUI's initial navigation state. When a user launches `codeplane tui --screen issues --repo acme/api`, three discrete units of work execute synchronously before the React tree mounts:

1. **`parseDeepLinkArgs(argv)`** — Extracts `--screen`, `--repo`, and `--org` flag values from `process.argv`.
2. **`validateDeepLinkArgs(args)`** — Validates extracted values against an allowlist (screen IDs), regex patterns (repo/org slugs), and boundary constraints (max length, control character stripping). Returns a structured result with normalized values or error diagnostics.
3. **`buildInitialStack(validatedArgs)`** — Converts validated arguments into a `ScreenEntry[]` following the spec's stack pre-population rules, so backward navigation via `q` traverses the logical intermediate screens.

These three functions are pure — no side effects, no React context, no API calls. They execute during the bootstrap sequence (step 2 in `index.tsx`) before the renderer is created. This separation enables comprehensive unit testing without any terminal or React infrastructure.

---

## 2. File Inventory

| File | Purpose | New/Existing |
|------|---------|-------------|
| `apps/tui/src/deep-link/parser.ts` | `parseDeepLinkArgs(argv)` — flag extraction from argv | New |
| `apps/tui/src/deep-link/validator.ts` | `validateDeepLinkArgs(args)` — input validation and normalization | New |
| `apps/tui/src/deep-link/stack-builder.ts` | `buildInitialStack(validatedArgs)` — stack pre-population | New |
| `apps/tui/src/deep-link/index.ts` | Barrel exports | New |
| `apps/tui/src/deep-link/types.ts` | Shared types for the deep-link module | New |
| `apps/tui/src/deep-link/constants.ts` | Allowlists, regex patterns, truncation limits | New |
| `apps/tui/src/index.tsx` | Updated bootstrap to use new deep-link module | Existing (modify) |
| `apps/tui/src/navigation/deepLinks.ts` | **Replaced** by the new `deep-link/` module | Existing (deprecate/remove) |
| `apps/tui/src/lib/terminal.ts` | Remove `--screen`/`--repo` parsing (moved to `deep-link/parser.ts`) | Existing (modify) |
| `e2e/tui/app-shell.test.ts` | E2E tests for deep-link launch behavior | New/Existing |

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
 * Either valid (with normalized values) or invalid (with error message).
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
   * Displayed in the status bar for 5 seconds on launch.
   */
  error?: string;
}
```

Design rationale:
- `RawDeepLinkArgs` is intentionally stringly-typed. Validation converts raw strings into typed, normalized values.
- `DeepLinkValidationResult` uses a discriminated union so callers must handle both valid and invalid cases.
- `DeepLinkStackResult.stack` uses `ScreenEntry[]` (not the ad-hoc `{ screen: string; params? }` shape in the existing `deepLinks.ts`) to align with what `NavigationProvider.initialStack` actually expects.

### 3.2 `apps/tui/src/deep-link/constants.ts` — Allowlists, Regex, Limits

```typescript
import { ScreenName } from "../router/types.js";

/**
 * Map of CLI-facing screen ID strings to internal ScreenName enum values.
 * Keys are lowercase. Case-insensitive matching is achieved by lowercasing
 * the user's input before lookup.
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

Design rationale:
- All constants are `Readonly` or `ReadonlySet` to prevent accidental mutation.
- Regex patterns are precompiled module-level constants, not constructed per call.
- The `SCREEN_ID_MAP` is the single source of truth for valid deep-link screen IDs. Adding a new deep-linkable screen requires adding one entry here.
- `CONTROL_CHAR_REGEX` strips both raw control characters and ANSI escape sequences to prevent terminal injection via crafted `--screen` or `--repo` values.

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

Design rationale:
- **Flag-then-value convention**: Each deep-link flag expects the next argv token as its value. If the next token starts with `--`, it's treated as another flag and the current flag gets `undefined`.
- **No lowercasing here**: Case normalization is the validator's job, not the parser's. Parser is dumb extraction.
- **No side effects**: This function is pure. No `process.exit()`, no console output, no mutations.
- **Separate from `parseCLIArgs`**: The existing `parseCLIArgs` in `lib/terminal.ts` handles `--debug`, env vars, etc. Deep-link parsing is isolated into its own module for single-responsibility and testability. After migration, `parseCLIArgs` will stop parsing `--screen`/`--repo` (those fields will be removed from `TUILaunchOptions`).

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
 * Checks:
 * 1. --screen against the allowlist (case-insensitive)
 * 2. --screen length (max 32 chars)
 * 3. --repo against regex pattern and length constraints
 * 4. --repo segment lengths (owner ≤ 64, name ≤ 64)
 * 5. --org against regex pattern and length constraints
 * 6. Repo-required screens have --repo provided
 *
 * Validation order matters: format errors are reported before
 * context-dependency errors. If --repo is malformed AND --screen
 * requires repo, the format error takes precedence.
 *
 * @param args - Raw parsed arguments from parseDeepLinkArgs()
 * @returns Validation result: either valid with normalized values
 *          or invalid with a human-readable error message
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
  // Screens that require --repo
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

Design rationale:
- **Validation order**: Screen format → repo format → org format → context dependency. This ensures the most specific error is returned. If `--screen issues --repo inv@lid`, the repo format error is shown, not "--repo required for issues".
- **`sanitizeForDisplay`** is exported as a public function for reuse in status bar error rendering and for testing.
- **Case-insensitive screen matching**: The user's input is lowercased before lookup. `--screen Issues`, `--screen ISSUES`, and `--screen issues` all resolve to the same screen.
- **Length limits are checked first** within each validation block. This prevents regex backtracking on pathologically long inputs.

### 3.5 `apps/tui/src/deep-link/stack-builder.ts` — Stack Pre-Population

```typescript
import type { ScreenEntry } from "../router/types.js";
import { ScreenName } from "../router/types.js";
import { screenRegistry } from "../router/registry.js";
import type { DeepLinkValidationResult, DeepLinkStackResult } from "./types.js";
import { SCREEN_ID_MAP } from "./constants.js";

/**
 * Create a ScreenEntry with a generated ID and breadcrumb from the registry.
 */
function createEntry(
  screen: ScreenName,
  params: Record<string, string> = {},
): ScreenEntry {
  const definition = screenRegistry[screen];
  return {
    id: crypto.randomUUID(),
    screen,
    params,
    breadcrumb: definition.breadcrumbLabel(params),
  };
}

/**
 * Build the initial navigation stack from validated deep-link arguments.
 *
 * Stack pre-population rules (from specs/tui/TUI_DEEP_LINK_LAUNCH.md):
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
  if (repo && REPO_REQUIRED_SCREENS_SET.has(normalizedScreen)) {
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

// Re-import for the check above (avoids circular import by using the constant directly)
import { REPO_REQUIRED_SCREENS as REPO_REQUIRED_SCREENS_SET } from "./constants.js";
```

Design rationale:
- **Accepts `DeepLinkValidationResult`, not `RawDeepLinkArgs`**: The stack builder never receives unvalidated input. This is enforced at the type level — you cannot pass a `RawDeepLinkArgs` to `buildInitialStack`.
- **`createEntry` uses the screen registry's `breadcrumbLabel`**: Breadcrumb text is derived from the same source as manual navigation, ensuring consistency between deep-linked and manually-navigated screens.
- **`crypto.randomUUID()` for entry IDs**: Each `ScreenEntry.id` is globally unique. This enables scroll position caching and prevents stale references when the same screen is pushed multiple times.
- **Org + screen override**: `--screen orgs --org acme` produces `[Dashboard, OrgOverview(acme)]`, not `[Dashboard, Organizations, OrgOverview(acme)]`. The `--org` flag promotes the destination to the org detail, skipping the list.

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

The existing bootstrap calls `buildInitialStack` from `./navigation/deepLinks.js` with `{ screen, repo }` extracted by `parseCLIArgs`. This must be updated to use the new three-step pipeline:

```typescript
// Before (existing):
import { buildInitialStack } from "./navigation/deepLinks.js";
const deepLinkResult = buildInitialStack({
  screen: launchOptions.screen,
  repo: launchOptions.repo,
});
const initialStack = deepLinkResult.stack;

// After (new):
import {
  parseDeepLinkArgs,
  validateDeepLinkArgs,
  buildInitialStack,
} from "./deep-link/index.js";

const rawArgs = parseDeepLinkArgs(process.argv.slice(2));
const validated = validateDeepLinkArgs(rawArgs);
const deepLinkResult = buildInitialStack(validated);
const initialStack = deepLinkResult.stack;
// deepLinkResult.error is passed to AppShell for transient status bar display
```

The `launchOptions.screen` and `launchOptions.repo` fields are removed from `TUILaunchOptions` in `lib/terminal.ts`. The `parseCLIArgs` function in `lib/terminal.ts` retains `--debug`, `apiUrl`, and `token` parsing.

### 3.8 Changes to `apps/tui/src/lib/terminal.ts`

Remove `--screen` and `--repo` from `TUILaunchOptions` and `parseCLIArgs`:

```typescript
// Updated interface:
export interface TUILaunchOptions {
  debug?: boolean;        // --debug or CODEPLANE_TUI_DEBUG=true
  apiUrl?: string;        // CODEPLANE_API_URL
  token?: string;         // CODEPLANE_TOKEN
}

// Updated parser — no longer handles --screen or --repo:
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

### 3.9 Deprecation of `apps/tui/src/navigation/deepLinks.ts`

The existing `navigation/deepLinks.ts` is functionally replaced by the new `deep-link/` module. It should be:

1. Marked with a `@deprecated` JSDoc comment pointing to `deep-link/index.ts`.
2. Its exports removed from `navigation/index.ts`.
3. Deleted in a follow-up cleanup once all consumers have migrated.

The new module improves on the existing implementation in these ways:
- **Separate validation step**: The existing code mixes parsing, validation, and stack building in a single `buildInitialStack` function. The new design separates these concerns.
- **Proper `ScreenEntry[]` return type**: The existing code returns `{ screen: string; params? }[]` which must be coerced into `ScreenEntry[]` by the `NavigationProvider`. The new code returns proper `ScreenEntry[]` directly.
- **Control character stripping**: The existing code does not sanitize error messages for terminal injection.
- **Boundary constraints**: The existing code does not enforce length limits on `--screen`, `--repo`, or `--org` values.
- **Discriminated union for validation result**: The existing code uses a single object with optional `error` field, which allows callers to forget to check for errors.

---

## 4. Implementation Plan

The implementation is broken into vertical steps. Each step produces a working, testable artifact.

### Step 1: Create `deep-link/types.ts` and `deep-link/constants.ts`

**Files created:**
- `apps/tui/src/deep-link/types.ts`
- `apps/tui/src/deep-link/constants.ts`

**Work:**
- Define `RawDeepLinkArgs`, `DeepLinkValidationResult`, `DeepLinkStackResult` types.
- Define all constants: `SCREEN_ID_MAP`, `REPO_REQUIRED_SCREENS`, regex patterns, length limits, truncation limits.
- Ensure `SCREEN_ID_MAP` keys exactly match the 13 supported screen IDs from the ticket description.

**Verification:** TypeScript compiles without errors. Types are importable from sibling files.

### Step 2: Implement `deep-link/parser.ts`

**Files created:**
- `apps/tui/src/deep-link/parser.ts`

**Work:**
- Implement `parseDeepLinkArgs(argv)` as specified in §3.3.
- Handle edge cases: missing values, `--flag --flag` patterns, empty argv, trailing flags without values.
- No validation — raw string pass-through only.

**Verification:** Unit-testable in isolation with simple arrays.

### Step 3: Implement `deep-link/validator.ts`

**Files created:**
- `apps/tui/src/deep-link/validator.ts`

**Work:**
- Implement `sanitizeForDisplay(raw, maxLen)` as specified.
- Implement `validateDeepLinkArgs(args)` with the validation order: screen format → repo format → org format → context dependency.
- Test control character stripping with ANSI escape sequences, null bytes, etc.

**Verification:** Unit-testable with constructed `RawDeepLinkArgs` objects.

### Step 4: Implement `deep-link/stack-builder.ts`

**Files created:**
- `apps/tui/src/deep-link/stack-builder.ts`

**Work:**
- Implement `buildInitialStack(validated)` as specified in §3.5.
- Cover all 17 stack pre-population scenarios from the table.
- Ensure returned `ScreenEntry[]` has valid `id`, `screen`, `params`, `breadcrumb` fields.

**Verification:** Unit-testable by passing `DeepLinkValidationResult` objects and inspecting returned stacks.

### Step 5: Create barrel export and wire into bootstrap

**Files created:**
- `apps/tui/src/deep-link/index.ts`

**Files modified:**
- `apps/tui/src/index.tsx` — Use new pipeline.
- `apps/tui/src/lib/terminal.ts` — Remove `--screen`/`--repo` from `TUILaunchOptions`.
- `apps/tui/src/navigation/deepLinks.ts` — Add `@deprecated` JSDoc.
- `apps/tui/src/navigation/index.ts` — Remove deprecated exports.

**Work:**
- Replace the old deep-link call in `index.tsx` with the new three-step pipeline.
- Pass `deepLinkResult.error` through to `AppShell` (or a context) for transient status bar display.
- Verify the TUI still launches correctly with and without deep-link flags.

**Verification:** Manual smoke test: `codeplane tui`, `codeplane tui --screen repos`, `codeplane tui --screen issues --repo acme/api`, `codeplane tui --screen foobar`.

### Step 6: Write E2E tests

**Files created/modified:**
- `e2e/tui/app-shell.test.ts` — Deep-link specific tests.

**Work:**
- Write the tests specified in §5 below.

---

## 5. Unit & Integration Tests

### Test File: `e2e/tui/app-shell.test.ts`

All tests use `@microsoft/tui-test` with `createTestTui`. Tests that depend on a running API server (for auth validation, data fetching on deep-linked screens) are left failing until those backends are implemented. Tests are never skipped or commented out.

#### 5.1 Parser Tests

These test `parseDeepLinkArgs()` directly via import (pure function, no terminal needed).

```typescript
import { describe, test, expect } from "bun:test";
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

#### 5.2 Validator Tests

```typescript
import { describe, test, expect } from "bun:test";
import {
  validateDeepLinkArgs,
  sanitizeForDisplay,
} from "../../apps/tui/src/deep-link/validator.js";

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
    // 30 visible chars + escape sequences
    const input = "\x1B[31m" + "a".repeat(35) + "\x1B[0m";
    const result = sanitizeForDisplay(input, 32);
    expect(result).toHaveLength(32);
    expect(result).not.toContain("\x1B");
  });
});

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
      // Provide repo for repo-required screens
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
      // Error message should contain truncated version, not the full 50 chars
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

#### 5.3 Stack Builder Tests

```typescript
import { describe, test, expect } from "bun:test";
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

  // --- Context-free screen with --repo still passes repo as params ---

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

#### 5.4 E2E Terminal Snapshot and Interaction Tests

These tests launch the actual TUI process and interact with it via `@microsoft/tui-test`. They require a built TUI binary and a running (or mocked at the infra level, not in test code) API server.

```typescript
import { createTestTui } from "@microsoft/tui-test";

describe("TUI_DEEP_LINK_LAUNCH — E2E terminal tests", () => {
  // --- Snapshot tests ---

  test("DL-E2E-SNAP-001: no flags launches to Dashboard", async () => {
    const tui = await createTestTui({ cols: 120, rows: 40 });
    // Launch TUI with no deep-link flags
    // Wait for Dashboard to render
    // Assert: breadcrumb shows "Dashboard" only
    // Assert: content area shows dashboard content
    // Snapshot comparison
  });

  test("DL-E2E-SNAP-002: --screen repos shows Repository list", async () => {
    const tui = await createTestTui({
      cols: 120,
      rows: 40,
      args: ["--screen", "repos"],
    });
    // Wait for RepoList to render
    // Assert: breadcrumb shows "Dashboard > Repositories"
  });

  test("DL-E2E-SNAP-003: --screen issues --repo acme/api shows Issues", async () => {
    const tui = await createTestTui({
      cols: 120,
      rows: 40,
      args: ["--screen", "issues", "--repo", "acme/api"],
    });
    // Assert: breadcrumb shows "Dashboard > acme/api > Issues"
  });

  test("DL-E2E-SNAP-004: --screen foobar shows Dashboard with error", async () => {
    const tui = await createTestTui({
      cols: 120,
      rows: 40,
      args: ["--screen", "foobar"],
    });
    // Assert: Dashboard rendered
    // Assert: status bar contains "Unknown screen: foobar"
  });

  test("DL-E2E-SNAP-005: --screen issues without --repo shows error", async () => {
    const tui = await createTestTui({
      cols: 120,
      rows: 40,
      args: ["--screen", "issues"],
    });
    // Assert: Dashboard rendered
    // Assert: status bar contains "--repo required for issues"
  });

  test("DL-E2E-SNAP-006: --repo inv@lid shows format error", async () => {
    const tui = await createTestTui({
      cols: 120,
      rows: 40,
      args: ["--repo", "inv@lid!!!"],
    });
    // Assert: Dashboard rendered
    // Assert: status bar contains "Invalid repository format"
  });

  test("DL-E2E-SNAP-007: 80x24 minimum truncates breadcrumb", async () => {
    const tui = await createTestTui({
      cols: 80,
      rows: 24,
      args: ["--screen", "issues", "--repo", "acme/api"],
    });
    // Assert: breadcrumb is truncated (starts with "…" or abbreviated)
  });

  test("DL-E2E-SNAP-008: case-insensitive --screen Issues works", async () => {
    const tui = await createTestTui({
      cols: 120,
      rows: 40,
      args: ["--screen", "Issues", "--repo", "acme/api"],
    });
    // Assert: Issues screen rendered, not error
  });

  // --- Keyboard interaction tests ---

  test("DL-E2E-KEY-001: q walks back from deep-linked issues to repo overview", async () => {
    const tui = await createTestTui({
      cols: 120,
      rows: 40,
      args: ["--screen", "issues", "--repo", "acme/api"],
    });
    // Wait for issues screen
    // Send q
    // Assert: RepoOverview for acme/api shown
    // Assert: breadcrumb shows "Dashboard > acme/api"
  });

  test("DL-E2E-KEY-002: q q walks back from repo overview to Dashboard", async () => {
    const tui = await createTestTui({
      cols: 120,
      rows: 40,
      args: ["--screen", "issues", "--repo", "acme/api"],
    });
    // Send q q
    // Assert: Dashboard shown, stack depth 1
  });

  test("DL-E2E-KEY-003: q from context-free deep-link returns to Dashboard", async () => {
    const tui = await createTestTui({
      cols: 120,
      rows: 40,
      args: ["--screen", "notifications"],
    });
    // Send q
    // Assert: Dashboard shown
  });

  test("DL-E2E-KEY-004: go-to mode works from deep-linked screen", async () => {
    const tui = await createTestTui({
      cols: 120,
      rows: 40,
      args: ["--screen", "notifications"],
    });
    // Send g then r
    // Assert: RepoList screen shown
  });

  test("DL-E2E-KEY-005: Ctrl+C exits from deep-linked screen", async () => {
    const tui = await createTestTui({
      cols: 120,
      rows: 40,
      args: ["--screen", "repos"],
    });
    // Send Ctrl+C
    // Assert: TUI process exited
  });

  test("DL-E2E-KEY-006: error screen still navigable via go-to", async () => {
    const tui = await createTestTui({
      cols: 120,
      rows: 40,
      args: ["--screen", "foobar"],
    });
    // Assert: Dashboard with error
    // Send g then n
    // Assert: Notifications screen shown, error cleared
  });

  // --- Responsive tests ---

  test("DL-E2E-RESP-001: resize after deep-link launch re-renders", async () => {
    const tui = await createTestTui({
      cols: 120,
      rows: 40,
      args: ["--screen", "issues", "--repo", "acme/api"],
    });
    // Resize to 80x24
    // Assert: breadcrumb truncated, content re-rendered
  });

  test("DL-E2E-RESP-002: resize to below minimum shows size warning", async () => {
    const tui = await createTestTui({
      cols: 120,
      rows: 40,
      args: ["--screen", "repos"],
    });
    // Resize to 60x20
    // Assert: "Terminal too small" message shown
    // Resize back to 120x40
    // Assert: repos screen restored with stack intact
  });
});
```

---

## 6. Integration Points

### 6.1 Dependency: tui-nav-chrome-eng-01

This ticket depends on the following artifacts from `tui-nav-chrome-eng-01`:

| Artifact | Usage |
|----------|-------|
| `ScreenName` enum | Used in `SCREEN_ID_MAP` to map CLI screen IDs to internal enum values |
| `ScreenEntry` interface | Return type of `buildInitialStack()` |
| `screenRegistry` | Used by `createEntry()` to generate breadcrumb labels |
| `NavigationProvider.initialStack` prop | Consumes the `ScreenEntry[]` returned by `buildInitialStack()` |

If any of these types change, the deep-link module must be updated accordingly. The `SCREEN_ID_MAP` must be kept in sync with `ScreenName` additions.

### 6.2 Downstream Consumers

| Consumer | What it receives |
|----------|------------------|
| `apps/tui/src/index.tsx` | Calls the three-step pipeline and passes `stack` to `NavigationProvider` |
| `StatusBar` component | Receives `deepLinkResult.error` for transient 5-second display |
| Telemetry module | Receives deep-link event data (screen, repo, org, error reason) |

### 6.3 Status Bar Error Display

The `deepLinkResult.error` string is passed from `index.tsx` to the component tree. The `StatusBar` component (or a dedicated `DeepLinkErrorProvider`) displays it for 5 seconds and then clears it. The error display mechanism is **not** part of this ticket — this ticket produces the error string. The status bar display is the responsibility of a separate StatusBar/AppShell ticket.

However, this ticket must ensure:
- Error strings are pre-truncated and sanitized (no control characters).
- Error strings are ≤ `terminal_width - 20` characters at the point of display. Since terminal width is not known at parse time, the error string provides values truncated to the constant limits (32/64/32), and the StatusBar is responsible for final width-based truncation.

---

## 7. Edge Cases & Boundary Conditions

### 7.1 Empty or Missing Flag Values

| Input | Parser Output | Validator Output |
|-------|--------------|------------------|
| `--screen` (no value) | `{ screen: undefined }` | Valid (no flags) |
| `--screen ""` | `{ screen: "" }` | Invalid: `Unknown screen:` (empty) |
| `--repo` (no value) | `{ repo: undefined }` | Valid (no flags) |
| `--repo ""` | `{ repo: "" }` | Invalid: format error |
| `--org` (no value) | `{ org: undefined }` | Valid (no flags) |

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
| `--screen \x1B[31mmalicious\x1B[0m` | Control chars stripped in error display |
| argv with 10,000 entries | Parser is O(n) linear scan, completes in <1ms |

### 7.4 Flag Interaction Edge Cases

| Input | Stack | Notes |
|-------|-------|-------|
| `--screen orgs --repo acme/api` | `[Dashboard, Organizations]` | `--repo` ignored for orgs screen, stored in params |
| `--screen repos --org acme` | `[Dashboard, RepoList]` | `--org` stored in params but no org intermediate |
| `--screen dashboard --repo acme/api --org acme` | `[Dashboard]` | Dashboard is always depth 1, extra context ignored |

---

## 8. Productionization Checklist

The three core functions (`parseDeepLinkArgs`, `validateDeepLinkArgs`, `buildInitialStack`) are designed as production-ready from the start. There is no PoC phase because they are pure functions with well-defined input/output contracts.

### 8.1 Pre-merge Checklist

- [ ] All parser unit tests pass (DL-PARSE-001 through DL-PARSE-012)
- [ ] All validator unit tests pass (DL-VAL-001 through DL-VAL-025, DL-SAN-001 through DL-SAN-005)
- [ ] All stack builder unit tests pass (DL-STACK-001 through DL-STACK-023)
- [ ] E2E snapshot tests produce expected golden files at 80×24, 120×40, 200×60
- [ ] E2E keyboard tests verify q-back navigation through pre-populated stacks
- [ ] `apps/tui/src/index.tsx` updated to use new pipeline
- [ ] `apps/tui/src/lib/terminal.ts` no longer parses `--screen`/`--repo`
- [ ] `apps/tui/src/navigation/deepLinks.ts` marked `@deprecated`
- [ ] `apps/tui/src/navigation/index.ts` no longer exports deprecated functions
- [ ] TypeScript compilation succeeds with `strict: true`
- [ ] No runtime dependencies added (pure TypeScript, no new npm packages)

### 8.2 Existing Code Migration

The existing `apps/tui/src/navigation/deepLinks.ts` contains a working but less rigorous implementation. Migration steps:

1. **Create `deep-link/` module** with the new files alongside the existing `navigation/` module.
2. **Update `index.tsx`** to import from `deep-link/` instead of `navigation/deepLinks`.
3. **Keep `navigation/deepLinks.ts`** temporarily with `@deprecated` annotation.
4. **Remove deprecated file** in a follow-up commit after verifying no other imports reference it.

The key behavioral differences between old and new:

| Aspect | Old (`navigation/deepLinks.ts`) | New (`deep-link/`) |
|--------|--------------------------------|--------------------|
| Validation | Inline in `buildInitialStack` | Separate `validateDeepLinkArgs` |
| Return type | `{ screen: string; params? }[]` | `ScreenEntry[]` |
| Control char sanitization | None | `sanitizeForDisplay` strips ANSI + control chars |
| Length limits | None | 32/128/64 char limits enforced |
| Repo-required coverage | Only `agents` checked | `issues`, `landings`, `workflows`, `wiki` checked |
| Case sensitivity | Lowercases in parser | Parser preserves case; validator normalizes |
| Error truncation | None | 32/64/32 char truncation for display values |

### 8.3 Future Extensions

The `SCREEN_ID_MAP` in `constants.ts` is the single place to add new deep-linkable screens. When a new screen is added to the `ScreenName` enum and registry, it becomes deep-linkable by adding one line to `SCREEN_ID_MAP` and, if it requires repo context, one entry to `REPO_REQUIRED_SCREENS`.

If `--session-id` support (for agent deep-links) is needed later, it should be added as:
1. A new field in `RawDeepLinkArgs`.
2. A new validation rule in `validateDeepLinkArgs`.
3. A new stack-building branch in `buildInitialStack`.

This was intentionally scoped out of this ticket to keep the scope focused on the 13 core screens specified in the ticket description.

---

## 9. Performance Considerations

| Operation | Budget | Actual (estimated) |
|-----------|--------|--------------------|
| `parseDeepLinkArgs()` | <1ms | O(n) linear scan of argv, <0.1ms for typical 5-10 args |
| `validateDeepLinkArgs()` | <1ms | Regex tests + string ops, <0.1ms |
| `buildInitialStack()` | <1ms | 1-3 `crypto.randomUUID()` calls + registry lookups, <0.5ms |
| **Total deep-link pipeline** | **<2ms** | **<1ms** |

The entire deep-link pipeline executes synchronously during bootstrap before the renderer is created, contributing negligibly to the 200ms first-paint budget.

---

## 10. Source of Truth

This engineering specification should be maintained alongside:

- `specs/tui/TUI_DEEP_LINK_LAUNCH.md` — Feature spec with acceptance criteria
- `specs/tui/engineering/tui-nav-chrome-eng-01.md` — Dependency: navigation system
- `specs/tui/prd.md` — TUI product requirements
- `specs/tui/design.md` — TUI design specification
- `specs/tui/features.ts` — Feature inventory (`TUI_DEEP_LINK_LAUNCH` in `TUI_APP_SHELL`)