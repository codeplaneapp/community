# LANDING_PREVIEW_PROXY_ROUTING

Specification for LANDING_PREVIEW_PROXY_ROUTING.

## High-Level User POV

When you create a preview environment for a landing request in Codeplane, you expect to be able to access it through a stable, human-readable URL — and you expect that access to just work. The **Landing Preview Proxy Routing** feature is the invisible infrastructure that makes this happen. It takes incoming HTTP requests aimed at a preview URL, figures out which landing request's preview container they belong to, and routes them transparently to the right running container — all without the user needing to know anything about port mappings, container IDs, or host addresses.

In **Cloud mode**, your preview URL looks like `https://42-my-app.preview.codeplane.app`. Any request to that hostname is automatically routed to the correct preview container. In **Community Edition (self-hosted) mode**, preview access works through a path-based URL like `http://localhost:3000/_preview/alice/my-app/landings/42/`, and the same transparent routing applies. Either way, you just click the link and see your running preview.

The proxy also handles lifecycle transitions seamlessly. If a preview has been suspended due to inactivity, the first request to its URL automatically wakes the container, waits for it to become healthy, and then serves the response — no manual intervention needed. Subsequent requests reset the idle timer so the preview stays alive as long as someone is actively using it. If the preview is stopped, failed, or deleted, the proxy returns a clear, user-friendly error page explaining the situation and linking back to the landing request.

For reviewers, this means one-click access to a live, running version of the changes under review. For authors, it means their preview URL is always reachable. For platform engineers, it means the proxy handles routing, lifecycle management, and error presentation without manual configuration. The preview URL you see in the landing request detail page is the only thing you need — click it, and the proxy does the rest.

## Acceptance Criteria

### Definition of Done

The feature is complete when every HTTP request to a valid preview URL — whether host-based (cloud) or path-based (CE) — is transparently proxied to the correct preview container, with automatic wake-on-access for suspended previews, appropriate error responses for non-running previews, and full observability into proxy behavior. The proxy must be mounted as middleware in the Hono server entry point, must not require authentication for preview access (URLs are opaque and only discoverable through authenticated API endpoints), and must work with both Docker and Podman container runtimes.

### Core Requirements

- [ ] A Hono middleware (`previewProxy`) is mounted in `apps/server/src/index.ts` **before** the normal route modules but **after** the request ID, logging, and CORS middleware.
- [ ] The middleware does **not** run through the auth middleware — preview URLs are unauthenticated HTTP endpoints.
- [ ] The middleware does **not** run through the JSON content-type enforcement middleware — proxied requests carry arbitrary content types from the preview container.
- [ ] In **cloud mode** (when `CODEPLANE_PREVIEW_DOMAIN` is set), the middleware intercepts requests where the `Host` header matches the pattern `{number}-{repo}.{CODEPLANE_PREVIEW_DOMAIN}` and proxies them to the resolved container.
- [ ] In **CE mode** (when `CODEPLANE_PREVIEW_DOMAIN` is empty), the middleware intercepts requests where the URL path starts with `/_preview/:owner/:repo/landings/:number/` and proxies them to the resolved container, stripping the prefix from the forwarded request path.
- [ ] The middleware calls `PreviewService.recordAccess()` on every successfully proxied request, which resets the idle timer and triggers wake-on-access for suspended previews.
- [ ] When a suspended preview is accessed, the middleware waits for the container to resume and become healthy before proxying the request. The maximum wait time is 30 seconds.
- [ ] If the wake wait times out (>30 seconds), the middleware returns a 504 Gateway Timeout with a user-friendly HTML error page.
- [ ] If no preview is found for the incoming host or path, the middleware passes the request through to the normal Hono route stack (it does **not** return a 404 itself).
- [ ] If a preview exists but is in `stopped` or `failed` status, the middleware returns a 502 Bad Gateway with a user-friendly HTML error page explaining the preview is unavailable.
- [ ] The proxy forwards the full request (method, headers, body) to `http://{host}:{port}{path}` where host and port come from `PreviewService.getProxyTarget()`.
- [ ] The proxy streams the response back to the client, preserving status code, headers, and body.
- [ ] The proxy sets the `X-Codeplane-Preview` response header with the value `{owner}/{repo}#LR-{number}` on every proxied response.
- [ ] The proxy sets the `X-Forwarded-For`, `X-Forwarded-Host`, and `X-Forwarded-Proto` headers on the upstream request.
- [ ] The proxy does **not** modify `Set-Cookie` headers from the upstream container.
- [ ] WebSocket upgrade requests to preview URLs are proxied transparently (for HMR / live-reload support in development previews).

