# Engineering Specification: TUI Repository Settings Tab View

**Ticket:** `tui-repo-settings-view`
**Title:** Repository settings tab view with admin configuration
**Status:** Not started
**Dependencies:** `tui-repo-screen-scaffold`, `tui-repo-data-hooks`, `tui-sync-toast-flash-system`

---

## Overview

This specification describes the implementation of Tab 6 (Settings) within the repository overview screen. The settings tab provides a vertically scrollable, form-like layout where administrators can view and edit repository configuration — name, description, default bookmark, topics, visibility, archive status, ownership transfer, and deletion.

The implementation integrates with the existing `RepoOverviewScreen` scaffold (from `tui-repo-screen-scaffold`), the TUI data hooks layer (from `tui-repo-data-hooks`), and the toast/flash system (from `tui-sync-toast-flash-system`) for transient status messages.

---

## Implementation Plan

### Step 1: Define Settings Tab Types and Constants

**File:** `apps/tui/src/screens/Repository/tabs/Settings/types.ts`

Define the types that govern the settings view's internal state machine.

```typescript
export type SettingsFieldId =
  | "name"
  | "description"
  | "default_bookmark"
  | "topics"
  | "visibility"
  | "archive"
  | "transfer"
  | "delete";

export type SettingsSectionId = "general" | "visibility" | "archive" | "danger";

export interface SettingsField {
  id: SettingsFieldId;
  section: SettingsSectionId;
  label: string;
  shortLabel: string;
  editable: boolean;
  requiresAdmin: boolean;
  requiresOwner: boolean;
  inputType: "text" | "textarea" | "action" | "toggle";
}

export type InteractionMode =
  | { type: "navigate" }
  | { type: "edit"; field: SettingsFieldId; originalValue: string }
  | { type: "confirm"; action: "visibility" | "archive" | "unarchive" }
  | { type: "transfer"; inputValue: string; error: string | null }
  | { type: "delete"; inputValue: string; error: string | null };

export interface RepoPermissions {
  isAdmin: boolean;
  isOwner: boolean;
}

export interface ValidationResult {
  valid: boolean;
  error: string | null;
}
```

**File:** `apps/tui/src/screens/Repository/tabs/Settings/constants.ts`

```typescript
import type { SettingsField } from "./types.js";

export const SETTINGS_FIELDS: readonly SettingsField[] = [
  { id: "name", section: "general", label: "Name", shortLabel: "Name", editable: true, requiresAdmin: true, requiresOwner: false, inputType: "text" },
  { id: "description", section: "general", label: "Description", shortLabel: "Desc", editable: true, requiresAdmin: true, requiresOwner: false, inputType: "textarea" },
  { id: "default_bookmark", section: "general", label: "Default bookmark", shortLabel: "Bkmk", editable: true, requiresAdmin: true, requiresOwner: false, inputType: "text" },
  { id: "topics", section: "general", label: "Topics", shortLabel: "Topics", editable: true, requiresAdmin: true, requiresOwner: false, inputType: "text" },
  { id: "visibility", section: "visibility", label: "Visibility", shortLabel: "Vis", editable: false, requiresAdmin: true, requiresOwner: false, inputType: "toggle" },
  { id: "archive", section: "archive", label: "Archive status", shortLabel: "Arch", editable: false, requiresAdmin: true, requiresOwner: false, inputType: "action" },
  { id: "transfer", section: "danger", label: "Transfer ownership", shortLabel: "Transfer", editable: false, requiresAdmin: false, requiresOwner: true, inputType: "action" },
  { id: "delete", section: "danger", label: "Delete repository", shortLabel: "Delete", editable: false, requiresAdmin: false, requiresOwner: true, inputType: "action" },
] as const;

export const REPO_NAME_REGEX = /^[a-zA-Z0-9._-]+$/;
export const REPO_NAME_MIN = 1;
export const REPO_NAME_MAX = 100;
export const DESCRIPTION_MAX = 1024;
export const DEFAULT_BOOKMARK_REGEX = /^[a-zA-Z0-9._\/-]+$/;
export const DEFAULT_BOOKMARK_MAX = 200;
export const TOPIC_REGEX = /^[a-z0-9-]+$/;
export const TOPIC_MIN_LENGTH = 1;
export const TOPIC_MAX_LENGTH = 35;
export const TOPICS_MAX_COUNT = 20;
export const TRANSFER_OWNER_REGEX = /^[a-zA-Z0-9_-]+$/;
export const TRANSFER_OWNER_MAX = 40;
export const DELETE_CONFIRM_MAX = 100;

export const LABEL_WIDTH_MINIMUM = 16;
export const LABEL_WIDTH_STANDARD = 20;
export const LABEL_WIDTH_LARGE = 25;

export const SECTION_HEADERS: Record<string, { full: string; short: string }> = {
  general:    { full: "General", short: "General" },
  visibility: { full: "Visibility", short: "Vis" },
  archive:    { full: "Archive", short: "Arch" },
  danger:     { full: "Danger Zone", short: "Danger" },
};

export const PERMISSION_DENIED_FLASH_MS = 2000;
export const STATUS_BAR_ERROR_MS = 5000;
```

### Step 2: Implement Validation Utilities

**File:** `apps/tui/src/screens/Repository/tabs/Settings/validation.ts`

Pure functions — no React dependencies. Testable in isolation.

```typescript
import type { ValidationResult } from "./types.js";
import {
  REPO_NAME_REGEX, REPO_NAME_MIN, REPO_NAME_MAX,
  DESCRIPTION_MAX,
  DEFAULT_BOOKMARK_REGEX, DEFAULT_BOOKMARK_MAX,
  TOPIC_REGEX, TOPIC_MIN_LENGTH, TOPIC_MAX_LENGTH, TOPICS_MAX_COUNT,
  TRANSFER_OWNER_REGEX, TRANSFER_OWNER_MAX,
} from "./constants.js";

export function validateRepoName(value: string): ValidationResult {
  if (value.length < REPO_NAME_MIN) return { valid: false, error: "Name cannot be empty" };
  if (value.length > REPO_NAME_MAX) return { valid: false, error: `Name must be ≤${REPO_NAME_MAX} characters` };
  if (value.startsWith(".")) return { valid: false, error: "Name cannot start with '.'" };
  if (value.endsWith(".git")) return { valid: false, error: "Name cannot end with '.git'" };
  if (!REPO_NAME_REGEX.test(value)) return { valid: false, error: "Only alphanumeric, hyphens, underscores, dots" };
  return { valid: true, error: null };
}

export function validateDescription(value: string): ValidationResult {
  if (value.length > DESCRIPTION_MAX) return { valid: false, error: `Max ${DESCRIPTION_MAX} characters` };
  return { valid: true, error: null };
}

export function validateDefaultBookmark(value: string): ValidationResult {
  if (value.length === 0) return { valid: false, error: "Bookmark cannot be empty" };
  if (value.length > DEFAULT_BOOKMARK_MAX) return { valid: false, error: `Max ${DEFAULT_BOOKMARK_MAX} characters` };
  if (!DEFAULT_BOOKMARK_REGEX.test(value)) return { valid: false, error: "Only alphanumeric, hyphens, underscores, dots, slashes" };
  return { valid: true, error: null };
}

export function validateTopics(rawValue: string): ValidationResult {
  const topics = parseTopics(rawValue);
  if (topics.length > TOPICS_MAX_COUNT) return { valid: false, error: `Max ${TOPICS_MAX_COUNT} topics` };
  for (const topic of topics) {
    if (topic.length < TOPIC_MIN_LENGTH) return { valid: false, error: "Topic cannot be empty" };
    if (topic.length > TOPIC_MAX_LENGTH) return { valid: false, error: `Topic '${topic}' exceeds ${TOPIC_MAX_LENGTH} chars` };
    if (!TOPIC_REGEX.test(topic)) return { valid: false, error: `Topic '${topic}': only lowercase alphanumeric/hyphens` };
  }
  return { valid: true, error: null };
}

export function validateTransferOwner(value: string): ValidationResult {
  if (value.length === 0) return { valid: false, error: "Username required" };
  if (value.length > TRANSFER_OWNER_MAX) return { valid: false, error: `Max ${TRANSFER_OWNER_MAX} characters` };
  if (!TRANSFER_OWNER_REGEX.test(value)) return { valid: false, error: "Only alphanumeric, hyphens, underscores" };
  return { valid: true, error: null };
}

export function parseTopics(rawValue: string): string[] {
  return rawValue.split(",").map(t => t.trim()).filter(t => t.length > 0);
}
```

### Step 3: Implement Repository Settings Data Hooks

**File:** `apps/tui/src/hooks/data/useRepoSettings.ts`

TUI adapter hooks wrapping `@codeplane/ui-core` API client for each mutation endpoint.

```typescript
import { useCallback, useState } from "react";
import { useAPIClient } from "../useAPIClient.js";
import { useOptimisticMutation } from "../useOptimisticMutation.js";

interface UpdateRepoArgs {
  name?: string;
  description?: string;
  private?: boolean;
  default_bookmark?: string;
}

function buildRepoPath(owner: string, repo: string): string {
  return `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

async function throwOnError(response: Response): Promise<void> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: "Unknown error" }));
    const err = new Error(body.message ?? `HTTP ${response.status}`);
    (err as any).status = response.status;
    throw err;
  }
}

