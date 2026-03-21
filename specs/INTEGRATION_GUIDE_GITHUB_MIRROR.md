# INTEGRATION_GUIDE_GITHUB_MIRROR

Specification for INTEGRATION_GUIDE_GITHUB_MIRROR.

## High-Level User POV

When a Codeplane user wants to keep a GitHub repository in sync with their Codeplane repository — or vice versa — they need clear guidance on how to configure repository mirroring. The GitHub Mirror integration guide is a built-in, interactive documentation surface within Codeplane that walks users through setting up one-way push mirroring from a Codeplane repository to a GitHub remote.

Today, Codeplane's database and config-as-code system already understand the concept of repository mirroring. A repository can be flagged as a mirror with a destination URL, and this state can be managed through the `.codeplane/config.yml` file. However, there is no user-facing surface — no web page, no CLI walkthrough, no documentation — that helps a user actually set this up. The GitHub Mirror integration guide bridges that gap.

From the user's perspective, the guide appears as an entry in the Integrations area of Codeplane — both in the web UI and through the CLI. When a user opens the guide, they see a step-by-step walkthrough that explains what GitHub mirroring does, what prerequisites are needed (a GitHub personal access token with repo scope, a target GitHub repository), and how to configure their Codeplane repository to push changes to GitHub automatically. The guide is contextual: if the user is viewing it within a specific repository's settings, it pre-fills that repository's details. If they are viewing it from the global integrations page, it asks them to select a repository first.

The guide is not just static documentation. It provides an interactive setup flow: the user enters their GitHub destination URL and a credential (typically a GitHub PAT), and Codeplane validates the URL format and tests connectivity before persisting the mirror configuration. Once configured, the user can see the mirror status on their repository overview and in repository settings. The guide also covers common troubleshooting steps — what to do when pushes fail, how to rotate credentials, and how to disable mirroring.

For teams that manage configuration as code, the guide surfaces the exact `.codeplane/config.yml` snippet needed to enable mirroring declaratively, so the user can commit it to their repository and have the config-sync system apply it automatically.

The value of this feature is discoverability and confidence. Users should not have to guess how to set up GitHub mirroring or hunt for documentation outside the product. The guide makes the full setup path visible, validated, and reversible from within Codeplane itself.

## Acceptance Criteria

### Core Behavior

- The GitHub Mirror integration guide must be accessible from the global Integrations page in the web UI as a distinct guide card.
- The guide must also be accessible from a repository's Settings page under an "Integrations" or "Mirroring" section.
- The guide must be accessible via the CLI as `codeplane extension github-mirror guide`.
- The guide must present a step-by-step setup flow covering: prerequisites, destination URL entry, credential entry, validation, and confirmation.
- The guide must validate the destination URL format using the same URL parsing logic as the config-sync service (`new URL(destination)` must succeed).
- The guide must accept destination URLs using `https://` protocol only. `http://`, `ssh://`, `git://`, and other protocols must be rejected with a clear error message.
- The destination URL must not exceed 2048 characters.
- The destination URL must not contain whitespace-only or empty-string values.
- The guide must accept a GitHub personal access token (PAT) as the authentication credential.
- The PAT field must be masked in the UI (password-type input). The PAT must never be displayed in full after initial entry.
- The PAT must be between 1 and 256 characters (GitHub classic PATs are 40 characters; fine-grained tokens are longer).
- The guide must offer a "Test Connection" step that validates the provided URL and credential can reach the target GitHub repository. A failed test must display a clear, user-actionable error message.
- On successful configuration, the repository's `is_mirror` flag must be set to `true` and `mirror_destination` must be set to the validated URL.
- The credential (PAT) must be stored as an encrypted repository secret, not in the `mirror_destination` field or any plaintext column.
- The guide must display the equivalent `.codeplane/config.yml` snippet for users who prefer config-as-code management.
- The guide must include a "Disable Mirroring" action that sets `is_mirror` to `false` and clears `mirror_destination`.
- Disabling mirroring must not delete the stored credential secret. The user must be informed that the secret can be removed separately.
- The guide must handle the case where mirroring is already configured for the repository: it should show the current mirror destination (masked credential) and offer "Update" and "Disable" actions instead of the setup flow.

### Edge Cases

- If the user enters a destination URL that is not a valid GitHub URL (e.g., a GitLab URL), the guide must accept it but display an informational warning: "This URL does not appear to be a GitHub repository. The guide is optimized for GitHub, but mirroring to other Git remotes may work."
- If the user enters a destination URL identical to the current Codeplane repository's clone URL, the guide must reject it with an error: "The mirror destination cannot be the same as the source repository."
- If the "Test Connection" step fails due to authentication (HTTP 401/403 from GitHub), the error message must suggest checking PAT permissions and expiry.
- If the "Test Connection" step fails due to a network error or timeout, the error message must distinguish this from an auth failure.
- If the "Test Connection" step fails due to a 404 from GitHub, the error message must suggest verifying the repository exists and that the PAT has access to it.
- If the repository is archived, the guide must display a warning that mirroring will not push changes while the repository is archived.
- If the user submits the form with an empty destination URL, the guide must display a validation error and not submit.
- If the user submits the form with an empty PAT, the guide must display a validation error and not submit.
- If the destination URL contains a trailing `.git` suffix, it must be accepted as-is (GitHub supports both forms).
- If multiple users configure mirroring for the same repository concurrently, the last write wins. The guide does not need to implement optimistic locking but must reload current state before displaying the form.
- The guide must handle repositories the user does not have admin access to: the setup form must be disabled with a message indicating admin access is required.

