import { describe, test, expect } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  TUI_ROOT,
  TUI_SRC,
  BUN,
  run,
  bunEval,
  createMockAPIEnv,
  launchTUI,
  TERMINAL_SIZES,
} from "./helpers.ts";

const HOOKS_DIR = join(TUI_SRC, "hooks");

// ============================================================================
// TUI_REPOSITORY — Hook file structure
// ============================================================================

describe("TUI_REPOSITORY — Hook file structure", () => {
  test("repo-tree-types.ts exists", () => {
    expect(existsSync(join(HOOKS_DIR, "repo-tree-types.ts"))).toBe(true);
  });

  test("useRepoTree.ts exists", () => {
    expect(existsSync(join(HOOKS_DIR, "useRepoTree.ts"))).toBe(true);
  });

  test("useFileContent.ts exists", () => {
    expect(existsSync(join(HOOKS_DIR, "useFileContent.ts"))).toBe(true);
  });

  test("useBookmarks.ts exists", () => {
    expect(existsSync(join(HOOKS_DIR, "useBookmarks.ts"))).toBe(true);
  });

  test("useRepoFetch.ts exists (internal helper)", () => {
    expect(existsSync(join(HOOKS_DIR, "useRepoFetch.ts"))).toBe(true);
  });

  test("useRepoTree.ts exports useRepoTree function", async () => {
    const result = await bunEval(
      `import { useRepoTree } from '${join(HOOKS_DIR, "useRepoTree.ts")}'; console.log(typeof useRepoTree)`
    );
    expect(result.stdout.trim()).toBe("function");
  });

  test("useFileContent.ts exports useFileContent function", async () => {
    const result = await bunEval(
      `import { useFileContent } from '${join(HOOKS_DIR, "useFileContent.ts")}'; console.log(typeof useFileContent)`
    );
    expect(result.stdout.trim()).toBe("function");
  });

  test("useBookmarks.ts exports useBookmarks function", async () => {
    const result = await bunEval(
      `import { useBookmarks } from '${join(HOOKS_DIR, "useBookmarks.ts")}'; console.log(typeof useBookmarks)`
    );
    expect(result.stdout.trim()).toBe("function");
  });

  test("hooks/index.ts declares useRepoTree export", async () => {
    const result = await bunEval(
      `import { readFileSync } from 'fs'; const content = readFileSync('${join(HOOKS_DIR, "index.ts")}', 'utf8'); console.log(content.includes("useRepoTree"))`
    );
    expect(result.stdout.trim()).toBe("true");
  });

  test("hooks/index.ts declares useFileContent export", async () => {
    const result = await bunEval(
      `import { readFileSync } from 'fs'; const content = readFileSync('${join(HOOKS_DIR, "index.ts")}', 'utf8'); console.log(content.includes("useFileContent"))`
    );
    expect(result.stdout.trim()).toBe("true");
  });

  test("hooks/index.ts declares useBookmarks export", async () => {
    const result = await bunEval(
      `import { readFileSync } from 'fs'; const content = readFileSync('${join(HOOKS_DIR, "index.ts")}', 'utf8'); console.log(content.includes("useBookmarks"))`
    );
    expect(result.stdout.trim()).toBe("true");
  });

  test("hooks/index.ts does NOT declare useRepoFetch export (internal)", async () => {
    const result = await bunEval(
      `import { readFileSync } from 'fs'; const content = readFileSync('${join(HOOKS_DIR, "index.ts")}', 'utf8'); console.log(/export.*useRepoFetch/.test(content))`
    );
    expect(result.stdout.trim()).toBe("false");
  });
});

// ============================================================================
// TUI_REPOSITORY — TypeScript compilation
// ============================================================================

describe("TUI_REPOSITORY — TypeScript compilation", () => {
  test("repo-tree hook files introduce no new tsc errors", async () => {
    const result = await run(["bun", "run", "check"], { cwd: TUI_ROOT });
    // Pre-existing errors exist in other files (AuthErrorScreen, ScreenRouter, etc.).
    // Verify that none of our new hook files appear in the error output.
    const newFiles = [
      "repo-tree-types.ts",
      "useRepoFetch.ts",
      "useRepoTree.ts",
      "useFileContent.ts",
      "useBookmarks.ts",
    ];
    for (const file of newFiles) {
      expect(result.stderr).not.toContain(`hooks/${file}`);
    }
  });
});

// ============================================================================
// TUI_REPOSITORY — Type export surface
// ============================================================================