export function useUpdateRepo(
  owner: string,
  repo: string,
  callbacks: {
    onOptimistic: (args: UpdateRepoArgs) => void;
    onRevert: (args: UpdateRepoArgs) => void;
    onSuccess?: (args: UpdateRepoArgs) => void;
  }
) {
  const apiClient = useAPIClient();
  return useOptimisticMutation<UpdateRepoArgs>({
    id: `update-repo-${owner}-${repo}`,
    entityType: "repository",
    action: "update_settings",
    mutate: async (args) => {
      const response = await apiClient.request(buildRepoPath(owner, repo), { method: "PATCH", body: args });
      await throwOnError(response);
    },
    onOptimistic: callbacks.onOptimistic,
    onRevert: callbacks.onRevert,
    onSuccess: callbacks.onSuccess,
  });
}

export function useReplaceRepoTopics(
  owner: string,
  repo: string,
  callbacks: {
    onOptimistic: (args: { topics: string[] }) => void;
    onRevert: (args: { topics: string[] }) => void;
    onSuccess?: (args: { topics: string[] }) => void;
  }
) {
  const apiClient = useAPIClient();
  return useOptimisticMutation<{ topics: string[] }>({
    id: `replace-topics-${owner}-${repo}`,
    entityType: "repository",
    action: "update_topics",
    mutate: async (args) => {
      const response = await apiClient.request(`${buildRepoPath(owner, repo)}/topics`, { method: "PUT", body: args });
      await throwOnError(response);
    },
    onOptimistic: callbacks.onOptimistic,
    onRevert: callbacks.onRevert,
    onSuccess: callbacks.onSuccess,
  });
}

function useSimpleMutation<TArgs = void>(owner: string, repo: string, path: string, method: string) {
  const apiClient = useAPIClient();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const execute = useCallback(async (args?: TArgs) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient.request(
        `${buildRepoPath(owner, repo)}${path}`,
        { method, body: args ?? undefined }
      );
      await throwOnError(response);
    } catch (err) {
      const normalized = err instanceof Error ? err : new Error(String(err));
      setError(normalized);
      throw normalized;
    } finally {
      setIsLoading(false);
    }
  }, [apiClient, owner, repo, path, method]);

  return { execute, isLoading, error };
}

export function useArchiveRepo(owner: string, repo: string) {
  return useSimpleMutation(owner, repo, "/archive", "POST");
}

export function useUnarchiveRepo(owner: string, repo: string) {
  return useSimpleMutation(owner, repo, "/unarchive", "POST");
}

export function useTransferRepo(owner: string, repo: string) {
  return useSimpleMutation<string>(owner, repo, "/transfer", "POST");
}

export function useDeleteRepo(owner: string, repo: string) {
  return useSimpleMutation(owner, repo, "", "DELETE");
}
```

Note: `useTransferRepo.execute` wraps the new owner string into `{ new_owner: value }` body. The `useSimpleMutation` generic handles this by accepting the body argument directly. The transfer hook's `execute` call should pass `{ new_owner: ownerValue }` from the component layer.

### Step 4: Implement the Settings Tab State Hook

**File:** `apps/tui/src/screens/Repository/tabs/Settings/useSettingsState.ts`

Manages the entire settings tab state machine: focused field index, interaction mode, local field values, permissions.

```typescript
import { useState, useCallback, useMemo, useRef } from "react";
import type { InteractionMode, RepoPermissions, SettingsFieldId, SettingsField } from "./types.js";
import { SETTINGS_FIELDS, PERMISSION_DENIED_FLASH_MS } from "./constants.js";
import { validateRepoName, validateDescription, validateDefaultBookmark, validateTopics } from "./validation.js";

interface Repo {
  name: string;
  description: string;
  default_bookmark: string;
  topics: string[];
  is_private: boolean;
  is_archived: boolean;
  permissions?: { admin?: boolean; owner?: boolean };
}

export function useSettingsState(options: { repo: Repo | null; isLoading: boolean }) {
  const { repo, isLoading } = options;

  const [focusedIndex, setFocusedIndex] = useState(0);
  const [mode, setMode] = useState<InteractionMode>({ type: "navigate" });
  const [editValue, setEditValue] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const permissions: RepoPermissions = useMemo(() => ({
    isAdmin: repo?.permissions?.admin ?? false,
    isOwner: repo?.permissions?.owner ?? false,
  }), [repo?.permissions]);

  // Filter Danger Zone for non-admin users
  const visibleFields = useMemo(() => {
    if (!permissions.isAdmin) {
      return SETTINGS_FIELDS.filter(f => f.section !== "danger");
    }
    return [...SETTINGS_FIELDS];
  }, [permissions.isAdmin]);

  const focusedField = visibleFields[focusedIndex] ?? null;

  // Navigation
  const moveDown = useCallback(() => {
    if (mode.type !== "navigate") return;
    setFocusedIndex(i => Math.min(i + 1, visibleFields.length - 1));
  }, [mode, visibleFields.length]);

  const moveUp = useCallback(() => {
    if (mode.type !== "navigate") return;
    setFocusedIndex(i => Math.max(i - 1, 0));
  }, [mode]);

  const jumpToTop = useCallback(() => {
    if (mode.type !== "navigate") return;
    setFocusedIndex(0);
  }, [mode]);

  const jumpToBottom = useCallback(() => {
    if (mode.type !== "navigate") return;
    setFocusedIndex(visibleFields.length - 1);
  }, [mode, visibleFields.length]);

  const pageDown = useCallback((viewportHeight: number) => {
    if (mode.type !== "navigate") return;
    const step = Math.max(1, Math.floor(viewportHeight / 2));
    setFocusedIndex(i => Math.min(i + step, visibleFields.length - 1));
  }, [mode, visibleFields.length]);

  const pageUp = useCallback((viewportHeight: number) => {
    if (mode.type !== "navigate") return;
    const step = Math.max(1, Math.floor(viewportHeight / 2));
    setFocusedIndex(i => Math.max(i - step, 0));
  }, [mode]);

  // Flash message
  const flashStatus = useCallback((message: string, durationMs = PERMISSION_DENIED_FLASH_MS) => {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    setStatusMessage(message);
    statusTimerRef.current = setTimeout(() => setStatusMessage(null), durationMs);
  }, []);

  // Get current field value from repo
  const getFieldValue = useCallback((fieldId: SettingsFieldId): string => {
    if (!repo) return "";
    switch (fieldId) {
      case "name": return repo.name;
      case "description": return repo.description ?? "";
      case "default_bookmark": return repo.default_bookmark ?? "";
      case "topics": return (repo.topics ?? []).join(", ");
      default: return "";
    }
  }, [repo]);

  // Activate focused field
  const activateField = useCallback(() => {
    if (!focusedField || !repo || isLoading) return;
    const field = focusedField;

    if (field.requiresOwner && !permissions.isOwner) {
      flashStatus("Owner access required");
      return;
    }
    if (field.requiresAdmin && !permissions.isAdmin) {
      flashStatus("Admin access required");
      return;
    }
    if (repo.is_archived && field.section === "general") {
      flashStatus("Unarchive to edit");
      return;
    }

    switch (field.inputType) {
      case "text":
      case "textarea": {
        const value = getFieldValue(field.id);
        setEditValue(value);
        setEditError(null);
        setMode({ type: "edit", field: field.id, originalValue: value });
        break;
      }
      case "toggle":
        setMode({ type: "confirm", action: "visibility" });
        break;
      case "action":
        if (field.id === "archive") setMode({ type: "confirm", action: repo.is_archived ? "unarchive" : "archive" });
        else if (field.id === "transfer") setMode({ type: "transfer", inputValue: "", error: null });
        else if (field.id === "delete") setMode({ type: "delete", inputValue: "", error: null });
        break;
    }
  }, [focusedField, repo, isLoading, permissions, getFieldValue, flashStatus]);

  // Cancel
  const cancelMode = useCallback(() => {
    setMode({ type: "navigate" });
    setEditValue("");
    setEditError(null);
  }, []);

  // Edit value change with live validation
  const updateEditValue = useCallback((value: string) => {
    setEditValue(value);
    if (mode.type === "edit") {
      const validator = getValidator(mode.field);
      if (validator) setEditError(validator(value).error);
    }
  }, [mode]);

  return {
    focusedIndex, focusedField, visibleFields, mode, editValue, editError,
    statusMessage, permissions,
    moveDown, moveUp, jumpToTop, jumpToBottom, pageDown, pageUp,
    activateField, cancelMode, updateEditValue, setEditValue, setEditError,
    setMode, flashStatus, getFieldValue,
  };
}

function getValidator(fieldId: SettingsFieldId) {
  switch (fieldId) {
    case "name": return validateRepoName;
    case "description": return validateDescription;
    case "default_bookmark": return validateDefaultBookmark;
    case "topics": return validateTopics;
    default: return null;
  }
}
```

### Step 5: Implement Section and Field Row Components

**File:** `apps/tui/src/screens/Repository/tabs/Settings/SettingsSection.tsx`

Reusable section header. Danger Zone gets a red `<box>` border; other sections get a `──` text separator.

```typescript
import React from "react";
import { useTheme } from "../../../../hooks/useTheme.js";
import { useLayout } from "../../../../hooks/useLayout.js";
import { useResponsiveValue } from "../../../../hooks/useResponsiveValue.js";
import { SECTION_HEADERS } from "./constants.js";
import type { SettingsSectionId } from "./types.js";

interface Props { sectionId: SettingsSectionId; children: React.ReactNode }

