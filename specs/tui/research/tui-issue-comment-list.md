# Research Findings: TUI Issue Comment List

## 1. Current State of the Codebase

- **`apps/tui/src/screens/Issues/`**: This directory does not currently exist in the repository. The prerequisite ticket `tui-issue-detail-view` has not been merged into the codebase. As a result, the types, scaffolded components (`CommentBlock`, `TimelineEventRow`), and base utilities (`relative-time.ts`, `truncate.ts`) mentioned in the engineering spec as dependencies must either be created as part of this implementation or assumed to exist by the time this is merged.
- **`packages/ui-core/`**: This package is currently missing from the monorepo structure. An explicit comment in `apps/tui/src/providers/APIClientProvider.tsx` (`// Mock implementation of APIClient since @codeplane/ui-core is missing`) confirms that `@codeplane/ui-core` has not yet been built or exposed. The data hooks like `useIssueComments` and `useIssueEvents` will need to be mocked or we must rely strictly on assumed type definitions and hook signatures.

## 2. Discrepancies and Adaptations

Based on the codebase reality versus the engineering spec:
1. **Breakpoint Naming**: The spec defines a `CommentListLayout` type with `"compact" | "standard" | "expanded"`. The TUI's actual breakpoint strings are `"minimum" | "standard" | "large"`. The implementation should map `layout.breakpoint` correctly:
   - `"minimum"` -> `"compact"`
   - `"standard"` -> `"standard"`
   - `"large"` -> `"expanded"`
2. **Dependency Readiness**: Since `tui-issue-detail-view` is missing, files like `relative-time.ts`, `truncate.ts`, and `interleave-timeline.ts` will need to be fully implemented rather than just "extended" as the spec suggests.
3. **Data Hooks**: As `@codeplane/ui-core` doesn't exist yet, we must construct the hooks (like `useCommentListData`) relying on assumed type definitions (`IssueComment`, `IssueEvent`) and hook signatures as defined in the Codeplane TUI specifications, potentially throwing or mocking their underlying implementations if testing is required.