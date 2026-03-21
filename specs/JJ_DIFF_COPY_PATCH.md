# JJ_DIFF_COPY_PATCH

Specification for JJ_DIFF_COPY_PATCH.

## High-Level User POV

When you're reviewing a jj change diff or a landing request diff in Codeplane, you frequently need to take the raw patch content and use it somewhere else — paste it into a chat message for discussion, apply it to a local branch, attach it to an issue, feed it to a tool, or save it for later reference. The copy patch feature gives you a single, consistent action across every Codeplane surface to copy the raw unified-diff patch content to your clipboard.

In the web UI, every file section in the diff viewer includes a "Copy patch" button in its sticky file header bar. Clicking it copies the raw unified-diff patch for that specific file to your clipboard. A toolbar-level "Copy all patches" button copies the entire change's combined patch — every file concatenated in diff order. Both actions produce a transient confirmation toast ("Copied!") so you know the clipboard write succeeded. The copied content is in standard git diff-format unified diff, suitable for feeding to `git apply`, `patch`, or any tool that consumes unified diffs.

In the TUI, pressing `y` on the diff screen copies the current file's patch to the clipboard via your terminal's clipboard integration (OSC 52). Pressing `Y` copies the full change patch (all files). A status bar flash confirms the action. If your terminal does not support OSC 52, a fallback message tells you to use the CLI piping approach instead.

From the CLI, the existing `codeplane change diff` command already outputs raw patch text suitable for piping and redirection. The copy-patch feature adds a `--copy` flag that explicitly writes the output to the system clipboard instead of stdout, providing a scriptable clipboard path for users who prefer it.

The copied patch always reflects the current view state: if whitespace filtering is active, the copied patch is the whitespace-filtered version. This ensures what you see is what you copy. Binary files are excluded from the copied patch content since they have no textual patch representation.

Copy patch is a small feature with outsized utility. It's the bridge between Codeplane's rich diff viewer and every other tool in a developer's workflow.

## Acceptance Criteria

### Definition of Done

- [ ] A user can copy the raw unified-diff patch for a single file from the Web UI, TUI, and CLI
- [ ] A user can copy the raw unified-diff patch for all files in a change from the Web UI, TUI, and CLI
- [ ] The copied content is in standard `git diff`-format (starts with `diff --git a/... b/...` header) and is directly consumable by `git apply` and `patch -p1`
- [ ] When whitespace filtering is active, the copied patch reflects the filtered diff (whitespace-only changes excluded)
- [ ] Binary files are excluded from copied patch content; copying a single binary file produces an empty clipboard write with a descriptive message
- [ ] A transient confirmation indicator appears after a successful copy action on all visual surfaces (Web UI toast, TUI status bar flash)
- [ ] The feature is gated behind the `JJ_DIFF_COPY_PATCH` feature flag
- [ ] All existing diff tests continue to pass without being skipped or commented out

### Input Validation & Boundary Constraints

- [ ] Patch content for a single file can be up to the server's max response size (configurable, default 50 MB); the clipboard write must handle this without truncation or error up to the system clipboard's limit
- [ ] If the system clipboard write fails (permissions denied, clipboard unavailable, content too large), a descriptive error message is shown to the user — the action must never fail silently
- [ ] Patch content that contains null bytes (binary artifacts that slipped through detection) must be rejected with a "Cannot copy binary content" message rather than corrupting the clipboard
- [ ] The copied patch preserves original encoding: UTF-8 file content, line endings as present in the diff
- [ ] Empty patches (e.g., a change with 0 file modifications, or all files are binary) result in an empty clipboard write accompanied by a "Nothing to copy" message
- [ ] The `--copy` CLI flag is mutually exclusive with stdout piping — if both are used, `--copy` takes precedence and stdout receives nothing
- [ ] File header lines (`diff --git a/path b/path`) are always included in the copied content, even for single-file copies, to ensure the patch is self-contained and applicable
- [ ] Maximum patch size for clipboard write is 10 MB; patches larger than 10 MB display a warning: "Patch too large for clipboard ({size}). Use `codeplane change diff | pbcopy` instead."
- [ ] The CLI `--copy` flag name must not conflict with existing flags

### Edge Cases

