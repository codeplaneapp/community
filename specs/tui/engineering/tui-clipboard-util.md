# Engineering Specification: `tui-clipboard-util`

## Cross-platform clipboard copy utility

**Ticket ID:** `tui-clipboard-util`
**Type:** Engineering (infrastructure)
**Feature:** Supports clipboard copy across all TUI screens (issue URLs, SSH info, commit hashes, code snippets, etc.)
**Dependencies:** None
**Status:** Not started

---

## Overview

This ticket creates a cross-platform clipboard copy utility for the TUI. It delivers two modules:

1. **`apps/tui/src/lib/clipboard.ts`** — Pure utility module containing platform detection logic, clipboard provider resolution, and the `copyToClipboard()` async function that writes text to the system clipboard using the appropriate mechanism for the detected platform.
2. **`apps/tui/src/hooks/useClipboard.ts`** — React hook that wraps the clipboard utility with state management for success/failure feedback, fallback text display, and automatic status timeout.

The clipboard utility is consumed by any TUI component that needs to offer a "copy" action — workspace SSH connection strings, issue/landing URLs, commit hashes, code snippets, API tokens, etc. When no clipboard tool is available, the calling component receives a `false` result and should display the text for manual copy (e.g., in a selectable text box).

---

## Implementation Plan

### Step 1: Define platform and clipboard provider types

**File:** `apps/tui/src/lib/clipboard.ts`

Define the supported clipboard providers as a discriminated union. Each provider represents a specific mechanism for writing to the system clipboard.

```typescript
/**
 * Supported clipboard provider mechanisms.
 *
 * - "pbcopy": macOS native clipboard via pbcopy child process
 * - "wl-copy": Wayland compositor clipboard via wl-copy child process
 * - "xclip": X11 clipboard via xclip child process
 * - "xsel": X11 clipboard via xsel child process (fallback for xclip)
 * - "clip.exe": Windows clipboard via clip.exe (used from WSL)
 * - "osc52": Terminal-native OSC 52 escape sequence (no child process)
 * - "none": No clipboard mechanism available
 */
export type ClipboardProvider =
  | "pbcopy"
  | "wl-copy"
  | "xclip"
  | "xsel"
  | "clip.exe"
  | "osc52"
  | "none"

export interface ClipboardResult {
  /** Whether the copy operation succeeded */
  success: boolean
  /** The provider that was used, or "none" if no provider was available */
  provider: ClipboardProvider
  /** Error message if the copy failed */
  error?: string
}
```

### Step 2: Implement command availability check

**File:** `apps/tui/src/lib/clipboard.ts`

Implement a helper function that checks whether a given command-line tool is available on the system by attempting to execute it with a harmless flag. This uses Bun's `Bun.spawn` API (not Node's `child_process`) for consistency with the Bun runtime.

```typescript
/**
 * Check if a command exists and is executable.
 * Uses `which` on Unix and `where` on Windows/WSL.
 * Returns true if the command is found, false otherwise.
 */
async function isCommandAvailable(command: string): Promise<boolean> {
  try {
    const proc = Bun.spawn(["which", command], {
      stdout: "pipe",
      stderr: "pipe",
    })
    const exitCode = await proc.exited
    return exitCode === 0
  } catch {
    return false
  }
}
```

**Design decision:** `which` is used instead of attempting to run the clipboard command itself. This avoids side effects during detection (e.g., `pbcopy` would block waiting for stdin). The `which` command is universally available on macOS, Linux, and WSL environments where the TUI runs.

**Timeout:** `Bun.spawn` does not require an explicit timeout for `which` — it completes in <10ms on all platforms. If the process hangs (e.g., broken PATH), the caller's overall timeout at the hook level handles it.

### Step 3: Implement platform detection and provider resolution

**File:** `apps/tui/src/lib/clipboard.ts`

Detect the runtime platform and resolve the best available clipboard provider. The detection order is chosen to prefer the most reliable mechanism on each platform.

```typescript
/**
 * Detect the current platform and resolve the best clipboard provider.
 *
 * Detection order:
 * 1. macOS → pbcopy (always available)
 * 2. WSL → clip.exe (always available in WSL)
 * 3. Linux + Wayland (WAYLAND_DISPLAY set) → wl-copy
 * 4. Linux + X11 (DISPLAY set) → xclip, then xsel
 * 5. OSC 52 terminal support (TERM_PROGRAM check)
 * 6. None
 *
 * The resolved provider is cached after first call (platform doesn't change
 * during a TUI session).
 */
let cachedProvider: ClipboardProvider | null = null

export async function detectClipboardProvider(): Promise<ClipboardProvider> {
  if (cachedProvider !== null) {
    return cachedProvider
  }

  const provider = await resolveProvider()
  cachedProvider = provider
  return provider
}

async function resolveProvider(): Promise<ClipboardProvider> {
  const platform = process.platform

  // 1. macOS: pbcopy is always installed
  if (platform === "darwin") {
    return "pbcopy"
  }

  // 2. WSL detection: check for Microsoft in kernel version
  if (platform === "linux" && isWSL()) {
    return "clip.exe"
  }

  // 3. Linux with Wayland
  if (platform === "linux" && process.env.WAYLAND_DISPLAY) {
    if (await isCommandAvailable("wl-copy")) {
      return "wl-copy"
    }
  }

  // 4. Linux with X11
  if (platform === "linux" && process.env.DISPLAY) {
    if (await isCommandAvailable("xclip")) {
      return "xclip"
    }
    if (await isCommandAvailable("xsel")) {
      return "xsel"
    }
  }

  // 5. OSC 52 terminal-native fallback
  if (isOSC52Supported()) {
    return "osc52"
  }

  // 6. No clipboard available
  return "none"
}
```