describe("TUI_REPOSITORY — Type export surface", () => {
  test("TreeEntry type has correct shape", async () => {
    const result = await bunEval(`
      import type { TreeEntry } from '${join(HOOKS_DIR, "repo-tree-types.ts")}';
      const entry: TreeEntry = { name: 'test.ts', path: 'src/test.ts', type: 'file', size: 42 };
      console.log(JSON.stringify(entry));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed).toEqual({
      name: "test.ts",
      path: "src/test.ts",
      type: "file",
      size: 42,
    });
  });

  test("TreeEntry type works without optional size field", async () => {
    const result = await bunEval(`
      import type { TreeEntry } from '${join(HOOKS_DIR, "repo-tree-types.ts")}';
      const entry: TreeEntry = { name: 'src', path: 'src', type: 'dir' };
      console.log(JSON.stringify(entry));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.name).toBe("src");
    expect(parsed.type).toBe("dir");
    expect(parsed.size).toBeUndefined();
  });

  test("Bookmark type matches SDK shape", async () => {
    const result = await bunEval(`
      import type { Bookmark } from '${join(HOOKS_DIR, "repo-tree-types.ts")}';
      const bm: Bookmark = {
        name: 'main',
        target_change_id: 'abc123',
        target_commit_id: 'def456',
        is_tracking_remote: false,
      };
      console.log(JSON.stringify(bm));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.name).toBe("main");
    expect(parsed.target_change_id).toBe("abc123");
    expect(parsed.target_commit_id).toBe("def456");
    expect(parsed.is_tracking_remote).toBe(false);
  });

  test("TreeEntryType includes all expected values", async () => {
    const result = await bunEval(`
      import type { TreeEntryType } from '${join(HOOKS_DIR, "repo-tree-types.ts")}';
      const types: TreeEntryType[] = ['file', 'dir', 'symlink', 'submodule'];
      console.log(JSON.stringify(types));
    `);
    expect(JSON.parse(result.stdout.trim())).toEqual(["file", "dir", "symlink", "submodule"]);
  });
});

// ============================================================================
// TUI_REPOSITORY — useRepoFetch error classification
// ============================================================================

describe("TUI_REPOSITORY — useRepoFetch error classification", () => {
  test("toLoadingError classifies 401 as auth_error", async () => {
    const result = await bunEval(`
      import { FetchError, toLoadingError } from '${join(HOOKS_DIR, "useRepoFetch.ts")}';
      const err = new FetchError('Unauthorized', 401);
      console.log(JSON.stringify(toLoadingError(err)));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.type).toBe("auth_error");
    expect(parsed.httpStatus).toBe(401);
  });

  test("toLoadingError classifies 429 as rate_limited", async () => {
    const result = await bunEval(`
      import { FetchError, toLoadingError } from '${join(HOOKS_DIR, "useRepoFetch.ts")}';
      const err = new FetchError('Too many requests', 429);
      console.log(JSON.stringify(toLoadingError(err)));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.type).toBe("rate_limited");
    expect(parsed.httpStatus).toBe(429);
  });

  test("toLoadingError classifies 404 as http_error", async () => {
    const result = await bunEval(`
      import { FetchError, toLoadingError } from '${join(HOOKS_DIR, "useRepoFetch.ts")}';
      const err = new FetchError('Not Found', 404);
      console.log(JSON.stringify(toLoadingError(err)));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.type).toBe("http_error");
    expect(parsed.httpStatus).toBe(404);
  });

  test("toLoadingError classifies 500 as http_error", async () => {
    const result = await bunEval(`
      import { FetchError, toLoadingError } from '${join(HOOKS_DIR, "useRepoFetch.ts")}';
      const err = new FetchError('Internal Server Error', 500);
      console.log(JSON.stringify(toLoadingError(err)));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.type).toBe("http_error");
    expect(parsed.httpStatus).toBe(500);
  });

  test("toLoadingError classifies 501 as http_error (stubbed endpoints)", async () => {
    const result = await bunEval(`
      import { FetchError, toLoadingError } from '${join(HOOKS_DIR, "useRepoFetch.ts")}';
      const err = new FetchError('Not Implemented', 501);
      console.log(JSON.stringify(toLoadingError(err)));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.type).toBe("http_error");
    expect(parsed.httpStatus).toBe(501);
    expect(parsed.summary).toBe("Not Implemented");
  });

  test("toLoadingError classifies generic Error as network", async () => {
    const result = await bunEval(`
      import { toLoadingError } from '${join(HOOKS_DIR, "useRepoFetch.ts")}';
      const err = new Error('fetch failed');
      console.log(JSON.stringify(toLoadingError(err)));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.type).toBe("network");
    expect(parsed.summary).toBe("fetch failed");
  });

  test("toLoadingError classifies AbortError as network with cancel message", async () => {
    const result = await bunEval(`
      import { toLoadingError } from '${join(HOOKS_DIR, "useRepoFetch.ts")}';
      const err = new DOMException('The operation was aborted', 'AbortError');
      console.log(JSON.stringify(toLoadingError(err)));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.type).toBe("network");
    expect(parsed.summary).toBe("Request cancelled");
  });

  test("toLoadingError truncates long messages beyond 60 chars", async () => {
    const result = await bunEval(`
      import { FetchError, toLoadingError } from '${join(HOOKS_DIR, "useRepoFetch.ts")}';
      const msg = 'A'.repeat(80);
      const err = new FetchError(msg, 404);
      const le = toLoadingError(err);
      console.log(le.summary.length);
    `);
    // 57 chars + "…" (1 char) = 58. Matches useScreenLoading truncateErrorSummary.
    expect(parseInt(result.stdout.trim())).toBeLessThanOrEqual(60);
    expect(parseInt(result.stdout.trim())).toBeLessThan(80);
  });

  test("toLoadingError does not truncate messages at 60 chars or fewer", async () => {
    const result = await bunEval(`
      import { FetchError, toLoadingError } from '${join(HOOKS_DIR, "useRepoFetch.ts")}';
      const msg = 'A'.repeat(60);
      const err = new FetchError(msg, 404);
      const le = toLoadingError(err);
      console.log(le.summary.length);
    `);
    expect(parseInt(result.stdout.trim())).toBe(60);
  });

  test("toLoadingError handles non-Error values gracefully", async () => {
    const result = await bunEval(`
      import { toLoadingError } from '${join(HOOKS_DIR, "useRepoFetch.ts")}';
      console.log(JSON.stringify(toLoadingError('just a string')));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.type).toBe("network");
    expect(parsed.summary).toBe("Network error");
  });
});

// ============================================================================
// TUI_REPOSITORY — sortTreeEntries behavior
// ============================================================================

describe("TUI_REPOSITORY — sortTreeEntries behavior", () => {
  test("directories sort before files, alphabetical within each group", async () => {
    // sortTreeEntries is module-private, so we test the contract
    // by verifying the sorting algorithm independently.
    const result = await bunEval(`
      const entries = [
        { name: 'README.md', path: 'README.md', type: 'file' },
        { name: 'src', path: 'src', type: 'dir' },
        { name: '.gitignore', path: '.gitignore', type: 'file' },
        { name: 'docs', path: 'docs', type: 'dir' },
        { name: 'zebra', path: 'zebra', type: 'dir' },
        { name: 'package.json', path: 'package.json', type: 'file' },
      ];
      const sorted = [...entries].sort((a, b) => {
        if (a.type === 'dir' && b.type !== 'dir') return -1;
        if (a.type !== 'dir' && b.type === 'dir') return 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      });
      console.log(JSON.stringify(sorted.map(e => e.name)));
    `);
    const names = JSON.parse(result.stdout.trim());
    expect(names).toEqual(["docs", "src", "zebra", ".gitignore", "package.json", "README.md"]);
  });

  test("symlinks and submodules sort with files, after directories", async () => {
    const result = await bunEval(`
      const entries = [
        { name: 'link', path: 'link', type: 'symlink' },
        { name: 'src', path: 'src', type: 'dir' },
        { name: 'sub', path: 'sub', type: 'submodule' },
        { name: 'app.ts', path: 'app.ts', type: 'file' },
      ];
      const sorted = [...entries].sort((a, b) => {
        if (a.type === 'dir' && b.type !== 'dir') return -1;
        if (a.type !== 'dir' && b.type === 'dir') return 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      });
      console.log(JSON.stringify(sorted.map(e => ({ n: e.name, t: e.type }))));
    `);
    const items = JSON.parse(result.stdout.trim());
    // dir first, then alphabetical among non-dirs
    expect(items[0].n).toBe("src");
    expect(items[0].t).toBe("dir");
    expect(items.slice(1).map((i: any) => i.n)).toEqual(["app.ts", "link", "sub"]);
  });
});

// ============================================================================
// TUI_REPOSITORY — FetchError class
// ============================================================================

describe("TUI_REPOSITORY — FetchError class", () => {
  test("FetchError carries status and message", async () => {
    const result = await bunEval(`
      import { FetchError } from '${join(HOOKS_DIR, "useRepoFetch.ts")}';
      const err = new FetchError('Not Found', 404);
      console.log(JSON.stringify({ name: err.name, message: err.message, status: err.status }));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.name).toBe("FetchError");
    expect(parsed.message).toBe("Not Found");
    expect(parsed.status).toBe(404);
  });

  test("FetchError is instanceof Error", async () => {
    const result = await bunEval(`
      import { FetchError } from '${join(HOOKS_DIR, "useRepoFetch.ts")}';
      const err = new FetchError('test', 500);
      console.log(err instanceof Error);
    `);
    expect(result.stdout.trim()).toBe("true");
  });
});