- [ ] Copying the patch for a change with 0 file modifications shows "Nothing to copy — this change has no file modifications"
- [ ] Copying the patch for a single binary file shows "Cannot copy patch — binary file has no textual diff"
- [ ] Copying the full patch for a change where all files are binary shows "Nothing to copy — all changed files are binary"
- [ ] Copying the full patch for a change with mixed binary and text files copies only the text file patches; a status message notes "{N} binary files excluded"
- [ ] Copying when whitespace filtering removes all visible changes shows "Nothing to copy — no visible changes with whitespace hidden"
- [ ] A renamed file's patch includes the `rename from`/`rename to` headers in the copied content
- [ ] A copied file's patch includes the `copy from`/`copy to` headers in the copied content
- [ ] Copying a patch for a file whose content contains literal `diff --git` text produces a valid, applicable patch
- [ ] Unicode file paths and content are preserved exactly in the copied patch
- [ ] Rapid repeated copy actions (double-click, key mash) debounce to a single clipboard write with a single confirmation
- [ ] Copying the patch for a change with 500+ files produces a valid concatenated patch
- [ ] The copy action works identically for change diffs and landing request diffs
- [ ] The copy action works on diffs in both unified and split view modes — the copied content is always unified-diff format regardless of the current view mode

## Design

### Web UI Design

**Per-file copy button:**

Each file section's sticky header bar includes a copy button:

```
┌────────────────────────────────────────────────────────────────────────────┐
│  src/index.ts  │  M  │  +14 −7  │                         📋 Copy patch  │
└────────────────────────────────────────────────────────────────────────────┘
```

- The button is positioned at the right edge of the file header bar
- Icon: clipboard icon (📋) with "Copy patch" label
- On hover: tooltip "Copy this file's patch to clipboard"
- On click: copies the raw `patch` string from the `FileDiffItem` for this file, prefixed with the `diff --git` header line
- On success: button temporarily changes to "Copied ✓" with a green check for 2 seconds, then reverts
- On failure: button temporarily changes to "Failed ✗" with a red indicator for 3 seconds, then reverts; browser console logs the error
- For binary files: button is disabled with tooltip "Binary file — no patch to copy"

**Toolbar-level copy button:**

The diff toolbar includes a "Copy all" patch button:

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Unified ▾  │  ☐ Hide whitespace  │  Expand all  │  📋 Copy all patches  │
└────────────────────────────────────────────────────────────────────────────┘
```

- Label: "Copy all patches"
- On hover: tooltip "Copy patches for all files to clipboard"
- On click: concatenates the `diff --git` header + `patch` for every non-binary `FileDiffItem` and copies the result to the clipboard
- Files are concatenated in display order (the order returned by the API) with a single newline separator between files
- On success: "Copied ✓" for 2 seconds
- On failure: "Failed ✗" for 3 seconds
- If all files are binary: button is disabled with tooltip "All files are binary — no patches to copy"
- If no file changes: button is disabled with tooltip "No changes to copy"

**Clipboard API usage:**

- Uses `navigator.clipboard.writeText()` for secure, async clipboard access
- Falls back to `document.execCommand('copy')` with a temporary textarea for older browsers
- If neither method is available (e.g., non-secure context without HTTPS), displays inline message: "Clipboard unavailable — copy manually from the terminal"

**Keyboard shortcut (Web):**

- No global keyboard shortcut in the web UI. The copy action is button-driven.
- The per-file copy button is focusable and activatable via Enter/Space when focused via Tab navigation

### TUI UI Design

**Keyboard shortcuts:**

| Key | Action | Context |
|-----|--------|---------|
| `y` | Copy current file's patch to clipboard | Diff content focused, current file is not binary |
| `Y` | Copy all files' patches to clipboard | Diff content focused, at least one non-binary file |

**Clipboard mechanism:**

- Primary: OSC 52 escape sequence via `Clipboard.copyToClipboardOSC52(text, "clipboard")`
- The TUI checks `isOsc52Supported()` before attempting the write
- If OSC 52 is not supported, the status bar shows: "Clipboard unavailable — use `codeplane change diff | pbcopy`"

**Status bar feedback:**

- On success: status bar flashes "Copied patch to clipboard" in green for 2 seconds
- On success with excluded binary files: "Copied patch ({N} binary files excluded)" in green for 2 seconds
- On empty: "Nothing to copy" in yellow for 2 seconds
- On binary file: "Cannot copy — binary file" in yellow for 2 seconds
- On clipboard unavailable: "Clipboard unavailable — pipe with CLI" in red for 3 seconds
- On patch too large: "Patch too large ({size}) — use CLI piping" in red for 3 seconds

**Help overlay (`?`):**

Add the following entries to the existing keyboard help overlay:

```
y    Copy current file patch
Y    Copy all patches
```

### CLI Command

**Existing command:** `codeplane change diff [id]`

**New flag:** `--copy` / `-c`

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--copy` / `-c` | boolean | false | Copy the diff output to the system clipboard instead of printing to stdout |