export function SettingsSection({ sectionId, children }: Props) {
  const theme = useTheme();
  const layout = useLayout();
  const header = SECTION_HEADERS[sectionId];
  const label = useResponsiveValue({ minimum: header.short, standard: header.full, large: header.full });
  const isDanger = sectionId === "danger";
  const borderColor = isDanger ? theme.error : theme.border;
  const headerColor = isDanger ? theme.error : theme.muted;

  if (isDanger) {
    return (
      <box width="100%" border={true} borderColor={borderColor} flexDirection="column" gap={1} padding={1}>
        <text fg={headerColor} attributes={1}>{label}</text>
        {children}
      </box>
    );
  }

  const separatorLen = Math.max(0, (layout.width ?? 80) - label.length - 6);
  return (
    <box width="100%" flexDirection="column" gap={1}>
      <text fg={headerColor} attributes={1}>── {label} {"─".repeat(separatorLen)}</text>
      {children}
    </box>
  );
}
```

**File:** `apps/tui/src/screens/Repository/tabs/Settings/SettingsFieldRow.tsx`

Individual field row with responsive label/value layout. Focus uses INVERSE attribute. Shows placeholder text for empty values.

```typescript
import React from "react";
import { useTheme } from "../../../../hooks/useTheme.js";
import { useLayout } from "../../../../hooks/useLayout.js";
import { useResponsiveValue } from "../../../../hooks/useResponsiveValue.js";
import { LABEL_WIDTH_MINIMUM, LABEL_WIDTH_STANDARD, LABEL_WIDTH_LARGE } from "./constants.js";
import type { SettingsField } from "./types.js";

interface Props {
  field: SettingsField;
  value: string;
  focused: boolean;
  isAdmin: boolean;
  isEditing: boolean;
  children?: React.ReactNode;
}

export function SettingsFieldRow({ field, value, focused, isAdmin, isEditing, children }: Props) {
  const theme = useTheme();
  const layout = useLayout();
  const labelWidth = useResponsiveValue({ minimum: LABEL_WIDTH_MINIMUM, standard: LABEL_WIDTH_STANDARD, large: LABEL_WIDTH_LARGE });
  const isMinimum = layout.breakpoint === "minimum";
  const label = isMinimum ? field.shortLabel : field.label;
  const focusAttributes = focused ? 8 /* INVERSE */ : 0;
  const displayValue = value || getPlaceholder(field.id);
  const valueColor = value ? undefined : theme.muted;
  const maxValueWidth = Math.max(10, (layout.width ?? 80) - labelWidth - 4);
  const truncatedValue = displayValue.length > maxValueWidth ? displayValue.slice(0, maxValueWidth - 1) + "…" : displayValue;

  if (isMinimum) {
    return (
      <box width="100%" flexDirection="column">
        <text fg={theme.muted} attributes={1}>{label}</text>
        <box>{isEditing && children ? children : <text fg={valueColor} attributes={focusAttributes}>{truncatedValue}</text>}</box>
      </box>
    );
  }

  return (
    <box width="100%" flexDirection="row">
      <box width={labelWidth}><text fg={theme.muted} attributes={focused ? 1 : 0}>{label}</text></box>
      <box flexGrow={1}>{isEditing && children ? children : <text fg={valueColor} attributes={focusAttributes}>{truncatedValue}</text>}</box>
    </box>
  );
}

function getPlaceholder(fieldId: string): string {
  switch (fieldId) {
    case "description": return "No description";
    case "topics": return "No topics";
    case "default_bookmark": return "main";
    default: return "";
  }
}
```

### Step 6: Implement Overlay Prompt Components

**File:** `apps/tui/src/screens/Repository/tabs/Settings/ConfirmPrompt.tsx`

```typescript
import React from "react";
import { useTheme } from "../../../../hooks/useTheme.js";
import { useLayout } from "../../../../hooks/useLayout.js";

export function ConfirmPrompt({ message, warningLevel }: { message: string; warningLevel: "warning" | "error" }) {
  const theme = useTheme();
  const layout = useLayout();
  const width = layout.breakpoint === "minimum" ? "90%" : "60%";
  const borderColor = warningLevel === "error" ? theme.error : theme.warning;
  return (
    <box position="absolute" width={width} border={true} borderColor={borderColor} padding={1} flexDirection="column" gap={1}>
      <text fg={borderColor} attributes={1}>{message}</text>
      <text fg={theme.muted}>y: confirm  n: cancel  Esc: cancel</text>
    </box>
  );
}
```

**File:** `apps/tui/src/screens/Repository/tabs/Settings/TransferPrompt.tsx`

```typescript
import React from "react";
import { useTheme } from "../../../../hooks/useTheme.js";
import { useLayout } from "../../../../hooks/useLayout.js";

export function TransferPrompt({ inputValue, error, isLoading }: { inputValue: string; error: string | null; isLoading: boolean }) {
  const theme = useTheme();
  const layout = useLayout();
  const width = layout.breakpoint === "minimum" ? "90%" : "60%";
  return (
    <box position="absolute" width={width} border={true} borderColor={theme.warning} padding={1} flexDirection="column" gap={1}>
      <text fg={theme.warning} attributes={1}>Transfer Ownership</text>
      <text fg={theme.muted}>Enter the new owner's username:</text>
      <input width={40} value={inputValue} placeholder="username" maxLength={40} />
      {error && <text fg={theme.error}>{error}</text>}
      <text fg={theme.muted}>{isLoading ? "Transferring…" : "Ctrl+S: transfer  Esc: cancel"}</text>
    </box>
  );
}
```

**File:** `apps/tui/src/screens/Repository/tabs/Settings/DeletePrompt.tsx`

```typescript
import React from "react";
import { useTheme } from "../../../../hooks/useTheme.js";
import { useLayout } from "../../../../hooks/useLayout.js";

export function DeletePrompt({ repoName, inputValue, error, isLoading }: { repoName: string; inputValue: string; error: string | null; isLoading: boolean }) {
  const theme = useTheme();
  const layout = useLayout();
  const width = layout.breakpoint === "minimum" ? "90%" : "60%";
  const nameMatches = inputValue === repoName;
  return (
    <box position="absolute" width={width} border={true} borderColor={theme.error} padding={1} flexDirection="column" gap={1}>
      <text fg={theme.error} attributes={1}>Delete Repository</text>
      <text>Type the repository name to confirm deletion:</text>
      <text fg={theme.muted} attributes={1}>{repoName}</text>
      <input width={Math.min(100, (layout.width ?? 80) - 10)} value={inputValue} placeholder={repoName} maxLength={100} />
      {!nameMatches && inputValue.length > 0 && <text fg={theme.error}>Name does not match</text>}
      {error && <text fg={theme.error}>{error}</text>}
      <text fg={theme.muted}>
        {isLoading ? "Deleting…" : nameMatches ? "Ctrl+S: delete permanently  Esc: cancel" : "Type the name above to enable deletion"}
      </text>
    </box>
  );
}
```

### Step 7: Implement the Main Settings Tab Component

**File:** `apps/tui/src/screens/Repository/tabs/Settings/SettingsTab.tsx`

Composes sections, fields, overlays, keybinding registration, and mutation dispatch.

```typescript
import React, { useCallback, useEffect, useState } from "react";
import { useTheme } from "../../../../hooks/useTheme.js";
import { useLayout } from "../../../../hooks/useLayout.js";
import { useScreenKeybindings } from "../../../../hooks/useScreenKeybindings.js";
import { useNavigation } from "../../../../hooks/useNavigation.js";
import { useRepoContext } from "../../RepoContext.js";
import { useUpdateRepo, useReplaceRepoTopics, useArchiveRepo, useUnarchiveRepo, useTransferRepo, useDeleteRepo } from "../../../../hooks/data/useRepoSettings.js";
import { useSettingsState } from "./useSettingsState.js";
import { SettingsSection } from "./SettingsSection.js";
import { SettingsFieldRow } from "./SettingsFieldRow.js";
import { ConfirmPrompt } from "./ConfirmPrompt.js";
import { TransferPrompt } from "./TransferPrompt.js";
import { DeletePrompt } from "./DeletePrompt.js";
import { parseTopics, validateRepoName, validateDescription, validateDefaultBookmark, validateTopics, validateTransferOwner } from "./validation.js";
import type { SettingsSectionId } from "./types.js";
import { logger } from "../../../../lib/logger.js";

