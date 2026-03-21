# WORKFLOW_LIBRARY_CACHE

Specification for WORKFLOW_LIBRARY_CACHE.

## High-Level User POV

When developers write Codeplane workflows, they frequently use cached dependencies — node_modules, compiled binaries, package registries, build artifacts — to dramatically speed up repeated runs. Today, the cache helpers in `@codeplane-ai/workflow` give authors a `cache.restore()` and `cache.save()` API to manage these caches within a single repository. But teams running many repositories with similar technology stacks end up writing the same caching patterns over and over: restore the npm cache with a hash of the lockfile, save it to the same key after install. Every repository re-invents the same cache key naming conventions, the same hash-file globs, and the same restore-fallback logic.

**Workflow Library Cache** extends the `@codeplane-ai/workflow` authoring package with a set of pre-built, composable cache strategy functions that can be published as part of a workflow library and consumed by subscribing repositories. A platform team can author cache strategies — like `npmCache()`, `bunCache()`, `cargoCache()`, or `pipCache()` — that encapsulate best-practice key naming, hash-file patterns, and path conventions into a single function call. These strategies are distributed through the workflow library system: a team publishes a library containing cache strategies, and subscribing repositories reference them by name. When the platform team improves a cache strategy (e.g., adding a new fallback key pattern), every subscribing repository picks up the improvement automatically on their next workflow run.

From the workflow author's perspective, the experience is straightforward. Instead of manually constructing `cache.restore("npm-cache", "package-lock.json")` and `cache.save("npm-cache", "node_modules")` in every Task, the author imports a pre-built strategy: `import { npmCache } from "@codeplane-ai/workflow"` or references one from a subscribed library. They pass the strategy to the `cache` prop on a `<Task>` component, and the engine handles the restore-before and save-after lifecycle automatically. For custom strategies, authors can define their own using `defineCacheStrategy()`, which accepts a configuration of keys, hash patterns, paths, and fallback behavior, and returns a reusable function that produces the correct cache descriptors.

The library cache system also introduces **cache scoping and sharing** for library workflows. When a workflow from a subscribed library runs in a subscribing repository's context, the caches it creates are scoped to the subscribing repository — not the library's source repository. This means library workflows use the subscriber's cache quota and storage, but the cache key conventions and patterns are defined by the library author. Subscribers can inspect and clear library-created caches using the same cache management surfaces (web, CLI, TUI) they use for locally-defined caches. Library-created cache entries are visually annotated with the originating library name so teams can understand where their cache usage comes from.

This feature is designed to make caching a solved problem for the common case. Instead of every team reinventing caching patterns, the community and internal platform teams can share battle-tested strategies. The composable strategy API means advanced users can still build custom patterns, while beginners get sensible defaults with a single function call.

## Acceptance Criteria

### Cache Strategy Definitions

- [ ] The `@codeplane-ai/workflow` package exports a `defineCacheStrategy` function that accepts a strategy configuration and returns a `CacheStrategy` object.
- [ ] A `CacheStrategy` is a callable function that accepts optional runtime overrides and returns one or more `WorkflowCacheDescriptor` pairs (restore + save).
- [ ] `defineCacheStrategy` configuration must include: `name` (1–64 characters, lowercase alphanumeric plus hyphens, starts with a letter), `key` (template string supporting `{hash}` and `{bookmark}` placeholders), `hashFiles` (array of glob patterns, max 20 entries, each max 1,024 characters), `paths` (array of filesystem paths to cache, max 50 entries, each max 1,024 characters).
- [ ] `defineCacheStrategy` configuration optionally accepts: `restoreKeys` (array of fallback key templates, max 5 entries, each max 256 characters), `compression` (`"zstd"` | `"gzip"` | `"none"`, default `"zstd"`), `description` (max 500 characters, printable UTF-8).
- [ ] The `name` field in a strategy definition must be unique within a single workflow file or library package.
- [ ] Duplicate strategy names within the same library produce a validation error at library publish time.
- [ ] Empty `name`, empty `key`, empty `hashFiles`, or empty `paths` produce a TypeScript compile error or runtime validation error with a descriptive message.
- [ ] Strategy names containing uppercase letters, special characters (other than hyphens), or starting/ending with a hyphen are rejected with a validation error.
- [ ] Strategy name at exactly 64 characters is accepted.
- [ ] Strategy name at 65 characters is rejected.

### Built-in Cache Strategies

- [ ] The `@codeplane-ai/workflow` package exports the following built-in cache strategies: `npmCache`, `bunCache`, `pnpmCache`, `yarnCache`, `cargoCache`, `pipCache`, `goCache`, `gradleCache`, `mavenCache`.
- [ ] Each built-in strategy has sensible default hash-file patterns and cache paths for its ecosystem.
- [ ] Built-in strategies accept optional overrides for `key`, `hashFiles`, `paths`, and `restoreKeys` via a configuration object parameter.
- [ ] Built-in strategies are usable without any configuration: `cache={npmCache()}` produces valid restore and save descriptors.
- [ ] Each built-in strategy includes a `description` field that explains its default behavior.

### Task Integration

- [ ] The `<Task>` `cache` prop accepts a `CacheStrategy` (in addition to the existing `WorkflowCacheDescriptor` and array forms).
- [ ] When a `CacheStrategy` is passed to the `cache` prop, the engine expands it into restore-before and save-after descriptors at dispatch time.
- [ ] Multiple cache strategies can be passed as an array: `cache={[npmCache(), cargoCache()]}`.
- [ ] Mixing `CacheStrategy` objects and raw `WorkflowCacheDescriptor` objects in the same array is valid.
- [ ] A maximum of **10** cache entries (strategies + raw descriptors combined) per Task is enforced. Exceeding this limit produces a validation error.
- [ ] If a cache strategy's `hashFiles` glob matches no files at runtime, the restore step is skipped and the save step proceeds with a deterministic fallback key.
- [ ] If a cache strategy's `restoreKeys` all miss, the task proceeds without a restored cache (no error).

