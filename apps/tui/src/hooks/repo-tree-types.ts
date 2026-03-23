/**
 * Types for repository tree browsing and file content hooks.
 *
 * These mirror the API response shapes and are used by:
 * - useRepoTree
 * - useFileContent
 * - useBookmarks
 *
 * SDK source of truth: packages/sdk/src/services/repohost.ts
 */

import type { LoadingError } from "../loading/types.js";

// ---------------------------------------------------------------------------
// Tree entry (directory listing)
// ---------------------------------------------------------------------------

/** Type of entry in a repository tree listing. */
export type TreeEntryType = "file" | "dir" | "symlink" | "submodule";

/** A single entry in a repository directory listing. */
export interface TreeEntry {
  /** File or directory name (leaf, not full path). */
  name: string;
  /** Full path from repository root. */
  path: string;
  /** Entry type. */
  type: TreeEntryType;
  /** File size in bytes. Present for files only. */
  size?: number;
}

/** Options for the useRepoTree hook. */
export interface UseRepoTreeOptions {
  /** Repository owner. */
  owner: string;
  /** Repository name. */
  repo: string;
  /** Path within the repository. Empty string or undefined for root. */
  path?: string;
  /** Bookmark name or change ID to resolve the tree at. */
  ref?: string;
  /**
   * Whether the hook should fetch immediately.
   * Defaults to true. Set to false for lazy-loading (fetch on demand).
   */
  enabled?: boolean;
}

/** Return value of useRepoTree. */
export interface UseRepoTreeReturn {
  /** Directory entries at the requested path. Null before first successful fetch. */
  entries: TreeEntry[] | null;
  /** Whether a fetch is in progress. */
  isLoading: boolean;
  /** Structured error if the last fetch failed. */
  error: LoadingError | null;
  /** Re-fetch the current path. */
  refetch: () => void;
  /**
   * Fetch a specific sub-path on demand (lazy-load a subdirectory).
   * Returns the entries directly; does NOT update this hook's top-level
   * entries state. The caller (tree component) inserts them at the
   * correct depth in its own tree model.
   */
  fetchPath: (subPath: string) => Promise<TreeEntry[]>;
}

// ---------------------------------------------------------------------------
// File content
// ---------------------------------------------------------------------------

/** Options for the useFileContent hook. */
export interface UseFileContentOptions {
  /** Repository owner. */
  owner: string;
  /** Repository name. */
  repo: string;
  /** jj change ID at which to read the file. */
  changeId: string;
  /** Full file path within the repository. */
  filePath: string;
  /**
   * Whether the hook should fetch immediately.
   * Defaults to true. Set to false for deferred loading.
   */
  enabled?: boolean;
}

/** Return value of useFileContent. */
export interface UseFileContentReturn {
  /** File content string. Null before first successful fetch. */
  content: string | null;
  /** The resolved file path. */
  filePath: string | null;
  /** Whether a fetch is in progress. */
  isLoading: boolean;
  /** Structured error if the last fetch failed. */
  error: LoadingError | null;
  /** Re-fetch the file content. */
  refetch: () => void;
}

// ---------------------------------------------------------------------------
// Bookmarks
// ---------------------------------------------------------------------------

/** A repository bookmark (jj named ref). Mirrors packages/sdk Bookmark type. */
export interface Bookmark {
  /** Bookmark name. */
  name: string;
  /** Target jj change ID. */
  target_change_id: string;
  /** Target git commit SHA. */
  target_commit_id: string;
  /** Whether this bookmark tracks a remote. */
  is_tracking_remote: boolean;
}

/** Options for the useBookmarks hook. */
export interface UseBookmarksOptions {
  /** Repository owner. */
  owner: string;
  /** Repository name. */
  repo: string;
  /**
   * Whether the hook should fetch immediately.
   * Defaults to true.
   */
  enabled?: boolean;
}

/** Return value of useBookmarks. */
export interface UseBookmarksReturn {
  /** Bookmark list. Null before first successful fetch. */
  bookmarks: Bookmark[] | null;
  /** Whether a fetch is in progress. */
  isLoading: boolean;
  /** Structured error if the last fetch failed. */
  error: LoadingError | null;
  /** Whether more bookmarks are available (pagination). */
  hasMore: boolean;
  /** Fetch the next page of bookmarks. */
  fetchMore: () => void;
  /** Re-fetch from the beginning. */
  refetch: () => void;
}