### Edge Cases and Boundary Constraints

- [ ] If the `Host` header contains only the preview domain without a subdomain prefix (e.g., bare `preview.codeplane.app`), the middleware must pass through to the normal route stack, not error.
- [ ] If the host prefix does not contain a dash (e.g., `foo.preview.codeplane.app`), the middleware must pass through — the prefix must be `{number}-{repo}`.
- [ ] If the LR number portion of the host prefix is not a valid positive integer (e.g., `abc-repo.preview.codeplane.app` or `0-repo.preview.codeplane.app`), the middleware must pass through.
- [ ] If multiple previews share the same repo name but different owners (possible in multi-user environments), the host-based lookup must match on both `repoName` and `lrNumber`. In CE path-based mode, the owner is part of the path and disambiguates.
- [ ] If the upstream container responds with a redirect (3xx), the proxy must rewrite `Location` headers to use the preview URL domain/path, not the internal `localhost:{port}` address.
- [ ] If the upstream container is unreachable (connection refused, DNS failure), the proxy must return a 502 with a user-friendly error page, not a raw TCP error.
- [ ] If the upstream container responds but the response stream is interrupted mid-transfer, the proxy must close the client connection cleanly.
- [ ] The CE path-based prefix `/_preview/` must be stripped before forwarding. A request to `/_preview/alice/my-app/landings/42/api/data` must be forwarded as `/api/data` to the upstream container.
- [ ] Preview domain matching must be case-insensitive for the domain portion but preserve the case of the repo name in the subdomain for lookup.
- [ ] The proxy must handle requests with bodies up to 50 MB (sufficient for file uploads in preview applications). Requests exceeding 50 MB must receive a 413 Payload Too Large response.
- [ ] The proxy must enforce a 60-second timeout for upstream response headers. If the upstream does not begin responding within 60 seconds, return 504.
- [ ] The proxy must handle chunked transfer encoding from the upstream container correctly.
- [ ] If the same preview URL receives more than 500 requests per minute from a single IP address, the proxy should return 429 Too Many Requests with a `Retry-After` header. This rate limit is separate from the API rate limiter.
- [ ] An empty request body is valid and must be forwarded (e.g., GET requests, DELETE requests).
- [ ] The proxy must not buffer the entire upstream response in memory — it must stream the response body.

## Design

### Middleware Architecture

The `previewProxy` middleware is a Hono middleware function that is mounted in the server entry point at a specific position in the middleware stack:

1. `requestId` — so proxied requests get request IDs for tracing
2. `logger()` — so proxied requests are logged
3. `cors()` — so cross-origin preview access works from the Codeplane web UI
4. **`previewProxy`** — intercepts preview requests before they reach rate limiting, auth, or route handlers
5. `rateLimit(120)` — only applies to non-preview API requests
6. `jsonContentType` — only applies to non-preview API requests
7. `authLoader` — only applies to non-preview API requests

This ordering ensures that preview requests bypass authentication, rate limiting (the proxy has its own rate limiter), and JSON content-type enforcement, while still receiving request IDs, logging, and CORS headers.

### Web UI Design

#### Error Pages

When the proxy cannot serve a preview request, it renders a minimal, branded HTML error page instead of raw JSON. These pages must:

- Display the Codeplane logo.
- Explain the error in plain language.
- Include a "Back to Landing Request" link that navigates to `/{owner}/{repo}/landings/{number}` on the main Codeplane web UI.
- Include a footer with "Powered by Codeplane".

**Error page variants:**

| HTTP Status | Title | Body Text |
|-------------|-------|-----------|
| 502 | "Preview Unavailable" | "The preview environment for this landing request is not running. It may have been stopped or encountered an error. Return to the landing request to check the status or restart the preview." |
| 504 | "Preview Starting Up" | "The preview environment is resuming from suspension. This is taking longer than expected. Please try again in a few seconds, or return to the landing request to check the status." |
| 413 | "Request Too Large" | "The request body exceeds the maximum allowed size for preview environments (50 MB)." |
| 429 | "Too Many Requests" | "This preview is receiving too many requests. Please wait a moment before trying again." |

#### Preview URL Copy and Open Behavior

The web UI landing request detail page already shows the preview URL (per LANDING_PREVIEW_STATUS spec). When the user clicks this URL:
- Cloud mode: The URL opens directly in a new tab (`target="_blank"`, `rel="noopener"`).
- CE mode: The path-based URL opens in a new tab. The proxy middleware handles path rewriting transparently.