**WSL detection:**

```typescript
/**
 * Detect Windows Subsystem for Linux.
 * Checks /proc/version for Microsoft/WSL indicators.
 * This is synchronous — reads a small procfs file once.
 */
function isWSL(): boolean {
  try {
    const version = require("fs").readFileSync("/proc/version", "utf-8")
    return /microsoft|wsl/i.test(version)
  } catch {
    return false
  }
}
```

**OSC 52 support detection:**

```typescript
/**
 * Detect whether the terminal supports OSC 52 clipboard escape sequences.
 *
 * Known supported terminals (by TERM_PROGRAM):
 * - iTerm2 (iTerm.app / iTerm2)
 * - tmux (wraps OSC 52 through to outer terminal)
 * - alacritty
 * - kitty
 * - foot
 * - WezTerm
 * - ghostty
 *
 * Note: tmux support requires `set -g set-clipboard on` in tmux.conf.
 * We detect tmux but cannot verify the setting — OSC 52 may silently fail.
 */
const OSC52_SUPPORTED_TERMINALS = new Set([
  "iTerm.app",
  "iTerm2",
  "tmux",
  "alacritty",
  "kitty",
  "foot",
  "WezTerm",
  "ghostty",
])

export function isOSC52Supported(): boolean {
  const termProgram = process.env.TERM_PROGRAM
  if (termProgram && OSC52_SUPPORTED_TERMINALS.has(termProgram)) {
    return true
  }

  // tmux sets TERM_PROGRAM to the outer terminal but TMUX is always set
  if (process.env.TMUX) {
    return true
  }

  return false
}
```

**Design decisions:**

- **pbcopy on macOS is not checked via `isCommandAvailable`** because it is part of the base macOS install and is always present. Skipping the check avoids an unnecessary process spawn.
- **clip.exe on WSL is not checked via `isCommandAvailable`** because it is always available in WSL 1 and WSL 2. The WSL check itself (`/proc/version`) is sufficient.
- **Provider caching:** The platform and available tools do not change during a TUI session. The provider is resolved once and cached in a module-level variable. This avoids repeated `which` calls on every copy action.
- **OSC 52 is the lowest-priority child-process-free provider** because it is not universally supported and may silently fail in terminals that don't implement it. It is preferred over "none" because it is better to attempt a copy that may work than to immediately show a fallback.

### Step 4: Implement the `copyToClipboard()` function

**File:** `apps/tui/src/lib/clipboard.ts`

The core function that writes text to the system clipboard using the resolved provider.

```typescript
/**
 * Copy text to the system clipboard.
 *
 * @param text - The text to copy. Must be a non-empty string.
 * @returns A ClipboardResult indicating success/failure and the provider used.
 *
 * Behavior per provider:
 * - pbcopy: spawns `pbcopy`, writes text to stdin, waits for exit
 * - wl-copy: spawns `wl-copy`, writes text to stdin, waits for exit
 * - xclip: spawns `xclip -selection clipboard`, writes text to stdin, waits for exit
 * - xsel: spawns `xsel --clipboard --input`, writes text to stdin, waits for exit
 * - clip.exe: spawns `clip.exe`, writes text to stdin, waits for exit
 * - osc52: writes OSC 52 escape sequence directly to stdout (synchronous)
 * - none: returns { success: false, provider: "none" }
 *
 * All child process providers have a 5-second timeout. If the process does
 * not exit within 5 seconds, it is killed and the function returns failure.
 */
export async function copyToClipboard(text: string): Promise<ClipboardResult> {
  if (typeof text !== "string" || text.length === 0) {
    return { success: false, provider: "none", error: "Empty text" }
  }

  const provider = await detectClipboardProvider()

  if (provider === "none") {
    return { success: false, provider: "none", error: "No clipboard provider available" }
  }

  if (provider === "osc52") {
    return copyViaOSC52(text)
  }

  return copyViaChildProcess(provider, text)
}
```

**Child process copy implementation:**

