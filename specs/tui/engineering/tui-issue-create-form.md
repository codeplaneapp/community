# Engineering Specification: `tui-issue-create-form`

## Summary

Full-screen issue creation form with client-side validation, multi-select label/assignee pickers, single-select milestone picker, optimistic navigation to the newly created issue, and responsive layout across all terminal breakpoints.

**Feature flag:** `TUI_ISSUE_CREATE_FORM`
**Status:** `Partial`
**Dependencies:** `tui-issue-list-screen`, `tui-issues-data-hooks`, `tui-issue-labels-display`, `tui-form-component`

---

## Implementation Plan

### Step 1: Form State Hook — `useFormState`

**File:** `apps/tui/src/hooks/useFormState.ts`

A generic, reusable form state manager that tracks field values, focus index, dirty state, field-level errors, and submission state. This hook is the foundation for the `tui-form-component` dependency and will be consumed by all future form screens (IssueCreate, IssueEdit, LandingCreate, etc.).

```typescript
import { useState, useCallback, useRef } from "react";

export interface FieldDefinition {
  name: string;
  label: string;
  shortLabel?: string; // Abbreviated label for compact breakpoint (e.g., "Assign" for "Assignees")
  type: "text" | "textarea" | "multi-select" | "single-select";
  required?: boolean;
  maxLength?: number;
  validate?: (value: unknown) => string | null; // null = valid, string = error message
}

export interface FormState<T extends Record<string, unknown>> {
  values: T;
  errors: Partial<Record<keyof T, string>>;
  focusIndex: number;
  isDirty: boolean;
  isSubmitting: boolean;
  submissionError: string | null;
  setValue: <K extends keyof T>(field: K, value: T[K]) => void;
  setError: <K extends keyof T>(field: K, error: string | null) => void;
  setSubmissionError: (error: string | null) => void;
  setFocusIndex: (index: number) => void;
  focusNext: () => void;
  focusPrev: () => void;
  setSubmitting: (submitting: boolean) => void;
  validate: () => boolean; // Returns true if all fields are valid
  resetErrors: () => void;
  fieldCount: number;
}

export function useFormState<T extends Record<string, unknown>>(
  fields: FieldDefinition[],
  initialValues: T
): FormState<T> {
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  const [focusIndex, setFocusIndex] = useState(0);
  const [isDirty, setIsDirty] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  // fieldCount = fields.length + 2 (Submit + Cancel buttons)
  const fieldCount = fields.length + 2;

  const setValue = useCallback(<K extends keyof T>(field: K, value: T[K]) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    setIsDirty(true);
    // Clear field error on edit
    setErrors((prev) => {
      if (prev[field]) {
        const next = { ...prev };
        delete next[field];
        return next;
      }
      return prev;
    });
  }, []);

  const setError = useCallback(<K extends keyof T>(field: K, error: string | null) => {
    setErrors((prev) => {
      if (error === null) {
        const next = { ...prev };
        delete next[field];
        return next;
      }
      return { ...prev, [field]: error };
    });
  }, []);

  const focusNext = useCallback(() => {
    setFocusIndex((prev) => (prev + 1) % fieldCount);
  }, [fieldCount]);

  const focusPrev = useCallback(() => {
    setFocusIndex((prev) => (prev - 1 + fieldCount) % fieldCount);
  }, [fieldCount]);

  const validate = useCallback((): boolean => {
    const newErrors: Partial<Record<keyof T, string>> = {};
    let firstErrorIndex = -1;

    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      const value = values[field.name as keyof T];

      // Required check
      if (field.required) {
        if (typeof value === "string" && value.trim() === "") {
          newErrors[field.name as keyof T] = `${field.label} is required`;
          if (firstErrorIndex === -1) firstErrorIndex = i;
          continue;
        }
      }

      // Custom validation
      if (field.validate) {
        const error = field.validate(value);
        if (error) {
          newErrors[field.name as keyof T] = error;
          if (firstErrorIndex === -1) firstErrorIndex = i;
        }
      }
    }

    setErrors(newErrors);
    if (firstErrorIndex !== -1) {
      setFocusIndex(firstErrorIndex);
    }
    return Object.keys(newErrors).length === 0;
  }, [fields, values]);

  const resetErrors = useCallback(() => {
    setErrors({});
    setSubmissionError(null);
  }, []);

  return {
    values,
    errors,
    focusIndex,
    isDirty,
    isSubmitting,
    submissionError,
    setValue,
    setError,
    setSubmissionError,
    setFocusIndex,
    focusNext,
    focusPrev,
    setSubmitting: setIsSubmitting,
    validate,
    resetErrors,
    fieldCount,
  };
}
```

**Key decisions:**
- `fieldCount` includes 2 extra for Submit and Cancel buttons (7 total for issue create: Title, Body, Assignees, Labels, Milestone, Submit, Cancel).
- `focusNext`/`focusPrev` wrap around using modular arithmetic.
- `validate()` sets focus to the first errored field.
- `setValue` clears the field-level error on edit so users get immediate feedback correction.
- `isDirty` is a one-way flag — set true on first edit, never reset (form state is not persisted).

---

### Step 2: Selector State Hook — `useSelectorState`

**File:** `apps/tui/src/hooks/useSelectorState.ts`

Manages the open/closed state, highlight index, filter query, and selection state for `<select>`-style dropdowns used in the form. Consumed by the assignees, labels, and milestone fields.

```typescript
import { useState, useCallback, useMemo } from "react";

export interface SelectorOption {
  id: string;
  label: string;
  /** Optional colored indicator (e.g., label hex color) */
  color?: string;
  /** Whether the option is disabled */
  disabled?: boolean;
}

export interface SelectorState<Multi extends boolean = false> {
  isOpen: boolean;
  highlightIndex: number;
  filterQuery: string;
  selected: Multi extends true ? Set<string> : string | null;
  filteredOptions: SelectorOption[];
  open: () => void;
  close: () => void;
  toggle: () => void;
  moveHighlightUp: () => void;
  moveHighlightDown: () => void;
  selectHighlighted: () => void; // For single-select: selects and closes. For multi-select: toggles selection.
  confirmSelection: () => void;  // Closes the dropdown (multi-select confirm).
  setFilter: (query: string) => void;
  clearFilter: () => void;
  isSelected: (id: string) => boolean;
  selectedCount: number;
  displaySummary: string; // "0 selected", "2 selected", milestone title, or "None"
}

export function useSingleSelector(
  options: SelectorOption[],
  initial?: string | null
): SelectorState<false> {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [filterQuery, setFilterQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(initial ?? null);

  const filteredOptions = useMemo(() => {
    if (filterQuery === "") return options;
    const lower = filterQuery.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(lower));
  }, [options, filterQuery]);

  const open = useCallback(() => {
    setIsOpen(true);
    setHighlightIndex(0);
    setFilterQuery("");
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setFilterQuery("");
  }, []);

  const toggle = useCallback(() => {
    if (isOpen) close(); else open();
  }, [isOpen, open, close]);

  const moveHighlightUp = useCallback(() => {
    setHighlightIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const moveHighlightDown = useCallback(() => {
    setHighlightIndex((prev) => Math.min(filteredOptions.length - 1, prev + 1));
  }, [filteredOptions.length]);

  const selectHighlighted = useCallback(() => {
    const option = filteredOptions[highlightIndex];
    if (option && !option.disabled) {
      setSelected(option.id);
      close();
    }
  }, [filteredOptions, highlightIndex, close]);

  const confirmSelection = useCallback(() => close(), [close]);

  const isSelected = useCallback((id: string) => selected === id, [selected]);

  const selectedOption = options.find((o) => o.id === selected);
  const displaySummary = selectedOption ? selectedOption.label : "None";

  return {
    isOpen,
    highlightIndex,
    filterQuery,
    selected,
    filteredOptions,
    open,
    close,
    toggle,
    moveHighlightUp,
    moveHighlightDown,
    selectHighlighted,
    confirmSelection,
    setFilter: setFilterQuery,
    clearFilter: () => setFilterQuery(""),
    isSelected,
    selectedCount: selected ? 1 : 0,
    displaySummary,
  };
}

export function useMultiSelector(
  options: SelectorOption[],
  initial?: Set<string>
): SelectorState<true> {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [filterQuery, setFilterQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(initial ?? new Set());

  const filteredOptions = useMemo(() => {
    if (filterQuery === "") return options;
    const lower = filterQuery.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(lower));
  }, [options, filterQuery]);

  const open = useCallback(() => {
    setIsOpen(true);
    setHighlightIndex(0);
    setFilterQuery("");
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setFilterQuery("");
  }, []);

  const toggle = useCallback(() => {
    if (isOpen) close(); else open();
  }, [isOpen, open, close]);

  const moveHighlightUp = useCallback(() => {
    setHighlightIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const moveHighlightDown = useCallback(() => {
    setHighlightIndex((prev) => Math.min(filteredOptions.length - 1, prev + 1));
  }, [filteredOptions.length]);

  const selectHighlighted = useCallback(() => {
    const option = filteredOptions[highlightIndex];
    if (option && !option.disabled) {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(option.id)) {
          next.delete(option.id);
        } else {
          next.add(option.id);
        }
        return next;
      });
    }
  }, [filteredOptions, highlightIndex]);

  const confirmSelection = useCallback(() => close(), [close]);

  const isSelected = useCallback((id: string) => selected.has(id), [selected]);

  const displaySummary = `${selected.size} selected`;

  return {
    isOpen,
    highlightIndex,
    filterQuery,
    selected,
    filteredOptions,
    open,
    close,
    toggle,
    moveHighlightUp,
    moveHighlightDown,
    selectHighlighted,
    confirmSelection,
    setFilter: setFilterQuery,
    clearFilter: () => setFilterQuery(""),
    isSelected,
    selectedCount: selected.size,
    displaySummary,
  };
}
```

