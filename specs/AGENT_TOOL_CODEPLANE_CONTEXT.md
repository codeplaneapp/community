# AGENT_TOOL_CODEPLANE_CONTEXT

Specification for AGENT_TOOL_CODEPLANE_CONTEXT.

## High-Level User POV

When you start a Codeplane agent session — whether through `codeplane agent ask`, the bare `codeplane` command, or the TUI agent chat — the agent already knows where you are. It understands your current jj repository, which Codeplane remote you're connected to, whether you're logged in, and what your jj working copy looks like. You don't need to explain your environment. The agent just knows.

This awareness comes from the `codeplane_repo_context` tool, which the agent carries throughout every session. At session startup, the tool automatically collects a snapshot of your local development state: your working directory, your jj repository root, your jj status output, your configured git remotes, your Codeplane authentication status, and whether the remote Codeplane repository is reachable. This snapshot is injected directly into the agent's system prompt so that from the very first interaction, the agent's responses are grounded in your actual project state rather than generic boilerplate.

During longer sessions, your local state can change. You might create new bookmarks, modify files, switch changes, or log in to Codeplane. The agent can refresh its understanding of your environment at any time by calling `codeplane_repo_context` with the refresh flag. This re-runs the full context collection — re-checking jj status, re-reading remotes, re-verifying your auth — and updates the agent's working knowledge mid-session. You can also explicitly ask the agent to refresh its context if you've made changes outside the agent session.

The value is that the Codeplane agent is never out of date about your local state. It can answer questions about your current working copy, suggest jj commands that are appropriate for your exact situation, identify which Codeplane repository you're working on, and tailor its advice to whether you're authenticated or not. This contextual grounding is what makes the Codeplane agent feel like a teammate sitting next to you rather than a generic chatbot.

The context tool also provides execution backend awareness. When you're running in local mode, the agent knows it's operating on your filesystem. When you're running in sandbox mode, the agent knows it's operating inside a remote workspace. This lets it adjust file paths, tool behaviors, and operational advice to match your actual runtime environment.

If any part of the context collection encounters a problem — jj isn't installed, you're not in a repository, authentication is missing, the remote repository is unreachable — the tool captures these as structured warnings rather than crashing. The agent sees these warnings and can proactively inform you about any limitations in its ability to help, or suggest remediation steps.

## Acceptance Criteria

