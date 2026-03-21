# TOOL_POLICIES_GATED_UI

Specification for TOOL_POLICIES_GATED_UI.

## High-Level User POV

When teams use Codeplane's agent capabilities — agent sessions within repositories, agent task steps in workflows, or agent-powered issue resolution via the CLI — those agents have access to tools that let them read code, write files, run commands, create changes, manage issues, and more. Today, there is no way for a repository owner or organization administrator to control which tools an agent is permitted to use. Every agent session has access to all default tools, and the only per-session restriction available is the `agent.tools` allow-list within workflow step definitions.

Tool Policies is a repository-scoped governance surface that lets repository administrators define named policies controlling which tools agents are allowed — or forbidden — to use when operating within the context of that repository. A tool policy acts as a guardrail: it defines which tools are available by default for all agent sessions in the repository, which tools are explicitly blocked, and under what conditions certain tools may be used (e.g., "allow `bash` but only in workspace-sandboxed sessions").

From the user's perspective, Tool Policies are managed from the repository settings area. An administrator navigates to **Repository Settings → Agent → Tool Policies**, where they see a list of configured policies. Each policy has a name, a description, a mode (allow-list or deny-list), and a list of tool identifiers it applies to. Policies can optionally be scoped to a specific execution context — all sessions, workflow-only sessions, or interactive sessions. The default policy (if none is configured) permits all default tools, preserving backward compatibility.

The immediate value is safety and compliance. A team working on a sensitive codebase can create a policy that blocks the `bash` tool entirely, forcing agents to operate through structured read/write/edit tools only. A platform team can restrict workspace-creation tools to prevent agents from spinning up unbounded infrastructure. An organization can enforce a baseline deny-list across all repositories, while individual repositories can layer additional restrictions on top.

Tool Policies is shipped as a **gated UI** — the feature flag `tool_policies` controls visibility. When enabled, the settings page, API endpoints, and CLI commands are fully functional. When disabled, the settings section is hidden, API endpoints return 404, and CLI commands indicate the feature is not available. This gating allows the product team to beta-test the surface with select users before rolling it out broadly.

The feature integrates with the existing agent tooling ecosystem: the three built-in Codeplane tools (`codeplane-context`, `codeplane-docs`, `codeplane-issue`) and the execution-backend-provided tools (bash, read, write, edit, glob, grep, etc.) are all governable by tool policies. When a policy is in effect, the agent runtime filters the available tool set before the agent session begins, and any attempt to invoke a blocked tool returns a clear, structured refusal rather than a silent failure.

## Acceptance Criteria

### Definition of Done

- [ ] A "Tool Policies" section is accessible within repository settings at `/:owner/:repo/settings/agent/tool-policies` in the web UI when the `tool_policies` feature flag is enabled.
- [ ] The section displays a list of all tool policies configured for the repository, including each policy's name, description, mode, tool count, scope, and enabled/disabled status.
- [ ] Repository owners and admins can create, edit, enable/disable, and delete tool policies.
- [ ] Each tool policy defines a mode (`allow` or `deny`), a list of tool identifiers, and an optional execution scope (`all`, `workflow`, `interactive`).
- [ ] A repository can have at most one policy marked as the "default" policy; all others are named override policies.
- [ ] When the `tool_policies` feature flag is disabled, navigating to the tool policies settings page redirects to the repository settings root.
- [ ] When the feature flag is disabled, the "Tool Policies" navigation entry is hidden from the repository settings sidebar.
- [ ] The API endpoints for tool policy CRUD are gated behind the `tool_policies` feature flag; when disabled, they return 404.
- [ ] The CLI provides `codeplane repo tool-policy list|create|view|update|delete|enable|disable` commands.
- [ ] The TUI does not require a dedicated tool policies management screen for the initial gated release; the feature is accessible via web and CLI only.
- [ ] Agent sessions started after a policy is created or modified respect the updated policy without requiring a server restart.
- [ ] Deleting a tool policy does not retroactively affect already-running agent sessions; it applies only to sessions started after deletion.
- [ ] The policy evaluation result (which tools were filtered) is logged in the agent session metadata so administrators can audit enforcement.

### Edge Cases

