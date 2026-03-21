# AGENT_CLI_ASK

Specification for AGENT_CLI_ASK.

## High-Level User POV

When you install the Codeplane CLI, you get an AI-powered usage helper built right into the command line. If you run `codeplane` with no command—or type something like `codeplane "how do I create a landing request?"`—you are immediately talking to a local Codeplane helper agent that understands your current repository, your jj workflow state, and the Codeplane product documentation.

The helper operates in two modes. In **interactive mode**, you simply run `codeplane` (or `codeplane agent ask`) and enter a conversational REPL where you can ask questions, get guidance on jj and Codeplane workflows, and receive context-aware advice grounded in your actual repo state and the latest Codeplane documentation. In **one-shot mode**, you pass your question directly as a quoted string—`codeplane "what bookmarks exist?"`—and the helper responds once and exits.

The helper is repository-aware from the moment it starts. It automatically detects your jj repository root, reads your jj status and remotes, identifies the Codeplane repository you're working in, and checks your authentication state. This means it can give you advice that is specific to your current project, not generic boilerplate. If your docs cache is stale or unavailable, the helper transparently falls back to cached documentation or warns you that docs-backed answers may be degraded.

For more adventurous workflows, you can run `codeplane --sandbox "fix this bug"` to have the helper execute file operations inside a remote Codeplane workspace rather than on your local filesystem. This isolates changes in a sandboxed environment while still giving the agent full read, write, edit, find, and bash capabilities. The sandbox requires an authenticated Codeplane account and a valid repository.

If the helper encounters a genuine Codeplane product bug or UX issue during your session, it can file a Codeplane issue on your behalf—complete with your repo context, reproduction steps, and workaround notes—without you leaving the terminal.

The overall value is that Codeplane's CLI is not just a set of command wrappers. It is an intelligent companion that meets you where you are—inside a jj repo, at the terminal—and helps you navigate Codeplane and jj with confidence.

## Acceptance Criteria

