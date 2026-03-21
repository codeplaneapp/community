import { Cli, z } from "incur";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { getClaudeAuthEnv } from "../claude-auth.js";
import { requireAuthToken } from "../auth-state.js";
import { ApiError, api, resolveRepoRef } from "../client.js";
import { stateDir } from "../config.js";

const DEFAULT_REMOTE_WORKSPACE_ROOT = "/home/developer/workspace";
const DEFAULT_REMOTE_CLAUDE_AUTH_DIR = "/home/developer/.codeplane";
const DEFAULT_REMOTE_CLAUDE_AUTH_FILE = "/home/developer/.codeplane/claude-env.sh";
const DEFAULT_REMOTE_PROMPT_FILE = "/home/developer/.codeplane/issue-prompt.txt";
const DEFAULT_REMOTE_CLAUDE_INSTALL_LOG = "/home/developer/.codeplane/claude-install.log";
const DEFAULT_REMOTE_NODE_INSTALL_LOG = "/home/developer/.codeplane/node-install.log";
const DEFAULT_REMOTE_WORKSPACE_USER = "developer";
const DEFAULT_REMOTE_LOCAL_ROOT = "/home/developer/.local";
const DEFAULT_REMOTE_LOCAL_BIN_DIR = "/home/developer/.local/bin";
const DEFAULT_REMOTE_LOCAL_NODE_DIR = "/home/developer/.local/node";
const DEFAULT_REMOTE_DEVELOPER_PATH = "/home/developer/.local/bin:/usr/local/bin:/usr/bin:/bin";
const DEFAULT_CLAUDE_CODE_PACKAGE = "@anthropic-ai/claude-code";
const DEFAULT_LOCAL_WORKSPACE_KNOWN_HOSTS_FILE = `${stateDir()}/ssh/known_hosts`;
const DEFAULT_WORKSPACE_REMOTE_COMMAND_TIMEOUT_MS = 120_000;
const DEFAULT_WORKSPACE_CLAUDE_TIMEOUT_MS = 1_800_000;
const DEFAULT_WORKSPACE_SSH_CONNECT_TIMEOUT_SECONDS = 15;
const DEFAULT_JJ_RELEASE_API_URL = "https://api.github.com/repos/jj-vcs/jj/releases/latest";
const DEFAULT_NODE_DIST_INDEX_URL = "https://nodejs.org/dist/index.json";
const DEFAULT_NODE_MAJOR = "22";
const DEFAULT_WORKSPACE_SSH_POLL_INTERVAL_MS = 3_000;
const DEFAULT_WORKSPACE_SSH_POLL_TIMEOUT_MS = 120_000;
const RETRYABLE_WORKSPACE_SSH_STATUSES = new Set([
  404,
  409,
  423,
  425,
  429,
  502,
  503,
  504,
]);

interface WorkspaceSSHInfo {
  command?: string;
  ssh_command?: string;
  host?: string;
  port?: number;
  username?: string;
  ssh_host?: string;
  access_token?: string;
}

function parsePositiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tokenizeShellWords(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaped = false;

  for (const char of input) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (quote === null && char === "\\") {
      escaped = true;
      continue;
    }

    if (char === quote) {
      quote = null;
      continue;
    }

    if (quote === null && (char === "'" || char === '"')) {
      quote = char;
      continue;
    }

    if (quote === null && /\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeJjStringLiteral(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function getSSHCommand(sshInfo: WorkspaceSSHInfo | null | undefined): string | null {
  const command = sshInfo?.command?.trim() || sshInfo?.ssh_command?.trim();
  return command ? command : null;
}

function shouldRetryWorkspaceSSHError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return RETRYABLE_WORKSPACE_SSH_STATUSES.has(error.status);
  }
  return true;
}

async function waitForWorkspaceSSHInfo(
  owner: string,
  repo: string,
  workspaceId: string,
): Promise<WorkspaceSSHInfo> {
  const pollIntervalMs = parsePositiveIntegerEnv(
    "CODEPLANE_WORKSPACE_SSH_POLL_INTERVAL_MS",
    DEFAULT_WORKSPACE_SSH_POLL_INTERVAL_MS,
  );
  const pollTimeoutMs = parsePositiveIntegerEnv(
    "CODEPLANE_WORKSPACE_SSH_POLL_TIMEOUT_MS",
    DEFAULT_WORKSPACE_SSH_POLL_TIMEOUT_MS,
  );
  const deadline = Date.now() + pollTimeoutMs;
  let lastError: unknown;

  while (Date.now() <= deadline) {
    try {
      const sshInfo = await api<WorkspaceSSHInfo>(
        "GET",
        `/api/repos/${owner}/${repo}/workspaces/${workspaceId}/ssh`,
      );
      if (getSSHCommand(sshInfo)) {
        return sshInfo;
      }
      lastError = new Error("SSH connection info is not ready yet");
    } catch (error) {
      if (!shouldRetryWorkspaceSSHError(error)) {
        throw error;
      }
      lastError = error;
    }

    if (Date.now() + pollIntervalMs > deadline) {
      break;
    }
    await sleep(pollIntervalMs);
  }

  const detail =
    lastError instanceof Error ? lastError.message : "SSH connection info was unavailable";
  throw new Error(
    `workspace ${workspaceId} did not become SSH-ready within ${Math.ceil(pollTimeoutMs / 1000)}s: ${detail}`,
  );
}

function buildWorkspaceBootstrapScript(): string {
  const installerScript = Buffer.from(
    [
      "(async () => {",
      '  const { createWriteStream } = await import("node:fs");',
      '  const { finished } = await import("node:stream/promises");',
      '  const { get } = await import("node:https");',
      '  const os = await import("node:os");',
      "",
      "  const targetMap = {",
      '    x64: "x86_64-unknown-linux-musl",',
      '    arm64: "aarch64-unknown-linux-musl",',
      "  };",
      "",
      "  function request(url) {",
      "    return new Promise((resolve, reject) => {",
      "      const req = get(",
      "        url,",
      "        {",
      '          headers: {',
      '            Accept: "application/vnd.github+json",',
      '            "User-Agent": "codeplane-workspace-bootstrap",',
      "          },",
      "        },",
      "        (res) => {",
      "          const status = res.statusCode ?? 0;",
      "          if (status >= 300 && status < 400 && res.headers.location) {",
      "            request(res.headers.location).then(resolve, reject);",
      "            res.resume();",
      "            return;",
      "          }",
      "          if (status < 200 || status >= 300) {",
      "            reject(new Error(`request failed: ${status}`));",
      "            res.resume();",
      "            return;",
      "          }",
      "          resolve(res);",
      "        },",
      "      );",
      '      req.on("error", reject);',
      "    });",
      "  }",
      "",
      "  const target = targetMap[os.arch()];",
      "  if (!target) {",
      '    throw new Error(`unsupported architecture: ${os.arch()}`);',
      "  }",
      "",
      '  const releaseUrl = process.env.CODEPLANE_JJ_RELEASE_API_URL || "https://api.github.com/repos/jj-vcs/jj/releases/latest";',
      "  const releaseResponse = await request(releaseUrl);",
      "  const releaseChunks = [];",
      "  for await (const chunk of releaseResponse) {",
      "    releaseChunks.push(Buffer.from(chunk));",
      "  }",
      '  const release = JSON.parse(Buffer.concat(releaseChunks).toString("utf8"));',
      "  const asset = release.assets?.find(",
      '    (candidate) => typeof candidate?.name === "string"',
      '      && candidate.name.includes(target)',
      '      && candidate.name.endsWith(".tar.gz"),',
      "  );",
      "  if (!asset?.browser_download_url) {",
      '    throw new Error(`jj release asset not found for target ${target}`);',
      "  }",
      "",
      "  const archivePath = process.env.CODEPLANE_JJ_ARCHIVE;",
      "  if (!archivePath) {",
      '    throw new Error("CODEPLANE_JJ_ARCHIVE is required");',
      "  }",
      "",
      "  const archiveResponse = await request(asset.browser_download_url);",
      "  const file = createWriteStream(archivePath);",
      "  archiveResponse.pipe(file);",
      "  await finished(file);",
      "})().catch((error) => {",
      '  console.error(error instanceof Error ? error.message : String(error));',
      "  process.exit(1);",
      "});",
    ].join("\n"),
    "utf8",
  ).toString("base64");

  return [
    "if ! command -v jj >/dev/null 2>&1; then",
    "  if ! command -v node >/dev/null 2>&1; then",
    '    echo "jj is not installed and node is unavailable for bootstrap." >&2',
    "    exit 1",
    "  fi",
    '  export CODEPLANE_JJ_ARCHIVE="/tmp/codeplane-jj-release.tar.gz"',
    '  export CODEPLANE_JJ_EXTRACT_DIR="/tmp/codeplane-jj-release"',
    `  export CODEPLANE_JJ_RELEASE_API_URL=${shellEscape(DEFAULT_JJ_RELEASE_API_URL)}`,
    '  rm -rf "$CODEPLANE_JJ_ARCHIVE" "$CODEPLANE_JJ_EXTRACT_DIR"',
    '  mkdir -p "$CODEPLANE_JJ_EXTRACT_DIR"',
    `  node -e ${shellEscape('void eval(Buffer.from(process.argv[1], "base64").toString("utf8"));')} ${shellEscape(installerScript)}`,
    '  tar -xzf "$CODEPLANE_JJ_ARCHIVE" -C "$CODEPLANE_JJ_EXTRACT_DIR"',
    '  jj_bin="$(find "$CODEPLANE_JJ_EXTRACT_DIR" -type f -name jj | head -n 1)"',
    '  if [ -z "$jj_bin" ]; then',
    '    echo "Downloaded jj release did not contain a jj binary." >&2',
    "    exit 1",
    "  fi",
    '  install -m 755 "$jj_bin" /usr/local/bin/jj',
    "fi",
    `cd ${shellEscape(DEFAULT_REMOTE_WORKSPACE_ROOT)}`,
    "if [ ! -d .jj ]; then",
    "  jj git init >/dev/null 2>&1",
    "fi",
  ].join("\n");
}

function buildWorkspaceNodeBootstrapScript(): string {
  const installerScript = Buffer.from(
    [
      "(async () => {",
      '  const { createWriteStream } = await import("node:fs");',
      '  const { finished } = await import("node:stream/promises");',
      '  const { get } = await import("node:https");',
      '  const os = await import("node:os");',
      "",
      "  const targetMap = {",
      '    x64: "linux-x64",',
      '    arm64: "linux-arm64",',
      "  };",
      "",
      "  function request(url) {",
      "    return new Promise((resolve, reject) => {",
      "      const req = get(",
      "        url,",
      "        (res) => {",
      "          const status = res.statusCode ?? 0;",
      "          if (status >= 300 && status < 400 && res.headers.location) {",
      "            request(res.headers.location).then(resolve, reject);",
      "            res.resume();",
      "            return;",
      "          }",
      "          if (status < 200 || status >= 300) {",
      "            reject(new Error(`request failed: ${status}`));",
      "            res.resume();",
      "            return;",
      "          }",
      "          resolve(res);",
      "        },",
      "      );",
      '      req.on("error", reject);',
      "    });",
      "  }",
      "",
      "  const target = targetMap[os.arch()];",
      "  if (!target) {",
      '    throw new Error(`unsupported architecture: ${os.arch()}`);',
      "  }",
      "",
      '  const indexUrl = process.env.CODEPLANE_NODE_INDEX_URL || "https://nodejs.org/dist/index.json";',
      '  const major = process.env.CODEPLANE_NODE_MAJOR || "22";',
      "  const indexResponse = await request(indexUrl);",
      "  const indexChunks = [];",
      "  for await (const chunk of indexResponse) {",
      "    indexChunks.push(Buffer.from(chunk));",
      "  }",
      '  const releases = JSON.parse(Buffer.concat(indexChunks).toString("utf8"));',
      "  const release = Array.isArray(releases)",
      "    ? releases.find(",
      '        (candidate) => typeof candidate?.version === "string"',
      '          && candidate.version.startsWith(`v${major}.`)',
      "          && Array.isArray(candidate.files)",
      "          && candidate.files.includes(target),",
      "      )",
      "    : null;",
      "  if (!release?.version) {",
      '    throw new Error(`Node.js release not found for major ${major} and target ${target}`);',
      "  }",
      "",
      '  const archivePath = process.env.CODEPLANE_NODE_ARCHIVE;',
      "  if (!archivePath) {",
      '    throw new Error("CODEPLANE_NODE_ARCHIVE is required");',
      "  }",
      "",
      '  const archiveUrl = `https://nodejs.org/dist/${release.version}/node-${release.version}-${target}.tar.gz`;',
      "  const archiveResponse = await request(archiveUrl);",
      "  const file = createWriteStream(archivePath);",
      "  archiveResponse.pipe(file);",
      "  await finished(file);",
      "})().catch((error) => {",
      '  console.error(error instanceof Error ? error.message : String(error));',
      "  process.exit(1);",
      "});",
    ].join("\n"),
    "utf8",
  ).toString("base64");

  return [
    `install -d -o ${shellEscape(DEFAULT_REMOTE_WORKSPACE_USER)} -g ${shellEscape(DEFAULT_REMOTE_WORKSPACE_USER)} -m 700 ${shellEscape(DEFAULT_REMOTE_CLAUDE_AUTH_DIR)}`,
    `install -d -o ${shellEscape(DEFAULT_REMOTE_WORKSPACE_USER)} -g ${shellEscape(DEFAULT_REMOTE_WORKSPACE_USER)} -m 755 ${shellEscape(DEFAULT_REMOTE_LOCAL_ROOT)}`,
    `install -d -o ${shellEscape(DEFAULT_REMOTE_WORKSPACE_USER)} -g ${shellEscape(DEFAULT_REMOTE_WORKSPACE_USER)} -m 755 ${shellEscape(DEFAULT_REMOTE_LOCAL_BIN_DIR)}`,
    `if [ ! -x ${shellEscape(`${DEFAULT_REMOTE_LOCAL_BIN_DIR}/node`)} ] || [ ! -x ${shellEscape(`${DEFAULT_REMOTE_LOCAL_BIN_DIR}/npm`)} ]; then`,
    "  if ! command -v node >/dev/null 2>&1; then",
    '    echo "Node.js is unavailable for workspace-local bootstrap." >&2',
    "    exit 1",
    "  fi",
    '  export CODEPLANE_NODE_ARCHIVE="/tmp/codeplane-node-release.tar.gz"',
    '  export CODEPLANE_NODE_EXTRACT_DIR="/tmp/codeplane-node-release"',
    `  export CODEPLANE_NODE_INDEX_URL=${shellEscape(DEFAULT_NODE_DIST_INDEX_URL)}`,
    `  export CODEPLANE_NODE_MAJOR=${shellEscape(DEFAULT_NODE_MAJOR)}`,
    `  rm -rf "$CODEPLANE_NODE_ARCHIVE" "$CODEPLANE_NODE_EXTRACT_DIR" ${shellEscape(DEFAULT_REMOTE_LOCAL_NODE_DIR)}`,
    '  mkdir -p "$CODEPLANE_NODE_EXTRACT_DIR"',
    `  node -e ${shellEscape('void eval(Buffer.from(process.argv[1], "base64").toString("utf8"));')} ${shellEscape(installerScript)} >${shellEscape(DEFAULT_REMOTE_NODE_INSTALL_LOG)} 2>&1`,
    `  tar -xzf "$CODEPLANE_NODE_ARCHIVE" -C "$CODEPLANE_NODE_EXTRACT_DIR" >>${shellEscape(DEFAULT_REMOTE_NODE_INSTALL_LOG)} 2>&1`,
    `  node_dir="$(find "$CODEPLANE_NODE_EXTRACT_DIR" -mindepth 1 -maxdepth 1 -type d -name 'node-*' | head -n 1)"`,
    '  if [ -z "$node_dir" ]; then',
    '    echo "Downloaded Node.js archive did not contain a node directory." >&2',
    "    exit 1",
    "  fi",
    `  mv "$node_dir" ${shellEscape(DEFAULT_REMOTE_LOCAL_NODE_DIR)}`,
    `  ln -sfn ../node/bin/node ${shellEscape(`${DEFAULT_REMOTE_LOCAL_BIN_DIR}/node`)}`,
    `  ln -sfn ../node/bin/npm ${shellEscape(`${DEFAULT_REMOTE_LOCAL_BIN_DIR}/npm`)}`,
    `  ln -sfn ../node/bin/npx ${shellEscape(`${DEFAULT_REMOTE_LOCAL_BIN_DIR}/npx`)}`,
    `  chown -R ${shellEscape(DEFAULT_REMOTE_WORKSPACE_USER)}:${shellEscape(DEFAULT_REMOTE_WORKSPACE_USER)} ${shellEscape(DEFAULT_REMOTE_LOCAL_ROOT)} ${shellEscape(DEFAULT_REMOTE_CLAUDE_AUTH_DIR)}`,
    "fi",
  ].join("\n");
}

function buildClaudeAuthSeedRemoteScript(authEnv: Record<string, string>): string {
  const exportLines = Object.entries(authEnv).map(
    ([key, value]) => `export ${key}=${shellEscape(value)}`,
  );

  return [
    "set -euo pipefail",
    `install -d -o ${shellEscape(DEFAULT_REMOTE_WORKSPACE_USER)} -g ${shellEscape(DEFAULT_REMOTE_WORKSPACE_USER)} -m 700 ${shellEscape(DEFAULT_REMOTE_CLAUDE_AUTH_DIR)}`,
    `printf '%s\\n' ${exportLines.map((line) => shellEscape(line)).join(" ")} > ${shellEscape(DEFAULT_REMOTE_CLAUDE_AUTH_FILE)}`,
    `chown ${shellEscape(DEFAULT_REMOTE_WORKSPACE_USER)}:${shellEscape(DEFAULT_REMOTE_WORKSPACE_USER)} ${shellEscape(DEFAULT_REMOTE_CLAUDE_AUTH_FILE)}`,
    `chmod 600 ${shellEscape(DEFAULT_REMOTE_CLAUDE_AUTH_FILE)}`,
  ].join("\n");
}

function buildClaudeRemoteScript(prompt: string): string {
  const promptBase64 = Buffer.from(prompt, "utf8").toString("base64");
  const claudeInstallScript = [
    "set -euo pipefail",
    `export PATH=${shellEscape(DEFAULT_REMOTE_DEVELOPER_PATH)}`,
    `export NPM_CONFIG_PREFIX=${shellEscape(DEFAULT_REMOTE_LOCAL_ROOT)}`,
    `npm install -g ${shellEscape(DEFAULT_CLAUDE_CODE_PACKAGE)} >${shellEscape(DEFAULT_REMOTE_CLAUDE_INSTALL_LOG)} 2>&1`,
  ].join("\n");
  const developerScript = [
    "set -euo pipefail",
    `export PATH=${shellEscape(DEFAULT_REMOTE_DEVELOPER_PATH)}:$PATH`,
    'export TERM="${TERM:-dumb}"',
    'export CI="${CI:-1}"',
    'if ! command -v claude >/dev/null 2>&1; then',
    '  echo "Claude Code CLI was installed, but its binary is still not on PATH." >&2',
    "  exit 1",
    "fi",
    `if [ -f ${shellEscape(DEFAULT_REMOTE_CLAUDE_AUTH_FILE)} ]; then`,
    `  . ${shellEscape(DEFAULT_REMOTE_CLAUDE_AUTH_FILE)}`,
    "fi",
    'if [ -z "${ANTHROPIC_AUTH_TOKEN:-}" ] && [ -z "${ANTHROPIC_API_KEY:-}" ]; then',
    '  echo "Claude Code auth is not configured in the workspace. Run codeplane auth claude login, or set ANTHROPIC_AUTH_TOKEN / ANTHROPIC_API_KEY locally and rerun codeplane workspace issue." >&2',
    "  exit 1",
    "fi",
    `prompt="$(cat ${shellEscape(DEFAULT_REMOTE_PROMPT_FILE)})"`,
    `cd ${shellEscape(DEFAULT_REMOTE_WORKSPACE_ROOT)}`,
    'exec </dev/null claude -p --dangerously-skip-permissions --no-session-persistence --output-format json "$prompt"',
  ].join("\n");

  return [
    "set -euo pipefail",
    buildWorkspaceBootstrapScript(),
    buildWorkspaceNodeBootstrapScript(),
    `chown -R ${shellEscape(DEFAULT_REMOTE_WORKSPACE_USER)}:${shellEscape(DEFAULT_REMOTE_WORKSPACE_USER)} ${shellEscape(DEFAULT_REMOTE_WORKSPACE_ROOT)}`,
    `chown -R ${shellEscape(DEFAULT_REMOTE_WORKSPACE_USER)}:${shellEscape(DEFAULT_REMOTE_WORKSPACE_USER)} ${shellEscape(DEFAULT_REMOTE_CLAUDE_AUTH_DIR)}`,
    `if [ ! -x ${shellEscape(`${DEFAULT_REMOTE_LOCAL_BIN_DIR}/claude`)} ]; then`,
    "  if command -v runuser >/dev/null 2>&1; then",
    `    runuser -u ${shellEscape(DEFAULT_REMOTE_WORKSPACE_USER)} -- env -i HOME=${shellEscape("/home/developer")} USER=${shellEscape(DEFAULT_REMOTE_WORKSPACE_USER)} LOGNAME=${shellEscape(DEFAULT_REMOTE_WORKSPACE_USER)} PATH=${shellEscape(DEFAULT_REMOTE_DEVELOPER_PATH)} TERM=${shellEscape("dumb")} CI=${shellEscape("1")} bash -lc ${shellEscape(claudeInstallScript)}`,
    "  else",
    `    su - ${shellEscape(DEFAULT_REMOTE_WORKSPACE_USER)} -c ${shellEscape(claudeInstallScript)}`,
    "  fi",
    "fi",
    `node -e ${shellEscape('process.stdout.write(Buffer.from(process.argv[1], "base64").toString("utf8"));')} ${shellEscape(promptBase64)} > ${shellEscape(DEFAULT_REMOTE_PROMPT_FILE)}`,
    `chown -R ${shellEscape(DEFAULT_REMOTE_WORKSPACE_USER)}:${shellEscape(DEFAULT_REMOTE_WORKSPACE_USER)} ${shellEscape(DEFAULT_REMOTE_LOCAL_ROOT)}`,
    `chown ${shellEscape(DEFAULT_REMOTE_WORKSPACE_USER)}:${shellEscape(DEFAULT_REMOTE_WORKSPACE_USER)} ${shellEscape(DEFAULT_REMOTE_PROMPT_FILE)}`,
    `chmod 600 ${shellEscape(DEFAULT_REMOTE_PROMPT_FILE)}`,
    "if command -v runuser >/dev/null 2>&1; then",
    `  exec runuser -u ${shellEscape(DEFAULT_REMOTE_WORKSPACE_USER)} -- env -i HOME=${shellEscape("/home/developer")} USER=${shellEscape(DEFAULT_REMOTE_WORKSPACE_USER)} LOGNAME=${shellEscape(DEFAULT_REMOTE_WORKSPACE_USER)} PATH=${shellEscape(DEFAULT_REMOTE_DEVELOPER_PATH)} TERM=${shellEscape("dumb")} CI=${shellEscape("1")} bash -lc ${shellEscape(developerScript)}`,
    "fi",
    `exec su - ${shellEscape(DEFAULT_REMOTE_WORKSPACE_USER)} -c ${shellEscape(developerScript)}`,
  ].join("\n");
}

function buildClaudeDiagnosticsRemoteScript(): string {
  const developerEnvProbe = [
    "set +e",
    'printf "PATH=%s\\n" "$PATH"',
    "command -v node || true",
    "node --version || true",
    "command -v npm || true",
    "npm --version || true",
    "command -v claude || true",
    "claude --version || true",
  ].join("\n");

  return [
    "set +e",
    'echo "claude_processes:"',
    "ps -eo pid=,ppid=,stat=,wchan=,etime=,time=,comm=,args= | grep -E '[c]laude|[r]unuser|[s]u -' || true",
    'echo "\\nworkspace_files:"',
    `ls -ld ${shellEscape(DEFAULT_REMOTE_LOCAL_ROOT)} ${shellEscape(DEFAULT_REMOTE_LOCAL_BIN_DIR)} ${shellEscape(DEFAULT_REMOTE_LOCAL_NODE_DIR)} ${shellEscape(DEFAULT_REMOTE_CLAUDE_AUTH_DIR)} ${shellEscape(DEFAULT_REMOTE_PROMPT_FILE)} ${shellEscape(DEFAULT_REMOTE_CLAUDE_AUTH_FILE)} 2>/dev/null || true`,
    `ls -l ${shellEscape(`${DEFAULT_REMOTE_LOCAL_BIN_DIR}/node`)} ${shellEscape(`${DEFAULT_REMOTE_LOCAL_BIN_DIR}/npm`)} ${shellEscape(`${DEFAULT_REMOTE_LOCAL_BIN_DIR}/claude`)} 2>/dev/null || true`,
    'echo "\\ndeveloper_env:"',
    "if command -v runuser >/dev/null 2>&1; then",
    `  runuser -u ${shellEscape(DEFAULT_REMOTE_WORKSPACE_USER)} -- env -i HOME=${shellEscape("/home/developer")} USER=${shellEscape(DEFAULT_REMOTE_WORKSPACE_USER)} LOGNAME=${shellEscape(DEFAULT_REMOTE_WORKSPACE_USER)} PATH=${shellEscape(DEFAULT_REMOTE_DEVELOPER_PATH)} TERM=${shellEscape("dumb")} CI=${shellEscape("1")} bash -lc ${shellEscape(developerEnvProbe)} || true`,
    "else",
    `  su - ${shellEscape(DEFAULT_REMOTE_WORKSPACE_USER)} -c ${shellEscape(developerEnvProbe)} || true`,
    "fi",
    'echo "\\nnode_install_log:"',
    `tail -n 80 ${shellEscape(DEFAULT_REMOTE_NODE_INSTALL_LOG)} 2>/dev/null || true`,
    'echo "\\nclaude_install_log:"',
    `tail -n 80 ${shellEscape(DEFAULT_REMOTE_CLAUDE_INSTALL_LOG)} 2>/dev/null || true`,
  ].join("\n");
}

function buildChangeIDListRemoteScript(targetBookmark: string): string {
  const targetRevset = `present(bookmarks(exact:"${escapeJjStringLiteral(targetBookmark)}"))`;
  const revset = `(::@ ~ ::${targetRevset}) ~ empty()`;
  return [
    "set -euo pipefail",
    buildWorkspaceBootstrapScript(),
    `jj log -r ${shellEscape(revset)} --reversed --no-graph -T ${shellEscape('change_id ++ "\\n"')}`,
  ].join("\n");
}

function stripAnsi(value: string): string {
  return value
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, "")
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\r/g, "");
}

