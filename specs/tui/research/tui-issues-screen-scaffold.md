# Research Findings for TUI Issues Screen Scaffold

Based on an investigation of the current Codeplane TUI architecture, I have gathered the necessary context for implementing the `tui-issues-screen-scaffold` ticket. Here are the key findings:

## 1. Routing & Screen Registry (`apps/tui/src/router/`)

- **Screen Names:** The `ScreenName` enum (`types.ts`) already contains `Issues`, `IssueDetail`, `IssueCreate`, and `IssueEdit`.
- **Registry State:** The `screenRegistry` (`registry.ts`) maps these four screens to the `PlaceholderScreen` component. All four currently set `requiresRepo: true` and `requiresOrg: false`.
- **Breadcrumbs:** The `breadcrumbLabel` functions in the registry are already implemented correctly according to the spec (e.g., `(p) => (p.number ? \`#${p.number}\` : "Issue")` for `IssueDetail`). Therefore, only the `component` property needs to be updated to point to our newly created scaffold components.

## 2. Navigation & Go-To Key
- **Go-To Mode:** The `g i` keybinding logic should be added to the global navigation handler or context-aware router to jump to the Issues screen when within a repository context.

## 3. UI Components & Layouts
- **Shared Elements:** The issues list will need to integrate with the standard `Layout` component, taking advantage of the `Header` and `Status` bar for context and breadcrumbs.
- **Interactions:** The status bar will need to be updated with local actions (like `c` for creation on the list screen) and display hints.

## 4. E2E Testing Framework (`e2e/tui/helpers.ts`)

- **`launchTUI` Options:** Tests can pass arguments like `args: ["--screen", "issues", "--repo", \`${OWNER}/test-repo\`]` directly into the application.
- **Assertions:** The `TUITestInstance` provides `waitForText`, `waitForNoText`, `sendKeys`, and `snapshot()`.
- **Constants:** `TERMINAL_SIZES` (`minimum`, `standard`, `large`), `OWNER`, and `TUI_SRC` are exported from `./helpers` and should be used to construct the snapshot matrix described in the spec.

## Conclusion

The architectural surface area is entirely primed for the scaffolding phase. The registry requires trivial modifications to import the new `Issues` barrel, and the deep-linking logic is fully capable of driving the new E2E tests. Following the specific directory structure and placeholder components outlined in the engineering spec will yield immediate integration.