### Library Distribution

- [ ] Cache strategies defined in a library's workflow files are exported as part of the library's package and can be imported by subscribing repositories.
- [ ] Library cache strategies are listed in the library detail view (API, web UI, CLI) alongside workflow definitions.
- [ ] A library can export at most **100** cache strategies.
- [ ] Library subscribers reference strategies using the import syntax `import { npmCache } from "library-name"` in their workflow files, resolved at build/dispatch time via the subscription.
- [ ] When a library updates a cache strategy, subscribing repositories pick up the change on their next workflow run (for `latest` subscribers) or remain on the pinned version.
- [ ] Cache strategies from unsubscribed or archived libraries produce a clear error at dispatch time.

### Cache Scoping for Library Workflows

- [ ] Caches created by library workflows running in a subscribing repository are scoped to the subscribing repository's storage and quota.
- [ ] Cache entries created by library workflows include a `library_source` metadata field recording the originating library name and version.
- [ ] The cache list API, web UI, CLI, and TUI display the `library_source` annotation on library-created cache entries.
- [ ] Filtering caches by `library` is supported as an additional filter parameter.
- [ ] Cache statistics include a breakdown by library source when library-created caches exist.
- [ ] Clearing caches supports an optional `library` filter to clear only caches originating from a specific library.

### Cross-Cutting

- [ ] All cache strategy and library cache behavior is available through the API, web UI, CLI, and TUI.
- [ ] Feature is gated behind the `WORKFLOW_LIBRARY_CACHE` feature flag until generally available.
- [ ] Built-in strategies work without the feature flag (they are part of `@codeplane-ai/workflow` core).
- [ ] Library-distributed strategies require the feature flag.

### Definition of Done

- All acceptance criteria above pass automated verification.
- API, web UI, CLI, and TUI surfaces are implemented and consistent.
- Built-in cache strategies are documented with configuration examples.
- Custom strategy authoring via `defineCacheStrategy` is documented.
- Library cache distribution is documented.
- Observability instrumentation is in place (metrics, logs, alerts).
- Feature flag is registered and defaults to off in production until rollout.

## Design

### Package Exports (`@codeplane-ai/workflow`)

New exports added to `packages/workflow/src/index.ts`:

**Functions:**
- `defineCacheStrategy(config: CacheStrategyConfig): CacheStrategy` — Define a reusable, composable cache strategy.
- `npmCache(overrides?: CacheStrategyOverrides): CacheStrategy` — Node.js npm cache strategy.
- `bunCache(overrides?: CacheStrategyOverrides): CacheStrategy` — Bun package cache strategy.
- `pnpmCache(overrides?: CacheStrategyOverrides): CacheStrategy` — pnpm store cache strategy.
- `yarnCache(overrides?: CacheStrategyOverrides): CacheStrategy` — Yarn cache strategy.
- `cargoCache(overrides?: CacheStrategyOverrides): CacheStrategy` — Rust Cargo registry and target cache strategy.
- `pipCache(overrides?: CacheStrategyOverrides): CacheStrategy` — Python pip cache strategy.
- `goCache(overrides?: CacheStrategyOverrides): CacheStrategy` — Go module and build cache strategy.
- `gradleCache(overrides?: CacheStrategyOverrides): CacheStrategy` — Gradle build cache strategy.
- `mavenCache(overrides?: CacheStrategyOverrides): CacheStrategy` — Maven local repository cache strategy.

**Types:**
- `CacheStrategy` — Callable strategy object with metadata.
- `CacheStrategyConfig` — Configuration for `defineCacheStrategy`.
- `CacheStrategyOverrides` — Optional runtime overrides for built-in strategies.
- `CacheStrategyMeta` — Read-only metadata about a strategy (name, description, defaults).

### Web UI Design

#### Cache List Enhancements

The existing cache list table at `/:owner/:repo/workflows/caches` gains a new **"Source"** column showing:
- "Local" for caches created by workflows defined in the repository.
- The library name (e.g., "platform-ci") for caches created by library workflows, rendered as a linked badge navigating to the library detail view.

A new **"Library" filter** dropdown is added to the filter bar alongside the existing Bookmark and Key filters. The dropdown is populated from distinct `library_source` values present in the repository's caches. Selecting a library filters the cache list to entries created by that library.

#### Cache Stats Banner Enhancement

When library-created caches exist, the stats banner includes a "by source" breakdown:
- A compact horizontal bar chart showing the proportion of total cache size consumed by each source (local vs. each library).
- Hovering a segment shows the library name, cache count, and size.

#### Library Detail — Cache Strategies Section

The library detail view gains a new **"Cache Strategies"** tab listing all cache strategies exported by the library. Each entry shows: strategy name, description, default key template, default hash-file patterns, and default paths.

### API Shape

#### Cache Strategy Listing (Library)

```
GET /api/workflow-libraries/:owner/:name/cache-strategies
  Query: { tag?: string }
  Response: 200 {
    strategies: [{
      name: string,
      description: string,
      key_template: string,
      hash_files: string[],
      paths: string[],
      restore_keys: string[],
      compression: string
    }]
  }
```

#### Enhanced Cache List

```
GET /api/repos/:owner/:repo/caches
  Additional Query Parameter:
    library: string (optional) — Filter by library source name. Max 64 chars.
  Response: Each cache record now includes:
    library_source: string | null — Library name that created this cache, or null for local caches.
```