function getWorkspaceKnownHostsFile(): string {
  const knownHostsFile =
    process.env.CODEPLANE_WORKSPACE_KNOWN_HOSTS_FILE?.trim() ||
    DEFAULT_LOCAL_WORKSPACE_KNOWN_HOSTS_FILE;
  mkdirSync(dirname(knownHostsFile), { recursive: true });
  return knownHostsFile;
}

function buildSSHInvocationArgs(
  sshCommand: string,
  options: { forceTTY?: boolean } = {},
): string[] {
  const sshArgs = tokenizeShellWords(sshCommand);
  if (sshArgs.length === 0) {
    throw new Error("workspace ssh command was empty");
  }

  const connectTimeoutSeconds = parsePositiveIntegerEnv(
    "CODEPLANE_WORKSPACE_SSH_CONNECT_TIMEOUT_SECONDS",
    DEFAULT_WORKSPACE_SSH_CONNECT_TIMEOUT_SECONDS,
  );
  const executable = basename(sshArgs[0] ?? "").toLowerCase();
  if (executable !== "ssh" && executable !== "ssh.exe") {
    return sshArgs;
  }

  return [
    sshArgs[0]!,
    ...(options.forceTTY ? ["-tt"] : []),
    "-o",
    "BatchMode=yes",
    "-o",
    `ConnectTimeout=${connectTimeoutSeconds}`,
    "-o",
    "StrictHostKeyChecking=accept-new",
    "-o",
    `UserKnownHostsFile=${getWorkspaceKnownHostsFile()}`,
    "-o",
    "LogLevel=ERROR",
    ...sshArgs.slice(1),
  ];
}