- [ ] **AC-1**: The `codeplane_repo_context` tool MUST be registered as a custom tool on every agent session created via the Codeplane CLI runtime (`initializeAgentRuntime`).
- [ ] **AC-2**: The tool MUST accept a single optional boolean parameter `refresh`. When `refresh` is omitted or `false`, the tool MUST return the most recently collected context without re-running any subprocess or network calls.
- [ ] **AC-3**: When `refresh` is `true`, the tool MUST re-execute the full `collectRepoContext` pipeline: detect jj repo root, run `jj status`, run `jj git remote list`, re-check auth status, and re-verify remote repo availability.
- [ ] **AC-4**: After a `refresh=true` call, the tool MUST also re-invoke the backend's `describeContext()` method and merge the result into the returned context under the `backend` key.
- [ ] **AC-5**: The tool MUST return a response containing a single `text` content block with the full context serialized as pretty-printed JSON (2-space indent).
- [ ] **AC-6**: The tool MUST also return a `details` object containing the raw `RepoContext` value, suitable for structured inspection by the agent framework.
- [ ] **AC-7**: The returned context MUST include all of the following top-level fields: `collectedAt` (ISO-8601 string), `cwd` (string), `repoRoot` (string or null), `repoSlug` (string or null), `repoSource` (one of `"override"`, `"detected"`, `"unavailable"`), `jjRemotes` (CommandCapture), `jjStatus` (CommandCapture), `auth` (RepoAuthStatus), `remoteRepo` (RemoteRepoAvailability), `warnings` (string array), `backend` (object or undefined).
- [ ] **AC-8**: The `collectedAt` field MUST be an ISO-8601 timestamp representing when context collection completed. After a refresh, this field MUST update to the new collection time.
- [ ] **AC-9**: The `cwd` field MUST reflect the process working directory at the time of collection.
- [ ] **AC-10**: The `repoRoot` field MUST be the output of `jj root` (trimmed) if the command exits 0, or `null` if the command fails or the user is not in a jj repository.
- [ ] **AC-11**: The `repoSlug` field MUST be detected by parsing all jj git remotes and matching against the configured Codeplane host. The `origin` remote MUST take precedence over other remotes.
- [ ] **AC-12**: Remote URL parsing MUST support HTTPS-style URLs (`https://api.codeplane.app/owner/repo.git`), SSH-style URLs (`ssh://ssh.codeplane.app/owner/repo`), and SCP-style URLs (`git@ssh.codeplane.app:owner/repo.git`). The `.git` suffix MUST be stripped before parsing.
- [ ] **AC-13**: When a `--repo OWNER/REPO` override is provided via CLI, the `repoSlug` MUST use the override value and `repoSource` MUST be `"override"`.
- [ ] **AC-14**: When no override is provided and a Codeplane remote is detected, `repoSource` MUST be `"detected"`.
- [ ] **AC-15**: When no override is provided and no Codeplane remote is found, `repoSource` MUST be `"unavailable"` and a warning MUST be added to the `warnings` array.
- [ ] **AC-16**: The `jjStatus` field MUST be a `CommandCapture` object containing `command` (the full command string), `ok` (boolean), `output` (truncated stdout or undefined), `error` (truncated stderr or undefined), and `exitCode` (number or null).
- [ ] **AC-17**: The `jjRemotes` field MUST follow the same `CommandCapture` structure as `jjStatus`.
- [ ] **AC-18**: Command output (both `jjStatus.output` and `jjRemotes.output`) MUST be trimmed and truncated to a maximum of 8,000 characters. If truncated, a `...\n...[truncated]` suffix MUST be appended.
- [ ] **AC-19**: Empty or whitespace-only command output MUST be normalized to `undefined` rather than an empty string.
- [ ] **AC-20**: jj subprocess calls MUST have a 10-second timeout. If a command exceeds the timeout, it MUST be killed and the result MUST have `exitCode: 124`.
- [ ] **AC-21**: The `auth` field MUST contain: `loggedIn` (boolean), `host` (string), `user` (string or undefined), `tokenSource` (string or undefined), `message` (string or undefined), and `verified` (boolean). `verified` MUST be `true` only if `loggedIn` is `true` and `message` does not contain "Could not verify".
- [ ] **AC-22**: The `remoteRepo` field MUST contain: `checked` (boolean), `available` (boolean or undefined), `status` (HTTP status number or undefined), `message` (string or undefined), and `url` (string or undefined).
- [ ] **AC-23**: Remote repo availability MUST be checked only when a `repoSlug` is detected AND the user is logged in. If either condition is false, `checked` MUST be `false` with an appropriate message.
- [ ] **AC-24**: The remote repo availability check MUST use the auth token and send an `Authorization: token <token>` header and `Accept: application/json` header.
- [ ] **AC-25**: If the remote repo API call returns a non-OK status, the response body MUST be parsed for a `message` field. If the body is not JSON or has no `message`, the HTTP `statusText` MUST be used.
- [ ] **AC-26**: The `warnings` array MUST accumulate all non-fatal issues encountered during collection: no jj repo root, failed jj commands, no Codeplane remote detected.
- [ ] **AC-27**: The `backend` field MUST be populated by calling `describeContext()` on the current execution backend after initial context collection. It MUST be re-populated on refresh.
- [ ] **AC-28**: The startup context MUST be injected into the agent system prompt as a JSON code block under the heading "Startup Context", with a note that `codeplane_repo_context(refresh=true)` can be used to refresh it.
- [ ] **AC-29**: The system prompt MUST include prompt guidelines instructing the agent to use `codeplane_repo_context(refresh=true)` when local repo state or auth may have changed during the session.
- [ ] **AC-30**: The prompt context blocks injected into the system prompt MUST truncate `jj_status` and `jj_git_remote_list` fields to 4,000 characters each (separate from the 8,000-char truncation on the raw CommandCapture output).
- [ ] **AC-31**: The tool MUST use a mutable reference (`RepoContextRef`) pattern so that refreshed context is visible to all consumers holding the same reference (including the `codeplane_issue_create` tool).
- [ ] **AC-32**: The tool's `name` and `label` MUST both be `"codeplane_repo_context"`.
- [ ] **AC-33**: The tool's `description` MUST clearly state that it returns local JJ/Codeplane repo context and can optionally refresh it.
- [ ] **AC-34**: The tool's `promptSnippet` MUST list the kinds of information returned: repo root, detected Codeplane repo, jj status, remotes, auth state, and backend details.
- [ ] **AC-35**: The tool's `promptGuidelines` MUST include guidance to use `refresh=true` when local repo state or auth may have changed.
- [ ] **AC-36**: Calling the tool with `refresh=false` (or no parameter) MUST complete in under 5ms (no subprocess or network calls).
- [ ] **AC-37**: Calling the tool with `refresh=true` MUST complete within 30 seconds under normal conditions (jj commands + remote availability check + auth check).
- [ ] **AC-38**: The tool MUST NOT crash or throw if `jj` is not installed when called with `refresh=true`. The `requireJj()` check occurs during initial runtime setup, not on per-refresh calls. If jj becomes unavailable mid-session, subprocess failures MUST be captured as error-state `CommandCapture` objects.
- [ ] **AC-39**: The tool MUST work identically in both local and workspace execution backends. The `backend` field changes, but the context collection pipeline is the same.
- [ ] **AC-40**: Multiple sequential `refresh=true` calls MUST each produce a fresh context with an updated `collectedAt` timestamp.

### Definition of Done

The feature is done when:
1. All acceptance criteria pass in automated tests.
2. The tool is registered on every CLI agent session and returns correct structured context.
3. The refresh path correctly re-executes all context collection steps and updates the shared reference.
4. The system prompt injection includes well-formatted startup context and guidelines.
5. All edge cases (no jj, no repo, no auth, no remote, timeout, truncation) produce correct and non-crashing behavior.
6. The mutable reference pattern correctly propagates refreshed context to sibling tools.
7. Both local and workspace backends correctly populate the `backend` context field.

## Design

### Tool Shape: `codeplane_repo_context`