#### Enhanced Cache Stats

```
GET /api/repos/:owner/:repo/caches/stats
  Response now includes:
    by_source: [{
      source: string,       // "local" or library name
      cache_count: number,
      total_size_bytes: number
    }]
```

#### Enhanced Cache Clear

```
DELETE /api/repos/:owner/:repo/caches
  Additional Query Parameter:
    library: string (optional) — Clear only caches from this library source. Max 64 chars.
```

### CLI Commands

#### Built-in Strategies Info

```
codeplane cache strategies
```

Lists all available built-in cache strategies with their names, descriptions, and default configurations. Output as a table (default) or JSON (`--json`).

#### Enhanced Cache List

```
codeplane cache list [--library <name>]
```

Adds `--library` flag to filter by cache source. The table output gains a "SOURCE" column.

**Default output:**
```
ID    KEY                   BOOKMARK  SOURCE         SIZE      HITS  LAST HIT   EXPIRES
42    node_modules          main      Local          45.0 MB   23    2m ago     in 6d
38    cargo-registry        feat/x    platform-ci    12.1 MB    5    1h ago     in 5d
35    pip-cache             main      Local           8.2 MB   12    3d ago     in 2d
```

#### Enhanced Cache Stats

```
codeplane cache stats
```

Output now includes a "By Source" section when library caches exist:

```
Repository: acme/webapp
Caches:     47
Used:       142.3 MB / 1.0 GB (14.2%)
Max archive: 50.0 MB
TTL:        7 days
Last hit:   2 minutes ago
Expires:    Mar 22, 2025

By Source:
  Local          31 caches   98.2 MB (69%)
  platform-ci    16 caches   44.1 MB (31%)
```

#### Enhanced Cache Clear

```
codeplane cache clear [--library <name>]
```

Adds `--library` flag to clear only caches from a specific library source.

#### Library Cache Strategies

```
codeplane workflow library show <owner/name> --cache-strategies
```

### TUI UI

#### Cache List Enhancements

- A "Source" column in the cache table showing "Local" or the library name.
- A new filter hotkey `L` to filter by library source (opens a picker populated from distinct sources).

#### Cache Stats Banner Enhancement

When library caches exist, the stats banner second line shows a compact source breakdown:
```
📦 Caches: 47  Used: 142.3 MB / 1.0 GB  ████████████████░░░░ 78%
   Local: 31 (98.2 MB) · platform-ci: 16 (44.1 MB)
```

### SDK Shape

**New types:**
- `CacheStrategyRecord`: `{ name, description, key_template, hash_files, paths, restore_keys, compression }`
- Extended `WorkflowCacheRecord` with `librarySource: string | null`

**Service extensions on `WorkflowService`:**
- `listWorkflowCaches` gains an optional `librarySource` filter parameter.
- `clearWorkflowCaches` gains an optional `librarySource` filter parameter.
- `getCacheStats` response gains a `bySource` breakdown.

### Documentation

End-user documentation to be written:

1. **"Cache Strategies" guide** — How to use built-in cache strategies in workflow definitions. Includes before/after comparison.
2. **"Custom Cache Strategies" guide** — How to define custom strategies with `defineCacheStrategy()`, including key templates, hash-file patterns, restore keys, and compression options.
3. **"Sharing Cache Strategies via Libraries" guide** — How to publish cache strategies as part of a workflow library, how subscribers import them, and how library cache versioning works.
4. **"Managing Library Caches" guide** — How to identify, filter, and clear caches created by library workflows.
5. **Built-in Cache Strategy Reference** — One page per built-in strategy documenting default key template, hash files, paths, overrides, and ecosystem-specific notes.
6. **CLI Reference updates** — Document `codeplane cache strategies`, `--library` flags, and `by-source` stats output.
7. **API Reference updates** — Document new `library` query parameter on cache endpoints and the `cache-strategies` endpoint.

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Read-Only | Member/Write | Admin | Owner |
|--------|-----------|-----------|--------------|-------|-------|
| Use built-in cache strategies (in workflow authoring) | N/A | N/A | ✅ | ✅ | ✅ |
| Use library cache strategies (in workflow authoring) | N/A | N/A | ✅ | ✅ | ✅ |
| Define custom cache strategies (in workflow authoring) | N/A | N/A | ✅ | ✅ | ✅ |
| List cache strategies from a public library | ✅ | ✅ | ✅ | ✅ | ✅ |
| List cache strategies from an org library | ❌ | Org members | Org members | Org members | Org members |
| List cache strategies from a private library | ❌ | Source repo members | Source repo members | Source repo members | Source repo members |
| View cache list with library source info (public repo) | ✅ | ✅ | ✅ | ✅ | ✅ |
| View cache list with library source info (private repo) | ❌ | ✅ | ✅ | ✅ | ✅ |
| Filter caches by library source (public repo) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Filter caches by library source (private repo) | ❌ | ✅ | ✅ | ✅ | ✅ |
| Clear caches by library source | ❌ | ❌ | ❌ | ✅ | ✅ |
| Publish library with cache strategies | ❌ | ❌ | ❌ | ✅ | ✅ |

Workflow authoring is a repository write operation — only users who can push to the `.codeplane/workflows/` directory can define or reference cache strategies. Cache listing remains a read operation. Cache clearing remains admin-only, consistent with WORKFLOW_CACHE_CLEAR.

### Rate Limiting

