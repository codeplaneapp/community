/**
 * RepoHost service for JJHub Community Edition.
 *
 * Manages jj repositories on local disk by shelling out to the `jj` CLI.
 * This replaces the Go repo-host service's Rust FFI approach with a simpler
 * CLI-based implementation suitable for single-tenant / OSS use.
 *
 * All jj commands use custom templates (-T) for structured output parsing.
 * Repository paths live under JJHUB_DATA_DIR/repos/ (default: ./data/repos/).
 */

import { join } from "node:path";
import { rm, access, mkdir } from "node:fs/promises";
import { Result } from "better-result";
import type { Subprocess } from "bun";

import {
  type APIError,
  internal,
  notFound,
  badRequest,
} from "../lib/errors";

// ---------------------------------------------------------------------------
// Types — mirrors Go's repohost.Client structs and routes/jj_vcs.go responses
// ---------------------------------------------------------------------------

export interface Bookmark {
  name: string;
  target_change_id: string;
  target_commit_id: string;
  is_tracking_remote: boolean;
}

export interface CreateBookmarkRequest {
  name: string;
  target_change_id: string;
}

export interface Change {
  change_id: string;
  commit_id: string;
  description: string;
  author_name: string;
  author_email: string;
  timestamp: string;
  has_conflict: boolean;
  is_empty: boolean;
  parent_change_ids: string[];
}

export interface ChangeDiff {
  change_id: string;
  file_diffs: FileDiffItem[];
}

export interface FileDiffItem {
  path: string;
  old_path?: string;
  change_type: string;
  patch?: string;
  is_binary: boolean;
  language?: string;
  additions: number;
  deletions: number;
  old_content?: string;
  new_content?: string;
}

export interface ChangeFile {
  path: string;
}

export interface ChangeConflict {
  file_path: string;
  conflict_type: string;
  base_content?: string;
  left_content?: string;
  right_content?: string;
  hunks?: string;
  resolution_status?: string;
}

export interface FileContent {
  path: string;
  content: string;
}