### Boundary Constraints

- Destination URL: maximum 2048 characters, must be a valid URL, `https://` only.
- PAT: 1–256 characters, no whitespace-only values.
- Repository name in URL path: validated by URL parser, no additional constraints.
- The guide itself is a read-heavy surface. The only mutations are: (1) save mirror config, (2) save credential secret, (3) disable mirror config, (4) test connection.
- Config-as-code snippet generation is purely client-side string templating — no server round-trip required.

### Definition of Done

- The GitHub Mirror integration guide is accessible from the web UI Integrations page and from repository Settings.
- The guide is accessible via `codeplane extension github-mirror guide` in the CLI.
- The setup flow validates URL, credential, and tests connectivity.
- Mirror configuration is persisted to the repository's `is_mirror` and `mirror_destination` database fields.
- The credential is stored as an encrypted repository secret.
- The guide displays the `.codeplane/config.yml` equivalent snippet.
- The guide handles already-configured, archived, and permission-denied states.
- The API endpoint for saving mirror configuration is mounted and functional.
- All acceptance criteria are covered by integration and E2E tests.
- User-facing documentation for the guide is published.
- The feature is gated behind the `integrations` feature flag.

## Design

### Web UI Design

#### Integrations Page Entry Point

On the global `/integrations` page, a guide card appears in a "Guides" section positioned after active integration types (Linear) and stub integration types (MCP, Skills):

- **Card title**: "GitHub Mirroring"
- **Card icon**: GitHub mark icon
- **Card subtitle**: "Push repository changes to a GitHub remote automatically."
- **Card action**: "Set Up Guide →" button (navigates to the guide page)
- **Card state when no repo context**: Clicking opens the guide at a repository selection step.
- **Placement**: After MCP/Skills stubs, before Notion Sync guide.

#### Repository Settings Entry Point

On the `/:owner/:repo/settings` page, under an "Integrations" or "Mirroring" section:

- If mirroring is not configured: A banner with "Set up GitHub Mirroring →" linking to the guide.
- If mirroring is configured: A status row showing the mirror destination (domain + repo path, no credential), last push status, and "Edit" / "Disable" buttons.

#### Guide Page (`/integrations/guides/github-mirror`)

The guide page is a multi-step wizard with the following steps:

**Step 1: Prerequisites**
- Explanation text: "GitHub mirroring pushes changes from your Codeplane repository to a GitHub repository. You will need: (1) A GitHub repository (can be empty or existing), (2) A GitHub personal access token with `repo` scope."
- A link to GitHub's PAT documentation.
- "Next" button to proceed.

**Step 2: Select Repository** (only shown when no repo context is provided)
- A searchable repository dropdown listing repositories the user has admin access to.
- Repositories that already have mirroring configured are shown with a "(mirrored)" badge and selecting one navigates to the "Already Configured" state.
- "Next" button to proceed.

**Step 3: Configure Destination**
- **Destination URL input**: Text field, placeholder `https://github.com/your-org/your-repo.git`, labeled "GitHub Repository URL".
  - Client-side validation: must be a valid URL, must use `https://`, max 2048 characters.
  - Warning banner if URL does not match `github.com` pattern.
  - Error if URL matches the source repo clone URL.
- **GitHub PAT input**: Password-type field, labeled "GitHub Personal Access Token", placeholder `ghp_...`.
  - Client-side validation: required, 1–256 characters.
- "Test Connection" button: triggers a server-side connectivity test. Displays a spinner during test, then success checkmark or error message.
- "Next" button (enabled only after successful test).

**Step 4: Confirm & Save**
- Summary of configuration: repository name, destination URL (displayed), credential status ("PAT provided ✓").
- Config-as-code snippet block:
  ```yaml
  # .codeplane/config.yml
  repository:
    mirror:
      enabled: true
      destination: "https://github.com/your-org/your-repo.git"
  ```
- Note explaining that the snippet can be committed to the repository as an alternative to the UI setup.
- "Enable Mirroring" button to save.
- Success state: "Mirroring is now configured. Changes pushed to your Codeplane repository will be mirrored to GitHub." with a link back to repository settings.

**Already Configured State**
When the selected repository already has mirroring enabled:
- Display current destination URL.
- "Update Destination" button opens the configure step pre-filled.
- "Disable Mirroring" button with a confirmation dialog.
- Config-as-code snippet showing the current configuration.

#### Feature Flag Gating

When the `integrations` feature flag is disabled:
- The GitHub Mirroring guide card does not appear on the Integrations page.
- Direct navigation to `/integrations/guides/github-mirror` redirects to the Integrations page or shows a "feature not available" message.

### API Shape

#### Get Mirror Guide State

**Endpoint**: `GET /api/integrations/guides/github-mirror/:owner/:repo`

Returns the current mirror configuration state for a repository.

**Request**:
- Method: `GET`
- Authentication: Session cookie or PAT (required)
- Path params: `owner` (string), `repo` (string)