**Behavior:**

- `codeplane change diff --copy`: copies the working copy diff to the system clipboard
- `codeplane change diff <id> --copy`: copies the specified change's diff to the system clipboard
- `codeplane change diff <id> --copy --ignore-whitespace`: copies the whitespace-filtered diff to clipboard
- On success: prints "Copied {N} bytes to clipboard" to stderr (not stdout)
- On failure: prints "Failed to copy to clipboard: {reason}" to stderr and exits with code 1
- `--copy` is incompatible with piping: if stdout is a TTY, `--copy` works. If stdout is piped, `--copy` is ignored and the diff goes to stdout as normal (with a stderr warning: "Ignoring --copy: stdout is piped")
- `--copy` with `--json` copies the JSON representation to the clipboard

**Clipboard mechanism (CLI):**

- macOS: `pbcopy` via `Bun.spawn()`
- Linux: `xclip -selection clipboard` or `xsel --clipboard --input` or `wl-copy` (tried in order)
- Windows: `clip.exe` via `Bun.spawn()`
- If no clipboard utility is found: error "No clipboard utility found. Install xclip, xsel, or wl-copy."

### SDK Shape

Add shared utility functions to `packages/ui-core`:

```typescript
/**
 * Assembles a copyable patch string from diff data.
 * Concatenates diff --git headers and patch content for non-binary files.
 */
function assemblePatch(fileDiffs: FileDiffItem[]): string

/**
 * Assembles a copyable patch string for a single file.
 * Returns the diff --git header + patch content.
 * Returns null for binary files.
 */
function assembleSingleFilePatch(fileDiff: FileDiffItem): string | null

/**
 * Copies text to clipboard using the best available mechanism.
 * Web: navigator.clipboard.writeText() with execCommand fallback.
 * TUI: OSC 52.
 * CLI: platform clipboard utility.
 * Returns { success: boolean; error?: string }
 */
async function copyToClipboard(text: string): Promise<{ success: boolean; error?: string }>
```

These are shared utilities consumed by Web UI, TUI, and CLI to avoid duplicating patch assembly and clipboard logic.

### Documentation

1. **Web UI Diff Viewer Guide** — Add a "Copying patches" subsection to the existing diff viewer guide. Explain the per-file copy button and the toolbar-level "Copy all patches" button. Include a screenshot showing the button location and the "Copied ✓" confirmation state.

2. **TUI Diff Viewer Guide** — Add `y` and `Y` to the keyboard reference card. Explain OSC 52 clipboard integration and the fallback message for unsupported terminals. List terminal emulators known to support OSC 52 (iTerm2, kitty, WezTerm, Alacritty, Windows Terminal, foot).

3. **CLI `change diff` Reference** — Document the `--copy` / `-c` flag, its behavior, platform clipboard utilities, and the interaction with piped output.

4. **FAQ/Troubleshooting** — Add entries for "Clipboard unavailable in TUI" (explain OSC 52 and how to enable it) and "Clipboard not working in CLI" (explain required clipboard utilities per platform).

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Read-only | Member (Write) | Admin | Owner |
|--------|-----------|-----------|----------------|-------|-------|
| Copy patch from public repo diff | ✅ | ✅ | ✅ | ✅ | ✅ |
| Copy patch from private repo diff | ❌ | ✅ | ✅ | ✅ | ✅ |