- [ ] A repository with no tool policies configured: all default tools remain available (backward-compatible).
- [ ] A policy with an empty tools list in `allow` mode: blocks all tools (the agent can converse but cannot invoke any tools).
- [ ] A policy with an empty tools list in `deny` mode: blocks nothing (all default tools remain available).
- [ ] Two policies that conflict (one allows tool X, another denies tool X): deny takes precedence. The effective tool set is the intersection of all allow-lists minus the union of all deny-lists.
- [ ] A policy referencing a tool identifier that does not exist in the current tool registry: the policy is accepted and stored, but the unknown tool ID is ignored during evaluation (forward-compatible with future tool additions). A warning is displayed in the UI.
- [ ] A user creates a policy with a duplicate name (same name as an existing policy in the same repository): rejected with a clear error message.
- [ ] A policy name containing only whitespace: rejected.
- [ ] A policy name at exactly the maximum length (100 characters): accepted.
- [ ] A policy name exceeding 100 characters: rejected.
- [ ] A policy description at exactly the maximum length (1,000 characters): accepted.
- [ ] A policy description exceeding 1,000 characters: rejected.
- [ ] Special characters in policy names (unicode, emoji, punctuation): accepted as long as the string contains at least one non-whitespace character and is within length bounds.
- [ ] Control characters (NUL, TAB, newline) in policy names: rejected.
- [ ] A user attempts to create more than 20 policies per repository: rejected with a quota error.
- [ ] A user with read-only access attempts to create a policy: receives 403 Forbidden.
- [ ] An anonymous user accesses the tool policies API: receives 401 Unauthorized.
- [ ] Feature flag disabled mid-session: the next navigation or API call returns 404/redirect; no partial state is shown.
- [ ] Deleting the last policy in a repository: succeeds, returns to empty state.
- [ ] Concurrent creation of two policies with the same name: one succeeds, the other receives a duplicate name error.

### Boundary Constraints

| Field | Min | Max | Notes |
|---|---|---|---|
| Policy name length | 1 character | 100 characters | Printable UTF-8, no control characters, trimmed |
| Policy description length | 0 characters | 1,000 characters | Optional, trimmed |
| Tools list per policy | 0 items | 100 items | Each item 1–100 chars, alphanumeric + hyphens + underscores |
| Tool identifier length | 1 character | 100 characters | Lowercase alphanumeric, hyphens, underscores only |
| Policies per repository | 0 | 20 | Hard cap |
| Mode | `allow` or `deny` | — | Required |
| Scope | `all`, `workflow`, `interactive` | — | Default: `all` |
| Enabled | `true` or `false` | — | Default: `true` |

## Design

### Web UI Design

#### Route

`/:owner/:repo/settings/agent/tool-policies`

This route is nested under the repository settings section. It appears as a sub-item under an "Agent" group in the repository settings sidebar, alongside future agent configuration options.

#### Feature Flag Gating

The route and sidebar entry are wrapped in a feature-flag check against `tool_policies`. When disabled:
- The "Agent" settings group and "Tool Policies" entry are hidden from the settings sidebar.
- Direct navigation to the route redirects to `/:owner/:repo/settings` with no error message.

#### Page Layout: Policy List

**Header:**
- Title: "Tool Policies" in bold.
- Subtitle: "Control which tools agents can use in this repository."
- "Create Policy" button (primary, top-right), visible only to users with admin/owner role.

**Policy Table:**

| Column | Width | Description |
|---|---|---|
| Status | 40px | Green dot (enabled) or gray dot (disabled) |
| Name | 200px min | Policy name as a clickable link to the detail/edit view |
| Mode | 80px | Badge: "Allow" (green outline) or "Deny" (red outline) |
| Scope | 100px | Text: "All Sessions", "Workflow Only", or "Interactive Only" |
| Tools | Flexible | Comma-separated tool names, truncated with "+N more" if >3 |
| Description | 200px min | Truncated description text |
| Actions | 80px | Kebab menu with: Edit, Enable/Disable, Delete |

Sorted by creation date descending (newest first).

**Empty State:**
When no policies exist: centered empty state with an icon, the heading "No tool policies configured", body text "Agents in this repository have access to all default tools. Create a policy to restrict or allow specific tools.", and a "Create Policy" call-to-action button.

#### Create/Edit Policy Form

The form opens as a full-page view at `/:owner/:repo/settings/agent/tool-policies/new` (create) or `/:owner/:repo/settings/agent/tool-policies/:policyId/edit` (edit).

**Form Fields:**

1. **Name** (text input, required): Label "Policy Name", placeholder "e.g., Restrict bash access", max 100 characters, with a live character counter.
2. **Description** (textarea, optional): Label "Description", placeholder "Describe the purpose of this policy", max 1,000 characters, with a live character counter.
3. **Mode** (radio group, required): Options: "Allow List — Only these tools are permitted" and "Deny List — These tools are blocked". Default: Deny.
4. **Scope** (select, required): Options: "All Sessions" (default), "Workflow Only", "Interactive Only".
5. **Tools** (multi-select/tag-input): A searchable multi-select showing all known tool identifiers. Users can also type custom tool IDs (for forward-compatibility). Each selected tool appears as a removable chip/tag. Grouped by category: "Codeplane Tools" (codeplane-context, codeplane-docs, codeplane-issue), "File Tools" (read, write, edit, glob, grep), "Execution Tools" (bash), "Other" (catch-all for unknown IDs).
6. **Enabled** (toggle, default on): "Enable this policy immediately after creation."

**Validation:**
- Name is validated on blur and on submit. Duplicate name check is performed on submit (server-side).
- Tools list shows a warning (non-blocking) if any tool ID is not in the known tool registry.
- Empty tools list with "Allow" mode shows an advisory warning: "This will block all tools for agents."

**Actions:**
- "Save Policy" (primary button) — creates or updates the policy.
- "Cancel" — returns to the policy list without saving.
- On edit: "Delete Policy" (destructive button, bottom of form) with a confirmation dialog.

