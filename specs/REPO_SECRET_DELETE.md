# REPO_SECRET_DELETE

Specification for REPO_SECRET_DELETE.

## High-Level User POV

As a repository administrator, I want to delete a repository secret so that outdated or compromised credentials are removed from my repository's secret store and no longer available to workflows or workspace environments.

## Acceptance Criteria

1. DELETE /api/v1/repos/:owner/:repo/secrets/:secretName removes the named secret from the repository.
2. Returns 204 No Content on successful deletion.
3. Returns 404 if the secret does not exist.
4. Returns 403 if the authenticated user lacks write/admin access to the repository.
5. Returns 401 if no valid authentication is provided.
6. The secret is permanently removed and no longer injected into workflow runs or workspace sessions.
7. Webhook delivery fires a repository secret deleted event if webhooks are configured.

## Design

The endpoint is defined in apps/server/src/routes/secrets.ts. The route handler calls resolveRepoId (lines 61-71) to validate the :owner/:repo path and confirm the caller has repository access via RepoService.getRepo(). It then delegates to SecretService.deleteSecret() in packages/sdk/src/services/secret.ts which performs the database deletion. The route is mounted under the secrets route family in the server's route tree. Request flow: HTTP DELETE → auth middleware → resolveRepoId → SecretService.deleteSecret → 204 response.

## Permissions & Security

Requires authenticated user (session cookie, PAT, or OAuth2 token) with write or admin access to the target repository. Deploy keys with write scope are also accepted. Organization owners inherit access. resolveRepoId enforces repository-level authorization by calling RepoService.getRepo() which checks ownership and collaboration permissions.

## Telemetry & Product Analytics

Structured request logging via the middleware stack captures request ID, method, path, status code, and latency. Secret deletion events should be recorded in the audit log for admin visibility. No secret values are logged at any point in the pipeline.

## Observability

HTTP request metrics (status codes, latency) are captured by the standard middleware. Failed authorization attempts surface as 401/403 responses in access logs. Database errors propagate as 500 responses with structured error payloads. Admin audit views (Section 8.13 of PRD) provide visibility into secret lifecycle operations.

## Verification

1. Unit test: SecretService.deleteSecret removes the secret record and returns success.
2. Unit test: SecretService.deleteSecret returns not-found error for nonexistent secret names.
3. Integration test: DELETE /api/v1/repos/:owner/:repo/secrets/:secretName with valid admin auth returns 204.
4. Integration test: DELETE with read-only user returns 403.
5. Integration test: DELETE with no auth returns 401.
6. Integration test: DELETE for nonexistent secret returns 404.
7. Integration test: After deletion, GET /secrets no longer includes the deleted secret.
8. Integration test: Workflow runs after deletion do not receive the deleted secret as an environment variable.