### API Shape

The proxy routing feature does not add new API endpoints. It adds a middleware layer that intercepts requests **before** they reach the API router. The following internal service methods are consumed by the middleware:

**PreviewService methods used by the proxy:**

| Method | Purpose |
|--------|--------|
| `resolvePreviewByHost(host)` | Cloud mode: resolve a Host header to a PreviewRecord |
| `resolvePreviewByRepo(owner, repo, lrNumber)` | CE mode: resolve path params to a PreviewRecord |
| `recordAccess(repositoryId, lrNumber)` | Reset idle timer, wake suspended previews |
| `getProxyTarget(repositoryId, lrNumber)` | Get `{host, port}` for upstream forwarding |

**New method required on PreviewService:**

| Method | Signature | Purpose |
|--------|-----------|--------|
| `waitForReady` | `waitForReady(repositoryId: number, lrNumber: number, timeoutMs?: number): Promise<boolean>` | After waking a suspended preview, poll the container healthcheck until it passes or the timeout expires. Returns true if ready, false if timeout. Default timeout: 30000ms. |

### SDK Shape

The `previewProxy` middleware function is exported from `apps/server/src/lib/preview-proxy.ts` and imported by the server entry point:

```typescript
/**
 * Create a Hono middleware that proxies requests to preview environments.
 *
 * @param previewService - The PreviewService instance
 * @param options - Configuration options
 */
function createPreviewProxy(
  previewService: PreviewService,
  options: {
    /** Preview domain for cloud mode host-based routing. */
    previewDomain: string;
    /** Max request body size in bytes. Default: 50 * 1024 * 1024 (50 MB). */
    maxBodySize?: number;
    /** Upstream response header timeout in ms. Default: 60000. */
    upstreamTimeoutMs?: number;
    /** Wake-from-suspend timeout in ms. Default: 30000. */
    wakeTimeoutMs?: number;
    /** Per-IP rate limit for preview requests per minute. Default: 500. */
    rateLimitPerMinute?: number;
    /** Base URL for error page "back to LR" links. */
    codeplaneBaseUrl?: string;
  }
): MiddlewareHandler;
```

### CLI Command

No new CLI commands are needed. The CLI's `land preview-status` command (from LANDING_PREVIEW_STATUS spec) already surfaces the preview URL. Users copy/open that URL, and the proxy handles routing.

However, the CLI `land view` output should clarify the preview access mode:

```
Landing Request #42 — "Add dark mode support"
  ...
  Preview:       running — https://42-my-app.preview.codeplane.app  (proxied)
```

In CE mode:
```
Landing Request #42 — "Add dark mode support"
  ...
  Preview:       running — http://localhost:3000/_preview/alice/my-app/landings/42/  (proxied)
```

### Documentation

1. **Guide: "Preview Environment Proxy Routing"** — Explain how preview URLs work in both cloud and CE modes, how wake-on-access works, what error pages mean, and how to troubleshoot common proxy issues (502, 504).

2. **Admin Guide: "Configuring Preview Routing"** — Document the environment variables that control proxy behavior:
   - `CODEPLANE_PREVIEW_DOMAIN` — set to enable cloud-mode host-based routing
   - `CODEPLANE_PREVIEW_HOST` — the host address for CE-mode upstream connections
   - `CODEPLANE_BASE_URL` — used to generate "back to LR" links on error pages

3. **FAQ entry: "Why do I see a '502 Preview Unavailable' page?"** — Explain that the preview container may have failed or been stopped, and link to the landing request detail page to check status or restart.

4. **FAQ entry: "Why is my preview slow to load after being idle?"** — Explain the 15-minute auto-suspend, the wake-on-access mechanism, and the 30-second maximum wake timeout.

## Permissions & Security

### Authorization Roles

| Action | Owner | Admin | Write | Read | Anonymous |
|--------|-------|-------|-------|------|-----------|
| Access preview via proxy URL | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create preview (POST API) | ✅ | ✅ | ✅ | ❌ | ❌ |
| Delete preview (DELETE API) | ✅ | ✅ | ❌ | ❌ | ❌ |

**Important security notes:**