| Endpoint | Limit | Window | Scope |
|----------|-------|--------|-------|
| `GET /api/workflow-libraries/:owner/:name/cache-strategies` | 60 req/min | Per user | Authenticated |
| `GET /api/workflow-libraries/:owner/:name/cache-strategies` | 20 req/min | Per IP | Unauthenticated |
| `GET /api/repos/:owner/:repo/caches` (with or without library filter) | 300 req/min | Per user | Authenticated |
| `GET /api/repos/:owner/:repo/caches` (with or without library filter) | 60 req/min | Per IP | Unauthenticated |
| `DELETE /api/repos/:owner/:repo/caches` (with or without library filter) | 10 req/hour | Per user per repo | Authenticated |

Rate limit responses include `429 Too Many Requests` with `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers.

### Data Privacy

- Cache strategy definitions (names, key templates, hash-file patterns, paths) are library metadata and follow library visibility rules — private library strategies are never exposed to non-members.
- The `library_source` field on cache entries is a library name, not PII. It is visible to anyone with read access to the repository.
- Cache key templates may contain `{bookmark}` placeholders that resolve to internal branch names — these are repository-scoped identifiers, not PII.
- Strategy `description` fields are user-authored text and could theoretically contain anything. They follow the same visibility rules as the library itself.
- No secret material (tokens, credentials, environment variables) is stored in cache strategy definitions or cache metadata.

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `WorkflowCacheStrategyUsed` | A workflow run resolves a cache strategy at dispatch time | `repo_id`, `strategy_name`, `strategy_source` ("builtin" \| "custom" \| library name), `library_version`, `workflow_run_id`, `task_id`, `surface` |
| `WorkflowCacheStrategyDefined` | A custom cache strategy is defined via `defineCacheStrategy()` during workflow registration | `repo_id`, `strategy_name`, `hash_file_count`, `path_count`, `has_restore_keys`, `compression` |
| `WorkflowCacheStrategyPublished` | A library is published or updated containing cache strategies | `library_id`, `library_name`, `strategy_count`, `strategy_names` |
| `WorkflowCacheLibraryFiltered` | User filters cache list by library source | `repo_id`, `library_name`, `result_count`, `surface` (web/cli/tui/api) |
| `WorkflowCacheLibraryCleared` | User clears caches filtered by library source | `repo_id`, `library_name`, `deleted_count`, `deleted_bytes`, `surface` |
| `WorkflowCacheStrategyRestoreHit` | A cache restore from a strategy matches a cached entry | `repo_id`, `strategy_name`, `strategy_source`, `cache_key`, `cache_size_bytes`, `workflow_run_id` |
| `WorkflowCacheStrategyRestoreMiss` | A cache restore from a strategy finds no matching entry | `repo_id`, `strategy_name`, `strategy_source`, `attempted_keys`, `workflow_run_id` |
| `WorkflowCacheStrategyFallbackUsed` | A restore-key fallback was used instead of the primary key | `repo_id`, `strategy_name`, `primary_key`, `fallback_key_used`, `workflow_run_id` |
| `WorkflowCacheStrategyResolutionFailed` | A library cache strategy reference could not be resolved at dispatch time | `repo_id`, `strategy_name`, `library_name`, `error_reason` |
| `WorkflowBuiltinStrategyInfo` | User views built-in strategies via `cache strategies` CLI command | `surface`, `user_id` |

### Common Event Properties

All events include: `timestamp` (ISO 8601), `actor_id` (user ID or "system"), `session_id`, `client_version`.

### Funnel Metrics & Success Indicators

| Metric | Definition | Target |
|--------|-----------|--------|
| **Built-in strategy adoption** | % of repositories with workflows that use at least one built-in cache strategy | >40% within 60 days of launch |
| **Custom strategy usage** | % of repositories using `defineCacheStrategy` at least once | >15% within 60 days |
| **Library strategy distribution** | Average number of subscribing repos per library that exports cache strategies | >3 |
| **Cache hit rate with strategies** | Cache restore hit rate for strategy-backed caches vs. manual caches | Strategy-backed should be ≥10% higher |
| **Fallback key utilization** | % of strategy restores that use a fallback key | 5–20% (too high = primary keys are poorly designed) |
| **Library filter adoption** | % of cache list/clear sessions that use the library filter | >10% for repos with library caches |
| **Strategy resolution error rate** | % of strategy-backed dispatch attempts that fail resolution | <0.5% |
| **Time from library publish to subscriber usage** | Median time between a library publishing new strategies and a subscriber's workflow using them | <24 hours |

## Observability

### Logging Requirements

| Level | Event | Structured Context |
|-------|-------|--------------------||
| `info` | Cache strategy resolved at dispatch | `repo_id`, `workflow_run_id`, `task_id`, `strategy_name`, `strategy_source`, `resolved_key`, `hash_files_matched` |
| `info` | Cache strategy restore hit | `repo_id`, `workflow_run_id`, `strategy_name`, `cache_key`, `cache_id`, `cache_size_bytes` |
| `info` | Cache strategy restore miss (all keys exhausted) | `repo_id`, `workflow_run_id`, `strategy_name`, `attempted_keys`, `attempted_count` |
| `info` | Cache strategy fallback key used | `repo_id`, `workflow_run_id`, `strategy_name`, `primary_key`, `fallback_key`, `cache_id` |
| `info` | Cache strategy save completed | `repo_id`, `workflow_run_id`, `strategy_name`, `cache_key`, `object_size_bytes`, `compression`, `finalization_duration_ms` |
| `info` | Library cache strategies listed | `library_id`, `library_name`, `strategy_count`, `actor_id` |
| `warn` | Cache strategy resolution failed | `repo_id`, `workflow_run_id`, `strategy_name`, `library_name`, `error_reason` |
| `warn` | Cache strategy hash-files matched zero files | `repo_id`, `workflow_run_id`, `strategy_name`, `hash_file_patterns`, `working_dir` |
| `warn` | Cache strategy limit exceeded on Task (>10) | `repo_id`, `workflow_definition_id`, `task_id`, `strategy_count` |
| `error` | Cache strategy expansion failed at dispatch | `repo_id`, `workflow_run_id`, `task_id`, `error_message`, `error_stack` |
| `error` | Library cache strategy import failed | `repo_id`, `library_name`, `strategy_name`, `error_message` |
| `debug` | Cache strategy definition validated | `repo_id`, `strategy_name`, `key_template`, `hash_file_count`, `path_count` |
| `debug` | Built-in strategy info requested | `actor_id`, `surface` |
| `debug` | Cache list filtered by library source | `repo_id`, `library_name`, `result_count`, `query_duration_ms` |

All log entries include: `request_id`, `timestamp`, `actor_id`.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_workflow_cache_strategy_resolutions_total` | Counter | `strategy_source` (builtin/custom/library), `result` (hit/miss/error) | Total strategy resolutions at dispatch time |
| `codeplane_workflow_cache_strategy_restore_results_total` | Counter | `strategy_source`, `result` (hit/miss/fallback) | Total restore outcomes for strategy-backed caches |
| `codeplane_workflow_cache_strategy_save_total` | Counter | `strategy_source`, `result` (success/failure) | Total save operations from strategies |
| `codeplane_workflow_cache_strategy_resolution_duration_seconds` | Histogram | `strategy_source` | Time to resolve and expand a strategy into cache descriptors |
| `codeplane_workflow_cache_strategy_definitions_total` | Gauge | `scope` (builtin/custom/library) | Total defined strategies across all libraries and repos |
| `codeplane_workflow_cache_library_filter_requests_total` | Counter | `endpoint` (list/stats/clear) | Requests using the library source filter |
| `codeplane_workflow_cache_strategy_validation_errors_total` | Counter | `error_type` (name/key/hash_files/paths/limit) | Strategy validation failures by type |
| `codeplane_workflow_cache_library_strategy_list_duration_seconds` | Histogram | — | Latency for library cache strategy listing |

