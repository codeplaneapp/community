# AGENT_CONTEXT_REPOSITORY_INDEX

Specification for AGENT_CONTEXT_REPOSITORY_INDEX.

## High-Level User POV

When a developer starts an agent session in Codeplane — whether through the CLI (`codeplane agent ask`), the TUI agent chat, or the web agent dock — the agent today understands the user's authentication state and current jj status, but it has no structural understanding of the repository it is operating in. The agent cannot answer "what files are in this project?", "what languages is this written in?", or "where is the authentication logic?" without the user manually describing the codebase.

The Repository Index changes this. When an agent session begins, Codeplane automatically builds and caches a lightweight structural index of the repository's codebase. This index captures the file tree, detected languages, key project files (READMEs, manifests, lockfiles, configuration), top-level module boundaries, and basic code statistics. The agent can then query this index at any point during the session using a dedicated tool, asking questions like "show me the project structure", "find files related to authentication", or "what are the main entry points?" — and receive ranked, relevant results drawn from the actual repository contents.

The index is built locally from the working copy (or from the workspace sandbox in workspace-backend mode), cached on disk, and refreshed incrementally. It does not require a server round-trip and works fully offline in daemon mode. For server-hosted repositories, the index can also be built from the repository's latest default bookmark state via the API, giving web-based and TUI-based agent sessions the same structural awareness.

The experience is seamless: developers do not need to configure, trigger, or manage the index. It builds in the background during agent startup, is cached between sessions, and stays fresh through content-hash-based invalidation. When the repository changes significantly — new files added, directories reorganized, dependencies updated — the next agent session detects the staleness and rebuilds the affected index segments automatically.

This feature closes the most significant context gap for Codeplane agents: understanding what code exists, where it lives, and how it is organized — before the agent reads a single file or makes a single change.

## Acceptance Criteria

### Core Behavior

- [ ] **AC-1**: When an agent session starts and a jj repository root is detected, the system MUST build or load a cached repository index before the agent receives its first user message.
- [ ] **AC-2**: The repository index MUST capture: file tree (paths, sizes, line counts), detected primary languages, key project files, directory structure with nesting depth, and basic code statistics (total files, total lines, lines-by-language breakdown).
- [ ] **AC-3**: The repository index MUST be searchable via a new agent tool (`codeplane_repo_index`) that accepts a text query and returns ranked file/directory results with relevance scores and contextual snippets.
- [ ] **AC-4**: Index build time for a repository of up to 50,000 files MUST complete within 30 seconds on commodity hardware. Repositories exceeding 100,000 files MUST complete within 120 seconds.
- [ ] **AC-5**: The index MUST be cached locally at `~/.codeplane/cache/agent/repo/<repo-hash>/` and reused across agent sessions until invalidated.
- [ ] **AC-6**: Cache invalidation MUST be based on a content hash derived from the file tree manifest (file paths + sizes + modification timestamps). The index MUST NOT rebuild if the hash matches.
- [ ] **AC-7**: The index MUST respect `.gitignore`, `.jjignore`, and a built-in exclusion list (node_modules, .git, .jj, vendor, dist, build, __pycache__, .venv, target, .next, .turbo, coverage, .cache) to avoid indexing generated or vendored content.
- [ ] **AC-8**: The `codeplane_repo_index` tool MUST return at most 12 results per query by default, with a configurable `max_results` parameter capped at 25.
- [ ] **AC-9**: When invoked with an empty or whitespace-only query, the tool MUST return the repository overview: top-level structure, detected languages, key project files, and statistics.
- [ ] **AC-10**: The index MUST work in both local backend mode (reading from the filesystem) and workspace backend mode (reading from the workspace sandbox via SSH).

### Content and Scope

