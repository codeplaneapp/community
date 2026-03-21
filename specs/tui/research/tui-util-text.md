# TUI Text Utility Research Plan

## Objective
Investigate the existing codebase to implement or refactor text utilities for the Codeplane TUI. The focus is on identifying existing string truncation methods, stack depth constraints, and terminal dimension constants to ensure alignment with the TUI design specifications and OpenTUI constraints.

## Targets for Investigation
1. **Existing Utilities:**
   - `apps/tui/src/util/index.ts`: Read contents to understand currently available utilities and identify gaps.
2. **Component References:**
   - `apps/tui/src/screens/Agents/components/ToolBlock.tsx`
   - `apps/tui/src/screens/Agents/utils/generateSummary.ts`
3. **Types & Constants:**
   - `apps/tui/src/router/types.ts`
   - `apps/tui/src/types/breakpoint.ts`
4. **Test Scaffolding:**
   - Check `e2e/tui/` for existing test coverage (e.g., to see if `util-text.test.ts` or similar scaffold exists).

## Planned Actions
- **Map Workspace Structure:** Execute a `find` command (`find apps/tui/ e2e/tui/ packages/ui-core/ context/opentui/ -type f | sort`) to get a comprehensive list of relevant files.
- **Review Core Utility:** Call `read_file` on `apps/tui/src/util/index.ts`.
- **Symbol Search:** Execute concurrent `grep_search` calls across the workspace for specific symbols to trace their current usage and implementation:
  - `truncateToolName`
  - `MAX_STACK_DEPTH`
  - `STANDARD_COLS`

This initial research will inform the precise implementation approach for the requested text utility features without duplicating existing logic.