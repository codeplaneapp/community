export interface OutputContext {
  formatExplicit: boolean;
}

type JsonRecord = Record<string, unknown>;

export function shouldReturnStructuredOutput(context: OutputContext): boolean {
  return context.formatExplicit;
}

function stringValue(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return fallback;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function objectValue(value: unknown): JsonRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function joinValues(values: unknown[], separator = ", "): string {
  return values
    .map((value) => stringValue(value))
    .filter(Boolean)
    .join(separator);
}

function padCell(value: string, width: number): string {
  return value.padEnd(width, " ");
}

function formatTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((header, columnIndex) =>
    Math.max(
      header.length,
      ...rows.map((row) => (row[columnIndex] ?? "").length),
    ),
  );
  const lines = [
    headers.map((header, columnIndex) => padCell(header, widths[columnIndex] ?? 0)).join("  "),
    widths.map((width) => "-".repeat(width)).join("  "),
  ];

  for (const row of rows) {
    lines.push(
      row.map((cell, columnIndex) => padCell(cell, widths[columnIndex] ?? 0)).join("  "),
    );
  }

  return lines.join("\n");
}

function issueAuthor(issue: JsonRecord): string {
  const author = objectValue(issue.author);
  return stringValue(author?.login, "unknown");
}

function issueAssignees(issue: JsonRecord): string {
  return arrayValue(issue.assignees)
    .map((assignee) => stringValue(objectValue(assignee)?.login))
    .filter(Boolean)
    .join(", ");
}

function wikiAuthor(page: JsonRecord): string {
  return stringValue(objectValue(page.author)?.login, "unknown");
}

export function formatIssueCreate(issue: JsonRecord): string {
  return `Created issue #${stringValue(issue.number)}: ${stringValue(issue.title)}`;
}

export function formatIssueList(issues: JsonRecord[]): string {
  if (issues.length === 0) {
    return "No issues found";
  }

  const rows = issues.map((issue) => [
    `#${stringValue(issue.number)}`,
    stringValue(issue.state),
    stringValue(issue.title),
    issueAuthor(issue),
  ]);
  return formatTable(["Number", "State", "Title", "Author"], rows);
}

export function formatIssueView(issue: JsonRecord): string {
  const lines = [
    `#${stringValue(issue.number)} ${stringValue(issue.title)}`.trim(),
    `State: ${stringValue(issue.state)}`,
    `Author: ${issueAuthor(issue)}`,
  ];
  const assignees = issueAssignees(issue);
  if (assignees) {
    lines.push(`Assignees: ${assignees}`);
  }
  const body = stringValue(issue.body);
  if (body) {
    lines.push("", body);
  }
  return lines.join("\n");
}

export function formatIssueMutation(action: string, issue: JsonRecord): string {
  return `${action} issue #${stringValue(issue.number)}: ${stringValue(issue.title)}`;
}

export function formatWikiCreate(page: JsonRecord): string {
  return `Created wiki page ${stringValue(page.title)} (${stringValue(page.slug)})`;
}

export function formatWikiList(pages: JsonRecord[]): string {
  if (pages.length === 0) {
    return "No wiki pages found";
  }

  const rows = pages.map((page) => [
    stringValue(page.title),
    stringValue(page.slug),
    wikiAuthor(page),
    stringValue(page.updated_at),
  ]);
  return formatTable(["Title", "Slug", "Author", "Updated"], rows);
}

export function formatWikiView(page: JsonRecord): string {
  const lines = [
    stringValue(page.title),
    `Slug: ${stringValue(page.slug)}`,
    `Author: ${wikiAuthor(page)}`,
  ];
  const updatedAt = stringValue(page.updated_at);
  if (updatedAt) {
    lines.push(`Updated: ${updatedAt}`);
  }
  const body = stringValue(page.body);
  if (body) {
    lines.push("", body);
  }
  return lines.join("\n");
}

export function formatWikiMutation(action: string, page: JsonRecord): string {
  return `${action} wiki page ${stringValue(page.title)} (${stringValue(page.slug)})`;
}

function repoFullName(repo: JsonRecord): string {
  const fullName = stringValue(repo.full_name);
  if (fullName) {
    return fullName;
  }
  const owner = stringValue(repo.owner);
  const name = stringValue(repo.name);
  return owner && name ? `${owner}/${name}` : name;
}

function repoVisibility(repo: JsonRecord): string {
  if (typeof repo.is_public === "boolean") {
    return repo.is_public ? "public" : "private";
  }
  return "";
}

export function formatRepoCreate(repo: JsonRecord): string {
  const lines = [`Created repository ${repoFullName(repo)}`];
  const cloneUrl = stringValue(repo.clone_url);
  if (cloneUrl) {
    lines.push(`Clone URL: ${cloneUrl}`);
  }
  return lines.join("\n");
}