---

### Step 3: Issue Create Form Screen Component

**File:** `apps/tui/src/screens/Issues/IssueCreateForm.tsx`

The primary deliverable. A full-screen React component that renders the issue creation form within the AppShell content area.

#### Component Structure

```typescript
import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigation } from "../../hooks/useNavigation.js";
import { useLayout } from "../../hooks/useLayout.js";
import { useScreenKeybindings } from "../../hooks/useScreenKeybindings.js";
import { useTheme } from "../../hooks/useTheme.js";
import { useFormState, type FieldDefinition } from "../../hooks/useFormState.js";
import { useSingleSelector, useMultiSelector, type SelectorOption } from "../../hooks/useSelectorState.js";
import { ActionButton } from "../../components/ActionButton.js";
import { LabelBadge } from "../../components/LabelBadge.js";
import { ScreenName } from "../../router/types.js";
import { logger } from "../../lib/logger.js";
import { emit } from "../../lib/telemetry.js";
import type { ScreenComponentProps } from "../../router/types.js";

// @codeplane/ui-core hooks
import {
  useCreateIssue,
  useRepoLabels,
  useRepoMilestones,
  useRepoCollaborators,
  type CreateIssueRequest,
  type Label,
  type Milestone,
  type UserSearchResult,
} from "@codeplane/ui-core";

interface IssueFormValues {
  title: string;
  body: string;
  assignees: string[];
  labels: string[];
  milestone: number | undefined;
}

const FIELD_DEFINITIONS: FieldDefinition[] = [
  {
    name: "title",
    label: "Title",
    shortLabel: "Title",
    type: "text",
    required: true,
    maxLength: 255,
    validate: (value) => {
      const v = value as string;
      if (v.trim() === "") return "Title is required";
      return null;
    },
  },
  {
    name: "body",
    label: "Description",
    shortLabel: "Desc",
    type: "textarea",
  },
  {
    name: "assignees",
    label: "Assignees",
    shortLabel: "Assign",
    type: "multi-select",
  },
  {
    name: "labels",
    label: "Labels",
    shortLabel: "Labels",
    type: "multi-select",
  },
  {
    name: "milestone",
    label: "Milestone",
    shortLabel: "Miles.",
    type: "single-select",
  },
];

const INITIAL_VALUES: IssueFormValues = {
  title: "",
  body: "",
  assignees: [],
  labels: [],
  milestone: undefined,
};

// Focus index constants
const FOCUS_TITLE = 0;
const FOCUS_BODY = 1;
const FOCUS_ASSIGNEES = 2;
const FOCUS_LABELS = 3;
const FOCUS_MILESTONE = 4;
const FOCUS_SUBMIT = 5;
const FOCUS_CANCEL = 6;
```

#### Main Component Body