#### Policy Detail View

`/:owner/:repo/settings/agent/tool-policies/:policyId`

Shows the policy configuration in read-only form with an "Edit" button (for admin/owner). Displays the full list of tool identifiers with descriptions where known. Shows creation/update timestamps and the creating user.

#### Keyboard Shortcuts

| Key | Action |
|---|---|
| `c` | Open create policy form (on list page) |
| `Enter` | Navigate to selected policy detail |
| `e` | Edit selected policy |
| `d` | Open delete confirmation for selected policy |
| `j` / `Down` | Move focus to next policy |
| `k` / `Up` | Move focus to previous policy |

### API Shape

#### List Tool Policies

**Endpoint:** `GET /api/repos/:owner/:repo/agent/tool-policies`

**Authentication:** Required.

**Feature Flag:** `tool_policies`. Returns 404 if disabled.

**Response (200):**

```json
[
  {
    "id": "tp_abc123",
    "name": "Restrict bash access",
    "description": "Prevent agents from executing arbitrary shell commands",
    "mode": "deny",
    "scope": "all",
    "tools": ["bash"],
    "enabled": true,
    "is_default": false,
    "created_at": "2026-03-22T10:00:00Z",
    "updated_at": "2026-03-22T10:00:00Z",
    "created_by": {
      "id": 1,
      "username": "admin"
    }
  }
]
```

#### Create Tool Policy

**Endpoint:** `POST /api/repos/:owner/:repo/agent/tool-policies`

**Authentication:** Required. Must be repository admin or owner.

**Request Body:**

```json
{
  "name": "Restrict bash access",
  "description": "Prevent agents from executing arbitrary shell commands",
  "mode": "deny",
  "scope": "all",
  "tools": ["bash"],
  "enabled": true
}
```

**Response (201):** Full policy object as shown above.

**Error Responses:**

| Status | Condition | Body |
|---|---|---|
| 400 | Validation error (empty name, invalid mode, etc.) | `{ "error": "<specific message>" }` |
| 401 | Unauthenticated | `{ "error": "authentication required" }` |
| 403 | Insufficient permissions | `{ "error": "admin access required" }` |
| 404 | Feature flag disabled or repo not found | `{ "error": "not found" }` |
| 409 | Duplicate policy name | `{ "error": "a policy with this name already exists" }` |
| 422 | Quota exceeded (>20 policies) | `{ "error": "maximum of 20 tool policies per repository" }` |

#### View Tool Policy

**Endpoint:** `GET /api/repos/:owner/:repo/agent/tool-policies/:policyId`

**Response (200):** Full policy object.

#### Update Tool Policy

**Endpoint:** `PATCH /api/repos/:owner/:repo/agent/tool-policies/:policyId`

**Authentication:** Required. Must be repository admin or owner.

**Request Body:** Partial policy object (any subset of `name`, `description`, `mode`, `scope`, `tools`, `enabled`).

**Response (200):** Updated full policy object.

#### Delete Tool Policy

**Endpoint:** `DELETE /api/repos/:owner/:repo/agent/tool-policies/:policyId`

**Authentication:** Required. Must be repository admin or owner.

**Response:** 204 No Content.

#### Evaluate Effective Tool Set (read-only)

**Endpoint:** `GET /api/repos/:owner/:repo/agent/tool-policies/evaluate`

**Query Parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `scope` | string | `all` | Execution context to evaluate for: `all`, `workflow`, `interactive` |

**Response (200):**

```json
{
  "available_tools": ["read", "write", "edit", "glob", "grep", "codeplane-context", "codeplane-docs", "codeplane-issue"],
  "blocked_tools": ["bash"],
  "applied_policies": [
    { "id": "tp_abc123", "name": "Restrict bash access", "mode": "deny" }
  ]
}
```

This endpoint is useful for previewing the effect of configured policies before starting an agent session.

### CLI Commands

```
codeplane repo tool-policy list [--repo <owner/repo>] [--json]
codeplane repo tool-policy create --name <name> --mode <allow|deny> --tools <tool1,tool2,...> [--scope <all|workflow|interactive>] [--description <text>] [--disabled] [--repo <owner/repo>] [--json]
codeplane repo tool-policy view <policy-id> [--repo <owner/repo>] [--json]
codeplane repo tool-policy update <policy-id> [--name <name>] [--mode <allow|deny>] [--tools <tool1,tool2,...>] [--scope <all|workflow|interactive>] [--description <text>] [--repo <owner/repo>] [--json]
codeplane repo tool-policy delete <policy-id> [--repo <owner/repo>] [--confirm]
codeplane repo tool-policy enable <policy-id> [--repo <owner/repo>]
codeplane repo tool-policy disable <policy-id> [--repo <owner/repo>]
codeplane repo tool-policy evaluate [--scope <all|workflow|interactive>] [--repo <owner/repo>] [--json]
```

Output format for `list`:

```
NAME                    MODE   SCOPE     TOOLS                   ENABLED
Restrict bash access    deny   all       bash                    ✓
Read-only agents        allow  workflow  read, glob, grep, ...   ✓
```

When `tool_policies` flag is disabled: commands print "Tool policies feature is not available. Contact your administrator to enable it." and exit with code 1.

### TUI UI

No dedicated TUI screen is required for the initial gated release. The TUI does not currently have a repository settings screen. When repository settings are added to the TUI in the future, tool policies should be included.

### SDK Shape

The `@codeplane/sdk` package should expose a `ToolPolicyService` with the following interface:

```typescript
interface ToolPolicy {
  id: string;
  repositoryId: number;
  name: string;
  description: string;
  mode: "allow" | "deny";
  scope: "all" | "workflow" | "interactive";
  tools: string[];
  enabled: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: number; username: string };
}

interface ToolPolicyEvaluation {
  availableTools: string[];
  blockedTools: string[];
  appliedPolicies: { id: string; name: string; mode: string }[];
}

interface ToolPolicyService {
  list(repositoryId: number): Promise<ToolPolicy[]>;
  get(repositoryId: number, policyId: string): Promise<ToolPolicy | null>;
  create(repositoryId: number, userId: number, input: CreateToolPolicyInput): Promise<ToolPolicy>;
  update(repositoryId: number, policyId: string, input: Partial<CreateToolPolicyInput>): Promise<ToolPolicy>;
  delete(repositoryId: number, policyId: string): Promise<void>;
  evaluate(repositoryId: number, scope: string): Promise<ToolPolicyEvaluation>;
}
```

### Documentation

The following user-facing documentation should be written:

1. **Guide: "Managing Tool Policies"** — A getting-started guide covering: what tool policies are, how to create an allow-list or deny-list policy, how policies compose (deny wins), how to use the evaluate endpoint to preview effects, and common policy patterns (e.g., "sandbox-only bash", "read-only agents", "no external tools").
2. **Reference: "Tool Policy API"** — Full API reference for all six endpoints: list, create, view, update, delete, evaluate. Include request/response schemas, error codes, and authentication requirements.
3. **Reference: "Known Tool Identifiers"** — A table of all built-in tool identifiers that can be used in policies: `bash`, `read`, `write`, `edit`, `glob`, `grep`, `codeplane-context`, `codeplane-docs`, `codeplane-issue`. Include a description of each tool's capabilities.
4. **CLI Reference: `repo tool-policy`** — Man-page-style reference for all subcommands with examples.
5. **FAQ: "How do tool policies interact with workflow `agent.tools`?"** — Explains that workflow-level `agent.tools` and repository-level tool policies both apply; the effective set is the intersection. A tool must be allowed by both the workflow config and the repository policy to be available.

## Permissions & Security

### Authorization Roles

| Action | Owner | Admin | Member (Write) | Member (Read) | Anonymous |
|---|---|---|---|---|---|
| List tool policies | ✅ | ✅ | ✅ | ✅ | ❌ (401) |
| View tool policy detail | ✅ | ✅ | ✅ | ✅ | ❌ (401) |
| Evaluate effective tool set | ✅ | ✅ | ✅ | ✅ | ❌ (401) |
| Create tool policy | ✅ | ✅ | ❌ (403) | ❌ (403) | ❌ (401) |
| Update tool policy | ✅ | ✅ | ❌ (403) | ❌ (403) | ❌ (401) |
| Enable/disable tool policy | ✅ | ✅ | ❌ (403) | ❌ (403) | ❌ (401) |
| Delete tool policy | ✅ | ✅ | ❌ (403) | ❌ (403) | ❌ (401) |
| Access settings page | ✅ | ✅ | ❌ (hidden) | ❌ (hidden) | ❌ (redirect) |

### Rate Limiting

- **Read endpoints** (list, view, evaluate): Covered by global API rate limiting. No additional per-endpoint limits.
- **Write endpoints** (create, update, delete, enable/disable): Maximum 30 write operations per repository per hour. This prevents automated tools from thrashing policy configuration.
- **Burst**: Up to 5 write operations in a 10-second window per user per repository.
- **Rate limit response**: Standard `429 Too Many Requests` with `Retry-After` header.

### Data Privacy & PII

- Tool policy names and descriptions are user-authored content visible to all repository members with read access. Users should be advised not to include sensitive information in policy names or descriptions.
- Policy created-by user information (user ID and username) is included in the response. This is not PII beyond what is already public in the user profile.
- The evaluate endpoint returns the effective tool set, which reveals the combined effect of all policies. This is safe because policy configuration is visible to all readers.
- No secrets, tokens, or credentials are stored in or returned by tool policy endpoints.
- Server logs must not include policy names or descriptions beyond DEBUG level to avoid log-based information leakage in multi-tenant environments.

## Telemetry & Product Analytics

### Business Events

