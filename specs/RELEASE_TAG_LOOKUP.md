# RELEASE_TAG_LOOKUP

Specification for RELEASE_TAG_LOOKUP.

## High-Level User POV

As a Codeplane user, I want to look up a release by its tag name so that I can retrieve release metadata, assets, and notes for a specific version without needing to know the internal release ID. This supports CLI workflows (`codeplane release get v1.2.3`), web UI direct-link access (`/:owner/:repo/releases/tag/v1.2.3`), API integrations that reference releases by semantic version tags, and automation scripts that need to fetch the latest release or a pinned version by tag.

## Acceptance Criteria

1. GET /api/v1/repos/:owner/:repo/releases/tags/:tag returns 200 with the full release JSON (id, tag_name, name, body, draft, prerelease, assets[], author, created_at, published_at) when the tag exists.
2. Returns 404 with a structured error `{ error: 'release_not_found', message: 'No release found for tag :tag' }` when the tag does not exist.
3. Draft releases are only returned to repository owners/admins; read-only users receive 404 for draft releases.
4. The endpoint supports both exact tag matches (e.g., `v1.2.3`) and URL-encoded tags (e.g., `v1.2.3%2Bbuild.1`).
5. The CLI `release get --tag <tag>` flag resolves to this endpoint and renders the same output as `release get <id>`.
6. The web UI route `/:owner/:repo/releases/tag/:tag` resolves the tag to a release and renders the release detail page.
7. Response includes asset download URLs that are valid and accessible with the caller's current auth context.
8. The endpoint respects repository visibility: private repo releases require authentication; public repo non-draft releases are accessible anonymously.

## Design

### Route
`GET /api/v1/repos/:owner/:repo/releases/tags/:tag`

Mounted in the existing `releases` route family in `apps/server/src/routes/releases.ts`.

### Service Layer
Add `getReleaseByTag(repoId: string, tag: string): Promise<Release | null>` to `packages/sdk/src/services/release.ts`. Implementation queries the releases table with `WHERE repo_id = $1 AND tag_name = $2 LIMIT 1`. Returns the same `Release` domain object as `getReleaseById`.

### Route Handler
1. Resolve `:owner/:repo` to a repository using the existing `resolveRepo` middleware.
2. Call `releaseService.getReleaseByTag(repo.id, params.tag)`.
3. If null, return 404.
4. If release is draft and the caller lacks write/admin permission on the repo, return 404.
5. Serialize the release with assets and author, return 200.

### CLI Integration
Extend `apps/cli/src/commands/release.ts` `get` subcommand to accept `--tag <tag>` as an alternative to positional `<id>`. When `--tag` is provided, call the tag-based endpoint instead of the ID-based endpoint.

### Web UI Integration
Add a route `/:owner/:repo/releases/tag/:tag` in `apps/ui/src/routes` that fetches via the tag endpoint and renders the existing `ReleaseDetail` component. The existing `/releases/:id` route remains unchanged.

### SDK Client
Add `getReleaseByTag(owner: string, repo: string, tag: string)` to `packages/ui-core/src/api/releases.ts` (and corresponding TUI/CLI API helpers).

### Caching
No new caching layer. Relies on existing HTTP caching headers and client-side resource loaders.

## Permissions & Security

- **Anonymous users**: Can access non-draft releases on public repositories.
- **Authenticated readers**: Can access non-draft releases on any repository they have read access to.
- **Repository writers/admins**: Can access all releases including drafts.
- **Organization owners**: Inherit admin-level access to org-owned repository releases.
- **Deploy keys**: Read-scoped deploy keys grant access to non-draft releases.
- **PATs**: Respect the same permission model as session-authenticated users based on the PAT's associated user.
- **Draft visibility rule**: Draft releases MUST return 404 (not 403) to users without write access, to avoid leaking the existence of unreleased versions.

## Telemetry & Product Analytics

- Track `release.tag_lookup` event with properties: `{ owner, repo, tag, found: boolean, is_draft: boolean, auth_method: 'session' | 'pat' | 'oauth' | 'anonymous' | 'deploy_key' }`.
- Increment counter metric `codeplane_release_tag_lookups_total` with labels `{ status: '200' | '404', repo_visibility: 'public' | 'private' }`.
- Log at INFO level: `release tag lookup owner=:owner repo=:repo tag=:tag status=:status`.

## Observability

- **Structured log**: Every tag lookup request logs `{ event: 'release_tag_lookup', owner, repo, tag, status, duration_ms, user_id? }` at INFO level.
- **Metric**: `codeplane_release_tag_lookup_duration_seconds` histogram with labels `{ status }` for latency monitoring.
- **Alert rule**: If `rate(codeplane_release_tag_lookups_total{status='404'}[5m]) / rate(codeplane_release_tag_lookups_total[5m]) > 0.9` for 10 minutes, fire a warning alert (may indicate broken client integrations or enumeration attempts).
- **Dashboard panel**: Add to the existing Releases section of the Grafana dashboard showing tag lookup request rate, 404 rate, and p95 latency.
- **Error tracking**: 500-level errors from the tag lookup handler are captured by the existing error middleware and forwarded to the structured log pipeline with full request context.

## Verification

### Unit Tests (`packages/sdk`)
1. `releaseService.getReleaseByTag` returns the correct release when tag exists.
2. `releaseService.getReleaseByTag` returns null when tag does not exist.
3. `releaseService.getReleaseByTag` returns draft releases (visibility filtering is the route handler's responsibility).

### Integration Tests (`apps/server`)
4. `GET /api/v1/repos/:owner/:repo/releases/tags/:tag` returns 200 with correct release JSON for an existing published release.
5. Returns 404 for a non-existent tag.
6. Returns 404 for a draft release when the caller is an unauthenticated user.
7. Returns 200 for a draft release when the caller is a repo admin.
8. Returns 404 for a private repo release when the caller is unauthenticated.
9. Returns 200 for a private repo release when the caller has read access.
10. Handles URL-encoded tag names (e.g., tags containing `+` or `/`).
11. Returns correct asset download URLs in the response.

### CLI Tests (`apps/cli`)
12. `release get --tag v1.0.0` calls the tag-based endpoint and renders release output.
13. `release get --tag nonexistent` exits with error code and displays 'release not found'.

### E2E Tests
14. Web UI: Navigate to `/:owner/:repo/releases/tag/:tag`, verify release detail page renders with correct release name, body, and asset links.
15. Full flow: Create a release via API → look up by tag via CLI → verify output matches.

### Manual Verification Checklist
- [ ] Create a release with tag `v1.0.0`, look up via API, CLI, and web UI.
- [ ] Verify draft release is hidden from anonymous and read-only users.
- [ ] Verify tag with special characters (`v1.0.0+build.1`, `release/v2`) works correctly.
- [ ] Verify the endpoint appears in structured logs and metrics dashboards.