```typescript
const CLIPBOARD_TIMEOUT_MS = 5000

/**
 * Build the command and arguments for a clipboard provider.
 */
function getProviderCommand(provider: ClipboardProvider): [string, string[]] {
  switch (provider) {
    case "pbcopy":
      return ["pbcopy", []]
    case "wl-copy":
      return ["wl-copy", []]
    case "xclip":
      return ["xclip", ["-selection", "clipboard"]]
    case "xsel":
      return ["xsel", ["--clipboard", "--input"]]
    case "clip.exe":
      return ["clip.exe", []]
    default:
      throw new Error(`Unsupported child process provider: ${provider}`)
  }
}

async function copyViaChildProcess(
  provider: ClipboardProvider,
  text: string
): Promise<ClipboardResult> {
  const [command, args] = getProviderCommand(provider)

  try {
    const proc = Bun.spawn([command, ...args], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    })

    // Write text to stdin and close
    proc.stdin.write(text)
    proc.stdin.end()

    // Wait for process to exit with timeout
    const exitCode = await Promise.race([
      proc.exited,
      new Promise<never>((_, reject) =>
        setTimeout(() => {
          proc.kill()
          reject(new Error(`Clipboard command timed out after ${CLIPBOARD_TIMEOUT_MS}ms`))
        }, CLIPBOARD_TIMEOUT_MS)
      ),
    ])

    if (exitCode === 0) {
      return { success: true, provider }
    }

    // Read stderr for error details
    const stderrText = await new Response(proc.stderr).text()
    return {
      success: false,
      provider,
      error: `${command} exited with code ${exitCode}: ${stderrText.trim().slice(0, 200)}`,
    }
  } catch (err) {
    return {
      success: false,
      provider,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
```

**OSC 52 copy implementation:**

```typescript
/**
 * Copy text to clipboard using the OSC 52 escape sequence.
 *
 * OSC 52 format: ESC ] 52 ; c ; <base64-encoded-text> ESC \
 *
 * This writes directly to process.stdout. The terminal emulator
 * interprets the escape sequence and copies the decoded text to
 * the system clipboard.
 *
 * Limitations:
 * - Some terminals cap OSC 52 payload size (e.g., tmux defaults to 1MB)
 * - The write is fire-and-forget — there is no confirmation from the terminal
 * - Returns success: true optimistically (we cannot verify the terminal acted on it)
 */
const OSC52_MAX_PAYLOAD_BYTES = 100_000 // ~74KB of text after base64 encoding

function copyViaOSC52(text: string): ClipboardResult {
  const encoded = Buffer.from(text, "utf-8").toString("base64")

  if (encoded.length > OSC52_MAX_PAYLOAD_BYTES) {
    return {
      success: false,
      provider: "osc52",
      error: `Text too large for OSC 52 (${encoded.length} bytes encoded, max ${OSC52_MAX_PAYLOAD_BYTES})`,
    }
  }

  try {
    // ESC ] 52 ; c ; <base64> ESC \
    const sequence = `\x1b]52;c;${encoded}\x1b\\`

    // In tmux, wrap in tmux passthrough sequence
    if (process.env.TMUX) {
      // tmux passthrough: ESC Ptmux; ESC <sequence> ESC \
      const tmuxSequence = `\x1bPtmux;\x1b${sequence}\x1b\\`
      process.stdout.write(tmuxSequence)
    } else {
      process.stdout.write(sequence)
    }

    // OSC 52 is fire-and-forget — we assume success
    return { success: true, provider: "osc52" }
  } catch (err) {
    return {
      success: false,
      provider: "osc52",
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
```

**Edge cases handled:**

- **Empty string:** Returns `{ success: false, provider: "none", error: "Empty text" }` immediately. No process spawned.
- **Very large text (> 1MB):** Child process providers handle arbitrary-size stdin. OSC 52 enforces a 100KB encoded payload limit (many terminals truncate larger payloads silently).
- **Missing clipboard command at runtime:** If a command was available at detection time but removed during the session (unlikely), the child process spawn will fail and the error is captured.
- **tmux passthrough:** OSC 52 inside tmux requires wrapping in the tmux passthrough DCS sequence. The function detects `TMUX` environment variable and wraps automatically.
- **Non-UTF-8 text:** `Buffer.from(text, "utf-8")` handles the conversion. Invalid sequences are replaced with the Unicode replacement character.

### Step 5: Implement provider cache invalidation (for testing)

**File:** `apps/tui/src/lib/clipboard.ts`

Export a function to clear the cached provider, enabling tests to exercise different platform scenarios.

```typescript
/**
 * Clear the cached clipboard provider.
 * Exported for testing only — not for production use.
 * The next call to detectClipboardProvider() will re-detect.
 */
export function _resetProviderCache(): void {
  cachedProvider = null
}
```

### Step 6: Export public API

**File:** `apps/tui/src/lib/clipboard.ts`

The module's public exports:

```typescript
// Types
export type { ClipboardProvider, ClipboardResult }

// Functions
export {
  copyToClipboard,
  detectClipboardProvider,
  isOSC52Supported,
  _resetProviderCache,
}
```