- [ ] **AC-1**: Running `codeplane` with no arguments enters the interactive agent REPL.
- [ ] **AC-2**: Running `codeplane "any question here"` sends a one-shot prompt to the agent and prints the response to stdout, then exits with code 0.
- [ ] **AC-3**: Running `codeplane agent ask` enters the interactive agent REPL (equivalent to bare `codeplane`).
- [ ] **AC-4**: Running `codeplane agent ask "question"` sends a one-shot prompt (equivalent to `codeplane "question"`).
- [ ] **AC-5**: Running `codeplane agent "question"` rewrites to `codeplane agent ask "question"` (automatic subcommand injection).
- [ ] **AC-6**: The agent MUST collect repository context before the session starts, including: current working directory, jj repo root (if any), jj status output, jj git remote list output, Codeplane auth status, detected Codeplane repo slug, and remote repo availability.
- [ ] **AC-7**: The agent MUST attempt to refresh the Codeplane documentation cache on startup with a configurable timeout (default 3 seconds). If refresh fails, the agent MUST fall back gracefully to a cached copy (status: "stale") or continue without docs (status: "unavailable").
- [ ] **AC-8**: The agent MUST provide three Codeplane-specific tools to the underlying session: `codeplane_repo_context`, `codeplane_docs_search`, and `codeplane_issue_create`.
- [ ] **AC-9**: The `codeplane_docs_search` tool MUST return at most 8 results (hard cap) and default to 4 results.
- [ ] **AC-10**: The `codeplane_issue_create` tool MUST resolve the target repository from the `repo` parameter, the `CODEPLANE_AGENT_ISSUE_REPO` env var, or the `agent_issue_repo` config value, in that order. If none is set, it MUST error with a clear message.
- [ ] **AC-11**: The `--sandbox` flag MUST create a workspace-backed execution backend using SSH. It MUST require: a local jj repo root, a Codeplane repo slug, and authenticated Codeplane credentials. If any of these are missing, it MUST error with a specific message.
- [ ] **AC-12**: The `--repo OWNER/REPO` flag MUST override automatic repo slug detection.
- [ ] **AC-13**: The `-R` flag MUST be rewritten to `--repo` before command parsing.
- [ ] **AC-14**: Terminal flags (`--help`, `--version`, `--llms`, `--schema`, `--mcp`) MUST prevent the default-to-agent rewrite and display their normal output.
- [ ] **AC-15**: If the user provides `--format json` (or other structured formats) in one-shot mode, the response MUST be returned as a structured JSON object containing `backend`, `repo_context`, `docs_status`, and `response` fields.
- [ ] **AC-16**: If the user provides `--format json` in interactive mode, the CLI MUST error with a clear message that interactive mode only supports default text output.
- [ ] **AC-17**: When `CODEPLANE_AGENT_TEST_MODE=summary` is set, the agent MUST skip full initialization (docs refresh, session creation) and return a lightweight structured summary of the base runtime state.
- [ ] **AC-18**: The one-shot response MUST be written to stdout with exactly one trailing newline (no double newlines).
- [ ] **AC-19**: The agent session MUST be disposed (cleaned up) on exit, regardless of whether the session succeeded or failed.
- [ ] **AC-20**: Workspace backend disposal MUST leave the workspace running for future reuse (no teardown on exit).
- [ ] **AC-21**: The documentation cache MUST use ETag and Last-Modified conditional headers for efficient refresh and MUST store cached docs at `~/.codeplane/cache/agent/docs/`.
- [ ] **AC-22**: Documentation cache timeout MUST be configurable via `CODEPLANE_AGENT_DOCS_TIMEOUT_MS` (integer, milliseconds, >0). Invalid or missing values MUST fall back to 3000ms.
- [ ] **AC-23**: Documentation URL MUST be configurable via `CODEPLANE_AGENT_DOCS_URL` (default: `https://docs.codeplane.app/llms-full.txt`).
- [ ] **AC-24**: The docs index MUST be rebuilt only when the source hash changes; otherwise it MUST be loaded from the cached index file.
- [ ] **AC-25**: jj command output MUST be truncated to 8,000 characters with a `...[truncated]` suffix to prevent context overflow.
- [ ] **AC-26**: The local backend MUST provide read, write, edit, bash, find, and ls tools rooted at the jj repo root (or cwd if no repo root).
- [ ] **AC-27**: The workspace backend MUST map local paths to remote paths under `/home/developer/workspace` and MUST use base64-encoded SSH transport for file I/O.
- [ ] **AC-28**: The system prompt appended to the agent session MUST include the full startup context (repo root, slug, auth, backend, warnings, jj status, jj remotes) and docs status.
- [ ] **AC-29**: The prompt context blocks for jj status and jj remotes MUST be truncated to 4,000 characters each.
- [ ] **AC-30**: The `codeplane_repo_context` tool MUST support a `refresh` parameter that re-collects repo context mid-session.
- [ ] **AC-31**: The workspace backend MUST reuse an existing running workspace if one exists, or find a starting/suspended/pending workspace, or create a new workspace as a last resort.

### Definition of Done

The feature is done when:
1. All acceptance criteria pass in automated tests.
2. Interactive mode, one-shot mode, sandbox mode, and test mode all function correctly.
3. Documentation cache refresh, fallback, and index rebuild all function correctly.
4. All three Codeplane-specific tools (context, docs search, issue create) function correctly.
5. Argument rewriting (`-R`, default-to-agent, agent-ask injection) all function correctly.
6. Graceful error handling exists for all known failure modes (no jj, no auth, no repo, no docs, network failures).
7. Session cleanup occurs on all exit paths.

## Design

### CLI Command

**Command**: `codeplane agent ask [prompt]`

**Aliases**:
- `codeplane` (no args) → rewrites to `codeplane agent ask`
- `codeplane "prompt"` → rewrites to `codeplane agent ask "prompt"`
- `codeplane agent "prompt"` → rewrites to `codeplane agent ask "prompt"`

**Arguments**:
| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `prompt` | string | No | One-shot prompt. Omit for interactive REPL. |

