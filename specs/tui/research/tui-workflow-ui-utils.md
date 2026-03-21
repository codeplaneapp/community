# Research Findings: `tui-workflow-ui-utils`

## 1. Directory Structure & Missing Files
- I verified that the directory `apps/tui/src/screens/Workflows/` **does not exist** yet. This aligns with the engineering spec's first step to create the scaffold.
- The integration tests file `e2e/tui/workflows.test.ts` **does exist**, which means the tests added in this ticket will solely be unit tests in `e2e/tui/workflow-utils.test.ts` as directed by the spec.

## 2. Existing Type Definitions
### `apps/tui/src/hooks/workflow-types.ts`
I successfully located the `workflow-types.ts` file which defines the necessary API response shapes and types that our utility will consume. The key types discovered are:

```typescript
export type WorkflowRunStatus =
  | "queued"
  | "running"
  | "success"
  | "failure"
  | "cancelled"
  | "error";

export interface WorkflowRunNode {
  id: string;
  step_id: number;
  name: string;
  position: number;
  status: string; // Used by getStepStatusIcon
  iteration: number;
  started_at: string | null;
  completed_at: string | null;
  duration: string;
  duration_seconds: number; // Used by formatDuration
}
```
These perfectly match the specifications required for the `getRunStatusIcon`, `getStepStatusIcon`, and `formatDuration` functions.

### `apps/tui/src/theme/tokens.ts`
I located `theme/tokens.ts` which exports the semantic tokens our utility will rely on.

```typescript
export type CoreTokenName = "primary" | "success" | "warning" | "error" | "muted" | "surface" | "border";
```
This confirms that we can strictly type the returned `color` fields in the `WorkflowStatusIcon` config objects to map correctly to `CoreTokenName`.

## 3. Existing Utility Patterns (`Agents` Screen)
I reviewed the similar existing utilities under `apps/tui/src/screens/Agents/utils/` to ensure the new workflow utils follow the established project patterns.

- **`sessionStatusIcon.ts`**: Maps strings to a `StatusIconConfig` containing `{ icon, fallback, color, bold }`. The new `WorkflowStatusIcon` will follow this structure but introduces an additional `label` field.
- **`formatDuration.ts`**: The Agents version computes duration using `new Date(startedAt)` and `Date.now()` (for active sessions) before formatting it into `{hours}h {minutes}m {seconds}s`. The new Workflows version will take pre-computed `seconds` (derived from `duration_seconds`) preventing dependency on `Date.now()` and remaining purely deterministic as mandated by the spec.

## 4. OpenTUI & Component Usage Integration
The ticket notes that the color tokens (like `success`, `error`) will be interpreted by consuming React components via `useTheme()`. The pure utility must not rely on `RGBA` values or `@opentui/core` components directly, but strictly return string identifiers mapped to `CoreTokenName`. This ensures high reusability and isolated unit-testability.

## Summary
All required domain models, token types, and patterns exist. The next step is simply implementing the new types, functions, and the exhaustive test suite in `e2e/tui/workflow-utils.test.ts` as laid out in the engineering spec.