- Preview URLs accessed through the proxy are **unauthenticated**. The security model relies on URL opacity — preview URLs contain a landing request number and repository name, but are only discoverable through authenticated Codeplane API endpoints (GET preview status, landing request detail views, etc.).
- This is intentional: preview environments serve web applications that may load assets, make API calls, and need to function without Codeplane session cookies.
- Preview URLs must not be guessable. While the current URL format includes sequential LR numbers and repo names, the actual container port is ephemeral and the path-based prefix is non-obvious. For higher security requirements, a future enhancement could add a random token to the URL.
- The proxy must not forward Codeplane authentication cookies or headers to the upstream container. Specifically, `Cookie: codeplane_session` and `Authorization: token codeplane_*` headers must be stripped before forwarding.
- The upstream container runs in a network-isolated sandbox. It cannot access the Codeplane API server's internal services directly.

### Rate Limiting

| Scope | Limit | Window | Response |
|-------|-------|--------|----------|
| Per IP to any preview URL | 500 requests | 1 minute | 429 with `Retry-After` header |
| Per IP to a single preview (identified by repo+LR) | 200 requests | 1 minute | 429 with `Retry-After` header |

- Rate limiting is separate from the main API rate limiter because preview requests bypass the auth middleware.
- Rate limit state is stored in the same in-memory store pattern used by the main API rate limiter.
- Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) are included on all proxied responses.

### Data Privacy

- The proxy does not log request or response bodies.
- The proxy logs the request path, method, response status, and latency at INFO level. The `Host` header is logged for cloud-mode requests.
- Container IDs and host ports are logged at DEBUG level only.
- The `X-Codeplane-Preview` response header exposes the repository owner, repo name, and LR number. This is acceptable because the user already knows the URL (which contains the same information).
- The proxy does not inject tracking scripts, analytics beacons, or any content into proxied responses.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `PreviewProxyRequestServed` | A request is successfully proxied to an upstream preview container | `repository_id`, `lr_number`, `repo_owner`, `repo_name`, `routing_mode` (host/path), `response_status`, `latency_ms`, `request_method`, `was_wake` (boolean) |
| `PreviewProxyWakeTriggered` | A request triggers a wake from suspended state | `repository_id`, `lr_number`, `wake_duration_ms`, `wake_success` (boolean) |
| `PreviewProxyErrorServed` | The proxy returns an error page (502, 504, 413, 429) | `repository_id`, `lr_number`, `error_status`, `error_reason`, `routing_mode` |
| `PreviewProxyPassthrough` | A request matched the preview domain/path pattern but no preview was found, so it passed through to normal routing | `host` or `path`, `reason` (no_match, invalid_format) |

### Funnel Metrics

1. **Proxy Success Rate**: `PreviewProxyRequestServed` with 2xx status / total `PreviewProxyRequestServed` — target ≥99%.
2. **Wake Success Rate**: `PreviewProxyWakeTriggered` with `wake_success=true` / total `PreviewProxyWakeTriggered` — target ≥95%.
3. **Wake Latency P95**: 95th percentile of `wake_duration_ms` on successful wakes — target ≤10 seconds.
4. **Error Page Rate**: `PreviewProxyErrorServed` / total proxy requests — target ≤1%.
5. **Preview Engagement via Proxy**: Unique `(repository_id, lr_number)` pairs with at least one `PreviewProxyRequestServed` event per day — measures how many active previews are being accessed.

### Success Indicators

- ≥95% of preview URL clicks from the landing request detail page result in a successful proxy response (2xx) within 5 seconds.
- Wake-from-suspend success rate ≥95%, with P95 wake latency ≤10 seconds.
- Error page render rate ≤1% of all preview proxy requests.
- Zero instances of Codeplane auth credentials being forwarded to upstream containers.

## Observability

### Logging Requirements

| Log Point | Level | Structured Context | Description |
|-----------|-------|-------------------|-------------|
| Preview proxy request received | INFO | `request_id`, `method`, `path`, `host`, `routing_mode`, `repo_owner`, `repo_name`, `lr_number` | Emitted when a request is identified as a preview request |
| Preview proxy upstream sent | DEBUG | `request_id`, `upstream_host`, `upstream_port`, `upstream_path`, `forwarded_headers` | Emitted when the request is forwarded to the upstream container |
| Preview proxy response returned | INFO | `request_id`, `response_status`, `latency_ms`, `content_length`, `content_type` | Emitted when the upstream response is returned to the client |
| Preview proxy wake initiated | INFO | `request_id`, `repository_id`, `lr_number`, `previous_status` | Emitted when a suspended preview is being woken |
| Preview proxy wake completed | INFO | `request_id`, `repository_id`, `lr_number`, `wake_duration_ms`, `success` | Emitted when wake completes or times out |
| Preview proxy error page served | WARN | `request_id`, `error_status`, `error_reason`, `repository_id`, `lr_number` | Emitted when an error page is returned |
| Preview proxy upstream connection failed | WARN | `request_id`, `upstream_host`, `upstream_port`, `error_message` | Emitted when the proxy cannot connect to the upstream container |
| Preview proxy request body too large | WARN | `request_id`, `content_length`, `max_allowed` | Emitted when a request exceeds the body size limit |
| Preview proxy rate limited | WARN | `request_id`, `client_ip`, `current_count`, `limit` | Emitted when a client is rate limited |
| Preview proxy passthrough | DEBUG | `request_id`, `host`, `path`, `reason` | Emitted when a potential preview request doesn't match any preview |
| Preview proxy WebSocket upgrade | INFO | `request_id`, `repository_id`, `lr_number` | Emitted when a WebSocket connection is proxied |