**Options**:
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--sandbox` | boolean | `false` | Execute agent tools in a remote Codeplane workspace |
| `--repo` / `-R` | string | auto-detected | Repository override in `OWNER/REPO` format |
| `--format` | enum | `toon` | Output format (json, yaml, md, jsonl, toon). Only applies to one-shot mode. |

**Reserved agent subcommands** (not rewritten to `ask`): `ask`, `session`, `list`, `view`, `run`, `chat`.

### Argument Rewriting Pipeline

The CLI processes arguments through a multi-pass rewrite pipeline before dispatch:

1. **Known alias rewrite**: `-R` → `--repo`, `--change-id` → `--change`
2. **Toon flag rewrite**: `--toon` → `--format toon`
3. **JSON field selection rewrite**: `--json field.path` → `--json --filter-output field.path`
4. **Repo clone rewrite**: Positional directory arg → `--directory`
5. **Default-to-agent rewrite**: If no recognized command word exists in argv (after skipping root flags), append `agent ask`
6. **Agent subcommand injection**: If `agent` is followed by a non-reserved, non-flag token, inject `ask` between `agent` and the rest

### Interactive Mode UX

When entering interactive mode:
- The agent presents an interactive REPL powered by the Pi coding agent's `InteractiveMode`.
- The user types natural-language questions or requests.
- The agent responds with Codeplane-specific advice, using its tools as needed.
- The session persists in memory until the user exits (Ctrl-C or Ctrl-D).
- If the model is unavailable, a fallback message is displayed.

### One-Shot Mode UX

When a prompt is provided:
- The agent processes the prompt, streams internally, and writes the full response to stdout.
- The process exits with code 0 on success.
- If `--format json` is specified, the output is a JSON object: `{ backend, repo_context, docs_status, response }`.
- If no format override, the response is plain text.

### Agent Tools

**`codeplane_repo_context`**
- Parameters: `refresh` (optional boolean)
- Returns: JSON object with cwd, repo root, repo slug, repo source, jj remotes, jj status, auth status, remote repo availability, backend context, warnings
- When `refresh=true`: re-runs the full context collection pipeline

**`codeplane_docs_search`**
- Parameters: `query` (required string), `max_results` (optional number, 1–8, default 4)
- Returns: Ranked excerpts from the Codeplane docs corpus with section titles, line ranges, and snippet text
- If docs unavailable: Returns a warning message explaining degraded state

**`codeplane_issue_create`**
- Parameters: `title` (required), `summary` (required), `expected_behavior` (optional), `actual_behavior` (optional), `repro_steps` (optional), `workaround` (optional), `why_this_is_still_a_problem` (optional), `repo` (optional OWNER/REPO override)
- Creates an issue via `POST /api/repos/:owner/:repo/issues`
- Issue body is automatically enriched with startup context (cwd, repo root, auth, backend, jj status, jj remotes)

### Documentation Caching System

**Cache location**: `~/.codeplane/cache/agent/docs/`

**Files**:
- `llms-full.txt` — cached docs body
- `llms-full.json` — metadata (etag, lastModified, fetchedAt, url)
- `llms-full.index.json` — pre-built search index (sha256 hash-validated)

**Refresh flow**:
1. Load existing cache metadata
2. Send conditional GET with `If-None-Match` (ETag) and `If-Modified-Since` headers
3. On 304: return cached text with status `fresh`
4. On 200: write new text and metadata, return with status `fresh`
5. On error: return cached text with status `stale` and warning, or `unavailable` if no cache exists

**Index flow**:
1. Compute SHA-256 hash of docs text
2. If cached index exists and hash matches, load it
3. Otherwise, rebuild: split docs into heading-delimited chunks (max 1,500 chars each), write index

**Search algorithm**: BM25-inspired token scoring with title boost (5x per token, 12x for full query match) and content scoring (1x per token, 8x for full query match).

### Execution Backends

**Local backend** (default):
- Tools operate directly on the local filesystem
- Working directory: jj repo root (or cwd)
- No authentication required
- No cleanup on dispose

**Workspace backend** (`--sandbox`):
- Tools operate via SSH on a remote Codeplane workspace
- Requires: jj repo root, Codeplane repo slug, authenticated credentials
- Workspace selection: reuse running → reuse starting/suspended/pending → create new
- File I/O: base64-encoded via SSH
- Shell execution: `bash -lc` via SSH
- Path mapping: local paths mapped to `/home/developer/workspace/` prefix
- Default command timeout: 30 seconds
- Workspace persists after agent exit for reuse

### Environment Variables

| Variable | Purpose | Default |
|----------|---------|--------|
| `CODEPLANE_AGENT_TEST_MODE` | Set to `summary` for lightweight test initialization | unset |
| `CODEPLANE_AGENT_DOCS_URL` | Override docs corpus URL | `https://docs.codeplane.app/llms-full.txt` |
| `CODEPLANE_AGENT_DOCS_TIMEOUT_MS` | Docs refresh timeout in ms | `3000` |
| `CODEPLANE_AGENT_ISSUE_REPO` | Default repo for issue filing | resolved from config |

### Documentation

The following end-user documentation should be written:

1. **CLI Agent Helper guide**: Explain interactive vs one-shot mode, how to ask questions, and what the helper knows about.
2. **Sandbox mode guide**: How to use `--sandbox`, prerequisites (auth, repo), what happens to the workspace after the session.
3. **Configuration reference**: Document all environment variables (`CODEPLANE_AGENT_DOCS_URL`, `CODEPLANE_AGENT_DOCS_TIMEOUT_MS`, `CODEPLANE_AGENT_ISSUE_REPO`, `CODEPLANE_AGENT_TEST_MODE`), config file keys (`agent_issue_repo`), and the `-R`/`--repo` override.
4. **Tools reference**: Brief description of the three Codeplane-specific tools the helper has access to, so users understand what the agent can do.
5. **Troubleshooting section**: Common issues (no jj installed, not in a repo, not logged in, docs unavailable, workspace SSH failures).

## Permissions & Security

### Authorization

| Action | Required Role | Notes |
|--------|---------------|-------|
| Run `codeplane agent ask` (local backend) | None (unauthenticated) | Runs entirely locally. Auth enhances context but is not required. |
| Run `codeplane agent ask --sandbox` | Authenticated user with repo write access | Requires valid PAT or session. Must have permission to create/access workspaces. |
| `codeplane_issue_create` | Authenticated user with issue-write permission on target repo | Requires valid auth token. |
| `codeplane_repo_context` refresh | None | Runs local jj commands; remote repo check requires auth. |
| `codeplane_docs_search` | None | Operates on locally cached docs. |

### Rate Limiting

- **Docs refresh**: Limited by the configurable timeout (default 3s). The CLI makes at most one docs refresh request per agent session startup.
- **Issue creation**: Subject to server-side rate limiting on `POST /api/repos/:owner/:repo/issues`. No additional client-side rate limiting beyond what the agent session naturally imposes (human-in-the-loop or single prompt).
- **Workspace creation**: Subject to server-side workspace creation limits. The client reuses existing workspaces before creating new ones.
- **Remote repo availability check**: One request per session startup. No retry.

### Data Privacy

- **Local filesystem exposure**: The local backend gives the agent full read/write/execute access to the jj repo root (or cwd). Users should be aware that the agent can read any file in the repo.
- **Auth token handling**: The auth token is read from the local config store and transmitted only to the configured Codeplane API host. It is not logged or included in agent tool outputs.
- **jj status and remotes**: These are included in the system prompt sent to the LLM provider. Users should be aware that repo state (file paths, branch names, remote URLs) is shared with the model.
- **Issue filing context**: When `codeplane_issue_create` is used, the issue body includes cwd, repo root, auth host, backend type, jj status, and jj remotes. This is visible to anyone with access to the target issue tracker.
- **Workspace SSH access**: In sandbox mode, SSH credentials are resolved from the API and used transiently. They are not cached to disk.
- **Docs corpus**: The docs cache is stored in plaintext at `~/.codeplane/cache/agent/docs/`. This is public documentation and contains no PII.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `agent_ask_session_started` | Agent runtime initialization completes | `mode` (interactive/oneshot), `backend` (local/workspace), `repo_detected` (bool), `auth_status` (logged_in/logged_out), `docs_status` (fresh/stale/unavailable), `sandbox` (bool), `repo_source` (detected/override/unavailable) |
| `agent_ask_session_ended` | Agent session exits (dispose) | `mode`, `backend`, `duration_ms`, `prompt_count` (number of prompts sent), `tool_calls` (count by tool name), `exit_reason` (user_exit/prompt_complete/error) |
| `agent_ask_prompt_sent` | One-shot prompt processed | `prompt_length_chars`, `response_length_chars`, `duration_ms`, `backend`, `format` |
| `agent_docs_refresh` | Docs cache refresh attempt completes | `result` (fresh_network/fresh_cache/stale/unavailable), `duration_ms`, `url`, `cached_age_ms` (if stale) |
| `agent_docs_search_invoked` | `codeplane_docs_search` tool called | `query_length`, `max_results`, `results_returned`, `docs_status` |
| `agent_issue_created` | `codeplane_issue_create` tool called successfully | `target_repo`, `has_repro_steps` (bool), `has_workaround` (bool), `issue_id` |
| `agent_context_refreshed` | `codeplane_repo_context(refresh=true)` called | `repo_detected` (bool), `auth_changed` (bool) |
| `agent_workspace_resolved` | Workspace backend resolves a workspace | `action` (reused/created), `workspace_status`, `repo_slug` |
| `agent_backend_error` | Backend initialization fails | `backend` (local/workspace), `error_type`, `error_message` |