export function formatRepoList(repos: JsonRecord[]): string {
  if (repos.length === 0) {
    return "No repositories found";
  }

  const rows = repos.map((repo) => [
    stringValue(repo.name),
    repoVisibility(repo),
    stringValue(repo.default_bookmark || repo.default_branch),
    stringValue(repo.updated_at),
  ]);
  return formatTable(["Name", "Visibility", "Default", "Updated"], rows);
}

export function formatRepoView(repo: JsonRecord): string {
  const lines = [
    repoFullName(repo),
    `Visibility: ${repoVisibility(repo) || "unknown"}`,
  ];
  const description = stringValue(repo.description);
  if (description) {
    lines.push(`Description: ${description}`);
  }
  const defaultBookmark = stringValue(repo.default_bookmark || repo.default_branch);
  if (defaultBookmark) {
    lines.push(`Default bookmark: ${defaultBookmark}`);
  }
  const cloneUrl = stringValue(repo.clone_url);
  if (cloneUrl) {
    lines.push(`Clone URL: ${cloneUrl}`);
  }
  const stars = numberValue(repo.num_stars);
  if (stars !== undefined) {
    lines.push(`Stars: ${stars}`);
  }
  return lines.join("\n");
}

export function formatRepoMutation(action: string, repoRef: string): string {
  return `${action} repository ${repoRef}`;
}

function landingAuthor(landing: JsonRecord): string {
  const author = objectValue(landing.author);
  return stringValue(author?.login, "unknown");
}

function landingPath(repoRef: string, number: unknown): string {
  return `/${repoRef}/landings/${stringValue(number)}`;
}

export function formatLandingCreate(repoRef: string, landing: JsonRecord): string {
  return [
    `Created landing request #${stringValue(landing.number)}: ${stringValue(landing.title)}`,
    `URL: ${landingPath(repoRef, landing.number)}`,
  ].join("\n");
}

export function formatLandingList(landings: JsonRecord[]): string {
  if (landings.length === 0) {
    return "No landing requests found";
  }

  const rows = landings.map((landing) => [
    `#${stringValue(landing.number)}`,
    stringValue(landing.state),
    stringValue(landing.title),
    joinValues(arrayValue(landing.change_ids)),
  ]);
  return formatTable(["Number", "State", "Title", "change_ids"], rows);
}

export function formatLandingView(details: {
  changes: JsonRecord[];
  conflicts: JsonRecord;
  landing: JsonRecord;
  reviews: JsonRecord[];
}): string {
  const { changes, conflicts, landing, reviews } = details;
  const lines = [
    `#${stringValue(landing.number)} ${stringValue(landing.title)}`.trim(),
    `State: ${stringValue(landing.state)}`,
    `Author: ${landingAuthor(landing)}`,
    `Target: ${stringValue(landing.target_bookmark)}`,
    `Change IDs: ${joinValues(arrayValue(landing.change_ids))}`,
  ];

  if (changes.length > 0) {
    lines.push("", "Changes:");
    for (const change of changes) {
      lines.push(`- ${stringValue(change.change_id)}`);
    }
  }

  if (reviews.length > 0) {
    lines.push("", "Reviews:");
    for (const review of reviews) {
      const body = stringValue(review.body);
      lines.push(`- ${stringValue(review.type)}: ${body || "(no body)"}`);
    }
  }

  const conflictStatus = stringValue(conflicts.conflict_status);
  if (conflictStatus) {
    lines.push("", `Conflicts: ${conflictStatus}`);
  }

  return lines.join("\n");
}

export function formatLandingChecks(statuses: JsonRecord[]): string {
  if (statuses.length === 0) {
    return "No checks found";
  }

  const rows = statuses.map((status) => [
    stringValue(status.change_id),
    stringValue(status.context),
    stringValue(status.status),
    stringValue(status.description),
  ]);
  return formatTable(["Change ID", "Context", "Status", "Description"], rows);
}

export function formatLandingMutation(action: string, landing: JsonRecord): string {
  return `${action} landing request #${stringValue(landing.number)}: ${stringValue(landing.title)}`;
}

export interface StatusFileSummary {
  path: string;
  status: string;
}

export interface LocalStatusSummary {
  files: StatusFileSummary[];
  parent: {
    change_id: string;
    commit_id: string;
    description: string;
  };
  working_copy: {
    change_id: string;
    commit_id: string;
    description: string;
  };
}

export function formatStatus(status: LocalStatusSummary): string {
  const lines = [
    `Working copy: ${status.working_copy.change_id}${status.working_copy.description ? ` ${status.working_copy.description}` : ""}`,
    `Parent: ${status.parent.change_id}${status.parent.description ? ` ${status.parent.description}` : ""}`,
  ];

  if (status.files.length > 0) {
    lines.push("", "Modified files:");
    for (const file of status.files) {
      lines.push(`${file.status} ${file.path}`);
    }
  }

  return lines.join("\n");
}