### Prometheus Metrics

#### Counters

| Metric | Labels | Description |
|--------|--------|-------------|
| `codeplane_preview_proxy_requests_total` | `routing_mode`, `response_status`, `method` | Total requests handled by the preview proxy |
| `codeplane_preview_proxy_errors_total` | `error_type` (upstream_unreachable, wake_timeout, body_too_large, rate_limited, preview_stopped, preview_failed) | Total error responses from the proxy |
| `codeplane_preview_proxy_wakes_total` | `result` (success, timeout, error) | Total wake-from-suspend attempts |
| `codeplane_preview_proxy_passthroughs_total` | `reason` (no_match, invalid_format, no_domain) | Total requests that passed through to normal routing |
| `codeplane_preview_proxy_bytes_sent_total` | `routing_mode` | Total response bytes proxied |
| `codeplane_preview_proxy_websocket_upgrades_total` | — | Total WebSocket upgrade requests proxied |

#### Gauges

| Metric | Labels | Description |
|--------|--------|-------------|
| `codeplane_preview_proxy_active_connections` | `routing_mode` | Currently active proxy connections (including WebSocket) |
| `codeplane_preview_proxy_waking_previews` | — | Number of previews currently in the wake process |

#### Histograms

| Metric | Labels | Buckets | Description |
|--------|--------|---------|-------------|
| `codeplane_preview_proxy_request_duration_seconds` | `routing_mode`, `method` | 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10 | Total proxy request latency (including wake time if applicable) |
| `codeplane_preview_proxy_upstream_duration_seconds` | `routing_mode` | 0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 5 | Time for upstream response headers only (excludes body streaming) |
| `codeplane_preview_proxy_wake_duration_seconds` | — | 0.5, 1, 2, 5, 10, 15, 20, 25, 30 | Duration of wake-from-suspend operations |
| `codeplane_preview_proxy_request_body_bytes` | `method` | 1024, 10240, 102400, 1048576, 10485760, 52428800 | Request body sizes |

### Alerts and Runbooks

#### Alert: `PreviewProxyHighErrorRate`

**Condition:** `rate(codeplane_preview_proxy_errors_total[5m]) / rate(codeplane_preview_proxy_requests_total[5m]) > 0.05`

**Severity:** Warning

**Runbook:**
1. Check which `error_type` label is dominant: `sum by (error_type)(rate(codeplane_preview_proxy_errors_total[5m]))`.
2. If `upstream_unreachable` is dominant:
   - Check container runtime health: `docker ps --filter label=tech.codeplane.preview`.
   - Verify containers are running and ports are mapped: `docker port <container_id>`.
   - Check host network connectivity to mapped ports: `curl -s http://localhost:{port}`.
   - If containers are not running, check `docker logs <container_id>` for crash loops.
3. If `wake_timeout` is dominant:
   - Check container start times: `docker inspect --format '{{.State.StartedAt}}' <container_id>`.
   - Verify container healthchecks are passing: `docker inspect --format '{{.State.Health}}' <container_id>`.
   - Check if the container's start command is hanging — inspect `docker logs <container_id>`.
   - Increase `wakeTimeoutMs` if start commands legitimately take longer than 30 seconds.
4. If `rate_limited` is dominant:
   - Identify the source IP from logs.
   - Determine if the traffic is legitimate (e.g., a load test) or abusive.
   - Adjust `rateLimitPerMinute` if legitimate traffic requires higher limits.

#### Alert: `PreviewProxyHighLatency`

**Condition:** `histogram_quantile(0.95, rate(codeplane_preview_proxy_request_duration_seconds_bucket[5m])) > 5`

**Severity:** Warning