### Alerts & Runbooks

#### Alert: `WorkflowCacheStrategyResolutionErrorHigh`
- **Condition**: `rate(codeplane_workflow_cache_strategy_resolutions_total{result="error"}[5m]) / rate(codeplane_workflow_cache_strategy_resolutions_total[5m]) > 0.05` sustained for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check structured logs for `Cache strategy resolution failed` entries. Identify the affected `library_name` and `error_reason`.
  2. If `error_reason` is "library not subscribed": check if a library was recently unsubscribed or archived. Verify the subscription table for the affected repos.
  3. If `error_reason` is "strategy not found": the library may have been updated and the strategy removed. Check the library's latest strategies list.
  4. If `error_reason` is "library archived/deleted": confirm the library source repository status. Monitor for subscriber notification delivery.
  5. If errors are concentrated on a single library: contact the library publisher. If widespread: check for platform-level issue in library resolution (e.g., database connectivity).
  6. Escalate to the workflow team if resolution errors persist after ruling out user-initiated library changes.

#### Alert: `WorkflowCacheStrategyRestoreMissRateHigh`
- **Condition**: `rate(codeplane_workflow_cache_strategy_restore_results_total{result="miss"}[15m]) / rate(codeplane_workflow_cache_strategy_restore_results_total[15m]) > 0.8` sustained for 30 minutes.
- **Severity**: Info
- **Runbook**:
  1. A high miss rate means strategies are producing keys that don't match existing caches. This is often normal after mass cache clears or initial strategy rollouts.
  2. Check if a large number of caches were recently cleared (correlate with `codeplane_workflow_cache_clear_total`).
  3. Check if a library recently updated its strategy (new key templates = all previous caches are misses until rebuilt).
  4. If the miss rate is sustained beyond 2 hours without a clear event or strategy update: check that hash-file globs are matching files correctly (look for `hash-files matched zero files` warnings).
  5. No immediate engineering action required — this is primarily a product/UX signal.

#### Alert: `WorkflowCacheStrategyValidationErrorSpike`
- **Condition**: `rate(codeplane_workflow_cache_strategy_validation_errors_total[10m]) > 20` sustained for 10 minutes.
- **Severity**: Info
- **Runbook**:
  1. Check which error types are spiking from `error_type` label.
  2. If `name` errors: users may be confused by naming conventions. Check if documentation is clear.
  3. If `limit` errors (>10 strategies per task): users may be overloading tasks. Consider whether the limit should be raised or documentation should guide better composition.
  4. If `hash_files` or `paths` errors: check if a library published strategies with invalid paths for subscribing repos' platform.
  5. This is primarily a UX/documentation signal, not an engineering emergency.

#### Alert: `WorkflowCacheLibraryStrategyListLatencyHigh`
- **Condition**: `histogram_quantile(0.95, rate(codeplane_workflow_cache_library_strategy_list_duration_seconds_bucket[5m])) > 2.0` sustained for 5 minutes.
- **Severity**: Warning
- **Runbook**:
  1. Check database query latency for the library strategies table.
  2. If a specific library has an unusually large number of strategies (approaching the 100 limit), the listing query may be slow.
  3. Run `EXPLAIN ANALYZE` on the strategy listing query for the affected library.
  4. Consider adding a short-lived cache (30s TTL) for strategy listings if load is sustained.
  5. Check for connection pool saturation if latency affects all libraries.

### Error Cases and Failure Modes

