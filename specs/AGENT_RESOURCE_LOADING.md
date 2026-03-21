# AGENT_RESOURCE_LOADING

Specification for AGENT_RESOURCE_LOADING.

## High-Level User POV

When a user starts an agent session in Codeplane — whether through the CLI (`codeplane agent`), the TUI agent chat screen, the web UI agent dock, or an editor integration — the agent should arrive ready to help with full awareness of the user's current context. The user should never have to manually explain what repository they are in, what the project structure looks like, what Codeplane features are available, or what their authentication state is. All of this should be gathered automatically, silently, and fast.

From the user's perspective, starting an agent session should feel instantaneous or nearly so. Behind the scenes, Codeplane loads several categories of resources that give the agent deep situational awareness: the current repository's jj state (bookmarks, changes, remotes, status), the structure of the codebase (file tree, languages, key project files, module boundaries), the product documentation (so the agent can give accurate Codeplane-specific guidance), and the execution backend the agent will operate in (local machine or remote workspace). These resources are cached locally so that repeat sessions start even faster.

If any resource fails to load — for example, the network is unavailable and no cached documentation exists, or the repository is too large to index within the time budget — the agent session still starts. The user sees the agent in a degraded but functional state, and the agent transparently communicates which resources are unavailable. The user can also refresh context mid-session if they've made changes to the repository or authentication state.

The result is that when a user asks the agent "what bookmarks exist in this repo?" or "how do I create a landing request in Codeplane?", the agent already has the structural and product knowledge to answer accurately, without requiring the user to paste documentation or explain their setup. This resource loading system is what makes the Codeplane agent feel like it belongs to the product rather than being a generic chatbot dropped into a terminal.

## Acceptance Criteria

### Core Initialization

- [ ] **AC-1**: When an agent session is started, the resource loading pipeline MUST execute automatically without user intervention.
- [ ] **AC-2**: The resource loading pipeline MUST collect: repository context (jj state), documentation corpus, documentation search index, execution backend context, and registered tools — assembling them into a single startup context injected into the agent's system prompt.
- [ ] **AC-3**: The pipeline MUST complete within 10 seconds for a typical repository (under 10,000 files) on a broadband connection, including docs fetch.
- [ ] **AC-4**: The pipeline MUST complete within 30 seconds for repositories up to 50,000 files.
- [ ] **AC-5**: All resource loading steps that are independent of each other MUST execute concurrently (e.g., docs refresh and repository index build).

### Repository Context Loading

- [ ] **AC-6**: The loader MUST detect the jj repository root by running `jj root` from the current working directory.
- [ ] **AC-7**: The loader MUST capture `jj status` and `jj git remote list` output, truncated to 8,000 characters each.
- [ ] **AC-8**: The loader MUST detect the Codeplane repository slug (owner/repo) from jj remotes, supporting both URL-style and SCP-style remote formats.
- [ ] **AC-9**: The loader MUST detect whether the user is authenticated to the Codeplane server and report the token source (CLI login, PAT, environment variable).
- [ ] **AC-10**: The loader MUST check whether the detected remote repository is accessible via the Codeplane API.
- [ ] **AC-11**: If no jj repository is detected, the loader MUST still proceed. The `repoRoot` field MUST be `null` and `repoSource` MUST be `"unavailable"`.
- [ ] **AC-12**: Command captures (jj root, jj status, jj git remote list) MUST each time out after 10 seconds and report the timeout as an error rather than hanging.
- [ ] **AC-13**: If the repo slug override option is provided (e.g., `--repo owner/name`), it MUST take precedence over auto-detection and `repoSource` MUST be `"override"`.

### Documentation Corpus Loading

- [ ] **AC-14**: The loader MUST attempt to fetch the Codeplane documentation from the configured URL (default: `https://docs.codeplane.app/llms-full.txt`).
- [ ] **AC-15**: Fetching MUST use ETag and If-Modified-Since headers to avoid redundant downloads when the cache is still valid (HTTP 304 handling).
- [ ] **AC-16**: The fetch MUST time out after a configurable duration (default: 3,000 ms, configurable via `CODEPLANE_AGENT_DOCS_TIMEOUT_MS`).
- [ ] **AC-17**: If the fetch fails and a cached copy exists, the loader MUST use the cached copy with status `"stale"` and include a warning message.
- [ ] **AC-18**: If the fetch fails and no cached copy exists, the loader MUST set status to `"unavailable"` with source `"none"`.
- [ ] **AC-19**: Fetched documentation MUST be persisted to `~/.codeplane/cache/agent/docs/llms-full.txt` with metadata (etag, lastModified, fetchedAt, url) persisted to `~/.codeplane/cache/agent/docs/llms-full.json`.

### Documentation Index Building

- [ ] **AC-20**: The loader MUST build a searchable index from the documentation text by chunking on markdown heading boundaries.
- [ ] **AC-21**: Each chunk MUST contain: sequential numeric ID, breadcrumb title (from heading hierarchy), lineStart, lineEnd, and text content.
- [ ] **AC-22**: No chunk MUST exceed 1,500 characters. Oversized sections MUST be split at line boundaries.
- [ ] **AC-23**: The index MUST include a `sourceHash` (SHA-256 of the raw documentation text) and `builtAt` ISO-8601 timestamp.
- [ ] **AC-24**: The index MUST be cached at `~/.codeplane/cache/agent/docs/llms-full.index.json`.
- [ ] **AC-25**: A cached index MUST be reused if its `sourceHash` matches the current documentation text's hash.
- [ ] **AC-26**: The index MUST be rebuilt if the cache file is missing, unreadable, has invalid JSON, or has a mismatched `sourceHash`.
- [ ] **AC-27**: If the documentation text is `null` (unavailable), the index MUST be `null` — not an empty or broken index.