**Name**: `codeplane_repo_context`
**Label**: `codeplane_repo_context`
**Description**: Return the current local JJ/Codeplane repo context, and optionally refresh it if state may have changed.

**Parameters**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `refresh` | boolean | No | `false` | When true, re-collect all context from the filesystem, jj, auth, and remote API before returning. When false or omitted, return the cached startup context. |

**Response**:

The tool returns a response with:
- `content`: An array containing a single text block with the full context as pretty-printed JSON.
- `details`: The raw `RepoContext` object.

**Example response content** (abbreviated):
```json
{
  "collectedAt": "2026-03-22T14:30:00.000Z",
  "cwd": "/Users/dev/myproject",
  "repoRoot": "/Users/dev/myproject",
  "repoSlug": "acme/myproject",
  "repoSource": "detected",
  "jjRemotes": {
    "command": "jj git remote list",
    "ok": true,
    "output": "origin https://api.codeplane.app/acme/myproject.git",
    "exitCode": 0
  },
  "jjStatus": {
    "command": "jj status",
    "ok": true,
    "output": "The working copy is clean\nParent commit: abc12345 main",
    "exitCode": 0
  },
  "auth": {
    "loggedIn": true,
    "host": "codeplane.app",
    "user": "devuser",
    "tokenSource": "config",
    "verified": true
  },
  "remoteRepo": {
    "checked": true,
    "available": true,
    "status": 200,
    "url": "https://api.codeplane.app/api/repos/acme/myproject"
  },
  "warnings": [],
  "backend": {
    "kind": "local",
    "cwd": "/Users/dev/myproject"
  }
}
```

### Data Model

#### RepoContext

| Field | Type | Description |
|-------|------|-------------|
| `collectedAt` | string | ISO-8601 timestamp of when context was collected |
| `cwd` | string | Process working directory at collection time |
| `repoRoot` | string \| null | Absolute path to the jj repository root, or null if not in a jj repo |
| `repoSlug` | string \| null | Detected or overridden `OWNER/REPO` Codeplane repository identifier |
| `repoSource` | `"override"` \| `"detected"` \| `"unavailable"` | How the repo slug was determined |
| `jjRemotes` | CommandCapture | Result of `jj git remote list` |
| `jjStatus` | CommandCapture | Result of `jj status` |
| `auth` | RepoAuthStatus | Current Codeplane authentication state |
| `remoteRepo` | RemoteRepoAvailability | Whether the Codeplane remote is reachable |
| `warnings` | string[] | Non-fatal warnings accumulated during collection |
| `backend` | Record<string, unknown> \| undefined | Execution backend description |

#### CommandCapture

| Field | Type | Description |
|-------|------|-------------|
| `command` | string | Full command string that was executed |
| `ok` | boolean | Whether the command exited with code 0 |
| `output` | string \| undefined | Trimmed and truncated stdout (max 8,000 chars) |
| `error` | string \| undefined | Trimmed and truncated stderr on failure |
| `exitCode` | number \| null | Process exit code, or 124 for timeout |

#### RepoAuthStatus

| Field | Type | Description |
|-------|------|-------------|
| `loggedIn` | boolean | Whether a valid auth token exists |
| `host` | string | Codeplane API host |
| `user` | string \| undefined | Authenticated username |
| `tokenSource` | string \| undefined | Where the token came from (config, env, etc.) |
| `message` | string \| undefined | Diagnostic message from auth check |
| `verified` | boolean | Whether the auth was positively verified (not just present) |

#### RemoteRepoAvailability

| Field | Type | Description |
|-------|------|-------------|
| `checked` | boolean | Whether the check was attempted |
| `available` | boolean \| undefined | Whether the remote repo is reachable and accessible |
| `status` | number \| undefined | HTTP status code from the availability check |
| `message` | string \| undefined | Diagnostic message |
| `url` | string \| undefined | The URL that was checked |

### System Prompt Injection

The context is injected into the agent's system prompt under the section `## Codeplane Helper` with the subsection `### Startup Context`. The injected JSON block includes:

| Prompt Field | Source | Truncation |
|-------------|--------|------------|
| `collected_at` | `repoContext.collectedAt` | None |
| `cwd` | `repoContext.cwd` | None |
| `repo_root` | `repoContext.repoRoot` | None |
| `repo_slug` | `repoContext.repoSlug` | None |
| `repo_source` | `repoContext.repoSource` | None |
| `auth` | `repoContext.auth` | None |
| `remote_repo` | `repoContext.remoteRepo` | None |
| `backend` | `backendContext` | None |
| `warnings` | `repoContext.warnings` | None |
| `jj_git_remote_list` | `repoContext.jjRemotes.output` | 4,000 chars |
| `jj_status` | `repoContext.jjStatus.output` | 4,000 chars |

The system prompt also includes guidelines that instruct the agent to:
- Use `codeplane_repo_context(refresh=true)` if local repo state or auth may have changed.
- Prefer actual repo/auth state from this tool over generic advice.

### CLI Integration

The tool is not exposed as a standalone CLI command. It is an internal agent tool registered during `initializeAgentRuntime()`. The tool is available in:
- `codeplane agent ask` (interactive and one-shot)
- `codeplane agent ask --sandbox` (workspace backend)
- Any session created through `initializeAgentRuntime()`