| Error Case | Expected Behavior |
|------------|-------------------|
| `defineCacheStrategy` with empty name | Compile-time or runtime error: "Cache strategy name must be 1–64 characters" |
| `defineCacheStrategy` with name > 64 chars | Validation error: "Cache strategy name exceeds maximum length of 64 characters" |
| `defineCacheStrategy` with uppercase in name | Validation error: "Cache strategy name must be lowercase alphanumeric plus hyphens" |
| `defineCacheStrategy` with empty paths | Validation error: "Cache strategy must specify at least one path" |
| `defineCacheStrategy` with empty hashFiles | Validation error: "Cache strategy must specify at least one hash file pattern" |
| `defineCacheStrategy` with > 20 hash-file entries | Validation error: "Cache strategy hash_files exceeds maximum of 20 entries" |
| `defineCacheStrategy` with > 50 path entries | Validation error: "Cache strategy paths exceeds maximum of 50 entries" |
| Task with > 10 cache entries | Dispatch validation error: "Task exceeds maximum of 10 cache entries" |
| Library strategy reference with unsubscribed library | Dispatch error: "Cache strategy 'X' from library 'Y' is unavailable: library not subscribed" |
| Library strategy reference with archived library | Dispatch error: "Cache strategy 'X' from library 'Y' is unavailable: library archived" |
| Strategy hash-files match zero files | Restore skipped, save proceeds with fallback key. Warning logged. |
| All restore keys miss | Task proceeds without restored cache. Info logged. |
| Duplicate strategy names in same library | Library publish validation error: "Duplicate cache strategy name 'X'" |
| Library with > 100 strategies | Library publish validation error: "Library exceeds maximum of 100 cache strategies" |
| Cache filter with `library` param > 64 chars | 400: "library filter exceeds maximum length of 64 characters" |
| Cache filter with non-existent library name | 200 with empty results (not an error) |
| Strategy expansion failure (malformed template) | Dispatch error logged; task fails with clear error message |
| Concurrent library update during strategy resolution | Resolution uses a point-in-time snapshot; no partial state |

## Verification

### API Integration Tests (`e2e/api/workflow-cache-library.test.ts`)

#### Cache Strategy Listing

- [ ] **API-CSL-001**: `GET /api/workflow-libraries/:owner/:name/cache-strategies` on a library with strategies returns 200 with strategy array.
- [ ] **API-CSL-002**: Each strategy in the response has fields: `name`, `description`, `key_template`, `hash_files`, `paths`, `restore_keys`, `compression`.
- [ ] **API-CSL-003**: `GET` with `?tag=v1.0.0` returns strategies as they existed at that tag.
- [ ] **API-CSL-004**: `GET` on a library with no strategies returns `{ strategies: [] }`.
- [ ] **API-CSL-005**: `GET` on a non-existent library returns 404.
- [ ] **API-CSL-006**: `GET` on a private library without access returns 403.
- [ ] **API-CSL-007**: `GET` on a public library as anonymous user returns 200.
- [ ] **API-CSL-008**: `GET` on an org library as org member returns 200.
- [ ] **API-CSL-009**: `GET` on an org library as non-member returns 403.
- [ ] **API-CSL-010**: Response content type is `application/json`.
- [ ] **API-CSL-011**: Rate limiting: 61 requests in 1 minute returns 429 on the 61st.

#### Enhanced Cache List with Library Filter

- [ ] **API-CLF-001**: `GET /api/repos/:owner/:repo/caches` returns cache records that include a `library_source` field.
- [ ] **API-CLF-002**: Locally-created caches have `library_source: null`.
- [ ] **API-CLF-003**: Library-created caches have `library_source` set to the library name.
- [ ] **API-CLF-004**: `GET /api/repos/:owner/:repo/caches?library=platform-ci` returns only caches where `library_source = "platform-ci"`.
- [ ] **API-CLF-005**: `GET /api/repos/:owner/:repo/caches?library=nonexistent` returns `[]`.
- [ ] **API-CLF-006**: `GET /api/repos/:owner/:repo/caches?library=platform-ci&bookmark=main` applies both filters (AND logic).
- [ ] **API-CLF-007**: `GET /api/repos/:owner/:repo/caches?library=platform-ci&key=npm-cache` applies all three filters (AND logic).
- [ ] **API-CLF-008**: Library filter at maximum length (64 chars) succeeds.
- [ ] **API-CLF-009**: Library filter at 65 chars returns 400.
- [ ] **API-CLF-010**: Library filter with empty string is treated as no filter.
- [ ] **API-CLF-011**: Library filter is case-sensitive.

#### Enhanced Cache Stats with Source Breakdown

- [ ] **API-CSS-001**: `GET /api/repos/:owner/:repo/caches/stats` response includes `by_source` array.
- [ ] **API-CSS-002**: Repository with only local caches has `by_source` containing `[{ source: "local", cache_count: N, total_size_bytes: M }]`.
- [ ] **API-CSS-003**: Repository with local and library caches has multiple entries in `by_source`.
- [ ] **API-CSS-004**: `by_source` entries sum to the overall `cache_count` and `total_size_bytes`.
- [ ] **API-CSS-005**: Repository with no caches has `by_source: []`.
- [ ] **API-CSS-006**: Repository with caches only from a library has `by_source` containing `[{ source: "library-name", ... }]` with no "local" entry.

#### Enhanced Cache Clear with Library Filter