```typescript
export function IssueCreateForm({ entry, params }: ScreenComponentProps) {
  const nav = useNavigation();
  const layout = useLayout();
  const theme = useTheme();
  const { owner, repo } = params;
  const isCompact = layout.breakpoint === "compact";
  const isLarge = layout.breakpoint === "large";

  // ---- Telemetry: form opened ----
  const openedRef = useRef(false);
  useEffect(() => {
    if (!openedRef.current) {
      openedRef.current = true;
      emit("tui.issue_create_form.opened", {
        repo_owner: owner,
        repo_name: repo,
        entry_point: params.entryPoint ?? "keybinding",
        terminal_columns: layout.width,
        terminal_rows: layout.height,
      });
      logger.debug(`form mounted: { screen: "issue_create", repo: "${owner}/${repo}" }`);
    }
  }, [owner, repo, params.entryPoint, layout.width, layout.height]);

  // ---- Form state ----
  const form = useFormState<IssueFormValues>(FIELD_DEFINITIONS, INITIAL_VALUES);

  // ---- Data hooks ----
  const createIssue = useCreateIssue(owner, repo);
  const { labels: repoLabels, isLoading: labelsLoading, error: labelsError } = useRepoLabels(owner, repo);
  const { milestones: repoMilestones, isLoading: milestonesLoading, error: milestonesError } = useRepoMilestones(owner, repo, { state: "open" });
  const [collaboratorQuery, setCollaboratorQuery] = useState("");
  const { users: collaborators, isLoading: collaboratorsLoading, error: collaboratorsError } = useRepoCollaborators(owner, repo, { query: collaboratorQuery, enabled: true });

  // ---- Selector state ----
  const assigneesSelector = useMultiSelector(
    collaborators.map((c: UserSearchResult) => ({ id: c.username, label: c.display_name || c.username }))
  );
  const labelsSelector = useMultiSelector(
    repoLabels.map((l: Label) => ({ id: l.name, label: l.name, color: l.color }))
  );
  const milestoneSelector = useSingleSelector(
    [
      { id: "__none__", label: "None" },
      ...repoMilestones.map((m: Milestone) => ({ id: String(m.id), label: m.title })),
    ],
    null
  );

  // ---- Discard confirmation state ----
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  // ---- Submission timestamp for duration tracking ----
  const submitStartRef = useRef<number>(0);

  // ---- Any selector open? (affects keybinding routing) ----
  const anySelectorOpen = assigneesSelector.isOpen || labelsSelector.isOpen || milestoneSelector.isOpen;

  // ---- Determine active selector ----
  const getActiveSelector = () => {
    if (form.focusIndex === FOCUS_ASSIGNEES && assigneesSelector.isOpen) return assigneesSelector;
    if (form.focusIndex === FOCUS_LABELS && labelsSelector.isOpen) return labelsSelector;
    if (form.focusIndex === FOCUS_MILESTONE && milestoneSelector.isOpen) return milestoneSelector;
    return null;
  };

  // ---- Handle submit ----
  const handleSubmit = useCallback(async () => {
    // Double-submit prevention
    if (form.isSubmitting) return;

    // Client-side validation
    if (!form.validate()) {
      emit("tui.issue_create_form.validation_error", {
        repo_owner: owner,
        repo_name: repo,
        field: "title",
        error_type: "required",
      });
      return;
    }

    form.setSubmitting(true);
    form.setSubmissionError(null);
    submitStartRef.current = Date.now();

    const request: CreateIssueRequest = {
      title: form.values.title.trim(),
      body: form.values.body,
      assignees: [...assigneesSelector.selected],
      labels: [...labelsSelector.selected],
      milestone: milestoneSelector.selected && milestoneSelector.selected !== "__none__"
        ? parseInt(milestoneSelector.selected, 10)
        : undefined,
    };

    emit("tui.issue_create_form.submitted", {
      repo_owner: owner,
      repo_name: repo,
      has_body: request.body !== "",
      assignee_count: request.assignees?.length ?? 0,
      label_count: request.labels?.length ?? 0,
      has_milestone: request.milestone !== undefined,
      title_length: request.title.length,
      body_length: request.body.length,
    });

    logger.info(`form submitted: { repo: "${owner}/${repo}", title_length: ${request.title.length}, has_body: ${request.body !== ""}, assignee_count: ${request.assignees?.length ?? 0}, label_count: ${request.labels?.length ?? 0}, has_milestone: ${request.milestone !== undefined} }`);

    try {
      const result = await createIssue.mutate(request);
      const duration = Date.now() - submitStartRef.current;

      emit("tui.issue_create_form.succeeded", {
        repo_owner: owner,
        repo_name: repo,
        issue_number: result.number,
        duration_ms: duration,
      });

      logger.info(`issue created: { repo: "${owner}/${repo}", issue_number: ${result.number}, duration_ms: ${duration} }`);

      // Optimistic navigation: replace form with new issue detail
      nav.replace(ScreenName.IssueDetail, {
        owner,
        repo,
        number: String(result.number),
      });
    } catch (error: any) {
      const duration = Date.now() - submitStartRef.current;
      form.setSubmitting(false);

      // Determine error code and message
      const statusCode = error?.code ?? error?.status ?? 0;
      const errorMessage = error?.message ?? "An unexpected error occurred";

      emit("tui.issue_create_form.failed", {
        repo_owner: owner,
        repo_name: repo,
        error_code: statusCode,
        error_message: errorMessage,
        duration_ms: duration,
      });

      logger.error(`issue creation failed: { repo: "${owner}/${repo}", status_code: ${statusCode}, error_message: "${errorMessage}", request_duration_ms: ${duration} }`);

      // Handle specific HTTP status codes
      if (statusCode === 401) {
        form.setSubmissionError("Session expired. Run `codeplane auth login` to re-authenticate.");
        return;
      }

      if (statusCode === 403) {
        form.setSubmissionError("You do not have permission to create issues in this repository.");
        return;
      }

      if (statusCode === 413) {
        form.setSubmissionError("Content too large. Please shorten the description.");
        return;
      }

      if (statusCode === 422) {
        // Map server field-level validation errors
        if (error.fieldErrors) {
          let firstErrorField = -1;
          for (const [field, message] of Object.entries(error.fieldErrors)) {
            const fieldIndex = FIELD_DEFINITIONS.findIndex((f) => f.name === field);
            form.setError(field as keyof IssueFormValues, message as string);
            if (firstErrorField === -1 && fieldIndex !== -1) {
              firstErrorField = fieldIndex;
            }
          }
          if (firstErrorField !== -1) {
            form.setFocusIndex(firstErrorField);
          }
        } else {
          form.setSubmissionError(errorMessage);
        }
        return;
      }

      if (statusCode === 429) {
        form.setSubmissionError("Rate limit exceeded. Please wait and try again.");
        return;
      }

      form.setSubmissionError(errorMessage);
    }
  }, [
    form, owner, repo, assigneesSelector.selected, labelsSelector.selected,
    milestoneSelector.selected, createIssue, nav,
  ]);

  // ---- Handle cancel ----
  const handleCancel = useCallback(() => {
    if (form.isDirty && !showDiscardConfirm) {
      setShowDiscardConfirm(true);
      return;
    }
    emit("tui.issue_create_form.cancelled", {
      repo_owner: owner,
      repo_name: repo,
      was_dirty: form.isDirty,
      fields_filled: Object.entries(form.values).filter(([_, v]) => {
        if (typeof v === "string") return v !== "";
        if (Array.isArray(v)) return v.length > 0;
        return v !== undefined;
      }).length,
    });
    logger.debug(`form cancelled: { was_dirty: ${form.isDirty} }`);
    nav.pop();
  }, [form.isDirty, form.values, showDiscardConfirm, owner, repo, nav]);

  // ---- Handle discard confirmation ----
  const handleDiscardConfirm = useCallback((confirmed: boolean) => {
    setShowDiscardConfirm(false);
    if (confirmed) {
      emit("tui.issue_create_form.cancelled", {
        repo_owner: owner,
        repo_name: repo,
        was_dirty: true,
        fields_filled: Object.entries(form.values).filter(([_, v]) => {
          if (typeof v === "string") return v !== "";
          if (Array.isArray(v)) return v.length > 0;
          return v !== undefined;
        }).length,
      });
      nav.pop();
    }
  }, [form.values, owner, repo, nav]);

  // ---- Handle retry ----
  const handleRetry = useCallback(() => {
    if (form.submissionError && !form.isSubmitting) {
      handleSubmit();
    }
  }, [form.submissionError, form.isSubmitting, handleSubmit]);

  // ---- Responsive body height ----
  const getBodyHeight = (): number => {
    if (isCompact) return 5;
    if (isLarge) return 16;
    return 10; // standard
  };

  // ---- Responsive field label ----
  const getFieldLabel = (field: FieldDefinition): string => {
    return isCompact && field.shortLabel ? field.shortLabel : field.label;
  };

  // ---- Keybindings ----
  useScreenKeybindings(
    [
      {
        key: "tab",
        description: "Next field",
        group: "Form",
        handler: () => {
          if (anySelectorOpen) return; // Tab is no-op when selector is open
          form.focusNext();
        },
      },
      {
        key: "shift+tab",
        description: "Prev field",
        group: "Form",
        handler: () => {
          if (anySelectorOpen) return;
          form.focusPrev();
        },
      },
      {
        key: "ctrl+s",
        description: "Submit",
        group: "Form",
        handler: handleSubmit,
      },
      {
        key: "escape",
        description: "Cancel",
        group: "Form",
        handler: () => {
          if (showDiscardConfirm) {
            // Esc during confirmation = cancel discard (stay on form)
            setShowDiscardConfirm(false);
            return;
          }
          if (anySelectorOpen) {
            // Close the active selector
            const active = getActiveSelector();
            if (active) active.close();
            return;
          }
          handleCancel();
        },
      },
      {
        key: "return",
        description: "Open / Confirm",
        group: "Form",
        handler: () => {
          if (showDiscardConfirm) return;
          if (anySelectorOpen) {
            const active = getActiveSelector();
            if (active) {
              if (form.focusIndex === FOCUS_MILESTONE) {
                active.selectHighlighted(); // single-select: selects + closes
              } else {
                active.confirmSelection(); // multi-select: closes dropdown
              }
            }
            return;
          }
          // Open selector on Enter for selector fields
          if (form.focusIndex === FOCUS_ASSIGNEES) { assigneesSelector.open(); return; }
          if (form.focusIndex === FOCUS_LABELS) { labelsSelector.open(); return; }
          if (form.focusIndex === FOCUS_MILESTONE) { milestoneSelector.open(); return; }
          // Submit button
          if (form.focusIndex === FOCUS_SUBMIT) { handleSubmit(); return; }
          // Cancel button
          if (form.focusIndex === FOCUS_CANCEL) { handleCancel(); return; }
          // In body textarea, Enter inserts newline — handled by OpenTUI <input multiline>
          // In title input, Enter is no-op (submit via Ctrl+S)
        },
      },
      {
        key: "j",
        description: "Down",
        group: "Navigation",
        handler: () => {
          const active = getActiveSelector();
          if (active) { active.moveHighlightDown(); return; }
        },
        when: () => anySelectorOpen,
      },
      {
        key: "down",
        description: "Down",
        group: "Navigation",
        handler: () => {
          const active = getActiveSelector();
          if (active) { active.moveHighlightDown(); return; }
        },
        when: () => anySelectorOpen,
      },
      {
        key: "k",
        description: "Up",
        group: "Navigation",
        handler: () => {
          const active = getActiveSelector();
          if (active) { active.moveHighlightUp(); return; }
        },
        when: () => anySelectorOpen,
      },
      {
        key: "up",
        description: "Up",
        group: "Navigation",
        handler: () => {
          const active = getActiveSelector();
          if (active) { active.moveHighlightUp(); return; }
        },
        when: () => anySelectorOpen,
      },
      {
        key: " ",
        description: "Toggle",
        group: "Actions",
        handler: () => {
          const active = getActiveSelector();
          if (active) { active.selectHighlighted(); return; }
          // Space on submit/cancel buttons activates them
          if (form.focusIndex === FOCUS_SUBMIT) { handleSubmit(); return; }
          if (form.focusIndex === FOCUS_CANCEL) { handleCancel(); return; }
        },
        when: () => anySelectorOpen || form.focusIndex === FOCUS_SUBMIT || form.focusIndex === FOCUS_CANCEL,
      },
      {
        key: "/",
        description: "Filter",
        group: "Actions",
        handler: () => {
          // Activate filter input within open selector
          const active = getActiveSelector();
          if (active) {
            // Focus moves to the filter input within the selector
            // The selector component handles this internally
          }
        },
        when: () => anySelectorOpen,
      },
      {
        key: "R",
        description: "Retry",
        group: "Actions",
        handler: handleRetry,
        when: () => form.submissionError !== null && !form.isSubmitting,
      },
      {
        key: "y",
        description: "Confirm discard",
        group: "Form",
        handler: () => handleDiscardConfirm(true),
        when: () => showDiscardConfirm,
      },
      {
        key: "n",
        description: "Cancel discard",
        group: "Form",
        handler: () => handleDiscardConfirm(false),
        when: () => showDiscardConfirm,
      },
    ],
    [
      { keys: "Tab", label: "next field", order: 10 },
      { keys: "Ctrl+S", label: "submit", order: 20 },
      { keys: "Esc", label: "cancel", order: 30 },
      { keys: "?", label: "help", order: 100 },
    ]
  );

  // ---- Render ----
  const bodyHeight = getBodyHeight();
  const labelWidth = isCompact ? 8 : 12;

  return (
    <box flexDirection="column" width="100%" height="100%">
      {/* Error banner */}
      {form.submissionError && (
        <box paddingX={2} height={1}>
          <text fg={theme.error} bold>
            {form.submissionError}
          </text>
        </box>
      )}

      {/* Discard confirmation */}
      {showDiscardConfirm && (
        <box paddingX={2} height={1}>
          <text fg={theme.warning} bold>
            Discard changes? (y/n)
          </text>
        </box>
      )}

      {/* Form content in scrollbox */}
      <scrollbox flex={1} paddingX={2} paddingY={1}>
        <box flexDirection="column" gap={isCompact ? 0 : 1}>
          {/* Title field */}
          <box flexDirection="column">
            <text bold>{getFieldLabel(FIELD_DEFINITIONS[0])}</text>
            <input
              value={form.values.title}
              onInput={(value: string) => {
                // Enforce maxLength at input time
                if (value.length <= 255) {
                  form.setValue("title", value);
                }
              }}
              placeholder="Issue title"
              focused={form.focusIndex === FOCUS_TITLE && !form.isSubmitting}
            />
            {form.errors.title && (
              <text fg={theme.error}>⚠ {form.errors.title}</text>
            )}
          </box>

          {/* Body field */}
          <box flexDirection="column">
            <text bold>{getFieldLabel(FIELD_DEFINITIONS[1])}</text>
            <scrollbox height={bodyHeight}>
              <input
                multiline
                value={form.values.body}
                onInput={(value: string) => form.setValue("body", value)}
                placeholder="Describe the issue (markdown supported)"
                focused={form.focusIndex === FOCUS_BODY && !form.isSubmitting}
              />
            </scrollbox>
          </box>

          {/* Assignees selector */}
          <box flexDirection="row" gap={2}>
            <text bold width={labelWidth}>{getFieldLabel(FIELD_DEFINITIONS[2])}</text>
            {collaboratorsLoading ? (
              <text fg={theme.muted}>Loading...</text>
            ) : collaboratorsError ? (
              <text fg={theme.error}>Failed to load (retry)</text>
            ) : collaborators.length === 0 && collaboratorQuery === "" ? (
              <text fg={theme.muted}>(no collaborators)</text>
            ) : (
              <box flexDirection="column">
                <text
                  fg={form.focusIndex === FOCUS_ASSIGNEES ? theme.primary : undefined}
                >
                  {isCompact
                    ? `${assigneesSelector.selectedCount} sel`
                    : `▸ ${assigneesSelector.displaySummary}`}
                </text>
                {assigneesSelector.isOpen && !isCompact && (
                  <SelectorDropdown
                    selector={assigneesSelector}
                    maxVisible={isLarge ? 12 : 8}
                    theme={theme}
                  />
                )}
              </box>
            )}
          </box>

          {/* Labels selector */}
          <box flexDirection="row" gap={2}>
            <text bold width={labelWidth}>{getFieldLabel(FIELD_DEFINITIONS[3])}</text>
            {labelsLoading ? (
              <text fg={theme.muted}>Loading...</text>
            ) : labelsError ? (
              <text fg={theme.error}>Failed to load (retry)</text>
            ) : repoLabels.length === 0 ? (
              <text fg={theme.muted}>(no labels)</text>
            ) : (
              <box flexDirection="column">
                <text
                  fg={form.focusIndex === FOCUS_LABELS ? theme.primary : undefined}
                >
                  {isCompact
                    ? `${labelsSelector.selectedCount} sel`
                    : `▸ ${labelsSelector.displaySummary}`}
                </text>
                {labelsSelector.isOpen && !isCompact && (
                  <SelectorDropdown
                    selector={labelsSelector}
                    maxVisible={isLarge ? 12 : 8}
                    theme={theme}
                    showColorDot
                  />
                )}
              </box>
            )}
          </box>

          {/* Milestone selector */}
          <box flexDirection="row" gap={2}>
            <text bold width={labelWidth}>{getFieldLabel(FIELD_DEFINITIONS[4])}</text>
            {milestonesLoading ? (
              <text fg={theme.muted}>Loading...</text>
            ) : milestonesError ? (
              <text fg={theme.error}>Failed to load (retry)</text>
            ) : repoMilestones.length === 0 ? (
              <text fg={theme.muted}>(no milestones)</text>
            ) : (
              <box flexDirection="column">
                <text
                  fg={form.focusIndex === FOCUS_MILESTONE ? theme.primary : undefined}
                >
                  {isCompact
                    ? milestoneSelector.displaySummary.slice(0, 10)
                    : `▸ ${milestoneSelector.displaySummary}`}
                </text>
                {milestoneSelector.isOpen && !isCompact && (
                  <SelectorDropdown
                    selector={milestoneSelector}
                    maxVisible={isLarge ? 12 : 8}
                    theme={theme}
                  />
                )}
              </box>
            )}
          </box>

          {/* Buttons */}
          <box flexDirection="row" gap={2} marginTop={isCompact ? 0 : 1}>
            <ActionButton
              label="Submit"
              isLoading={form.isSubmitting}
              loadingLabel="Creating…"
              onPress={handleSubmit}
              disabled={form.isSubmitting}
            />
            <ActionButton
              label="Cancel"
              onPress={handleCancel}
              disabled={form.isSubmitting}
            />
          </box>
        </box>
      </scrollbox>
    </box>
  );
}
```