### Funnel Metrics & Success Indicators

1. **Activation rate**: % of CLI installs that trigger at least one `agent_ask_session_started` within 7 days.
2. **Interactive retention**: % of users who start 2+ interactive sessions in a 7-day window.
3. **Docs search utility**: % of `agent_docs_search_invoked` events that return >0 results.
4. **Issue filing rate**: count of `agent_issue_created` per 1,000 `agent_ask_session_started`.
5. **Sandbox adoption**: % of `agent_ask_session_started` events where `sandbox=true`.
6. **Docs freshness**: % of `agent_docs_refresh` events with `result=fresh_network` or `result=fresh_cache`.
7. **Error rate**: % of `agent_ask_session_started` that end with `exit_reason=error`.
8. **Time to first answer**: p50/p95 of `duration_ms` for `agent_ask_prompt_sent` (one-shot mode).

## Observability

### Logging Requirements

| Log Point | Level | Structured Fields | Description |
|-----------|-------|-------------------|-------------|
| Agent runtime init start | `info` | `mode`, `backend`, `sandbox`, `repo_override` | Logged when `runAgent()` is called |
| Repo context collected | `debug` | `repo_root`, `repo_slug`, `repo_source`, `auth_logged_in`, `warnings_count` | After `collectRepoContext()` completes |
| jj command execution | `debug` | `command`, `exit_code`, `duration_ms`, `output_truncated` | Each jj subprocess call |
| Backend created | `info` | `backend_kind`, `workspace_id` (if workspace) | After backend initialization |
| Docs refresh attempt | `info` | `url`, `has_cached_etag` | Before docs fetch |
| Docs refresh result | `info` | `status` (fresh/stale/unavailable), `source` (network/cache/none), `duration_ms` | After docs fetch |
| Docs index build | `debug` | `chunk_count`, `source_hash`, `rebuilt` (bool) | After index preparation |
| Agent session created | `info` | `mode`, `tool_count`, `custom_tool_count` | After session creation |
| One-shot prompt start | `debug` | `prompt_length` | Before `promptOnce()` |
| One-shot prompt complete | `info` | `response_length`, `duration_ms` | After response received |
| Interactive mode entered | `info` | — | When REPL starts |
| Tool invocation | `debug` | `tool_name`, `params` (redacted) | Each tool call |
| Issue creation | `info` | `target_repo`, `issue_title` | When `codeplane_issue_create` fires |
| Workspace resolution | `info` | `action` (reused/created), `workspace_id`, `status` | When workspace backend resolves |
| SSH command execution | `debug` | `remote_command` (truncated), `exit_code`, `duration_ms` | Each workspace SSH call |
| Session dispose | `info` | `mode`, `duration_ms` | On cleanup |
| Error (any) | `error` | `error_type`, `error_message`, `stack` | Any unhandled or caught error |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_agent_ask_sessions_total` | counter | `mode`, `backend`, `status` (success/error) | Total sessions started |
| `codeplane_agent_ask_session_duration_seconds` | histogram | `mode`, `backend` | Session duration (buckets: 1, 5, 30, 60, 300, 600, 1800) |
| `codeplane_agent_ask_prompt_duration_seconds` | histogram | `backend` | One-shot prompt latency (buckets: 0.5, 1, 2, 5, 10, 30, 60) |
| `codeplane_agent_docs_refresh_total` | counter | `result` (fresh_network, fresh_cache, stale, unavailable) | Docs refresh outcomes |
| `codeplane_agent_docs_refresh_duration_seconds` | histogram | — | Docs refresh latency (buckets: 0.1, 0.5, 1, 2, 3, 5) |
| `codeplane_agent_tool_invocations_total` | counter | `tool_name`, `status` (success/error) | Tool call count |
| `codeplane_agent_tool_duration_seconds` | histogram | `tool_name` | Tool execution latency |
| `codeplane_agent_workspace_resolutions_total` | counter | `action` (reused/created), `status` (success/error) | Workspace resolution outcomes |
| `codeplane_agent_issues_created_total` | counter | `target_repo` | Issues filed via agent |
| `codeplane_agent_backend_errors_total` | counter | `backend`, `error_type` | Backend init failures |
| `codeplane_agent_repo_context_collections_total` | counter | `source` (initial/refresh), `repo_detected` (true/false) | Repo context collection events |

### Alerts & Runbooks

**Alert 1: High agent session error rate**
- Condition: `rate(codeplane_agent_ask_sessions_total{status="error"}[5m]) / rate(codeplane_agent_ask_sessions_total[5m]) > 0.15`
- Severity: Warning
- Runbook:
  1. Check `codeplane_agent_backend_errors_total` to see if errors are backend-specific.
  2. If workspace errors: Check workspace service health, SSH connectivity, API auth.
  3. If local errors: Check for jj binary availability (`which jj`), filesystem permissions.
  4. Review error logs with `error_type` label for the most common failure pattern.
  5. If LLM-related: Check Pi agent session creation logs for model availability issues.

**Alert 2: Docs refresh consistently failing**
- Condition: `rate(codeplane_agent_docs_refresh_total{result="unavailable"}[1h]) / rate(codeplane_agent_docs_refresh_total[1h]) > 0.5`
- Severity: Warning
- Runbook:
  1. Check if `https://docs.codeplane.app/llms-full.txt` is accessible.
  2. Verify DNS resolution and TLS certificate validity.
  3. Check if `CODEPLANE_AGENT_DOCS_TIMEOUT_MS` is set too low for current network conditions.
  4. Confirm the CDN or docs hosting service is healthy.
  5. If persistent: Consider increasing the default timeout or adding a retry.

