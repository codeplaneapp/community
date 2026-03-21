import { spawn } from "node:child_process";
import { Cli, z } from "incur";
import {
  clearAuthToken,
  formatTokenSource,
  getAuthStatus,
  persistAuthToken,
  requireAuthToken,
  resolveAuthTarget,
} from "../auth-state.js";
import { shouldReturnStructuredOutput } from "../output.js";
import {
  describeClaudeAuthRemediation,
  deleteStoredClaudeAuthToken,
  formatClaudeAuthSource,
  loadStoredClaudeAuthToken,
  resolveClaudeAuth,
  storeStoredClaudeAuthToken,
  validateClaudeSetupToken,
} from "../claude-auth.js";
import { api, resolveRepoRef } from "../client.js";

const BROWSER_LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const CLAUDE_SETUP_TOKEN_TIMEOUT_MS = 5 * 60 * 1000;

async function readStdinWithTimeout(
  timeoutMs: number,
  label: string,
): Promise<string> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Timed out waiting for ${label}.`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([Bun.stdin.text(), timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function validateToken(input: string): string {
  const token = input.trim();
  if (!token) {
    throw new Error("no token provided on stdin");
  }
  if (!token.startsWith("jjhub_")) {
    throw new Error('Invalid token. Tokens must start with "jjhub_".');
  }
  return token;
}

function browserCandidates(
  url: string,
): Array<{ command: string; args: string[] }> {
  switch (process.platform) {
    case "darwin":
      return [{ command: "open", args: [url] }];
    case "win32":
      return [{ command: "cmd.exe", args: ["/c", "start", "", url] }];
    default:
      return [
        { command: "xdg-open", args: [url] },
        { command: "gio", args: ["open", url] },
      ];
  }
}

async function openBrowser(url: string): Promise<void> {
  if (process.env.JJHUB_TEST_BROWSER_MODE === "fetch") {
    const res = await fetch(url, { redirect: "manual" });
    const location = res.headers.get("location");
    if (location) {
      const redirected = new URL(location, url);
      if (redirected.hash) {
        const params = new URLSearchParams(redirected.hash.slice(1));
        const callbackURL = `${redirected.origin}${redirected.pathname}`;
        const callbackRes = await fetch(callbackURL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: params.get("token") ?? "",
            username: params.get("username") ?? "",
          }),
        });
        await callbackRes.text().catch(() => undefined);
        if (!callbackRes.ok) {
          throw new Error(
            `browser test callback failed: ${callbackRes.status} ${callbackRes.statusText}`,
          );
        }
        return;
      }
    }

    if (res.status >= 300 && res.status < 400 && location) {
      const followed = await fetch(new URL(location, url), {
        redirect: "follow",
      });
      await followed.text().catch(() => undefined);
      if (!followed.ok) {
        throw new Error(
          `browser test fetch failed: ${followed.status} ${followed.statusText}`,
        );
      }
      return;
    }

    await res.text().catch(() => undefined);
    if (!res.ok) {
      throw new Error(
        `browser test fetch failed: ${res.status} ${res.statusText}`,
      );
    }
    return;
  }

  for (const candidate of browserCandidates(url)) {
    if (candidate.command !== "cmd.exe" && !Bun.which(candidate.command)) {
      continue;
    }

    await new Promise<void>((resolve, reject) => {
      const child = spawn(candidate.command, candidate.args, {
        detached: true,
        stdio: "ignore",
      });
      child.once("error", reject);
      child.once("spawn", () => {
        child.unref();
        resolve();
      });
    });
    return;
  }

  throw new Error("no browser launcher is available");
}

function successHtml(host: string, username?: string): string {
  const safeHost = escapeHtml(host);
  const safeUsername = username ? escapeHtml(username) : undefined;
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    "<title>JJHub login complete</title>",
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<style>",
    "body { font-family: sans-serif; margin: 0; background: #f4f1ea; color: #1b2a2f; }",
    ".panel { max-width: 36rem; margin: 10vh auto; padding: 2rem; background: #fffdf7; border: 1px solid #d8cfbf; border-radius: 16px; box-shadow: 0 16px 40px rgba(27,42,47,0.08); }",
    "h1 { margin: 0 0 0.75rem; font-size: 1.5rem; }",
    "p { margin: 0.5rem 0; line-height: 1.5; }",
    "code { font-family: monospace; background: #efe7d7; padding: 0.15rem 0.35rem; border-radius: 6px; }",
    "</style>",
    "</head>",
    "<body>",
    '<div class="panel">',
    `<h1>${safeUsername ? `Logged in as ${safeUsername}` : "Logged in"}</h1>`,
    `<p>Your JJHub CLI token for <code>${safeHost}</code> has been stored securely.</p>`,
    "<p>You can close this tab and return to the terminal.</p>",
    "</div>",
    "</body>",
    "</html>",
  ].join("");
}

function callbackBridgeHtml(host: string): string {
  const safeHost = escapeHtml(host);
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    "<title>Completing JJHub login...</title>",
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "</head>",
    "<body>",
    '<main style="font-family: sans-serif; max-width: 36rem; margin: 4rem auto; line-height: 1.5;">',
    `<h1>Completing login for ${safeHost}...</h1>`,
    "<p>You can close this tab after the CLI confirms the login.</p>",
    "</main>",
    "<script>",
    "const params = new URLSearchParams(window.location.hash.slice(1));",
    "fetch('/callback', {",
    "  method: 'POST',",
    "  headers: { 'Content-Type': 'application/json' },",
    "  body: JSON.stringify({",
    "    token: params.get('token') ?? '',",
    "    username: params.get('username') ?? '',",
    "  }),",
    "})",
    "  .then(async (response) => {",
    "    const text = await response.text();",
    "    document.open();",
    "    document.write(text);",
    "    document.close();",
    "  })",
    "  .catch((error) => {",
    "    document.body.innerHTML = '<main style=\"font-family: sans-serif; max-width: 36rem; margin: 4rem auto; line-height: 1.5;\"><h1>Login failed</h1><p>' + String(error) + '</p></main>';",
    "  });",
    "</script>",
    "</body>",
    "</html>",
  ].join("");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function runBrowserLogin(
  options: { hostname?: string } = {},
): Promise<{ host: string; token: string; username?: string }> {
  const target = resolveAuthTarget(options);
  let finished = false;
  let finish:
    | ((result: { token: string; username?: string }) => void)
    | undefined;
  let fail: ((error: Error) => void) | undefined;
  const resultPromise = new Promise<{ token: string; username?: string }>(
    (resolve, reject) => {
      finish = resolve;
      fail = reject;
    },
  );

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname !== "/callback") {
        return new Response("Not found", { status: 404 });
      }

      if (request.method === "GET") {
        const token = url.searchParams.get("token")?.trim() ?? "";
        const username = url.searchParams.get("username")?.trim() || undefined;
        if (!token) {
          return new Response(callbackBridgeHtml(target.host), {
            headers: { "content-type": "text/html; charset=utf-8" },
          });
        }

        try {
          validateToken(token);
        } catch (error) {
          if (!finished) {
            finished = true;
            fail?.(error instanceof Error ? error : new Error(String(error)));
          }
          queueMicrotask(() => server.stop(true));
          return new Response("Invalid token", { status: 400 });
        }

        if (!finished) {
          finished = true;
          finish?.({ token, username });
        }
        queueMicrotask(() => server.stop(true));
        return new Response(successHtml(target.host, username), {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }

      if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
      }

      const payload = (await request.json().catch(() => ({}))) as {
        token?: unknown;
        username?: unknown;
      };
      const token =
        typeof payload.token === "string" ? payload.token.trim() : "";
      const username =
        typeof payload.username === "string" &&
        payload.username.trim().length > 0
          ? payload.username.trim()
          : undefined;
      if (!token) {
        if (!finished) {
          finished = true;
          fail?.(new Error("OAuth callback did not include a token."));
        }
        queueMicrotask(() => server.stop(true));
        return new Response("Missing token", { status: 400 });
      }

      try {
        validateToken(token);
      } catch (error) {
        if (!finished) {
          finished = true;
          fail?.(error instanceof Error ? error : new Error(String(error)));
        }
        queueMicrotask(() => server.stop(true));
        return new Response("Invalid token", { status: 400 });
      }

      if (!finished) {
        finished = true;
        finish?.({ token, username });
      }
      queueMicrotask(() => server.stop(true));
      return new Response(successHtml(target.host, username), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    },
  });

  const loginUrl = `${target.apiUrl}/api/auth/github/cli?callback_port=${server.port}`;
  process.stderr.write(`Opening browser for JJHub login at ${target.host}\n`);
  process.stderr.write(`If it does not open, visit:\n${loginUrl}\n`);

  try {
    await openBrowser(loginUrl);
  } catch (error) {
    process.stderr.write(
      `Browser could not be opened automatically: ${error instanceof Error ? error.message : String(error)}\n`,
    );
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      if (finished) {
        return;
      }
      finished = true;
      reject(
        new Error(`Timed out waiting for browser login on ${target.host}.`),
      );
      server.stop(true);
    }, BROWSER_LOGIN_TIMEOUT_MS);
  });

  try {
    const result = await Promise.race([resultPromise, timeoutPromise]);
    return { host: target.host, ...result };
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    if (!finished) {
      server.stop(true);
    }
  }
}

function describeClaudeAuthAvailability(): string {
  return [
    "no Claude Code auth found.",
    ...describeClaudeAuthRemediation({ markdown: true }),
  ].join("\n");
}

function getResolvedClaudeAuthToken(): {
  envKey: "ANTHROPIC_API_KEY" | "ANTHROPIC_AUTH_TOKEN";
  source: string;
  token: string;
} {
  const resolved = resolveClaudeAuth();
  if (!resolved) {
    throw new Error(describeClaudeAuthAvailability());
  }

  const authToken = resolved.env.ANTHROPIC_AUTH_TOKEN?.trim();
  if (authToken) {
    return {
      envKey: "ANTHROPIC_AUTH_TOKEN",
      source: formatClaudeAuthSource(resolved.source),
      token: authToken,
    };
  }

  const apiKey = resolved.env.ANTHROPIC_API_KEY?.trim();
  if (apiKey) {
    return {
      envKey: "ANTHROPIC_API_KEY",
      source: formatClaudeAuthSource(resolved.source),
      token: apiKey,
    };
  }

  throw new Error(describeClaudeAuthAvailability());
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function pushClaudeAuthSecret(
  repo: string | undefined,
  resolved: {
    envKey: "ANTHROPIC_API_KEY" | "ANTHROPIC_AUTH_TOKEN";
    source: string;
    token: string;
  },
): Promise<{
  owner: string;
  repo: string;
  secretName: "ANTHROPIC_API_KEY" | "ANTHROPIC_AUTH_TOKEN";
  source: string;
}> {
  const repoRef = resolveRepoRef(repo);
  await api("POST", `/api/repos/${repoRef.owner}/${repoRef.repo}/secrets`, {
    name: resolved.envKey,
    value: resolved.token,
  });
  return {
    owner: repoRef.owner,
    repo: repoRef.repo,
    secretName: resolved.envKey,
    source: resolved.source,
  };
}

async function maybePushStoredClaudeToken(
  repo: string | undefined,
  token: string,
): Promise<
  | {
      pushed?: {
        owner: string;
        repo: string;
        secretName: "ANTHROPIC_AUTH_TOKEN";
      };
      warning?: string;
    }
  | undefined
> {
  try {
    const pushed = await pushClaudeAuthSecret(repo, {
      envKey: "ANTHROPIC_AUTH_TOKEN",
      source: "stored Claude subscription token",
      token,
    });
    return {
      pushed: {
        owner: pushed.owner,
        repo: pushed.repo,
        secretName: "ANTHROPIC_AUTH_TOKEN",
      },
    };
  } catch (error) {
    const message = errorMessage(error);
    if (!repo && message.startsWith("Could not determine repository.")) {
      return undefined;
    }
    if (!repo) {
      return {
        warning: `Stored Claude setup token in keyring, but automatic repository secret push failed: ${message}`,
      };
    }
    throw error;
  }
}

const claude = Cli.create("claude", {
  description: "Manage Claude Code authentication",
})
  .command("login", {
    description: "Store a Claude setup token from stdin",
    options: z.object({
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      process.stderr.write(
        "Paste the Claude setup token from `claude setup-token`, then press Ctrl-D.\n",
      );
      const token = validateClaudeSetupToken(
        await readStdinWithTimeout(
          CLAUDE_SETUP_TOKEN_TIMEOUT_MS,
          "Claude setup token on stdin",
        ),
      );
      storeStoredClaudeAuthToken(token);

      const resolved = resolveClaudeAuth();
      const activeSource = resolved
        ? formatClaudeAuthSource(resolved.source)
        : "unknown source";
      const pushResult = await maybePushStoredClaudeToken(
        c.options.repo,
        token,
      );
      const pushed = pushResult?.pushed;
      return {
        status: "logged_in",
        stored_token: true,
        active_source: activeSource,
        pushed_secret: pushed?.secretName,
        pushed_repo: pushed ? `${pushed.owner}/${pushed.repo}` : undefined,
        push_warning: pushResult?.warning,
        message: pushed
          ? `Stored Claude setup token in keyring and pushed ${pushed.secretName} to ${pushed.owner}/${pushed.repo}.`
          : pushResult?.warning
            ? pushResult.warning
            : resolved?.source === "stored_subscription_token"
              ? "Stored Claude setup token in keyring"
              : `Stored Claude setup token in keyring. Active auth remains ${activeSource}.`,
      };
    },
  })
  .command("logout", {
    description: "Clear the stored Claude setup token",
    async run() {
      const cleared = deleteStoredClaudeAuthToken();
      const resolved = resolveClaudeAuth();
      const activeSource = resolved
        ? formatClaudeAuthSource(resolved.source)
        : undefined;
      return {
        status: "logged_out",
        cleared,
        active_source: activeSource,
        message: activeSource
          ? cleared
            ? `Cleared stored Claude setup token. Active auth remains ${activeSource}.`
            : `No stored Claude setup token found. Active auth remains ${activeSource}.`
          : cleared
            ? "Cleared stored Claude setup token"
            : "No stored Claude setup token found",
      };
    },
  })
  .command("status", {
    description: "Show Claude Code authentication status",
    async run() {
      const resolved = resolveClaudeAuth();
      const storedToken = loadStoredClaudeAuthToken();
      return {
        configured: Boolean(resolved),
        source: resolved ? formatClaudeAuthSource(resolved.source) : undefined,
        auth_kind: resolved
          ? resolved.env.ANTHROPIC_AUTH_TOKEN
            ? "ANTHROPIC_AUTH_TOKEN"
            : "ANTHROPIC_API_KEY"
          : undefined,
        stored_token_set: Boolean(storedToken),
        message: resolved
          ? `Claude Code auth is configured via ${formatClaudeAuthSource(resolved.source)}`
          : "Claude Code auth is not configured",
      };
    },
  })
  .command("token", {
    description: "Print the Claude Code token or API key in use",
    async run(c) {
      const resolved = getResolvedClaudeAuthToken();
      if (shouldReturnStructuredOutput(c)) {
        return {
          env_key: resolved.envKey,
          source: resolved.source,
          token: resolved.token,
        };
      }
      process.stderr.write(
        `Token source: ${resolved.source} (${resolved.envKey})\n`,
      );
      process.stdout.write(`${resolved.token}\n`);
      return undefined;
    },
  })
  .command("push", {
    description:
      "Push the active Claude Code credential into repository secrets",
    options: z.object({
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      const pushed = await pushClaudeAuthSecret(
        c.options.repo,
        getResolvedClaudeAuthToken(),
      );
      return {
        status: "pushed",
        repo: `${pushed.owner}/${pushed.repo}`,
        secret_name: pushed.secretName,
        source: pushed.source,
        message: `Pushed ${pushed.secretName} from ${pushed.source} to ${pushed.owner}/${pushed.repo}.`,
      };
    },
  });

export const auth = Cli.create("auth", {
  description: "Manage authentication (login, logout, token)",
})
  .command("login", {
    description: "Log in to JJHub",
    options: z.object({
      "with-token": z
        .boolean()
        .default(false)
        .describe("Read token from stdin instead of browser flow"),
      hostname: z
        .string()
        .optional()
        .describe("Hostname or API URL to authenticate with"),
    }),
    async run(c) {
      if (c.options["with-token"]) {
        const token = validateToken(await Bun.stdin.text());
        const target = persistAuthToken(token, {
          hostname: c.options.hostname,
        });
        return {
          status: "logged_in",
          host: target.host,
          token_source: "keyring",
          message: `Logged in to ${target.host} via keyring`,
        };
      }

      const login = await runBrowserLogin({ hostname: c.options.hostname });
      const target = persistAuthToken(login.token, {
        hostname: c.options.hostname,
      });
      return {
        status: "logged_in",
        host: target.host,
        user: login.username,
        token_source: "keyring",
        message: login.username
          ? `Logged in to ${target.host} as ${login.username} via browser`
          : `Logged in to ${target.host} via browser`,
      };
    },
  })
  .command("logout", {
    description: "Log out of JJHub",
    options: z.object({
      hostname: z
        .string()
        .optional()
        .describe("Hostname or API URL to log out from"),
    }),
    async run(c) {
      const result = clearAuthToken({ hostname: c.options.hostname });
      return {
        status: "logged_out",
        host: result.host,
        cleared: result.cleared || result.legacy_cleared,
        message: process.env.JJHUB_TOKEN?.trim()
          ? `Logged out from ${result.host}. JJHUB_TOKEN env is still active for this shell.`
          : `Logged out from ${result.host}`,
      };
    },
  })
  .command("status", {
    description: "Show authentication status",
    options: z.object({
      hostname: z
        .string()
        .optional()
        .describe("Hostname or API URL to inspect"),
    }),
    async run(c) {
      return getAuthStatus(fetch, { hostname: c.options.hostname });
    },
  })
  .command("token", {
    description: "Print the authentication token",
    options: z.object({
      hostname: z
        .string()
        .optional()
        .describe("Hostname or API URL to inspect"),
    }),
    async run(c) {
      const authToken = requireAuthToken({ hostname: c.options.hostname });
      if (shouldReturnStructuredOutput(c)) {
        return {
          host: authToken.host,
          source: formatTokenSource(authToken.source),
          token: authToken.token,
        };
      }
      process.stderr.write(
        `Token source: ${formatTokenSource(authToken.source)} (${authToken.host})\n`,
      );
      process.stdout.write(`${authToken.token}\n`);
      return undefined;
    },
  })
  .command(claude);