### Mutable Reference Pattern

The tool is constructed with a `RepoContextRef` — a mutable container `{ current: RepoContext }`. When refresh is invoked, the `current` field is updated in place. This same reference is shared with `createCodeplaneIssueTool`, ensuring that when the context tool refreshes, the issue creation tool also sees the updated context for enriching issue bodies.

### Configuration

The context tool itself has no direct configuration. However, the context collection pipeline is influenced by:

| Variable / Config | Purpose | Default |
|---|---|---|
| `--repo` / `-R` CLI flag | Override repo slug detection | Auto-detected from remotes |
| Codeplane CLI config `api_url` | Determines the host used for remote URL matching | `https://api.codeplane.app` |
| jj subprocess timeout | Maximum time for jj commands | 10,000ms |
| Output truncation limit | Maximum chars for command output | 8,000 chars |
| Prompt context truncation | Maximum chars for jj output in system prompt | 4,000 chars |

### Documentation

The following end-user documentation should be written:

1. **Agent Context Awareness Guide**: A page explaining that the Codeplane agent automatically understands your local repository state, how context is collected, what information is included, and how the agent uses it to provide grounded advice.
2. **Agent Tools Reference — `codeplane_repo_context`**: A reference entry documenting the tool's purpose, the `refresh` parameter, the returned fields, and when the agent invokes it automatically vs. when a user might ask for a refresh.
3. **Troubleshooting: Agent Context Issues**: A troubleshooting section covering: agent doesn't detect my repository (check remotes), agent shows wrong auth state (try `codeplane auth status`), agent shows remote repo unavailable (check network and permissions), jj commands timing out (check jj installation and repo health).

## Permissions & Security

### Authorization

The `codeplane_repo_context` tool is a **client-side tool** that runs within the CLI process. It does not interact with the Codeplane API server's authorization model directly, except for the remote repo availability check.

| Action | Required Role | Notes |
|--------|---------------|-------|
| Invoke `codeplane_repo_context` (no refresh) | None | Returns cached context. No subprocess or network calls. |
| Invoke `codeplane_repo_context(refresh=true)` — jj commands | None | Runs local jj subprocesses. Any user who can run jj can collect this context. |
| Invoke `codeplane_repo_context(refresh=true)` — auth status | None | Reads local auth config. No server interaction. |
| Invoke `codeplane_repo_context(refresh=true)` — remote repo check | Authenticated user (any role with read access to the repository) | Makes a GET request to `/api/repos/:owner/:repo` with the user's auth token. If the user lacks read access, the check returns `available: false` with a 403/404. |
| Invoke tool during sandbox mode | Authenticated user with workspace access | Sandbox sessions require auth; context collection pipeline is the same. |

### Rate Limiting

- **No server-side rate limiting applies to the tool itself**, since the tool is client-side.
- **Remote repo availability check**: Makes a single GET request to the Codeplane API per invocation. The server's standard rate limiting applies to this request. Under normal usage (startup + occasional refresh), this produces fewer than 5 requests per session.
- **jj subprocess calls**: These are local-only. No rate limiting needed. However, the 10-second timeout prevents runaway processes.
- **Abuse vector**: A malicious agent loop could call `refresh=true` repeatedly, generating many jj subprocesses and API requests. The 10-second jj timeout and server-side rate limiting on the API endpoint bound the impact. No additional client-side rate limiting is required because the agent framework naturally throttles tool calls to one at a time.

### Data Privacy

- **Repository file paths and branch names** are included in the context (via `jj status` and `jj git remote list` output). These are sent to the LLM provider as part of the agent system prompt and tool responses. Users should be aware that their repository structure metadata is shared with the model.
- **Codeplane username and host** are included in the auth status. The username is typically not considered PII in a developer tools context, but it is visible to the LLM.
- **Auth tokens are NOT included** in the context. The token is used for the remote repo check but is not serialized into the tool output or system prompt.
- **Remote URLs** (which may include hostnames, org names, and repo names) are included in the jj remotes output.
- **No file contents** are included in the context tool's output. Only metadata about the repository state is captured.
- **The context is stored only in memory** during the agent session. It is not persisted to disk by the context tool itself. (The system prompt may be persisted by the agent framework's session management, which is outside this tool's scope.)

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `agent_context_collected` | Initial context collection completes during runtime init | `repo_detected` (bool), `repo_source` (override/detected/unavailable), `auth_logged_in` (bool), `auth_verified` (bool), `remote_available` (bool or null), `jj_status_ok` (bool), `jj_remotes_ok` (bool), `warnings_count` (number), `backend_kind` (local/workspace), `collection_duration_ms` (number) |
| `agent_context_refreshed` | `codeplane_repo_context(refresh=true)` called | `repo_detected` (bool), `repo_source` (string), `auth_logged_in` (bool), `auth_verified` (bool), `auth_changed` (bool — differs from previous), `remote_available` (bool or null), `remote_changed` (bool — differs from previous), `jj_status_ok` (bool), `warnings_count` (number), `refresh_duration_ms` (number), `session_age_ms` (number — time since session start) |
| `agent_context_read` | `codeplane_repo_context` called without refresh | `repo_detected` (bool), `context_age_ms` (number — time since last collection) |
| `agent_context_jj_timeout` | A jj subprocess times out during context collection | `command` (string), `timeout_ms` (number), `cwd` (string) |
| `agent_context_remote_check_failed` | Remote repo availability check returns non-OK or errors | `status` (number or null), `error_type` (http_error/network_error/timeout), `url` (string, redacted to host+path) |