**Alert 3: Agent prompt latency spike**
- Condition: `histogram_quantile(0.95, rate(codeplane_agent_ask_prompt_duration_seconds_bucket[5m])) > 30`
- Severity: Warning
- Runbook:
  1. Check if latency is backend-specific (local vs workspace).
  2. If workspace: Check SSH latency to workspace hosts, inspect `codeplane_agent_tool_duration_seconds{tool_name=~".*"}` for slow tools.
  3. If local: Check LLM provider response times.
  4. Review tool invocation counts—high tool call counts correlate with high latency.
  5. Check if docs index is being rebuilt frequently (hash mismatches).

**Alert 4: Workspace resolution failures**
- Condition: `rate(codeplane_agent_workspace_resolutions_total{status="error"}[5m]) > 0`
- Severity: Critical
- Runbook:
  1. Check workspace API endpoint health (`/api/repos/:owner/:repo/workspaces`).
  2. Verify SSH connection info endpoint (`/api/repos/:owner/:repo/workspaces/:id/ssh`).
  3. Check if workspace creation is failing (resource limits, quota, container runtime).
  4. Verify user auth tokens are valid.
  5. Check container runtime (sandbox) availability on the server.

### Error Cases and Failure Modes

| Error | Cause | Behavior |
|-------|-------|----------|
| jj not installed | `requireJj()` fails | Process exits with error: "jj is required" |
| No jj repo in cwd | `jj root` returns non-zero | Warning added to context; agent continues with cwd as working dir |
| Auth not configured | No token in config | Agent works locally without auth; remote features degraded |
| Auth token invalid | API returns 401 | Remote repo check returns `available: false`; workspace and issue tools error |
| Docs URL unreachable | Network error or timeout | Falls back to cached docs (stale) or continues without docs (unavailable) |
| Docs URL returns non-200 | Server error | Same fallback behavior as network error |
| Workspace SSH unreachable | SSH connection fails | Error propagated to user with message about workspace connectivity |
| Workspace creation fails | API error | Error with clear message about workspace creation failure |
| Issue repo not configured | No env var, no config, no param | Tool returns error: "No Codeplane issue destination is configured" |
| Issue creation API error | API returns error | Error propagated to user via tool output |
| LLM model unavailable | Pi agent session fails | Fallback message displayed |
| Interactive mode with `--format json` | User error | Explicit error: "Interactive mode only supports default text output" |
| SIGINT/SIGTERM during session | User or system signal | Session disposed cleanly; workspace left running |

## Verification

### CLI Argument Rewriting Tests