### Backend Creation

- [ ] **AC-28**: If `--sandbox` is not specified, the loader MUST create a local backend that executes in the current repository working directory.
- [ ] **AC-29**: If `--sandbox` is specified, the loader MUST create a workspace backend that provisions or connects to a remote container workspace.
- [ ] **AC-30**: Both backends MUST implement the `AgentExecutionBackend` interface: `kind`, `displayName`, `cwd`, `createPiTools()`, `describeContext()`, `dispose()`.
- [ ] **AC-31**: Backend context MUST be attached to the `RepoContext.backend` field before prompt injection.

### Tool Registration

- [ ] **AC-32**: The loader MUST register the `codeplane_docs_search` tool that searches the documentation index and returns ranked excerpts.
- [ ] **AC-33**: The loader MUST register the `codeplane_repo_context` tool that returns the current repo/auth/backend state, with an optional `refresh` parameter to re-collect live state.
- [ ] **AC-34**: The loader MUST register the `codeplane_issue_create` tool that creates issues against the detected Codeplane repository.
- [ ] **AC-35**: All tools MUST return structured responses with both `content` (human-readable text) and `details` (machine-readable metadata).

### Prompt Injection

- [ ] **AC-36**: The loader MUST inject a system prompt appendix containing: Codeplane helper role definition, Codeplane-specific rules, and a JSON startup context block.
- [ ] **AC-37**: The startup context JSON MUST include: `collected_at`, `cwd`, `repo_root`, `repo_slug`, `repo_source`, `auth`, `remote_repo`, `backend`, `warnings`, `jj_git_remote_list`, `jj_status`.
- [ ] **AC-38**: The startup context MUST also include a `docs_status` section with `url`, `status`, `source`, and optional `warning`, `etag`, `lastModified`.
- [ ] **AC-39**: The `jj_git_remote_list` and `jj_status` fields in the startup context MUST be truncated to 4,000 characters each to avoid prompt bloat.

### Skill Materialization

- [ ] **AC-40**: The loader MUST materialize a `codeplane-helper` skill file at `~/.codeplane/agent/resources/skills/codeplane-helper/SKILL.md`.
- [ ] **AC-41**: The skill MUST instruct the agent to prefer `codeplane_docs_search` over generic recollection, use `codeplane_repo_context` for repo state, and file issues with `codeplane_issue_create` when bugs or UX problems are identified.
- [ ] **AC-42**: The loader MUST override the default skills loading to use only the materialized Codeplane skill, disabling extensions, prompt templates, and external agent files.

### Graceful Degradation

- [ ] **AC-43**: If jj is not installed or the current directory is not a jj repository, the session MUST still start. Repo context fields MUST reflect the absence.
- [ ] **AC-44**: If the Codeplane server is unreachable, the session MUST still start. Auth and remote repo fields MUST reflect the failure.
- [ ] **AC-45**: If documentation loading fails entirely (no network, no cache), the session MUST still start. The `codeplane_docs_search` tool MUST return a degraded-state message explaining unavailability.
- [ ] **AC-46**: If the documentation cache is stale, the `codeplane_docs_search` tool MUST append a stale-data warning to search results.
- [ ] **AC-47**: All warnings accumulated during resource loading MUST be collected in the `warnings` array and injected into the startup context.

### Test Mode

- [ ] **AC-48**: When `CODEPLANE_AGENT_TEST_MODE=summary`, the loader MUST skip full initialization (no docs refresh, no session creation) and return a structured JSON summary of the base runtime state.
- [ ] **AC-49**: The summary mode MUST still execute repository context collection and backend creation, but MUST skip documentation fetching, index building, tool registration, and session creation.

### Cleanup

- [ ] **AC-50**: When the agent session ends (normal exit, error, or interrupt), the loader MUST call `dispose()` on the backend and `dispose()` on the session.
- [ ] **AC-51**: Backend disposal MUST be guaranteed via try/finally to prevent resource leaks, even when errors occur during the session.

### Boundary Constraints

- [ ] **AC-52**: Repository slug format: `owner/repo`, where owner and repo each consist of 1–100 characters matching `[a-zA-Z0-9._-]`.
- [ ] **AC-53**: Documentation URL maximum length: 2,048 characters.
- [ ] **AC-54**: Documentation corpus maximum size: 50 MB. Files larger than this MUST be rejected with a clear error.
- [ ] **AC-55**: Documentation index maximum chunk count: 100,000. If more chunks would be produced, the index build MUST fail gracefully.
- [ ] **AC-56**: jj command output truncation: 8,000 characters for command captures, 4,000 characters for prompt-injected values.
- [ ] **AC-57**: Docs search `max_results` parameter: minimum 1, maximum 8, default 4. Non-integer values MUST be floored.
- [ ] **AC-58**: Cache directory path: must be under `~/.codeplane/cache/agent/`. If the directory does not exist, it MUST be created with `recursive: true`.
- [ ] **AC-59**: Docs fetch timeout: minimum 500 ms, maximum 60,000 ms. Values outside this range MUST fall back to the 3,000 ms default.
- [ ] **AC-60**: All file writes to cache MUST be atomic or best-effort idempotent (write followed by rename, or acceptable in the face of concurrent writes).

### Definition of Done

The feature is complete when:

1. A user can run `codeplane agent` in any directory and get an agent session that reflects the jj repo state, Codeplane auth state, execution backend, and product documentation — or gracefully reports what is unavailable.
2. All registered tools (`codeplane_docs_search`, `codeplane_repo_context`, `codeplane_issue_create`) function correctly in both fresh and cached states.
3. The system prompt appendix accurately reflects the collected startup context.
4. The pipeline handles all degradation scenarios (no jj, no network, no server, no cache, oversized inputs) without crashing.
5. Cache invalidation is content-hash-based and prevents stale index usage.
6. All 60 acceptance criteria above pass verification.

## Design

### CLI Command

The resource loading pipeline is triggered implicitly when the user runs:

```
codeplane agent [--prompt "question"] [--repo owner/repo] [--sandbox] [--format json|toon|yaml|md|jsonl]
```

There is no separate "load resources" command. Resource loading is a transparent initialization phase.

**Behavioral modes:**

- **Interactive mode** (no `--prompt`): Loads resources, starts a REPL-style session where the user can converse with the agent.
- **One-shot mode** (`--prompt "..."`): Loads resources, runs a single prompt, prints the response, and exits.
- **Summary/test mode** (`CODEPLANE_AGENT_TEST_MODE=summary`): Loads base runtime only (repo context + backend), skips docs and session creation, returns structured JSON.

**Output formats:**

- Default (`toon`): Human-readable text output to stdout.
- `--format json`: Structured JSON response wrapping backend, repo_context, docs_status, and response.
- `--format yaml|md|jsonl`: Structured output in respective formats.

**Error display:**

- When a resource loading step fails, the CLI MUST NOT crash. It MUST log a warning to stderr and continue.
- The agent session's startup context MUST include all accumulated warnings so the agent can inform the user if relevant.

### Web UI Design

The web UI agent dock triggers resource loading server-side when creating a new agent session via `POST /api/repos/:owner/:repo/agent/sessions`. The web UI does not perform local resource loading — it relies on the server to assemble context from the repository it manages.

**Agent dock behavior:**

- When the user opens the agent dock or navigates to the agent sessions view, a new session can be created.
- The session creation response includes the assembled startup context status (which resources loaded successfully, which degraded).
- The agent dock displays a subtle status indicator showing resource loading state:
  - **Green dot**: All resources loaded successfully.
  - **Yellow dot**: Some resources degraded (e.g., docs unavailable). Hovering shows which resources degraded.
  - **Red dot**: Critical resource loading failure. The user can still chat but the agent has limited context.

**Session replay:**

- When viewing a past session, the startup context is displayed as a collapsible "Session Context" panel showing repo slug, auth state, backend, docs status, and any warnings.

### TUI UI

The TUI agent chat screen triggers the same CLI resource loading pipeline. The TUI displays loading progress:

- Line 1: "Collecting repo context..." → "✓ Repo context collected" or "⚠ No jj repo detected"
- Line 2: "Loading documentation..." → "✓ Docs loaded (fresh)" or "⚠ Using cached docs" or "✗ Docs unavailable"
- Line 3: "Preparing backend..." → "✓ Local backend ready" or "✓ Workspace backend ready"
- Line 4: "Starting session..." → "✓ Session ready"

Each line appears as its corresponding step completes. The chat input is disabled until the session is ready.

### API Shape

The server-side resource loading is invoked as part of agent session creation:

```
POST /api/repos/:owner/:repo/agent/sessions
```

**Request body:**
```json
{
  "title": "optional session title"
}
```

**Response (201 Created):**
```json
{
  "id": "session-uuid",
  "repo_id": "repo-uuid",
  "user_id": "user-uuid",
  "title": "optional title",
  "status": "pending",
  "resource_status": {
    "repo_context": "loaded",
    "documentation": "fresh | stale | unavailable",
    "backend": "local | workspace",
    "tools": ["codeplane_docs_search", "codeplane_repo_context", "codeplane_issue_create"],
    "warnings": []
  },
  "created_at": "ISO-8601",
  "updated_at": "ISO-8601"
}
```

The `resource_status` field communicates to clients which resources were loaded and at what quality.

### SDK Shape

The resource loading pipeline is encapsulated in the CLI agent module (`apps/cli/src/agent/`):

**Primary exports:**

- `initializeAgentRuntime(options)` → `InitializedAgentRuntime`: Full pipeline — repo context, docs, index, backend, tools, session.
- `initializeBaseAgentRuntime(options)` → `BaseAgentRuntime`: Lightweight pipeline — repo context and backend only.
- `createCodeplaneResourceLoader(options)` → `DefaultResourceLoader`: Assembles skills, prompt appendix, and loader options.

**Key types:**

- `RepoContext`: Collected repository state (cwd, repoRoot, repoSlug, repoSource, jjRemotes, jjStatus, auth, remoteRepo, warnings, backend).
- `DocsCorpusStatus`: Documentation freshness state (url, status, source, fetchedAt, warning, etag, lastModified).
- `AgentExecutionBackend`: Abstraction over local/workspace execution environment.
- `DocsCacheEntry`: Cached documentation text + status + file paths.
- `DocsIndex`: Built search index with sourceHash, builtAt, and chunks array.

**Tool interfaces:**

- `createCodeplaneDocsTool(docsIndex, docsStatus)` → tool definition for `codeplane_docs_search`
- `createCodeplaneContextTool(contextRef, options)` → tool definition for `codeplane_repo_context`
- `createCodeplaneIssueTool(contextRef)` → tool definition for `codeplane_issue_create`

### Editor Integrations

**VS Code**: The VS Code extension can trigger agent sessions through its dashboard webview. Resource loading happens on the daemon side; the extension passes the workspace root as context.

