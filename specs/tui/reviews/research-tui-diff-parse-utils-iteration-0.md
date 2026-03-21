Not LGTM.

P0: OpenTUI API coverage is incomplete and non-auditable. The research references DiffRenderable internals but does not map the public `<diff>` contract this utility must interoperate with: `context/opentui/packages/react/jsx-namespace.d.ts:39-45` (`diff` intrinsic), `context/opentui/packages/react/src/types/components.ts:153` (`DiffProps`), and `context/opentui/packages/core/src/renderables/Diff.ts:21-52` (`DiffRenderableOptions`, including `diff`, `view`, `syncScroll`, `showLineNumbers`).

P0: `@codeplane/ui-core` hook touchpoints are not identified. Even for pure parsing utilities, research must state the upstream producers of `FileDiffItem.patch` (`useChangeDiff` / `useLandingDiff`) or explicitly justify “no direct hook usage in this ticket.” Required context exists in `specs/tui/TUI_DIFF_SCREEN.md:42-44` and `specs/tui/TUI_DIFF_UNIFIED_VIEW.md:21-23,200-204`.

P1: Existing TUI pattern exploration is shallow. It cites only `apps/tui/src/lib/diff-syntax.ts` and skips adjacent implementation/testing patterns relevant to integration: `apps/tui/src/hooks/useDiffSyntaxStyle.ts:1-52` and `e2e/tui/diff.test.ts:1-216`.

P1: The research document provides no file:line citations at all, so claims are not verifiable.

P1: Edge-case analysis is under-specified for this ticket. Missing or insufficiently grounded: `parsePatch()` array semantics / first-patch assumption (`Diff.ts:157-166`), split filler type mismatch risk (`empty` in OpenTUI at `Diff.ts:18,649-672` vs proposed `filler`), and explicit handling expectations for binary markers / malformed hunks / CRLF behavior.