export interface Operation {
  operation_id: string;
  description: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// jj CLI execution helpers
// ---------------------------------------------------------------------------

/** Separator used inside jj templates for field delimiting. */
const FIELD_SEP = "\x1f"; // ASCII Unit Separator
const RECORD_SEP = "\x1e"; // ASCII Record Separator

interface JJExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Run a jj command in the given repository directory.
 * Returns structured result with stdout, stderr, and exit code.
 */
async function execJJ(
  repoPath: string,
  args: string[]
): Promise<JJExecResult> {
  const proc = Bun.spawn(["jj", ...args], {
    cwd: repoPath,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      // Disable pager and color for programmatic use
      JJ_CONFIG: "ui.pager=false\nui.color=never",
    },
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  const exitCode = await proc.exited;
  return { stdout, stderr, exitCode };
}

/**
 * Run a jj command and return stdout on success, or an APIError on failure.
 */
async function execJJChecked(
  repoPath: string,
  args: string[]
): Promise<Result<string, APIError>> {
  const result = await execJJ(repoPath, args);

  if (result.exitCode !== 0) {
    const msg = result.stderr.trim() || "jj command failed";

    // Map common jj error patterns to appropriate HTTP errors
    if (
      msg.includes("No such path") ||
      msg.includes("not found") ||
      msg.includes("doesn't exist") ||
      msg.includes("No such change") ||
      msg.includes("Revision") && msg.includes("doesn't exist")
    ) {
      return Result.err(notFound(msg));
    }
    if (
      msg.includes("already exists") ||
      msg.includes("Refusing")
    ) {
      return Result.err(badRequest(msg));
    }

    return Result.err(internal(msg));
  }

  return Result.ok(result.stdout);
}

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

function getReposBaseDir(): string {
  return join(process.env.JJHUB_DATA_DIR ?? "./data", "repos");
}

function resolveRepoPath(owner: string, repo: string): string {
  // Prevent path traversal
  const safeOwner = owner.replace(/\.\./g, "_").replace(/\//g, "_");
  const safeRepo = repo.replace(/\.\./g, "_").replace(/\//g, "_");
  return join(getReposBaseDir(), safeOwner, safeRepo);
}

async function repoExists(repoPath: string): Promise<boolean> {
  try {
    await access(join(repoPath, ".jj"));
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Template strings for jj output
// ---------------------------------------------------------------------------

// Bookmark template: outputs name, change_id, commit_id, tracking status
const BOOKMARK_TEMPLATE = [
  'name',
  `" ${FIELD_SEP} "`,
  'commit_id.short(40)',
  `" ${FIELD_SEP} "`,
  'if(tracked, "true", "false")',
].join(' ++ ');

// Change/log template: outputs structured fields per change
const CHANGE_TEMPLATE = [
  'change_id',
  `"${FIELD_SEP}"`,
  'commit_id',
  `"${FIELD_SEP}"`,
  'description.first_line()',
  `"${FIELD_SEP}"`,
  'author.name()',
  `"${FIELD_SEP}"`,
  'author.email()',
  `"${FIELD_SEP}"`,
  'author.timestamp()',
  `"${FIELD_SEP}"`,
  'if(conflict, "true", "false")',
  `"${FIELD_SEP}"`,
  'if(empty, "true", "false")',
  `"${FIELD_SEP}"`,
  'parents.map(|p| p.change_id()).join(",")',
  `"${RECORD_SEP}"`,
].join(' ++ ');

// Operation log template
const OPERATION_TEMPLATE = [
  'self.id()',
  `"${FIELD_SEP}"`,
  'self.description()',
  `"${FIELD_SEP}"`,
  'self.time().start()',
  `"${RECORD_SEP}"`,
].join(' ++ ');

// ---------------------------------------------------------------------------
// RepoHostService
// ---------------------------------------------------------------------------

export class RepoHostService {
  private readonly reposBaseDir: string;

  constructor(reposBaseDir?: string) {
    this.reposBaseDir = reposBaseDir ?? getReposBaseDir();
  }

  private repoPath(owner: string, repo: string): string {
    const safeOwner = owner.replace(/\.\./g, "_").replace(/\//g, "_");
    const safeRepo = repo.replace(/\.\./g, "_").replace(/\//g, "_");
    return join(this.reposBaseDir, safeOwner, safeRepo);
  }

  private async ensureRepo(owner: string, repo: string): Promise<Result<string, APIError>> {
    const path = this.repoPath(owner, repo);
    if (!(await repoExists(path))) {
      return Result.err(notFound(`repository '${owner}/${repo}' not found`));
    }
    return Result.ok(path);
  }

  // =========================================================================
  // Repository management
  // =========================================================================

  /**
   * Initialize a new jj repository with a colocated git backend.
   * Equivalent to Go's repohost.Client.InitRepo.
   */
  async initRepo(
    owner: string,
    repo: string,
    defaultBookmark?: string
  ): Promise<Result<void, APIError>> {
    const path = this.repoPath(owner, repo);

    // Create parent directory
    await mkdir(path, { recursive: true });

    // Initialize with colocated git backend so git-upload-pack / git-receive-pack work
    const result = await execJJ(path, ["git", "init", "--colocate"]);
    if (result.exitCode !== 0) {
      return Result.err(
        internal(`failed to init repo: ${result.stderr.trim()}`)
      );
    }

    // Create default bookmark if specified
    if (defaultBookmark && defaultBookmark.trim() !== "") {
      const bmResult = await execJJ(path, [
        "bookmark",
        "create",
        defaultBookmark.trim(),
      ]);
      if (bmResult.exitCode !== 0) {
        // Non-fatal: repo is initialized, bookmark creation can be retried
        console.warn(
          `Warning: failed to create default bookmark '${defaultBookmark}': ${bmResult.stderr.trim()}`
        );
      }
    }

    return Result.ok(undefined);
  }

  /**
   * Delete a repository from disk.
   * Equivalent to Go's repohost.Client.DeleteRepo.
   */
  async deleteRepo(owner: string, repo: string): Promise<Result<void, APIError>> {
    const path = this.repoPath(owner, repo);
    try {
      await rm(path, { recursive: true, force: true });
    } catch (err: any) {
      if (err?.code !== "ENOENT") {
        return Result.err(internal(`failed to delete repo: ${err.message}`));
      }
    }
    return Result.ok(undefined);
  }

  /**
   * Clone a repository from a URL.
   */
  async cloneRepo(
    url: string,
    owner: string,
    repo: string
  ): Promise<Result<void, APIError>> {
    const path = this.repoPath(owner, repo);
    await mkdir(join(this.reposBaseDir, owner.replace(/\.\./g, "_").replace(/\//g, "_")), {
      recursive: true,
    });

    const result = await execJJ(this.reposBaseDir, [
      "git",
      "clone",
      "--colocate",
      url,
      path,
    ]);
    if (result.exitCode !== 0) {
      return Result.err(
        internal(`failed to clone repo: ${result.stderr.trim()}`)
      );
    }

    return Result.ok(undefined);
  }

  // =========================================================================
  // Bookmark operations
  // =========================================================================

  /**
   * List bookmarks in a repository.
   * Equivalent to Go's repohost.Client.ListBookmarks.
   */
  async listBookmarks(
    owner: string,
    repo: string,
    _cursor?: string,
    _limit?: number
  ): Promise<Result<{ items: Bookmark[]; nextCursor: string }, APIError>> {
    const pathResult = await this.ensureRepo(owner, repo);
    if (Result.isError(pathResult)) return pathResult;
    const repoPath = pathResult.value;

    // Use jj bookmark list with a template that outputs parseable data.
    // The bookmark template in jj uses a different set of keywords than log.
    const result = await execJJ(repoPath, [
      "bookmark",
      "list",
      "--all",
      "-T",
      `name ++ "${FIELD_SEP}" ++ normal_target.map(|c| c.commit_id().short(40)).join(",") ++ "${FIELD_SEP}" ++ normal_target.map(|c| c.change_id()).join(",") ++ "${FIELD_SEP}" ++ if(remote != "", "true", "false") ++ "${RECORD_SEP}"`,
    ]);

    if (result.exitCode !== 0) {
      return Result.err(
        internal(`failed to list bookmarks: ${result.stderr.trim()}`)
      );
    }

    const bookmarks: Bookmark[] = [];
    const records = result.stdout.split(RECORD_SEP).filter((r) => r.trim());

    for (const record of records) {
      const fields = record.split(FIELD_SEP);
      if (fields.length < 4) continue;

      const name = fields[0]!.trim();
      const commitId = fields[1]!.trim();
      const changeId = fields[2]!.trim();
      const isTracking = fields[3]!.trim() === "true";

      if (!name) continue;

      bookmarks.push({
        name,
        target_commit_id: commitId,
        target_change_id: changeId,
        is_tracking_remote: isTracking,
      });
    }

    // Simple cursor pagination: no real cursor support from jj CLI,
    // so we return all bookmarks at once with empty next_cursor.
    return Result.ok({ items: bookmarks, nextCursor: "" });
  }

  /**
   * Create a bookmark at a target change.
   * Equivalent to Go's repohost.Client.CreateBookmark.
   */
  async createBookmark(
    owner: string,
    repo: string,
    req: CreateBookmarkRequest
  ): Promise<Result<Bookmark, APIError>> {
    const pathResult = await this.ensureRepo(owner, repo);
    if (Result.isError(pathResult)) return pathResult;
    const repoPath = pathResult.value;

    const args = ["bookmark", "create", req.name];
    if (req.target_change_id) {
      args.push("-r", req.target_change_id);
    }

    const result = await execJJChecked(repoPath, args);
    if (Result.isError(result)) return result;

    // Fetch the bookmark details after creation
    const showResult = await execJJ(repoPath, [
      "log",
      "--no-graph",
      "-r",
      `bookmark(exact:"${req.name}")`,
      "-T",
      `commit_id ++ "${FIELD_SEP}" ++ change_id ++ "${RECORD_SEP}"`,
      "--limit",
      "1",
    ]);

    let commitId = "";
    let changeId = req.target_change_id;

    if (showResult.exitCode === 0) {
      const fields = showResult.stdout.split(RECORD_SEP)[0]?.split(FIELD_SEP);
      if (fields && fields.length >= 2) {
        commitId = fields[0]!.trim();
        changeId = fields[1]!.trim();
      }
    }

    return Result.ok({
      name: req.name,
      target_commit_id: commitId,
      target_change_id: changeId,
      is_tracking_remote: false,
    });
  }

  /**
   * Delete a bookmark by name.
   * Equivalent to Go's repohost.Client.DeleteBookmark.
   */
  async deleteBookmark(
    owner: string,
    repo: string,
    name: string
  ): Promise<Result<void, APIError>> {
    const pathResult = await this.ensureRepo(owner, repo);
    if (Result.isError(pathResult)) return pathResult;
    const repoPath = pathResult.value;

    const result = await execJJChecked(repoPath, ["bookmark", "delete", name]);
    if (Result.isError(result)) return result;

    return Result.ok(undefined);
  }

  // =========================================================================
  // Change operations
  // =========================================================================

  /**
   * List changes (commits) in a repository.
   * Equivalent to Go's repohost.Client.ListChanges.
   */
  async listChanges(
    owner: string,
    repo: string,
    cursor?: string,
    limit?: number
  ): Promise<Result<{ items: Change[]; nextCursor: string }, APIError>> {
    const pathResult = await this.ensureRepo(owner, repo);
    if (Result.isError(pathResult)) return pathResult;
    const repoPath = pathResult.value;

    const effectiveLimit = limit ?? 30;
    // Use cursor as a revset offset marker: skip N changes
    const offset = cursor ? parseInt(cursor, 10) : 0;
    // Request one extra to detect if there's a next page
    const fetchCount = (isNaN(offset) ? 0 : offset) + effectiveLimit + 1;

    const result = await execJJ(repoPath, [
      "log",
      "--no-graph",
      "-T",
      CHANGE_TEMPLATE,
      "--limit",
      String(fetchCount),
    ]);

    if (result.exitCode !== 0) {
      return Result.err(
        internal(`failed to list changes: ${result.stderr.trim()}`)
      );
    }

    const allChanges = parseChanges(result.stdout);
    const startIdx = isNaN(offset) ? 0 : offset;
    const page = allChanges.slice(startIdx, startIdx + effectiveLimit);
    const hasMore = allChanges.length > startIdx + effectiveLimit;
    const nextCursor = hasMore ? String(startIdx + effectiveLimit) : "";

    return Result.ok({ items: page, nextCursor });
  }

  /**
   * Get a single change by its change ID.
   * Equivalent to Go's repohost.Client.GetChange.
   */
  async getChange(
    owner: string,
    repo: string,
    changeId: string
  ): Promise<Result<Change, APIError>> {
    const pathResult = await this.ensureRepo(owner, repo);
    if (Result.isError(pathResult)) return pathResult;
    const repoPath = pathResult.value;

    const result = await execJJ(repoPath, [
      "log",
      "--no-graph",
      "-r",
      changeId,
      "-T",
      CHANGE_TEMPLATE,
      "--limit",
      "1",
    ]);

    if (result.exitCode !== 0) {
      const msg = result.stderr.trim();
      if (msg.includes("Revision") || msg.includes("No such") || msg.includes("not found")) {
        return Result.err(notFound(`change '${changeId}' not found`));
      }
      return Result.err(internal(`failed to get change: ${msg}`));
    }

    const changes = parseChanges(result.stdout);
    if (changes.length === 0) {
      return Result.err(notFound(`change '${changeId}' not found`));
    }

    return Result.ok(changes[0]!);
  }

  /**
   * Get the diff for a change.
   * Equivalent to Go's repohost.Client.GetChangeDiff.
   */
  async getChangeDiff(
    owner: string,
    repo: string,
    changeId: string
  ): Promise<Result<ChangeDiff, APIError>> {
    const pathResult = await this.ensureRepo(owner, repo);
    if (Result.isError(pathResult)) return pathResult;
    const repoPath = pathResult.value;

    // Get the unified diff output
    const result = await execJJ(repoPath, [
      "diff",
      "-r",
      changeId,
      "--git",
    ]);

    if (result.exitCode !== 0) {
      const msg = result.stderr.trim();
      if (msg.includes("Revision") || msg.includes("No such") || msg.includes("not found")) {
        return Result.err(notFound(`change '${changeId}' not found`));
      }
      return Result.err(internal(`failed to get change diff: ${msg}`));
    }

    const fileDiffs = parseGitDiff(result.stdout);

    return Result.ok({
      change_id: changeId,
      file_diffs: fileDiffs,
    });
  }

  /**
   * Get the list of changed files in a change.
   * Equivalent to Go's repohost.Client.GetChangeFiles.
   */
  async getChangeFiles(
    owner: string,
    repo: string,
    changeId: string
  ): Promise<Result<ChangeFile[], APIError>> {
    const pathResult = await this.ensureRepo(owner, repo);
    if (Result.isError(pathResult)) return pathResult;
    const repoPath = pathResult.value;

    const result = await execJJ(repoPath, [
      "diff",
      "--summary",
      "-r",
      changeId,
    ]);

    if (result.exitCode !== 0) {
      const msg = result.stderr.trim();
      if (msg.includes("Revision") || msg.includes("No such") || msg.includes("not found")) {
        return Result.err(notFound(`change '${changeId}' not found`));
      }
      return Result.err(internal(`failed to get change files: ${msg}`));
    }

    const files: ChangeFile[] = [];
    for (const line of result.stdout.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // jj diff --summary output format: "M path/to/file" or "A path/to/file"
      // The first character is the change type, followed by a space and the path
      const spaceIdx = trimmed.indexOf(" ");
      if (spaceIdx === -1) continue;

      const path = trimmed.slice(spaceIdx + 1).trim();
      if (path) {
        files.push({ path });
      }
    }

    return Result.ok(files);
  }

  /**
   * Get conflicts for a change.
   * Equivalent to Go's repohost.Client.GetChangeConflicts.
   */
  async getChangeConflicts(
    owner: string,
    repo: string,
    changeId: string
  ): Promise<Result<ChangeConflict[], APIError>> {
    const pathResult = await this.ensureRepo(owner, repo);
    if (Result.isError(pathResult)) return pathResult;
    const repoPath = pathResult.value;

    const result = await execJJ(repoPath, [
      "resolve",
      "--list",
      "-r",
      changeId,
    ]);

    if (result.exitCode !== 0) {
      const msg = result.stderr.trim();
      // "No conflicts" is not an error, just means no conflicts exist
      if (
        msg.includes("No conflicts") ||
        msg.includes("no conflicts") ||
        msg.includes("is not a conflicted")
      ) {
        return Result.ok([]);
      }
      if (msg.includes("Revision") || msg.includes("No such") || msg.includes("not found")) {
        return Result.err(notFound(`change '${changeId}' not found`));
      }
      return Result.err(internal(`failed to get conflicts: ${msg}`));
    }

    const conflicts: ChangeConflict[] = [];
    for (const line of result.stdout.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // jj resolve --list output: "path/to/file    2-sided conflict"
      // Parse the file path and conflict type
      const match = trimmed.match(/^(.+?)\s{2,}(.+)$/);
      if (match) {
        conflicts.push({
          file_path: match[1]!.trim(),
          conflict_type: match[2]!.trim(),
        });
      } else {
        // Fallback: treat entire line as a file path with unknown conflict type
        conflicts.push({
          file_path: trimmed,
          conflict_type: "conflict",
        });
      }
    }

    return Result.ok(conflicts);
  }

  // =========================================================================
  // File operations
  // =========================================================================

  /**
   * Read file content at a specific change.
   * Equivalent to Go's repohost.Client.GetFileAtChange.
   */
  async getFileAtChange(
    owner: string,
    repo: string,
    changeId: string,
    filePath: string
  ): Promise<Result<FileContent, APIError>> {
    const pathResult = await this.ensureRepo(owner, repo);
    if (Result.isError(pathResult)) return pathResult;
    const repoPath = pathResult.value;

    const result = await execJJ(repoPath, [
      "file",
      "show",
      "-r",
      changeId,
      filePath,
    ]);

    if (result.exitCode !== 0) {
      const msg = result.stderr.trim();
      if (
        msg.includes("No such path") ||
        msg.includes("not found") ||
        msg.includes("doesn't exist") ||
        msg.includes("No such file")
      ) {
        return Result.err(notFound(`file '${filePath}' not found at change '${changeId}'`));
      }
      if (msg.includes("Revision") || msg.includes("No such change")) {
        return Result.err(notFound(`change '${changeId}' not found`));
      }
      return Result.err(internal(`failed to get file: ${msg}`));
    }

    return Result.ok({
      path: filePath,
      content: result.stdout,
    });
  }

  // =========================================================================
  // Operation history
  // =========================================================================

  /**
   * List operation log entries.
   * Equivalent to Go's repohost.Client.ListOperations.
   */
  async listOperations(
    owner: string,
    repo: string,
    cursor?: string,
    limit?: number
  ): Promise<Result<{ items: Operation[]; nextCursor: string }, APIError>> {
    const pathResult = await this.ensureRepo(owner, repo);
    if (Result.isError(pathResult)) return pathResult;
    const repoPath = pathResult.value;

    const effectiveLimit = limit ?? 30;
    const offset = cursor ? parseInt(cursor, 10) : 0;
    const fetchCount = (isNaN(offset) ? 0 : offset) + effectiveLimit + 1;

    const result = await execJJ(repoPath, [
      "operation",
      "log",
      "--no-graph",
      "-T",
      OPERATION_TEMPLATE,
      "--limit",
      String(fetchCount),
    ]);

    if (result.exitCode !== 0) {
      return Result.err(
        internal(`failed to list operations: ${result.stderr.trim()}`)
      );
    }

    const allOps = parseOperations(result.stdout);
    const startIdx = isNaN(offset) ? 0 : offset;
    const page = allOps.slice(startIdx, startIdx + effectiveLimit);
    const hasMore = allOps.length > startIdx + effectiveLimit;
    const nextCursor = hasMore ? String(startIdx + effectiveLimit) : "";

    return Result.ok({ items: page, nextCursor });
  }

  // =========================================================================
  // Git transport helpers
  // =========================================================================

  /**
   * Spawn a git-upload-pack process for the repository's colocated git backend.
   * Returns the subprocess handle for bidirectional streaming.
   */
  gitUploadPack(owner: string, repo: string): Subprocess {
    const repoPath = this.repoPath(owner, repo);
    // The colocated git repo lives at the same path
    return Bun.spawn(["git-upload-pack", repoPath], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
  }

  /**
   * Spawn a git-receive-pack process for the repository's colocated git backend.
   * Returns the subprocess handle for bidirectional streaming.
   */
  gitReceivePack(owner: string, repo: string): Subprocess {
    const repoPath = this.repoPath(owner, repo);
    return Bun.spawn(["git-receive-pack", repoPath], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
  }

  /**
   * Import git refs into jj after a git push.
   * Equivalent to Go's repohost.Client.ImportRefs.
   */
  async importRefs(
    owner: string,
    repo: string
  ): Promise<Result<void, APIError>> {
    const pathResult = await this.ensureRepo(owner, repo);
    if (Result.isError(pathResult)) return pathResult;
    const repoPath = pathResult.value;

    const result = await execJJChecked(repoPath, ["git", "import"]);
    if (Result.isError(result)) return Result.err(result.error);

    return Result.ok(undefined);
  }
}

// ---------------------------------------------------------------------------
// Output parsers
// ---------------------------------------------------------------------------

/**
 * Parse changes from jj log output using RECORD_SEP / FIELD_SEP delimiters.
 */
function parseChanges(output: string): Change[] {
  const changes: Change[] = [];
  const records = output.split(RECORD_SEP).filter((r) => r.trim());

  for (const record of records) {
    const fields = record.split(FIELD_SEP);
    if (fields.length < 8) continue;

    const changeId = fields[0]!.trim();
    const commitId = fields[1]!.trim();
    const description = fields[2]!.trim();
    const authorName = fields[3]!.trim();
    const authorEmail = fields[4]!.trim();
    const timestamp = fields[5]!.trim();
    const hasConflict = fields[6]!.trim() === "true";
    const isEmpty = fields[7]!.trim() === "true";
    const parentIds = (fields[8] ?? "")
      .trim()
      .split(",")
      .filter((id) => id.trim())
      .map((id) => id.trim());

    if (!changeId) continue;

    changes.push({
      change_id: changeId,
      commit_id: commitId,
      description,
      author_name: authorName,
      author_email: authorEmail,
      timestamp,
      has_conflict: hasConflict,
      is_empty: isEmpty,
      parent_change_ids: parentIds,
    });
  }

  return changes;
}

/**
 * Parse operations from jj operation log output.
 */
function parseOperations(output: string): Operation[] {
  const operations: Operation[] = [];
  const records = output.split(RECORD_SEP).filter((r) => r.trim());

  for (const record of records) {
    const fields = record.split(FIELD_SEP);
    if (fields.length < 3) continue;

    const operationId = fields[0]!.trim();
    const description = fields[1]!.trim();
    const timestamp = fields[2]!.trim();

    if (!operationId) continue;

    operations.push({
      operation_id: operationId,
      description,
      timestamp,
    });
  }

  return operations;
}

/**
 * Parse git-format diff output into structured FileDiffItem entries.
 *
 * The git diff format looks like:
 *   diff --git a/file.txt b/file.txt
 *   new file mode 100644
 *   --- /dev/null
 *   +++ b/file.txt
 *   @@ -0,0 +1,5 @@
 *   +line1
 *   ...
 */
function parseGitDiff(diffOutput: string): FileDiffItem[] {
  const fileDiffs: FileDiffItem[] = [];
  if (!diffOutput.trim()) return fileDiffs;

  // Split into per-file sections by "diff --git" headers
  const sections = diffOutput.split(/^diff --git /m).filter((s) => s.trim());

  for (const section of sections) {
    const lines = section.split("\n");
    const headerLine = lines[0] ?? "";

    // Parse file paths from "a/path b/path"
    const pathMatch = headerLine.match(/^a\/(.+?) b\/(.+?)$/);
    if (!pathMatch) continue;

    const oldPath = pathMatch[1]!;
    const newPath = pathMatch[2]!;

    // Determine change type from mode lines
    let changeType = "modified";
    const sectionText = section;
    if (sectionText.includes("new file mode")) {
      changeType = "added";
    } else if (sectionText.includes("deleted file mode")) {
      changeType = "deleted";
    } else if (sectionText.includes("rename from")) {
      changeType = "renamed";
    } else if (sectionText.includes("copy from")) {
      changeType = "copied";
    }

    // Check for binary
    const isBinary = sectionText.includes("Binary files") || sectionText.includes("GIT binary patch");

    // Count additions and deletions from hunk lines
    let additions = 0;
    let deletions = 0;
    const patchLines: string[] = [];
    let inHunk = false;

    for (const line of lines) {
      if (line.startsWith("@@")) {
        inHunk = true;
        patchLines.push(line);
        continue;
      }
      if (inHunk) {
        patchLines.push(line);
        if (line.startsWith("+") && !line.startsWith("+++")) {
          additions++;
        } else if (line.startsWith("-") && !line.startsWith("---")) {
          deletions++;
        }
      }
    }

    // Detect language from file extension
    const language = detectLanguage(newPath);

    const item: FileDiffItem = {
      path: newPath,
      change_type: changeType,
      is_binary: isBinary,
      additions,
      deletions,
      patch: patchLines.length > 0 ? patchLines.join("\n") : undefined,
      language: language || undefined,
    };

    if (changeType === "renamed" || changeType === "copied") {
      item.old_path = oldPath;
    }

    fileDiffs.push(item);
  }

  return fileDiffs;
}

/**
 * Detect programming language from file extension.
 */
function detectLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const languageMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    rs: "rust",
    go: "go",
    rb: "ruby",
    java: "java",
    kt: "kotlin",
    swift: "swift",
    c: "c",
    h: "c",
    cpp: "cpp",
    cc: "cpp",
    cxx: "cpp",
    hpp: "cpp",
    cs: "csharp",
    zig: "zig",
    lua: "lua",
    sh: "shell",
    bash: "shell",
    zsh: "shell",
    fish: "shell",
    sql: "sql",
    md: "markdown",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    xml: "xml",
    html: "html",
    css: "css",
    scss: "scss",
    less: "less",
    vue: "vue",
    svelte: "svelte",
    astro: "astro",
    dockerfile: "dockerfile",
    makefile: "makefile",
  };

  return languageMap[ext] ?? "";
}

// ---------------------------------------------------------------------------
// Factory / singleton
// ---------------------------------------------------------------------------

let instance: RepoHostService | null = null;

export function getRepoHostService(): RepoHostService {
  if (!instance) {
    instance = new RepoHostService();
  }
  return instance;
}

export function createRepoHostService(reposBaseDir?: string): RepoHostService {
  return new RepoHostService(reposBaseDir);
}