export function SettingsTab() {
  const theme = useTheme();
  const layout = useLayout();
  const nav = useNavigation();
  const { repo, owner, repoName, refetch } = useRepoContext();

  // Local state for optimistic display
  const [localRepo, setLocalRepo] = useState(repo);
  useEffect(() => { setLocalRepo(repo); }, [repo]);

  const state = useSettingsState({ repo: localRepo, isLoading: !localRepo });

  // Mutation hooks
  const updateRepo = useUpdateRepo(owner, repoName, {
    onOptimistic: (args) => setLocalRepo(prev => prev ? { ...prev, ...args } : prev),
    onRevert: () => setLocalRepo(repo),
    onSuccess: (args) => {
      if (args.name && args.name !== repoName) {
        nav.replace("RepoOverview", { owner, repo: args.name });
      }
      refetch();
    },
  });

  const replaceTopics = useReplaceRepoTopics(owner, repoName, {
    onOptimistic: (args) => setLocalRepo(prev => prev ? { ...prev, topics: args.topics } : prev),
    onRevert: () => setLocalRepo(repo),
    onSuccess: () => refetch(),
  });

  const archiveRepo = useArchiveRepo(owner, repoName);
  const unarchiveRepo = useUnarchiveRepo(owner, repoName);
  const transferRepo = useTransferRepo(owner, repoName);
  const deleteRepo = useDeleteRepo(owner, repoName);

  // Save dispatch
  const handleSave = useCallback(() => {
    if (state.mode.type === "edit") {
      const { field, originalValue } = state.mode;
      const value = state.editValue;
      if (value === originalValue) { state.cancelMode(); return; }

      const validators: Record<string, (v: string) => { valid: boolean; error: string | null }> = {
        name: validateRepoName, description: validateDescription,
        default_bookmark: validateDefaultBookmark, topics: validateTopics,
      };
      const validator = validators[field];
      if (validator) {
        const result = validator(value);
        if (!result.valid) { state.setEditError(result.error); return; }
      }

      if (field === "topics") {
        replaceTopics.execute({ topics: parseTopics(value) });
      } else {
        const body: Record<string, string> = {};
        body[field] = value;
        updateRepo.execute(body as any);
      }
      logger.info("Field updated", { repo_full_name: `${owner}/${repoName}`, field_name: field });
      state.cancelMode();
    } else if (state.mode.type === "transfer") {
      const ownerValue = state.mode.inputValue;
      const v = validateTransferOwner(ownerValue);
      if (!v.valid) { state.setMode({ ...state.mode, error: v.error }); return; }
      transferRepo.execute({ new_owner: ownerValue } as any)
        .then(() => { state.cancelMode(); nav.push("RepoOverview", { owner: ownerValue, repo: repoName }); })
        .catch((err: any) => {
          const msg = err.status === 403 ? "Owner access required." : err.status === 404 ? `User '${ownerValue}' not found.` : err.status === 400 ? "Cannot transfer to yourself." : err.message;
          state.setMode({ ...state.mode, error: msg });
        });
    } else if (state.mode.type === "delete") {
      if (state.mode.inputValue !== repoName) { state.setMode({ ...state.mode, error: "Name does not match" }); return; }
      deleteRepo.execute()
        .then(() => { state.cancelMode(); nav.reset("RepoList", {}); })
        .catch((err: any) => {
          const msg = err.status === 403 ? "Owner access required." : err.message;
          state.setMode({ ...state.mode, error: msg });
        });
    }
  }, [state, updateRepo, replaceTopics, transferRepo, deleteRepo, nav, owner, repoName]);

  // Confirm dispatch (y/n)
  const handleConfirm = useCallback(() => {
    if (state.mode.type !== "confirm") return;
    const { action } = state.mode;
    if (action === "visibility") {
      updateRepo.execute({ private: !(localRepo?.is_private ?? false) } as any);
      state.cancelMode();
    } else if (action === "archive") {
      archiveRepo.execute()
        .then(() => { setLocalRepo(prev => prev ? { ...prev, is_archived: true } : prev); refetch(); state.cancelMode(); })
        .catch((err: Error) => { state.flashStatus(err.message); state.cancelMode(); });
    } else if (action === "unarchive") {
      unarchiveRepo.execute()
        .then(() => { setLocalRepo(prev => prev ? { ...prev, is_archived: false } : prev); refetch(); state.cancelMode(); })
        .catch((err: Error) => { state.flashStatus(err.message); state.cancelMode(); });
    }
  }, [state, localRepo, updateRepo, archiveRepo, unarchiveRepo, refetch]);

  // Keybindings
  const isNav = state.mode.type === "navigate";
  const isConfirm = state.mode.type === "confirm";
  const isEdit = state.mode.type === "edit";
  const isPrompt = state.mode.type === "transfer" || state.mode.type === "delete";

  useScreenKeybindings([
    { key: "j",      description: "Down",      group: "Navigation", handler: state.moveDown,    when: () => isNav },
    { key: "Down",   description: "Down",      group: "Navigation", handler: state.moveDown,    when: () => isNav },
    { key: "k",      description: "Up",        group: "Navigation", handler: state.moveUp,      when: () => isNav },
    { key: "Up",     description: "Up",        group: "Navigation", handler: state.moveUp,      when: () => isNav },
    { key: "G",      description: "Bottom",    group: "Navigation", handler: state.jumpToBottom, when: () => isNav },
    { key: "ctrl+d", description: "Page down", group: "Navigation", handler: () => state.pageDown(layout.contentHeight), when: () => isNav },
    { key: "ctrl+u", description: "Page up",   group: "Navigation", handler: () => state.pageUp(layout.contentHeight),  when: () => isNav },
    { key: "Enter",  description: "Edit",      group: "Actions",    handler: state.activateField, when: () => isNav },
    { key: "ctrl+s", description: "Save",      group: "Actions",    handler: handleSave,          when: () => isEdit || isPrompt },
    { key: "Escape", description: "Cancel",    group: "Actions",    handler: state.cancelMode,    when: () => !isNav },
    { key: "y",      description: "Confirm",   group: "Actions",    handler: handleConfirm,       when: () => isConfirm },
    { key: "n",      description: "Cancel",    group: "Actions",    handler: state.cancelMode,    when: () => isConfirm },
    { key: "R",      description: "Refresh",   group: "Actions",    handler: () => refetch(),     when: () => isNav },
  ]);

  // Render
  if (!localRepo) {
    return <box flexGrow={1} justifyContent="center" alignItems="center"><text fg={theme.muted}>Loading…</text></box>;
  }

  const sections = groupBySection(state.visibleFields);

  return (
    <scrollbox width="100%" height="100%" scrollY={true}>
      <box flexDirection="column" gap={1} padding={1} width="100%">
        <box flexDirection="row" justifyContent="space-between" width="100%">
          <text attributes={1}>Settings</text>
          <text fg={theme.muted}>R refresh</text>
        </box>

        {state.statusMessage && <text fg={theme.warning}>{state.statusMessage}</text>}

        {sections.map(([sectionId, fields]) => (
          <SettingsSection key={sectionId} sectionId={sectionId as SettingsSectionId}>
            {fields.map((field: any) => {
              const fieldIndex = state.visibleFields.indexOf(field);
              const isFocused = fieldIndex === state.focusedIndex;
              const isEditingThis = state.mode.type === "edit" && state.mode.field === field.id;
              return (
                <SettingsFieldRow key={field.id} field={field} value={getDisplayValue(field.id, localRepo)} focused={isFocused} isAdmin={state.permissions.isAdmin} isEditing={isEditingThis}>
                  {isEditingThis && (
                    <box flexDirection="column">
                      {field.inputType === "textarea" ? (
                        <box flexDirection="column">
                          <input width={Math.min(70, (layout.width ?? 80) - 30)} value={state.editValue} maxLength={1024} />
                          <text fg={theme.muted}>{state.editValue.length}/1024  Ctrl+S: save  Esc: cancel</text>
                        </box>
                      ) : (
                        <box flexDirection="column">
                          <input width={Math.min(50, (layout.width ?? 80) - 30)} value={state.editValue} maxLength={field.id === "name" ? 100 : field.id === "default_bookmark" ? 200 : 1000} />
                          {state.editError && <text fg={theme.error}>{state.editError}</text>}
                          <text fg={theme.muted}>Enter/Ctrl+S: save  Esc: cancel</text>
                        </box>
                      )}
                    </box>
                  )}
                </SettingsFieldRow>
              );
            })}
          </SettingsSection>
        ))}

        {!state.permissions.isAdmin && <text fg={theme.muted}>Read-only — admin access required to edit</text>}
      </box>

      {state.mode.type === "confirm" && <ConfirmPrompt message={getConfirmMessage(state.mode.action, localRepo)} warningLevel="warning" />}
      {state.mode.type === "transfer" && <TransferPrompt inputValue={state.mode.inputValue} error={state.mode.error} isLoading={transferRepo.isLoading} />}
      {state.mode.type === "delete" && <DeletePrompt repoName={repoName} inputValue={state.mode.inputValue} error={state.mode.error} isLoading={deleteRepo.isLoading} />}
    </scrollbox>
  );
}

function getDisplayValue(fieldId: string, repo: any): string {
  switch (fieldId) {
    case "name": return repo.name ?? "";
    case "description": return repo.description ?? "";
    case "default_bookmark": return repo.default_bookmark ?? "";
    case "topics": return (repo.topics ?? []).join(", ");
    case "visibility": return repo.is_private ? "Private" : "Public";
    case "archive": return repo.is_archived ? "Archived" : "Active";
    case "transfer": return "Transfer ownership";
    case "delete": return "Delete this repository";
    default: return "";
  }
}

function getConfirmMessage(action: string, repo: any): string {
  switch (action) {
    case "visibility": return `Change visibility to ${repo.is_private ? "Public" : "Private"}? y/n`;
    case "archive": return "Archive this repository? y/n";
    case "unarchive": return "Unarchive this repository? y/n";
    default: return "Confirm? y/n";
  }
}

function groupBySection(fields: readonly any[]): [string, any[]][] {
  const groups = new Map<string, any[]>();
  for (const field of fields) {
    if (!groups.has(field.section)) groups.set(field.section, []);
    groups.get(field.section)!.push(field);
  }
  return Array.from(groups.entries());
}
```

### Step 8: Register Tab and Barrel Export

**File:** `apps/tui/src/screens/Repository/tabs/Settings/index.ts`

```typescript
export { SettingsTab } from "./SettingsTab.js";
```

**Modification:** `apps/tui/src/screens/Repository/tabs/index.ts`

Add `SettingsTab` to the tab content map. When `activeTab === 5` (0-indexed) or `tab.id === "settings"`, render `<SettingsTab />`.

### Step 9: Telemetry Integration

**File:** `apps/tui/src/screens/Repository/tabs/Settings/telemetry.ts`

```typescript
import { trackEvent } from "../../../../lib/telemetry.js";