**Runbook:**
1. Check if latency is correlated with wake operations: compare `codeplane_preview_proxy_wake_duration_seconds` P95.
2. If wake latency is high, check container start times and healthcheck intervals.
3. If upstream latency is high (non-wake requests), check the preview application's performance:
   - SSH into the container and check CPU/memory: `docker stats <container_id>`.
   - Check application logs: `docker exec <container_id> cat /tmp/preview.log`.
4. Check host system resources (CPU, memory, disk I/O) for contention.
5. If latency is isolated to specific repositories, check their preview configuration for slow start commands.

#### Alert: `PreviewProxyUpstreamDown`

**Condition:** `rate(codeplane_preview_proxy_errors_total{error_type="upstream_unreachable"}[5m]) > 5`

**Severity:** Critical

**Runbook:**
1. Immediately check container runtime status: `docker info` and `systemctl status docker`.
2. List all preview containers: `docker ps --filter label=tech.codeplane.preview --format '{{.ID}} {{.Status}} {{.Ports}}'`.
3. For containers in "Exited" or "Dead" state, check crash reasons: `docker logs <container_id> --tail 50`.
4. Verify the host's port range is not exhausted: `sysctl net.ipv4.ip_local_port_range`.
5. Check if the host system's file descriptor limit is reached: `cat /proc/sys/fs/file-nr`.
6. If the container runtime itself is down, restart it: `systemctl restart docker`.
7. After recovery, verify previews come back by checking `codeplane_preview_proxy_requests_total` resumes with 2xx responses.

#### Alert: `PreviewProxyConnectionLeak`

**Condition:** `codeplane_preview_proxy_active_connections > 200 AND deriv(codeplane_preview_proxy_active_connections[15m]) > 0`

**Severity:** Warning

**Runbook:**
1. Check for WebSocket connections that are not being properly closed: `codeplane_preview_proxy_websocket_upgrades_total` vs active connections.
2. Verify client-side connection cleanup — check if browsers or scripts are not closing connections.
3. Check for slow upstream responses that keep connections open: look at P99 of `codeplane_preview_proxy_upstream_duration_seconds`.
4. If connections are stuck, verify process-level connection tracking by checking the server process's open file descriptors: `ls -la /proc/{pid}/fd | wc -l`.
5. If necessary, implement idle connection timeout on proxied connections (e.g., 5 minutes for HTTP, 30 minutes for WebSocket).

### Error Cases and Failure Modes

| Failure | HTTP Status | User Impact | Recovery |
|---------|-------------|-------------|----------|
| No preview found for host/path | Passthrough (no error from proxy) | Request handled by normal routing | Expected — not a proxy request |
| Preview exists but status is `stopped` | 502 | Error page: "Preview Unavailable" | User returns to LR, restarts preview |
| Preview exists but status is `failed` | 502 | Error page: "Preview Unavailable" | User returns to LR, checks failure, restarts preview |
| Preview is `suspended`, wake succeeds | 200 (after delay) | Normal response, slightly delayed | Automatic — no user action |
| Preview is `suspended`, wake times out | 504 | Error page: "Preview Starting Up" | User retries in a few seconds |
| Upstream container unreachable | 502 | Error page: "Preview Unavailable" | Container may have crashed; check logs |
| Upstream response header timeout (>60s) | 504 | Error page: "Preview Starting Up" | Application in container may be overloaded |
| Request body exceeds 50 MB | 413 | Error page: "Request Too Large" | User reduces payload size |
| Rate limit exceeded | 429 | Error page: "Too Many Requests" | User waits per `Retry-After` header |
| Container runtime unavailable | 502 | Error page: "Preview Unavailable" | Admin installs/restarts container runtime |
| WebSocket upgrade fails | 502 | HMR/live-reload does not work | Check upstream container supports WebSocket |
| Upstream returns malformed response | 502 | Error page: "Preview Unavailable" | Check application code in container |
| Proxy middleware crashes | 500 | Raw error (unhandled) | Check server logs, fix middleware bug |

## Verification

### API / Middleware Integration Tests

1. **CE path-based proxy routes request to correct container** — Create a landing request, create a preview. Send GET `/_preview/alice/my-app/landings/42/` to the server. Assert response comes from the preview container (verify via `X-Codeplane-Preview` header), not the API router.

2. **CE path-based proxy strips prefix before forwarding** — Create a preview that serves a response at `/api/data`. Send GET `/_preview/alice/my-app/landings/42/api/data`. Assert the upstream container receives a request to `/api/data`, not the full prefixed path.