| Event Name | Trigger | Properties |
|---|---|---|
| `ToolPolicyCreated` | Admin creates a new tool policy | `repository_id`, `policy_id`, `user_id`, `mode`, `scope`, `tools_count`, `enabled`, `timestamp` |
| `ToolPolicyUpdated` | Admin updates an existing tool policy | `repository_id`, `policy_id`, `user_id`, `fields_changed` (array of field names), `timestamp` |
| `ToolPolicyDeleted` | Admin deletes a tool policy | `repository_id`, `policy_id`, `user_id`, `timestamp` |
| `ToolPolicyToggled` | Admin enables or disables a policy | `repository_id`, `policy_id`, `user_id`, `new_state` (enabled/disabled), `timestamp` |
| `ToolPolicyListViewed` | User views the tool policy list (API or UI) | `repository_id`, `user_id`, `policy_count`, `client` (web/cli/api), `timestamp` |
| `ToolPolicyEvaluated` | User calls the evaluate endpoint | `repository_id`, `user_id`, `scope`, `available_tools_count`, `blocked_tools_count`, `applied_policies_count`, `client`, `timestamp` |
| `ToolPolicyEnforced` | Agent session starts with tool filtering applied | `repository_id`, `session_id`, `applied_policies_count`, `tools_blocked_count`, `tools_available_count`, `scope`, `timestamp` |
| `ToolPolicyBlocked` | An agent attempts to invoke a tool blocked by policy | `repository_id`, `session_id`, `policy_id`, `tool_name`, `timestamp` |

### Event Properties

- `repository_id`: integer, internal repository ID
- `policy_id`: string, tool policy identifier
- `user_id`: integer, acting user's internal ID
- `mode`: string, "allow" or "deny"
- `scope`: string, "all", "workflow", or "interactive"
- `tools_count`: integer, number of tools in the policy's tool list
- `fields_changed`: string array, which fields were modified in an update
- `new_state`: string, "enabled" or "disabled"
- `client`: string, which client surface initiated the action
- `available_tools_count` / `blocked_tools_count`: integer, result of policy evaluation
- `tool_name`: string, the tool that was blocked during enforcement

### Funnel Metrics & Success Indicators

- **Adoption rate**: Percentage of repositories with at least one tool policy configured. Target: growing week-over-week during beta; 10%+ of active repositories within 3 months of GA.
- **Policy configuration depth**: Average number of policies per repository (among repos that have any). Indicates whether users are creating simple single-policy setups or nuanced multi-policy configurations.
- **Enforcement frequency**: Number of `ToolPolicyEnforced` events per week. A high ratio of enforcement events to policy creation events indicates policies are actively being used, not just configured and forgotten.
- **Block rate**: Ratio of `ToolPolicyBlocked` events to total tool invocations in policy-governed sessions. A very high block rate may indicate overly restrictive policies; a near-zero rate may indicate policies are too permissive to be meaningful.
- **Feature flag adoption**: Number of unique users accessing tool policy surfaces. Tracks readiness for GA rollout.
- **Evaluate-before-create ratio**: Percentage of users who call the evaluate endpoint before or shortly after creating a policy. Indicates whether the preview affordance is useful.

## Observability

### Logging Requirements

| Log Event | Level | Structured Context |
|---|---|---|
| Tool policy created | `info` | `repository_id`, `policy_id`, `policy_name`, `mode`, `scope`, `tools_count`, `user_id` |
| Tool policy updated | `info` | `repository_id`, `policy_id`, `fields_changed`, `user_id` |
| Tool policy deleted | `info` | `repository_id`, `policy_id`, `policy_name`, `user_id` |
| Tool policy toggled | `info` | `repository_id`, `policy_id`, `new_state`, `user_id` |
| Tool policy list requested | `debug` | `repository_id`, `user_id`, `policy_count`, `request_id` |
| Tool policy evaluation completed | `debug` | `repository_id`, `scope`, `available_count`, `blocked_count`, `applied_policies`, `request_id` |
| Tool policy enforcement applied to agent session | `info` | `repository_id`, `session_id`, `applied_policies`, `tools_blocked`, `tools_available`, `scope` |
| Tool invocation blocked by policy | `warn` | `repository_id`, `session_id`, `policy_id`, `tool_name`, `agent_turn` |
| Tool policy creation failed (validation) | `info` | `repository_id`, `user_id`, `error_message`, `request_id` |
| Tool policy creation failed (quota) | `warn` | `repository_id`, `user_id`, `current_count`, `max_count`, `request_id` |
| Tool policy creation failed (duplicate name) | `info` | `repository_id`, `user_id`, `duplicate_name`, `request_id` |
| Feature flag check for tool_policies | `debug` | `user_id`, `flag_enabled`, `request_id` |
| Unexpected error in tool policy endpoint | `error` | `repository_id`, `user_id`, `error_message`, `stack_trace`, `request_id` |

### Prometheus Metrics