**Success Response** (200):
```json
{
  "repository_id": 42,
  "owner": "acme",
  "name": "my-repo",
  "is_mirror": false,
  "mirror_destination": "",
  "is_archived": false,
  "has_admin_access": true
}
```

When mirroring is enabled:
```json
{
  "repository_id": 42,
  "owner": "acme",
  "name": "my-repo",
  "is_mirror": true,
  "mirror_destination": "https://github.com/acme/my-repo.git",
  "is_archived": false,
  "has_admin_access": true
}
```

**Error Responses**:

| Status | Condition | Body |
|--------|-----------|------|
| 401 | Not authenticated | `{ "error": "authentication required" }` |
| 403 | Feature flag disabled | `{ "error": "feature not available on your plan" }` |
| 404 | Repository not found | `{ "error": "repository not found" }` |

#### Test Mirror Connection

**Endpoint**: `POST /api/integrations/guides/github-mirror/:owner/:repo/test`

Tests connectivity to the GitHub destination.

**Request**:
```json
{
  "destination_url": "https://github.com/acme/my-repo.git",
  "pat": "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```

**Validation Rules**:
- `destination_url`: required, valid URL, `https://` only, max 2048 characters
- `pat`: required, 1–256 characters, no whitespace-only

**Success Response** (200):
```json
{
  "success": true,
  "message": "Connection to GitHub repository successful."
}
```

**Failure Response** (200, with `success: false`):
```json
{
  "success": false,
  "message": "Authentication failed. Check that your PAT has 'repo' scope and has not expired.",
  "error_code": "auth_failed"
}
```

Error codes: `auth_failed`, `not_found`, `network_error`, `timeout`, `invalid_url`, `self_mirror`.

**Error Responses**:

| Status | Condition | Body |
|--------|-----------|------|
| 400 | Invalid/missing fields | `{ "error": "<validation message>" }` |
| 401 | Not authenticated | `{ "error": "authentication required" }` |
| 403 | Not repo admin | `{ "error": "admin access required" }` |
| 404 | Repository not found | `{ "error": "repository not found" }` |

#### Save Mirror Configuration

**Endpoint**: `PUT /api/integrations/guides/github-mirror/:owner/:repo`

Saves the mirror configuration for a repository.

**Request**:
```json
{
  "destination_url": "https://github.com/acme/my-repo.git",
  "pat": "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```

**Success Response** (200):
```json
{
  "is_mirror": true,
  "mirror_destination": "https://github.com/acme/my-repo.git",
  "message": "Mirror configuration saved."
}
```

**Error Responses**:

| Status | Condition | Body |
|--------|-----------|------|
| 400 | Invalid/missing fields | `{ "error": "<validation message>" }` |
| 401 | Not authenticated | `{ "error": "authentication required" }` |
| 403 | Not repo admin | `{ "error": "admin access required" }` |
| 404 | Repository not found | `{ "error": "repository not found" }` |

#### Disable Mirror Configuration

**Endpoint**: `DELETE /api/integrations/guides/github-mirror/:owner/:repo`

Disables mirroring for a repository.

**Success Response** (200):
```json
{
  "is_mirror": false,
  "mirror_destination": "",
  "message": "Mirror configuration disabled."
}
```

### CLI Command

#### `codeplane extension github-mirror guide`

Opens an interactive CLI walkthrough that mirrors the web UI guide flow:

1. If not in a repository directory, prompts the user to select a repository (searchable list).
2. Displays prerequisites.
3. Prompts for destination URL with validation.
4. Prompts for GitHub PAT (masked input).
5. Runs a connection test.
6. Confirms and saves.
7. Displays the config-as-code snippet for reference.

#### `codeplane extension github-mirror status`

Shows the current mirror configuration for the current repository (or `--repo` flag):

```
Repository: acme/my-repo
Mirror:     enabled
Destination: https://github.com/acme/my-repo.git
```

Or:
```
Repository: acme/my-repo
Mirror:     not configured
```

#### `codeplane extension github-mirror enable --url <url> --pat <pat>`

Non-interactive configuration for CI/CD or scripting:

- `--url` (required): destination URL
- `--pat` (required): GitHub PAT (can also be read from stdin with `--pat-stdin`)
- `--repo` (optional): target repository in `owner/name` format (defaults to current directory)
- `--skip-test` (optional): skip the connectivity test
- Exits with code 0 on success, 1 on validation error, 2 on connectivity test failure.

#### `codeplane extension github-mirror disable`

Disables mirroring:

- `--repo` (optional): target repository
- `--yes` (optional): skip confirmation prompt

#### `codeplane extension github-mirror test --url <url> --pat <pat>`

Runs only the connectivity test without saving configuration:

- Same args as `enable`
- Exits with code 0 on success, 1 on failure.

### SDK Shape

The guide interacts with existing services and introduces a thin guide-specific helper:

```typescript
interface GitHubMirrorGuideService {
  getMirrorState(userId: number, owner: string, repo: string): Promise<MirrorGuideState>;
  testConnection(userId: number, owner: string, repo: string, destinationUrl: string, pat: string): Promise<ConnectionTestResult>;
  saveMirrorConfig(userId: number, owner: string, repo: string, destinationUrl: string, pat: string): Promise<MirrorConfigResult>;
  disableMirror(userId: number, owner: string, repo: string): Promise<void>;
}

interface MirrorGuideState {
  repositoryId: number;
  owner: string;
  name: string;
  isMirror: boolean;
  mirrorDestination: string;
  isArchived: boolean;
  hasAdminAccess: boolean;
}

interface ConnectionTestResult {
  success: boolean;
  message: string;
  errorCode?: string;
}

interface MirrorConfigResult {
  isMirror: boolean;
  mirrorDestination: string;
}
```

### TUI UI

No TUI changes are required for the initial guide implementation. The TUI does not currently have an integrations screen. When an integrations screen is added to the TUI, the GitHub Mirror guide should appear as a navigable entry.

### Documentation

The following user-facing documentation must be written:

1. **Integration Guide: GitHub Mirroring** — A dedicated docs page covering:
   - What mirroring does and when to use it
   - Prerequisites (GitHub account, PAT with `repo` scope, target repository)
   - Step-by-step setup via the web UI
   - Step-by-step setup via the CLI
   - Config-as-code setup via `.codeplane/config.yml`
   - Verifying mirroring is working
   - Updating the destination or credential
   - Disabling mirroring
   - Troubleshooting: auth failures, network errors, push conflicts, archived repos

2. **API Reference** — Reference entries for:
   - `GET /api/integrations/guides/github-mirror/:owner/:repo`
   - `POST /api/integrations/guides/github-mirror/:owner/:repo/test`
   - `PUT /api/integrations/guides/github-mirror/:owner/:repo`
   - `DELETE /api/integrations/guides/github-mirror/:owner/:repo`

3. **CLI Reference** — Reference entries for:
   - `codeplane extension github-mirror guide`
   - `codeplane extension github-mirror status`
   - `codeplane extension github-mirror enable`
   - `codeplane extension github-mirror disable`
   - `codeplane extension github-mirror test`

4. **Config-as-Code Reference** — Addition to the existing `.codeplane/config.yml` reference documenting the `repository.mirror` block with field descriptions and examples.

## Permissions & Security

### Authorization Roles

| Role | View Guide | Test Connection | Save Config | Disable Mirror | View Status |
|------|-----------|-----------------|-------------|----------------|-------------|
| Owner | Yes | Yes | Yes | Yes | Yes |
| Admin | Yes | Yes | Yes | Yes | Yes |
| Member (write) | Yes (read-only) | No | No | No | Yes |
| Member (read) | Yes (read-only) | No | No | No | Yes |
| Anonymous | No (401) | No (401) | No (401) | No (401) | No (401) |

**Key rules**:
- Only users with admin-level access to the repository can test connections, save mirror configuration, or disable mirroring.
- Any authenticated user can view the guide content (it is informational documentation).
- Any authenticated user with read access to the repository can view the current mirror status.
- Repository-level permissions are evaluated through the existing `userCanAdminRepo` pattern.

### Rate Limiting

| Endpoint | Per-User Limit | Global Limit | Burst | Notes |
|----------|---------------|--------------|-------|-------|
| GET guide state | 60/min | 600/min | 10/sec | Read-only, low cost |
| POST test connection | 10/min | 100/min | 3/sec | Makes outbound HTTP call |
| PUT save config | 10/min | 100/min | 3/sec | Write operation |
| DELETE disable | 10/min | 100/min | 3/sec | Write operation |

The test connection endpoint has a stricter rate limit because it makes outbound HTTP requests to GitHub, which could be used for SSRF-like probing if unthrottled.

### Data Privacy & PII

- The GitHub PAT is PII/credential data. It must be encrypted at rest using the same encryption used for repository secrets.
- The PAT must never appear in HTTP response bodies, log messages, or telemetry event properties.
- The destination URL may contain the owner/org name on GitHub, which is not PII but may be considered organizational metadata. It may appear in logs and telemetry.
- The test connection endpoint makes an outbound HTTPS request to the user-provided URL. The server must validate the URL is `https://` only and must not follow redirects to non-HTTPS destinations. The server must enforce a connection timeout (5 seconds) and read timeout (10 seconds) to prevent SSRF-style abuse.
- The server must not forward cookies, internal auth tokens, or any headers beyond what is needed for `git ls-remote` authentication when testing the connection.

## Telemetry & Product Analytics

### Business Events

| Event Name | When Fired | Properties |
|------------|------------|------------|
| `GitHubMirrorGuideViewed` | User opens the guide page or runs `guide` CLI command | `user_id`, `repository_id` (nullable), `client` (`web`, `cli`), `timestamp` |
| `GitHubMirrorConnectionTested` | User runs a connection test | `user_id`, `repository_id`, `success` (bool), `error_code` (nullable), `client`, `timestamp` |
| `GitHubMirrorConfigured` | Mirror config is saved for a repository | `user_id`, `repository_id`, `destination_domain` (e.g., `github.com`), `client`, `timestamp` |
| `GitHubMirrorDisabled` | Mirror config is disabled for a repository | `user_id`, `repository_id`, `client`, `timestamp` |
| `GitHubMirrorGuideConfigSnippetCopied` | User copies the config-as-code snippet | `user_id`, `repository_id`, `client`, `timestamp` |
| `GitHubMirrorGuideStepCompleted` | User completes a step in the wizard | `user_id`, `repository_id`, `step_name` (`prerequisites`, `select_repo`, `configure`, `confirm`), `client`, `timestamp` |
| `GitHubMirrorGuideAbandoned` | User navigates away before completing the wizard | `user_id`, `repository_id`, `last_step` (string), `client`, `timestamp` |

