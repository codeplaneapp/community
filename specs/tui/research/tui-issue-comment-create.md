# Research Findings: TUI Issue Comment Create

Based on an investigation of the Codeplane TUI and OpenTUI codebase, here is the comprehensive context necessary to implement the `tui-issue-comment-create` ticket.

## 1. OpenTUI `<textarea>` Capabilities

- **Native Component:** The multiline input is natively implemented in OpenTUI's core via `TextareaRenderable` (`context/opentui/packages/core/src/renderables/Textarea.ts`) and is available in the React reconciler as the `<textarea>` intrinsic element.
- **Input Handling:** It captures a robust set of key bindings natively. Features like `newLine`, `deleteWordBackward`, `undo`, `redo`, `moveCursorUp`, and `submit` are built-in. This means we don't have to write manual key handlers for basic text navigation.
- **State Management:** Rather than functioning strictly as a controlled React component (which can cause tearing/performance issues in terminal UIs), the textarea manages its own `EditBuffer`.

## 2. Validation and Optimistic State

- **Validation:** Validates the body and throws an `ApiError(400)` if the body is empty, preventing unnecessary network requests.
- **Temporary IDs:** The optimistic comment is generated with a negative ID (`-(Date.now())`), which acts as a reliable sentinel for displaying the `⏳ just now` pending indicator in the UI.

## 3. E2E Test Framework (`@microsoft/tui-test`)

- **Test Environment:** The testing suite in `e2e/tui/helpers.ts` provides a `launchTUI()` function that spins up a real headless PTY, ensuring authentic terminal emulation.
- **Standard Sizes:** Responsive behavior can be tested against constants defined in `TERMINAL_SIZES` (`minimum` 80x24, `standard` 120x40, `large` 200x60).
- **Input Simulation:** The `TUITestInstance` provides `.sendKeys("ctrl+s")` for chorded shortcuts and `.sendText("markdown body")` for literal text ingestion.
- **Assertions:** `.waitForText()`, `.waitForNoText()`, and `.snapshot()` enable robust visual regressions without manually checking coordinate bounds.