- [ ] **API-CCL-001**: `DELETE /api/repos/:owner/:repo/caches?library=platform-ci` deletes only library-sourced caches.
- [ ] **API-CCL-002**: After clearing library caches, local caches remain.
- [ ] **API-CCL-003**: `DELETE /api/repos/:owner/:repo/caches?library=platform-ci&bookmark=main` applies both filters (AND logic).
- [ ] **API-CCL-004**: Library filter at maximum length (64 chars) succeeds.
- [ ] **API-CCL-005**: Library filter at 65 chars returns 400 with descriptive message.
- [ ] **API-CCL-006**: Clearing with non-existent library name returns `{ deleted_count: 0, deleted_bytes: 0 }`.
- [ ] **API-CCL-007**: Admin permission is required for library-filtered clear (same as unfiltered).

#### Strategy Validation

- [ ] **API-SV-001**: Publishing a library with a strategy name at exactly 64 chars succeeds.
- [ ] **API-SV-002**: Publishing a library with a strategy name at 65 chars fails with validation error.
- [ ] **API-SV-003**: Publishing a library with an empty strategy name fails with validation error.
- [ ] **API-SV-004**: Publishing a library with uppercase strategy name fails with validation error.
- [ ] **API-SV-005**: Publishing a library with strategy name starting with hyphen fails.
- [ ] **API-SV-006**: Publishing a library with strategy name ending with hyphen fails.
- [ ] **API-SV-007**: Publishing a library with duplicate strategy names fails.
- [ ] **API-SV-008**: Publishing a library with 100 strategies succeeds.
- [ ] **API-SV-009**: Publishing a library with 101 strategies fails with limit error.
- [ ] **API-SV-010**: Publishing a library with strategy containing > 20 hash-file entries fails.
- [ ] **API-SV-011**: Publishing a library with strategy containing > 50 path entries fails.
- [ ] **API-SV-012**: Publishing a library with strategy containing > 5 restore keys fails.
- [ ] **API-SV-013**: Strategy description at exactly 500 chars succeeds.
- [ ] **API-SV-014**: Strategy description at 501 chars fails.
- [ ] **API-SV-015**: Strategy key template with valid placeholders `{hash}` and `{bookmark}` succeeds.
- [ ] **API-SV-016**: Hash-file entry at exactly 1,024 chars succeeds.
- [ ] **API-SV-017**: Hash-file entry at 1,025 chars fails.
- [ ] **API-SV-018**: Path entry at exactly 1,024 chars succeeds.
- [ ] **API-SV-019**: Path entry at 1,025 chars fails.
- [ ] **API-SV-020**: Restore key entry at exactly 256 chars succeeds.
- [ ] **API-SV-021**: Restore key entry at 257 chars fails.

### Permission Tests

- [ ] **PERM-001**: Anonymous user can list strategies of a public library → 200.
- [ ] **PERM-002**: Anonymous user cannot list strategies of an org library → 403.
- [ ] **PERM-003**: Anonymous user cannot list strategies of a private library → 403.
- [ ] **PERM-004**: Org member can list strategies of an org library → 200.
- [ ] **PERM-005**: Non-org member cannot list strategies of an org library → 403.
- [ ] **PERM-006**: Read-only user can view cache list with library filter on public repo → 200.
- [ ] **PERM-007**: Read-only user can view cache list with library filter on private repo (with read access) → 200.
- [ ] **PERM-008**: Read-only user cannot clear caches (including with library filter) → 403.
- [ ] **PERM-009**: Write user cannot clear caches (including with library filter) → 403.
- [ ] **PERM-010**: Admin user can clear caches with library filter → 200.

### CLI E2E Tests (`e2e/cli/workflow-cache-library.test.ts`)

- [ ] **CLI-CST-001**: `codeplane cache strategies` lists built-in strategies with names and descriptions.
- [ ] **CLI-CST-002**: `codeplane cache strategies --json` returns JSON array of strategy objects.
- [ ] **CLI-CST-003**: Each built-in strategy in the output has `name`, `description`, `key_template`, `hash_files`, `paths`.
- [ ] **CLI-CST-004**: `codeplane cache list --library platform-ci` filters results by library source.
- [ ] **CLI-CST-005**: `codeplane cache list` output includes SOURCE column.
- [ ] **CLI-CST-006**: `codeplane cache list --json` output includes `library_source` field on each record.
- [ ] **CLI-CST-007**: `codeplane cache stats --json` output includes `by_source` array.
- [ ] **CLI-CST-008**: `codeplane cache stats` human-readable output shows "By Source" section when library caches exist.
- [ ] **CLI-CST-009**: `codeplane cache stats` on repo with only local caches does not show "By Source" section.
- [ ] **CLI-CST-010**: `codeplane cache clear --library platform-ci` clears only library-sourced caches.
- [ ] **CLI-CST-011**: `codeplane cache clear --library platform-ci` confirmation prompt shows library filter.
- [ ] **CLI-CST-012**: `codeplane cache clear --library platform-ci --yes` skips confirmation.
- [ ] **CLI-CST-013**: `codeplane cache clear --library platform-ci --json` returns JSON with `deleted_count` and `deleted_bytes`.
- [ ] **CLI-CST-014**: `codeplane workflow library show owner/name --cache-strategies` lists strategies exported by library.
- [ ] **CLI-CST-015**: `codeplane workflow library show owner/name --cache-strategies --json` returns JSON array.
- [ ] **CLI-CST-016**: `codeplane cache list --library nonexistent` returns empty list.
- [ ] **CLI-CST-017**: `codeplane cache clear --library nonexistent` reports 0 deleted.

### Playwright Web UI E2E Tests (`e2e/web/workflow-cache-library.test.ts`)