### Funnel Metrics & Success Indicators

1. **Context detection rate**: Percentage of `agent_context_collected` events where `repo_detected=true`. Target: >80% (most users start agents from inside a repo).
2. **Auth verification rate**: Percentage of `agent_context_collected` events where `auth_verified=true`. Target: >70% for users who have run `codeplane auth login`.
3. **Remote availability rate**: Percentage of `agent_context_collected` events where `remote_available=true` (among those where a repo was detected and auth was present). Target: >95%.
4. **Refresh usage rate**: Number of `agent_context_refreshed` events per `agent_context_collected` event. Indicates how often agents need mid-session context updates. Healthy range: 0.1–1.0 refreshes per session.
5. **Warning-free sessions**: Percentage of `agent_context_collected` events with `warnings_count=0`. Target: >60%.
6. **Context staleness at read**: p50/p95 of `context_age_ms` in `agent_context_read` events. Indicates how old the context typically is when the agent reads it without refreshing.

## Observability

### Logging Requirements

| Log Point | Level | Structured Context | Description |
|-----------|-------|-------------------|-------------|
| Context collection started | `debug` | `{ cwd, repo_override, source: "initial" \| "refresh" }` | Logged when `collectRepoContext()` begins |
| jj root detection | `debug` | `{ repo_root, detected: bool, duration_ms }` | After `jj root` subprocess completes |
| jj subprocess executed | `debug` | `{ command, exit_code, duration_ms, output_length, output_truncated: bool }` | For each jj subprocess call (`jj root`, `jj status`, `jj git remote list`) |
| jj subprocess timeout | `warn` | `{ command, timeout_ms, cwd }` | When a jj command exceeds the 10s timeout |
| Repo slug detected | `debug` | `{ repo_slug, repo_source, remote_name }` | After successful repo slug resolution |
| Repo slug not detected | `debug` | `{ cwd, remotes_output_length }` | When no Codeplane remote is found |
| Auth status checked | `debug` | `{ logged_in, host, verified, token_source }` | After auth status is resolved |
| Remote repo check started | `debug` | `{ url, repo_slug }` | Before the HTTP request to verify remote repo |
| Remote repo check completed | `debug` | `{ url, available, status, duration_ms }` | After the HTTP response |
| Remote repo check failed | `warn` | `{ url, error_message, error_type }` | On network error or unexpected failure |
| Remote repo check skipped | `debug` | `{ reason }` | When check is skipped (no slug or no auth) |
| Context collection completed | `info` | `{ repo_detected, auth_logged_in, remote_available, warnings_count, duration_ms }` | Summary log after full collection |
| Tool invoked (no refresh) | `debug` | `{ tool: "codeplane_repo_context", refresh: false, context_age_ms }` | When tool returns cached context |
| Tool invoked (refresh) | `info` | `{ tool: "codeplane_repo_context", refresh: true }` | When tool begins refresh |
| Tool refresh completed | `info` | `{ tool: "codeplane_repo_context", duration_ms, repo_detected, warnings_count }` | After refresh completes |
| Remote URL parse failure | `debug` | `{ url, host }` | When a remote URL cannot be parsed for a Codeplane match |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_agent_context_collections_total` | Counter | `source` (initial, refresh), `repo_detected` (true/false) | Total context collection attempts |
| `codeplane_agent_context_collection_duration_seconds` | Histogram | `source` (initial, refresh) | Duration of context collection (buckets: 0.1, 0.5, 1, 2, 5, 10, 20, 30) |
| `codeplane_agent_context_jj_command_duration_seconds` | Histogram | `command` (root, status, remote_list) | Duration of individual jj subprocess calls (buckets: 0.05, 0.1, 0.5, 1, 2, 5, 10) |
| `codeplane_agent_context_jj_timeouts_total` | Counter | `command` | Count of jj subprocess timeouts |
| `codeplane_agent_context_remote_checks_total` | Counter | `result` (available, unavailable, skipped, error) | Remote repo availability check outcomes |
| `codeplane_agent_context_remote_check_duration_seconds` | Histogram | — | Duration of remote repo availability HTTP call (buckets: 0.1, 0.25, 0.5, 1, 2, 5) |
| `codeplane_agent_context_warnings_count` | Histogram | — | Number of warnings per collection (buckets: 0, 1, 2, 3, 5) |
| `codeplane_agent_context_tool_invocations_total` | Counter | `refresh` (true/false) | Tool invocation count |
| `codeplane_agent_context_output_truncations_total` | Counter | `field` (jj_status, jj_remotes) | Count of command outputs that required truncation |

### Alerts

#### Alert: `AgentContextJjTimeoutRate`
- **Condition**: `rate(codeplane_agent_context_jj_timeouts_total[15m]) > 0.05`
- **Severity**: Warning
- **Runbook**:
  1. Check which jj command is timing out most frequently by inspecting the `command` label on `codeplane_agent_context_jj_timeouts_total`.
  2. If `jj root` is timing out: the jj installation may be broken or the filesystem may be unresponsive. Verify `jj --version` works. Check disk I/O and NFS mounts if applicable.
  3. If `jj status` is timing out: the repository may be very large or have a corrupt operation log. Try running `jj status` manually in the affected repo. Consider running `jj util gc` or `jj op log` to check for operation log bloat.
  4. If `jj git remote list` is timing out: check for network-mapped git remotes or DNS resolution issues that jj may be triggering.
  5. As a temporary mitigation, users can pass `--repo OWNER/REPO` to skip remote detection, but jj status collection cannot be bypassed.

#### Alert: `AgentContextRemoteCheckFailureRate`
- **Condition**: `rate(codeplane_agent_context_remote_checks_total{result="error"}[15m]) / rate(codeplane_agent_context_remote_checks_total[15m]) > 0.2`
- **Severity**: Warning
- **Runbook**:
  1. Check if the Codeplane API server is healthy by running `curl -I https://api.codeplane.app/api/health`.
  2. Check DNS resolution for the configured API host.
  3. Inspect error logs for `Remote repo check failed` entries. Common causes: TLS errors, connection refused, DNS NXDOMAIN.
  4. If the API is healthy, check whether affected users have expired or revoked tokens (`auth_logged_in=true` but `available=false` with 401 status).
  5. If the issue is transient (network blip), the alert should auto-resolve. The context tool degrades gracefully — the agent session continues without remote availability info.