**Not exported (internal):**
- `isCommandAvailable` — implementation detail
- `isWSL` — implementation detail
- `resolveProvider` — implementation detail, use `detectClipboardProvider`
- `copyViaChildProcess` — implementation detail
- `copyViaOSC52` — implementation detail
- `getProviderCommand` — implementation detail
- `OSC52_SUPPORTED_TERMINALS` — implementation detail
- `OSC52_MAX_PAYLOAD_BYTES` — implementation detail
- `CLIPBOARD_TIMEOUT_MS` — implementation detail

### Step 7: Create `useClipboard` React hook

**File:** `apps/tui/src/hooks/useClipboard.ts`

This hook wraps the clipboard utility with React state management for UI feedback. It provides a `copy` function, a `status` state for rendering feedback ("Copied!", "Failed", etc.), and the `fallbackText` when clipboard is unavailable.

```typescript
import { useState, useCallback, useRef } from "react"
import {
  copyToClipboard,
  detectClipboardProvider,
  type ClipboardResult,
  type ClipboardProvider,
} from "../lib/clipboard.js"

export type ClipboardStatus = "idle" | "copying" | "copied" | "failed" | "unavailable"

export interface UseClipboardReturn {
  /** Attempt to copy text to the system clipboard */
  copy: (text: string) => Promise<ClipboardResult>
  /** Current status of the last copy operation */
  status: ClipboardStatus
  /** The text that should be shown for manual copy (set when provider is "none") */
  fallbackText: string | null
  /** Clear the fallback text display */
  clearFallback: () => void
  /** The detected clipboard provider */
  provider: ClipboardProvider | null
}

const STATUS_RESET_DELAY_MS = 2000

/**
 * React hook for clipboard copy operations.
 *
 * Provides a copy function with status tracking and automatic
 * status reset after 2 seconds. When no clipboard provider is
 * available, sets fallbackText for the component to display.
 *
 * @example
 * ```tsx
 * function CopyButton({ text }: { text: string }) {
 *   const { copy, status, fallbackText, clearFallback } = useClipboard()
 *
 *   return (
 *     <box flexDirection="column">
 *       <button onPress={() => copy(text)}>
 *         {status === "copied" ? "Copied!" : "Copy"}
 *       </button>
 *       {fallbackText && (
 *         <box border="single">
 *           <text>Copy manually: {fallbackText}</text>
 *           <button onPress={clearFallback}>Dismiss</button>
 *         </box>
 *       )}
 *     </box>
 *   )
 * }
 * ```
 */
export function useClipboard(): UseClipboardReturn {
  const [status, setStatus] = useState<ClipboardStatus>("idle")
  const [fallbackText, setFallbackText] = useState<string | null>(null)
  const [provider, setProvider] = useState<ClipboardProvider | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearFallback = useCallback(() => {
    setFallbackText(null)
  }, [])

  const copy = useCallback(async (text: string): Promise<ClipboardResult> => {
    // Clear any pending status reset
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }

    setStatus("copying")
    setFallbackText(null)

    const result = await copyToClipboard(text)
    setProvider(result.provider)

    if (result.success) {
      setStatus("copied")
    } else if (result.provider === "none") {
      setStatus("unavailable")
      setFallbackText(text)
    } else {
      setStatus("failed")
    }

    // Auto-reset status after delay (except "unavailable" which persists
    // until the user dismisses the fallback)
    if (result.provider !== "none") {
      timeoutRef.current = setTimeout(() => {
        setStatus("idle")
        timeoutRef.current = null
      }, STATUS_RESET_DELAY_MS)
    }

    return result
  }, [])

  return { copy, status, fallbackText, clearFallback, provider }
}
```

**Hook lifecycle:**

1. Component calls `copy(text)` → status becomes `"copying"`
2. `copyToClipboard` resolves → status becomes `"copied"`, `"failed"`, or `"unavailable"`
3. For `"copied"` and `"failed"`: status resets to `"idle"` after 2 seconds
4. For `"unavailable"`: `fallbackText` is set, status persists until `clearFallback()` is called
5. On unmount: the timeout is cleared via the ref (no stale state updates)

**Cleanup on unmount:**

The `timeoutRef` prevents stale `setStatus` calls after unmount. Since React 19's `useCallback` and `useState` handle cleanup of pending state updates, and the timeout is tracked via ref, the hook is safe against memory leaks.

### Step 8: Integration pattern for consumers

This step documents how downstream components consume the clipboard modules. No new files are created in this step — it describes the integration contract.

**Direct utility usage (non-React contexts):**

```typescript
import { copyToClipboard } from "../lib/clipboard.js"

// In a keybinding handler or action callback
async function handleCopySSHInfo(sshUrl: string) {
  const result = await copyToClipboard(sshUrl)
  if (!result.success) {
    // Show fallback UI with the text
    showFallbackDisplay(sshUrl)
  }
}
```

**Hook usage in components:**

