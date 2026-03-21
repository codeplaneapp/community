import type { Sql } from "postgres";
import { Result } from "better-result";

import {
  type APIError,
  internal,
} from "../lib/errors";

import {
  createNotification,
  notifyUser,
} from "../db/notifications_sql";

import {
  getUserByID,
  getUserByLowerUsername,
} from "../db/users_sql";

import {
  listIssueAssignees,
} from "../db/issues_sql";

import {
  listLandingRequestReviews,
} from "../db/landings_sql";

import {
  listRepoWatchers,
  countRepoWatchers,
} from "../db/social_sql";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Max watchers to page through per fan-out call. */
const WATCHER_PAGE_SIZE = 200;

/** Regex to extract @username mentions from text bodies. */
const MENTION_REGEX = /@([a-zA-Z0-9](?:[a-zA-Z0-9._-]*[a-zA-Z0-9])?)/g;

// ---------------------------------------------------------------------------
// Source types — matches Go notification source_type values
// ---------------------------------------------------------------------------

export const SOURCE_TYPE_ISSUE = "issue";
export const SOURCE_TYPE_ISSUE_COMMENT = "issue_comment";
export const SOURCE_TYPE_LANDING_REQUEST = "landing_request";
export const SOURCE_TYPE_LR_REVIEW = "lr_review";
export const SOURCE_TYPE_LR_COMMENT = "lr_comment";
export const SOURCE_TYPE_WORKSPACE = "workspace";
export const SOURCE_TYPE_WORKFLOW_RUN = "workflow_run";

// ---------------------------------------------------------------------------
// Event input types
// ---------------------------------------------------------------------------

export interface IssueAssignedEvent {
  issueId: string;
  issueNumber: number;
  issueTitle: string;
  repositoryId: string;
  /** The user IDs that were assigned. */
  assigneeUserIds: string[];
  /** The actor who performed the assignment (excluded from notifications). */
  actorId: string;
}

export interface IssueCommentedEvent {
  issueId: string;
  issueNumber: number;
  issueTitle: string;
  repositoryId: string;
  /** Author of the issue (will be notified). */
  issueAuthorId: string;
  /** The user who left the comment (excluded from notifications). */
  commenterId: string;
  /** Comment body text — parsed for @mentions. */
  body: string;
}

export interface LRReviewedEvent {
  landingRequestId: string;
  landingRequestNumber: number;
  landingRequestTitle: string;
  repositoryId: string;
  /** Author of the landing request (will be notified). */
  lrAuthorId: string;
  /** The reviewer (excluded from notifications). */
  reviewerId: string;
  /** Review type (approve, request_changes, comment). */
  reviewType: string;
}

export interface LRCommentedEvent {
  landingRequestId: string;
  landingRequestNumber: number;
  landingRequestTitle: string;
  repositoryId: string;
  /** Author of the landing request (will be notified). */
  lrAuthorId: string;
  /** The user who left the comment (excluded from notifications). */
  commenterId: string;
  /** Comment body text — parsed for @mentions. */
  body: string;
}

export interface LRChangesPushedEvent {
  landingRequestId: string;
  landingRequestNumber: number;
  landingRequestTitle: string;
  repositoryId: string;
  /** The user who pushed changes (excluded from notifications). */
  pusherId: string;
}

export interface WorkspaceStatusChangedEvent {
  workspaceId: string;
  workspaceName: string;
  /** Owner of the workspace. */
  ownerId: string;
  /** New status (e.g. "failed", "stopped"). */
  newStatus: string;
}

export interface WorkspaceSharedEvent {
  workspaceId: string;
  workspaceName: string;
  /** User who shared the workspace (excluded from notifications). */
  sharerId: string;
  /** Users the workspace was shared with. */
  sharedWithUserIds: string[];
}

export interface WorkflowRunCompletedEvent {
  workflowRunId: string;
  workflowName: string;
  repositoryId: string;
  /** The user who initiated the run (will be notified). */
  initiatorId: string;
  /** Final status (success, failure, cancelled). */
  status: string;
}

// ---------------------------------------------------------------------------
// NotificationFanoutService
// ---------------------------------------------------------------------------

/**
 * NotificationFanoutService creates notifications when events happen and
 * emits PostgreSQL NOTIFY for real-time SSE delivery.
 *
 * Matches the Go notification creation pattern:
 * 1. Insert into notifications table
 * 2. Emit pg_notify on user-specific channel
 *
 * All fan-out methods are best-effort: they collect user IDs, deduplicate,
 * exclude the actor, and create one notification per recipient.
 */
export class NotificationFanoutService {
  constructor(private readonly sql: Sql) {}

  // -------------------------------------------------------------------------
  // Issue events
  // -------------------------------------------------------------------------

  /**
   * Fan out notifications when users are assigned to an issue.
   * Notifies: assignees (excluding the actor), repo watchers.
   */
  async onIssueAssigned(
    event: IssueAssignedEvent,
  ): Promise<Result<void, APIError>> {
    const recipientIds = new Set<string>();

    // Assignees
    for (const uid of event.assigneeUserIds) {
      recipientIds.add(uid);
    }

    // Repo watchers
    await this.addRepoWatchers(event.repositoryId, recipientIds);

    // Exclude actor
    recipientIds.delete(event.actorId);

    const subject = `You were assigned to issue #${event.issueNumber}: ${event.issueTitle}`;

    return this.fanOut(
      recipientIds,
      SOURCE_TYPE_ISSUE,
      event.issueId,
      subject,
      "",
    );
  }