export const trackSettingsView = (props: Record<string, unknown>) => trackEvent("tui.repo.settings.view", props);
export const trackEditStart = (repo: string, field: string, len: number) => trackEvent("tui.repo.settings.edit_start", { repo_full_name: repo, field_name: field, current_value_length: len });
export const trackEditSave = (repo: string, field: string, oldLen: number, newLen: number, ms: number) => trackEvent("tui.repo.settings.edit_save", { repo_full_name: repo, field_name: field, old_value_length: oldLen, new_value_length: newLen, save_time_ms: ms });
export const trackEditCancel = (repo: string, field: string, changed: boolean) => trackEvent("tui.repo.settings.edit_cancel", { repo_full_name: repo, field_name: field, had_changes: changed });
export const trackEditError = (repo: string, field: string, type: string, status: number) => trackEvent("tui.repo.settings.edit_error", { repo_full_name: repo, field_name: field, error_type: type, http_status: status });
export const trackPermissionDenied = (repo: string, action: string) => trackEvent("tui.repo.settings.permission_denied", { repo_full_name: repo, action });
export const trackRefresh = (repo: string, wasError: boolean) => trackEvent("tui.repo.settings.refresh", { repo_full_name: repo, was_error_state: wasError });
```

Telemetry calls are invoked inline in `SettingsTab.tsx` and `useSettingsState.ts` at each interaction point per the product spec event table.

---

## File Inventory

| File | Purpose | Status |
|------|---------|--------|
| `apps/tui/src/screens/Repository/tabs/Settings/types.ts` | Type definitions | New |
| `apps/tui/src/screens/Repository/tabs/Settings/constants.ts` | Field registry, validation rules, layout constants | New |
| `apps/tui/src/screens/Repository/tabs/Settings/validation.ts` | Pure validation functions | New |
| `apps/tui/src/screens/Repository/tabs/Settings/useSettingsState.ts` | State machine hook | New |
| `apps/tui/src/screens/Repository/tabs/Settings/SettingsSection.tsx` | Section header component | New |
| `apps/tui/src/screens/Repository/tabs/Settings/SettingsFieldRow.tsx` | Field row component | New |
| `apps/tui/src/screens/Repository/tabs/Settings/ConfirmPrompt.tsx` | y/n confirmation overlay | New |
| `apps/tui/src/screens/Repository/tabs/Settings/TransferPrompt.tsx` | Transfer ownership overlay | New |
| `apps/tui/src/screens/Repository/tabs/Settings/DeletePrompt.tsx` | Delete confirmation overlay | New |
| `apps/tui/src/screens/Repository/tabs/Settings/SettingsTab.tsx` | Main tab component | New |
| `apps/tui/src/screens/Repository/tabs/Settings/telemetry.ts` | Telemetry emitters | New |
| `apps/tui/src/screens/Repository/tabs/Settings/index.ts` | Barrel export | New |
| `apps/tui/src/hooks/data/useRepoSettings.ts` | TUI adapter hooks for repo mutations | New |
| `apps/tui/src/screens/Repository/tabs/index.ts` | Register SettingsTab in tab content map | Modified |
| `e2e/tui/repository.test.ts` | E2E tests for settings tab | Modified |

---

## Productionization Checklist

### Input Focus Management

OpenTUI `<input>` must receive focus programmatically when edit mode activates:

1. Use a React ref: `const inputRef = useRef<InputRenderable>(null)`
2. Call `inputRef.current?.focus()` inside a `useEffect` keyed on `mode.type === "edit"`
3. Wire `onInput` callback from `<input>` to `state.updateEditValue()`
4. Wire `onEnter` from `<input>` to `handleSave()` for single-line fields
5. If the React reconciler does not expose imperative `focus()`, render the input with initial focus via OpenTUI's focus management API

### Textarea for Description

OpenTUI `<textarea>` props for multi-line editing:
- `initialValue` / controlled `value`
- `onContentChange` → `state.updateEditValue()`
- `wrapMode="word"`
- Custom `keyBindings` to map `Ctrl+S` to submit, `Escape` to cancel
- Enter creates newlines (not submit)

### Scrollbox Focus Tracking

Keep focused field visible in viewport:
1. Maintain a `fieldHeights` array (each field ≈ 2-3 rows)
2. After `focusedIndex` changes, compute cumulative Y offset
3. If field is outside `[scrollTop, scrollTop + viewportHeight]`, call `scrollbox.scrollTo({ y: offset })`

### Modal-Priority Keybinding Scope for Overlays

When transfer/delete prompts are visible, register a temporary MODAL-priority keybinding scope to:
- Prevent `j`/`k` from navigating (OpenTUI input captures printable keys automatically)
- Route `Ctrl+S` to `handleSave`
- Route `Escape` to `cancelMode`

### Error Recovery Patterns

| HTTP Status | Behavior |
|-------------|----------|
| 401 | Propagate to AuthProvider → auth error screen |
| 403 | Field reverts, "Permission denied" in status bar 5s |
| 404 (repo) | Error state: "Repository not found. Press `q` to go back." |
| 404 (transfer target) | "User '{name}' not found." in transfer prompt |
| 409 (name conflict) | "Repository name already exists." inline, field reverts |
| 429 | "Rate limited. Retry in {N}s." inline, parse `Retry-After` header |
| 400 (transfer to self) | "Cannot transfer to yourself." in prompt |
| 5xx | Generic error with "Press `R` to retry" |

### Archived Repository Behavior

- General fields are read-only even for admins; `activateField` flashes "Unarchive to edit"
- Archive section shows "Unarchive this repository" in `theme.success` color
- Visibility toggle remains functional while archived

### Resize During Overlays

- Overlays use percentage-based `width` → auto-resize on terminal resize
- Input text and cursor preserved by OpenTUI internal state
- `useOnResize` triggers synchronous re-render

---

## Unit & Integration Tests

### Test File: `e2e/tui/repository.test.ts`

All tests appended within a `describe("TUI_REPO_SETTINGS_VIEW", ...)` block. Tests use `@microsoft/tui-test` via `launchTUI` from `e2e/tui/helpers.ts`. Tests that fail due to unimplemented backends are left failing — never skipped.

#### Navigation Helper

```typescript
async function navigateToSettings(terminal: Awaited<ReturnType<typeof launchTUI>>) {
  await terminal.sendKeys("g", "r");
  await terminal.waitForText("Repositories");
  await terminal.sendKeys("Enter");
  await terminal.waitForText("Bookmarks");
  await terminal.sendKeys("6");
  await terminal.waitForText("Settings");
}
```

#### Terminal Snapshot Tests (SNAP-001 through SNAP-022)

```typescript
test("SNAP-001: repo-settings-initial-load", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal);
    const s = terminal.snapshot();
    expect(s).toContain("Settings");
    expect(s).toContain("General");
    expect(s).toContain("Visibility");
    expect(s).toContain("Archive");
    expect(s).toContain("Danger Zone");
    expect(s).toContain("Name");
    expect(s).toContain("Description");
    expect(s).toContain("Default bookmark");
    expect(s).toContain("Topics");
  } finally { await terminal.terminate(); }
});

test("SNAP-002: repo-settings-general-section", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal);
    const s = terminal.snapshot();
    expect(s).toContain("Name"); expect(s).toContain("Description");
    expect(s).toContain("Default bookmark"); expect(s).toContain("Topics");
  } finally { await terminal.terminate(); }
});

test("SNAP-003: repo-settings-visibility-section", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal);
    expect(terminal.snapshot()).toMatch(/Visibility\s+(Public|Private)/);
  } finally { await terminal.terminate(); }
});

test("SNAP-004: repo-settings-archive-section", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal);
    expect(terminal.snapshot()).toMatch(/(Active|Archived)/);
  } finally { await terminal.terminate(); }
});

test("SNAP-005: repo-settings-archive-section-archived", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "repo", "--repo", "testowner/archived-repo", "--tab", "settings"] });
  try {
    await terminal.waitForText("Settings");
    const s = terminal.snapshot();
    expect(s).toContain("Archived"); expect(s).toContain("Unarchive");
  } finally { await terminal.terminate(); }
});

test("SNAP-006: repo-settings-danger-zone", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal);
    const s = terminal.snapshot();
    expect(s).toContain("Danger Zone"); expect(s).toContain("Transfer"); expect(s).toContain("Delete");
  } finally { await terminal.terminate(); }
});

test("SNAP-007: repo-settings-danger-zone-hidden-non-admin", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40, env: { CODEPLANE_TOKEN: "read-only-token" } });
  try {
    await navigateToSettings(terminal);
    const s = terminal.snapshot();
    expect(s).not.toContain("Danger Zone"); expect(s).not.toContain("Transfer"); expect(s).not.toContain("Delete");
  } finally { await terminal.terminate(); }
});

test("SNAP-008: repo-settings-read-only-mode", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40, env: { CODEPLANE_TOKEN: "read-only-token" } });
  try {
    await navigateToSettings(terminal);
    expect(terminal.snapshot()).toContain("Read-only");
  } finally { await terminal.terminate(); }
});

test("SNAP-009: repo-settings-focused-field", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal);
    expect(terminal.snapshot()).toMatch(/\x1b\[7m.*Name|Name.*\x1b\[7m/);
  } finally { await terminal.terminate(); }
});

test("SNAP-010: repo-settings-loading-state", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40, env: { CODEPLANE_API_DELAY: "5000" } });
  try {
    await terminal.sendKeys("g", "r"); await terminal.sendKeys("Enter"); await terminal.sendKeys("6");
    expect(terminal.snapshot()).toContain("Loading");
  } finally { await terminal.terminate(); }
});

test("SNAP-011: repo-settings-error-state", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40, env: { CODEPLANE_API_URL: "http://localhost:1" } });
  try {
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("retry", 15000);
    expect(terminal.snapshot()).toMatch(/Press.*R.*retry/i);
  } finally { await terminal.terminate(); }
});