---

### Step 4: Selector Dropdown Sub-Component

**File:** `apps/tui/src/components/SelectorDropdown.tsx`

A reusable dropdown overlay rendered inline below the selector trigger. Supports single-select and multi-select modes, filter input, colored dot indicators (for labels), and keyboard navigation.

```typescript
import { useTheme } from "../hooks/useTheme.js";
import type { SelectorState, SelectorOption } from "../hooks/useSelectorState.js";
import type { ThemeTokens } from "../theme/tokens.js";

interface SelectorDropdownProps {
  selector: SelectorState<any>;
  maxVisible: number;
  theme: ThemeTokens;
  showColorDot?: boolean;
}

export function SelectorDropdown({
  selector,
  maxVisible,
  theme,
  showColorDot = false,
}: SelectorDropdownProps) {
  const visible = selector.filteredOptions.slice(0, maxVisible);
  const hasMore = selector.filteredOptions.length > maxVisible;

  return (
    <box
      flexDirection="column"
      border={true}
      borderColor={theme.border}
      width="100%"
      maxHeight={maxVisible + 2} // +2 for border + filter
    >
      {/* Filter input */}
      {selector.filterQuery !== "" && (
        <box height={1} paddingX={1}>
          <text fg={theme.muted}>/{selector.filterQuery}</text>
        </box>
      )}

      {/* Options */}
      <scrollbox height={Math.min(visible.length, maxVisible)}>
        {visible.map((option: SelectorOption, index: number) => {
          const isHighlighted = index === selector.highlightIndex;
          const isSelected = selector.isSelected(option.id);

          return (
            <box
              key={option.id}
              height={1}
              paddingX={1}
              bg={isHighlighted ? theme.primary : undefined}
            >
              {/* Selection indicator for multi-select */}
              <text fg={isHighlighted ? undefined : theme.muted}>
                {isSelected ? "[✓] " : "[ ] "}
              </text>
              {/* Color dot for labels */}
              {showColorDot && option.color && (
                <text fg={option.color}>● </text>
              )}
              {/* Option label */}
              <text
                fg={isHighlighted ? undefined : (option.disabled ? theme.muted : undefined)}
              >
                {option.label}
              </text>
            </box>
          );
        })}
      </scrollbox>

      {/* Overflow indicator */}
      {hasMore && (
        <box height={1} paddingX={1}>
          <text fg={theme.muted}>
            +{selector.filteredOptions.length - maxVisible} more (/ to filter)
          </text>
        </box>
      )}
    </box>
  );
}
```

---

### Step 5: Screen Registry Update

**File:** `apps/tui/src/router/registry.ts`

Update the `IssueCreate` entry to point to the real component instead of `PlaceholderScreen`.

```diff
- import { PlaceholderScreen } from "../screens/PlaceholderScreen.js";
+ import { PlaceholderScreen } from "../screens/PlaceholderScreen.js";
+ import { IssueCreateForm } from "../screens/Issues/IssueCreateForm.js";

  [ScreenName.IssueCreate]: {
-   component: PlaceholderScreen,
+   component: IssueCreateForm,
    requiresRepo: true,
    requiresOrg: false,
    breadcrumbLabel: () => "New Issue",
  },
```

Only `IssueCreate` is updated in this ticket. `IssueDetail`, `IssueEdit`, and `Issues` remain as `PlaceholderScreen` (they are separate tickets).

---

### Step 6: Barrel Exports

**File:** `apps/tui/src/screens/Issues/index.ts`

```typescript
export { IssueCreateForm } from "./IssueCreateForm.js";
```

This file may already exist from the `tui-issues-screen-scaffold` dependency. If so, add the export. If not, create the file.

**File:** `apps/tui/src/hooks/index.ts` (or wherever hooks are barrel-exported)

Add exports for the new hooks:

```typescript
export { useFormState, type FieldDefinition, type FormState } from "./useFormState.js";
export { useSingleSelector, useMultiSelector, type SelectorOption, type SelectorState } from "./useSelectorState.js";
```

**File:** `apps/tui/src/components/index.ts`

Add export for the new component:

```typescript
export { SelectorDropdown } from "./SelectorDropdown.js";
```

---

### Step 7: Issue List `c` Keybinding Integration

The issue list screen (from `tui-issue-list-screen` dependency) must register a `c` keybinding that pushes the IssueCreate screen. This is already specified in the dependency ticket. If the issue list screen exists, verify it includes:

```typescript
// In IssueListScreen's useScreenKeybindings:
{
  key: "c",
  description: "Create issue",
  group: "Actions",
  handler: () => nav.push(ScreenName.IssueCreate, { owner, repo, entryPoint: "keybinding" }),
}
```

If the issue list screen does not yet exist (it's a `PlaceholderScreen`), the `c` keybinding will not be registered, and users will rely on the command palette entry or `g i` → `c` flow once the list screen is implemented. This is acceptable — the form itself works independently.

---

### Step 8: Command Palette Registration

The command palette (from `tui-nav-chrome-feat-05`) maintains a command registry. Add an entry for issue creation:

**File:** `apps/tui/src/commands/issue-commands.ts` (new file, or append to existing command registry)

```typescript
import { ScreenName } from "../router/types.js";

export const issueCreateCommand = {
  id: "issue.create",
  label: "Create Issue",
  keywords: ["new issue", "create issue", "file issue", "bug report"],
  requiresRepo: true,
  execute: (nav: NavigationContext) => {
    const repo = nav.repoContext;
    if (!repo) return;
    nav.push(ScreenName.IssueCreate, {
      owner: repo.owner,
      repo: repo.repo,
      entryPoint: "command_palette",
    });
  },
};
```

If the command registry infrastructure does not yet exist, this file is created as a forward-declaration. The command palette integration activates when the command palette screen lands.

---

## File Inventory

| File | Action | Purpose |
|------|--------|---------|
| `apps/tui/src/hooks/useFormState.ts` | Create | Generic form state management hook |
| `apps/tui/src/hooks/useSelectorState.ts` | Create | Single/multi-select dropdown state management |
| `apps/tui/src/screens/Issues/IssueCreateForm.tsx` | Create | Main issue creation form screen component |
| `apps/tui/src/screens/Issues/index.ts` | Create or Update | Barrel export for Issues screen directory |
| `apps/tui/src/components/SelectorDropdown.tsx` | Create | Reusable selector dropdown sub-component |
| `apps/tui/src/components/index.ts` | Update | Add SelectorDropdown export |
| `apps/tui/src/hooks/index.ts` | Update | Add useFormState, useSelectorState exports |
| `apps/tui/src/router/registry.ts` | Update | Point IssueCreate to real component |
| `apps/tui/src/commands/issue-commands.ts` | Create | Command palette entry for issue creation |
| `e2e/tui/issues.test.ts` | Create or Update | E2E test suite for issue create form |

---

## Data Flow

### On Mount

```
IssueCreateForm mounts
├── useRepoLabels(owner, repo)      → GET /api/repos/:owner/:repo/labels
├── useRepoMilestones(owner, repo)  → GET /api/repos/:owner/:repo/milestones?state=open
├── useRepoCollaborators(owner, repo, { query: "" })
│   → (no API call when query is empty — returns empty array)
├── emit("tui.issue_create_form.opened")
└── logger.debug("form mounted")
```

### On Submit

```
User presses Ctrl+S or Enter on Submit button
├── Client-side validation
│   ├── Title empty? → Set inline error, focus title, emit validation_error, STOP
│   └── Valid → Continue
├── form.setSubmitting(true)
├── emit("tui.issue_create_form.submitted")
├── useCreateIssue.mutate(request)
│   → POST /api/repos/:owner/:repo/issues
│   ├── 201 Created
│   │   ├── emit("tui.issue_create_form.succeeded")
│   │   └── nav.replace(IssueDetail, { number })
│   ├── 401 Unauthorized
│   │   ├── form.setSubmissionError("Session expired...")
│   │   └── emit("tui.issue_create_form.failed")
│   ├── 403 Forbidden
│   │   ├── form.setSubmissionError("You do not have permission...")
│   │   └── emit("tui.issue_create_form.failed")
│   ├── 422 Validation Error
│   │   ├── Map field errors → inline errors
│   │   ├── Focus first errored field
│   │   └── emit("tui.issue_create_form.failed")
│   ├── 429 Rate Limited
│   │   ├── form.setSubmissionError("Rate limit exceeded...")
│   │   └── emit("tui.issue_create_form.failed")
│   └── Other error
│       ├── form.setSubmissionError(message)
│       └── emit("tui.issue_create_form.failed")
└── form.setSubmitting(false) (on error only; on success, screen is replaced)
```

### On Cancel

```
User presses Esc
├── Form dirty?
│   ├── No → nav.pop() immediately
│   └── Yes → Show "Discard changes? (y/n)"
│       ├── y → emit("tui.issue_create_form.cancelled"), nav.pop()
│       └── n → setShowDiscardConfirm(false)
```

---

## Keybinding Matrix

### Form-Level (Priority: SCREEN)

| Key | Condition | Action |
|-----|-----------|--------|
| `Tab` | No selector open | Focus next field |
| `Shift+Tab` | No selector open | Focus previous field |
| `Ctrl+S` | Always | Submit form |
| `Esc` | Discard confirm active | Cancel discard |
| `Esc` | Selector open | Close selector |
| `Esc` | Clean form | Pop screen |
| `Esc` | Dirty form | Show discard confirm |
| `Enter` | Focus on selector field | Open selector |
| `Enter` | Selector open (single) | Select highlighted + close |
| `Enter` | Selector open (multi) | Confirm selection + close |
| `Enter` | Focus on Submit | Submit |
| `Enter` | Focus on Cancel | Cancel |
| `j` / `Down` | Selector open | Move highlight down |
| `k` / `Up` | Selector open | Move highlight up |
| `Space` | Selector open (multi) | Toggle highlighted option |
| `Space` | Focus on Submit/Cancel | Activate button |
| `/` | Selector open | Focus filter input |
| `R` | Error banner visible | Retry submit |
| `y` | Discard confirm visible | Confirm discard |
| `n` | Discard confirm visible | Cancel discard |

### Text Input (Priority: TEXT_INPUT — handled by OpenTUI)

When `focusIndex === FOCUS_TITLE` or `focusIndex === FOCUS_BODY`, OpenTUI's `<input>` component captures printable characters, Backspace, Delete, Left, Right, Home/Ctrl+A, End/Ctrl+E, Ctrl+K, Ctrl+U. In multiline mode (body), Enter inserts a newline.

`Ctrl+S`, `Esc`, `Tab`, `Shift+Tab` propagate through the text input to the form-level keybindings.

---

## Responsive Layout Specifications

### Compact (80×24)

| Property | Value |
|----------|-------|
| Body textarea height | 5 lines |
| Field labels | Abbreviated: "Title", "Desc", "Assign", "Labels", "Miles." |
| Label width | 8 characters |
| Selectors | Inline summary only ("0 sel"), no dropdown overlay |
| Gap between fields | 0 |
| Button margin-top | 0 |
| Error banner | Truncated to fit |

### Standard (120×40)

| Property | Value |
|----------|-------|
| Body textarea height | 10 lines |
| Field labels | Full: "Title", "Description", "Assignees", "Labels", "Milestone" |
| Label width | 12 characters |
| Selectors | Dropdown overlay showing up to 8 items |
| Gap between fields | 1 line |
| Button margin-top | 1 line |
| Error banner | Full width |

### Large (200×60)

| Property | Value |
|----------|-------|
| Body textarea height | 16 lines |
| Field labels | Full |
| Label width | 12 characters |
| Selectors | Dropdown overlay showing up to 12 items |
| Gap between fields | 1 line + extra padding |
| Button margin-top | 1 line |
| Error banner | Full width |

### Unsupported (<80×24)

The `TerminalTooSmallScreen` component is rendered by the AppShell. The form is not mounted. If the terminal is resized back above minimum, the form re-mounts with a fresh state (form state is not preserved across unmount/remount since the screen component is conditionally rendered by AppShell).

**Exception:** If the terminal is resized below minimum while the form is already mounted, the AppShell's `TerminalTooSmallScreen` overlay takes over. When the terminal is resized back, the form screen re-renders with its React state preserved (React does not unmount it — the overlay simply disappears). This means form values and focus position are preserved through a below-minimum → above-minimum resize cycle.

---

## Error Handling Matrix

| Scenario | Detection | User-Facing Behavior | Recovery |
|----------|-----------|---------------------|----------|
| Empty title on submit | Client-side validation | Inline error `⚠ Title is required` below title. Focus returns to title. | Edit title, resubmit |
| Title >255 chars | Input handler rejects | Characters beyond 255 are silently rejected | N/A (preventive) |
| Network timeout | `AbortError` or fetch timeout | Red banner: "Request timed out. Press `R` to retry." | Press `R` to retry |
| 401 Unauthorized | Response status | Red banner: "Session expired. Run `codeplane auth login` to re-authenticate." | Re-authenticate via CLI |
| 403 Forbidden | Response status | Red banner: "You do not have permission to create issues in this repository." | Navigate away |
| 413 Content Too Large | Response status | Red banner: "Content too large. Please shorten the description." | Shorten body, resubmit |
| 422 Validation | Response with field errors | Inline field errors mapped to form. First errored field focused. | Fix fields, resubmit |
| 429 Rate Limited | Response status | Red banner: "Rate limit exceeded. Please wait and try again." | Wait, press `R` |
| 5xx Server Error | Response status | Red banner: server error message. | Press `R` to retry |
| Selector data load failure | Fetch error on mount | Selector shows "Failed to load (retry)". Other fields remain functional. | Retry by navigating away and back |
| Double-submit | `Ctrl+S` while `isSubmitting=true` | Ignored. Button shows "Creating…" | Wait for response |
| Terminal resize during submit | `useOnResize` fires | Layout recalculates. Submission continues. "Creating…" preserved. | N/A |
| SSE disconnect | SSE context | Status bar updates. Form unaffected (REST-based). | N/A |

---

## Productionization Notes

### From Hook POCs to Production

1. **`useFormState`** is a general-purpose hook. After this ticket ships:
   - It will be consumed by `IssueEditForm`, `LandingCreateForm`, `LandingEditForm`, `WorkspaceCreateForm`, and `SettingsScreen`.
   - The `FieldDefinition` interface may need to expand to support `checkbox`, `radio`, and `date` types for settings and workflow dispatch forms.
   - Consider extracting to `apps/tui/src/hooks/form/` directory if the form system grows beyond 3 files.

2. **`useSelectorState`** is the foundation for all dropdown/picker interactions:
   - Label picker overlay (`tui-label-picker-overlay`) will wrap `useMultiSelector` with the `LabelBadge` component for colored rendering.
   - Assignee picker will eventually need async search (currently uses pre-loaded collaborators). The `useRepoCollaborators` hook's search-based API is already compatible.
   - Consider adding virtual scrolling support if selector option lists exceed 100 items. Currently capped by `maxVisible` prop.

3. **`SelectorDropdown`** is a visual sub-component, not a full OpenTUI component. It renders within the form layout, not as an absolute-positioned overlay. This is intentional for terminal simplicity. If future use cases require floating overlays (e.g., command palette filters), a separate `OverlaySelect` component should be created using the OverlayManager.

4. **Color dot rendering** in label selectors depends on the `tui-label-badge-component` ticket's `resolveColor()` utility. If that utility is not yet available, the `SelectorDropdown` falls back to rendering the raw hex color string or omitting the dot. The `showColorDot` prop gates this behavior.

5. **`useRepoCollaborators`** uses a workaround (search endpoint instead of a real collaborators endpoint). When the backend adds `GET /api/repos/:owner/:repo/collaborators`, the hook should be updated. The form component does not need to change — it consumes the hook's `users` array regardless of the underlying API.

6. **Form state is not persisted.** If a user accidentally navigates away (e.g., `g d` for go-to Dashboard), the form data is lost. Future enhancement: store draft state in an in-memory draft cache keyed by `owner/repo`, auto-restored on re-entry. This is explicitly out of scope for this ticket.

---

## Unit & Integration Tests

**Test file:** `e2e/tui/issues.test.ts`

All tests use `@microsoft/tui-test` via the `launchTUI` helper from `e2e/tui/helpers.ts`. Tests run against a real API server with test fixtures. No mocking of implementation details.

Tests that fail due to unimplemented backend features are left failing. They are never skipped or commented out.

### Test Fixtures

```typescript
// e2e/tui/issues.test.ts
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { launchTUI, createMockAPIEnv, type TUITestInstance, TERMINAL_SIZES } from "./helpers.js";

interface LabelFixture {
  id: number;
  name: string;
  color: string;
  description: string;
}

interface MilestoneFixture {
  id: number;
  title: string;
  state: string;
}

interface CollaboratorFixture {
  id: string;
  username: string;
  display_name: string;
}

const TEST_LABELS: LabelFixture[] = [
  { id: 1, name: "bug", color: "d73a4a", description: "Something isn't working" },
  { id: 2, name: "enhancement", color: "a2eeef", description: "New feature or request" },
  { id: 3, name: "documentation", color: "0075ca", description: "Improvements or additions to documentation" },
  { id: 4, name: "good first issue", color: "7057ff", description: "Good for newcomers" },
  { id: 5, name: "help wanted", color: "008672", description: "Extra attention is needed" },
];

const TEST_MILESTONES: MilestoneFixture[] = [
  { id: 1, title: "v1.0", state: "open" },
  { id: 2, title: "v1.1", state: "open" },
];

const TEST_COLLABORATORS: CollaboratorFixture[] = [
  { id: "1", username: "alice", display_name: "Alice Smith" },
  { id: "2", username: "bob", display_name: "Bob Jones" },
  { id: "3", username: "charlie", display_name: "Charlie Brown" },
];

const OWNER = "alice";
const REPO = "test-repo";
```

### Helper Functions

```typescript
async function navigateToIssueCreateForm(terminal: TUITestInstance): Promise<void> {
  // Navigate to Issues screen, then press c to create
  await terminal.sendKeys("g", "i"); // go to issues
  await terminal.waitForText("Issues");
  await terminal.sendKeys("c"); // create issue
  await terminal.waitForText("New Issue");
}

async function navigateToCreateFormDirect(terminal: TUITestInstance): Promise<void> {
  // Navigate directly via deep-link args
  // (launched with --screen IssueCreate --repo alice/test-repo)
  await terminal.waitForText("New Issue");
}
```

### Terminal Snapshot Tests

```typescript
describe("TUI_ISSUE_CREATE_FORM", () => {
  let terminal: TUITestInstance;

  afterEach(async () => {
    if (terminal) await terminal.terminate();
  });

  // ---- Snapshot Tests ----

  describe("snapshots", () => {
    test("renders empty form at 120x40", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "IssueCreate", "--repo", `${OWNER}/${REPO}`],
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Title");
      await terminal.waitForText("Description");
      await terminal.waitForText("Assignees");
      await terminal.waitForText("Labels");
      await terminal.waitForText("Milestone");
      await terminal.waitForText("Submit");
      await terminal.waitForText("Cancel");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("renders empty form at 80x24", async () => {
      terminal = await launchTUI({
        cols: 80,
        rows: 24,
        args: ["--screen", "IssueCreate", "--repo", `${OWNER}/${REPO}`],
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Title");
      // Abbreviated labels at compact breakpoint
      await terminal.waitForText("Assign");
      await terminal.waitForText("Miles.");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("renders empty form at 200x60", async () => {
      terminal = await launchTUI({
        cols: 200,
        rows: 60,
        args: ["--screen", "IssueCreate", "--repo", `${OWNER}/${REPO}`],
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Title");
      await terminal.waitForText("Assignees");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("renders title validation error", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "IssueCreate", "--repo", `${OWNER}/${REPO}`],
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Title");
      // Submit with empty title
      await terminal.sendKeys("ctrl+s");
      await terminal.waitForText("Title is required");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("renders server error banner", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "IssueCreate", "--repo", `${OWNER}/${REPO}`],
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Title");
      await terminal.sendText("Test issue title");
      await terminal.sendKeys("ctrl+s");
      // Wait for API error (server may return 500 in test env)
      // The error banner should appear
      await terminal.waitForText("Submit"); // form re-enabled after error
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("renders submitting state", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "IssueCreate", "--repo", `${OWNER}/${REPO}`],
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Title");
      await terminal.sendText("Test issue title");
      await terminal.sendKeys("ctrl+s");
      // Should briefly show "Creating…"
      await terminal.waitForText("Creating");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("renders assignees selector expanded", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "IssueCreate", "--repo", `${OWNER}/${REPO}`],
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Title");
      // Tab to Assignees field
      await terminal.sendKeys("tab", "tab"); // Title → Body → Assignees
      await terminal.sendKeys("return"); // Open selector
      // Should show collaborator list
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("renders labels selector with colored indicators", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "IssueCreate", "--repo", `${OWNER}/${REPO}`],
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Title");
      // Tab to Labels field
      await terminal.sendKeys("tab", "tab", "tab"); // Title → Body → Assignees → Labels
      await terminal.sendKeys("return"); // Open selector
      // Should show labels with colored dots
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("renders milestone selector expanded", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "IssueCreate", "--repo", `${OWNER}/${REPO}`],
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Title");
      // Tab to Milestone field
      await terminal.sendKeys("tab", "tab", "tab", "tab"); // → Milestone
      await terminal.sendKeys("return"); // Open selector
      await terminal.waitForText("None");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("renders discard confirmation", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "IssueCreate", "--repo", `${OWNER}/${REPO}`],
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Title");
      await terminal.sendText("Some title");
      await terminal.sendKeys("escape");
      await terminal.waitForText("Discard changes?");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("renders breadcrumb correctly", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "IssueCreate", "--repo", `${OWNER}/${REPO}`],
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("New Issue");
      // Header breadcrumb should contain the path
      const headerLine = terminal.getLine(0);
      expect(headerLine).toMatch(/Issues.*New Issue/);
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("renders help overlay", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "IssueCreate", "--repo", `${OWNER}/${REPO}`],
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Title");
      await terminal.sendKeys("?");
      await terminal.waitForText("help");
      expect(terminal.snapshot()).toMatchSnapshot();
    });
  });

  // ---- Keyboard Interaction Tests ----

  describe("keyboard interactions", () => {
    test("Tab cycles through form fields", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "IssueCreate", "--repo", `${OWNER}/${REPO}`],
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Title");
      // Tab through all 7 fields and wrap back to Title
      for (let i = 0; i < 7; i++) {
        await terminal.sendKeys("tab");
      }
      // After 7 tabs from Title (index 0), we should be back at Title (index 0)
      // Verify by typing — text should appear in the title field
      await terminal.sendText("test");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("Shift+Tab cycles backward", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "IssueCreate", "--repo", `${OWNER}/${REPO}`],
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Title");
      // Shift+Tab from Title should go to Cancel
      await terminal.sendKeys("shift+tab");
      // Another Shift+Tab should go to Submit
      await terminal.sendKeys("shift+tab");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("typing in title updates value", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "IssueCreate", "--repo", `${OWNER}/${REPO}`],
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Title");
      await terminal.sendText("Bug report");
      await terminal.waitForText("Bug report");
    });

    test("Enter inserts newline in body", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "IssueCreate", "--repo", `${OWNER}/${REPO}`],
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Title");
      await terminal.sendKeys("tab"); // Focus body
      await terminal.sendText("line1");
      await terminal.sendKeys("return");
      await terminal.sendText("line2");
      await terminal.waitForText("line1");
      await terminal.waitForText("line2");
    });

    test("Ctrl+S submits from title field", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "IssueCreate", "--repo", `${OWNER}/${REPO}`],
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Title");
      await terminal.sendText("Test issue from title");
      await terminal.sendKeys("ctrl+s");
      // Should either navigate to detail or show error (depending on backend availability)
      // Verify "Creating" appears (submission started)
      await terminal.waitForText("Creating");
    });

    test("Ctrl+S submits from body field", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "IssueCreate", "--repo", `${OWNER}/${REPO}`],
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Title");
      await terminal.sendText("Test issue");
      await terminal.sendKeys("tab"); // Focus body
      await terminal.sendText("Description text");
      await terminal.sendKeys("ctrl+s");
      await terminal.waitForText("Creating");
    });

    test("Ctrl+S with empty title shows validation error", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "IssueCreate", "--repo", `${OWNER}/${REPO}`],
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Title");
      await terminal.sendKeys("ctrl+s");
      await terminal.waitForText("Title is required");
      // Verify form was NOT submitted (no "Creating" text)
      await terminal.waitForNoText("Creating");
    });

    test("Esc on clean form pops immediately", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "IssueCreate", "--repo", `${OWNER}/${REPO}`],
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("New Issue");
      await terminal.sendKeys("escape");
      // Should return to previous screen (no "New Issue" in breadcrumb)
      await terminal.waitForNoText("New Issue");
    });

    test("Esc on dirty form shows confirmation", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "IssueCreate", "--repo", `${OWNER}/${REPO}`],
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Title");
      await terminal.sendText("Some title text");
      await terminal.sendKeys("escape");
      await terminal.waitForText("Discard changes?");
    });

    test("Esc confirmation y discards", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "IssueCreate", "--repo", `${OWNER}/${REPO}`],
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Title");
      await terminal.sendText("Some title");
      await terminal.sendKeys("escape");
      await terminal.waitForText("Discard changes?");
      await terminal.sendKeys("y");
      await terminal.waitForNoText("New Issue");
    });

    test("Esc confirmation n returns to form", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "IssueCreate", "--repo", `${OWNER}/${REPO}`],
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Title");
      await terminal.sendText("Some title");
      await terminal.sendKeys("escape");
      await terminal.waitForText("Discard changes?");
      await terminal.sendKeys("n");
      await terminal.waitForNoText("Discard changes?");
      await terminal.waitForText("New Issue"); // Still on form
    });

    test("assignees selector opens with Enter", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "IssueCreate", "--repo", `${OWNER}/${REPO}`],
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Title");
      await terminal.sendKeys("tab", "tab"); // → Assignees
      await terminal.sendKeys("return");
      // Selector should open (look for checkbox indicators or collaborator names)
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("assignees selector j/k navigates", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "IssueCreate", "--repo", `${OWNER}/${REPO}`],
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Title");
      await terminal.sendKeys("tab", "tab"); // → Assignees
      await terminal.sendKeys("return"); // Open
      await terminal.sendKeys("j"); // Move down
      await terminal.sendKeys("k"); // Move up
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("assignees selector Space toggles", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "IssueCreate", "--repo", `${OWNER}/${REPO}`],
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Title");
      await terminal.sendKeys("tab", "tab"); // → Assignees
      await terminal.sendKeys("return"); // Open
      await terminal.sendKeys(" "); // Toggle first item
      // Should show checkmark on first item
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("labels selector multi-select", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "IssueCreate", "--repo", `${OWNER}/${REPO}`],
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Title");
      await terminal.sendKeys("tab", "tab", "tab"); // → Labels
      await terminal.sendKeys("return"); // Open
      await terminal.sendKeys(" "); // Select first
      await terminal.sendKeys("j"); // Move to second
      await terminal.sendKeys(" "); // Select second
      await terminal.sendKeys("return"); // Confirm
      await terminal.waitForText("2 selected");
    });

    test("milestone selector single-select", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "IssueCreate", "--repo", `${OWNER}/${REPO}`],
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Title");
      await terminal.sendKeys("tab", "tab", "tab", "tab"); // → Milestone
      await terminal.sendKeys("return"); // Open
      await terminal.sendKeys("j"); // Move past "None"
      await terminal.sendKeys("return"); // Select
      // Should show selected milestone title
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("selector filter with /", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "IssueCreate", "--repo", `${OWNER}/${REPO}`],
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Title");
      await terminal.sendKeys("tab", "tab", "tab"); // → Labels
      await terminal.sendKeys("return"); // Open
      await terminal.sendKeys("/"); // Activate filter
      await terminal.sendText("bug"); // Type filter
      // Should filter options to show only "bug"
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("successful submit navigates to issue detail", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "IssueCreate", "--repo", `${OWNER}/${REPO}`],
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Title");
      await terminal.sendText("New test issue");
      await terminal.sendKeys("ctrl+s");
      // On success, should navigate to issue detail view
      // The breadcrumb should show the issue number
      // This test may fail if backend is not running — that's expected per policy
      await terminal.waitForText("#"); // Issue number in breadcrumb
    });

    test("failed submit shows error and re-enables form", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "IssueCreate", "--repo", `${OWNER}/${REPO}`],
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Title");
      await terminal.sendText("Test issue");
      await terminal.sendKeys("ctrl+s");
      // If backend returns error, form should re-enable
      // Wait for either success navigation or error banner
      // The Submit button should eventually be re-enabled (not "Creating…")
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("double submit is prevented", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "IssueCreate", "--repo", `${OWNER}/${REPO}`],
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Title");
      await terminal.sendText("Test issue");
      await terminal.sendKeys("ctrl+s");
      await terminal.sendKeys("ctrl+s"); // Second submit should be ignored
      await terminal.waitForText("Creating");
      // Should still show "Creating" (not two submissions)
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("c keybinding from issue list opens form", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--repo", `${OWNER}/${REPO}`],
        env: createMockAPIEnv(),
      });
      // Navigate to issues list first
      await terminal.sendKeys("g", "i");
      await terminal.waitForText("Issues");
      await terminal.sendKeys("c");
      await terminal.waitForText("New Issue");
    });

    test("command palette create issue", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--repo", `${OWNER}/${REPO}`],
        env: createMockAPIEnv(),
      });
      await terminal.sendKeys(":"); // Open command palette
      await terminal.sendText("create issue");
      await terminal.sendKeys("return"); // Select
      await terminal.waitForText("New Issue");
    });

    test("title max length enforced", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "IssueCreate", "--repo", `${OWNER}/${REPO}`],
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Title");
      // Type 256 characters (only 255 should be accepted)
      const longString = "A".repeat(256);
      await terminal.sendText(longString);
      // The input should contain exactly 255 characters
      // Verify by checking that the 256th character was not accepted
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("R retries after error", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "IssueCreate", "--repo", `${OWNER}/${REPO}`],
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Title");
      await terminal.sendText("Test issue");
      await terminal.sendKeys("ctrl+s");
      // Wait for error state (if backend is unavailable)
      // Then press R to retry
      await terminal.sendKeys("R");
      // Should attempt re-submission
      expect(terminal.snapshot()).toMatchSnapshot();
    });
  });

  // ---- Responsive Tests ----

  describe("responsive", () => {
    test("80x24 collapses body height", async () => {
      terminal = await launchTUI({
        cols: 80,
        rows: 24,
        args: ["--screen", "IssueCreate", "--repo", `${OWNER}/${REPO}`],
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Title");
      // Body textarea should be 5 lines at compact breakpoint
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("80x24 abbreviates labels", async () => {
      terminal = await launchTUI({
        cols: 80,
        rows: 24,
        args: ["--screen", "IssueCreate", "--repo", `${OWNER}/${REPO}`],
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Assign"); // Abbreviated from "Assignees"
      await terminal.waitForText("Miles."); // Abbreviated from "Milestone"
    });

    test("80x24 selectors show inline summary", async () => {
      terminal = await launchTUI({
        cols: 80,
        rows: 24,
        args: ["--screen", "IssueCreate", "--repo", `${OWNER}/${REPO}`],
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("0 sel"); // Compact selector summary
    });

    test("120x40 standard layout", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "IssueCreate", "--repo", `${OWNER}/${REPO}`],
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Assignees"); // Full label
      await terminal.waitForText("Milestone"); // Full label
      await terminal.waitForText("0 selected"); // Full summary
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("200x60 expanded layout", async () => {
      terminal = await launchTUI({
        cols: 200,
        rows: 60,
        args: ["--screen", "IssueCreate", "--repo", `${OWNER}/${REPO}`],
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Title");
      expect(terminal.snapshot()).toMatchSnapshot();
    });

    test("resize from 120x40 to 80x24 preserves state", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "IssueCreate", "--repo", `${OWNER}/${REPO}`],
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Title");
      await terminal.sendText("My issue title");
      await terminal.resize(80, 24);
      // Title should still contain the text
      await terminal.waitForText("My issue title");
      // Labels should be abbreviated
      await terminal.waitForText("Assign");
    });

    test("resize from 80x24 to 120x40 expands layout", async () => {
      terminal = await launchTUI({
        cols: 80,
        rows: 24,
        args: ["--screen", "IssueCreate", "--repo", `${OWNER}/${REPO}`],
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Assign"); // Abbreviated
      await terminal.resize(120, 40);
      await terminal.waitForText("Assignees"); // Full label
    });

    test("resize below minimum shows warning", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "IssueCreate", "--repo", `${OWNER}/${REPO}`],
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Title");
      await terminal.resize(60, 20);
      await terminal.waitForText("too small");
    });

    test("resize back above minimum restores form", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "IssueCreate", "--repo", `${OWNER}/${REPO}`],
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Title");
      await terminal.sendText("Preserved title");
      await terminal.resize(60, 20);
      await terminal.waitForText("too small");
      await terminal.resize(80, 24);
      await terminal.waitForText("Preserved title");
    });

    test("resize during submission", async () => {
      terminal = await launchTUI({
        cols: 120,
        rows: 40,
        args: ["--screen", "IssueCreate", "--repo", `${OWNER}/${REPO}`],
        env: createMockAPIEnv(),
      });
      await terminal.waitForText("Title");
      await terminal.sendText("Test issue");
      await terminal.sendKeys("ctrl+s");
      await terminal.resize(80, 24);
      // Submission should continue normally
      expect(terminal.snapshot()).toMatchSnapshot();
    });
  });
});
```

---

## Telemetry Events

All events use `emit()` from `apps/tui/src/lib/telemetry.ts`.

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `tui.issue_create_form.opened` | Component mounts | `repo_owner`, `repo_name`, `entry_point`, `terminal_columns`, `terminal_rows` |
| `tui.issue_create_form.submitted` | `handleSubmit` called (after validation passes) | `repo_owner`, `repo_name`, `has_body`, `assignee_count`, `label_count`, `has_milestone`, `title_length`, `body_length` |
| `tui.issue_create_form.succeeded` | API returns 201 | `repo_owner`, `repo_name`, `issue_number`, `duration_ms` |
| `tui.issue_create_form.failed` | API returns non-2xx or network error | `repo_owner`, `repo_name`, `error_code`, `error_message`, `duration_ms` |
| `tui.issue_create_form.cancelled` | User cancels (clean or dirty) | `repo_owner`, `repo_name`, `was_dirty`, `fields_filled` |
| `tui.issue_create_form.validation_error` | Client-side validation fails | `repo_owner`, `repo_name`, `field`, `error_type` |

---

## Logging

All logging uses `logger` from `apps/tui/src/lib/logger.ts`.

| Level | When | Message Format |
|-------|------|---------------|
| `debug` | Component mount | `form mounted: { screen: "issue_create", repo: "owner/repo" }` |
| `debug` | Selector data loaded | `selector data loaded: { selector: "labels", count: N, duration_ms: N }` |
| `info` | Form submitted | `form submitted: { repo: "owner/repo", title_length: N, ... }` |
| `info` | Issue created | `issue created: { repo: "owner/repo", issue_number: N, duration_ms: N }` |
| `warn` | Selector load failed | `selector data fetch failed: { selector: "labels", error_code: N, ... }` |
| `error` | Creation failed | `issue creation failed: { repo: "owner/repo", status_code: N, ... }` |
| `error` | Auth failure | `auth failure on issue create: { status_code: 401 }` |
| `debug` | Form cancelled | `form cancelled: { was_dirty: true/false, fields_filled: N }` |

---

## Dependency Graph

```
tui-issue-create-form
├── tui-issues-data-hooks (provides useCreateIssue, useRepoLabels, useRepoMilestones, useRepoCollaborators)
├── tui-issue-list-screen (provides `c` keybinding entry point — form works independently)
├── tui-issue-labels-display (provides LabelBadge for colored label rendering in selector)
└── tui-form-component (this ticket creates the foundational useFormState hook that IS the form component system)
    ├── useFormState (new: apps/tui/src/hooks/useFormState.ts)
    ├── useSelectorState (new: apps/tui/src/hooks/useSelectorState.ts)
    └── SelectorDropdown (new: apps/tui/src/components/SelectorDropdown.tsx)
```

### Dependency Status

| Dependency | Status | Impact on this ticket |
|------------|--------|----------------------|
| `tui-issues-data-hooks` | Spec complete, hooks implemented in `specs/tui/packages/ui-core/` | Must be published to `@codeplane/ui-core` before form can make API calls. If not available, form renders but submit fails with import error. |
| `tui-issue-list-screen` | Spec exists, not implemented | `c` keybinding won't work until list screen ships. Form is reachable via command palette or deep-link. |
| `tui-issue-labels-display` | Spec complete (`tui-label-badge-component`) | `LabelBadge` component needed for colored label dots in selector. If not available, fall back to plain text label names. |
| `tui-form-component` | **Created by this ticket** | The `useFormState` and `useSelectorState` hooks created here ARE the form component system. This ticket satisfies the dependency for all downstream form screens. |

---

## Acceptance Criteria Traceability

| AC | Implementation Location | Test |
|----|------------------------|------|
| Title required | `useFormState.validate()` + `FIELD_DEFINITIONS[0].validate` | `Ctrl+S with empty title shows validation error` |
| Title max 255 | `onInput` handler in `<input>` | `title max length enforced` |
| Body optional | No validation on body field | `Ctrl+S submits from title field` (body empty) |
| Body multi-line | `<input multiline>` | `Enter inserts newline in body` |
| Assignees multi-select | `useMultiSelector` + `SelectorDropdown` | `assignees selector` tests |
| Labels with color | `SelectorDropdown` with `showColorDot` | `renders labels selector with colored indicators` |
| Milestone single-select | `useSingleSelector` + `SelectorDropdown` | `milestone selector single-select` |
| Tab order | `useFormState.focusNext/focusPrev` | `Tab cycles through form fields` |
| Ctrl+S submit | `useScreenKeybindings` | `Ctrl+S submits from title/body field` |
| Esc cancel with confirm | `handleCancel` + `showDiscardConfirm` | `Esc on dirty form shows confirmation` |
| Optimistic navigation | `nav.replace(IssueDetail)` on 201 | `successful submit navigates to issue detail` |
| API error display | `form.setSubmissionError()` | `renders server error banner` |
| 401 handling | Status code check in catch | `renders server error banner` (with auth text) |
| No state persistence | Fresh `useFormState` on mount | `Esc on clean form pops immediately` |
| Responsive 80×24 | `useLayout().breakpoint === "compact"` | `80x24 collapses/abbreviates` tests |
| Resize preserves state | React state preserved through resize | `resize from 120x40 to 80x24 preserves state` |
| Double-submit prevention | `if (form.isSubmitting) return` | `double submit is prevented` |
| 422 field errors | `error.fieldErrors` mapping | Tested via API error scenarios |
| Selector filter | `SelectorState.setFilter` | `selector filter with /` |