**Neovim**: The Neovim plugin's `:CodeplaneAgent` command triggers the CLI agent, which performs local resource loading. No separate Neovim-specific resource loading is needed.

### Documentation

The following end-user documentation should be written:

**"Agent Context & Resources" guide page:**

1. **Overview**: Explain that the Codeplane agent automatically loads context about your repository, authentication, and product documentation when a session starts.
2. **What the agent knows**: Describe the four resource categories — repo context, documentation, execution backend, and registered tools — in user-friendly terms.
3. **Cache behavior**: Explain that documentation and indexes are cached locally at `~/.codeplane/cache/agent/` for fast startup. Describe when caches are refreshed (content-hash-based invalidation).
4. **Degraded mode**: Explain what happens when resources are unavailable and how to recognize degraded state (warnings in the agent's startup context, tool responses mentioning unavailability).
5. **Configuration**: Document all environment variables:
   - `CODEPLANE_AGENT_DOCS_URL` — custom documentation URL
   - `CODEPLANE_AGENT_DOCS_TIMEOUT_MS` — docs fetch timeout
   - `CODEPLANE_AGENT_TEST_MODE` — test/summary mode
6. **Troubleshooting**: Common issues — stale cache, timeout failures, no jj repo detected — and how to resolve them (delete cache directory, increase timeout, verify jj installation).

## Permissions & Security

### Authorization Roles

| Action | Owner | Admin | Member | Read-Only | Anonymous |
|---|---|---|---|---|---|
| Start agent session (CLI, local) | ✅ | ✅ | ✅ | ✅ | ✅* |
| Start agent session (server API) | ✅ | ✅ | ✅ | ❌ | ❌ |
| Load repo context (local) | ✅ | ✅ | ✅ | ✅ | ✅* |
| Load repo context (server) | ✅ | ✅ | ✅ | ✅ | ❌ |
| Fetch documentation corpus | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create issues via agent tool | ✅ | ✅ | ✅ | ❌ | ❌ |
| Refresh repo context mid-session | ✅ | ✅ | ✅ | ✅ | ✅* |

*Anonymous users can run local agent sessions (CLI) but cannot create server-side sessions or interact with authenticated API endpoints. The agent tools that call authenticated APIs will return appropriate "not authenticated" messages.

### Rate Limiting

- **Documentation fetch**: No user-facing rate limit, but the ETag/If-Modified-Since mechanism prevents redundant downloads. The docs URL endpoint itself may impose standard HTTP rate limits.
- **Server-side session creation**: Rate limited to **10 sessions per user per minute** and **100 sessions per user per hour**.
- **`codeplane_repo_context` refresh**: No rate limit (it runs local jj commands), but jj command timeouts prevent runaway processes.
- **`codeplane_issue_create` tool**: Inherits the standard issue creation rate limit (**30 issues per user per hour**).
- **`codeplane_docs_search` tool**: No rate limit (local index search, negligible cost).

### Data Privacy

- **Repository context**: The startup context injected into the agent prompt contains the repository slug, authentication username, server host, jj remotes (which may contain internal hostnames), and jj status output. This data is sent to the LLM provider. Users MUST be aware that jj status may contain file paths with sensitive names.
- **Documentation corpus**: The cached documentation is public product docs. No PII exposure risk.
- **Auth tokens**: PAT values and session cookies MUST NEVER be included in the startup context or tool responses. Only the token source type ("cli_login", "pat", "env") and verification status are exposed.
- **Workspace SSH keys**: Workspace backend SSH credentials MUST NOT be logged or included in startup context JSON. Only the workspace ID and display name should appear.
- **Cache files**: Cache files at `~/.codeplane/cache/agent/` contain documentation text and index data. No user credentials are stored in cache. Cache files inherit the user's filesystem permissions.

## Telemetry & Product Analytics

### Business Events

| Event | When Fired | Properties |
|---|---|---|
| `AgentResourceLoadingStarted` | Pipeline begins | `session_id`, `backend_kind`, `has_repo`, `has_auth`, `repo_slug` (nullable) |
| `AgentResourceLoadingCompleted` | Pipeline finishes | `session_id`, `duration_ms`, `repo_context_status` (loaded/failed), `docs_status` (fresh/stale/unavailable), `docs_source` (network/cache/none), `backend_kind`, `tools_registered` (count), `warnings_count`, `degraded` (boolean) |
| `AgentResourceLoadingFailed` | Pipeline throws unrecoverable error | `session_id`, `error_type`, `error_message`, `phase` (repo_context/docs/backend/tools) |
| `AgentDocsSearchInvoked` | `codeplane_docs_search` tool called | `session_id`, `query_length`, `max_results_requested`, `hits_returned`, `docs_status`, `top_hit_score` (nullable) |
| `AgentDocsSearchEmpty` | `codeplane_docs_search` returns 0 results | `session_id`, `query`, `docs_status` |
| `AgentRepoContextRefreshed` | `codeplane_repo_context(refresh=true)` called | `session_id`, `duration_ms`, `repo_detected` (boolean), `auth_status` |
| `AgentIssueCreatedViaTool` | `codeplane_issue_create` succeeds | `session_id`, `repo_slug`, `issue_id`, `issue_title_length` |
| `AgentDocsCacheHit` | Cached docs reused (304 or hash match) | `session_id`, `cache_age_hours`, `source` (etag_match/hash_match) |
| `AgentDocsCacheMiss` | Fresh docs downloaded | `session_id`, `corpus_size_bytes`, `fetch_duration_ms` |
| `AgentSessionDisposed` | Session cleanup runs | `session_id`, `session_duration_ms`, `messages_exchanged`, `tools_invoked_count`, `backend_kind` |

### Funnel Metrics

| Metric | Target | Measures |
|---|---|---|
| Resource loading success rate | >95% | Percentage of `AgentResourceLoadingCompleted` events where `degraded=false` |
| Docs availability rate | >95% | Percentage of sessions where `docs_status` is `fresh` or `stale` (not `unavailable`) |
| Docs cache hit rate | >80% | Percentage of docs loads that use cached data (304 or hash match) |
| Docs search utilization rate | >60% | Percentage of sessions that invoke `codeplane_docs_search` at least once |
| Docs search zero-result rate | <15% | Percentage of `AgentDocsSearchInvoked` where `hits_returned=0` |
| Resource loading p95 latency | <5s | 95th percentile of `duration_ms` in `AgentResourceLoadingCompleted` |
| Session completion rate | >90% | Percentage of started sessions that reach `AgentSessionDisposed` without `AgentResourceLoadingFailed` |

## Observability

### Logging Requirements

| Log Event | Level | Structured Context | When |
|---|---|---|---|
| Resource loading pipeline started | `info` | `session_id`, `cwd`, `repo_override`, `sandbox`, `backend_kind` | Pipeline entry |
| jj root detection result | `debug` | `repo_root` (nullable), `duration_ms`, `exit_code` | After `jj root` completes |
| jj status capture result | `debug` | `output_length`, `truncated`, `duration_ms`, `exit_code` | After `jj status` completes |
| jj remotes capture result | `debug` | `output_length`, `truncated`, `duration_ms`, `exit_code` | After `jj git remote list` completes |
| Repo slug detected | `info` | `repo_slug`, `source` (override/detected/unavailable) | After slug resolution |
| Auth state checked | `debug` | `logged_in`, `host`, `token_source`, `verified` | After auth check |
| Remote repo availability checked | `debug` | `checked`, `available`, `status_code`, `url` | After HTTP check |
| Docs fetch started | `debug` | `url`, `has_etag`, `has_last_modified` | Before docs fetch |
| Docs fetch completed | `info` | `status_code`, `source` (network/cache), `corpus_size_bytes`, `duration_ms` | After docs fetch |
| Docs fetch failed | `warn` | `error_message`, `url`, `has_cache_fallback` | On docs fetch error |
| Docs fetch timed out | `warn` | `timeout_ms`, `url`, `has_cache_fallback` | On docs timeout |
| Docs index built | `info` | `chunk_count`, `source_hash`, `duration_ms` | After index build |
| Docs index loaded from cache | `debug` | `chunk_count`, `source_hash`, `cache_age_hours` | On cache hit |
| Backend created | `info` | `kind`, `display_name`, `cwd` | After backend creation |
| Tool registered | `debug` | `tool_name`, `session_id` | Per tool registration |
| Skill materialized | `debug` | `skill_name`, `file_path` | After skill file write |
| Prompt appendix assembled | `debug` | `appendix_length_chars`, `warnings_count` | After prompt construction |
| Session created | `info` | `session_id`, `total_loading_duration_ms`, `degraded` | Pipeline complete |
| Resource loading unrecoverable failure | `error` | `error_message`, `error_stack`, `phase` | On pipeline crash |
| Session disposed | `info` | `session_id`, `session_duration_ms` | On cleanup |
| Backend dispose failed | `error` | `session_id`, `backend_kind`, `error_message` | On backend cleanup failure |

### Prometheus Metrics

**Counters:**

- `codeplane_agent_resource_loading_total{status="success"|"degraded"|"failed"}` — Total resource loading pipeline invocations by outcome.
- `codeplane_agent_docs_fetch_total{result="fresh"|"cached_304"|"cached_fallback"|"unavailable"}` — Documentation fetch outcomes.
- `codeplane_agent_docs_search_total{result="hits"|"empty"|"unavailable"}` — Documentation search invocations by result type.
- `codeplane_agent_repo_context_refresh_total{result="success"|"failed"}` — Mid-session repo context refresh invocations.
- `codeplane_agent_tool_invocation_total{tool="codeplane_docs_search"|"codeplane_repo_context"|"codeplane_issue_create"}` — Tool invocations by tool name.
- `codeplane_agent_session_dispose_total{clean="true"|"false"}` — Session disposal outcomes.

**Histograms:**

- `codeplane_agent_resource_loading_duration_seconds` — Total pipeline duration (buckets: 0.5, 1, 2, 5, 10, 30, 60).
- `codeplane_agent_docs_fetch_duration_seconds` — Documentation fetch duration (buckets: 0.1, 0.5, 1, 3, 5, 10).
- `codeplane_agent_docs_index_build_duration_seconds` — Index build duration (buckets: 0.01, 0.05, 0.1, 0.5, 1, 5).
- `codeplane_agent_docs_search_duration_seconds` — Per-search latency (buckets: 0.001, 0.005, 0.01, 0.05, 0.1).
- `codeplane_agent_jj_command_duration_seconds{command="root"|"status"|"remotes"}` — jj subprocess durations.

**Gauges:**

- `codeplane_agent_docs_index_chunk_count` — Number of chunks in the current docs index.
- `codeplane_agent_docs_cache_age_seconds` — Age of the cached documentation corpus.
- `codeplane_agent_active_sessions` — Number of currently active agent sessions (incremented on create, decremented on dispose).

### Alerts

**Alert 1: Agent Resource Loading Failure Rate High**

- **Condition**: `rate(codeplane_agent_resource_loading_total{status="failed"}[5m]) / rate(codeplane_agent_resource_loading_total[5m]) > 0.1`
- **Severity**: Warning
- **Runbook**:
  1. Check the server logs for `error`-level entries with `phase` context to identify which step is failing.
  2. If `phase=repo_context`: Verify jj is installed and accessible. Check if jj commands are timing out (look for `jj_command_duration_seconds` histogram). If timeout, check disk I/O or repository corruption.
  3. If `phase=docs`: Check the docs URL availability (`curl -I https://docs.codeplane.app/llms-full.txt`). If 5xx, escalate to docs infrastructure team. If DNS failure, check network connectivity.
  4. If `phase=backend`: Check workspace provisioning service health. For local backend, check file system permissions on the cwd.
  5. If `phase=tools`: Check for breaking changes in the pi-coding-agent SDK. Verify tool registration code hasn't regressed.

**Alert 2: Documentation Unavailability Rate High**

- **Condition**: `rate(codeplane_agent_docs_fetch_total{result="unavailable"}[15m]) / rate(codeplane_agent_docs_fetch_total[15m]) > 0.2`
- **Severity**: Warning
- **Runbook**:
  1. Verify the docs URL is accessible: `curl -sI https://docs.codeplane.app/llms-full.txt`.
  2. If the URL returns errors, check the docs deployment pipeline and CDN status.
  3. If the URL is fine, check whether clients are hitting DNS resolution failures or firewall blocks (common in corporate networks).
  4. Check `codeplane_agent_docs_fetch_duration_seconds` histogram — if most failures are timeouts, the default 3s timeout may be too aggressive. Consider recommending users set `CODEPLANE_AGENT_DOCS_TIMEOUT_MS=10000`.
  5. Verify that the docs file hasn't grown beyond the 50 MB limit.

**Alert 3: Agent Resource Loading Latency Degraded**

- **Condition**: `histogram_quantile(0.95, codeplane_agent_resource_loading_duration_seconds) > 15`
- **Severity**: Warning
- **Runbook**:
  1. Check which phase is slow using `codeplane_agent_jj_command_duration_seconds` and `codeplane_agent_docs_fetch_duration_seconds`.
  2. If jj commands are slow: Check disk I/O on the host. Large repositories may have slow `jj status`. Verify the jj operation log isn't excessively large.
  3. If docs fetch is slow: Check network latency to the docs URL. Consider if ETag/304 optimization is working (check `docs_fetch_total{result="cached_304"}` counter — low values mean full downloads are happening every time).
  4. If index build is slow: Check `docs_index_chunk_count` gauge — an unusually high chunk count suggests the docs corpus has grown significantly. Consider increasing the chunk size limit or adding index build timeout.

**Alert 4: Active Agent Sessions Spike**

- **Condition**: `codeplane_agent_active_sessions > 1000`
- **Severity**: Warning
- **Runbook**:
  1. Check if there's an automation loop creating sessions without disposing them.
  2. Verify session disposal is working (`codeplane_agent_session_dispose_total{clean="true"}` should be incrementing).
  3. If sessions are not being disposed, check for stuck backend processes. Review error logs for disposal failures.
  4. If legitimate load, verify resource consumption (memory, file descriptors) is within acceptable bounds.

### Error Cases and Failure Modes

| Failure Mode | Behavior | User Impact |
|---|---|---|
| jj not installed | `jj root` fails. `repoRoot=null`, `repoSource="unavailable"`. Session starts. | Agent cannot provide jj-specific guidance. |
| Not in a jj repo | `jj root` succeeds but returns error. Same as above. | Same as above. |
| jj command hangs | 10-second timeout fires. Command capture records timeout error. | Startup delayed by up to 10s. Affected field is empty. |
| Codeplane server unreachable | Auth check and remote repo check fail. Fields reflect failure. | Agent cannot verify auth or create issues. |
| Docs URL 404 | Fetch fails. Falls back to cache or `unavailable`. | Docs search returns degraded response. |
| Docs URL 5xx | Same as 404 handling. | Same. |
| Docs fetch timeout | 3s timeout fires. Falls back to cache or `unavailable`. | Same. |
| Docs corpus > 50 MB | Fetch succeeds but corpus rejected. Status `unavailable`. | Docs search unavailable until corpus shrinks. |
| Docs index cache corrupted | Invalid JSON detected. Index rebuilt from raw text. | One-time rebuild cost (~100ms). No user impact. |
| Cache directory not writable | `mkdir` or `writeFile` fails. Index/cache not persisted. | Next session will re-download and rebuild. Repeated I/O warnings in logs. |
| Concurrent cache writes | Two sessions write simultaneously. Last write wins. | Negligible; index is deterministic for same input. |
| Backend creation failure | Workspace provisioning fails. Pipeline throws. | Session does not start. User sees error. |
| Tool registration failure | SDK rejects tool definition. Pipeline throws. | Session does not start. User sees error. |
| LLM provider unavailable | Not a resource loading failure (downstream). | Session starts but agent cannot respond. |

## Verification

### Integration Tests: CLI Resource Loading Pipeline

**Test Group: Repository Context Collection**

- [ ] `test: collects repo context from a valid jj repository with remotes`
- [ ] `test: detects repo root correctly when run from a subdirectory`
- [ ] `test: sets repoRoot to null when not in a jj repository`
- [ ] `test: sets repoSource to "unavailable" when jj is not installed`
- [ ] `test: sets repoSource to "override" when --repo is provided`
- [ ] `test: detects repo slug from HTTPS-style remote URL`
- [ ] `test: detects repo slug from SCP-style remote URL (git@host:owner/repo.git)`
- [ ] `test: handles remote URL without .git suffix`
- [ ] `test: handles multiple remotes and picks the first matching slug`
- [ ] `test: truncates jj status output at 8,000 characters`
- [ ] `test: truncates jj remotes output at 8,000 characters`
- [ ] `test: handles jj root command timeout (>10 seconds)`
- [ ] `test: handles jj status command timeout (>10 seconds)`
- [ ] `test: records jj command exit codes in CommandCapture`
- [ ] `test: collects warnings when repo is detected but auth fails`
- [ ] `test: repo slug with 100-character owner and 100-character repo name parses correctly`
- [ ] `test: repo slug with 101-character owner is rejected or truncated gracefully`

**Test Group: Authentication State Detection**

- [ ] `test: detects logged-in state when CLI auth token exists`
- [ ] `test: detects PAT-based auth when CODEPLANE_TOKEN is set`
- [ ] `test: reports not-logged-in when no auth credentials exist`
- [ ] `test: reports verified=true when server confirms token`
- [ ] `test: reports verified=false when server rejects token`
- [ ] `test: does not include raw token value in auth state`

**Test Group: Remote Repo Availability**

- [ ] `test: reports available=true when API returns 200`
- [ ] `test: reports available=false when API returns 404`
- [ ] `test: reports checked=false when network is unreachable`
- [ ] `test: includes HTTP status code in availability result`

**Test Group: Documentation Cache**

- [ ] `test: fetches docs from network on first run (no cache)`
- [ ] `test: writes fetched docs to ~/.codeplane/cache/agent/docs/llms-full.txt`
- [ ] `test: writes metadata JSON with etag, lastModified, fetchedAt, url`
- [ ] `test: sends If-None-Match header when cached etag exists`
- [ ] `test: sends If-Modified-Since header when cached lastModified exists`
- [ ] `test: returns status="fresh" source="cache" on HTTP 304`
- [ ] `test: returns status="stale" source="cache" when fetch fails but cache exists`
- [ ] `test: returns status="unavailable" source="none" when fetch fails and no cache`
- [ ] `test: returns status="fresh" source="network" on successful download`
- [ ] `test: respects CODEPLANE_AGENT_DOCS_TIMEOUT_MS for fetch timeout`
- [ ] `test: falls back to 3000ms default when CODEPLANE_AGENT_DOCS_TIMEOUT_MS is not a valid number`
- [ ] `test: falls back to 3000ms default when CODEPLANE_AGENT_DOCS_TIMEOUT_MS < 500`
- [ ] `test: falls back to 3000ms default when CODEPLANE_AGENT_DOCS_TIMEOUT_MS > 60000`
- [ ] `test: handles abort signal correctly when fetch times out`
- [ ] `test: creates cache directory recursively if it does not exist`
- [ ] `test: respects custom CODEPLANE_AGENT_DOCS_URL`
- [ ] `test: handles docs corpus exactly at 50 MB (maximum valid size)`
- [ ] `test: rejects docs corpus larger than 50 MB with clear error`

**Test Group: Documentation Index Building**

- [ ] `test: builds index from markdown text with multiple heading levels`
- [ ] `test: chunks on heading boundaries (# through ######)`
- [ ] `test: assigns sequential IDs starting from 0`
- [ ] `test: builds breadcrumb titles from heading hierarchy`
- [ ] `test: splits chunks exceeding 1,500 characters at line boundaries`
- [ ] `test: produces no chunks exceeding 1,500 characters`
- [ ] `test: computes SHA-256 sourceHash of raw text`
- [ ] `test: includes builtAt timestamp in ISO-8601 format`
- [ ] `test: normalizes CRLF to LF before chunking`
- [ ] `test: produces single "Codeplane Docs" chunk for text with no headings`
- [ ] `test: handles empty string input by returning index with zero chunks`
- [ ] `test: handles text that is only headings with no body content`
- [ ] `test: handles consecutive headings without body between them`
- [ ] `test: handles heading at the very end of the document`
- [ ] `test: persists index to llms-full.index.json`
- [ ] `test: reuses cached index when sourceHash matches`
- [ ] `test: rebuilds index when sourceHash mismatches`
- [ ] `test: rebuilds index when cache file is missing`
- [ ] `test: rebuilds index when cache file contains invalid JSON`
- [ ] `test: rebuilds index when cache file is missing chunks array`
- [ ] `test: returns null index when documentation text is null`
- [ ] `test: builds index from 50 MB docs file (maximum valid size) within 30 seconds`
- [ ] `test: handles index with up to 100,000 chunks`
- [ ] `test: rejects index build when chunk count would exceed 100,000`

**Test Group: Documentation Search**

- [ ] `test: returns matching chunks ranked by score`
- [ ] `test: full query match in title scores +12`
- [ ] `test: full query match in body scores +8`
- [ ] `test: per-token match in title scores +5 each`
- [ ] `test: per-token match in body scores +1 each`
- [ ] `test: returns empty array for empty query`
- [ ] `test: returns empty array for whitespace-only query`
- [ ] `test: discards tokens shorter than 2 characters`
- [ ] `test: preserves dots, slashes, colons, hyphens, underscores in tokens`
- [ ] `test: default max_results is 4`
- [ ] `test: max_results capped at 8`
- [ ] `test: non-integer max_results is floored`
- [ ] `test: max_results of 0 or negative uses default`
- [ ] `test: snippet includes 2 lines before and 10 lines after first match`
- [ ] `test: snippet falls back to first 12 lines when no token found in chunk`
- [ ] `test: search is case-insensitive`

**Test Group: Docs Search Tool**

- [ ] `test: codeplane_docs_search returns formatted excerpts when hits found`
- [ ] `test: codeplane_docs_search returns "No Codeplane docs sections matched" when no hits`
- [ ] `test: codeplane_docs_search returns unavailability message when index is null`
- [ ] `test: codeplane_docs_search appends stale warning when docs_status is "stale"`
- [ ] `test: codeplane_docs_search response includes details.status and details.hits`

**Test Group: Repo Context Tool**

- [ ] `test: codeplane_repo_context returns current context without refresh`
- [ ] `test: codeplane_repo_context with refresh=true re-collects live state`
- [ ] `test: codeplane_repo_context includes backend context after refresh`
- [ ] `test: codeplane_repo_context response includes content and details`

**Test Group: Resource Loader and Prompt Injection**

- [ ] `test: createCodeplaneResourceLoader produces a DefaultResourceLoader`
- [ ] `test: resource loader materializes codeplane-helper skill to correct path`
- [ ] `test: skill file contains correct instructions referencing all three tools`
- [ ] `test: resource loader disables extensions and prompt templates`
- [ ] `test: resource loader overrides skills to only include codeplane-helper`
- [ ] `test: prompt appendix contains Codeplane Helper heading`
- [ ] `test: prompt appendix contains startup context JSON block`
- [ ] `test: startup context JSON includes all required fields (collected_at, cwd, repo_root, repo_slug, repo_source, auth, remote_repo, backend, warnings, jj_git_remote_list, jj_status)`
- [ ] `test: startup context JSON includes docs status block`
- [ ] `test: jj_git_remote_list in prompt is truncated to 4,000 characters`
- [ ] `test: jj_status in prompt is truncated to 4,000 characters`
- [ ] `test: prompt appendix handles null repoRoot gracefully`

**Test Group: Backend Creation**

- [ ] `test: creates local backend when sandbox=false`
- [ ] `test: creates workspace backend when sandbox=true`
- [ ] `test: local backend kind is "local"`
- [ ] `test: workspace backend kind is "workspace"`
- [ ] `test: backend.describeContext() returns structured metadata`
- [ ] `test: backend.dispose() completes without error`

**Test Group: Full Pipeline Integration**

- [ ] `test: initializeAgentRuntime completes successfully in a jj repo with network`
- [ ] `test: initializeAgentRuntime completes in degraded mode when no jj repo`
- [ ] `test: initializeAgentRuntime completes in degraded mode when no network`
- [ ] `test: initializeAgentRuntime completes in degraded mode when no jj and no network`
- [ ] `test: initializeAgentRuntime registers all three custom tools`
- [ ] `test: initializeAgentRuntime creates session via SessionManager.inMemory()`
- [ ] `test: runAgent in test mode (CODEPLANE_AGENT_TEST_MODE=summary) returns structured response`
- [ ] `test: runAgent in test mode skips docs refresh`
- [ ] `test: runAgent with --prompt runs one-shot and returns`
- [ ] `test: runAgent disposes backend and session on error`
- [ ] `test: runAgent disposes backend and session on normal completion`
- [ ] `test: concurrent resource loading steps (docs + backend) execute in parallel`

### E2E Tests: CLI

- [ ] `e2e: "codeplane agent --prompt 'what repo am I in?' --format json" returns JSON with repo_context`
- [ ] `e2e: "codeplane agent --prompt 'search docs for landing requests'" invokes codeplane_docs_search tool`
- [ ] `e2e: "codeplane agent --repo owner/repo --prompt 'status'" uses override slug`
- [ ] `e2e: "CODEPLANE_AGENT_TEST_MODE=summary codeplane agent --prompt test" returns summary without creating session`
- [ ] `e2e: "codeplane agent --prompt test" in a non-jj directory starts session with repoSource=unavailable`
- [ ] `e2e: "CODEPLANE_AGENT_DOCS_URL=https://invalid.example.com/llms.txt codeplane agent --prompt test --format json" shows docs_status.status=unavailable`

### E2E Tests: API

- [ ] `e2e: POST /api/repos/:owner/:repo/agent/sessions creates session with resource_status`
- [ ] `e2e: POST /api/repos/:owner/:repo/agent/sessions requires authentication`
- [ ] `e2e: POST /api/repos/:owner/:repo/agent/sessions returns 404 for non-existent repo`
- [ ] `e2e: POST /api/repos/:owner/:repo/agent/sessions rate limited at 10/min`
- [ ] `e2e: GET /api/repos/:owner/:repo/agent/sessions lists user sessions`
- [ ] `e2e: GET /api/repos/:owner/:repo/agent/sessions/:id returns session with resource_status`
- [ ] `e2e: DELETE /api/repos/:owner/:repo/agent/sessions/:id disposes session`

### E2E Tests: Playwright (Web UI)

- [ ] `e2e: agent dock shows loading indicators during resource loading`
- [ ] `e2e: agent dock shows green status dot when all resources loaded`
- [ ] `e2e: agent dock shows yellow status dot when docs are stale`
- [ ] `e2e: agent dock shows session context panel with repo slug and auth state`
- [ ] `e2e: agent session replay displays startup context in collapsible panel`

### E2E Tests: TUI

- [ ] `e2e: TUI agent chat screen shows loading progress lines`
- [ ] `e2e: TUI agent chat disables input until session is ready`
- [ ] `e2e: TUI agent chat shows warning indicators for degraded resources`
