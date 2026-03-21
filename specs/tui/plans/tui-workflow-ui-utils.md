# Implementation Plan: tui-workflow-ui-utils

This implementation plan outlines the creation of shared, pure-function UI utilities for the Workflows screen family in the Codeplane TUI, strictly adhering to the engineering specification. These utilities ensure deterministic mapping of statuses, formatting of durations and relative times, and calculation of semantic color tokens without directly coupling to React or OpenTUI.

## Step 1: Scaffold Workflows Screen Directory and `utils.ts`

**File to create:** `apps/tui/src/screens/Workflows/utils.ts`

1. Import required types `WorkflowRunStatus` and `CoreTokenName`.
2. Define and export the `WorkflowStatusIcon`, `StepStatus`, and `MiniRun` interfaces as defined in the spec.
3. Implement the `getRunStatusIcon` and `getStepStatusIcon` functions. Define the module-level constant lookup tables `RUN_STATUS_ICONS` and `STEP_STATUS_ICONS` using exhaustive definitions.
4. Implement `getRunStatusIconNoColor` and `getStepStatusIconNoColor` to return versions with `color: "muted"` and `bold: false`.
5. Implement `formatDuration` to accept `seconds` and return formatted strings (e.g. `"Xh Ym"`).
6. Implement `getDurationColor` to return urgency-based `CoreTokenName` variants based on thresholds (<60s `success`, <300s `muted`, <900s `warning`, >=900s `error`).
7. Implement `formatRelativeTime` accepting a timestamp and an optional `now` Date parameter for deterministic formatting (`now`, `Xm`, `Xh`, `Xd`, `Xw`, `Xmo`, `Xy`).
8. Implement `getMiniStatusBar` to convert an array of `MiniRun` into exactly 5 `{ char, color }` tuple slots, padding missing runs with muted dots.
9. Implement `formatBytes` utilizing binary units (B, KB, MB, GB, TB).
10. Implement `abbreviateSHA` to return a 7-character truncated string.
11. Implement `formatRunCount` rounding values above 999 with a `K` suffix.

Every function must robustly handle `null`, `undefined`, `NaN`, `Infinity`, empty strings, and unknown enum values gracefully without throwing errors.

## Step 2: Re-export from Screen Index

**File to create:** `apps/tui/src/screens/Workflows/index.ts`

1. Export all types and functions defined in `utils.ts` to allow easy consumption by the upcoming Workflows screen components.

```typescript
export {
  // Types
  type WorkflowStatusIcon,
  type StepStatus,
  type MiniRun,
  // Run status
  getRunStatusIcon,
  getRunStatusIconNoColor,
  // Step status
  getStepStatusIcon,
  getStepStatusIconNoColor,
  // Formatting
  formatDuration,
  getDurationColor,
  formatRelativeTime,
  getMiniStatusBar,
  formatBytes,
  abbreviateSHA,
  formatRunCount,
} from "./utils.js";
```

## Step 3: Implement Exhaustive Unit Tests

**File to create:** `e2e/tui/workflow-utils.test.ts`

1. Import `describe`, `test`, and `expect` from `bun:test`.
2. Import all functions and required types from `../../apps/tui/src/screens/Workflows/utils.js`.
3. Add complete test suites based on the provided engineering specification:
    - **`getRunStatusIcon`**: Test all 6 statuses, confirming distinct outputs, plus fallback for unknown strings.
    - **`getStepStatusIcon`**: Test all valid step statuses, case-insensitivity, and fallback paths.
    - **No-Color Variants**: Validate `getRunStatusIconNoColor` and `getStepStatusIconNoColor` properly enforce `color: "muted"` and `bold: false`.
    - **`formatDuration`**: Cover zero, minute/hour crossovers, fractional flooring, `NaN`, `Infinity`, and negatives.
    - **`getDurationColor`**: Cover all boundaries (59, 60, 299, 300, 899, 900) and negative values.
    - **`formatRelativeTime`**: Supply a mocked `now` date parameter, test varying intervals (from `now` to `y`), future times, and invalid dates.
    - **`getMiniStatusBar`**: Ensure exactly 5 elements returned, verifying padding on short arrays and truncation on arrays > 5 elements.
    - **`formatBytes`**: Test small sizes, decimal logic for large MBs, integer fallback for KBs, and negative values.
    - **`abbreviateSHA`**: Test normal truncation, nulls, and short strings.
    - **`formatRunCount`**: Test K-abbreviation triggers correctly above 999.
4. Run the suite using the standard TUI test script ensuring all ~80 assertions pass unconditionally, as they contain no backend API dependencies.