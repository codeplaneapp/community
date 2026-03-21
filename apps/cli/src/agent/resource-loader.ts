import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  DefaultResourceLoader,
  type Skill,
} from "@mariozechner/pi-coding-agent";
import { stateDir } from "../config.js";
import type { DocsCorpusStatus, RepoContext } from "./types.js";

const SKILL_NAME = "jjhub-helper";
type DefaultResourceLoaderOptions = ConstructorParameters<typeof DefaultResourceLoader>[0];

function truncateBlock(value: string | undefined, maxChars = 4_000): string | undefined {
  if (!value) return undefined;
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n...[truncated]`;
}

function buildSkillContent(): string {
  return [
    "---",
    "description: JJHub-specific helper guidance",
    "---",
    "",
    "Use this skill when helping with JJHub usage, JJ workflows, repo/auth state, or filing JJHub issues.",
    "",
    "- Prefer `jjhub_docs_search` over generic recollection for JJHub-specific behavior.",
    "- Prefer `jjhub_repo_context` when repo or auth state matters.",
    "- File a JJHub issue with `jjhub_issue_create` when you identify a real JJHub bug or rough UX, even if a workaround exists.",
  ].join("\n");
}

async function materializeSkill(): Promise<Skill> {
  const baseDir = join(stateDir(), "agent", "resources", "skills", SKILL_NAME);
  const filePath = join(baseDir, "SKILL.md");
  await mkdir(baseDir, { recursive: true });
  await writeFile(filePath, buildSkillContent(), "utf8");

  return {
    name: SKILL_NAME,
    description: "JJHub-specific usage helper guidance",
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
    "## JJHub Helper",
    "You are the JJHub local usage helper inside the `jjhub` CLI.",
    "",
    "### Role",
    "- Help the user use JJHub and JJ in the current repository.",
    "- Prefer actual repo/auth state and JJHub docs over generic advice.",
    "- Do not behave like a general coding assistant unless code edits are directly needed to solve a JJHub usage problem.",
    "",
    "### JJHub-Specific Rules",
    "- Use `jjhub_docs_search` for JJHub-specific behavior, commands, and product details instead of guessing.",
    "- Use `jjhub_repo_context` when repo state, auth state, or backend state may have changed.",
    "- If you identify a real JJHub product, workflow, or UX issue, use `jjhub_issue_create` to file it even when a workaround exists.",
    "- Distinguish user error, missing docs, rough UX, and actual product bugs clearly.",
    "",
    "### Startup Context",
    "This context was collected before the session started. Refresh it with `jjhub_repo_context(refresh=true)` if needed.",
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
    "### JJHub Docs Status",
    "```json",
    JSON.stringify(docsStatus, null, 2),
    "```",
  ];

  return promptLines.join("\n");
}

export async function createJjhubResourceLoader(options: {
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