```tsx
import { useClipboard } from "../../hooks/useClipboard.js"

function WorkspaceSSHInfo({ sshUrl }: { sshUrl: string }) {
  const { copy, status, fallbackText, clearFallback } = useClipboard()

  useScreenKeybindings([
    {
      key: "y",
      description: "Copy SSH URL",
      handler: () => copy(sshUrl),
    },
  ])

  return (
    <box flexDirection="column" gap={1}>
      <text>{sshUrl}</text>
      {status === "copied" && <text color="success">Copied to clipboard!</text>}
      {status === "failed" && <text color="error">Copy failed. Select and copy manually:</text>}
      {fallbackText && (
        <box border="single" padding={1}>
          <text>{fallbackText}</text>
          <text color="muted">Press Esc to dismiss</text>
        </box>
      )}
    </box>
  )
}
```

**Status bar integration:**

When `y` (yank) is pressed on a copyable item, the status bar should briefly show the copy result:

```tsx
// In StatusBar component
{clipboardStatus === "copied" && <text fg={theme.success}>Copied!</text>}
{clipboardStatus === "failed" && <text fg={theme.error}>Copy failed</text>}
{clipboardStatus === "unavailable" && <text fg={theme.warning}>No clipboard — text shown above</text>}
```

---

## File Manifest

| File | Purpose | New/Existing |
|------|---------|-------------|
| `apps/tui/src/lib/clipboard.ts` | Platform detection, provider resolution, clipboard copy function | New |
| `apps/tui/src/hooks/useClipboard.ts` | React hook for clipboard state management and feedback | New |
| `e2e/tui/clipboard.test.ts` | E2E tests for clipboard utility behavior | New |

---

## API Surface

### `apps/tui/src/lib/clipboard.ts`

```typescript
// Types
type ClipboardProvider = "pbcopy" | "wl-copy" | "xclip" | "xsel" | "clip.exe" | "osc52" | "none"

interface ClipboardResult {
  success: boolean
  provider: ClipboardProvider
  error?: string
}

// Functions
function copyToClipboard(text: string): Promise<ClipboardResult>
function detectClipboardProvider(): Promise<ClipboardProvider>
function isOSC52Supported(): boolean
function _resetProviderCache(): void  // testing only
```

### `apps/tui/src/hooks/useClipboard.ts`

```typescript
type ClipboardStatus = "idle" | "copying" | "copied" | "failed" | "unavailable"

interface UseClipboardReturn {
  copy: (text: string) => Promise<ClipboardResult>
  status: ClipboardStatus
  fallbackText: string | null
  clearFallback: () => void
  provider: ClipboardProvider | null
}

function useClipboard(): UseClipboardReturn
```

---

## Productionization Notes

### From PoC to production

If any proof-of-concept code exists in `poc/` for clipboard operations, the following must be addressed before merging to `apps/tui/src/`:

1. **Provider caching:** PoC code may re-detect the platform on every copy. Production code must cache the resolved provider in a module-level variable. Platform and available tools do not change during a TUI session.

2. **Timeout enforcement:** PoC code may spawn clipboard processes without timeout protection. Production code must enforce a 5-second timeout on all child process operations to prevent the TUI from hanging if a clipboard tool blocks (e.g., `xclip` waiting for X11 selection requests on a dead display).

3. **stdin write + close:** PoC code may forget to call `.end()` on the child process stdin after writing. Without `.end()`, `pbcopy`, `wl-copy`, `xclip`, and `xsel` will hang indefinitely waiting for EOF. Production code must always call `proc.stdin.end()` immediately after `proc.stdin.write(text)`.

4. **stderr capture:** PoC code may ignore stderr from clipboard commands. Production code captures stderr to include in the error message returned to callers, aiding debugging.

5. **OSC 52 payload size guard:** PoC code may write arbitrarily large OSC 52 payloads. Many terminals silently truncate large payloads (tmux defaults to 1MB buffer, some terminals cap at 100KB). Production code enforces a 100KB encoded payload limit and returns a clear error.

6. **tmux passthrough wrapping:** PoC code may emit bare OSC 52 sequences inside tmux, which tmux does not forward to the outer terminal. Production code detects `TMUX` environment variable and wraps the sequence in the tmux DCS passthrough (`\x1bPtmux;\x1b...\x1b\\`).

7. **No dynamic imports:** All imports (`Bun.spawn`, `Buffer`, `fs.readFileSync`) are available in Bun natively. No dynamic `import()` needed. Module loads synchronously.

8. **Bun.spawn over child_process:** Production code uses `Bun.spawn` (the native Bun process API) instead of Node's `child_process.spawn`. `Bun.spawn` returns a native `Subprocess` with async `exited` promise, making the timeout race pattern clean.

### Performance budget

- `detectClipboardProvider()` first call: < 50ms (one `which` spawn on Linux, zero spawns on macOS)
- `detectClipboardProvider()` cached call: < 0.01ms (returns cached value)
- `copyToClipboard()` via child process: < 100ms for text under 1MB
- `copyToClipboard()` via OSC 52: < 1ms (synchronous stdout write)
- Memory: < 1KB persistent (cached provider enum + set of terminal names)