- **test: bare `codeplane` rewrites to `codeplane agent ask`** — Input: `[]` (no args), Expect: rewritten to `["agent", "ask"]`
- **test: `codeplane "prompt"` rewrites to `codeplane agent ask "prompt"`** — Input: `["how do I create a repo?"]`, Expect: rewritten to `["agent", "ask", "how do I create a repo?"]`
- **test: `codeplane agent "prompt"` rewrites to `codeplane agent ask "prompt"`** — Input: `["agent", "my question"]`, Expect: rewritten to `["agent", "ask", "my question"]`
- **test: `codeplane agent ask` is not double-rewritten** — Input: `["agent", "ask"]`, Expect: unchanged
- **test: `codeplane agent ask "prompt"` is not rewritten** — Input: `["agent", "ask", "tell me about jj"]`, Expect: unchanged
- **test: reserved subcommands (session, list, view, run, chat) are not rewritten to `ask`** — For each reserved word, Input: `["agent", subcommand]`, Expect: unchanged
- **test: `--help` prevents default-to-agent rewrite** — Input: `["--help"]`, Expect: unchanged
- **test: `--version` prevents default-to-agent rewrite** — Input: `["--version"]`, Expect: unchanged
- **test: `--llms`, `--schema`, `--mcp` each prevent default-to-agent rewrite** — Each flag tested individually
- **test: `-R owner/repo` rewrites to `--repo owner/repo`** — Expect alias rewrite
- **test: `--format json` flag is preserved through rewrite pipeline** — Input: `["--format", "json"]`, Expect: `["--format", "json", "agent", "ask"]`
- **test: root flags with values are skipped during command detection** — Input: `["--format", "json", "--filter-output", "foo"]`, Expect: agent ask appended
- **test: agent rewrite with `--sandbox` flag preserves flag** — Input: `["agent", "--sandbox", "fix this"]`, Expect: `["agent", "ask", "--sandbox", "fix this"]`
- **test: agent rewrite with `--repo` flag preserves flag and value** — Input: `["agent", "--repo", "org/repo", "help me"]`, Expect: ask injected

### Agent Runtime Tests (Test Mode)

- **test: test mode returns structured summary without full init** — Set `CODEPLANE_AGENT_TEST_MODE=summary`, run `codeplane agent ask "hello" --format json`, expect JSON with `backend`, `repo_context`, `docs_status` (unavailable)
- **test: test mode without prompt returns summary without response field** — Expect no `response` key in JSON
- **test: test mode collects repo context** — Run from inside jj repo, expect `repo_context.repoRoot` set
- **test: test mode outside jj repo adds warning** — Run from non-jj dir, expect warning about no jj repository
- **test: test mode with `--repo` override** — Expect `repo_context.repoSlug` matches override, `repoSource` is `"override"`

### Documentation Cache Tests

- **test: fresh docs cache returns status fresh with network source** — Mock fetch 200, expect `status.status === "fresh"`, `source === "network"`
- **test: conditional refresh returns fresh/cache on 304** — Write cached doc with ETag, mock 304, expect `status === "fresh"`, `source === "cache"`
- **test: refresh failure falls back to stale cache** — Write cached doc, mock network error, expect `status === "stale"` with warning
- **test: refresh failure with no cache returns unavailable** — Empty cache, mock error, expect `status === "unavailable"`, `text === null`
- **test: docs cache timeout is respected** — Set timeout=1ms, mock slow fetch, expect fallback
- **test: custom docs URL via environment variable** — Set `CODEPLANE_AGENT_DOCS_URL`, mock fetch, verify URL
- **test: ETag and Last-Modified sent as conditional headers** — Write metadata with etag/lastModified, verify request headers
- **test: cache writes both body and metadata files** — Mock fetch 200 with ETag, verify `llms-full.txt` and `llms-full.json` exist

### Documentation Index Tests

- **test: index is built from docs text** — Call `buildDocsIndex()` with headings, expect chunks with titles and line ranges
- **test: large sections (>1500 chars) are split into sub-chunks** — Expect multiple chunks with same title
- **test: index is cached and reused when hash matches** — Build, write, call `prepareDocsIndex()` same text, expect cached
- **test: index is rebuilt when source hash changes** — Different text, expect new hash
- **test: search returns results ranked by relevance** — Known content, expect title-match section first
- **test: search with empty query returns no results** — Expect empty array
- **test: search respects max_results hard cap of 8** — 20 matching chunks, `max_results: 10`, expect exactly 8
- **test: search with max_results: 1 returns at most 1 result**

### Repo Context Collection Tests

- **test: context includes cwd and ISO timestamp** — Verify fields present
- **test: context detects jj repo root from inside jj repo**
- **test: context detects Codeplane repo slug from origin remote** — Mock remotes, expect `repoSlug`, `repoSource === "detected"`
- **test: context prefers origin remote over other remotes** — Both origin and upstream, expect origin match
- **test: context handles SCP-style remote URLs** — `git@ssh.codeplane.app:owner/repo.git` → `owner/repo`
- **test: context handles HTTPS-style remote URLs** — `https://api.codeplane.app/owner/repo.git` → `owner/repo`
- **test: `--repo` override takes precedence** — Expect `repoSource === "override"`
- **test: context truncates jj output to 8000 chars** — 10,000-char output, expect ≤8000 + `...[truncated]`
- **test: context includes auth status** — With valid auth, expect `loggedIn === true`
- **test: context without auth degrades gracefully** — No auth, expect `loggedIn === false`, no crash
- **test: jj command timeout prevents hanging** — Mock never-exiting jj, expect exit code 124

