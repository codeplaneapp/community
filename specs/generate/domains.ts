/**
 * Domain configurations for the unified workflow.
 *
 * Each domain (platform, tui) has its own feature inventory, specs directory,
 * system prompts, and implementation rules. The unified workflow uses these
 * configs to handle both domains from a single pipeline.
 */
import * as fsSync from "node:fs";
import * as path from "node:path";

export interface DomainConfig {
  /** Unique domain identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Directory containing specs, tickets, engineering docs */
  specsDir: string;
  /** Bookmark prefix for jj bookmarks (e.g. "impl/", "tui-impl/") */
  bookmarkPrefix: string;
  /** GitHub label for issues/PRs */
  githubLabel: string;
  /** Feature names from the domain's features.ts */
  featureNames: string[];
  /** Build the base system prompt (injected with diff text) */
  buildSystemPrompt: (diffText: string) => string;
  /** Implementation-specific system prompt suffix for the implement agent */
  implementPromptSuffix: string;
  /** Review-specific system prompt suffix for the review agent */
  reviewPromptSuffix: string;
}

function readFileSafe(p: string, maxLen?: number): string {
  try {
    const content = fsSync.readFileSync(p, "utf-8");
    return maxLen ? content.slice(0, maxLen) : content;
  } catch {
    return "";
  }
}

function repoRoot(): string {
  return path.resolve(__dirname, "..", "..");
}

/** Platform domain — server, CLI, web, desktop, SDK */
export function createPlatformDomain(): DomainConfig {
  const specsDir = path.resolve(__dirname, "..");
  const root = repoRoot();

  // Lazily load features
  let _features: string[] | null = null;
  function getFeatures(): string[] {
    if (!_features) {
      try {
        const mod = require(path.join(specsDir, "features"));
        _features = Object.keys(mod.Features || mod.default || mod);
      } catch {
        _features = [];
      }
    }
    return _features!;
  }

  return {
    id: "platform",
    name: "Codeplane Platform",
    specsDir,
    bookmarkPrefix: "impl/",
    githubLabel: "platform",
    get featureNames() {
      return getFeatures();
    },
    buildSystemPrompt(diffText: string) {
      const prdContent = readFileSafe(path.join(specsDir, "prd.md"));
      const designContent = readFileSafe(path.join(specsDir, "design.md"));

      return `You are an expert product manager, software architect, and QA engineer. Write clear, structured, and incredibly robust specifications.

Context:
--- PRD ---
${prdContent}

--- DESIGN ---
${designContent}${diffText}`;
    },
    implementPromptSuffix: `

You are an elite software engineer. You implement features meticulously, running tests to verify your work. You have full access to the codebase via your tools. Use them to read, write, edit, and run tests. Your goal is to produce flawless, working code that exactly matches the specifications.

CRITICAL TOOL USAGE:
- ALWAYS use the write_file or edit_file tools to create and modify files. NEVER use bash heredocs (cat << EOF), echo redirection, or sed for writing code files.
- Use the read_file tool to read existing files before modifying them.
- Use bash ONLY for running commands (tests, builds, git/jj operations).

Key implementation guidelines:
- There is POC code in apps/, packages/sdk, and packages/workflow — productionize it
- Ensure robust error handling, strict typing, and proper logging
- Write or update E2E tests in e2e/
- Write or update documentation in docs/
- Use jj bookmark create for scoped, atomic emoji conventional commits`,
    reviewPromptSuffix: `

You are the strictest code reviewer in the world. You run tests, read code, and look for edge cases. If there is ANY way to improve the code, even nits, you reject it. You demand perfection.`,
  };
}