### Funnel Metrics & Success Indicators

The GitHub Mirror guide funnel:

1. **Guide Viewed** → `GitHubMirrorGuideViewed`
2. **Repository Selected** → `GitHubMirrorGuideStepCompleted` where `step_name = "select_repo"`
3. **Connection Tested** → `GitHubMirrorConnectionTested` where `success = true`
4. **Mirror Configured** → `GitHubMirrorConfigured`

**Key success indicators**:

- **Guide completion rate**: `GitHubMirrorConfigured` / `GitHubMirrorGuideViewed`. Target: >40% of users who open the guide complete the setup.
- **Connection test success rate**: `GitHubMirrorConnectionTested{success=true}` / `GitHubMirrorConnectionTested`. Target: >70%. A low rate indicates the guide's prerequisites section needs improvement.
- **Abandonment by step**: Breakdown of `GitHubMirrorGuideAbandoned` by `last_step`. If most users abandon at "configure", the form UX or credential instructions may need improvement.
- **Active mirrors**: Count of repositories where `is_mirror = true` and `mirror_destination` matches `github.com`. Target: growing week-over-week.
- **Mirror disable rate**: `GitHubMirrorDisabled` / `GitHubMirrorConfigured` (trailing 30 days). A high disable rate (>30%) may indicate the feature is not meeting expectations.
- **Client distribution**: Breakdown of `GitHubMirrorConfigured` by `client`. Indicates whether users prefer UI or CLI setup.

## Observability

### Logging Requirements

| Log Event | Level | Structured Fields | When |
|-----------|-------|-------------------|------|
| Mirror guide state loaded | `DEBUG` | `user_id`, `request_id`, `repo_id`, `is_mirror` | GET guide state returns 200 |
| Mirror connection test started | `INFO` | `user_id`, `request_id`, `repo_id`, `destination_domain` | POST test begins |
| Mirror connection test completed | `INFO` | `user_id`, `request_id`, `repo_id`, `destination_domain`, `success`, `error_code`, `duration_ms` | POST test completes |
| Mirror connection test timeout | `WARN` | `user_id`, `request_id`, `repo_id`, `destination_domain`, `timeout_ms` | Outbound connection times out |
| Mirror config saved | `INFO` | `user_id`, `request_id`, `repo_id`, `destination_domain` | PUT save succeeds |
| Mirror config disabled | `INFO` | `user_id`, `request_id`, `repo_id` | DELETE succeeds |
| Mirror guide unauthorized | `WARN` | `request_id`, `remote_addr` | 401 returned |
| Mirror guide forbidden (not admin) | `WARN` | `user_id`, `request_id`, `repo_id` | 403 returned for non-admin |
| Mirror guide forbidden (feature gated) | `INFO` | `user_id`, `request_id`, `flag_name` | 403 returned for feature flag |
| Mirror guide unexpected error | `ERROR` | `user_id`, `request_id`, `repo_id`, `error_message`, `error_type`, `stack_trace` | 500 returned |
| Mirror config validation failed | `DEBUG` | `user_id`, `request_id`, `repo_id`, `validation_error` | 400 returned for invalid input |

**Log rules**:
- Never log the PAT value, even partially.
- Never log the full destination URL in `ERROR` or `WARN` logs — use `destination_domain` only.
- Always include `request_id` for correlation.
- Connection test logs must include `duration_ms` for performance analysis.

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_github_mirror_guide_requests_total` | Counter | `endpoint` (`state`, `test`, `save`, `disable`), `status` (`success`, `unauthorized`, `forbidden`, `not_found`, `validation_error`, `error`) | Total requests to guide endpoints |
| `codeplane_github_mirror_guide_request_duration_seconds` | Histogram | `endpoint` | Request duration for guide endpoints |
| `codeplane_github_mirror_connection_test_total` | Counter | `result` (`success`, `auth_failed`, `not_found`, `network_error`, `timeout`, `self_mirror`, `invalid_url`) | Connection test outcomes |
| `codeplane_github_mirror_connection_test_duration_seconds` | Histogram | — | Duration of outbound connection tests |
| `codeplane_github_mirror_configs_total` | Gauge | — | Total number of repositories with `is_mirror = true` (polled or event-driven) |
| `codeplane_github_mirror_config_changes_total` | Counter | `action` (`enable`, `disable`, `update`) | Mirror config change events |

### Alerts

#### Alert: `GitHubMirrorGuideUnexpectedErrors`
- **Condition**: `increase(codeplane_github_mirror_guide_requests_total{status="error"}[1h]) > 5`
- **Severity**: Warning
- **Runbook**:
  1. Check server logs for `Mirror guide unexpected error` entries in the last hour. Filter by `request_id`.
  2. Identify the error type from `error_type` and `stack_trace` fields.
  3. Check recent deployments for changes to the integrations route file, repo service, or secret service.
  4. Verify the database is healthy — the guide reads from the `repositories` table and writes to `repository_secrets`.
  5. If errors are in the connection test path, check whether outbound HTTPS connectivity from the server is working (`curl -I https://github.com` from the server).
  6. If errors are intermittent and correlated with a specific repository, investigate that repository's state in the database.
  7. If caused by a code regression, roll back the deployment.