### Codeplane Tools Tests

- **test: `codeplane_repo_context` returns current context** — Call without refresh, expect JSON with all fields
- **test: `codeplane_repo_context` with refresh=true re-collects** — Modify state, refresh, expect updated
- **test: `codeplane_docs_search` returns results** — Known index, relevant query, expect results
- **test: `codeplane_docs_search` with unavailable docs returns warning** — Null index, expect warning
- **test: `codeplane_docs_search` with stale docs appends cache warning** — Stale status, expect warning appended
- **test: `codeplane_issue_create` creates issue via API** — Mock endpoint, expect POST with enriched body
- **test: `codeplane_issue_create` enriches body with startup context** — Expect cwd, repo root, auth sections
- **test: `codeplane_issue_create` with no target repo errors clearly** — No config/env/param, expect error message
- **test: `codeplane_issue_create` with explicit repo overrides config** — Set env, call with param, expect param used
- **test: `codeplane_issue_create` with invalid repo format errors** — `repo: "invalid"`, expect error

### Backend Tests

- **test: local backend uses repo root as cwd** — `repoRoot` set, expect `backend.cwd === repoRoot`
- **test: local backend falls back to cwd when no repo root** — `repoRoot: null`, expect `backend.cwd === cwd`
- **test: local backend provides 6 tools (read, write, edit, bash, find, ls)**
- **test: workspace backend requires jj repo root** — `repoRoot: null`, expect specific error
- **test: workspace backend requires repo slug** — `repoSlug: null`, expect specific error
- **test: workspace backend requires auth** — `loggedIn: false`, expect specific error
- **test: workspace backend reuses running workspace** — Mock API with running workspace, expect no creation
- **test: workspace backend creates workspace when none exist** — Mock empty list, expect POST
- **test: workspace backend maps local paths to remote paths** — `/local/repo/src/main.ts` → `/home/developer/workspace/src/main.ts`

### End-to-End CLI Tests

- **test (e2e): `codeplane agent ask "hello"` produces non-empty stdout** — Exit code 0, stdout non-empty
- **test (e2e): `codeplane "hello"` produces same behavior as `codeplane agent ask "hello"`** — Both exit 0
- **test (e2e): `codeplane agent ask --format json "hello"` returns valid JSON** — Parse stdout, verify `backend`, `repo_context`, `docs_status`, `response` keys
- **test (e2e): `codeplane --help` does NOT enter agent mode** — stdout contains help text
- **test (e2e): `codeplane --version` does NOT enter agent mode** — stdout contains version
- **test (e2e): test mode exits quickly (<5s)** — `CODEPLANE_AGENT_TEST_MODE=summary`
- **test (e2e): prompt with maximum reasonable length (10,000 chars) is accepted** — Generate 10K chars, test mode, expect success
- **test (e2e): prompt exceeding 100,000 chars is handled gracefully** — No crash or hang
- **test (e2e, sandbox): `--sandbox` creates/reuses workspace** — Requires auth and infra
- **test (e2e): exit code is 0 on success**
- **test (e2e): exit code is non-zero on error** — Interactive mode with `--format json`

### API Tests (Agent Session Endpoints)

- **test (api): POST `/api/repos/:owner/:repo/agent/sessions` creates session** — 201 with id and status
- **test (api): GET `/api/repos/:owner/:repo/agent/sessions` lists sessions** — 200 with array
- **test (api): GET `/api/repos/:owner/:repo/agent/sessions/:id` returns session** — 200
- **test (api): DELETE `/api/repos/:owner/:repo/agent/sessions/:id` deletes session** — 204, then 404
- **test (api): POST `/api/repos/:owner/:repo/agent/sessions/:id/messages` appends message** — 201
- **test (api): GET `/api/repos/:owner/:repo/agent/sessions/:id/messages` lists messages in order** — 200
- **test (api): agent endpoints require authentication** — 401 without token
- **test (api): agent endpoints return 404 for unknown repo**
- **test (api): agent stream endpoint returns 501 in Community Edition**
