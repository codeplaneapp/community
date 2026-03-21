import {
  createAgentSession,
  InteractiveMode,
  SessionManager,
  type CreateAgentSessionOptions,
} from "@mariozechner/pi-coding-agent";
import { collectRepoContext } from "./repo-context.js";
import { refreshDocsCache } from "./docs-cache.js";
import { prepareDocsIndex } from "./docs-index.js";
import { createLocalBackend } from "./backends/local.js";
import { createWorkspaceBackend } from "./backends/workspace.js";
import { createJjhubResourceLoader } from "./resource-loader.js";
import { createJjhubContextTool } from "./tools/jjhub-context.js";
import { createJjhubDocsTool } from "./tools/jjhub-docs.js";
import { createJjhubIssueTool } from "./tools/jjhub-issue.js";
import type {
  AgentExecutionBackend,
  DocsCorpusStatus,
  RepoContext,
} from "./types.js";

export interface RunAgentOptions {
  format: "toon" | "json" | "yaml" | "md" | "jsonl";
  formatExplicit: boolean;
  prompt?: string;
  repoOverride?: string;
  sandbox?: boolean;
}

interface InitializedAgentRuntime {
  backend: AgentExecutionBackend;
  docsEntry: Awaited<ReturnType<typeof refreshDocsCache>>;
  docsIndex: Awaited<ReturnType<typeof prepareDocsIndex>>;
  repoContext: RepoContext;
  sessionResult: Awaited<ReturnType<typeof createAgentSession>>;
}

interface BaseAgentRuntime {
  backend: AgentExecutionBackend;
  repoContext: RepoContext;
}

const DEFAULT_DOCS_REFRESH_TIMEOUT_MS = 3_000;

function buildStructuredResponse(
  runtime: Pick<BaseAgentRuntime, "backend" | "repoContext">,
  docsStatus: DocsCorpusStatus,
  response?: string,
) {
  return {
    backend: runtime.backend.kind,
    repo_context: runtime.repoContext,
    docs_status: docsStatus,
    ...(response !== undefined ? { response } : {}),
  };
}

function createSkippedDocsStatus(): DocsCorpusStatus {
  return {
    url: process.env.JJHUB_AGENT_DOCS_URL ?? "https://docs.jjhub.tech/llms-full.txt",
    status: "unavailable",
    source: "none",
    warning: "JJHub docs refresh was skipped for lightweight summary mode.",
  };
}

function getDocsRefreshTimeoutMs(): number {
  const raw = process.env.JJHUB_AGENT_DOCS_TIMEOUT_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_DOCS_REFRESH_TIMEOUT_MS;
}

function createDocsRefreshSignal(): AbortSignal | undefined {
  const timeoutMs = getDocsRefreshTimeoutMs();
  if (typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(timeoutMs);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  timeoutId.unref?.();
  return controller.signal;
}

async function promptOnce(
  session: InitializedAgentRuntime["sessionResult"]["session"],
  prompt: string,
): Promise<string> {
  let response = "";
  const unsubscribe = session.subscribe((event) => {
    if (
      event.type === "message_update" &&
      event.assistantMessageEvent.type === "text_delta"
    ) {
      response += event.assistantMessageEvent.delta;
    }
  });

  try {
    await session.prompt(prompt);
  } finally {
    unsubscribe();
  }

  return response.trim();
}

async function createBackend(
  sandbox: boolean | undefined,
  repoContext: RepoContext,
): Promise<AgentExecutionBackend> {
  if (!sandbox) {
    return createLocalBackend(repoContext);
  }
  return createWorkspaceBackend({ repoContext });
}

async function initializeBaseAgentRuntime(
  options: Omit<RunAgentOptions, "format" | "formatExplicit">,
): Promise<BaseAgentRuntime> {
  const repoContext = await collectRepoContext({
    cwd: process.cwd(),
    repoOverride: options.repoOverride,
  });
  const backend = await createBackend(options.sandbox, repoContext);
  repoContext.backend = backend.describeContext();

  return { backend, repoContext };
}

export async function initializeAgentRuntime(
  options: Omit<RunAgentOptions, "format" | "formatExplicit">,
): Promise<InitializedAgentRuntime> {
  const { backend, repoContext } = await initializeBaseAgentRuntime(options);

  const docsEntry = await refreshDocsCache({
    signal: createDocsRefreshSignal(),
  });
  const docsIndex = await prepareDocsIndex(docsEntry);
  const contextRef = { current: repoContext };
  const resourceLoader = await createJjhubResourceLoader({
    cwd: backend.cwd,
    repoContext,
    docsStatus: docsEntry.status,
    backendContext: backend.describeContext(),
  });
  const customTools = [
    createJjhubDocsTool(docsIndex, docsEntry.status),
    createJjhubContextTool(contextRef, {
      repoOverride: options.repoOverride,
      backendContext: () => backend.describeContext(),
    }),
    createJjhubIssueTool(contextRef),
  ] as unknown as NonNullable<CreateAgentSessionOptions["customTools"]>;

  const sessionResult = await createAgentSession({
    cwd: backend.cwd,
    tools: backend.createPiTools(),
    customTools,
    resourceLoader,
    sessionManager: SessionManager.inMemory(),
  });

  return {
    backend,
    docsEntry,
    docsIndex,
    repoContext,
    sessionResult,
  };
}

export async function runAgent(options: RunAgentOptions): Promise<unknown> {
  const testMode = process.env.JJHUB_AGENT_TEST_MODE;
  let baseRuntime: BaseAgentRuntime | undefined;
  let runtime: InitializedAgentRuntime | undefined;

  try {
    if (testMode === "summary") {
      baseRuntime = await initializeBaseAgentRuntime(options);
      return buildStructuredResponse(baseRuntime, createSkippedDocsStatus(), options.prompt);
    }

    runtime = await initializeAgentRuntime(options);

    if (options.prompt) {
      const response = await promptOnce(runtime.sessionResult.session, options.prompt);
      if (options.formatExplicit && options.format !== "toon") {
        return buildStructuredResponse(runtime, runtime.docsEntry.status, response);
      }

      process.stdout.write(response + (response.endsWith("\n") ? "" : "\n"));
      return undefined;
    }

    if (options.formatExplicit && options.format !== "toon") {
      throw new Error(
        "Interactive `jjhub agent` only supports the default text output mode.",
      );
    }

    const mode = new InteractiveMode(runtime.sessionResult.session, {
      modelFallbackMessage: runtime.sessionResult.modelFallbackMessage,
    });
    await mode.run();
    return undefined;
  } finally {
    runtime?.sessionResult.session.dispose();
    if (runtime) {
      await runtime.backend.dispose();
    } else if (baseRuntime) {
      await baseRuntime.backend.dispose();
    }
  }
}
