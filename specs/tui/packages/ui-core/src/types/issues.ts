export type IssueState = "open" | "closed";

export interface IssueUserSummary {
  id: number;
  login: string;
}

export interface IssueLabelSummary {
  id: number;
  name: string;
  color: string;
  description: string;
}

export interface Issue {
  id: number;
  number: number;
  title: string;
  body: string;
  state: IssueState;
  author: IssueUserSummary;
  assignees: IssueUserSummary[];
  labels: IssueLabelSummary[];
  milestone_id: number | null;
  comment_count: number;
  closed_at: string | null;        // ISO-8601 or null
  created_at: string;              // ISO-8601
  updated_at: string;              // ISO-8601
}

export interface IssueComment {
  id: number;
  issue_id: number;
  user_id: number;
  commenter: string;
  body: string;
  type: string;
  created_at: string;              // ISO-8601
  updated_at: string;              // ISO-8601
}

export interface IssueEvent {
  id: number;
  issueId: number;
  actorId: number | null;
  eventType: string;
  payload: unknown;
  createdAt: string;               // ISO-8601
}

export interface Label {
  id: number;
  repository_id: number;
  name: string;
  color: string;
  description: string;
  created_at: string;              // ISO-8601
  updated_at: string;              // ISO-8601
}

export interface Milestone {
  id: number;
  repository_id: number;
  title: string;
  description: string;
  state: string;
  due_date: string | null;         // ISO-8601 or null
  closed_at: string | null;        // ISO-8601 or null
  created_at: string;              // ISO-8601
  updated_at: string;              // ISO-8601
}

export interface UserSearchResult {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string;
}

export interface CreateIssueRequest {
  title: string;
  body: string;
  assignees?: string[];
  labels?: string[];
  milestone?: number;
}

export interface UpdateIssueRequest {
  title?: string;
  body?: string;
  state?: IssueState;
  assignees?: string[];
  labels?: string[];
  milestone?: number | null;
}

export interface CreateIssueCommentRequest {
  body: string;
}

export interface IssuesOptions {
  page?: number;
  perPage?: number;
  state?: IssueState | "";
  enabled?: boolean;
}

export interface IssueCommentsOptions {
  page?: number;
  perPage?: number;
  enabled?: boolean;
}

export interface IssueEventsOptions {
  page?: number;
  perPage?: number;
  enabled?: boolean;
}

export interface RepoLabelsOptions {
  page?: number;
  perPage?: number;
  enabled?: boolean;
}

export interface RepoMilestonesOptions {
  page?: number;
  perPage?: number;
  state?: string;
  enabled?: boolean;
}

export interface RepoCollaboratorsOptions {
  query: string;
  enabled?: boolean;
}