| Metric Name | Type | Labels | Description |
|---|---|---|---|
| `codeplane_tool_policy_requests_total` | Counter | `operation` (list, create, view, update, delete, evaluate), `status` (2xx, 4xx, 5xx) | Total tool policy API requests by operation and status |
| `codeplane_tool_policy_request_duration_seconds` | Histogram | `operation` | Request duration for tool policy operations |
| `codeplane_tool_policy_count` | Gauge | `repository_id`, `mode` (allow, deny), `enabled` (true, false) | Current count of tool policies per repository |
| `codeplane_tool_policy_enforcement_total` | Counter | `repository_id`, `scope` | Times tool policies were evaluated for an agent session start |
| `codeplane_tool_policy_blocks_total` | Counter | `repository_id`, `tool_name` | Tool invocations blocked by policy |
| `codeplane_tool_policy_write_rate_limited_total` | Counter | `repository_id` | Write operations rejected by rate limiting |
| `codeplane_tool_policy_errors_total` | Counter | `operation`, `error_type` (validation, quota, duplicate, auth, server) | Errors by type |

### Alerts

#### Alert: `ToolPolicyEndpointErrorRateSpike`

- **Condition**: `rate(codeplane_tool_policy_requests_total{status="5xx"}[5m]) > 0.05`
- **Severity**: Warning
- **Runbook**:
  1. Check server logs for `error`-level entries containing tool policy endpoint paths.
  2. The tool policy endpoints perform database reads/writes; check database connectivity and query performance.
  3. Verify the `tool_policies` feature flag is still configured correctly.
  4. Check recent deployments for changes to the tool policy route handlers or service layer.
  5. If database-related, check connection pool health and query execution times.
  6. If auth-related, check the auth middleware health (same as other auth-dependent endpoints).

#### Alert: `ToolPolicyEnforcementFailure`

- **Condition**: `increase(codeplane_tool_policy_errors_total{error_type="server", operation="enforcement"}[15m]) > 0`
- **Severity**: Critical
- **Runbook**:
  1. Enforcement failures mean agent sessions may be starting without proper policy checks. This is a security-relevant issue.
  2. Immediately check server logs for enforcement error entries. Look for `error_message` patterns.
  3. If the failure is a database timeout during policy lookup, check DB health and consider caching policy configurations.
  4. If the failure is a code error, check recent deployments to the agent runtime or policy evaluation code.
  5. Consider temporarily pausing new agent sessions in affected repositories until the issue is resolved.
  6. Escalate to the security on-call if enforcement bypass is confirmed.

#### Alert: `ToolPolicyQuotaSaturation`

- **Condition**: `codeplane_tool_policy_count{enabled="true"} / 20 > 0.8` for any repository, sustained for 1 hour.
- **Severity**: Info
- **Runbook**:
  1. A repository is approaching the 20-policy limit. This is informational.
  2. Check if the repository genuinely needs many policies or if old/unused policies should be cleaned up.
  3. If legitimate, consider raising the per-repository quota for this organization in a future configuration update.

#### Alert: `ToolPolicyHighBlockRate`

- **Condition**: `rate(codeplane_tool_policy_blocks_total[1h]) / rate(codeplane_tool_policy_enforcement_total[1h]) > 5` (more than 5 blocks per enforcement on average), sustained for 2 hours.
- **Severity**: Info
- **Runbook**:
  1. A high block rate indicates agents are frequently attempting to use tools that are policy-blocked. This may indicate poorly configured policies or agent prompts that don't account for tool restrictions.
  2. Review the `tool_name` label on `codeplane_tool_policy_blocks_total` to identify which tools are most commonly blocked.
  3. Check whether the blocked tool is essential for the agent's task — if so, the policy may be too restrictive.
  4. Contact the repository owner to review their policy configuration if the pattern persists.

#### Alert: `ToolPolicyWriteRateLimitExceeded`

- **Condition**: `increase(codeplane_tool_policy_write_rate_limited_total[5m]) > 10`
- **Severity**: Warning
- **Runbook**:
  1. A user or automation is exceeding the write rate limit for tool policy management.
  2. Check server logs for the `repository_id` and `user_id` associated with rate-limited requests.
  3. If an automated tool is thrashing policy configuration, contact the repository owner.
  4. If legitimate bulk configuration (e.g., initial setup), advise the user to space out requests or use a single bulk-update approach.

### Error Cases and Failure Modes

| Failure Mode | HTTP Status | User-Facing Message | Internal Log Level | Likelihood |
|---|---|---|---|---|
| Unauthenticated request | 401 | "authentication required" | info | Normal |
| Insufficient permissions (not admin) | 403 | "admin access required" | info | Normal |
| Feature flag disabled | 404 | "not found" | debug | Normal |
| Repository not found | 404 | "not found" | info | Normal |
| Policy not found | 404 | "not found" | info | Normal |
| Validation error (bad name, mode, etc.) | 400 | Specific validation message | info | Normal |
| Duplicate policy name | 409 | "a policy with this name already exists" | info | Occasional |
| Quota exceeded | 422 | "maximum of 20 tool policies per repository" | warn | Rare |
| Write rate limited | 429 | "rate limit exceeded" | warn | Rare |
| Database connection failure | 500 | "internal server error" | error | Rare |
| Policy evaluation during agent start fails | 500 (internal) | Agent session logs error | error | Very rare |

## Verification

### API Integration Tests