3. **CE path-based proxy handles root path** — Send GET `/_preview/alice/my-app/landings/42/`. Assert the upstream container receives a request to `/`.

4. **CE path-based proxy handles nested paths** — Send GET `/_preview/alice/my-app/landings/42/assets/images/logo.png`. Assert the upstream receives `/assets/images/logo.png`.

5. **Cloud host-based proxy routes request to correct container** — Configure `CODEPLANE_PREVIEW_DOMAIN=preview.test.local`. Create a preview. Send GET with `Host: 42-my-app.preview.test.local`. Assert response is proxied with `X-Codeplane-Preview` header.

6. **Cloud host-based proxy passes through bare domain** — Send GET with `Host: preview.test.local` (no subdomain). Assert the request is handled by normal routing (passthrough).

7. **Cloud host-based proxy passes through invalid prefix format** — Send GET with `Host: nolrnumber.preview.test.local`. Assert passthrough.

8. **Cloud host-based proxy passes through zero LR number** — Send GET with `Host: 0-repo.preview.test.local`. Assert passthrough.

9. **Cloud host-based proxy passes through negative LR number** — Send GET with `Host: -1-repo.preview.test.local`. Assert passthrough.

10. **Proxy returns 502 when preview is stopped** — Create and then stop a preview. Send request to the preview URL. Assert 502 response with HTML error page containing "Preview Unavailable".

11. **Proxy returns 502 when preview is failed** — Create a preview with a failing start command. Send request to the preview URL after failure. Assert 502 with HTML error page.

12. **Proxy returns 502 when upstream container is unreachable** — Create a preview, stop the container externally (without updating preview state). Send request. Assert 502 with error page.

13. **Proxy wakes suspended preview on access** — Create a preview, let it idle to suspended. Send request to preview URL. Assert response is successful (2xx) and preview status transitions to `running`.

14. **Proxy returns 504 when wake exceeds timeout** — Create a preview, suspend it, configure a very slow healthcheck. Send request. Assert 504 with "Preview Starting Up" error page.

15. **Proxy records access on each request** — Create a preview. Send 3 requests. Verify `lastAccessedAt` is updated (via GET preview status API) and idle timer is reset.

16. **Proxy forwards request method correctly** — Send POST, PUT, DELETE, PATCH requests to a preview URL. Assert each method is forwarded to the upstream container.

17. **Proxy forwards request headers** — Send a request with custom headers (`X-Custom-Header: test`). Assert the upstream container receives those headers.

18. **Proxy forwards request body** — Send POST with JSON body to preview URL. Assert the upstream container receives the body intact.

19. **Proxy sets X-Forwarded-For header** — Send a request. Assert the upstream container receives `X-Forwarded-For` with the client IP.

20. **Proxy sets X-Forwarded-Host header** — Send a request. Assert the upstream receives `X-Forwarded-Host` with the original host.

21. **Proxy sets X-Forwarded-Proto header** — Send a request. Assert the upstream receives `X-Forwarded-Proto`.

22. **Proxy sets X-Codeplane-Preview response header** — Send a request. Assert the response includes `X-Codeplane-Preview: alice/my-app#LR-42`.

23. **Proxy preserves upstream status codes** — Configure the upstream container to return 201, 301, 404, 500 for different paths. Assert each status code is preserved by the proxy.

24. **Proxy preserves upstream response headers** — Configure the upstream to return `X-Custom: value`. Assert the header is present on the proxied response.

25. **Proxy preserves Set-Cookie from upstream** — Configure the upstream to set a cookie. Assert `Set-Cookie` is preserved in the proxied response.

26. **Proxy strips Codeplane auth credentials from upstream request** — Send a request with `Authorization: token codeplane_xxx` and `Cookie: codeplane_session=xxx`. Assert the upstream container does NOT receive these credentials.

27. **Proxy does not require authentication** — Send a request to a preview URL without any auth headers or cookies. Assert the request is proxied successfully (no 401 or 403).

28. **Proxy returns 413 for oversized request body** — Send a POST with a body >50 MB. Assert 413 response with error page.

29. **Proxy accepts request body at maximum size (50 MB)** — Send a POST with exactly 50 MB body. Assert the request is proxied successfully.

30. **Proxy handles empty request body** — Send a GET and DELETE (no body) to the preview URL. Assert both are proxied successfully.

31. **Proxy rate limits per IP** — Send 501 rapid requests from the same IP to a preview URL. Assert the 501st receives 429 with `Retry-After` header and rate limit headers.