test("SNAP-012: repo-settings-edit-name-overlay", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); await terminal.sendKeys("Enter");
    const s = terminal.snapshot(); expect(s).toContain("save"); expect(s).toContain("cancel");
  } finally { await terminal.terminate(); }
});

test("SNAP-013: repo-settings-edit-description-overlay", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); await terminal.sendKeys("j"); await terminal.sendKeys("Enter");
    expect(terminal.snapshot()).toContain("/1024");
  } finally { await terminal.terminate(); }
});

test("SNAP-014: repo-settings-edit-topics-overlay", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); for (let i = 0; i < 3; i++) await terminal.sendKeys("j"); await terminal.sendKeys("Enter");
    expect(terminal.snapshot()).toContain("save");
  } finally { await terminal.terminate(); }
});

test("SNAP-015: repo-settings-visibility-confirm", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); for (let i = 0; i < 4; i++) await terminal.sendKeys("j"); await terminal.sendKeys("Enter");
    expect(terminal.snapshot()).toMatch(/Change visibility.*y\/n/);
  } finally { await terminal.terminate(); }
});

test("SNAP-016: repo-settings-archive-confirm", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); for (let i = 0; i < 5; i++) await terminal.sendKeys("j"); await terminal.sendKeys("Enter");
    expect(terminal.snapshot()).toMatch(/Archive.*y\/n/);
  } finally { await terminal.terminate(); }
});

test("SNAP-017: repo-settings-transfer-prompt", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); for (let i = 0; i < 6; i++) await terminal.sendKeys("j"); await terminal.sendKeys("Enter");
    const s = terminal.snapshot(); expect(s).toContain("Transfer Ownership"); expect(s).toContain("username");
  } finally { await terminal.terminate(); }
});

test("SNAP-018: repo-settings-delete-prompt", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); for (let i = 0; i < 7; i++) await terminal.sendKeys("j"); await terminal.sendKeys("Enter");
    const s = terminal.snapshot(); expect(s).toContain("Delete Repository"); expect(s).toContain("Type the repository name");
  } finally { await terminal.terminate(); }
});

test("SNAP-019: repo-settings-delete-name-match", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); for (let i = 0; i < 7; i++) await terminal.sendKeys("j"); await terminal.sendKeys("Enter");
    await terminal.waitForText("Delete Repository"); await terminal.sendText("test-repo");
    expect(terminal.snapshot()).toContain("delete permanently");
  } finally { await terminal.terminate(); }
});

test("SNAP-020: repo-settings-delete-name-mismatch", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); for (let i = 0; i < 7; i++) await terminal.sendKeys("j"); await terminal.sendKeys("Enter");
    await terminal.waitForText("Delete Repository"); await terminal.sendText("wrong-name");
    expect(terminal.snapshot()).toContain("Name does not match");
  } finally { await terminal.terminate(); }
});

test("SNAP-021: repo-settings-empty-description", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "repo", "--repo", "testowner/no-description-repo", "--tab", "settings"] });
  try {
    await terminal.waitForText("Settings");
    expect(terminal.snapshot()).toContain("No description");
  } finally { await terminal.terminate(); }
});

test("SNAP-022: repo-settings-empty-topics", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "repo", "--repo", "testowner/no-topics-repo", "--tab", "settings"] });
  try {
    await terminal.waitForText("Settings");
    expect(terminal.snapshot()).toContain("No topics");
  } finally { await terminal.terminate(); }
});
```

#### Keyboard Interaction Tests (KEY-023 through KEY-060)

```typescript
test("KEY-023: repo-settings-j-moves-down", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); await terminal.sendKeys("j");
    expect(terminal.snapshot()).toMatch(/\x1b\[7m.*Description|Description.*\x1b\[7m/);
  } finally { await terminal.terminate(); }
});

test("KEY-024: repo-settings-k-moves-up", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); await terminal.sendKeys("j"); await terminal.sendKeys("k");
    expect(terminal.snapshot()).toMatch(/\x1b\[7m.*Name|Name.*\x1b\[7m/);
  } finally { await terminal.terminate(); }
});

test("KEY-025: repo-settings-k-at-top-no-wrap", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); await terminal.sendKeys("k");
    expect(terminal.snapshot()).toMatch(/\x1b\[7m.*Name|Name.*\x1b\[7m/);
  } finally { await terminal.terminate(); }
});

test("KEY-026: repo-settings-j-at-bottom-no-wrap", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); await terminal.sendKeys("G"); await terminal.sendKeys("j");
    expect(terminal.snapshot()).toContain("Delete");
  } finally { await terminal.terminate(); }
});

test("KEY-027: repo-settings-down-arrow", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); await terminal.sendKeys("Down");
    expect(terminal.snapshot()).toMatch(/\x1b\[7m.*Description|Description.*\x1b\[7m/);
  } finally { await terminal.terminate(); }
});

test("KEY-028: repo-settings-up-arrow", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); await terminal.sendKeys("Down"); await terminal.sendKeys("Up");
    expect(terminal.snapshot()).toMatch(/\x1b\[7m.*Name|Name.*\x1b\[7m/);
  } finally { await terminal.terminate(); }
});

test("KEY-029: repo-settings-enter-activates-edit", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); await terminal.sendKeys("Enter");
    const s = terminal.snapshot(); expect(s).toContain("save"); expect(s).toContain("cancel");
  } finally { await terminal.terminate(); }
});

test("KEY-030: repo-settings-esc-cancels-edit", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); await terminal.sendKeys("Enter"); await terminal.sendText("changed"); await terminal.sendKeys("Escape");
    expect(terminal.snapshot()).not.toContain("changed");
  } finally { await terminal.terminate(); }
});

test("KEY-031: repo-settings-ctrl-s-saves", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); await terminal.sendKeys("Enter"); await terminal.sendText("new-name"); await terminal.sendKeys("ctrl+s");
    await terminal.waitForNoText("cancel", 5000);
  } finally { await terminal.terminate(); }
});

test("KEY-032: repo-settings-enter-on-description", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); await terminal.sendKeys("j"); await terminal.sendKeys("Enter");
    expect(terminal.snapshot()).toContain("/1024");
  } finally { await terminal.terminate(); }
});

test("KEY-033: repo-settings-enter-on-visibility", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); for (let i = 0; i < 4; i++) await terminal.sendKeys("j"); await terminal.sendKeys("Enter");
    expect(terminal.snapshot()).toMatch(/y\/n/);
  } finally { await terminal.terminate(); }
});

test("KEY-034: repo-settings-y-confirms-visibility", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); for (let i = 0; i < 4; i++) await terminal.sendKeys("j"); await terminal.sendKeys("Enter");
    await terminal.waitForText("y/n"); await terminal.sendKeys("y");
    await terminal.waitForNoText("y/n", 5000);
  } finally { await terminal.terminate(); }
});

test("KEY-035: repo-settings-n-cancels-visibility", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); for (let i = 0; i < 4; i++) await terminal.sendKeys("j"); await terminal.sendKeys("Enter");
    await terminal.waitForText("y/n"); await terminal.sendKeys("n");
    await terminal.waitForNoText("y/n", 5000);
  } finally { await terminal.terminate(); }
});

test("KEY-036: repo-settings-enter-on-archive", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); for (let i = 0; i < 5; i++) await terminal.sendKeys("j"); await terminal.sendKeys("Enter");
    expect(terminal.snapshot()).toMatch(/Archive.*y\/n/);
  } finally { await terminal.terminate(); }
});

test("KEY-037: repo-settings-y-confirms-archive", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); for (let i = 0; i < 5; i++) await terminal.sendKeys("j"); await terminal.sendKeys("Enter");
    await terminal.waitForText("y/n"); await terminal.sendKeys("y");
    await terminal.waitForNoText("y/n", 5000);
  } finally { await terminal.terminate(); }
});

test("KEY-038: repo-settings-enter-on-transfer", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); for (let i = 0; i < 6; i++) await terminal.sendKeys("j"); await terminal.sendKeys("Enter");
    expect(terminal.snapshot()).toContain("Transfer Ownership");
  } finally { await terminal.terminate(); }
});

test("KEY-039: repo-settings-transfer-submit", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); for (let i = 0; i < 6; i++) await terminal.sendKeys("j"); await terminal.sendKeys("Enter");
    await terminal.waitForText("Transfer Ownership"); await terminal.sendText("newowner"); await terminal.sendKeys("ctrl+s");
  } finally { await terminal.terminate(); }
});

test("KEY-040: repo-settings-transfer-esc", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); for (let i = 0; i < 6; i++) await terminal.sendKeys("j"); await terminal.sendKeys("Enter");
    await terminal.waitForText("Transfer Ownership"); await terminal.sendKeys("Escape");
    await terminal.waitForNoText("Transfer Ownership", 5000);
  } finally { await terminal.terminate(); }
});

test("KEY-041: repo-settings-enter-on-delete", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); for (let i = 0; i < 7; i++) await terminal.sendKeys("j"); await terminal.sendKeys("Enter");
    expect(terminal.snapshot()).toContain("Delete Repository");
  } finally { await terminal.terminate(); }
});

test("KEY-042: repo-settings-delete-correct-name", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); for (let i = 0; i < 7; i++) await terminal.sendKeys("j"); await terminal.sendKeys("Enter");
    await terminal.waitForText("Delete Repository"); await terminal.sendText("test-repo"); await terminal.sendKeys("ctrl+s");
  } finally { await terminal.terminate(); }
});