1. **List policies for repo with none**: `GET /api/repos/:owner/:repo/agent/tool-policies` with valid auth. Assert 200, body is `[]`.
2. **List policies returns all policies**: Create 3 policies, then list. Assert 200, body contains exactly 3 items with correct fields.
3. **Create policy with valid fields**: `POST` with `{ name: "Block bash", mode: "deny", tools: ["bash"], scope: "all" }`. Assert 201, response includes `id`, `name`, `mode`, `tools`, `scope`, `enabled: true`, `created_at`, `created_by`.
4. **Create policy with all optional fields**: Include `description` and `enabled: false`. Assert 201, description and enabled state match.
5. **Create policy with minimum name length (1 char)**: `POST` with `name: "X"`. Assert 201.
6. **Create policy with maximum name length (100 chars)**: `POST` with a 100-character name. Assert 201.
7. **Reject policy with name exceeding 100 chars**: `POST` with a 101-character name. Assert 400.
8. **Reject policy with empty name**: `POST` with `name: ""`. Assert 400.
9. **Reject policy with whitespace-only name**: `POST` with `name: "   "`. Assert 400.
10. **Reject policy with control characters in name**: `POST` with `name: "test\x00policy"`. Assert 400.
11. **Accept policy with unicode name**: `POST` with `name: "ポリシー 🔒"`. Assert 201.
12. **Create policy with maximum description length (1000 chars)**: Assert 201.
13. **Reject policy with description exceeding 1000 chars**: `POST` with 1001-character description. Assert 400.
14. **Reject policy with invalid mode**: `POST` with `mode: "block"`. Assert 400.
15. **Reject policy with missing mode**: `POST` without `mode` field. Assert 400.
16. **Reject policy with invalid scope**: `POST` with `scope: "global"`. Assert 400.
17. **Accept policy with scope "workflow"**: Assert 201.
18. **Accept policy with scope "interactive"**: Assert 201.
19. **Default scope is "all" when omitted**: Create without `scope`. Assert response has `scope: "all"`.
20. **Default enabled is true when omitted**: Create without `enabled`. Assert response has `enabled: true`.
21. **Create policy with empty tools array**: `POST` with `tools: []`. Assert 201.
22. **Create policy with maximum tools (100 items)**: `POST` with 100 tool identifiers. Assert 201.
23. **Reject policy with more than 100 tools**: `POST` with 101 tool identifiers. Assert 400.
24. **Reject tool identifier exceeding 100 chars**: `POST` with a tool ID of 101 characters. Assert 400.
25. **Reject tool identifier with invalid chars**: `POST` with `tools: ["bash!@#"]`. Assert 400.
26. **Accept tool identifier with hyphens and underscores**: `POST` with `tools: ["my-custom_tool"]`. Assert 201.
27. **Reject duplicate policy name in same repo**: Create a policy named "Test". Create another with the same name. Assert second returns 409.
28. **Allow same policy name in different repos**: Create "Test" in repo A, "Test" in repo B. Both succeed.
29. **Quota enforcement at 20 policies**: Create 20 policies. Attempt to create a 21st. Assert 422.
30. **View policy by ID**: Create a policy, then `GET` it by ID. Assert 200, all fields match creation response.
31. **View nonexistent policy returns 404**: `GET` with a random ID. Assert 404.
32. **Update policy name**: `PATCH` with `{ name: "Updated Name" }`. Assert 200, name updated, other fields unchanged.
33. **Update policy mode**: `PATCH` with `{ mode: "allow" }`. Assert 200, mode updated.
34. **Update policy tools**: `PATCH` with `{ tools: ["read", "write"] }`. Assert 200, tools updated.
35. **Update with empty body**: `PATCH` with `{}`. Assert 200, no fields changed.
36. **Update with duplicate name**: Create policies A and B. Update B's name to match A's. Assert 409.
37. **Delete policy**: Create a policy, delete it via `DELETE`. Assert 204. List policies, confirm it's gone.
38. **Delete nonexistent policy returns 404**: `DELETE` with random ID. Assert 404.
39. **Evaluate with no policies**: `GET /api/repos/:owner/:repo/agent/tool-policies/evaluate`. Assert 200, all default tools available, no blocked tools, no applied policies.
40. **Evaluate with deny policy**: Create a deny policy blocking "bash". Evaluate. Assert "bash" appears in `blocked_tools`, not in `available_tools`.
41. **Evaluate with allow policy**: Create an allow policy permitting only "read" and "write". Evaluate. Assert `available_tools` contains only "read" and "write".
42. **Evaluate with scope filter**: Create policy with scope "workflow". Evaluate with `?scope=interactive`. Assert the workflow-scoped policy is NOT applied.
43. **Evaluate with scope filter matching**: Evaluate with `?scope=workflow`. Assert the workflow-scoped policy IS applied.
44. **Evaluate with disabled policy**: Create a policy, disable it. Evaluate. Assert the disabled policy is not in `applied_policies`.
45. **Unauthenticated request to list**: `GET` without auth. Assert 401.
46. **Unauthenticated request to create**: `POST` without auth. Assert 401.
47. **Read-only user can list policies**: Authenticate as read-only member. `GET` list. Assert 200.
48. **Read-only user cannot create policy**: Authenticate as read-only member. `POST` create. Assert 403.
49. **Write member cannot create policy**: Authenticate as write member (non-admin). `POST` create. Assert 403.
50. **Admin can create policy**: Authenticate as repo admin. `POST` create. Assert 201.
51. **Owner can create policy**: Authenticate as repo owner. `POST` create. Assert 201.
52. **Feature flag disabled — list returns 404**: Disable `tool_policies` flag. `GET` list. Assert 404.
53. **Feature flag disabled — create returns 404**: Disable flag. `POST` create. Assert 404.
54. **Feature flag re-enabled — endpoints work**: Re-enable flag. Assert 200/201.
55. **Response includes X-Request-Id**: Assert the `X-Request-Id` header is present on all responses.
56. **Concurrent creation of same name**: Send two `POST` requests simultaneously with the same name. Assert one returns 201, the other returns 409.
57. **Content-Type is application/json**: Assert all responses have `Content-Type: application/json`.