32. **Proxy rate limit allows requests below threshold** — Send 499 requests from the same IP. Assert all receive proxied responses, not 429.

33. **Proxy handles chunked transfer encoding from upstream** — Configure the upstream to respond with chunked encoding. Assert the proxy streams the response correctly.

34. **Proxy streams response body without buffering** — Configure the upstream to send a large (10 MB) response. Assert the proxy begins returning data before the entire upstream response is received (verify via timing or chunked response observation).

35. **Proxy handles concurrent requests to the same preview** — Send 50 concurrent requests to the same preview URL. Assert all receive valid responses.

36. **Proxy handles concurrent requests to different previews** — Create 3 previews. Send concurrent requests to each. Assert correct routing (verify via `X-Codeplane-Preview` header).

37. **Proxy rewrites Location header for redirects** — Configure the upstream to redirect to `http://localhost:{port}/new-path`. Assert the proxy rewrites the `Location` header to use the preview URL.

38. **CE mode passthrough for non-preview paths** — Send GET `/api/repos/alice/my-app` (not `/_preview/...`). Assert the request goes to the API router, not the proxy.

39. **Cloud mode passthrough for non-preview hosts** — Send GET with `Host: localhost:3000`. Assert the request goes to the API router.

### WebSocket Tests

40. **Proxy handles WebSocket upgrade for HMR** — Send a WebSocket upgrade request to a preview URL. Assert the upgrade succeeds and bidirectional messages flow.

41. **WebSocket disconnects cleanly when preview is stopped** — Establish a WebSocket connection. Stop the preview. Assert the WebSocket connection closes cleanly.

### Error Page Tests

42. **502 error page contains link back to landing request** — Trigger a 502. Assert the HTML contains a link to `/{owner}/{repo}/landings/{number}`.

43. **504 error page contains link back to landing request** — Trigger a 504. Assert the HTML contains a link to the landing request.

44. **Error pages include Codeplane branding** — Trigger 502, 504, 413, 429. Assert each contains "Codeplane" branding.

### Playwright (Web UI) E2E Tests

45. **Clicking preview URL in landing request detail opens preview in new tab** — Navigate to a landing request with a running preview. Click the preview URL. Assert a new tab opens with content from the preview container.

46. **Preview URL works in CE path-based mode** — In CE mode, navigate to a landing request, click the preview URL. Assert the path-based URL is correctly routed through the proxy and displays preview content.

47. **Preview error page shows when preview is stopped** — Navigate to a preview URL for a stopped preview. Assert the error page is rendered with "Preview Unavailable" and a link back to the landing request.

48. **Preview auto-wakes from suspended state** — Navigate to a preview URL for a suspended preview. Assert the page eventually loads (may show brief loading) and the preview content is displayed.

### CLI Integration Tests

49. **`codeplane land view` shows proxied preview URL in CE mode** — Create a landing request with a preview in CE mode. Run `codeplane land view <number>`. Assert the output contains a path-based preview URL.

50. **`codeplane land view` shows proxied preview URL in cloud mode** — Create a landing request with a preview in cloud mode. Run `codeplane land view <number>`. Assert the output contains a host-based preview URL.

### Boundary and Stress Tests

51. **Proxy handles LR number at maximum integer value (2,147,483,647)** — Construct a path-based preview URL with LR number 2147483647. Assert the proxy correctly passes through (no preview exists) without integer overflow.

52. **Proxy handles repo name with special characters** — Create a repo with hyphens and dots in the name (e.g., `my-app.v2`). Create a preview. Assert routing works for both host-based and path-based modes.

53. **Proxy handles repo name at maximum length (256 chars)** — Create a repo with a 256-character name. Create a preview. Assert path-based routing works. Assert host-based routing with long subdomain works (or gracefully fails if DNS label length exceeded).

54. **Proxy handles 100 concurrent preview environments** — Create 100 previews for different landing requests. Send requests to 10 random previews concurrently. Assert all are routed correctly.

55. **Proxy handles rapid sequential wake-suspend cycles** — Suspend and immediately access a preview 10 times in succession. Assert all wakes succeed and no state corruption occurs.

56. **Proxy handles upstream response body of exactly 50 MB** — Configure the upstream to return a 50 MB response. Assert the proxy streams it without error.

57. **Proxy timeout enforcement at exactly 60 seconds** — Configure the upstream to delay response headers by 59 seconds. Assert the proxy returns the response (not a timeout). Configure a 61-second delay. Assert 504.