  /**
   * Fan out notifications when someone comments on an issue.
   * Notifies: issue author, assignees, mentioned users, repo watchers.
   * Excludes the commenter.
   */
  async onIssueCommented(
    event: IssueCommentedEvent,
  ): Promise<Result<void, APIError>> {
    const recipientIds = new Set<string>();

    // Issue author
    recipientIds.add(event.issueAuthorId);

    // Issue assignees
    const assignees = await listIssueAssignees(this.sql, {
      issueId: event.issueId,
    });
    for (const a of assignees) {
      recipientIds.add(a.id);
    }

    // Mentioned users
    await this.addMentionedUsers(event.body, recipientIds);

    // Repo watchers
    await this.addRepoWatchers(event.repositoryId, recipientIds);

    // Exclude commenter
    recipientIds.delete(event.commenterId);

    const subject = `New comment on issue #${event.issueNumber}: ${event.issueTitle}`;

    return this.fanOut(
      recipientIds,
      SOURCE_TYPE_ISSUE_COMMENT,
      event.issueId,
      subject,
      truncateBody(event.body),
    );
  }

  // -------------------------------------------------------------------------
  // Landing request events
  // -------------------------------------------------------------------------

  /**
   * Fan out notifications when a landing request is reviewed.
   * Notifies: LR author, mentioned users in review body (if any).
   * Excludes the reviewer.
   */
  async onLRReviewed(
    event: LRReviewedEvent,
  ): Promise<Result<void, APIError>> {
    const recipientIds = new Set<string>();

    // LR author
    recipientIds.add(event.lrAuthorId);

    // Exclude reviewer
    recipientIds.delete(event.reviewerId);

    const subject = `Your landing request #${event.landingRequestNumber} was reviewed (${event.reviewType}): ${event.landingRequestTitle}`;

    return this.fanOut(
      recipientIds,
      SOURCE_TYPE_LR_REVIEW,
      event.landingRequestId,
      subject,
      "",
    );
  }

  /**
   * Fan out notifications when someone comments on a landing request.
   * Notifies: LR author, mentioned users, repo watchers.
   * Excludes the commenter.
   */
  async onLRCommented(
    event: LRCommentedEvent,
  ): Promise<Result<void, APIError>> {
    const recipientIds = new Set<string>();

    // LR author
    recipientIds.add(event.lrAuthorId);

    // Mentioned users
    await this.addMentionedUsers(event.body, recipientIds);

    // Repo watchers
    await this.addRepoWatchers(event.repositoryId, recipientIds);

    // Exclude commenter
    recipientIds.delete(event.commenterId);

    const subject = `New comment on landing request #${event.landingRequestNumber}: ${event.landingRequestTitle}`;

    return this.fanOut(
      recipientIds,
      SOURCE_TYPE_LR_COMMENT,
      event.landingRequestId,
      subject,
      truncateBody(event.body),
    );
  }

  /**
   * Fan out notifications when new changes are pushed to a landing request.
   * Notifies: all reviewers who have reviewed this LR.
   * Excludes the pusher.
   */
  async onLRChangesPushed(
    event: LRChangesPushedEvent,
  ): Promise<Result<void, APIError>> {
    const recipientIds = new Set<string>();

    // Collect all reviewers by paging through reviews
    let offset = 0;
    const pageSize = 100;
    let hasMore = true;
    while (hasMore) {
      const reviews = await listLandingRequestReviews(this.sql, {
        landingRequestId: event.landingRequestId,
        pageOffset: String(offset),
        pageSize: String(pageSize),
      });
      for (const r of reviews) {
        recipientIds.add(r.reviewerId);
      }
      hasMore = reviews.length === pageSize;
      offset += pageSize;
    }

    // Exclude pusher
    recipientIds.delete(event.pusherId);

    const subject = `New changes pushed to landing request #${event.landingRequestNumber}: ${event.landingRequestTitle}`;

    return this.fanOut(
      recipientIds,
      SOURCE_TYPE_LANDING_REQUEST,
      event.landingRequestId,
      subject,
      "",
    );
  }

  // -------------------------------------------------------------------------
  // Workspace events
  // -------------------------------------------------------------------------

  /**
   * Fan out notification when a workspace status changes to a failure state.
   * Notifies: workspace owner.
   */
  async onWorkspaceStatusChanged(
    event: WorkspaceStatusChangedEvent,
  ): Promise<Result<void, APIError>> {
    // Only notify on failure states
    if (event.newStatus !== "failed") {
      return Result.ok(undefined);
    }

    const recipientIds = new Set<string>();
    recipientIds.add(event.ownerId);

    const subject = `Workspace "${event.workspaceName}" ${event.newStatus}`;

    return this.fanOut(
      recipientIds,
      SOURCE_TYPE_WORKSPACE,
      event.workspaceId,
      subject,
      "",
    );
  }

