Not LGTM.
Tests run:
- `bun test e2e/tui/keybinding-normalize.test.ts`: PASS (22/22).
- `bun test e2e/tui/app-shell.test.ts --test-name-pattern "KeybindingProvider — Priority Dispatch"`: FAIL in this workspace (missing `@microsoft/tui-test/lib/terminal/term.js`; plus non-TTY failures), so the new e2e block is not currently executable here.

Findings:
1. [High] Required global keys are stubbed: `?`, `:`, and `g` are registered but handlers are TODO no-ops at /Users/williamcory/codeplane/apps/tui/src/components/GlobalKeybindings.tsx:17, /Users/williamcory/codeplane/apps/tui/src/components/GlobalKeybindings.tsx:18, /Users/williamcory/codeplane/apps/tui/src/components/GlobalKeybindings.tsx:19. This violates the design spec global keybindings.
2. [High] `Esc` behavior regressed: on root screen it does nothing instead of behaving like `q` (quit when no overlay) at /Users/williamcory/codeplane/apps/tui/src/components/GlobalKeybindings.tsx:12 and /Users/williamcory/codeplane/apps/tui/src/components/GlobalKeybindings.tsx:13.
3. [High] Status bar shows `R:retry`, but no `R` binding exists in the new global key map. Hint rendered at /Users/williamcory/codeplane/apps/tui/src/components/StatusBar.tsx:74 and /Users/williamcory/codeplane/apps/tui/src/components/StatusBar.tsx:77; bindings defined at /Users/williamcory/codeplane/apps/tui/src/hooks/useGlobalKeybindings.ts:25 (no `R`). This is user-visible mismatch.
4. [High] Space key normalization is broken: `normalizeKeyDescriptor(" ")` becomes empty string due `.trim()` at /Users/williamcory/codeplane/apps/tui/src/providers/normalize-key.ts:71. Spec requires `Space` for multi-select lists, so this makes canonical space bindings unreliable.
5. [Medium] Descriptor canonicalization is incomplete: modifier order is not normalized (`shift+ctrl+tab` vs `ctrl+shift+tab`) at /Users/williamcory/codeplane/apps/tui/src/providers/normalize-key.ts:72 and /Users/williamcory/codeplane/apps/tui/src/providers/normalize-key.ts:73. Equivalent descriptors can fail to match.
6. [Medium] Screen hint/keybinding adoption is incomplete: StatusBar now fully depends on hint registration (/Users/williamcory/codeplane/apps/tui/src/components/StatusBar.tsx:59), but no screen currently calls `useScreenKeybindings` (only declaration exists at /Users/williamcory/codeplane/apps/tui/src/hooks/useScreenKeybindings.ts:17). This risks empty/incorrect hints across screens.
7. [Medium] `useScreenKeybindings` can hold stale `when` predicates and hint metadata because effects/memo only key off joined key names at /Users/williamcory/codeplane/apps/tui/src/hooks/useScreenKeybindings.ts:38 and /Users/williamcory/codeplane/apps/tui/src/hooks/useScreenKeybindings.ts:54.
8. [Low] `overrideHints` is not stack-safe: nested overrides can clear newer overrides when an older cleanup runs at /Users/williamcory/codeplane/apps/tui/src/providers/KeybindingProvider.tsx:136 and /Users/williamcory/codeplane/apps/tui/src/providers/KeybindingProvider.tsx:139.

OpenTUI/API checks:
- OpenTUI hooks/components usage in modified files is generally valid.
- No direct API calls were introduced in the modified files (no new `fetch`/client bypass of `@codeplane/ui-core`).