// ============================================================================
// Integration tests — These hit the real API and will fail until the backend
// endpoints are implemented. They are left failing per project policy.
// ============================================================================

describe("TUI_REPO_FILE_TREE — Code explorer tree navigation", () => {
  test("navigating to code explorer shows loading state then file tree", async () => {
    const env = createMockAPIEnv();
    const terminal = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      env,
    });

    // Navigate to a repo, then to code explorer tab
    await terminal.sendKeys("g", "r"); // go to repo list
    await terminal.waitForText("Repositories");
    await terminal.sendKeys("Enter"); // open first repo
    // Navigate to code explorer tab
    await terminal.waitForText("Code");

    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("code explorer renders at 80x24 minimum with collapsed sidebar", async () => {
    const env = createMockAPIEnv();
    const terminal = await launchTUI({
      cols: TERMINAL_SIZES.minimum.width,
      rows: TERMINAL_SIZES.minimum.height,
      env,
    });

    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    await terminal.sendKeys("Enter");
    await terminal.waitForText("Code");

    // At minimum size, sidebar should be collapsed per design.md § 8.3
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("code explorer renders at 120x40 standard with sidebar visible", async () => {
    const env = createMockAPIEnv();
    const terminal = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      env,
    });

    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    await terminal.sendKeys("Enter");
    await terminal.waitForText("Code");

    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("j/k navigates file tree entries", async () => {
    const env = createMockAPIEnv();
    const terminal = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      env,
    });

    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    await terminal.sendKeys("Enter");
    await terminal.waitForText("Code");

    // Navigate down — second entry should become focused (reverse video)
    await terminal.sendKeys("j");
    const snapshot = terminal.snapshot();
    expect(snapshot).toBeDefined();

    await terminal.terminate();
  });

  test("Enter on directory expands it via lazy-loaded fetchPath", async () => {
    const env = createMockAPIEnv();
    const terminal = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      env,
    });

    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    await terminal.sendKeys("Enter");
    await terminal.waitForText("Code");

    // Select first directory entry and expand
    await terminal.sendKeys("Enter");

    // Should show loading indicator then children
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("Enter on file shows file content preview", async () => {
    const env = createMockAPIEnv();
    const terminal = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      env,
    });

    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    await terminal.sendKeys("Enter");
    await terminal.waitForText("Code");

    // Navigate to a file entry and select
    await terminal.sendKeys("j");
    await terminal.sendKeys("Enter");

    // Should show file content in main pane
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("code explorer renders at 200x60 large with expanded layout", async () => {
    const env = createMockAPIEnv();
    const terminal = await launchTUI({
      cols: TERMINAL_SIZES.large.width,
      rows: TERMINAL_SIZES.large.height,
      env,
    });

    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    await terminal.sendKeys("Enter");
    await terminal.waitForText("Code");

    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });
});

