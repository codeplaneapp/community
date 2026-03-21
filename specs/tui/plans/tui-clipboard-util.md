# Implementation Plan: `tui-clipboard-util`

## 1. Preparation

Create a new `jj` bookmark to track the implementation of the cross-platform clipboard utility and ensure all changes are scoped properly.

```bash
jj bookmark create tui-clipboard-util
```

## 2. Step 1: Core Clipboard Utility (`apps/tui/src/lib/clipboard.ts`)

Create the pure utility module responsible for platform detection, provider resolution, and executing the copy operation using Bun's native process APIs.

**Key Requirements:**
*   **Types**: Define `ClipboardProvider` (`"pbcopy"` | `"wl-copy"` | `"xclip"` | `"xsel"` | `"clip.exe"` | `"osc52"` | `"none"`) and `ClipboardResult` interfaces.
*   **Command Checking**: Implement `isCommandAvailable(command)` using `Bun.spawn` with `which`.
*   **Provider Resolution**: Implement `detectClipboardProvider()` with session caching. The detection order must be: `pbcopy` (macOS) -> `clip.exe` (WSL) -> `wl-copy` (Wayland) -> `xclip`/`xsel` (X11) -> `osc52`.

## 3. Step 2: OpenTUI React Hook (`apps/tui/src/hooks/useClipboard.ts`)

Implement a custom React hook that wraps the core utility and manages the clipboard state for TUI components.

**Key Requirements:**
*   **State Management**: Track `hasCopied` (boolean) and `error` (string | null).
*   **Timeout**: Automatically reset the `hasCopied` state after 2 seconds to provide transient visual feedback in the TUI status bar.
*   **Integration**: Seamlessly integrate with `@opentui/core` components (e.g., triggering visual updates in `<box>` or status bars).

## 4. Step 3: End-to-End Testing (`e2e/tui/clipboard.test.ts`)

**Key Requirements:**
*   **OSC52 Fallback**: Verify base64 encoding, the 100KB size limit rejection, and tmux passthrough sequence formatting by capturing `stdout`.
*   **TUI Integration & Snapshot Tests**: 
    *   Simulate navigating to a component and pressing the `y` keybinding.
    *   Validate the OpenTUI status bar displays `"Copied!"` (success) or `"Copy failed"` (error).
    *   Validate that stripping clipboard providers triggers the fallback UI, displaying the text in an OpenTUI `<box>`.
    *   Use `.snapshot()` to assert the rendered output at `80x24` and `120x40` dimensions matches golden files.
*   **Note**: Leave backend/environment-dependent tests failing if the environment lacks the tool; do not comment them out.

## 5. Final Review & Validation

*   Ensure there are no dynamic imports (`import()`) for standard library features, as Bun supports them natively.
*   Run the E2E test suite to confirm the utility and hook function as specified.

```bash
bun test e2e/tui/clipboard.test.ts
```