test("KEY-043: repo-settings-delete-esc", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); for (let i = 0; i < 7; i++) await terminal.sendKeys("j"); await terminal.sendKeys("Enter");
    await terminal.waitForText("Delete Repository"); await terminal.sendKeys("Escape");
    await terminal.waitForNoText("Delete Repository", 5000);
  } finally { await terminal.terminate(); }
});

test("KEY-044: repo-settings-G-jumps-to-bottom", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); await terminal.sendKeys("G");
    expect(terminal.snapshot()).toMatch(/\x1b\[7m.*Delete|Delete.*\x1b\[7m/);
  } finally { await terminal.terminate(); }
});

test("KEY-045: repo-settings-gg-jumps-to-top", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); await terminal.sendKeys("G"); await terminal.sendKeys("g", "g");
    expect(terminal.snapshot()).toMatch(/\x1b\[7m.*Name|Name.*\x1b\[7m/);
  } finally { await terminal.terminate(); }
});

test("KEY-046: repo-settings-ctrl-d-page-down", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); await terminal.sendKeys("ctrl+d");
    expect(terminal.snapshot()).not.toMatch(/\x1b\[7m.*Name/);
  } finally { await terminal.terminate(); }
});

test("KEY-047: repo-settings-ctrl-u-page-up", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); await terminal.sendKeys("ctrl+d"); await terminal.sendKeys("ctrl+u");
    expect(terminal.snapshot()).toMatch(/\x1b\[7m.*Name|Name.*\x1b\[7m/);
  } finally { await terminal.terminate(); }
});

test("KEY-048: repo-settings-R-refreshes", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); await terminal.sendKeys("R");
    await terminal.waitForText("Settings");
  } finally { await terminal.terminate(); }
});

test("KEY-049: repo-settings-R-on-error-retries", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40, env: { CODEPLANE_API_URL: "http://localhost:1" } });
  try {
    await terminal.waitForText("retry", 15000); await terminal.sendKeys("R");
  } finally { await terminal.terminate(); }
});

test("KEY-050: repo-settings-enter-blocked-read-only", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40, env: { CODEPLANE_TOKEN: "read-only-token" } });
  try {
    await navigateToSettings(terminal); await terminal.sendKeys("Enter");
    expect(terminal.snapshot()).toContain("Admin access required");
  } finally { await terminal.terminate(); }
});

test("KEY-051: repo-settings-j-in-edit-types-j", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); await terminal.sendKeys("Enter"); await terminal.sendText("j");
    expect(terminal.snapshot()).toContain("save"); // still in edit mode
  } finally { await terminal.terminate(); }
});

test("KEY-052: repo-settings-enter-during-loading", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40, env: { CODEPLANE_API_DELAY: "5000" } });
  try {
    await terminal.sendKeys("g", "r"); await terminal.sendKeys("Enter"); await terminal.sendKeys("6"); await terminal.sendKeys("Enter");
    expect(terminal.snapshot()).not.toContain("save");
  } finally { await terminal.terminate(); }
});

test("KEY-053: repo-settings-rapid-j", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); for (let i = 0; i < 7; i++) await terminal.sendKeys("j");
    expect(terminal.snapshot()).toMatch(/\x1b\[7m.*Delete|Delete.*\x1b\[7m/);
  } finally { await terminal.terminate(); }
});

test("KEY-054: repo-settings-tab-switches-repo-tab", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); await terminal.sendKeys("Tab");
    await terminal.waitForText("Bookmarks");
  } finally { await terminal.terminate(); }
});

test("KEY-055: repo-settings-6-activates-tab", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); await terminal.sendKeys("1"); await terminal.waitForText("Bookmarks"); await terminal.sendKeys("6");
    await terminal.waitForText("Settings");
  } finally { await terminal.terminate(); }
});

test("KEY-056: repo-settings-topics-validation", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); for (let i = 0; i < 3; i++) await terminal.sendKeys("j"); await terminal.sendKeys("Enter");
    await terminal.sendText("INVALID TOPIC!");
    expect(terminal.snapshot()).toMatch(/lowercase|alphanumeric/i);
  } finally { await terminal.terminate(); }
});

test("KEY-057: repo-settings-name-validation", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); await terminal.sendKeys("Enter");
    await terminal.sendText("invalid name with spaces");
    expect(terminal.snapshot()).toMatch(/alphanumeric|hyphens/i);
  } finally { await terminal.terminate(); }
});

test("KEY-058: repo-settings-description-char-limit", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); await terminal.sendKeys("j"); await terminal.sendKeys("Enter");
    await terminal.sendText("a".repeat(1025));
    expect(terminal.snapshot()).toContain("1024/1024");
  } finally { await terminal.terminate(); }
});

test("KEY-059: repo-settings-transfer-navigates", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); for (let i = 0; i < 6; i++) await terminal.sendKeys("j"); await terminal.sendKeys("Enter");
    await terminal.waitForText("Transfer Ownership"); await terminal.sendText("newowner"); await terminal.sendKeys("ctrl+s");
    // Backend-dependent: may fail if not implemented
  } finally { await terminal.terminate(); }
});

test("KEY-060: repo-settings-delete-navigates", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); for (let i = 0; i < 7; i++) await terminal.sendKeys("j"); await terminal.sendKeys("Enter");
    await terminal.waitForText("Delete Repository"); await terminal.sendText("test-repo"); await terminal.sendKeys("ctrl+s");
    // Backend-dependent: may fail if not implemented
  } finally { await terminal.terminate(); }
});
```

#### Responsive Tests (RSP-061 through RSP-074)

```typescript
test("RSP-061: repo-settings-80x24-layout", async () => {
  const terminal = await launchTUI({ cols: 80, rows: 24 });
  try {
    await navigateToSettings(terminal);
    expect(terminal.snapshot()).toContain("Settings");
  } finally { await terminal.terminate(); }
});

test("RSP-062: repo-settings-80x24-danger-zone", async () => {
  const terminal = await launchTUI({ cols: 80, rows: 24 });
  try {
    await navigateToSettings(terminal); await terminal.sendKeys("G");
    expect(terminal.snapshot()).toContain("Danger");
  } finally { await terminal.terminate(); }
});

test("RSP-063: repo-settings-80x24-edit-overlay", async () => {
  const terminal = await launchTUI({ cols: 80, rows: 24 });
  try {
    await navigateToSettings(terminal); await terminal.sendKeys("j"); await terminal.sendKeys("Enter");
    expect(terminal.snapshot()).toContain("save");
  } finally { await terminal.terminate(); }
});

test("RSP-064: repo-settings-80x24-confirmation", async () => {
  const terminal = await launchTUI({ cols: 80, rows: 24 });
  try {
    await navigateToSettings(terminal); for (let i = 0; i < 4; i++) await terminal.sendKeys("j"); await terminal.sendKeys("Enter");
    expect(terminal.snapshot()).toMatch(/y\/n/);
  } finally { await terminal.terminate(); }
});

test("RSP-065: repo-settings-80x24-truncation", async () => {
  const terminal = await launchTUI({ cols: 80, rows: 24, args: ["--screen", "repo", "--repo", "testowner/long-description-repo", "--tab", "settings"] });
  try {
    await terminal.waitForText("Settings");
    expect(terminal.snapshot()).toContain("…");
  } finally { await terminal.terminate(); }
});

test("RSP-066: repo-settings-120x40-layout", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal);
    const s = terminal.snapshot(); expect(s).toContain("Settings"); expect(s).toContain("Default bookmark");
  } finally { await terminal.terminate(); }
});

test("RSP-067: repo-settings-120x40-all-fields", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal);
    const s = terminal.snapshot();
    expect(s).toContain("Name"); expect(s).toContain("Description"); expect(s).toContain("Default bookmark");
    expect(s).toContain("Topics"); expect(s).toContain("Visibility");
  } finally { await terminal.terminate(); }
});

test("RSP-068: repo-settings-200x60-layout", async () => {
  const terminal = await launchTUI({ cols: 200, rows: 60 });
  try {
    await navigateToSettings(terminal);
    expect(terminal.snapshot()).toContain("Settings");
  } finally { await terminal.terminate(); }
});

test("RSP-069: repo-settings-200x60-help-text", async () => {
  const terminal = await launchTUI({ cols: 200, rows: 60 });
  try {
    await navigateToSettings(terminal);
    expect(terminal.snapshot()).toContain("Settings");
  } finally { await terminal.terminate(); }
});

test("RSP-070: repo-settings-resize-120-to-80", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); await terminal.resize(80, 24);
    expect(terminal.snapshot()).toContain("Settings");
  } finally { await terminal.terminate(); }
});

test("RSP-071: repo-settings-resize-80-to-120", async () => {
  const terminal = await launchTUI({ cols: 80, rows: 24 });
  try {
    await navigateToSettings(terminal); await terminal.resize(120, 40);
    const s = terminal.snapshot(); expect(s).toContain("Settings"); expect(s).toContain("Default bookmark");
  } finally { await terminal.terminate(); }
});

test("RSP-072: repo-settings-resize-preserves-focus", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); await terminal.sendKeys("j", "j"); await terminal.resize(80, 24);
    expect(terminal.snapshot()).toMatch(/\x1b\[7m.*(Default|Bkmk)/);
  } finally { await terminal.terminate(); }
});

test("RSP-073: repo-settings-resize-during-edit", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); await terminal.sendKeys("Enter"); await terminal.sendText("partial"); await terminal.resize(80, 24);
    expect(terminal.snapshot()).toContain("save");
  } finally { await terminal.terminate(); }
});