Copy patch is a client-side operation on already-fetched diff data. No additional API call is made. The security boundary is the same as the diff view itself: if you can see the diff, you can copy it. No elevated permissions are required.

### Rate Limiting

No additional rate limiting is needed. The copy action operates on data already fetched by the diff endpoint, which has its own rate limits (300 req/min authenticated, 60 req/min anonymous). The copy action does not trigger any server requests.

The CLI `--copy` flag may trigger a diff fetch if one hasn't been cached, but this is the same fetch path as `codeplane change diff` without `--copy` — same rate limits apply.

### Data Privacy

- Copied patch content may contain source code, which may include secrets, PII, or proprietary logic. This is inherent to the diff data itself and is not a new exposure vector — the user already has visual access to this content.
- The clipboard is a system-level resource outside Codeplane's control. Codeplane does not log, track, or retain clipboard contents after the write.
- No clipboard content is sent to any Codeplane server or telemetry endpoint.
- The OSC 52 escape sequence sends clipboard content through the terminal connection. If the user is connected via SSH to a remote TUI session, clipboard content traverses the SSH tunnel. This is standard OSC 52 behavior and is encrypted by the SSH transport layer.

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `diff.patch_copied` | User successfully copies a patch to clipboard | `client` (web/tui/cli), `repo`, `change_id`, `landing_number` (if applicable), `scope` (single_file/all_files), `file_count` (number of non-binary files included), `total_lines` (total lines in copied patch), `patch_bytes` (size of copied content), `whitespace_filtered` (bool), `binary_files_excluded` (count), `view_mode` (unified/split — what view was active when copy happened) |
| `diff.patch_copy_failed` | Clipboard write failed | `client`, `repo`, `change_id`, `scope`, `error_type` (clipboard_unavailable/too_large/permission_denied/binary_only/empty_diff), `patch_bytes` (attempted size) |
| `diff.patch_copy_empty` | User attempted copy but nothing to copy | `client`, `repo`, `change_id`, `scope`, `reason` (no_files/all_binary/whitespace_filtered_empty) |

### Common Properties (all events)

- `session_id`, `timestamp`, `user_id` (if authenticated), `client_version`

### Funnel Metrics

| Metric | Target | Rationale |
|--------|--------|-----------|
| Patch copy rate | >5% of diff views result in at least one copy | Feature is discoverable and useful |
| Single-file vs all-files copy ratio | Monitor (no target) | Understand usage pattern — are users copying specific files or entire changes? |
| Copy success rate | >95% | Clipboard integration is reliable across environments |
| Patch-copy-to-apply conversion | Monitor via workflow/CI events | Do users who copy patches subsequently apply them? (Indirect metric) |
| Repeat copy rate per session | Monitor | Users copying the same patch multiple times may indicate UX confusion |

### Success Indicators

- Patch copy success rate ≥ 95% across all clients
- Feature adoption (at least one copy event) reaches >5% of diff-viewing users within 30 days of launch
- Zero incidents of clipboard content leaking to server-side logs or telemetry payloads
- Error rate for clipboard failures < 5% (indicates good platform coverage)

## Observability

### Logging Requirements

| Level | Event | Structured Context |
|-------|-------|--------------------|  
| `debug` | Patch copy initiated | `client`, `repo`, `change_id`, `scope`, `file_count`, `patch_bytes` |
| `debug` | Patch assembled | `file_count`, `total_lines`, `binary_excluded`, `duration_ms` |
| `info` | Patch copied successfully | `client`, `repo`, `scope`, `patch_bytes`, `file_count` |
| `warn` | Clipboard unavailable | `client`, `clipboard_method` (osc52/navigator/pbcopy/xclip), `error_message` |
| `warn` | Patch too large for clipboard | `client`, `patch_bytes`, `max_bytes` |
| `warn` | Copy action on empty/binary-only diff | `client`, `repo`, `change_id`, `reason` |
| `error` | Clipboard write failed unexpectedly | `client`, `clipboard_method`, `error_message`, `patch_bytes` |

