# Research Findings: TUI Repository README Rendering

## 1. OpenTUI Components (`<markdown>` and `<code>`)
- **Location:** `context/opentui/packages/react/src/components/index.ts` and `@opentui/react` docs.
- **Markdown Component:** The `markdown` component is registered as an OpenTUI React primitive (`MarkdownRenderable`). It accepts `content` (string), `syntaxStyle` (`SyntaxStyle`), and `tableOptions` (object) as props.
- **Code Component:** The `code` component (`CodeRenderable`) is well-documented in the `@opentui/react` README. It accepts `content`, `filetype`, and `syntaxStyle`.
- **Constraint:** Neither component provides native horizontal scrolling. The `<markdown>` component handles its own layout engine (text wrapping, code block truncation, table column allocation) constrained by the parent box width.

## 2. Syntax Styling Patterns
- **Location:** `apps/tui/src/lib/diff-syntax.ts` and `apps/tui/src/hooks/useDiffSyntaxStyle.ts`
- **Pattern:** `diff-syntax.ts` provides `createDiffSyntaxStyle(tier: ColorTier)` to generate a `SyntaxStyle` instance based on terminal color capabilities (16, 256, or truecolor). `detectColorTier` is also exported here.
- **Lifecycle Management:** `useDiffSyntaxStyle.ts` implements a critical pattern: `SyntaxStyle` instances are native OpenTUI resources that **must be explicitly destroyed** (`styleRef.current.destroy()`) when unmounted to prevent memory leaks in the TUI process.
- **Application:** The new `useMarkdownSyntaxStyle` hook must follow this exact `useEffect` cleanup pattern.

## 3. Telemetry and Logging
- **Location:** `apps/tui/src/lib/telemetry.ts` and `apps/tui/src/lib/logger.ts`
- **Logging:** `logger.ts` exports a robust `logger` object with `info`, `warn`, `error`, and `debug` methods. It respects `CODEPLANE_TUI_LOG_LEVEL` and outputs to `stderr`.
- **Telemetry Discrepancy:** The engineering spec states `import { trackEvent } from "../../lib/telemetry.js"`. However, the actual implementation in `apps/tui/src/lib/telemetry.ts` exports the function as `emit`, **not** `trackEvent`.
  - *Implementation Note:* The code will need to alias the import (`import { emit as trackEvent } from "../../lib/telemetry.js"`) or use `emit()` instead to match the actual codebase.

## 4. E2E Testing Framework
- **Location:** `e2e/tui/helpers.ts`
- **Setup:** The testing harness relies on `@microsoft/tui-test` and provides standard utilities: `launchTUI`, `TERMINAL_SIZES`, `OWNER`, and `createMockAPIEnv`.
- **Interaction:** The `TUITestInstance` provides necessary interaction and assertion methods like `.sendKeys()`, `.waitForText()`, `.snapshot()`, and `.resize()`.
- **Fixture Support:** `createMockAPIEnv` is meant to mock the API base URL. Different error states (429, 500, 404) are expected to be triggered by hitting specifically named fixture repositories (e.g., `alice/readme-error-repo` vs `alice/test-repo`).

## 5. Screen Navigation and Keybindings
- **Location:** `apps/tui/src/hooks/useScreenKeybindings.ts` and existing routing conventions.
- **Pattern:** Keybindings such as `R` (retry) and `e` (code explorer) are registered within the screen component. The `e` keybinding uses `nav.push` to transition screens and pass parameters (like `selectedFile`).

## 6. Shared Data Layer
- **Pattern:** While `useRepoReadme` and `RepoOverviewScreen.tsx` were not explicitly found in the standard paths (likely pending implementation in parallel PRs or scoped to the spec), the error formats use the standard `TUIFetchError` pattern (which includes `status` and `retryAfterMs`). The `deriveReadmeState` pure function from the spec perfectly bridges these states into visual representations.