#### Alert: `AgentContextCollectionLatencyP95`
- **Condition**: `histogram_quantile(0.95, rate(codeplane_agent_context_collection_duration_seconds_bucket{source="initial"}[5m])) > 15`
- **Severity**: Warning
- **Runbook**:
  1. Check `codeplane_agent_context_jj_command_duration_seconds` to identify which jj command is slow.
  2. Check `codeplane_agent_context_remote_check_duration_seconds` to see if the API is responding slowly.
  3. If jj commands are slow: check filesystem performance, repo size, and whether the user is on a network filesystem.
  4. If the API is slow: escalate to the server operations team.
  5. Consider whether the 10-second jj timeout is appropriate for the affected environment.

### Error Cases and Failure Modes

| Error Case | Behavior | Recoverability |
|------------|----------|----------------|
| jj not installed | `requireJj()` throws during runtime init (before tool registration) | Fatal for agent startup; user must install jj |
| Not in a jj repository | `repoRoot` is null, warning added, agent continues with cwd | Automatic; agent works with reduced context |
| `jj status` fails | `jjStatus.ok = false`, error captured, warning added | Automatic; agent notes the issue |
| `jj git remote list` fails | `jjRemotes.ok = false`, error captured, warning added | Automatic; repo slug detection falls back to unavailable |
| jj command hangs (>10s) | Process killed, exit code 124, error captured | Automatic; context collection continues |
| jj command output exceeds 8,000 chars | Truncated with suffix | Automatic; no data loss beyond truncation |
| No Codeplane remote configured | `repoSlug` is null, `repoSource` is `unavailable`, warning added | Automatic; user can use `--repo` override |
| Auth token missing | `loggedIn: false`, remote check skipped | Automatic; agent works locally |
| Auth token expired/invalid | Remote check returns 401, `available: false` | User action needed: `codeplane auth login` |
| Remote API unreachable | `available: false`, error message captured | Automatic; agent works with cached knowledge |
| Remote API returns 403 | `available: false`, message captured | User lacks repo access; needs permission grant |
| Remote API returns 404 | `available: false`, message captured | Repo doesn't exist at that slug; user should check remote config |
| Remote API returns 500 | `available: false`, message captured | Transient server error; retry on next refresh |
| `describeContext()` throws | Backend context is undefined | Agent continues without backend metadata |
| Simultaneous refresh calls | Second call overwrites first; last-write-wins on the mutable ref | By design; no locking needed since agent framework serializes tool calls |

## Verification

### Integration Tests: Context Collection