- [ ] **WEB-CST-001**: Cache list page shows "Source" column in the table.
- [ ] **WEB-CST-002**: Local caches show "Local" in the Source column.
- [ ] **WEB-CST-003**: Library caches show the library name as a linked badge in the Source column.
- [ ] **WEB-CST-004**: Clicking a library badge navigates to the library detail view.
- [ ] **WEB-CST-005**: Library filter dropdown appears in the filter bar.
- [ ] **WEB-CST-006**: Selecting a library from the dropdown filters the cache list.
- [ ] **WEB-CST-007**: Clearing the library filter returns to the unfiltered view.
- [ ] **WEB-CST-008**: Library filter combined with bookmark/key filters works correctly.
- [ ] **WEB-CST-009**: Stats banner shows "by source" breakdown when library caches exist.
- [ ] **WEB-CST-010**: Stats banner hover shows library name, count, and size for each segment.
- [ ] **WEB-CST-011**: "Clear caches" with library filter active shows the library filter in confirmation dialog.
- [ ] **WEB-CST-012**: After clearing library caches, local caches remain in the list.
- [ ] **WEB-CST-013**: Library detail page shows "Cache Strategies" tab.
- [ ] **WEB-CST-014**: Cache Strategies tab lists strategies with name, description, and configuration.
- [ ] **WEB-CST-015**: Cache Strategies tab for library with no strategies shows empty state.
- [ ] **WEB-CST-016**: Feature flag off → library-related cache enhancements are not visible.

### TUI E2E Tests (`e2e/tui/workflow-cache-library.test.ts`)

- [ ] **TUI-CST-001**: Cache list screen shows "Source" column.
- [ ] **TUI-CST-002**: `L` hotkey opens library filter picker.
- [ ] **TUI-CST-003**: Selecting a library from the picker filters the cache list.
- [ ] **TUI-CST-004**: Stats banner shows source breakdown when library caches exist.
- [ ] **TUI-CST-005**: `D` bulk clear with library filter active includes library in confirmation.
- [ ] **TUI-CST-006**: After clearing, stats and list refresh.
- [ ] **TUI-CST-007**: `x` clears library filter (along with other filters).

### Workflow Execution Integration Tests (`e2e/workflows/cache-strategy.test.ts`)

- [ ] **EXEC-CS-001**: A workflow using `npmCache()` built-in strategy restores and saves caches correctly.
- [ ] **EXEC-CS-002**: A workflow using `npmCache({ key: "custom-{hash}" })` with overrides uses the custom key.
- [ ] **EXEC-CS-003**: A workflow using `defineCacheStrategy(...)` with custom config creates caches with expected keys and paths.
- [ ] **EXEC-CS-004**: A workflow using multiple cache strategies on a single task `cache={[npmCache(), cargoCache()]}` creates separate cache entries.
- [ ] **EXEC-CS-005**: A workflow using > 10 cache entries on a single task fails dispatch with validation error.
- [ ] **EXEC-CS-006**: A workflow referencing a library cache strategy via subscription resolves and runs correctly.
- [ ] **EXEC-CS-007**: A workflow referencing a library cache strategy from an unsubscribed library fails dispatch with clear error message.
- [ ] **EXEC-CS-008**: A library-workflow-created cache entry has `library_source` set to the library name.
- [ ] **EXEC-CS-009**: A locally-defined workflow cache entry has `library_source: null`.
- [ ] **EXEC-CS-010**: A cache strategy with hash-files matching zero files skips restore and logs a warning.
- [ ] **EXEC-CS-011**: A cache strategy with all restore keys missing proceeds without error, task runs without restored cache.
- [ ] **EXEC-CS-012**: A cache strategy with a matching fallback key restores from the fallback and logs the fallback usage.
- [ ] **EXEC-CS-013**: Built-in `bunCache()` strategy uses correct default hash-files (`bun.lockb`) and paths (`~/.bun/install/cache`).
- [ ] **EXEC-CS-014**: Built-in `cargoCache()` strategy uses correct default hash-files (`Cargo.lock`) and paths (`~/.cargo/registry`, `target`).
- [ ] **EXEC-CS-015**: All 9 built-in strategies resolve without error when called with no arguments.
- [ ] **EXEC-CS-016**: Mixed array of `CacheStrategy` and raw `WorkflowCacheDescriptor` on a single task works correctly.
- [ ] **EXEC-CS-017**: Strategy with `compression: "gzip"` override creates cache with gzip compression.
- [ ] **EXEC-CS-018**: Strategy with `compression: "none"` override creates uncompressed cache.
- [ ] **EXEC-CS-019**: Updated library strategy is picked up by subscriber on next run (for `latest` subscription).
- [ ] **EXEC-CS-020**: Pinned subscription (`@v1.0.0`) continues using old strategy even after library update.

### Rate Limiting Tests

- [ ] **RL-001**: Send 61 strategy listing requests in 1 minute → 61st returns 429.
- [ ] **RL-002**: Send 301 cache list requests (with library filter) in 1 minute → 301st returns 429.
- [ ] **RL-003**: Send 11 cache clear requests (with library filter) in 1 hour → 11th returns 429.
- [ ] **RL-004**: Rate limit response includes `Retry-After` header.
- [ ] **RL-005**: Rate limit response includes `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers.

### Feature Flag Tests

- [ ] **FF-001**: With `WORKFLOW_LIBRARY_CACHE` flag off, library cache strategy listing endpoint returns 404.
- [ ] **FF-002**: With flag off, `library` filter on cache list is ignored (treated as no filter).
- [ ] **FF-003**: With flag off, `by_source` is absent from stats response.
- [ ] **FF-004**: With flag off, `library` filter on cache clear is ignored.
- [ ] **FF-005**: With flag off, built-in strategies (`npmCache()`, etc.) still work in workflow definitions — they are core package features.
- [ ] **FF-006**: With flag on, all library cache features are active.