test("RSP-074: repo-settings-resize-during-confirmation", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); for (let i = 0; i < 4; i++) await terminal.sendKeys("j"); await terminal.sendKeys("Enter");
    await terminal.waitForText("y/n"); await terminal.resize(80, 24);
    expect(terminal.snapshot()).toMatch(/y\/n/);
  } finally { await terminal.terminate(); }
});
```

#### Integration / Error Tests (INT-075 through INT-094)

```typescript
test("INT-075: repo-settings-auth-expiry", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40, env: { CODEPLANE_TOKEN: "expired-token" } });
  try {
    await terminal.waitForText("auth", 10000);
    expect(terminal.snapshot()).toMatch(/Session expired|auth/i);
  } finally { await terminal.terminate(); }
});

test("INT-076: repo-settings-rate-limit-429", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40, env: { CODEPLANE_SIMULATE_429: "true" } });
  try {
    await navigateToSettings(terminal); await terminal.sendKeys("Enter"); await terminal.sendText("x"); await terminal.sendKeys("ctrl+s");
    // 429 should display rate limit message
  } finally { await terminal.terminate(); }
});

test("INT-077: repo-settings-network-error", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40, env: { CODEPLANE_API_URL: "http://localhost:1" } });
  try {
    await terminal.waitForText("retry", 15000);
  } finally { await terminal.terminate(); }
});

test("INT-078: repo-settings-server-error-500", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40, env: { CODEPLANE_SIMULATE_500: "true" } });
  try {
    await terminal.waitForText("retry", 15000);
  } finally { await terminal.terminate(); }
});

test("INT-079: repo-settings-edit-403", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); await terminal.sendKeys("Enter"); await terminal.sendText("new"); await terminal.sendKeys("ctrl+s");
    // If server returns 403, should show Permission denied
  } finally { await terminal.terminate(); }
});

test("INT-080: repo-settings-name-conflict-409", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); await terminal.sendKeys("Enter"); await terminal.sendText("existing-repo"); await terminal.sendKeys("ctrl+s");
    // If server returns 409, should show conflict error
  } finally { await terminal.terminate(); }
});

test("INT-081: repo-settings-bad-request-400", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); await terminal.sendKeys("Enter"); await terminal.sendText("x"); await terminal.sendKeys("ctrl+s");
    // If server returns 400, should show error inline
  } finally { await terminal.terminate(); }
});

test("INT-082: repo-settings-transfer-403", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); for (let i = 0; i < 6; i++) await terminal.sendKeys("j"); await terminal.sendKeys("Enter");
    await terminal.waitForText("Transfer Ownership"); await terminal.sendText("someone"); await terminal.sendKeys("ctrl+s");
    // If 403, should show Owner access required
  } finally { await terminal.terminate(); }
});

test("INT-083: repo-settings-transfer-404", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); for (let i = 0; i < 6; i++) await terminal.sendKeys("j"); await terminal.sendKeys("Enter");
    await terminal.waitForText("Transfer Ownership"); await terminal.sendText("nonexistent"); await terminal.sendKeys("ctrl+s");
    // If 404, should show User not found
  } finally { await terminal.terminate(); }
});

test("INT-084: repo-settings-transfer-400-self", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); for (let i = 0; i < 6; i++) await terminal.sendKeys("j"); await terminal.sendKeys("Enter");
    await terminal.waitForText("Transfer Ownership"); await terminal.sendText("testowner"); await terminal.sendKeys("ctrl+s");
    // If 400, should show Cannot transfer to yourself
  } finally { await terminal.terminate(); }
});

test("INT-085: repo-settings-delete-403", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); for (let i = 0; i < 7; i++) await terminal.sendKeys("j"); await terminal.sendKeys("Enter");
    await terminal.waitForText("Delete Repository"); await terminal.sendText("test-repo"); await terminal.sendKeys("ctrl+s");
    // If 403, should show Owner access required
  } finally { await terminal.terminate(); }
});

test("INT-086: repo-settings-archive-error", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); for (let i = 0; i < 5; i++) await terminal.sendKeys("j"); await terminal.sendKeys("Enter");
    await terminal.waitForText("y/n"); await terminal.sendKeys("y");
    // If server error, status should be unchanged
  } finally { await terminal.terminate(); }
});

test("INT-087: repo-settings-unarchive-error", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "repo", "--repo", "testowner/archived-repo", "--tab", "settings"] });
  try {
    await terminal.waitForText("Settings"); for (let i = 0; i < 5; i++) await terminal.sendKeys("j"); await terminal.sendKeys("Enter");
    await terminal.waitForText("y/n"); await terminal.sendKeys("y");
  } finally { await terminal.terminate(); }
});

test("INT-088: repo-settings-optimistic-edit-rollback", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); await terminal.sendKeys("Enter"); await terminal.sendText("will-fail"); await terminal.sendKeys("ctrl+s");
    // On error, field should revert
  } finally { await terminal.terminate(); }
});

test("INT-089: repo-settings-tab-switch-and-back", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); await terminal.sendKeys("1"); await terminal.waitForText("Bookmarks");
    await terminal.sendKeys("6"); await terminal.waitForText("Settings");
  } finally { await terminal.terminate(); }
});

test("INT-090: repo-settings-help-overlay", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal); await terminal.sendKeys("?");
    expect(terminal.snapshot()).toContain("Settings");
  } finally { await terminal.terminate(); }
});

test("INT-091: repo-settings-status-bar-hints", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  try {
    await navigateToSettings(terminal);
    const lastLine = terminal.getLine(terminal.rows - 1);
    expect(lastLine).toMatch(/j\/k.*navigate|Enter.*edit/i);
  } finally { await terminal.terminate(); }
});

test("INT-092: repo-settings-deep-link", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "repo", "--repo", "testowner/test-repo", "--tab", "settings"] });
  try {
    await terminal.waitForText("Settings");
    expect(terminal.snapshot()).toContain("Settings");
  } finally { await terminal.terminate(); }
});

test("INT-093: repo-settings-archived-fields-readonly", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "repo", "--repo", "testowner/archived-repo", "--tab", "settings"] });
  try {
    await terminal.waitForText("Settings"); await terminal.sendKeys("Enter");
    expect(terminal.snapshot()).toContain("Unarchive to edit");
  } finally { await terminal.terminate(); }
});

test("INT-094: repo-settings-not-found-404", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40, args: ["--screen", "repo", "--repo", "testowner/nonexistent", "--tab", "settings"] });
  try {
    await terminal.waitForText("not found", 15000);
    expect(terminal.snapshot()).toMatch(/not found|Press.*q.*go back/i);
  } finally { await terminal.terminate(); }
});
```

---

## Validation Unit Tests

Pure validation functions are also unit-tested in the same `e2e/tui/repository.test.ts` file within a nested `describe("validation", ...)` block. These do not require TUI launch.

```typescript
describe("TUI_REPO_SETTINGS_VIEW validation", () => {
  // Import from source
  const { validateRepoName, validateDescription, validateDefaultBookmark, validateTopics, validateTransferOwner, parseTopics } = require("../../apps/tui/src/screens/Repository/tabs/Settings/validation.js");

  test("validateRepoName accepts valid names", () => {
    expect(validateRepoName("my-repo").valid).toBe(true);
    expect(validateRepoName("repo_v2.0").valid).toBe(true);
  });

  test("validateRepoName rejects empty", () => {
    expect(validateRepoName("").valid).toBe(false);
  });

  test("validateRepoName rejects leading dot", () => {
    expect(validateRepoName(".hidden").valid).toBe(false);
  });

  test("validateRepoName rejects trailing .git", () => {
    expect(validateRepoName("repo.git").valid).toBe(false);
  });

  test("validateRepoName rejects spaces", () => {
    expect(validateRepoName("invalid name").valid).toBe(false);
  });

  test("validateRepoName rejects over 100 chars", () => {
    expect(validateRepoName("a".repeat(101)).valid).toBe(false);
  });

  test("validateDescription accepts up to 1024 chars", () => {
    expect(validateDescription("a".repeat(1024)).valid).toBe(true);
    expect(validateDescription("a".repeat(1025)).valid).toBe(false);
  });

  test("validateTopics accepts valid topics", () => {
    expect(validateTopics("rust, jj, forge").valid).toBe(true);
  });

  test("validateTopics rejects uppercase", () => {
    expect(validateTopics("INVALID").valid).toBe(false);
  });

  test("validateTopics rejects over 20 topics", () => {
    const topics = Array.from({ length: 21 }, (_, i) => `topic-${i}`).join(", ");
    expect(validateTopics(topics).valid).toBe(false);
  });

  test("validateTopics rejects topic over 35 chars", () => {
    expect(validateTopics("a".repeat(36)).valid).toBe(false);
  });

  test("validateTransferOwner accepts valid username", () => {
    expect(validateTransferOwner("new-owner").valid).toBe(true);
  });

  test("validateTransferOwner rejects empty", () => {
    expect(validateTransferOwner("").valid).toBe(false);
  });

  test("parseTopics splits and trims", () => {
    expect(parseTopics("rust, jj , forge")).toEqual(["rust", "jj", "forge"]);
  });

  test("parseTopics filters empty strings", () => {
    expect(parseTopics(",,,")).toEqual([]);
  });
});
```

---

## Source of Truth

This engineering specification should be maintained alongside:

- `specs/tui/prd.md` — TUI product requirements
- `specs/tui/design.md` — TUI design specification
- `specs/tui/engineering/tui-repo-screen-scaffold.md` — Dependency: repo screen scaffold
- `specs/tui/engineering/tui-repo-data-hooks.md` — Dependency: repo data hooks
- `specs/tui/features.ts` — Feature inventory
- `context/opentui/` — OpenTUI component reference