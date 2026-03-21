import { Cli, z } from "incur";
import { ApiError, api, buildCloneUrl, resolveRepoRef } from "../client.js";
import { resolveAuthToken } from "../auth-state.js";
import { loadConfig } from "../config.js";
import {
  formatRepoCreate,
  formatRepoList,
  formatRepoMutation,
  formatRepoView,
  shouldReturnStructuredOutput,
} from "../output.js";

type RepoRecord = Record<string, unknown>;

function isOwnerRepoRef(value: string): boolean {
  const parts = value.split("/");
  return parts.length === 2 && parts.every(Boolean);
}

function repoRefFromRecord(repo: RepoRecord): string {
  const fullName = typeof repo.full_name === "string" ? repo.full_name : "";
  if (fullName) {
    return fullName;
  }
  const owner = typeof repo.owner === "string" ? repo.owner : "";
  const name = typeof repo.name === "string" ? repo.name : "";
  return owner && name ? `${owner}/${name}` : name;
}

function handleRepoApiError(error: unknown): never {
  if (error instanceof ApiError) {
    throw new Error(error.detail);
  }
  throw error instanceof Error ? error : new Error(String(error));
}

async function maybeLookupRepoMetadata(owner: string, repo: string): Promise<void> {
  const auth = resolveAuthToken();
  if (!auth) {
    return;
  }

  try {
    await api<RepoRecord>("GET", `/api/repos/${owner}/${repo}`, undefined, {
      baseUrl: auth.apiUrl,
      token: auth.token,
    });
  } catch (error) {
    if (error instanceof ApiError && error.status !== 401 && error.status !== 403) {
      throw error;
    }
    if (error instanceof ApiError) {
      return;
    }
    return;
  }
}