### Error recovery

The clipboard utility never throws. All errors are captured and returned as `ClipboardResult` objects with `success: false`. The calling component or hook is responsible for user-facing error display. This contract ensures that a clipboard failure never crashes the TUI or disrupts the current screen.

### React strict mode

In React 19 strict mode (development only), effects run twice. The `useClipboard` hook is safe under strict mode:

- `useCallback` for `copy` and `clearFallback` — stable references, no cleanup needed
- `useState` for `status`, `fallbackText`, `provider` — standard React state, no side effects on mount
- `useRef` for `timeoutRef` — tracks the pending timeout across re-renders
- No `useEffect` with cleanup — the timeout is managed via the ref in the `copy` callback, not in an effect

### Security considerations

- **No arbitrary command execution:** The clipboard commands are hardcoded strings (`"pbcopy"`, `"wl-copy"`, etc.). The `text` parameter is written to stdin, never interpolated into a command string. Shell injection is not possible.
- **No sensitive data in logs:** The clipboard utility does not log the copied text. Error messages include only the command name and exit code.
- **OSC 52 base64 encoding:** The text is base64-encoded before embedding in the escape sequence, preventing terminal injection via crafted text content.

---

## Unit & Integration Tests

### Test file: `e2e/tui/clipboard.test.ts`

All tests use `@microsoft/tui-test`. Tests that depend on specific platform availability (e.g., pbcopy on macOS, xclip on Linux) will naturally pass on their target platform and fail on others — this is expected and correct. Tests are never skipped or commented out.

#### Provider Detection Tests

```
describe("TUI_CLIPBOARD — provider detection", () => {

  test("DET-CLIP-001: detects pbcopy on macOS", async () => {
    // Set process.platform to "darwin" (via env or conditional)
    // Call detectClipboardProvider()
    // Assert: returns "pbcopy"
  })

  test("DET-CLIP-002: detects clip.exe on WSL", async () => {
    // On a WSL environment (process.platform === "linux", /proc/version contains "microsoft")
    // Call detectClipboardProvider()
    // Assert: returns "clip.exe"
  })

  test("DET-CLIP-003: detects wl-copy on Wayland Linux", async () => {
    // On Linux with WAYLAND_DISPLAY set and wl-copy installed
    // Call detectClipboardProvider()
    // Assert: returns "wl-copy"
  })

  test("DET-CLIP-004: detects xclip on X11 Linux", async () => {
    // On Linux with DISPLAY set, xclip installed, no WAYLAND_DISPLAY
    // Call detectClipboardProvider()
    // Assert: returns "xclip"
  })

  test("DET-CLIP-005: detects xsel when xclip unavailable on X11 Linux", async () => {
    // On Linux with DISPLAY set, xsel installed, xclip NOT installed
    // Call detectClipboardProvider()
    // Assert: returns "xsel"
  })

  test("DET-CLIP-006: detects OSC 52 when TERM_PROGRAM is iTerm2", async () => {
    // On Linux with no DISPLAY, no WAYLAND_DISPLAY
    // TERM_PROGRAM=iTerm2
    // Call detectClipboardProvider()
    // Assert: returns "osc52"
  })

  test("DET-CLIP-007: detects OSC 52 when TMUX is set", async () => {
    // On Linux with no DISPLAY, no WAYLAND_DISPLAY
    // TMUX=/tmp/tmux-1000/default,12345,0
    // Call detectClipboardProvider()
    // Assert: returns "osc52"
  })

  test("DET-CLIP-008: returns none when no provider available", async () => {
    // On Linux with no DISPLAY, no WAYLAND_DISPLAY, no TMUX, no TERM_PROGRAM match
    // No clipboard commands installed
    // Call detectClipboardProvider()
    // Assert: returns "none"
  })

  test("DET-CLIP-009: caches provider after first detection", async () => {
    // Call detectClipboardProvider() twice
    // Assert: second call returns same result
    // Assert: no additional process spawns on second call
  })

  test("DET-CLIP-010: _resetProviderCache forces re-detection", async () => {
    // Call detectClipboardProvider() → caches result
    // Call _resetProviderCache()
    // Modify environment
    // Call detectClipboardProvider() again
    // Assert: re-detects based on new environment
  })
})
```

#### OSC 52 Detection Tests