- [ ] **AC-11**: The index MUST identify "key project files" by matching against a known set of filenames: README*, LICENSE*, CONTRIBUTING*, CHANGELOG*, package.json, Cargo.toml, go.mod, pyproject.toml, Makefile, Dockerfile, docker-compose*, .github/workflows/*, .codeplane/*, Gemfile, pom.xml, build.gradle*, CMakeLists.txt, tsconfig*.json, biome.json, .eslintrc*, .prettierrc*, turbo.json, bun.lockb, deno.json.
- [ ] **AC-12**: Language detection MUST be based on file extension mapping, not file content parsing. The index MUST support at minimum: TypeScript, JavaScript, Python, Rust, Go, Java, C, C++, Ruby, Swift, Kotlin, Scala, Shell, SQL, HTML, CSS, YAML, JSON, TOML, Markdown, Dockerfile.
- [ ] **AC-13**: The index MUST include a module/package boundary map — directories that contain manifest files (package.json, Cargo.toml, go.mod, etc.) are treated as module roots and labeled accordingly.
- [ ] **AC-14**: Binary files (images, compiled artifacts, archives) MUST be indexed by path only — no content extraction or line counting.
- [ ] **AC-15**: Files larger than 1 MB MUST be indexed by path and size only — their content MUST NOT be read for line counting or snippet extraction.
- [ ] **AC-16**: The total index payload serialized to disk MUST NOT exceed 10 MB for any single repository. If the index would exceed this limit, the system MUST prune the deepest/least-significant directory entries first.

### Degradation and Edge Cases

- [ ] **AC-17**: If no jj repository root is detected, the index MUST NOT be built and the `codeplane_repo_index` tool MUST return a clear message: "No repository detected in current directory."
- [ ] **AC-18**: If the index build fails (filesystem permission error, timeout, etc.), the agent session MUST still start. The tool MUST return a degraded response indicating the index is unavailable with the specific error reason.
- [ ] **AC-19**: If a stale cached index exists but the rebuild fails, the system MUST fall back to the stale cache and annotate tool responses with a staleness warning including the cache age.
- [ ] **AC-20**: Repositories with no source files (empty repo, only .gitignore) MUST produce a valid but minimal index with zero files and an appropriate overview message.
- [ ] **AC-21**: Symlinks MUST be followed up to one level of indirection. Circular symlinks MUST be detected and skipped with a warning recorded in the index metadata.
- [ ] **AC-22**: File paths containing unicode characters, spaces, or special characters MUST be indexed correctly and searchable.

### Definition of Done

- [ ] Repository index builds automatically on agent session start when a jj repo is detected.
- [ ] The `codeplane_repo_index` tool is registered alongside existing agent tools and returns ranked search results.
- [ ] Index caching and hash-based invalidation are implemented and verified.
- [ ] Both local and workspace backends support index construction.
- [ ] The feature degrades gracefully when the repo is unavailable, empty, or permissions are insufficient.
- [ ] Integration tests cover build, cache, search, invalidation, and degradation paths.
- [ ] End-user documentation is published covering the tool's capabilities and query syntax.

## Design

### CLI Tool: `codeplane_repo_index`

This tool is registered as a custom agent tool alongside the existing `codeplane_repo_context`, `codeplane_docs_search`, and `codeplane_issue_create` tools. It is available in all agent session modes (interactive and one-shot).

**Tool name**: `codeplane_repo_index`

**Description provided to agent**: "Search or browse the repository's structural index. Returns ranked file paths, directory entries, and project metadata based on a text query. Call with an empty query to get the repository overview."

**Parameters**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `query` | string | Yes | `""` | Search query. Empty string returns the repository overview. |
| `max_results` | number | No | `12` | Maximum results to return. Minimum 1, maximum 25. |
| `scope` | string | No | `"all"` | Filter scope: `"all"`, `"files"`, `"directories"`, `"modules"`, `"key-files"`. |

**Response shape** (overview mode — empty query):

```json
{
  "type": "overview",
  "repoRoot": "/home/user/project",
  "indexedAt": "2026-03-22T10:30:00Z",
  "stale": false,
  "statistics": {
    "totalFiles": 342,
    "totalDirectories": 48,
    "totalLines": 87420,
    "byLanguage": {
      "TypeScript": { "files": 180, "lines": 52000 },
      "JSON": { "files": 45, "lines": 8200 },
      "Markdown": { "files": 22, "lines": 4100 }
    }
  },
  "topLevelEntries": [
    { "name": "src/", "type": "directory", "children": 12 },
    { "name": "tests/", "type": "directory", "children": 8 },
    { "name": "package.json", "type": "file", "lines": 42 },
    { "name": "README.md", "type": "file", "lines": 180 }
  ],
  "keyFiles": [
    "package.json", "tsconfig.json", "README.md", "Dockerfile", ".github/workflows/ci.yml"
  ],
  "modules": [
    { "path": ".", "manifest": "package.json", "name": "my-project" },
    { "path": "packages/core", "manifest": "package.json", "name": "@myorg/core" }
  ]
}
```

**Response shape** (search mode — non-empty query):

```json
{
  "type": "search",
  "query": "authentication middleware",
  "resultCount": 5,
  "stale": false,
  "results": [
    {
      "path": "src/middleware/auth.ts",
      "type": "file",
      "score": 18.5,
      "lines": 145,
      "language": "TypeScript",
      "module": "packages/server",
      "snippet": "src/middleware/auth.ts — middleware for session cookie and PAT authentication"
    },
    {
      "path": "src/middleware/",
      "type": "directory",
      "score": 12.0,
      "children": 6,
      "snippet": "Directory containing 6 middleware files including auth, cors, rate-limit"
    }
  ]
}
```

### Search and Scoring Algorithm

The repository index search uses a token-based scoring system, consistent with the existing documentation index pattern:

| Signal | Score |
|--------|-------|
| Full query match in file/directory name | +15 |
| Full query match in file path segments | +10 |
| Per-token match in file/directory name | +6 |
| Per-token match in path segments | +2 |
| Per-token match in module name | +3 |
| File is a key project file | +4 (bonus) |
| File extension matches a detected primary language | +1 (bonus) |

Results with score 0 are excluded. Results are sorted by descending score, then alphabetically by path for ties.

Tokens are derived by splitting the query on whitespace and punctuation, lowercasing, and deduplicating. Queries longer than 200 characters MUST be truncated to the first 200 characters with a warning.

### Index Build Pipeline

**Step 1 — Tree Walk**: Walk the repository root, respecting ignore rules (.gitignore, .jjignore, built-in exclusions). Collect file paths, sizes, modification times, and directory structure. Skip binary files for content extraction. Skip files > 1 MB for line counting.

**Step 2 — Manifest Hash**: Compute a SHA-256 hash over the sorted list of `(path, size, mtime)` tuples. Compare against the cached hash. If identical, load the cached index and skip remaining steps.

**Step 3 — Language Detection**: Map file extensions to language identifiers. Compute per-language file counts and line counts.

**Step 4 — Key File Identification**: Match filenames and paths against the known key-file set (AC-11).

**Step 5 — Module Boundary Detection**: Identify directories containing manifest files and record them as module roots with the package/project name extracted from the manifest (first 500 bytes of the manifest file, parsed for name field).

**Step 6 — Directory Summarization**: For each directory, compute: child count, total descendant file count, total descendant lines, dominant language.

**Step 7 — Serialization**: Write the index to `~/.codeplane/cache/agent/repo/<repo-hash>/index.json` alongside `meta.json` (containing the manifest hash, build timestamp, and repo root). Enforce the 10 MB serialization limit by pruning deepest directories first.

### Workspace Backend Support

In workspace backend mode, the tree walk is performed over SSH using the workspace sandbox connection. The index build:

1. Executes `find` (with exclusion flags) on the remote workspace to collect the file manifest.
2. Transfers the manifest (not file contents) to the local machine.
3. Performs language detection, key file identification, and module detection locally.
4. For module name extraction, reads the first 500 bytes of manifest files via the workspace's remote file read capability.
5. Caches the index locally, keyed by workspace ID + content hash.

### Agent Runtime Integration

The repository index is built during `initializeAgentRuntime()`, after repository context collection and documentation cache refresh, but before the agent session is created. The build runs concurrently with documentation index preparation to minimize startup latency.

```
initializeAgentRuntime():
  1. collectRepoContext()
  2. [concurrent]
     a. refreshDocsCache() + buildDocsIndex()
     b. buildOrLoadRepoIndex()      ← NEW
  3. createResourceLoader()
  4. registerTools([
       codeplane_repo_context,
       codeplane_docs_search,
       codeplane_repo_index,         ← NEW
       codeplane_issue_create
     ])
  5. createAgentSession()
```

### System Prompt Injection

The resource loader's startup context JSON is extended with a `repositoryIndex` field:

```json
{
  "repositoryIndex": {
    "status": "ready",
    "totalFiles": 342,
    "primaryLanguages": ["TypeScript", "JSON", "Markdown"],
    "modules": [".", "packages/core", "packages/cli"],
    "hint": "Use the codeplane_repo_index tool to search for files and explore project structure."
  }
}
```

When the index is unavailable, the status field is `"unavailable"` with a `reason` string.

### TUI Design

The TUI agent chat screen does not require UI changes. The `codeplane_repo_index` tool is available as an agent-invocable tool and its results render as structured text in the agent message stream, consistent with other tool outputs.

### Web UI Design

The web agent dock does not require UI changes for this feature. The repository index tool results are displayed inline in the agent conversation stream. In a future iteration, repository index data may be surfaced as a sidebar panel in the agent dock, but this is out of scope for the initial implementation.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CODEPLANE_REPO_INDEX_TIMEOUT_MS` | `30000` | Maximum time for index build before timeout. |
| `CODEPLANE_REPO_INDEX_MAX_FILES` | `100000` | Maximum files to index. Repos exceeding this limit produce a partial index with a warning. |
| `CODEPLANE_REPO_INDEX_MAX_SIZE_MB` | `10` | Maximum serialized index size in MB. |
| `CODEPLANE_REPO_INDEX_CACHE_DIR` | `~/.codeplane/cache/agent/repo/` | Override cache directory location. |
| `CODEPLANE_REPO_INDEX_DISABLED` | `false` | Set to `true` to skip index building entirely. |

### Documentation

End-user documentation MUST be written covering:

1. **Agent Repository Index Guide** — What the repository index is, what it captures, and how it improves agent sessions. Explain that the index builds automatically and requires no configuration.
2. **`codeplane_repo_index` Tool Reference** — Parameters, query syntax, scope filters, response shapes, and example queries. Include at least 5 example queries with expected response shapes.
3. **Troubleshooting** — Common issues: index not building (no jj repo), slow builds (large repos), stale index (cache invalidation), workspace mode limitations. Include the environment variable overrides.
4. **SKILL.md Update** — The agent's Codeplane skill resource must be updated to describe the repository index tool and recommend its use for understanding project structure before making changes.

## Permissions & Security

### Authorization

| Role | Can trigger index build | Can query index | Can access index cache |
|------|------------------------|-----------------|----------------------|
| Authenticated user (local) | Yes — automatic on agent start | Yes — via agent tool | Yes — local filesystem |
| Authenticated user (workspace) | Yes — via workspace SSH | Yes — via agent tool | Yes — local cache of remote index |
| Unauthenticated user | No | No | No |

The repository index is built from the user's local working copy (or their authenticated workspace). It does not bypass any filesystem or SSH permissions. The agent can only index files the user can already read.

### Rate Limiting

- Index build is rate-limited to **one concurrent build per agent session**. Concurrent build requests within the same session are deduplicated.
- The `codeplane_repo_index` tool is rate-limited to **30 invocations per minute per agent session** to prevent runaway agent loops.
- Cache writes are rate-limited to **one write per 10 seconds** to prevent disk thrashing during rapid rebuilds.

### Data Privacy

- The repository index is stored only on the user's local machine (or within their workspace sandbox). It is never transmitted to Codeplane servers or third-party services.
- The index contains file paths, directory names, line counts, and package names. It does NOT contain file contents, code snippets, or source code. The only content extracted is the `name` field from manifest files (up to 500 bytes).
- If the repository contains sensitive file paths (e.g., `secrets/`, `credentials/`), these paths will appear in the index. Users should be aware that agent tool output including file paths may be included in agent session transcripts.
- The index cache directory (`~/.codeplane/cache/agent/repo/`) should have `0700` permissions to prevent other system users from reading the index.

### Sensitive Path Handling

The index MUST redact content (but not path existence) for files matching these patterns:
- `*.env`, `*.env.*`
- `*secret*`, `*credential*`, `*password*`
- `.ssh/`, `.gnupg/`
- `*.pem`, `*.key`, `*.p12`, `*.pfx`

These files appear in the index with `"sensitive": true` and line counts omitted.

## Telemetry & Product Analytics

### Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `agent.repo_index.built` | Index successfully built (not loaded from cache) | `repo_hash`, `total_files`, `total_lines`, `primary_language`, `build_duration_ms`, `module_count`, `backend` (local/workspace) |
| `agent.repo_index.cache_hit` | Index loaded from valid cache | `repo_hash`, `cache_age_ms` |
| `agent.repo_index.cache_miss` | Cache invalid or missing, triggering rebuild | `repo_hash`, `reason` (hash_mismatch/not_found/expired) |
| `agent.repo_index.search` | Agent invokes the `codeplane_repo_index` tool | `query_length`, `scope`, `max_results`, `result_count`, `latency_ms`, `was_overview` |
| `agent.repo_index.build_failed` | Index build failed | `repo_hash`, `error_type`, `error_message`, `duration_ms` |
| `agent.repo_index.degraded` | Stale cache served due to build failure | `repo_hash`, `cache_age_ms`, `error_type` |
| `agent.repo_index.skipped` | Index build skipped (no repo, disabled, etc.) | `reason` |

### Funnel Metrics

1. **Index availability rate**: Percentage of agent sessions where the repository index is available (built or cached) at session start. Target: >95% for sessions with a detected jj repo.
2. **Index usage rate**: Percentage of agent sessions where `codeplane_repo_index` is invoked at least once. Target: >60% of sessions with available index.
3. **Search satisfaction**: Ratio of `codeplane_repo_index` searches that return >0 results. Target: >85%.
4. **Cache hit rate**: Ratio of agent session starts that load from cache vs. rebuild. Target: >70% after the first session per repo.
5. **Build success rate**: Percentage of index builds that complete without error. Target: >99%.

### Success Indicators

- Agent sessions with repository index available show higher task completion rates than sessions without.
- Agents invoke `codeplane_repo_index` as one of their first 3 tool calls in >40% of sessions (indicates the agent finds it useful for orientation).
- Average index build time is under 5 seconds for repositories with <10,000 files.

## Observability

### Logging Requirements

| Log Event | Level | Structured Context |
|-----------|-------|--------------------||
| Index build started | `info` | `repo_root`, `repo_hash`, `backend` |
| Index build completed | `info` | `repo_root`, `repo_hash`, `total_files`, `total_lines`, `build_duration_ms`, `cache_written` |
| Index build failed | `error` | `repo_root`, `repo_hash`, `error_type`, `error_message`, `stack_trace`, `duration_ms` |
| Index loaded from cache | `debug` | `repo_root`, `repo_hash`, `cache_age_ms` |
| Index cache invalidated | `info` | `repo_root`, `old_hash`, `new_hash`, `reason` |
| Index serialization exceeded size limit | `warn` | `repo_root`, `raw_size_bytes`, `pruned_entries`, `final_size_bytes` |
| Index tool invoked | `debug` | `query`, `scope`, `max_results`, `result_count`, `latency_ms` |
| Index build timeout | `error` | `repo_root`, `timeout_ms`, `files_processed`, `total_files_estimated` |
| Symlink cycle detected | `warn` | `repo_root`, `symlink_path`, `target_path` |
| File skipped (too large) | `debug` | `file_path`, `size_bytes` |
| Sensitive file detected | `debug` | `file_path` (path only, no content) |
| Workspace tree walk started | `info` | `workspace_id`, `repo_root` |
| Workspace tree walk failed | `error` | `workspace_id`, `error_type`, `error_message` |

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_repo_index_build_duration_seconds` | Histogram | `backend`, `status` (success/failure/timeout) | Time taken to build the repository index |
| `codeplane_repo_index_build_total` | Counter | `backend`, `status` | Total index builds attempted |
| `codeplane_repo_index_cache_hits_total` | Counter | `backend` | Cache hits (valid cache loaded) |
| `codeplane_repo_index_cache_misses_total` | Counter | `backend`, `reason` | Cache misses (rebuild triggered) |
| `codeplane_repo_index_files_indexed` | Histogram | `backend` | Number of files per index build |
| `codeplane_repo_index_size_bytes` | Histogram | `backend` | Serialized index size in bytes |
| `codeplane_repo_index_search_duration_seconds` | Histogram | `scope` | Time to execute a search query |
| `codeplane_repo_index_search_total` | Counter | `scope`, `has_results` | Total search queries |
| `codeplane_repo_index_search_results` | Histogram | `scope` | Number of results returned per search |
| `codeplane_repo_index_errors_total` | Counter | `error_type` | Errors by type (permission, timeout, serialization, etc.) |

### Alerts

**Alert 1: `RepoIndexBuildFailureRateHigh`**
- **Condition**: `rate(codeplane_repo_index_build_total{status="failure"}[15m]) / rate(codeplane_repo_index_build_total[15m]) > 0.10`
- **Severity**: Warning
- **Runbook**:
  1. Check recent error logs: `grep "Index build failed" | jq '.error_type'` — identify the dominant error type.
  2. If `permission_denied`: A recent OS/filesystem change may have altered directory permissions. Check the repo roots in error logs and verify read access.
  3. If `timeout`: Large repos are exceeding the build timeout. Check `files_processed` vs `total_files_estimated` to understand progress. Consider increasing `CODEPLANE_REPO_INDEX_TIMEOUT_MS` or raising the issue as a performance improvement.
  4. If `serialization_error`: Disk may be full or the cache directory may have been deleted mid-write. Check disk space with `df -h ~/.codeplane/cache/` and verify the cache directory exists with correct permissions.
  5. If `workspace_ssh_error`: The workspace SSH connection is failing. Check workspace status and SSH key configuration.

**Alert 2: `RepoIndexBuildLatencyHigh`**
- **Condition**: `histogram_quantile(0.95, codeplane_repo_index_build_duration_seconds) > 30`
- **Severity**: Warning
- **Runbook**:
  1. Check the p95 file count: `histogram_quantile(0.95, codeplane_repo_index_files_indexed)` — if file counts are very high (>50k), this may be expected.
  2. Check if ignore rules are being applied: Large `node_modules` or `vendor` directories being indexed indicate the exclusion list is not working. Verify `.gitignore` parsing.
  3. Check if workspace-backend builds dominate: SSH-based tree walks are inherently slower. Consider caching the file manifest on the workspace side.
  4. Profile the build pipeline: Enable `debug` logging for a sample build and check which step (tree walk, language detection, module detection, serialization) dominates.

**Alert 3: `RepoIndexCacheHitRateLow`**
- **Condition**: `rate(codeplane_repo_index_cache_hits_total[1h]) / (rate(codeplane_repo_index_cache_hits_total[1h]) + rate(codeplane_repo_index_cache_misses_total[1h])) < 0.50`
- **Severity**: Info
- **Runbook**:
  1. Check the dominant cache miss reason: `sum by (reason)(rate(codeplane_repo_index_cache_misses_total[1h]))`.
  2. If `hash_mismatch` dominates: Users are modifying files frequently between sessions. This is expected behavior in active development — no action needed unless build latency is also high.
  3. If `not_found` dominates: The cache directory may be cleared by a cleanup tool or OS. Verify cache directory persistence.
  4. If `expired` dominates: Review the cache TTL configuration (if any forced expiration is implemented beyond hash-based invalidation).

**Alert 4: `RepoIndexSearchZeroResultsHigh`**
- **Condition**: `rate(codeplane_repo_index_search_total{has_results="false"}[1h]) / rate(codeplane_repo_index_search_total[1h]) > 0.30`
- **Severity**: Info
- **Runbook**:
  1. Sample recent zero-result queries from logs to understand what agents are searching for.
  2. If queries are reasonable (e.g., "authentication", "database") but returning no results, the scoring algorithm may need tuning or the index may be too sparse.
  3. If queries are natural language sentences rather than keywords, consider adding query normalization (stop word removal, keyword extraction) to the search pipeline.
  4. If queries reference files that exist but aren't indexed, check the exclusion rules for false positives.

### Error Cases and Failure Modes

| Error Case | Expected Behavior | Recovery |
|------------|-------------------|----------|
| No jj repo root detected | Index build skipped entirely; tool returns "No repository detected" | None needed — expected for non-repo directories |
| Filesystem permission denied on repo root | Build fails; stale cache served if available; tool returns degraded response | User must fix directory permissions |
| Index build exceeds timeout | Build aborted; stale cache served if available; partial index NOT saved | Increase timeout or reduce repo size |
| Disk full during cache write | Write fails silently; index remains in memory for session; warning logged | Free disk space |
| SSH connection lost during workspace tree walk | Build fails; stale cache served if available | Workspace must be reconnected |
| Corrupt cache file on disk | Detected via JSON parse failure; treated as cache miss; rebuild triggered | Automatic recovery via rebuild |
| Manifest file (package.json) contains invalid JSON | Module name extraction skipped for that manifest; warning logged; index build continues | Fix the manifest file |
| Circular symlink detected | Symlink skipped; warning recorded in index metadata | None needed — informational |
| Repository exceeds CODEPLANE_REPO_INDEX_MAX_FILES | Partial index built with first N files; warning in tool responses | Increase limit or accept partial index |

## Verification

### API / Integration Tests

**Index Build Tests**:
- [ ] **T-1**: Build index for a small repository (10 files, 3 directories) and verify the output contains correct file count, line counts, directory structure, and detected languages.
- [ ] **T-2**: Build index for a monorepo with multiple package.json files and verify all module boundaries are detected with correct names.
- [ ] **T-3**: Build index for a repository with files in 5+ languages and verify the `byLanguage` statistics are accurate.
- [ ] **T-4**: Build index for a repository containing `node_modules/`, `.git/`, `dist/`, and `__pycache__/` directories and verify these are excluded from the index.
- [ ] **T-5**: Build index for a repository with a `.gitignore` containing custom patterns and verify ignored files are excluded.
- [ ] **T-6**: Build index for a repository with a `.jjignore` file and verify its patterns are respected.
- [ ] **T-7**: Build index for an empty repository (only `.jj/` directory) and verify a valid minimal index is produced with zero files.
- [ ] **T-8**: Build index for a repository containing a file larger than 1 MB and verify the file is indexed by path/size only (no line count).
- [ ] **T-9**: Build index for a repository containing binary files (.png, .wasm, .zip) and verify they are indexed by path only.
- [ ] **T-10**: Build index for a repository with 50,000 files and verify it completes within 30 seconds.
- [ ] **T-11**: Build index for a repository with 100,001 files (exceeding default max) and verify a partial index is produced with a warning.
- [ ] **T-12**: Build index for a repository containing symlinks and verify symlinks are followed one level and circular symlinks are skipped.
- [ ] **T-13**: Build index for a repository with unicode filenames (e.g., `données.py`, `日本語.ts`) and verify paths are indexed correctly.
- [ ] **T-14**: Build index for a repository with spaces in directory and file names and verify paths are indexed correctly.
- [ ] **T-15**: Build index for a repository containing sensitive files (`.env`, `secrets.json`, `id_rsa.pem`) and verify they are flagged as `sensitive: true` with line counts omitted.

**Cache Tests**:
- [ ] **T-16**: Build index, then rebuild for the same repo without changes, and verify the cache is hit (no rebuild occurs).
- [ ] **T-17**: Build index, add a new file, then rebuild and verify the cache is invalidated and a fresh index is built.
- [ ] **T-18**: Build index, modify a file's size, then rebuild and verify cache invalidation.
- [ ] **T-19**: Build index, corrupt the cache JSON file, then rebuild and verify the system treats it as a cache miss and rebuilds cleanly.
- [ ] **T-20**: Build index, delete the cache directory, then rebuild and verify the system rebuilds without error.
- [ ] **T-21**: Build index, then trigger a rebuild that fails, and verify the stale cache is served with a staleness warning.
- [ ] **T-22**: Verify the serialized index size for a large repository does not exceed 10 MB (the enforcement limit).
- [ ] **T-23**: Build index for two different repositories and verify they produce separate cache entries (different repo hashes).

**Search Tests**:
- [ ] **T-24**: Search for a filename that exists and verify it appears as the top result with a positive score.
- [ ] **T-25**: Search for a directory name and verify the directory entry is returned.
- [ ] **T-26**: Search for a partial filename (e.g., "auth" when "auth.ts" exists) and verify it matches.
- [ ] **T-27**: Search for a path segment (e.g., "middleware" when "src/middleware/auth.ts" exists) and verify the file is returned.
- [ ] **T-28**: Search for a module name and verify module root directories are returned.
- [ ] **T-29**: Search with scope `"files"` and verify only file entries are returned (no directories).
- [ ] **T-30**: Search with scope `"directories"` and verify only directory entries are returned.
- [ ] **T-31**: Search with scope `"modules"` and verify only module boundary entries are returned.
- [ ] **T-32**: Search with scope `"key-files"` and verify only key project files are returned.
- [ ] **T-33**: Search for a term that matches nothing and verify an empty results array is returned with `resultCount: 0`.
- [ ] **T-34**: Search with `max_results: 1` and verify exactly one result is returned even when multiple match.
- [ ] **T-35**: Search with `max_results: 25` (the maximum) and verify at most 25 results are returned.
- [ ] **T-36**: Search with `max_results: 26` (exceeding maximum) and verify it is clamped to 25 or an error is returned.
- [ ] **T-37**: Search with `max_results: 0` and verify an error is returned (minimum is 1).
- [ ] **T-38**: Search with an empty query and verify the overview response is returned with statistics, top-level entries, key files, and modules.
- [ ] **T-39**: Search with a whitespace-only query (`"   "`) and verify the overview response is returned.
- [ ] **T-40**: Search with a query longer than 200 characters and verify it is truncated and still returns results.
- [ ] **T-41**: Search with special characters in the query (`"*.ts"`, `"src/components"`) and verify correct behavior.
- [ ] **T-42**: Verify search results are sorted by descending score, then alphabetically for ties.

**Tool Integration Tests**:
- [ ] **T-43**: Start an agent session with a valid jj repo and verify the `codeplane_repo_index` tool is registered and callable.
- [ ] **T-44**: Start an agent session without a jj repo and verify the `codeplane_repo_index` tool returns "No repository detected."
- [ ] **T-45**: Start an agent session and invoke `codeplane_repo_index` with an empty query and verify the overview is returned with correct structure.
- [ ] **T-46**: Verify the system prompt's `repositoryIndex` field contains `"status": "ready"` when the index is available.
- [ ] **T-47**: Verify the system prompt's `repositoryIndex` field contains `"status": "unavailable"` with a reason when the index build fails.
- [ ] **T-48**: Verify the `codeplane_repo_index` tool rate limit (>30 calls/minute) returns an appropriate error message.

**Workspace Backend Tests**:
- [ ] **T-49**: Build index in workspace backend mode and verify the index is built from the remote workspace filesystem.
- [ ] **T-50**: Build index in workspace backend mode when SSH is unavailable and verify graceful degradation.
- [ ] **T-51**: Verify the workspace-built index is cached locally (not on the workspace) and reusable across sessions.

### CLI E2E Tests

- [ ] **T-52**: Run `codeplane agent ask "what files are in this project?"` in a jj repo and verify the agent uses `codeplane_repo_index` to answer (visible in session transcript).
- [ ] **T-53**: Run `codeplane agent ask "show me the project structure"` and verify the agent returns a meaningful structural overview.
- [ ] **T-54**: Run `codeplane agent ask` in a directory with no jj repo and verify the agent session starts successfully without the repo index.

### Environment Variable Tests

- [ ] **T-55**: Set `CODEPLANE_REPO_INDEX_DISABLED=true` and start an agent session and verify the index is not built and the tool indicates the index is disabled.
- [ ] **T-56**: Set `CODEPLANE_REPO_INDEX_TIMEOUT_MS=100` and build an index for a large repo and verify the build times out and the tool returns a degraded response.
- [ ] **T-57**: Set `CODEPLANE_REPO_INDEX_MAX_FILES=10` and build an index for a repo with 50 files and verify a partial index is built with a warning.
- [ ] **T-58**: Set `CODEPLANE_REPO_INDEX_MAX_SIZE_MB=0.001` (1 KB) and build an index and verify the size limit is enforced with directory pruning.
- [ ] **T-59**: Set `CODEPLANE_REPO_INDEX_CACHE_DIR` to a custom directory and verify the cache is written there.

### Regression / Edge Case Tests

- [ ] **T-60**: Build index for a repo where a file is deleted between cache hash computation and content read, and verify the build handles the race gracefully (skips the file, logs a warning).
- [ ] **T-61**: Build index concurrently from two agent sessions for the same repo and verify no cache corruption occurs (write lock or atomic write).
- [ ] **T-62**: Verify the index correctly handles a repository root that is a symlink to another directory.
- [ ] **T-63**: Verify the index handles a repository with deeply nested directories (>20 levels) without stack overflow or excessive memory usage.
- [ ] **T-64**: Verify the index handles a repository with a single file containing 1,000,000 lines (just under the 1 MB size limit depending on line content) and produces correct line counts.