async function runCloneProgram(
  command: string,
  args: string[],
): Promise<{ exitCode: number; stderr: string; stdout: string }> {
  try {
    const proc = Bun.spawn([command, ...args], {
      stderr: "pipe",
      stdout: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { exitCode, stdout, stderr };
  } catch (error) {
    return {
      exitCode: 127,
      stderr: error instanceof Error ? error.message : String(error),
      stdout: "",
    };
  }
}

function writeCloneLogs(result: { stderr: string; stdout: string }): void {
  if (result.stderr) {
    process.stderr.write(result.stderr.endsWith("\n") ? result.stderr : `${result.stderr}\n`);
  }
  if (result.stdout) {
    process.stderr.write(result.stdout.endsWith("\n") ? result.stdout : `${result.stdout}\n`);
  }
}

export const repo = Cli.create("repo", {
  description: "Manage repositories",
})
  .command("create", {
    description: "Create a new repository",
    args: z.object({
      name: z.string().describe("Repository name"),
    }),
    options: z.object({
      description: z.string().default("").describe("Repository description"),
      private: z.boolean().default(false).describe("Make repository private"),
    }),
    async run(c) {
      try {
        const payload: Record<string, unknown> = { name: c.args.name };
        if (c.options.description) {
          payload.description = c.options.description;
        }
        if (c.options.private) {
          payload.private = true;
        }
        const repo = await api<RepoRecord>("POST", "/api/user/repos", payload);
        if (shouldReturnStructuredOutput(c)) {
          return repo;
        }
        return formatRepoCreate(repo);
      } catch (error) {
        handleRepoApiError(error);
      }
    },
  })
  .command("list", {
    description: "List your repositories",
    options: z.object({
      limit: z.number().default(30).describe("Number of results"),
      page: z.number().default(1).describe("Page number"),
    }),
    async run(c) {
      try {
        const repos = await api<RepoRecord[]>(
          "GET",
          `/api/user/repos?page=${c.options.page}&per_page=${c.options.limit}`,
        );
        if (shouldReturnStructuredOutput(c)) {
          return repos;
        }
        return formatRepoList(repos);
      } catch (error) {
        handleRepoApiError(error);
      }
    },
  })
  .command("view", {
    description: "View repository details",
    args: z.object({
      repo: z.string().optional().describe("Repository in OWNER/REPO format"),
    }),
    options: z.object({
      repo: z.string().optional().describe("Repository in OWNER/REPO format"),
    }),
    async run(c) {
      try {
        const { owner, repo: name } = resolveRepoRef(c.options.repo ?? c.args.repo);
        const repo = await api<RepoRecord>("GET", `/api/repos/${owner}/${name}`);
        if (shouldReturnStructuredOutput(c)) {
          return repo;
        }
        return formatRepoView(repo);
      } catch (error) {
        handleRepoApiError(error);
      }
    },
  })
  .command("clone", {
    description: "Clone a repository",
    args: z.object({
      repo: z.string().optional().describe("Repository in OWNER/REPO format or URL"),
    }),
    options: z.object({
      "clone-arg": z.array(z.string()).default([]).describe("Extra arguments for clone"),
      directory: z.string().optional().describe("Target directory"),
      protocol: z
        .enum(["ssh", "https"])
        .optional()
        .describe("Git protocol to use"),
    }),
    async run(c) {
      if (!c.args.repo) {
        throw new Error("required arguments were not provided: repo");
      }

      try {
        const config = loadConfig();
        const protocol = c.options.protocol ?? config.git_protocol;
        let cloneUrl = c.args.repo;
        let owner = "";
        let name = "";

        if (isOwnerRepoRef(c.args.repo)) {
          const resolved = resolveRepoRef(c.args.repo);
          owner = resolved.owner;
          name = resolved.repo;
          await maybeLookupRepoMetadata(owner, name);
          cloneUrl = buildCloneUrl(owner, name, protocol, config.api_url);
        }

        if (!name) {
          const slashIndex = cloneUrl.lastIndexOf("/");
          name = cloneUrl.slice(slashIndex + 1).replace(/\.git$/i, "");
        }

        const targetDir = c.options.directory ?? name;
        const cloneArgs = [cloneUrl, targetDir, ...c.options["clone-arg"]];

        const jjResult = await runCloneProgram("jj", ["git", "clone", ...cloneArgs]);
        writeCloneLogs(jjResult);
        if (jjResult.exitCode === 0) {
          const cloned = owner && name ? `${owner}/${name}` : targetDir;
          const result = { cloned, directory: targetDir, protocol, tool: "jj" };
          if (shouldReturnStructuredOutput(c)) {
            return result;
          }
          return `Cloned ${cloned} into ${targetDir} using jj`;
        }

        const gitResult = await runCloneProgram("git", ["clone", ...cloneArgs]);
        writeCloneLogs(gitResult);
        if (gitResult.exitCode === 0) {
          const cloned = owner && name ? `${owner}/${name}` : targetDir;
          const result = { cloned, directory: targetDir, protocol, tool: "git" };
          if (shouldReturnStructuredOutput(c)) {
            return result;
          }
          return `Cloned ${cloned} into ${targetDir} using git`;
        }

        throw new Error(
          [
            "Clone failed with jj and git.",
            "",
            `jj: ${jjResult.stderr || jjResult.stdout || `exit code ${jjResult.exitCode}`}`,
            `git: ${gitResult.stderr || gitResult.stdout || `exit code ${gitResult.exitCode}`}`,
          ].join("\n"),
        );
      } catch (error) {
        handleRepoApiError(error);
      }
    },
  })
  .command("fork", {
    description: "Fork a repository",
    args: z.object({
      repo: z.string().describe("Repository to fork in OWNER/REPO format"),
    }),
    options: z.object({
      name: z.string().optional().describe("Name for the forked repository"),
      organization: z
        .string()
        .optional()
        .describe("Organization to fork into"),
    }),
    async run(c) {
      try {
        const { owner, repo: name } = resolveRepoRef(c.args.repo);
        const repo = await api<RepoRecord>("POST", `/api/repos/${owner}/${name}/forks`, {
          ...(c.options.name && { name: c.options.name }),
          ...(c.options.organization && { organization: c.options.organization }),
        });
        if (shouldReturnStructuredOutput(c)) {
          return repo;
        }
        return `Forked repository ${repoRefFromRecord(repo)}`;
      } catch (error) {
        handleRepoApiError(error);
      }
    },
  })
  .command("transfer", {
    description: "Transfer repository ownership",
    args: z.object({
      repo: z.string().describe("Repository in OWNER/REPO format"),
    }),
    options: z.object({
      to: z.string().describe("New owner (user or organization)"),
    }),
    async run(c) {
      try {
        const { owner, repo: name } = resolveRepoRef(c.args.repo);
        const repo = await api<RepoRecord>("POST", `/api/repos/${owner}/${name}/transfer`, {
          new_owner: c.options.to,
        });
        if (shouldReturnStructuredOutput(c)) {
          return repo;
        }
        return `Transferred repository ${repoRefFromRecord(repo)} to ${c.options.to}`;
      } catch (error) {
        handleRepoApiError(error);
      }
    },
  })
  .command("archive", {
    description: "Archive a repository",
    args: z.object({
      repo: z.string().describe("Repository in OWNER/REPO format"),
    }),
    async run(c) {
      try {
        const { owner, repo: name } = resolveRepoRef(c.args.repo);
        await api("POST", `/api/repos/${owner}/${name}/archive`);
        const repoRef = `${owner}/${name}`;
        if (shouldReturnStructuredOutput(c)) {
          return { status: "archived", repo: repoRef };
        }
        return formatRepoMutation("Archived", repoRef);
      } catch (error) {
        handleRepoApiError(error);
      }
    },
  })
  .command("unarchive", {
    description: "Unarchive a repository",
    args: z.object({
      repo: z.string().describe("Repository in OWNER/REPO format"),
    }),
    async run(c) {
      try {
        const { owner, repo: name } = resolveRepoRef(c.args.repo);
        await api("DELETE", `/api/repos/${owner}/${name}/archive`);
        const repoRef = `${owner}/${name}`;
        if (shouldReturnStructuredOutput(c)) {
          return { status: "unarchived", repo: repoRef };
        }
        return formatRepoMutation("Unarchived", repoRef);
      } catch (error) {
        handleRepoApiError(error);
      }
    },
  })
  .command("delete", {
    description: "Delete a repository",
    args: z.object({
      repo: z.string().describe("Repository in OWNER/REPO format"),
    }),
    async run(c) {
      try {
        const { owner, repo: name } = resolveRepoRef(c.args.repo);
        await api("DELETE", `/api/repos/${owner}/${name}`);
        const repoRef = `${owner}/${name}`;
        if (shouldReturnStructuredOutput(c)) {
          return { status: "deleted", repo: repoRef };
        }
        return formatRepoMutation("Deleted", repoRef);
      } catch (error) {
        handleRepoApiError(error);
      }
    },
  })
  .command("edit", {
    description: "Edit repository settings",
    args: z.object({
      repo: z.string().describe("Repository in OWNER/REPO format"),
    }),
    options: z.object({
      description: z.string().optional().describe("New description"),
      private: z.boolean().optional().describe("Set visibility"),
      name: z.string().optional().describe("New repository name"),
    }),
    async run(c) {
      try {
        const { owner, repo: repoName } = resolveRepoRef(c.args.repo);
        const patch: Record<string, unknown> = {};
        if (c.options.description !== undefined) patch.description = c.options.description;
        if (c.options.private !== undefined) patch.private = c.options.private;
        if (c.options.name !== undefined) patch.name = c.options.name;
        const repo = await api<RepoRecord>("PATCH", `/api/repos/${owner}/${repoName}`, patch);
        if (shouldReturnStructuredOutput(c)) {
          return repo;
        }
        return `Updated repository ${repoRefFromRecord(repo)}`;
      } catch (error) {
        handleRepoApiError(error);
      }
    },
  })
  .command("star", {
    description: "Star a repository",
    args: z.object({
      repo: z.string().describe("Repository in OWNER/REPO format"),
    }),
    async run(c) {
      try {
        const { owner, repo: name } = resolveRepoRef(c.args.repo);
        await api("PUT", `/api/user/starred/${owner}/${name}`);
        const repoRef = `${owner}/${name}`;
        if (shouldReturnStructuredOutput(c)) {
          return { status: "starred", repo: repoRef };
        }
        return formatRepoMutation("Starred", repoRef);
      } catch (error) {
        handleRepoApiError(error);
      }
    },
  })
  .command("unstar", {
    description: "Unstar a repository",
    args: z.object({
      repo: z.string().describe("Repository in OWNER/REPO format"),
    }),
    async run(c) {
      try {
        const { owner, repo: name } = resolveRepoRef(c.args.repo);
        await api("DELETE", `/api/user/starred/${owner}/${name}`);
        const repoRef = `${owner}/${name}`;
        if (shouldReturnStructuredOutput(c)) {
          return { status: "unstarred", repo: repoRef };
        }
        return formatRepoMutation("Unstarred", repoRef);
      } catch (error) {
        handleRepoApiError(error);
      }
    },
  })
  .command("watch", {
    description: "Watch a repository for notifications",
    args: z.object({
      repo: z.string().describe("Repository in OWNER/REPO format"),
    }),
    options: z.object({
      mode: z
        .enum(["watching", "participating", "ignored"])
        .default("watching")
        .describe("Watch mode: watching, participating, or ignored"),
    }),
    async run(c) {
      try {
        const { owner, repo: name } = resolveRepoRef(c.args.repo);
        const repo = await api<RepoRecord>("PUT", `/api/repos/${owner}/${name}/subscription`, {
          subscribed: c.options.mode !== "ignored",
          ignored: c.options.mode === "ignored",
          reason: c.options.mode,
        });
        if (shouldReturnStructuredOutput(c)) {
          return repo;
        }
        return `Updated watch settings for ${owner}/${name}`;
      } catch (error) {
        handleRepoApiError(error);
      }
    },
  })
  .command("unwatch", {
    description: "Unwatch a repository",
    args: z.object({
      repo: z.string().describe("Repository in OWNER/REPO format"),
    }),
    async run(c) {
      try {
        const { owner, repo: name } = resolveRepoRef(c.args.repo);
        await api("DELETE", `/api/repos/${owner}/${name}/subscription`);
        const repoRef = `${owner}/${name}`;
        if (shouldReturnStructuredOutput(c)) {
          return { status: "unwatched", repo: repoRef };
        }
        return formatRepoMutation("Unwatched", repoRef);
      } catch (error) {
        handleRepoApiError(error);
      }
    },
  });