function buildSSHSpawnSpec(sshArgs: string[]): { args: string[]; command: string } {
  const executable = basename(sshArgs[0] ?? "").toLowerCase();
  if (executable !== "ssh" && executable !== "ssh.exe") {
    return { command: sshArgs[0]!, args: sshArgs.slice(1) };
  }

  const scriptCommand = Bun.which("script");
  if (!scriptCommand) {
    return { command: sshArgs[0]!, args: sshArgs.slice(1) };
  }

  if (process.platform === "darwin") {
    return {
      command: scriptCommand,
      args: ["-q", "/dev/null", sshArgs[0]!, ...sshArgs.slice(1)],
    };
  }

  return {
    command: scriptCommand,
    args: ["-q", "-e", "-f", "-c", sshArgs.map(shellEscape).join(" "), "/dev/null"],
  };
}

function buildScriptWrappedSSHCommand(
  sshArgs: string[],
  stdinFilePath: string,
): { args: string[]; command: string } | null {
  const executable = basename(sshArgs[0] ?? "").toLowerCase();
  if (executable !== "ssh" && executable !== "ssh.exe") {
    return null;
  }

  const scriptCommand = Bun.which("script");
  if (!scriptCommand) {
    return null;
  }

  const commandString =
    process.platform === "darwin"
      ? `${shellEscape(scriptCommand)} -q /dev/null ${sshArgs.map(shellEscape).join(" ")} < ${shellEscape(stdinFilePath)}`
      : `${shellEscape(scriptCommand)} -q -e -f -c ${shellEscape(sshArgs.map(shellEscape).join(" "))} /dev/null < ${shellEscape(stdinFilePath)}`;

  return {
    command: "/bin/sh",
    args: ["-lc", commandString],
  };
}