#### Alert: `GitHubMirrorConnectionTestHighFailureRate`
- **Condition**: `rate(codeplane_github_mirror_connection_test_total{result!="success"}[15m]) / rate(codeplane_github_mirror_connection_test_total[15m]) > 0.9` (>90% failure rate over 15 minutes, with at least 5 tests in the window)
- **Severity**: Info
- **Runbook**:
  1. A high connection test failure rate may indicate GitHub API/git transport issues rather than a Codeplane bug.
  2. Check `result` label distribution. If mostly `auth_failed`, users may be using incorrect PATs — no server action needed.
  3. If mostly `network_error` or `timeout`, check outbound connectivity: `curl -I https://github.com` from the server.
  4. Check GitHub's status page (https://www.githubstatus.com/) for ongoing incidents.
  5. If connectivity is fine from the server but tests fail, check whether a proxy or firewall is blocking outbound git traffic.
  6. If the issue persists for >1 hour and is not a GitHub outage, escalate to the networking team.

#### Alert: `GitHubMirrorConnectionTestLatencyHigh`
- **Condition**: `histogram_quantile(0.95, rate(codeplane_github_mirror_connection_test_duration_seconds_bucket[10m])) > 8`
- **Severity**: Warning
- **Runbook**:
  1. Connection tests should complete in under 10 seconds (the configured timeout). A p95 above 8 seconds indicates degraded outbound connectivity.
  2. Check the server's network path to github.com: `traceroute github.com`, `curl -w "@curl-format" https://github.com`.
  3. Check if the server is under heavy outbound connection load (too many concurrent tests).
  4. If the issue is isolated to a few users, their destination URLs may be unreachable or slow — no server action needed.
  5. If systemic, check DNS resolution latency and consider adding a DNS cache.

#### Alert: `GitHubMirrorGuideHighRateLimitRate`
- **Condition**: `increase(codeplane_github_mirror_guide_requests_total{status="rate_limited"}[5m]) > 50`
- **Severity**: Info
- **Runbook**:
  1. A spike in rate-limited requests suggests automated probing or a runaway client.
  2. Identify the user(s) being rate-limited from server logs (filter by `429` responses on guide endpoints).
  3. If a single user, check whether they have a script or CI job hitting the guide endpoints in a loop — contact the user.
  4. If distributed across many users, check if a frontend bug is causing excessive polling.
  5. No immediate action required unless rate limiting is not working (requests are getting through).

### Error Cases & Failure Modes

| Failure Mode | HTTP Status | User-Facing Message | Internal Log Level | Likelihood |
|-------------|-------------|---------------------|--------------------|------------|
| Not authenticated | 401 | "authentication required" | WARN | Normal |
| Feature flag disabled | 403 | "feature not available on your plan" | INFO | Rare in CE |
| Not repo admin | 403 | "admin access required" | WARN | Normal |
| Repository not found | 404 | "repository not found" | DEBUG | Normal |
| Invalid destination URL | 400 | "destination_url must be a valid HTTPS URL" | DEBUG | Normal |
| Destination URL too long | 400 | "destination_url must not exceed 2048 characters" | DEBUG | Rare |
| Empty PAT | 400 | "pat is required" | DEBUG | Normal |
| PAT too long | 400 | "pat must not exceed 256 characters" | DEBUG | Rare |
| Self-mirror detected | 400 | "mirror destination cannot be the same as the source repository" | DEBUG | Rare |
| Connection test: auth failure | 200 (success: false) | "Authentication failed. Check that your PAT has 'repo' scope and has not expired." | INFO | Normal |
| Connection test: 404 | 200 (success: false) | "Repository not found on GitHub. Verify the URL and that your PAT has access." | INFO | Normal |
| Connection test: network error | 200 (success: false) | "Could not reach the destination. Check the URL and your network connectivity." | WARN | Occasional |
| Connection test: timeout | 200 (success: false) | "Connection timed out after 10 seconds." | WARN | Occasional |
| Database write failure | 500 | "internal server error" | ERROR | Rare |
| Secret encryption failure | 500 | "internal server error" | ERROR | Rare |
| Rate limit exceeded | 429 | "rate limit exceeded" | WARN | Rare |
| Archived repository | 200 (with warning) | (guide displays warning about archived repos) | DEBUG | Rare |

## Verification

### API Integration Tests

1. **GET guide state — authenticated, mirror not configured**: Authenticate as admin. GET guide state for a repository. Assert 200 with `is_mirror: false`, `mirror_destination: ""`, `has_admin_access: true`.

2. **GET guide state — authenticated, mirror configured**: Configure mirroring for a repository. GET guide state. Assert 200 with `is_mirror: true`, `mirror_destination` matching the configured URL.

3. **GET guide state — unauthenticated**: GET guide state without auth. Assert 401 with `{ "error": "authentication required" }`.

4. **GET guide state — non-existent repository**: GET guide state for `nonexistent-owner/nonexistent-repo`. Assert 404.