- [ ] **T-COLLECT-1**: `collectRepoContext()` from inside a jj repository returns `repoRoot` as a non-null absolute path matching `jj root` output.
- [ ] **T-COLLECT-2**: `collectRepoContext()` from outside a jj repository returns `repoRoot: null` and includes a warning about no jj repository.
- [ ] **T-COLLECT-3**: `collectRepoContext()` with a `repoOverride` of `"org/myrepo"` returns `repoSlug: "org/myrepo"` and `repoSource: "override"`.
- [ ] **T-COLLECT-4**: `collectRepoContext()` detects repo slug from an `origin` remote URL matching the Codeplane host, with `repoSource: "detected"`.
- [ ] **T-COLLECT-5**: When both `origin` and a non-origin remote point to Codeplane repos, the `origin` remote's slug takes precedence.
- [ ] **T-COLLECT-6**: When only a non-origin remote points to a Codeplane repo, that remote's slug is used as a fallback.
- [ ] **T-COLLECT-7**: HTTPS remote URL `https://api.codeplane.app/owner/repo.git` is correctly parsed to `owner/repo`.
- [ ] **T-COLLECT-8**: SCP-style remote URL `git@ssh.codeplane.app:owner/repo.git` is correctly parsed to `owner/repo`.
- [ ] **T-COLLECT-9**: SSH URL `ssh://ssh.codeplane.app/owner/repo` is correctly parsed to `owner/repo`.
- [ ] **T-COLLECT-10**: Remote URL with `.git` suffix is correctly stripped: `https://api.codeplane.app/owner/repo.git` → `owner/repo`.
- [ ] **T-COLLECT-11**: Remote URL without `.git` suffix works: `https://api.codeplane.app/owner/repo` → `owner/repo`.
- [ ] **T-COLLECT-12**: Remote URL pointing to a non-Codeplane host (e.g., `https://github.com/owner/repo`) is not matched.
- [ ] **T-COLLECT-13**: Remote URL with `ssh.` prefix on the Codeplane host is correctly matched.
- [ ] **T-COLLECT-14**: Remote URL with `api.` prefix on the Codeplane host is correctly matched.
- [ ] **T-COLLECT-15**: Remote URL with a path that has more than 2 segments (e.g., `https://api.codeplane.app/a/b/c`) is not matched.
- [ ] **T-COLLECT-16**: Remote URL with a path that has fewer than 2 segments (e.g., `https://api.codeplane.app/owner`) is not matched.
- [ ] **T-COLLECT-17**: `collectedAt` is a valid ISO-8601 timestamp and is within 1 second of the current time.
- [ ] **T-COLLECT-18**: `cwd` matches the process working directory (or the `cwd` option if provided).
- [ ] **T-COLLECT-19**: When `jj status` returns a successful output, `jjStatus.ok` is `true`, `jjStatus.output` is a non-empty string, and `jjStatus.exitCode` is `0`.
- [ ] **T-COLLECT-20**: When `jj status` fails (e.g., not in a repo), `jjStatus.ok` is `false` and `jjStatus.error` contains a diagnostic message.
- [ ] **T-COLLECT-21**: Command output of exactly 8,000 characters is returned without truncation.
- [ ] **T-COLLECT-22**: Command output of 8,001 characters is truncated to 8,000 characters with `...[truncated]` suffix appended.
- [ ] **T-COLLECT-23**: Command output of 10,000 characters is truncated to 8,000 characters.
- [ ] **T-COLLECT-24**: Empty command output (empty string after trim) is returned as `undefined`.
- [ ] **T-COLLECT-25**: Whitespace-only command output is returned as `undefined`.
- [ ] **T-COLLECT-26**: When a jj command exceeds the 10-second timeout, `exitCode` is `124` and the process is killed.
- [ ] **T-COLLECT-27**: Auth status with a valid config token returns `loggedIn: true`, `verified: true`, and `tokenSource`.
- [ ] **T-COLLECT-28**: Auth status with no token returns `loggedIn: false`, `verified: false`.
- [ ] **T-COLLECT-29**: Auth status where verification fails (message contains "Could not verify") returns `loggedIn: true`, `verified: false`.
- [ ] **T-COLLECT-30**: Remote repo check is skipped when `repoSlug` is null, returning `checked: false`.
- [ ] **T-COLLECT-31**: Remote repo check is skipped when `auth.loggedIn` is false, returning `checked: false`.
- [ ] **T-COLLECT-32**: Remote repo check with a 200 response returns `checked: true`, `available: true`, `status: 200`.
- [ ] **T-COLLECT-33**: Remote repo check with a 404 response returns `checked: true`, `available: false`, `status: 404`.
- [ ] **T-COLLECT-34**: Remote repo check with a network error returns `checked: true`, `available: false`, with the error message.
- [ ] **T-COLLECT-35**: Remote repo check sends `Authorization: token <token>` and `Accept: application/json` headers.
- [ ] **T-COLLECT-36**: Remote repo check with a non-JSON error body uses `statusText` as the message.
- [ ] **T-COLLECT-37**: Remote repo check with a JSON error body containing a `message` field uses that message.
- [ ] **T-COLLECT-38**: `warnings` accumulates multiple warnings (no repo root + failed jj command + no Codeplane remote).

### Integration Tests: Tool Behavior

- [ ] **T-TOOL-1**: `createCodeplaneContextTool()` returns a tool with `name: "codeplane_repo_context"` and `label: "codeplane_repo_context"`.
- [ ] **T-TOOL-2**: Calling the tool with no parameters returns the current context without modification.
- [ ] **T-TOOL-3**: Calling the tool with `refresh: false` returns the current context without modification.
- [ ] **T-TOOL-4**: Calling the tool with `refresh: true` updates `contextRef.current` and returns the new context.
- [ ] **T-TOOL-5**: After `refresh: true`, the `collectedAt` timestamp is later than the original.
- [ ] **T-TOOL-6**: After `refresh: true`, the `backend` field is populated by re-calling `backendContext()`.
- [ ] **T-TOOL-7**: The tool response contains exactly one content block of type `text`.
- [ ] **T-TOOL-8**: The content text is valid JSON and matches the `details` object when parsed.
- [ ] **T-TOOL-9**: The content text is pretty-printed with 2-space indentation.
- [ ] **T-TOOL-10**: The `details` object is the raw `RepoContext` (not a string).
- [ ] **T-TOOL-11**: Modifying the `contextRef.current` externally is reflected in subsequent tool calls (verifying the mutable reference pattern).
- [ ] **T-TOOL-12**: Calling `refresh: true` updates the shared reference so that a sibling tool (e.g., `codeplane_issue_create`) sees the refreshed context.
- [ ] **T-TOOL-13**: Calling the tool without refresh completes in under 5ms (no subprocess or network calls).
- [ ] **T-TOOL-14**: Multiple sequential `refresh: true` calls each produce a different `collectedAt` timestamp.