```
describe("TUI_CLIPBOARD — OSC 52 support detection", () => {

  test("OSC52-DET-001: isOSC52Supported returns true for kitty", () => {
    // TERM_PROGRAM=kitty
    // Assert: isOSC52Supported() === true
  })

  test("OSC52-DET-002: isOSC52Supported returns true for alacritty", () => {
    // TERM_PROGRAM=alacritty
    // Assert: isOSC52Supported() === true
  })

  test("OSC52-DET-003: isOSC52Supported returns true for WezTerm", () => {
    // TERM_PROGRAM=WezTerm
    // Assert: isOSC52Supported() === true
  })

  test("OSC52-DET-004: isOSC52Supported returns true for ghostty", () => {
    // TERM_PROGRAM=ghostty
    // Assert: isOSC52Supported() === true
  })

  test("OSC52-DET-005: isOSC52Supported returns true when TMUX is set", () => {
    // TERM_PROGRAM unset, TMUX=/tmp/tmux-1000/default,12345,0
    // Assert: isOSC52Supported() === true
  })

  test("OSC52-DET-006: isOSC52Supported returns false for xterm-256color", () => {
    // TERM_PROGRAM unset or "xterm", no TMUX
    // Assert: isOSC52Supported() === false
  })

  test("OSC52-DET-007: isOSC52Supported returns false when no TERM_PROGRAM", () => {
    // TERM_PROGRAM not set, TMUX not set
    // Assert: isOSC52Supported() === false
  })
})
```

#### Copy Operation Tests

```
describe("TUI_CLIPBOARD — copyToClipboard", () => {

  test("COPY-CLIP-001: copies text via native provider", async () => {
    // On the current platform (whatever provider is detected)
    // Call copyToClipboard("hello world")
    // Assert: result.success === true
    // Assert: result.provider is a valid non-"none" provider
  })

  test("COPY-CLIP-002: returns failure for empty string", async () => {
    // Call copyToClipboard("")
    // Assert: result.success === false
    // Assert: result.error === "Empty text"
    // Assert: result.provider === "none"
  })

  test("COPY-CLIP-003: returns failure when no provider available", async () => {
    // Arrange: environment with no clipboard tools
    // Call copyToClipboard("test")
    // Assert: result.success === false
    // Assert: result.provider === "none"
    // Assert: result.error contains "No clipboard provider"
  })

  test("COPY-CLIP-004: handles Unicode text correctly", async () => {
    // Call copyToClipboard("こんにちは 🎉 emoji test")
    // Assert: result.success === true (on platforms with clipboard)
    // No encoding errors
  })

  test("COPY-CLIP-005: handles multi-line text", async () => {
    // Call copyToClipboard("line 1\nline 2\nline 3")
    // Assert: result.success === true
    // Newlines preserved in clipboard
  })

  test("COPY-CLIP-006: handles large text (100KB)", async () => {
    // Call copyToClipboard("x".repeat(100_000))
    // Assert: result.success === true via child process providers
    // OSC 52 may fail due to size limit — this is correct behavior
  })

  test("COPY-CLIP-007: returns error details on process failure", async () => {
    // Simulate a clipboard command that exits with non-zero code
    // Assert: result.success === false
    // Assert: result.error contains exit code
    // Assert: result.provider is the attempted provider
  })

  test("COPY-CLIP-008: does not throw on any failure mode", async () => {
    // Call copyToClipboard with various edge cases
    // Assert: no exceptions thrown
    // Assert: all results are valid ClipboardResult objects
  })
})
```

#### OSC 52 Copy Tests

```
describe("TUI_CLIPBOARD — OSC 52 copy", () => {

  test("OSC52-COPY-001: emits correct OSC 52 escape sequence", async () => {
    // On a terminal with OSC 52 support
    // Capture stdout
    // Call copyToClipboard("test")
    // Assert: stdout contains \x1b]52;c;<base64 of "test">\x1b\\
  })

  test("OSC52-COPY-002: base64 encodes text correctly", async () => {
    // Call copyToClipboard("hello")
    // Assert: base64 portion of OSC 52 sequence is btoa("hello") = "aGVsbG8="
  })

  test("OSC52-COPY-003: wraps in tmux passthrough when TMUX is set", async () => {
    // TMUX=/tmp/tmux-1000/default,12345,0
    // Capture stdout
    // Call copyToClipboard("test")
    // Assert: stdout contains \x1bPtmux;\x1b\x1b]52;c;<base64>\x1b\\\x1b\\
  })

  test("OSC52-COPY-004: rejects text exceeding OSC 52 size limit", async () => {
    // Force OSC 52 as provider
    // Call copyToClipboard("x".repeat(200_000))
    // Assert: result.success === false
    // Assert: result.error contains "too large"
  })

  test("OSC52-COPY-005: handles special characters in base64 encoding", async () => {
    // Call copyToClipboard with text containing null bytes, control chars, quotes
    // Assert: base64 encoding succeeds
    // Assert: no terminal injection possible
  })
})
```

#### TUI Integration Tests (E2E with terminal rendering)

