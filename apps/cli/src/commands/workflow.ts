import { Cli, z } from "incur";
import { requireAuthToken } from "../auth-state.js";
import { api, resolveRepoRef } from "../client.js";

/**
 * Stream SSE events from a workflow run endpoint.
 * Parses SSE event types (log, status, done) and writes human-readable output
 * to stdout (logs) and stderr (status messages).
 *
 * Returns the collected events for --json output.
 */
async function streamWorkflowRunEvents(
  owner: string,
  repo: string,
  runId: number,
): Promise<Array<{ type: string; data: unknown; id?: string }>> {
  const auth = requireAuthToken();
  const baseUrl = auth.apiUrl;
  const url = `${baseUrl}/api/repos/${owner}/${repo}/runs/${runId}/logs`;
  const res = await fetch(url, {
    headers: {
      Authorization: `token ${auth.token}`,
      Accept: "text/event-stream",
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to connect to run stream: ${res.status} ${res.statusText}`);
  }

  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error("No response body from SSE stream");
  }

  const events: Array<{ type: string; data: unknown; id?: string }> = [];
  const decoder = new TextDecoder();
  let currentEventType = "";
  let currentEventId = "";
  let currentData = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });

    for (const line of text.split("\n")) {
      if (line.startsWith("event: ")) {
        currentEventType = line.slice(7).trim();
      } else if (line.startsWith("id: ")) {
        currentEventId = line.slice(4).trim();
      } else if (line.startsWith("data: ")) {
        currentData = line.slice(6);
      } else if (line === "" && currentData) {
        const eventType = currentEventType || "log";
        let parsed: unknown;
        try {
          parsed = JSON.parse(currentData);
        } catch {
          parsed = currentData;
        }

        const event = {
          type: eventType,
          data: parsed,
          ...(currentEventId ? { id: currentEventId } : {}),
        };
        events.push(event);

        // All human-readable output goes to stderr so --json gives clean stdout
        if (eventType === "log") {
          const logData = parsed as { step?: string | number; content?: string; line?: number };
          const prefix = logData.step != null ? `[step ${logData.step}] ` : "";
          process.stderr.write(`${prefix}${logData.content ?? currentData}\n`);
        } else if (eventType === "status") {
          const statusData = parsed as { status?: string; step?: string | number };
          process.stderr.write(
            `Status: ${statusData.status ?? "unknown"}${statusData.step != null ? ` (step ${statusData.step})` : ""}\n`,
          );
        } else if (eventType === "done") {
          const doneData = parsed as { status?: string };
          process.stderr.write(`Run completed: ${doneData.status ?? "unknown"}\n`);
        } else {
          process.stderr.write(`${currentData}\n`);
        }

        currentEventType = "";
        currentEventId = "";
        currentData = "";

        if (eventType === "done") {
          return events;
        }
      } else if (line.startsWith(":")) {
        // SSE comment (keep-alive), ignore
      }
    }
  }

  return events;
}

/**
 * Watch a workflow run: fetch current status, stream events if still running.
 * Returns immediately for terminal states (completed, failed, cancelled).
 */
async function watchWorkflowRun(owner: string, repo: string, runId: number) {
  const runData = await api<{
    id: number;
    status: string;
    workflow_definition_id?: number;
    trigger_event?: string;
    trigger_ref?: string;
    started_at?: string;
    completed_at?: string;
  }>("GET", `/api/repos/${owner}/${repo}/runs/${runId}`);

  process.stderr.write(`Watching run #${runData.id} (status: ${runData.status})...\n`);

  if (
    runData.status === "completed" ||
    runData.status === "failed" ||
    runData.status === "cancelled"
  ) {
    process.stderr.write(`Run #${runData.id} already ${runData.status}.\n`);
    return runData;
  }

  const events = await streamWorkflowRunEvents(owner, repo, runId);
  return { ...runData, events };
}

export const workflow = Cli.create("workflow", {
  description: "Manage workflows",
})
  .command("list", {
    description: "List workflows",
    options: z.object({
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      const { owner, repo } = resolveRepoRef(c.options.repo);
      return api("GET", `/api/repos/${owner}/${repo}/workflows`);
    },
  })
  .command("dispatch", {
    description: "Trigger a workflow",
    args: z.object({
      id: z.coerce.number().describe("Workflow ID"),
    }),
    options: z.object({
      ref: z.string().default("main").describe("Git ref to run against"),
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      const { owner, repo } = resolveRepoRef(c.options.repo);
      return api("POST", `/api/repos/${owner}/${repo}/workflows/${c.args.id}/dispatches`, {
        ref: c.options.ref,
      });
    },
  })
  .command("watch", {
    description: "Watch a workflow run in real-time",
    args: z.object({
      id: z.coerce.number().describe("Run ID"),
    }),
    options: z.object({
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      const { owner, repo } = resolveRepoRef(c.options.repo);
      return watchWorkflowRun(owner, repo, c.args.id);
    },
  });

export const run = Cli.create("run", {
  description: "View and manage workflow runs",
})
  .command("list", {
    description: "List workflow runs",
    options: z.object({
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      const { owner, repo } = resolveRepoRef(c.options.repo);
      return api("GET", `/api/repos/${owner}/${repo}/runs`);
    },
  })
  .command("view", {
    description: "View a workflow run",
    args: z.object({
      id: z.coerce.number().describe("Run ID"),
    }),
    options: z.object({
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      const { owner, repo } = resolveRepoRef(c.options.repo);
      return api("GET", `/api/repos/${owner}/${repo}/runs/${c.args.id}`);
    },
  })
  .command("rerun", {
    description: "Rerun a workflow",
    args: z.object({
      id: z.coerce.number().describe("Run ID"),
    }),
    options: z.object({
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      const { owner, repo } = resolveRepoRef(c.options.repo);
      return api("POST", `/api/repos/${owner}/${repo}/runs/${c.args.id}/rerun`);
    },
  })
  .command("cancel", {
    description: "Cancel a workflow run",
    args: z.object({
      id: z.coerce.number().describe("Run ID"),
    }),
    options: z.object({
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      const { owner, repo } = resolveRepoRef(c.options.repo);
      return api("POST", `/api/repos/${owner}/${repo}/runs/${c.args.id}/cancel`);
    },
  })
  .command("logs", {
    description: "Stream logs for a workflow run",
    args: z.object({
      id: z.coerce.number().describe("Run ID"),
    }),
    options: z.object({
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      const { owner, repo } = resolveRepoRef(c.options.repo);
      await streamWorkflowRunEvents(owner, repo, c.args.id);
      return undefined;
    },
  })
  .command("watch", {
    description: "Watch a workflow run in real-time (streams logs, status changes, and completion)",
    args: z.object({
      id: z.coerce.number().describe("Run ID"),
    }),
    options: z.object({
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      const { owner, repo } = resolveRepoRef(c.options.repo);
      return watchWorkflowRun(owner, repo, c.args.id);
    },
  });