### CLI Integration Tests

58. **`tool-policy list` with no policies**: Run `codeplane repo tool-policy list`. Assert output shows empty table or "No tool policies configured."
59. **`tool-policy list` with policies**: Create policies via API, list via CLI. Assert table output includes name, mode, scope, tools.
60. **`tool-policy list --json`**: Assert valid JSON array output.
61. **`tool-policy create`**: Run `codeplane repo tool-policy create --name "CLI Test" --mode deny --tools bash`. Assert success message with policy ID.
62. **`tool-policy view`**: Create a policy, view it by ID. Assert detail output.
63. **`tool-policy update`**: Update a policy's mode via CLI. Assert success message.
64. **`tool-policy delete --confirm`**: Delete a policy via CLI with confirmation flag. Assert success.
65. **`tool-policy delete` without --confirm**: Assert interactive confirmation prompt or error.
66. **`tool-policy enable/disable`**: Toggle a policy. Assert success and state change confirmed by subsequent view.
67. **`tool-policy evaluate`**: Run evaluate. Assert output shows available and blocked tools.
68. **`tool-policy evaluate --scope workflow`**: Assert scope-filtered evaluation.
69. **Feature flag disabled — CLI error**: Disable flag. Run any tool-policy command. Assert clear error message about feature not being available.
70. **CLI without auth — error**: Run tool-policy command without being logged in. Assert authentication error.

### Web UI (Playwright) E2E Tests

71. **Settings sidebar shows "Tool Policies" when flag enabled**: Navigate to repo settings as admin. Assert "Agent" group and "Tool Policies" link visible.
72. **Settings sidebar hides "Tool Policies" when flag disabled**: Disable flag. Navigate to repo settings. Assert no "Tool Policies" link.
73. **Direct URL redirects when flag disabled**: Navigate to `/:owner/:repo/settings/agent/tool-policies` with flag disabled. Assert redirect to settings root.
74. **Empty state displayed when no policies**: Navigate to tool policies page. Assert empty state message and "Create Policy" button.
75. **Create policy form validation — empty name**: Click "Create Policy", submit with empty name. Assert validation error displayed.
76. **Create policy form — successful creation**: Fill in name, mode, tools. Submit. Assert redirect to list, new policy visible.
77. **Policy list shows correct columns**: Create policies, view list. Assert Status, Name, Mode, Scope, Tools, Description columns render.
78. **Policy edit form pre-fills values**: Create a policy, click edit. Assert form fields are pre-populated.
79. **Policy update persists**: Edit a policy name, save. Assert the updated name appears in the list.
80. **Policy delete with confirmation**: Click delete on a policy. Assert confirmation dialog. Confirm. Assert policy removed from list.
81. **Policy enable/disable toggle**: Disable a policy from the kebab menu. Assert status dot changes to gray. Re-enable. Assert green dot.
82. **Non-admin user cannot see create button**: Log in as read-only member. Navigate to tool policies. Assert "Create Policy" button is not present.
83. **Non-admin user can view policy list**: Log in as read-only member. Navigate to tool policies. Assert list is visible (read-only).
84. **Tools multi-select shows known tools**: In create form, open tools selector. Assert known tools (bash, read, write, edit, etc.) appear as options.
85. **Tools multi-select allows custom tool ID**: Type a custom tool ID in the tools selector. Assert it's accepted as a chip/tag.
86. **Warning shown for unknown tool ID**: Enter an unknown tool ID. Assert a warning message about unknown tools.
87. **Warning shown for empty allow-list**: Select "Allow" mode with no tools. Assert advisory warning about blocking all tools.
88. **Character counter on name field**: Type in the name field. Assert counter shows current/max characters.
89. **Keyboard shortcut `c` opens create form**: On list page, press `c`. Assert navigation to create form.
90. **Keyboard navigation with j/k**: On list page with multiple policies, press `j` and `k`. Assert focus moves between rows.