5. **GET guide state — member (non-admin)**: Authenticate as a member with read access. GET guide state. Assert 200 with `has_admin_access: false`.

6. **GET guide state — feature flag disabled**: Disable `integrations` feature flag. GET guide state with auth. Assert 403 with feature-gated error or 404.

7. **GET guide state — archived repository**: Archive a repository. GET guide state. Assert 200 with `is_archived: true`.

8. **POST test connection — valid GitHub URL and PAT**: Authenticate as admin. POST test with a valid GitHub repo URL and valid PAT (use a test fixture or mock). Assert 200 with `success: true`.

9. **POST test connection — invalid PAT**: POST test with a valid URL and an invalid PAT. Assert 200 with `success: false`, `error_code: "auth_failed"`.

10. **POST test connection — non-existent GitHub repo**: POST test with a valid PAT and a URL pointing to a non-existent repo. Assert 200 with `success: false`, `error_code: "not_found"`.

11. **POST test connection — empty destination URL**: POST test with `destination_url: ""`. Assert 400.

12. **POST test connection — HTTP (not HTTPS) URL**: POST test with `destination_url: "http://github.com/acme/repo"`. Assert 400 with validation error about HTTPS.

13. **POST test connection — URL exceeding 2048 characters**: POST test with a 2049-character URL. Assert 400.

14. **POST test connection — URL at exactly 2048 characters**: POST test with a 2048-character valid HTTPS URL. Assert 200 (or valid test result, not a 400).

15. **POST test connection — empty PAT**: POST test with `pat: ""`. Assert 400.

16. **POST test connection — PAT exceeding 256 characters**: POST test with a 257-character PAT. Assert 400.

17. **POST test connection — PAT at exactly 256 characters**: POST test with a 256-character PAT. Assert 200 (not a 400 — validation passes, connection test runs).

18. **POST test connection — whitespace-only PAT**: POST test with `pat: "   "`. Assert 400.

19. **POST test connection — whitespace-only URL**: POST test with `destination_url: "   "`. Assert 400.

20. **POST test connection — self-mirror URL**: POST test with a destination URL identical to the repository's own clone URL. Assert 400 or 200 with `error_code: "self_mirror"`.

21. **POST test connection — non-GitHub URL accepted with warning**: POST test with `destination_url: "https://gitlab.com/acme/repo"` and valid credential. Assert the request is accepted (not rejected), but the response may include a warning.

22. **POST test connection — unauthenticated**: POST test without auth. Assert 401.

23. **POST test connection — non-admin user**: Authenticate as a read-only member. POST test. Assert 403.

24. **POST test connection — rate limiting**: Send 11 test requests in 1 minute. Assert that the 11th returns 429.

25. **PUT save mirror config — valid input**: Authenticate as admin. PUT with valid URL and PAT. Assert 200 with `is_mirror: true` and correct `mirror_destination`.

26. **PUT save mirror config — verify database state**: After saving, query the repository record. Assert `is_mirror = true` and `mirror_destination` matches the URL.

27. **PUT save mirror config — verify secret stored**: After saving, verify a repository secret with the mirror credential name exists (via secrets API or DB).

28. **PUT save mirror config — PAT not in response**: After saving, assert the response body does not contain the PAT string.

29. **PUT save mirror config — empty URL**: PUT with `destination_url: ""`. Assert 400.

30. **PUT save mirror config — empty PAT**: PUT with `pat: ""`. Assert 400.

31. **PUT save mirror config — unauthenticated**: PUT without auth. Assert 401.

32. **PUT save mirror config — non-admin**: Authenticate as member. PUT. Assert 403.

33. **PUT save mirror config — overwrite existing config**: Configure mirroring once. PUT again with a different URL. Assert 200 and the destination is updated.

34. **PUT save mirror config — non-existent repository**: PUT for a non-existent repo. Assert 404.

35. **DELETE disable mirror — configured repo**: Configure mirroring. DELETE. Assert 200 with `is_mirror: false`.

36. **DELETE disable mirror — verify database state**: After disabling, query the repository record. Assert `is_mirror = false` and `mirror_destination = ""`.

37. **DELETE disable mirror — not configured**: DELETE on a repository that has no mirror configured. Assert 200 (idempotent — returns `is_mirror: false`).

38. **DELETE disable mirror — unauthenticated**: DELETE without auth. Assert 401.

39. **DELETE disable mirror — non-admin**: Authenticate as member. DELETE. Assert 403.

40. **DELETE disable mirror — secret not deleted**: After disabling, verify the mirror credential secret still exists (the user must remove it separately).

41. **Content-Type headers**: Assert all 200/400/401/403/404 responses include `Content-Type: application/json`.

42. **X-Request-Id headers**: Assert all responses include the `X-Request-Id` header.

43. **Concurrent saves**: Send 3 simultaneous PUT requests for the same repository with different destination URLs. Assert all complete without error and the final state is deterministic (last-write-wins).

44. **Feature flag disabled — save endpoint**: Disable `integrations` flag. PUT save. Assert 403 or 404.

45. **Feature flag disabled — test endpoint**: Disable `integrations` flag. POST test. Assert 403 or 404.

46. **Feature flag disabled — disable endpoint**: Disable `integrations` flag. DELETE. Assert 403 or 404.