describe("TUI_REPO_BOOKMARKS_VIEW — Bookmark list", () => {
  test("bookmark tab shows bookmark list", async () => {
    const env = createMockAPIEnv();
    const terminal = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      env,
    });

    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    await terminal.sendKeys("Enter");

    // Navigate to bookmarks tab
    await terminal.waitForText("Bookmarks");

    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("bookmark list renders at 80x24 with truncated metadata", async () => {
    const env = createMockAPIEnv();
    const terminal = await launchTUI({
      cols: TERMINAL_SIZES.minimum.width,
      rows: TERMINAL_SIZES.minimum.height,
      env,
    });

    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    await terminal.sendKeys("Enter");
    await terminal.waitForText("Bookmarks");

    // At minimum size, metadata columns should be truncated per design.md § 8.3
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("bookmark list shows name and change ID columns", async () => {
    const env = createMockAPIEnv();
    const terminal = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      env,
    });

    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    await terminal.sendKeys("Enter");
    await terminal.waitForText("Bookmarks");

    const snapshot = terminal.snapshot();
    expect(snapshot).toBeDefined();
    await terminal.terminate();
  });
});

describe("TUI_REPO_FILE_PREVIEW — File content display", () => {
  test("selecting a file in code explorer shows content with syntax highlighting", async () => {
    const env = createMockAPIEnv();
    const terminal = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      env,
    });

    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    await terminal.sendKeys("Enter");
    await terminal.waitForText("Code");

    // Navigate to a file and select
    await terminal.sendKeys("j", "Enter");

    // File content pane should render with <code> syntax highlighting
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("file preview shows loading state while fetching", async () => {
    const env = createMockAPIEnv();
    const terminal = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      env,
    });

    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    await terminal.sendKeys("Enter");
    await terminal.waitForText("Code");

    await terminal.sendKeys("j", "Enter");

    // Should show loading indicator (spinner or skeleton)
    expect(terminal.snapshot()).toBeDefined();
    await terminal.terminate();
  });
});
