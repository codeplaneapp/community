import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  DefaultResourceLoader,
  type Skill,
} from "@mariozechner/pi-coding-agent";
import { stateDir } from "../config.js";
import type { DocsCorpusStatus, RepoContext } from "./types.js";

const SKILL_NAME = "codeplane-helper";
type DefaultResourceLoaderOptions = ConstructorParameters<typeof DefaultResourceLoader>[0];

function truncateBlock(value: string | undefined, maxChars = 4_000): string | undefined {
  if (!value) return undefined;
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n...[truncated]`;
}

function buildSkillContent(): string {
  return [
    "---",
    "description: Codeplane-specific helper guidance",
    "---",
    "",
    "Use this skill when helping with Codeplane usage, JJ workflows, repo/auth state, or filing Codeplane issues.",
    "",
    "- Prefer `codeplane_docs_search` over generic recollection for Codeplane-specific behavior.",
    "- Prefer `codeplane_repo_context` when repo or auth state matters.",
    "- File a Codeplane issue with `codeplane_issue_create` when you identify a real Codeplane bug or rough UX, even if a workaround exists.",
  ].join("\n");
}

async function materializeSkill(): Promise<Skill> {
  const baseDir = join(stateDir(), "agent", "resources", "skills", SKILL_NAME);
  const filePath = join(baseDir, "SKILL.md");
  await mkdir(baseDir, { recursive: true });
  await writeFile(filePath, buildSkillContent(), "utf8");

  return {
    name: SKILL_NAME,
    description: "Codeplane-specific usage helper guidance",
    filePath,
    baseDir,
    source: "path",
    disableModelInvocation: false,
  };
}

function buildPromptAppendix(
  repoContext: RepoContext,
  docsStatus: DocsCorpusStatus,
  backendContext: Record<string, unknown>,
): string {
  const promptLines = [
    "## Codeplane Helper",
    "You are the Codeplane local usage helper inside the `codeplane` CLI.",
    "",
    "### Role",
    "- Help the user use Codeplane and JJ in the current repository.",
    "- Prefer actual repo/auth state and Codeplane docs over generic advice.",
    "- Do not behave like a general coding assistant unless code edits are directly needed to solve a Codeplane usage problem.",
    "",
    "### Codeplane-Specific Rules",
    "- Use `codeplane_docs_search` for Codeplane-specific behavior, commands, and product details instead of guessing.",
    "- Use `codeplane_repo_context` when repo state, auth state, or backend state may have changed.",
    "- If you identify a real Codeplane product, workflow, or UX issue, use `codeplane_issue_create` to file it even when a workaround exists.",
    "- Distinguish user error, missing docs, rough UX, and actual product bugs clearly.",
    "",
    "### Startup Context",
    "This context was collected before the session started. Refresh it with `codeplane_repo_context(refresh=true)` if needed.",
    "```json",
    JSON.stringify(
      {
        collected_at: repoContext.collectedAt,
        cwd: repoContext.cwd,
        repo_root: repoContext.repoRoot,
        repo_slug: repoContext.repoSlug,
        repo_source: repoContext.repoSource,
        auth: repoContext.auth,
        remote_repo: repoContext.remoteRepo,
        backend: backendContext,
        warnings: repoContext.warnings,
        jj_git_remote_list: truncateBlock(repoContext.jjRemotes.output),
        jj_status: truncateBlock(repoContext.jjStatus.output),
      },
      null,
      2,
    ),
    "```",
    "",
    "### Codeplane Docs Status",
    "```json",
    JSON.stringify(docsStatus, null, 2),
    "```",
  ];

  return promptLines.join("\n");
}

export async function createCodeplaneResourceLoader(options: {
  cwd: string;
  repoContext: RepoContext;
  docsStatus: DocsCorpusStatus;
  backendContext: Record<string, unknown>;
}): Promise<DefaultResourceLoader> {
  const skill = await materializeSkill();

  const loaderOptions: DefaultResourceLoaderOptions = {
    cwd: options.cwd,
    noExtensions: true,
    noPromptTemplates: true,
    skillsOverride: () => ({
      skills: [skill],
      diagnostics: [],
    }),
    agentsFilesOverride: () => ({ agentsFiles: [] }),
    systemPromptOverride: () => undefined,
    appendSystemPromptOverride: () => [
      buildPromptAppendix(options.repoContext, options.docsStatus, options.backendContext),
    ],
  };

  const loader = new DefaultResourceLoader(loaderOptions);
  await loader.reload();
  return loader;
}