### E2E Tests (Playwright)

47. **Integrations page shows GitHub Mirror guide card**: Sign in. Navigate to `/integrations`. Assert a card with text "GitHub Mirroring" is visible.

48. **Guide card navigates to guide page**: Click the GitHub Mirroring guide card. Assert navigation to `/integrations/guides/github-mirror` or equivalent.

49. **Guide page displays prerequisites step**: Assert the guide page shows prerequisites text mentioning GitHub PAT and repository.

50. **Repository selection step works**: On the guide page (no repo context), assert a repository dropdown is shown. Select a repository. Assert the "Next" button becomes active.

51. **Destination URL validation — empty rejects**: Enter empty URL. Click "Next" or "Test Connection". Assert a validation error is displayed.

52. **Destination URL validation — HTTP rejects**: Enter `http://github.com/acme/repo`. Assert a validation error about HTTPS.

53. **PAT field is masked**: Assert the PAT input field has `type="password"`.

54. **Test connection — success path**: Enter a valid destination URL and PAT (mock or test fixture). Click "Test Connection". Assert a success indicator appears.

55. **Test connection — failure path**: Enter an invalid PAT. Click "Test Connection". Assert an error message is displayed with actionable guidance.

56. **Save configuration — success**: Complete the wizard and click "Enable Mirroring". Assert a success message is shown.

57. **Config snippet is displayed**: On the confirm step, assert a code block with `.codeplane/config.yml` content is visible.

58. **Config snippet copy button**: Assert a "Copy" button exists next to the snippet. Click it. Assert clipboard content (or button state changes to "Copied").

59. **Already configured state**: Configure mirroring for a repository. Return to the guide. Assert it shows the current destination and "Disable" button instead of the setup wizard.

60. **Disable mirroring from guide**: On the already-configured state, click "Disable Mirroring". Confirm the dialog. Assert success and the guide returns to the unconfigured state.

61. **Repository settings shows mirror status**: Navigate to `/:owner/:repo/settings`. Assert a mirroring section is visible showing the configured destination.

62. **Non-admin sees read-only guide**: Sign in as a non-admin member. Navigate to the guide for a repository. Assert the setup form is disabled with a message about admin access.

63. **Guide hidden when feature flag disabled**: Disable `integrations` feature flag. Navigate to `/integrations`. Assert the GitHub Mirroring card is not visible.

64. **Guide page requires authentication**: Sign out. Navigate to `/integrations/guides/github-mirror`. Assert redirect to login.

### CLI Tests

65. **`codeplane extension github-mirror status` — not configured**: Run in a repo without mirroring. Assert output contains "not configured". Assert exit code 0.

66. **`codeplane extension github-mirror status` — configured**: Configure mirroring. Run status. Assert output contains "enabled" and the destination URL. Assert exit code 0.

67. **`codeplane extension github-mirror enable` — valid args**: Run `enable --url https://github.com/acme/repo.git --pat ghp_test123 --skip-test`. Assert exit code 0. Assert output confirms mirroring enabled.

68. **`codeplane extension github-mirror enable` — missing URL**: Run `enable --pat ghp_test123`. Assert exit code 1. Assert stderr contains error about missing URL.

69. **`codeplane extension github-mirror enable` — missing PAT**: Run `enable --url https://github.com/acme/repo.git`. Assert exit code 1. Assert stderr contains error about missing PAT.

70. **`codeplane extension github-mirror enable` — invalid URL**: Run `enable --url "not-a-url" --pat ghp_test123`. Assert exit code 1. Assert stderr contains URL validation error.

71. **`codeplane extension github-mirror enable` — HTTP URL rejected**: Run `enable --url "http://github.com/acme/repo" --pat ghp_test123`. Assert exit code 1.

72. **`codeplane extension github-mirror enable` — PAT from stdin**: Run `echo "ghp_test123" | codeplane extension github-mirror enable --url https://github.com/acme/repo.git --pat-stdin`. Assert exit code 0.

73. **`codeplane extension github-mirror disable` — configured repo**: Configure mirroring. Run `disable --yes`. Assert exit code 0. Assert output confirms disabled.

74. **`codeplane extension github-mirror disable` — not configured repo**: Run `disable --yes` on unconfigured repo. Assert exit code 0 (idempotent).

75. **`codeplane extension github-mirror test` — valid**: Run `test --url https://github.com/acme/repo.git --pat ghp_valid` (mock/fixture). Assert exit code 0.

76. **`codeplane extension github-mirror test` — invalid PAT**: Run `test --url https://github.com/acme/repo.git --pat ghp_invalid`. Assert exit code 1. Assert stderr contains auth failure message.

77. **`codeplane extension github-mirror enable` — unauthenticated**: Run without auth token. Assert exit code non-zero. Assert stderr contains auth error.

78. **`codeplane extension github-mirror enable` — non-admin**: Authenticate as member. Run enable. Assert exit code non-zero. Assert stderr contains permission error.

79. **`codeplane extension github-mirror status --repo owner/name`**: Run with explicit `--repo` flag. Assert correct repository is queried.

80. **`codeplane api get /api/integrations/guides/github-mirror/:owner/:repo`**: Run the generic API command. Assert it returns the guide state JSON.