Log destination: stderr (TUI/CLI), browser console (Web UI). Level controlled via `CODEPLANE_LOG_LEVEL` (default: `warn`).

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_diff_patch_copies_total` | Counter | `client`, `scope`, `status` (success/failed/empty) | Total patch copy actions |
| `codeplane_diff_patch_copy_bytes` | Histogram | `client`, `scope` | Size of copied patch content in bytes (buckets: 100, 1000, 10000, 100000, 1000000, 10000000) |
| `codeplane_diff_patch_copy_files` | Histogram | `client`, `scope` | Number of files included in copy (buckets: 1, 5, 10, 25, 50, 100, 250, 500) |
| `codeplane_diff_patch_copy_duration_ms` | Histogram | `client` | Time to assemble and write patch to clipboard (buckets: 1, 5, 10, 50, 100, 500, 1000) |
| `codeplane_diff_clipboard_errors_total` | Counter | `client`, `error_type` | Clipboard-specific errors |

### Alerts

**Alert: PatchCopyHighFailureRate**
- **Condition:** `rate(codeplane_diff_patch_copies_total{status="failed"}[15m]) / rate(codeplane_diff_patch_copies_total[15m]) > 0.10`
- **Severity:** Warning
- **Runbook:**
  1. Check `codeplane_diff_clipboard_errors_total` labels to identify the dominant failure mode
  2. If `clipboard_unavailable` is dominant in TUI: likely a terminal emulator compatibility issue. Check which terminal types are in use via client telemetry. OSC 52 support varies — document workarounds for affected terminals.
  3. If `clipboard_unavailable` is dominant in Web: check if the deployment is served over HTTPS. `navigator.clipboard.writeText()` requires a secure context. Check browser console logs for `SecurityError`.
  4. If `too_large` is dominant: review `codeplane_diff_patch_copy_bytes` distribution to see if the 10 MB limit is too aggressive. Consider raising the limit or improving the error message.
  5. If `permission_denied` is dominant in CLI: check if clipboard utilities (pbcopy, xclip, xsel, wl-copy) are installed on the deployment targets. This is a setup issue, not a bug.

**Alert: PatchCopyLatencyHigh**
- **Condition:** `histogram_quantile(0.95, rate(codeplane_diff_patch_copy_duration_ms_bucket[5m])) > 500`
- **Severity:** Info
- **Runbook:**
  1. Check `codeplane_diff_patch_copy_bytes` — large patches (>1 MB) are expected to take longer to assemble and write.
  2. If patch assembly is slow: profile the `assemblePatch` function for string concatenation performance on very large diffs. Consider using a streaming approach or pre-allocated buffer.
  3. If clipboard write is slow: this is typically a platform issue. On Linux, `xclip` can be slow with large payloads. Document `wl-copy` as the preferred clipboard utility for Wayland users.

### Error Cases and Failure Modes

| Failure Mode | Detection | Impact | Mitigation |
|-------------|-----------|--------|------------|
| `navigator.clipboard.writeText()` rejected (non-HTTPS) | SecurityError exception | Web users cannot copy | Display inline message directing to CLI; log at warn level |
| OSC 52 not supported by terminal | `isOsc52Supported()` returns false | TUI users cannot copy | Status bar message with CLI fallback instructions |
| No clipboard utility on Linux | All clipboard commands fail with exit code 127 | CLI `--copy` fails | Error message listing installable utilities |
| Clipboard utility crashes (xclip segfault) | Non-zero exit code from clipboard subprocess | CLI `--copy` fails | Error message with specific utility name; suggest alternative |
| Patch exceeds 10 MB | Size check before clipboard write | Copy blocked | Warning message with CLI piping alternative |
| Patch contains null bytes | Null byte detection before clipboard write | Copy blocked | "Cannot copy binary content" message |
| Concurrent clipboard access | Write succeeds but overwrites other content | User's previous clipboard lost | Standard system behavior; no mitigation needed |
| OSC 52 write to remote terminal (SSH) | Cannot detect failure | Clipboard may not arrive | Standard OSC 52 limitation; no mitigation needed |
| Browser clipboard permissions revoked | PermissionError exception | Web copy fails | Fallback to `document.execCommand('copy')` |
| Very large patch causes browser tab freeze | Assembly takes >100ms for >1 MB patches | UI jank during copy | Use `requestIdleCallback` or `setTimeout` chunking for patches > 500 KB |

## Verification

### Test File Locations

- `e2e/web/diff-copy-patch.test.ts` — Playwright web UI tests
- `e2e/tui/diff-copy-patch.test.ts` — TUI e2e tests
- `e2e/cli/change-diff-copy.test.ts` — CLI command tests
- `e2e/api/diff.test.ts` — API-level tests (patch format validation)

### Web UI Playwright Tests (22 tests)

| Test ID | Description |
|---------|-------------|
| `PW-COPY-001` | Per-file "Copy patch" button is visible in the file header for a text file |
| `PW-COPY-002` | Per-file "Copy patch" button is disabled for a binary file with correct tooltip |
| `PW-COPY-003` | Clicking per-file "Copy patch" copies the file's patch content to clipboard; verify clipboard contains `diff --git` header |
| `PW-COPY-004` | Copied single-file patch is valid unified diff parseable by a diff parser |
| `PW-COPY-005` | Copied single-file patch includes the `diff --git a/path b/path` header line |
| `PW-COPY-006` | After clicking per-file copy, button text changes to "Copied ✓" for 2 seconds, then reverts to "Copy patch" |
| `PW-COPY-007` | Toolbar "Copy all patches" button is visible |
| `PW-COPY-008` | Clicking "Copy all patches" copies concatenated patches for all non-binary files to clipboard |
| `PW-COPY-009` | "Copy all patches" excludes binary files from the copied content |
| `PW-COPY-010` | Copied all-files patch is valid unified diff parseable by a diff parser |
| `PW-COPY-011` | "Copy all patches" with whitespace filtering active copies the filtered diff |
| `PW-COPY-012` | "Copy all patches" button is disabled when all files are binary |
| `PW-COPY-013` | "Copy all patches" button is disabled when diff has 0 files |
| `PW-COPY-014` | Copying a renamed file's patch includes `rename from`/`rename to` metadata |
| `PW-COPY-015` | Copying a copied file's patch includes `copy from`/`copy to` metadata |
| `PW-COPY-016` | Per-file copy for a file with Unicode content preserves the content exactly |
| `PW-COPY-017` | Per-file copy for a change with file containing literal `diff --git` text produces valid output |
| `PW-COPY-018` | Double-clicking per-file "Copy patch" rapidly results in exactly one clipboard write (debounce) |
| `PW-COPY-019` | "Copy all patches" for a 100+ file diff produces a valid concatenated patch |
| `PW-COPY-020` | Copying works in both unified and split view modes; the copied content is identical in both |
| `PW-COPY-021` | Landing request diff copy works identically to change diff copy |
| `PW-COPY-022` | Per-file copy button is accessible via keyboard Tab navigation and activatable with Enter |

### TUI E2E Tests (24 tests)

| Test ID | Description |
|---------|-------------|
| `TUI-COPY-001` | `y` on a text file copies the file's patch to clipboard; status bar shows "Copied patch to clipboard" |
| `TUI-COPY-002` | `y` on a binary file shows "Cannot copy — binary file" in status bar; clipboard unchanged |
| `TUI-COPY-003` | `Y` copies all non-binary files' patches to clipboard; status bar confirms with file count |
| `TUI-COPY-004` | `Y` with mixed binary/text files excludes binary files; status bar shows "{N} binary files excluded" |
| `TUI-COPY-005` | `Y` when all files are binary shows "Nothing to copy — all changed files are binary" |
| `TUI-COPY-006` | `Y` on empty diff (0 files) shows "Nothing to copy" |
| `TUI-COPY-007` | `y` copies the current file's patch regardless of which file is focused (responds to sidebar selection) |
| `TUI-COPY-008` | Navigating files with `]` then pressing `y` copies the new current file's patch |
| `TUI-COPY-009` | `y` with whitespace filtering active copies the filtered patch |
| `TUI-COPY-010` | `Y` with whitespace filtering active and all changes whitespace-only shows "Nothing to copy" |
| `TUI-COPY-011` | Copied patch starts with `diff --git` header for single-file copy |
| `TUI-COPY-012` | Copied patch for all files is concatenated in display order with newline separator |
| `TUI-COPY-013` | Status bar flash disappears after 2 seconds for success messages |
| `TUI-COPY-014` | Status bar flash disappears after 3 seconds for error messages |
| `TUI-COPY-015` | `y` and `Y` appear in the help overlay (`?`) |
| `TUI-COPY-016` | Rapid `y` presses debounce to a single clipboard write |
| `TUI-COPY-017` | Copy works in both unified and split view modes |
| `TUI-COPY-018` | Copied patch for a renamed file includes rename metadata |
| `TUI-COPY-019` | Copied patch preserves Unicode file paths and content |
| `TUI-COPY-020` | Patch copy for 100+ file change works without error |
| `TUI-COPY-021` | Landing request diff `y`/`Y` works identically to change diff |
| `TUI-COPY-022` | When OSC 52 is unavailable, `y` shows fallback message instead of silently failing |
| `TUI-COPY-023` | Maximum valid patch (just under 10 MB) copies successfully |
| `TUI-COPY-024` | Patch exceeding 10 MB shows "Patch too large" error message |

### CLI E2E Tests (16 tests)

| Test ID | Description |
|---------|-------------|
| `CLI-COPY-001` | `codeplane change diff --copy` copies working copy diff to system clipboard |
| `CLI-COPY-002` | `codeplane change diff <id> --copy` copies specified change's diff to clipboard |
| `CLI-COPY-003` | `codeplane change diff --copy` prints "Copied {N} bytes to clipboard" to stderr |
| `CLI-COPY-004` | `codeplane change diff --copy` prints nothing to stdout |
| `CLI-COPY-005` | `codeplane change diff -c` works as alias for `--copy` |
| `CLI-COPY-006` | `codeplane change diff --copy --ignore-whitespace` copies whitespace-filtered diff |
| `CLI-COPY-007` | `codeplane change diff --copy` on empty change prints "Nothing to copy" to stderr and exits 0 |
| `CLI-COPY-008` | `codeplane change diff --copy` for binary-only change prints "Nothing to copy — all changed files are binary" to stderr |
| `CLI-COPY-009` | `codeplane change diff --copy --json` copies JSON representation to clipboard |
| `CLI-COPY-010` | `codeplane change diff --copy` when no clipboard utility available exits code 1 with descriptive error |
| `CLI-COPY-011` | `codeplane change diff --copy` with piped stdout ignores --copy and writes to stdout with stderr warning |
| `CLI-COPY-012` | Copied content starts with `diff --git` header and is valid unified diff |
| `CLI-COPY-013` | `codeplane change diff <invalid_id> --copy` exits code 2 with error; clipboard unchanged |
| `CLI-COPY-014` | `codeplane change diff --copy --repo owner/repo` fetches from remote and copies to clipboard |
| `CLI-COPY-015` | Clipboard content from `--copy` matches stdout content from running without `--copy` |
| `CLI-COPY-016` | `codeplane change diff --copy` for a 500+ file change copies complete output |

### SDK / Shared Logic Tests (12 tests)

| Test ID | Description |
|---------|-------------|
| `SDK-COPY-001` | `assemblePatch([])` returns empty string |
| `SDK-COPY-002` | `assemblePatch` with a single modified file returns `diff --git` header + patch content |
| `SDK-COPY-003` | `assemblePatch` with multiple files concatenates in order with newline separator |
| `SDK-COPY-004` | `assemblePatch` excludes binary files (is_binary: true) |
| `SDK-COPY-005` | `assemblePatch` with only binary files returns empty string |
| `SDK-COPY-006` | `assembleSingleFilePatch` returns null for binary file |
| `SDK-COPY-007` | `assembleSingleFilePatch` returns `diff --git` header + patch for text file |
| `SDK-COPY-008` | `assembleSingleFilePatch` for renamed file includes rename headers |
| `SDK-COPY-009` | `assembleSingleFilePatch` for copied file includes copy headers |
| `SDK-COPY-010` | `assemblePatch` handles 500+ files without error |
| `SDK-COPY-011` | `assemblePatch` produces output parseable by a standard unified diff parser |
| `SDK-COPY-012` | `assemblePatch` with file containing literal `diff --git` text in content produces valid output |

All 74 tests must be left failing if the backend is unimplemented — never skipped or commented out.
