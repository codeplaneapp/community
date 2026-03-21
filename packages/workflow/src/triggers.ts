/**
 * Trigger builders for JJHub workflows.
 *
 * Each builder returns a plain object with `_type` that the workflow renderer
 * (scripts/lib/workflow-renderer.ts) uses to produce the JSON shape Go expects.
 */

// ── Trigger descriptor types ────────────────────────────────────────────────

export interface PushTriggerDescriptor {
  _type: "push";
  bookmarks?: string[];
  tags?: string[];
  ignore?: string[];
}

export interface LandingRequestTriggerDescriptor {
  _type: "landing_request";
  event: string;
}

export interface ReleaseTriggerDescriptor {
  _type: "release";
  event: string;
  tags?: string[];
}

export interface IssueTriggerDescriptor {
  _type: "issue";
  event: string;
}

export interface IssueCommentTriggerDescriptor {
  _type: "issue_comment";
  event: string;
}

export interface ScheduleTriggerDescriptor {
  _type: "schedule";
  cron: string;
}

export interface ManualDispatchTriggerDescriptor {
  _type: "manual_dispatch";
  inputs?: Record<string, unknown>;
}

export interface WebhookTriggerDescriptor {
  _type: "webhook";
  event: string;
}

export interface WorkflowRunTriggerDescriptor {
  _type: "workflow_run";
  workflows: string[];
  types?: string[];
}

export interface WorkflowArtifactTriggerDescriptor {
  _type: "workflow_artifact";
  workflows?: string[];
  names?: string[];
}

export type TriggerDescriptor =
  | PushTriggerDescriptor
  | LandingRequestTriggerDescriptor
  | ReleaseTriggerDescriptor
  | IssueTriggerDescriptor
  | IssueCommentTriggerDescriptor
  | ScheduleTriggerDescriptor
  | ManualDispatchTriggerDescriptor
  | WebhookTriggerDescriptor
  | WorkflowRunTriggerDescriptor
  | WorkflowArtifactTriggerDescriptor;

// ── Push ────────────────────────────────────────────────────────────────────

interface PushOptions {
  bookmarks?: string[];
  tags?: string[];
  ignore?: string[];
}

function push(options?: PushOptions): PushTriggerDescriptor {
  return { _type: "push", ...options };
}

// ── Landing Request ─────────────────────────────────────────────────────────

const landingRequest = {
  opened(): LandingRequestTriggerDescriptor {
    return { _type: "landing_request", event: "opened" };
  },
  closed(): LandingRequestTriggerDescriptor {
    return { _type: "landing_request", event: "closed" };
  },
  synchronize(): LandingRequestTriggerDescriptor {
    return { _type: "landing_request", event: "synchronize" };
  },
  readyToLand(): LandingRequestTriggerDescriptor {
    return { _type: "landing_request", event: "ready_to_land" };
  },
  landed(): LandingRequestTriggerDescriptor {
    return { _type: "landing_request", event: "landed" };
  },
};

// ── Release ─────────────────────────────────────────────────────────────────

interface ReleaseOptions {
  tags?: string[];
}

function releaseTrigger(
  event: string,
  options?: ReleaseOptions,
): ReleaseTriggerDescriptor {
  return { _type: "release", event, ...options };
}

const release = {
  published(options?: ReleaseOptions): ReleaseTriggerDescriptor {
    return releaseTrigger("published", options);
  },
  updated(options?: ReleaseOptions): ReleaseTriggerDescriptor {
    return releaseTrigger("updated", options);
  },
  deleted(options?: ReleaseOptions): ReleaseTriggerDescriptor {
    return releaseTrigger("deleted", options);
  },
  released(options?: ReleaseOptions): ReleaseTriggerDescriptor {
    return releaseTrigger("released", options);
  },
  prereleased(options?: ReleaseOptions): ReleaseTriggerDescriptor {
    return releaseTrigger("prereleased", options);
  },
};

// ── Issue ───────────────────────────────────────────────────────────────────

const issue = {
  opened(): IssueTriggerDescriptor {
    return { _type: "issue", event: "opened" };
  },
  closed(): IssueTriggerDescriptor {
    return { _type: "issue", event: "closed" };
  },
  edited(): IssueTriggerDescriptor {
    return { _type: "issue", event: "edited" };
  },
  reopened(): IssueTriggerDescriptor {
    return { _type: "issue", event: "reopened" };
  },
  labeled(): IssueTriggerDescriptor {
    return { _type: "issue", event: "labeled" };
  },
  assigned(): IssueTriggerDescriptor {
    return { _type: "issue", event: "assigned" };
  },
  commented(): IssueCommentTriggerDescriptor {
    return { _type: "issue_comment", event: "created" };
  },
};

// ── Issue Comment ───────────────────────────────────────────────────────────

const issueComment = {
  created(): IssueCommentTriggerDescriptor {
    return { _type: "issue_comment", event: "created" };
  },
  edited(): IssueCommentTriggerDescriptor {
    return { _type: "issue_comment", event: "edited" };
  },
  deleted(): IssueCommentTriggerDescriptor {
    return { _type: "issue_comment", event: "deleted" };
  },
};

// ── Schedule ────────────────────────────────────────────────────────────────

function schedule(cron: string): ScheduleTriggerDescriptor {
  return { _type: "schedule", cron };
}

// ── Manual Dispatch ─────────────────────────────────────────────────────────

function manualDispatch(
  inputs?: Record<string, unknown>,
): ManualDispatchTriggerDescriptor {
  return { _type: "manual_dispatch", inputs };
}

// ── Webhook ─────────────────────────────────────────────────────────────────

function webhook(event: string): WebhookTriggerDescriptor {
  return { _type: "webhook", event };
}

// ── Workflow Run ────────────────────────────────────────────────────────────

interface WorkflowRunOptions {
  workflows: string[];
  types?: string[];
}

function workflowRun(
  options: WorkflowRunOptions,
): WorkflowRunTriggerDescriptor {
  return { _type: "workflow_run", ...options };
}

// ── Workflow Artifact ───────────────────────────────────────────────────────

interface WorkflowArtifactOptions {
  workflows?: string[];
  names?: string[];
}

function workflowArtifact(
  options?: WorkflowArtifactOptions,
): WorkflowArtifactTriggerDescriptor {
  return { _type: "workflow_artifact", ...options };
}

// ── Public API ──────────────────────────────────────────────────────────────

export const on = {
  push,
  landingRequest,
  release,
  issue,
  issueComment,
  schedule,
  manualDispatch,
  webhook,
  workflowRun,
  workflowArtifact,
} as const;