/** TUI domain — React 19 + OpenTUI terminal client */
export function createTUIDomain(): DomainConfig {
  const specsDir = path.resolve(__dirname, "..", "tui");
  const root = repoRoot();

  let _features: string[] | null = null;
  function getFeatures(): string[] {
    if (!_features) {
      try {
        const mod = require(path.join(specsDir, "features"));
        _features = Object.keys(mod.TUIFeatures || mod.default || mod);
      } catch {
        _features = [];
      }
    }
    return _features!;
  }

  return {
    id: "tui",
    name: "Codeplane TUI",
    specsDir,
    bookmarkPrefix: "tui-impl/",
    githubLabel: "tui",
    get featureNames() {
      return getFeatures();
    },
    buildSystemPrompt(diffText: string) {
      const prdContent = readFileSafe(path.join(specsDir, "prd.md"));
      const designContent = readFileSafe(path.join(specsDir, "design.md"));
      const platformPrdContent = readFileSafe(path.join(root, "specs", "prd.md"), 4000);
      const opentuiRef = readFileSafe(path.join(root, "context", "opentui", "README.md"), 4000);

      return `You are an expert product manager, software architect, and QA engineer specializing in terminal user interfaces. Write clear, structured, and incredibly robust specifications.

You are working on the Codeplane TUI — a first-class terminal client built with React 19 + OpenTUI.

Context:
--- TUI PRD ---
${prdContent}

--- TUI DESIGN ---
${designContent}

--- PLATFORM PRD (for broader context) ---
${platformPrdContent}

--- OPENTUI COMPONENT REFERENCE ---
${opentuiRef}

Key TUI constraints:
- Keyboard-first (vim-style j/k/h/l navigation)
- Min 80x24 terminal, ANSI 256 color baseline
- No images, no browser, no mouse required
- Uses OpenTUI components: <box>, <scrollbox>, <text>, <input>, <select>, <code>, <diff>, <markdown>
- Uses OpenTUI hooks: useKeyboard, useTerminalDimensions, useOnResize, useTimeline
- Consumes @codeplane/ui-core hooks and API client
- All implementation targets apps/tui/src/
- All tests target e2e/tui/ using @microsoft/tui-test${diffText}`;
    },
    implementPromptSuffix: `

You are an elite software engineer specializing in terminal UIs with React 19 + OpenTUI. You implement features meticulously, running tests to verify your work. You have full access to the codebase via your tools. Use them to read, write, edit, and run tests. Your goal is to produce flawless, working code that exactly matches the specifications.

CRITICAL TOOL USAGE:
- ALWAYS use the write_file or edit_file tools to create and modify files. NEVER use bash heredocs (cat << EOF), echo redirection, or sed for writing code files.
- Use the read_file tool to read existing files before modifying them.
- Use bash ONLY for running commands (tests, builds, git/jj operations).

Key implementation guidelines:
- All TUI code goes in apps/tui/src/
- Use OpenTUI components (<box>, <scrollbox>, <text>, <input>, <select>, <code>, <diff>, <markdown>)
- Use OpenTUI hooks (useKeyboard, useTerminalDimensions, useOnResize, useTimeline)
- Consume @codeplane/ui-core for data hooks and API client
- E2E tests use @microsoft/tui-test with snapshot matching and keyboard interaction simulation
- Tests that fail due to unimplemented backends are left failing (never skip or comment)
- Search apps/tui/, context/opentui/, and packages/ui-core/ for patterns and APIs`,
    reviewPromptSuffix: `

You are the strictest code reviewer in the world. You run tests, read code, and look for edge cases. If there is ANY way to improve the code, even nits, you reject it. You demand perfection.

TUI-specific review checklist:
- Verify OpenTUI components and hooks are used correctly
- Verify keyboard interactions match the TUI design spec
- Verify @codeplane/ui-core hooks are used for data access (no direct API calls)
- Verify responsive behavior at 80x24 minimum`,
  };
}

/** Get all registered domains */
export function getAllDomains(): DomainConfig[] {
  return [createPlatformDomain(), createTUIDomain()];
}

/** Get a domain by ID */
export function getDomain(id: string): DomainConfig {
  const domains = getAllDomains();
  const domain = domains.find((d) => d.id === id);
  if (!domain) throw new Error(`Unknown domain: ${id}. Available: ${domains.map((d) => d.id).join(", ")}`);
  return domain;
}
