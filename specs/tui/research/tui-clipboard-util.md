# Research Findings: `tui-clipboard-util`

## 1. Codebase Structure & Missing Directories
My initial searches (via `glob`, `list_directory`, and shell commands) against the designated target directories (`apps/tui/`, `packages/ui-core/`, `apps/ui/`) revealed that these directories are not present within the provided workspace context (`/Users/williamcory/codeplane/specs/tui`). 

However, the workspace does contain critical contextual artifacts, specifically the E2E testing framework (`e2e/tui/`) and access to the parent repository's `context/opentui/` directories.

## 2. OpenTUI's Existing Clipboard Mechanism
Investigation into the `context/opentui/packages/core/src/lib/clipboard.ts` path shows that OpenTUI already possesses an internal clipboard mechanism targeting OSC 52 via native Zig bindings.

**Key Findings in OpenTUI:**
- **Implementation:** `Clipboard.copyToClipboardOSC52(text, target)` leverages a Zig-backed `getTerminalCapabilities(this.rendererPtr)` to determine if OSC 52 is natively supported.
- **Encoding:** It encodes the text payload as base64: `encodeOsc52Payload`.
- **Limitations:** OpenTUI's internal implementation focuses *strictly* on OSC 52 and does not attempt child-process delegation (e.g., `pbcopy`, `wl-copy`, `xclip`, `clip.exe`).
- **Alignment with Spec:** The engineering spec demands a much more robust approach for the Codeplane TUI (prioritizing native OS clipboards over OSC 52 and adding `tmux` passthrough support). Therefore, the new `apps/tui/src/lib/clipboard.ts` will bypass OpenTUI's internal clipboard method in favor of the `Bun.spawn` child-process approach, dropping down to a custom OSC 52 write (`process.stdout.write`) only as a last resort.

## 3. E2E Test Scaffolding (`e2e/tui/helpers.ts`)
I analyzed the testing utilities in `e2e/tui/helpers.ts` and `e2e/tui/agents.test.ts`. These provide the exact testing API contract required to implement the integration tests outlined in the engineering spec.

**Test Instance API (`TUITestInstance`):**
- `sendKeys(...keys: string[])`: Simulates vim-style navigation (`j`, `k`, `y`, `Esc`).
- `sendText(text: string)`: Enters text into focused inputs.
- `waitForText(text: string, timeoutMs?)`: Validates that the status bar or UI displays feedback (e.g., waiting for `"Copied!"` or `"Copy failed"`).
- `snapshot()`: Captures the terminal output to match against golden files (used for `SNAP-CLIP-*` tests).
- `resize(cols, rows)`: Useful for validating that the fallback UI renders correctly at `80x24` versus `120x40`.

These primitives exactly match the E2E interaction steps described in the ticket, meaning no new E2E scaffolding is needed to test the `y` keybinding or the fallback text display.

## 4. React Hook Patterns for OpenTUI
Although `apps/tui/src/hooks/` wasn't available for direct inspection, referencing the provided engineering spec alongside OpenTUI's React reconciler (`packages/react/src/hooks/`) confirms the target architectural pattern:
- OpenTUI components operate exactly like standard React DOM components.
- The requested `useClipboard` hook leverages standard React 19 hooks (`useState`, `useCallback`, `useRef`).
- The timeout logic (`timeoutRef.current`) handles rapid re-renders cleanly, mitigating strict-mode double-invocation issues.
- Since the underlying utility (`copyToClipboard`) writes to `process.stdout` and uses `Bun.spawn`, the hook remains completely decoupled from the OpenTUI renderer itself, acting strictly as headless data and state management.

## 5. Next Steps / Implementation Readiness
The research confirms that we have all required testing primitives and a clear understanding of why we are bypassing OpenTUI's built-in OSC 52 implementation. The implementation can proceed strictly according to the provided `tui-clipboard-util` engineering spec, creating the robust Bun-native child-process dispatcher and the accompanying React hook.