### Integration Tests: System Prompt Injection

- [ ] **T-PROMPT-1**: `createCodeplaneResourceLoader()` produces a resource loader whose `appendSystemPromptOverride` contains a `### Startup Context` section.
- [ ] **T-PROMPT-2**: The startup context JSON block in the system prompt contains `collected_at`, `cwd`, `repo_root`, `repo_slug`, `repo_source`, `auth`, `remote_repo`, `backend`, `warnings`, `jj_git_remote_list`, and `jj_status`.
- [ ] **T-PROMPT-3**: The `jj_status` field in the prompt is truncated to 4,000 characters (separate from the 8,000-char truncation on the raw output).
- [ ] **T-PROMPT-4**: The `jj_git_remote_list` field in the prompt is truncated to 4,000 characters.
- [ ] **T-PROMPT-5**: An output of exactly 4,000 characters is not truncated in the prompt.
- [ ] **T-PROMPT-6**: An output of 4,001 characters is truncated in the prompt.
- [ ] **T-PROMPT-7**: The system prompt includes the guideline about using `codeplane_repo_context(refresh=true)` when state may have changed.
- [ ] **T-PROMPT-8**: The system prompt includes the `## Codeplane Helper` heading and `### Role` section.

### Integration Tests: Edge Cases

- [ ] **T-EDGE-1**: Context collection with all jj commands failing (jj not in a repo) still returns a valid `RepoContext` with warnings and null/error fields.
- [ ] **T-EDGE-2**: Context collection with a very long remote list (100 remotes, each 200 chars) correctly truncates output and still attempts repo slug detection.
- [ ] **T-EDGE-3**: Context collection with a remote URL containing special characters (e.g., URL-encoded paths) does not crash.
- [ ] **T-EDGE-4**: Context collection with empty environment (no auth config, no jj, run from `/tmp`) returns a complete `RepoContext` with all nullable fields as null and appropriate warnings.
- [ ] **T-EDGE-5**: The tool handles a `backendContext()` function that throws by leaving `backend` as undefined (no crash).

### E2E Tests: CLI Agent Context

- [ ] **T-E2E-1**: Running `CODEPLANE_AGENT_TEST_MODE=summary codeplane agent ask --format json` from inside a jj repo returns JSON where `repo_context.repoRoot` is non-null.
- [ ] **T-E2E-2**: Running `CODEPLANE_AGENT_TEST_MODE=summary codeplane agent ask --format json` from outside a jj repo returns JSON where `repo_context.repoRoot` is null and `repo_context.warnings` contains a message about no jj repository.
- [ ] **T-E2E-3**: Running `CODEPLANE_AGENT_TEST_MODE=summary codeplane agent ask --repo testorg/testrepo --format json` returns JSON where `repo_context.repoSlug` is `"testorg/testrepo"` and `repo_context.repoSource` is `"override"`.
- [ ] **T-E2E-4**: Running `CODEPLANE_AGENT_TEST_MODE=summary codeplane agent ask --format json` from a jj repo with a Codeplane origin remote returns JSON where `repo_context.repoSource` is `"detected"` and `repo_context.repoSlug` is non-null.
- [ ] **T-E2E-5**: Running `CODEPLANE_AGENT_TEST_MODE=summary codeplane agent ask --format json` with valid Codeplane auth returns JSON where `repo_context.auth.loggedIn` is `true`.
- [ ] **T-E2E-6**: Running `CODEPLANE_AGENT_TEST_MODE=summary codeplane agent ask --format json` without Codeplane auth returns JSON where `repo_context.auth.loggedIn` is `false`.
- [ ] **T-E2E-7**: Running `CODEPLANE_AGENT_TEST_MODE=summary codeplane agent ask --format json` completes in under 15 seconds.
- [ ] **T-E2E-8**: Running `CODEPLANE_AGENT_TEST_MODE=summary codeplane agent ask --format json` with `-R testorg/testrepo` (alias) returns JSON where `repo_context.repoSlug` is `"testorg/testrepo"`.
- [ ] **T-E2E-9**: The `repo_context.collectedAt` field in the E2E response is a valid ISO-8601 timestamp within 60 seconds of the current time.
- [ ] **T-E2E-10**: The `repo_context.cwd` field in the E2E response matches the actual working directory of the test process.

### E2E Tests: API (Regression)

- [ ] **T-E2E-API-1**: The `codeplane_repo_context` tool is a client-side tool. Verify that agent session API endpoints (`POST /api/repos/:owner/:repo/agent/sessions`, `POST .../messages`) do not depend on or reference the context tool.
- [ ] **T-E2E-API-2**: Agent message creation API accepts tool_result parts that could contain context tool output (validates that the message schema supports the tool result format used by the context tool).