  /**
   * Fan out notifications when a workspace is shared with users.
   * Notifies: shared-with users.
   * Excludes the sharer.
   */
  async onWorkspaceShared(
    event: WorkspaceSharedEvent,
  ): Promise<Result<void, APIError>> {
    const recipientIds = new Set<string>();

    for (const uid of event.sharedWithUserIds) {
      recipientIds.add(uid);
    }

    // Exclude sharer
    recipientIds.delete(event.sharerId);

    const subject = `Workspace "${event.workspaceName}" was shared with you`;

    return this.fanOut(
      recipientIds,
      SOURCE_TYPE_WORKSPACE,
      event.workspaceId,
      subject,
      "",
    );
  }

  // -------------------------------------------------------------------------
  // Workflow events
  // -------------------------------------------------------------------------

  /**
   * Fan out notification when a workflow run completes.
   * Notifies: the run initiator.
   */
  async onWorkflowRunCompleted(
    event: WorkflowRunCompletedEvent,
  ): Promise<Result<void, APIError>> {
    const recipientIds = new Set<string>();
    recipientIds.add(event.initiatorId);

    const statusLabel = event.status === "success" ? "succeeded" : event.status;
    const subject = `Workflow "${event.workflowName}" ${statusLabel}`;

    return this.fanOut(
      recipientIds,
      SOURCE_TYPE_WORKFLOW_RUN,
      event.workflowRunId,
      subject,
      "",
    );
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /**
   * Create a notification for each recipient and emit pg_notify.
   * Respects email_notifications_enabled preference on the user record
   * (users with notifications disabled are skipped).
   *
   * This is best-effort: failures for individual recipients do not fail
   * the entire fan-out.
   */
  private async fanOut(
    recipientIds: Set<string>,
    sourceType: string,
    sourceId: string,
    subject: string,
    body: string,
  ): Promise<Result<void, APIError>> {
    for (const userId of recipientIds) {
      try {
        // Check user preference
        const user = await getUserByID(this.sql, { id: userId });
        if (!user || !user.emailNotificationsEnabled) {
          continue;
        }

        // Insert notification
        const row = await createNotification(this.sql, {
          userId,
          sourceType,
          sourceId,
          subject,
          body,
        });
        if (!row) {
          continue;
        }

        // Emit PG NOTIFY for real-time SSE delivery (best-effort)
        const payload = JSON.stringify({
          user_id: Number(row.userId),
          notification_id: Number(row.id),
        });
        try {
          await notifyUser(this.sql, { userId, payload });
        } catch {
          // Non-fatal: PG NOTIFY is best-effort
        }
      } catch {
        // Non-fatal: skip this recipient on any error
      }
    }

    return Result.ok(undefined);
  }

  /**
   * Parse @username mentions from text and resolve them to user IDs.
   * Unknown usernames are silently ignored.
   */
  private async addMentionedUsers(
    text: string,
    recipientIds: Set<string>,
  ): Promise<void> {
    const usernames = parseMentions(text);
    for (const username of usernames) {
      try {
        const user = await getUserByLowerUsername(this.sql, {
          lowerUsername: username.toLowerCase(),
        });
        if (user) {
          recipientIds.add(user.id);
        }
      } catch {
        // Silently ignore lookup failures
      }
    }
  }

  /**
   * Page through all watchers of a repository and add their IDs to the set.
   */
  private async addRepoWatchers(
    repositoryId: string,
    recipientIds: Set<string>,
  ): Promise<void> {
    try {
      const countRow = await countRepoWatchers(this.sql, { repositoryId });
      const total = countRow ? Number(countRow.count) : 0;
      if (total === 0) return;

      let offset = 0;
      while (offset < total) {
        const watchers = await listRepoWatchers(this.sql, {
          repositoryId,
          pageOffset: String(offset),
          pageSize: String(WATCHER_PAGE_SIZE),
        });
        for (const w of watchers) {
          recipientIds.add(w.id);
        }
        if (watchers.length < WATCHER_PAGE_SIZE) break;
        offset += WATCHER_PAGE_SIZE;
      }
    } catch {
      // Best-effort: if watcher lookup fails, continue without them
    }
  }
}

// ---------------------------------------------------------------------------
// Standalone helpers
// ---------------------------------------------------------------------------

/**
 * Parse @username mentions from a text body.
 * Returns a deduplicated array of usernames (without the @ prefix).
 */
export function parseMentions(text: string): string[] {
  const seen = new Set<string>();
  const results: string[] = [];
  let match: RegExpExecArray | null;

  // Reset regex state
  MENTION_REGEX.lastIndex = 0;
  while ((match = MENTION_REGEX.exec(text)) !== null) {
    const username = match[1] as string | undefined;
    if (!username) continue;
    const lower = username.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      results.push(username);
    }
  }

  return results;
}

/**
 * Truncate a body string for use in a notification body preview.
 */
function truncateBody(body: string, maxLen = 200): string {
  if (body.length <= maxLen) return body;
  return body.slice(0, maxLen) + "...";
}
