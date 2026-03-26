# Research Findings for `tui-nav-chrome-eng-08`

## 1. Existing System Architecture

### Entry Point (`apps/tui/src/index.tsx`)
The TUI bootstraps by parsing CLI arguments and using them to build the initial navigation stack before the React tree is mounted.
```tsx
import { assertTTY, parseCLIArgs } from "./lib/terminal.js";
const launchOptions = parseCLIArgs(process.argv.slice(2));
import { buildInitialStack } from "./navigation/deepLinks.js";

const deepLinkResult = buildInitialStack({
  screen: launchOptions.screen,
  repo: launchOptions.repo,
});
const initialStack = deepLinkResult.stack;
```
This is where the new `deep-link/` module will be integrated. Instead of one function call, it will call the 3-step pipeline (`parseDeepLinkArgs`, `validateDeepLinkArgs`, `buildInitialStack`).

### CLI Parser (`apps/tui/src/lib/terminal.ts`)
The `parseCLIArgs` function currently extracts `--screen` and `--repo` directly by unconditionally incrementing the loop index (`argv[++i]`), which is unsafe if the next argument is another flag. 
```typescript
export interface TUILaunchOptions {
  repo?: string;
  screen?: string;
  debug?: boolean;
  apiUrl?: string;
  token?: string;
}
```
`repo` and `screen` will need to be removed from `TUILaunchOptions` and `parseCLIArgs`, leaving only `debug`, `apiUrl`, and `token`.

### Legacy Deep-Link Module (`apps/tui/src/navigation/deepLinks.ts`)
This file contains the monolithic `buildInitialStack` function. It performs rudimentary mapping of strings to `ScreenName` values, does simple repository string splitting (checking for one `/`), checks if a screen is repo-scoped, and constructs the stack array directly. It doesn't handle `--org`, it doesn't enforce max string lengths, and it uses legacy screen aliases. It relies heavily on `createEntry` from `NavigationProvider`.

### Navigation Types & Registry (`apps/tui/src/router/types.ts` & `registry.ts`)
`ScreenName` is an enum with ~20 values, separated into top-level screens, repo-scoped screens, etc.
`ScreenEntry` requires an `id`, `screen`, `params`, and `breadcrumb`.
`createEntry` in `NavigationProvider.tsx` initializes these objects properly by looking up the `breadcrumbLabel` in the `screenRegistry`. We should definitely reuse `createEntry` to avoid duplicating UUID generation and breadcrumb resolution.

### Tests (`e2e/tui/app-shell.test.ts`)
This test suite uses `bun:test` and an imported `launchTUI` helper from `./helpers.ts` for testing TUI terminal capabilities and assertions. The new pure function unit tests (Parser, Sanitizer, Validator, Stack Builder) and terminal end-to-end tests will be appended here. The file already has extensive tests, so we'll just be adding to the bottom.

## 2. Requirements & Constraints
Based on the provided specification, the new implementation requires:
- **Separation of Concerns:** Split into `parser.ts`, `validator.ts`, and `stack-builder.ts` all within the new `apps/tui/src/deep-link/` directory.
- **Pure Functions:** These functions must have no side effects to allow easy unit testing outside of the terminal environment.
- **Validation Constraints:**
  - `SCREEN_MAX_LENGTH` = 32
  - `REPO_MAX_LENGTH` = 128
  - `REPO_SEGMENT_MAX_LENGTH` = 64
  - `ORG_MAX_LENGTH` = 64
  - Formatting validation via Regex for `--repo` (`/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/`) and `--org` (`/^[a-zA-Z0-9_.-]+$/`).
- **Security:** `sanitizeForDisplay` must strip out control characters using `CONTROL_CHAR_REGEX = /[\x00-\x09\x0B-\x1F]|\x1B\[[0-9;]*[A-Za-z]/g`.
- **Allowed Screens:** 13 canonical screens exactly (no legacy aliases). Handled through `SCREEN_ID_MAP`.

## 3. Implementation Targets
- **New Files:**
  - `apps/tui/src/deep-link/types.ts`
  - `apps/tui/src/deep-link/constants.ts`
  - `apps/tui/src/deep-link/parser.ts`
  - `apps/tui/src/deep-link/validator.ts`
  - `apps/tui/src/deep-link/stack-builder.ts`
  - `apps/tui/src/deep-link/index.ts`
- **Modifications:**
  - `apps/tui/src/index.tsx`: Replace imports and usage of `buildInitialStack` with the new 3-step pipeline.
  - `apps/tui/src/lib/terminal.ts`: Remove deep-link flag parsing from `parseCLIArgs`.
  - `apps/tui/src/navigation/deepLinks.ts`: Add `@deprecated` JSDoc annotation.
  - `apps/tui/src/navigation/index.ts`: Remove deprecated deep-link exports.
  - `e2e/tui/app-shell.test.ts`: Append all new tests for pure functions and E2E terminal behavior.