function buildRemoteShellSessionScript(beginMarker: string, endMarker: string, script: string): string {
  return `${[
    "stty -echo",
    "exec 2>&1",
    "export PROMPT_COMMAND=",
    "export PS1='__CODEPLANE_PROMPT__ '",
    `printf '${beginMarker}\\n'`,
    "(",
    script,
    ")",
    "__codeplane_status=$?",
    `printf '\\n${endMarker}:%s\\n' \"$__codeplane_status\"`,
    'exit "$__codeplane_status"',
  ].join("\n")}\n`;
}

function extractRemoteShellOutput(
  rawOutput: string,
  beginMarker: string,
  endMarker: string,
): { exitCode: number | null; output: string; raw: string } {
  const normalized = stripAnsi(rawOutput);
  const beginPattern = `${beginMarker}\n`;
  const beginIndex = normalized.indexOf(beginPattern);
  if (beginIndex === -1) {
    return { exitCode: null, output: normalized.trim(), raw: rawOutput };
  }

  const endPattern = new RegExp(`(?:^|\\n)${escapeRegExp(endMarker)}:(\\d+)\\n?`);
  const afterBegin = normalized.slice(beginIndex + beginPattern.length);
  const endMatch = endPattern.exec(afterBegin);
  if (!endMatch || endMatch.index === undefined) {
    return { exitCode: null, output: afterBegin.trim(), raw: rawOutput };
  }

  const exitCode = Number.parseInt(endMatch[1] ?? "", 10);
  const output = afterBegin.slice(0, endMatch.index).replace(/^\n+/, "").replace(/\n+$/, "");
  return {
    exitCode: Number.isFinite(exitCode) ? exitCode : null,
    output,
    raw: rawOutput,
  };
}

async function waitForProcessExit(
  proc: ReturnType<typeof Bun.spawn>,
  timeoutMs: number,
  label: string,
): Promise<number> {
  let timedOut = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const exitCode = await Promise.race([
    proc.exited,
    new Promise<number>((resolve) => {
      timeoutId = setTimeout(() => {
        timedOut = true;
        resolve(124);
      }, timeoutMs);
    }),
  ]);

  if (timeoutId) {
    clearTimeout(timeoutId);
  }

  if (timedOut) {
    try {
      proc.kill();
    } catch {
      // Ignore kill races if the process exits while timing out.
    }
    await proc.exited.catch(() => undefined);
    throw new Error(`${label} timed out after ${Math.ceil(timeoutMs / 1000)}s`);
  }

  return exitCode;
}

async function runRemoteShellCommand(
  sshCommand: string,
  script: string,
  label: string,
  options: { streamOutputToStderr?: boolean; timeoutMs?: number } = {},
): Promise<string> {
  const markerId = crypto.randomUUID();
  const beginMarker = `__CODEPLANE_BEGIN_${markerId}__`;
  const endMarker = `__CODEPLANE_END_${markerId}__`;
  const timeoutMs = options.timeoutMs ?? DEFAULT_WORKSPACE_REMOTE_COMMAND_TIMEOUT_MS;
  const sshArgs = buildSSHInvocationArgs(sshCommand, { forceTTY: true });
  const sessionScript = buildRemoteShellSessionScript(beginMarker, endMarker, script);
  const stdinFilePath = join(tmpdir(), `codeplane-workspace-ssh-${crypto.randomUUID()}.txt`);
  writeFileSync(stdinFilePath, sessionScript, "utf8");

  try {
    const wrappedSpawnSpec = buildScriptWrappedSSHCommand(sshArgs, stdinFilePath);
    const spawnSpec = wrappedSpawnSpec ?? buildSSHSpawnSpec(sshArgs);
    const proc = Bun.spawn([spawnSpec.command, ...spawnSpec.args], {
      stdout: "pipe",
      stderr: "pipe",
      stdin: wrappedSpawnSpec ? undefined : "pipe",
    });

    const stdoutPromise = new Response(proc.stdout).text();
    const stderrPromise = new Response(proc.stderr).text();

    if (!wrappedSpawnSpec) {
      await proc.stdin.write(sessionScript);
      await proc.stdin.end();
    }

    const exitCode = await waitForProcessExit(proc, timeoutMs, label);
    const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
    const extracted = extractRemoteShellOutput(stdout, beginMarker, endMarker);
    const shellExitCode = extracted.exitCode ?? exitCode;
    const output = extracted.output.trim();

    if (options.streamOutputToStderr && output) {
      process.stderr.write(output.endsWith("\n") ? output : `${output}\n`);
    }

    if (shellExitCode !== 0) {
      throw new Error(output || stderr.trim() || `${label} exited with code ${shellExitCode}`);
    }

    return extracted.output;
  } finally {
    rmSync(stdinFilePath, { force: true });
  }
}

async function runRemoteInteractiveCommand(
  sshCommand: string,
  script: string,
  label: string,
): Promise<void> {
  await runRemoteShellCommand(sshCommand, script, label, {
    streamOutputToStderr: true,
    timeoutMs: parsePositiveIntegerEnv(
      "CODEPLANE_WORKSPACE_CLAUDE_TIMEOUT_MS",
      DEFAULT_WORKSPACE_CLAUDE_TIMEOUT_MS,
    ),
  });
}

async function runRemoteProvisionCommand(
  sshCommand: string,
  script: string,
  label: string,
): Promise<void> {
  await runRemoteShellCommand(sshCommand, script, label);
}

async function runWorkspaceClaudeCommand(sshCommand: string, prompt: string): Promise<void> {
  try {
    await runRemoteInteractiveCommand(sshCommand, buildClaudeRemoteScript(prompt), "claude");
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    let diagnostics = "";
    try {
      diagnostics = (
        await runRemoteCaptureCommand(
          sshCommand,
          buildClaudeDiagnosticsRemoteScript(),
          "claude diagnostics",
        )
      ).trim();
    } catch (diagnosticError) {
      const diagnosticDetail =
        diagnosticError instanceof Error ? diagnosticError.message : "unknown diagnostic error";
      throw new Error(`${detail}\n\nWorkspace diagnostics failed: ${diagnosticDetail}`);
    }

    if (diagnostics) {
      throw new Error(`${detail}\n\nWorkspace diagnostics:\n${diagnostics}`);
    }

    throw error;
  }
}

async function runSSHCommand(sshCommand: string): Promise<void> {
  const sshArgs = buildSSHInvocationArgs(sshCommand);
  const spawnSpec = buildSSHSpawnSpec(sshArgs);
  const proc = Bun.spawn([spawnSpec.command, ...spawnSpec.args], {
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`SSH exited with code ${exitCode}`);
  }
}

async function runRemoteCaptureCommand(
  sshCommand: string,
  script: string,
  label: string,
): Promise<string> {
  return runRemoteShellCommand(sshCommand, script, label);
}

async function ensureWorkspaceClaudeAuth(sshCommand: string): Promise<void> {
  const authEnv = getClaudeAuthEnv();
  if (Object.keys(authEnv).length > 0) {
    await runRemoteProvisionCommand(
      sshCommand,
      buildClaudeAuthSeedRemoteScript(authEnv),
      "claude auth bootstrap",
    );
    return;
  }

  const stdout = await runRemoteCaptureCommand(
    sshCommand,
    `if [ -f ${shellEscape(DEFAULT_REMOTE_CLAUDE_AUTH_FILE)} ]; then printf ready; fi`,
    "claude auth check",
  );
  if (stdout.trim() === "ready") {
    return;
  }

  throw new Error(
    "Claude Code auth is not configured. Run `codeplane auth claude login`, or set ANTHROPIC_AUTH_TOKEN / ANTHROPIC_API_KEY locally and rerun `codeplane workspace issue`.",
  );
}

async function listWorkspaceChangeIDs(
  sshCommand: string,
  targetBookmark: string,
): Promise<string[]> {
  const stdout = await runRemoteCaptureCommand(
    sshCommand,
    buildChangeIDListRemoteScript(targetBookmark),
    "jj log",
  );
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export const workspace = Cli.create("workspace", {
  description: "Manage cloud workspaces",
})
  .command("create", {
    description: "Create a workspace",
    options: z.object({
      name: z.string().default("").describe("Workspace name"),
      snapshot: z.string().optional().describe("Snapshot ID to restore from"),
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      const { owner, repo } = resolveRepoRef(c.options.repo);
      return api("POST", `/api/repos/${owner}/${repo}/workspaces`, {
        name: c.options.name,
        ...(c.options.snapshot && { snapshot_id: c.options.snapshot }),
      });
    },
  })
  .command("list", {
    description: "List workspaces",
    options: z.object({
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      const { owner, repo } = resolveRepoRef(c.options.repo);
      return api("GET", `/api/repos/${owner}/${repo}/workspaces`);
    },
  })
  .command("view", {
    description: "View workspace details (status, SSH info, persistence)",
    args: z.object({
      id: z.string().describe("Workspace ID"),
    }),
    options: z.object({
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      const { owner, repo } = resolveRepoRef(c.options.repo);
      const ws = await api<{
        id: string;
        status: string;
        ssh_host?: string;
        persistence?: string;
        snapshot_id?: string;
        idle_timeout_seconds?: number;
        created_at?: string;
        updated_at?: string;
        suspended_at?: string | null;
      }>("GET", `/api/repos/${owner}/${repo}/workspaces/${c.args.id}`);

      // Fetch SSH connection info if workspace is running
      let sshInfo: WorkspaceSSHInfo | null = null;
      if (ws.status === "running") {
        try {
          sshInfo = await api<WorkspaceSSHInfo>(
            "GET",
            `/api/repos/${owner}/${repo}/workspaces/${c.args.id}/ssh`,
          );
        } catch {
          // SSH info may not be available yet
        }
      }

      // Calculate uptime from created_at/updated_at
      let uptime: string | null = null;
      if (ws.status === "running" && ws.created_at) {
        const startTime = ws.suspended_at
          ? new Date(ws.updated_at ?? ws.created_at)
          : new Date(ws.created_at);
        const now = new Date();
        const diffMs = now.getTime() - startTime.getTime();
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        uptime = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
      }

      return {
        ...ws,
        ssh: sshInfo
          ? {
              command:
                getSSHCommand(sshInfo) ??
                (sshInfo.ssh_host
                  ? `ssh ${sshInfo.ssh_host}`
                  : ws.ssh_host
                    ? `ssh ${ws.ssh_host}`
                    : "SSH details available"),
              host: sshInfo.host ?? sshInfo.ssh_host ?? ws.ssh_host,
              port: sshInfo.port ?? 22,
              username: sshInfo.username,
            }
          : ws.ssh_host
            ? { command: `ssh ${ws.ssh_host}`, host: ws.ssh_host, port: 22 }
            : null,
        uptime,
        persistence: ws.persistence ?? "sticky",
        snapshot_id: ws.snapshot_id ?? null,
        idle_timeout_seconds: ws.idle_timeout_seconds ?? 1800,
      };
    },
  })
  .command("delete", {
    description: "Delete a workspace",
    args: z.object({
      id: z.string().describe("Workspace ID"),
    }),
    options: z.object({
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      const { owner, repo } = resolveRepoRef(c.options.repo);
      await api("DELETE", `/api/repos/${owner}/${repo}/workspaces/${c.args.id}`);
      return { status: "deleted", id: c.args.id };
    },
  })
  .command("ssh", {
    description:
      "SSH into a workspace (creates one if none exists for the repo)",
    args: z.object({
      id: z
        .string()
        .optional()
        .describe("Workspace ID (auto-detected if omitted)"),
    }),
    options: z.object({
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      const { owner, repo } = resolveRepoRef(c.options.repo);
      let workspaceId = c.args.id;

      if (!workspaceId) {
        // Look for an existing workspace for this repo
        const workspaces = await api<{ id: string; status: string }[]>(
          "GET",
          `/api/repos/${owner}/${repo}/workspaces`,
        );

        // Prefer a running workspace, then any existing one
        const running = workspaces.find((ws) => ws.status === "running");
        const existing = running ?? workspaces[0];

        if (existing) {
          workspaceId = existing.id;
        } else {
          // No workspace exists — create one automatically
          const created = await api<{ id: string }>(
            "POST",
            `/api/repos/${owner}/${repo}/workspaces`,
            { name: "" },
          );
          workspaceId = created.id;
        }
      }

      // Get SSH connection info
      const sshInfo = await waitForWorkspaceSSHInfo(owner, repo, workspaceId);
      const sshCommand = getSSHCommand(sshInfo);

      if (sshCommand) {
        await runSSHCommand(sshCommand);
        return { connected: true, workspace_id: workspaceId };
      }

      // Fall back to returning connection info if no ssh_command
      return { workspace_id: workspaceId, ...sshInfo };
    },
  })
  .command("fork", {
    description: "Fork a workspace",
    args: z.object({
      id: z.string().describe("Workspace ID to fork"),
    }),
    options: z.object({
      name: z.string().default("").describe("Name for the forked workspace"),
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      const { owner, repo } = resolveRepoRef(c.options.repo);
      return api("POST", `/api/repos/${owner}/${repo}/workspaces/${c.args.id}/fork`, {
        name: c.options.name,
      });
    },
  })
  .command("snapshots", {
    description: "List workspace snapshots",
    args: z.object({
      id: z.string().describe("Workspace ID"),
    }),
    options: z.object({
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      const { owner, repo } = resolveRepoRef(c.options.repo);
      return api("GET", `/api/repos/${owner}/${repo}/workspaces/${c.args.id}/snapshots`);
    },
  })
  .command("watch", {
    description: "Watch a workspace for real-time status updates",
    args: z.object({
      id: z.string().describe("Workspace ID"),
    }),
    options: z.object({
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      const { owner, repo } = resolveRepoRef(c.options.repo);

      // First fetch the current workspace status
      const ws = await api<{
        id: string;
        status: string;
        name?: string;
        persistence?: string;
        created_at?: string;
        updated_at?: string;
      }>("GET", `/api/repos/${owner}/${repo}/workspaces/${c.args.id}`);

      process.stderr.write(
        `Watching workspace ${ws.id}${ws.name ? ` (${ws.name})` : ""} (status: ${ws.status})...\n`,
      );

      // Connect to the SSE stream
      const auth = requireAuthToken();
      const baseUrl = auth.apiUrl;
      const url = `${baseUrl}/api/repos/${owner}/${repo}/workspaces/${c.args.id}/stream`;
      const res = await fetch(url, {
        headers: {
          Authorization: `token ${auth.token}`,
          Accept: "text/event-stream",
        },
      });
      if (!res.ok) {
        throw new Error(`Failed to connect to workspace stream: ${res.status} ${res.statusText}`);
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
            // End of event
            const eventType = currentEventType || "status";
            let parsed: unknown;
            try {
              parsed = JSON.parse(currentData);
            } catch {
              parsed = currentData;
            }

            const event = { type: eventType, data: parsed, ...(currentEventId ? { id: currentEventId } : {}) };
            events.push(event);

            // Format human-readable output
            const statusData = parsed as { status?: string; action?: string; message?: string };
            if (statusData.status) {
              process.stderr.write(`Status: ${statusData.status}\n`);
            } else if (statusData.action) {
              process.stderr.write(`Event: ${statusData.action}${statusData.message ? ` — ${statusData.message}` : ""}\n`);
            } else {
              process.stdout.write(`${currentData}\n`);
            }

            // Reset for next event
            currentEventType = "";
            currentEventId = "";
            currentData = "";

            // Exit if workspace reaches a terminal state
            if (statusData.status === "deleted" || statusData.status === "error") {
              return { ...ws, events };
            }
          } else if (line.startsWith(":")) {
            // SSE comment (keep-alive), ignore
          }
        }
      }

      // Stream ended
      return { ...ws, events };
    },
  })
  .command("issue", {
    description:
      "Spin up a workspace for an issue: fetches the issue, SSHs in, runs Claude Code with the issue as prompt, then creates a landing request from the committed changes",
    args: z.object({
      number: z.string().describe("Issue number to work on"),
    }),
    options: z.object({
      target: z.string().default("main").describe("Target bookmark for the landing request"),
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      const { owner, repo } = resolveRepoRef(c.options.repo);
      const issueNumber = Number.parseInt(c.args.number, 10);
      if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0) {
        throw new Error("invalid issue number");
      }

      // 1. Fetch the issue
      const issue = await api<{
        number: number;
        title: string;
        body: string;
        state: string;
        labels?: { name: string }[];
      }>("GET", `/api/repos/${owner}/${repo}/issues/${issueNumber}`);

      // 2. Create workspace (or reuse existing active one)
      const ws = await api<{
        id: string;
        status: string;
      }>("POST", `/api/repos/${owner}/${repo}/workspaces`, {
        name: `issue-${issueNumber}`,
      });

      // 3. Get SSH connection info
      const sshInfo = await waitForWorkspaceSSHInfo(owner, repo, ws.id);
      const sshCommand = getSSHCommand(sshInfo);
      if (!sshCommand) {
        throw new Error(`workspace ${ws.id} did not return an SSH command`);
      }

      await ensureWorkspaceClaudeAuth(sshCommand);

      // 4. Build the Claude Code prompt from the issue
      const labels = issue.labels?.map((l) => l.name).join(", ") ?? "";
      const prompt = [
        `Fix issue #${issueNumber}: ${issue.title}`,
        labels ? `Labels: ${labels}` : "",
        "",
        issue.body,
        "",
        "When done, commit your changes with jj. Do not create a landing request — that will be handled automatically after you exit.",
      ]
        .filter(Boolean)
        .join("\n");

      // 5. SSH in and run Claude Code with the issue as prompt
      await runWorkspaceClaudeCommand(sshCommand, prompt);

      // 6. After Claude exits, get the change IDs from the workspace
      //    by listing non-empty jj changes that differ from the target bookmark.
      const changeIDs = await listWorkspaceChangeIDs(sshCommand, c.options.target);
      if (changeIDs.length === 0) {
        return {
          workspace_id: ws.id,
          issue: issueNumber,
          status: "completed",
          message: `Claude Code session ended. No non-empty changes were detected relative to ${c.options.target}, so no landing request was created.`,
        };
      }

      try {
        const lr = await api<{
          number: number;
          title: string;
          state: string;
        }>("POST", `/api/repos/${owner}/${repo}/landings`, {
          title: `fix: ${issue.title} (#${issueNumber})`,
          body: `Closes #${issueNumber}\n\n${issue.body}`,
          target_bookmark: c.options.target,
          change_ids: changeIDs,
        });

        return {
          workspace_id: ws.id,
          landing_request: lr.number,
          change_ids: changeIDs,
          issue: issueNumber,
          status: "completed",
        };
      } catch (error) {
        const detail = error instanceof Error ? error.message : "unknown error";
        return {
          workspace_id: ws.id,
          change_ids: changeIDs,
          issue: issueNumber,
          status: "completed",
          message: `Claude Code session ended, but the landing request could not be created: ${detail}`,
        };
      }
    },
  });