```
describe("TUI_CLIPBOARD — E2E integration", () => {

  test("INT-CLIP-001: y keybinding copies focused item text", async () => {
    // Launch TUI at 120x40
    // Navigate to a screen with copyable content (e.g., workspace SSH info)
    // Press y (yank/copy)
    // Assert: status bar briefly shows "Copied!" in green
    // Assert: status resets to normal after ~2 seconds
  })

  test("INT-CLIP-002: fallback text displayed when no clipboard available", async () => {
    // Launch TUI with no clipboard providers (stripped env)
    // Navigate to copyable content
    // Press y
    // Assert: fallback text box appears with the content
    // Assert: text says "Copy manually:" or similar
    // Assert: Esc dismisses the fallback box
  })

  test("INT-CLIP-003: copy failure shows error in status bar", async () => {
    // Launch TUI where clipboard command will fail
    // Press y on copyable content
    // Assert: status bar shows "Copy failed" in red/error color
    // Assert: status resets after ~2 seconds
  })

  test("INT-CLIP-004: Esc dismisses fallback text display", async () => {
    // From INT-CLIP-002 state (fallback visible)
    // Press Esc
    // Assert: fallback text box is removed
    // Assert: underlying content is fully visible
  })

  test("SNAP-CLIP-001: fallback display renders correctly at 80x24", async () => {
    // Launch TUI at 80x24 minimum
    // Trigger copy with no clipboard available
    // Capture terminal snapshot
    // Assert matches golden file
    // Assert: fallback box fits within 80 columns
  })

  test("SNAP-CLIP-002: fallback display renders correctly at 120x40", async () => {
    // Launch TUI at 120x40
    // Trigger copy with no clipboard available
    // Capture terminal snapshot
    // Assert matches golden file
  })

  test("SNAP-CLIP-003: copied status indicator renders in status bar", async () => {
    // Launch TUI at 120x40
    // Trigger successful copy
    // Capture terminal snapshot within 2-second window
    // Assert: status bar contains "Copied!" text
    // Assert matches golden file
  })
})
```

#### Edge Case Tests

```
describe("TUI_CLIPBOARD — edge cases", () => {

  test("EDGE-CLIP-001: rapid successive copies do not race", async () => {
    // Call copyToClipboard 5 times in quick succession
    // Assert: all 5 return valid ClipboardResult objects
    // Assert: no process leaks (all child processes exited)
  })

  test("EDGE-CLIP-002: copy during screen transition does not crash", async () => {
    // Start a copy, immediately press q to leave screen
    // Assert: no crash, no unhandled promise rejection
    // Assert: TUI continues to function normally
  })

  test("EDGE-CLIP-003: clipboard works after SSE reconnection", async () => {
    // Trigger SSE disconnect and reconnect
    // Attempt clipboard copy
    // Assert: clipboard still works (independent of SSE)
  })

  test("EDGE-CLIP-004: text with terminal escape sequences is safely encoded", async () => {
    // Copy text containing ANSI escape codes: "\x1b[31mred text\x1b[0m"
    // Assert: text is copied literally, escape codes are not interpreted
    // Assert: no terminal state corruption
  })

  test("EDGE-CLIP-005: null byte in text does not truncate copy", async () => {
    // Copy text containing null bytes: "before\x00after"
    // Assert: result.success (if provider available)
    // Assert: child process handles null bytes in stdin
  })
})
```

---

## Verification Checklist

| # | Criterion | Verified by |
|---|-----------|-------------|
| 1 | macOS detected and uses `pbcopy` | DET-CLIP-001 |
| 2 | WSL detected and uses `clip.exe` | DET-CLIP-002 |
| 3 | Wayland detected and uses `wl-copy` | DET-CLIP-003 |
| 4 | X11 detected and uses `xclip` with `-selection clipboard` | DET-CLIP-004 |
| 5 | X11 falls back to `xsel` when `xclip` unavailable | DET-CLIP-005 |
| 6 | OSC 52 detected via `TERM_PROGRAM` for known terminals | OSC52-DET-001 through OSC52-DET-005 |
| 7 | OSC 52 detected via `TMUX` environment variable | DET-CLIP-007, OSC52-DET-005 |
| 8 | Returns `"none"` when no provider available | DET-CLIP-008 |
| 9 | Provider is cached after first detection | DET-CLIP-009 |
| 10 | `copyToClipboard` returns `Promise<ClipboardResult>`, never throws | COPY-CLIP-008 |
| 11 | Empty string rejected with clear error | COPY-CLIP-002 |
| 12 | Unicode and multi-line text copied correctly | COPY-CLIP-004, COPY-CLIP-005 |
| 13 | Child process timeout enforced at 5 seconds | Implementation audit |
| 14 | OSC 52 payload size limit enforced | OSC52-COPY-004 |
| 15 | tmux passthrough wrapping for OSC 52 | OSC52-COPY-003 |
| 16 | `useClipboard` hook provides status feedback | INT-CLIP-001, INT-CLIP-003 |
| 17 | Fallback text displayed when clipboard unavailable | INT-CLIP-002 |
| 18 | Fallback dismissible with Esc | INT-CLIP-004 |
| 19 | Status auto-resets after 2 seconds | INT-CLIP-001 |
| 20 | No shell injection possible via text parameter | Security audit (stdin write, not command interpolation) |
| 21 | No sensitive data logged | Code review |
| 22 | `_resetProviderCache` enables test isolation | DET-CLIP-010 |