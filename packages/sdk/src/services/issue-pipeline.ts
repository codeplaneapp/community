/**
 * Issue Pipeline Service — automated issue-to-landing-request pipeline.
 *
 * Implements the automated pipeline described in product.md section 6.4
 * and engineering.md section 3.4.3:
 *
 *   Research → Plan → Implement → Review → Land
 *
 * Each step creates a workflow run that produces artifacts consumed by the
 * next step. The pipeline is triggered when an issue is labeled with the
 * configured trigger label (default: "automate").
 *
 * In Community Edition, agent steps use BYOK (the user's own API key stored
 * as a repository secret) or stub out the LLM calls for testing.
 *
 * Mirrors Go's internal/services pattern for the Codeplane Cloud implementation.
 */

import type { Sql } from "postgres";
import {
  badRequest,
  conflict,
  notFound,
} from "../lib/errors";

import {
  getIssueByID as dbGetIssueByID,
  createIssueComment as dbCreateIssueComment,
  incrementIssueCommentCount as dbIncrementIssueCommentCount,
} from "../db/issues_sql";

import {
  getRepoByID as dbGetRepoByID,
} from "../db/repos_sql";

import {
  getUserByID as dbGetUserByID,
} from "../db/users_sql";

import {
  getOrgByID as dbGetOrgByID,
} from "../db/orgs_sql";

import {
  createWorkflowRun as dbCreateWorkflowRun,
  createWorkflowStep as dbCreateWorkflowStep,
  createWorkflowTask as dbCreateWorkflowTask,
  cancelWorkflowRun as dbCancelWorkflowRun,
  cancelWorkflowTasks as dbCancelWorkflowTasks,
  ensureWorkflowDefinitionReference as dbEnsureWorkflowDefinitionReference,
} from "../db/workflows_sql";

import {
  updateWorkflowRunAgentToken as dbUpdateWorkflowRunAgentToken,
} from "../db/workflow_runs_agent_tokens_sql";

import { createHash, randomBytes } from "crypto";

// ---------------------------------------------------------------------------
// Pipeline step definitions
// ---------------------------------------------------------------------------

/**
 * The five steps of the automated issue pipeline, executed in order.
 * Each step produces artifacts that feed into the next.
 */
export const PIPELINE_STEPS = [
  "research",
  "plan",
  "implement",
  "review",
  "land",
] as const;

export type PipelineStep = (typeof PIPELINE_STEPS)[number];

/**
 * The default label that triggers the automated pipeline.
 */
export const DEFAULT_TRIGGER_LABEL = "automate";

// ---------------------------------------------------------------------------
// Pipeline status types
// ---------------------------------------------------------------------------

export type PipelineStepStatus =
  | "pending"
  | "running"
  | "success"
  | "failure"
  | "skipped"
  | "cancelled";

export interface PipelineStepState {
  step: PipelineStep;
  status: PipelineStepStatus;
  workflowRunId: string | null;
  artifactNames: string[];
  startedAt: string | null;
  completedAt: string | null;
}

export interface PipelineStatus {
  issueId: string;
  repositoryId: string;
  status: "pending" | "running" | "success" | "failure" | "cancelled";
  currentStep: PipelineStep | null;
  steps: PipelineStepState[];
  landingRequestNumber: number | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Pipeline configuration
// ---------------------------------------------------------------------------

export interface IssuePipelineConfig {
  /**
   * Label name that triggers the pipeline when applied to an issue.
   * Default: "automate"
   */
  triggerLabel?: string;

  /**
   * Name of the repository secret holding the LLM API key for agent steps.
   * In CE, users provide their own key via `codeplane secret set`.
   * Default: "CODEPLANE_LLM_API_KEY"
   */
  llmApiKeySecret?: string;

  /**
   * If true, LLM calls are stubbed out (useful for testing).
   * Default: false
   */
  stubLlmCalls?: boolean;

  /**
   * Maximum duration in seconds for each pipeline step.
   * Default: 600 (10 minutes)
   */
  stepTimeoutSeconds?: number;

  /**
   * The bookmark (branch) to create the ephemeral workspace from.
   * Default: repository's default bookmark
   */
  baseBookmark?: string;
}

// ---------------------------------------------------------------------------
// Internal in-memory pipeline state tracking
// ---------------------------------------------------------------------------

interface PipelineRecord {
  issueId: string;
  repositoryId: string;
  repoOwner: string;
  repoName: string;
  issueNumber: number;
  issueTitle: string;
  issueBody: string;
  config: Required<Pick<IssuePipelineConfig, "triggerLabel" | "llmApiKeySecret" | "stubLlmCalls" | "stepTimeoutSeconds">>;
  status: PipelineStatus["status"];
  currentStepIndex: number;
  steps: PipelineStepState[];
  workflowRunIds: Map<PipelineStep, string>;
  landingRequestNumber: number | null;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Pipeline workflow definition configs — one per step
// ---------------------------------------------------------------------------

function researchWorkflowConfig(issueNumber: number): unknown {
  return {
    on: { workflow_dispatch: { inputs: {} } },
    jobs: {
      research: {
        name: "research",
        "runs-on": "codeplane-agent",
        steps: [
          {
            name: "Gather context",
            agent: {
              task: "research",
              prompt: `Research issue #${issueNumber}: gather relevant code context, related issues, documentation, and any applicable patterns from the codebase.`,
            },
          },
        ],
      },
    },
  };
}

function planWorkflowConfig(issueNumber: number): unknown {
  return {
    on: { workflow_dispatch: { inputs: {} } },
    jobs: {
      plan: {
        name: "plan",
        "runs-on": "codeplane-agent",
        steps: [
          {
            name: "Create plan",
            agent: {
              task: "plan",
              prompt: `Based on the research artifact, create a detailed implementation plan for issue #${issueNumber}. Include: files to modify, approach, test strategy, and potential risks.`,
            },
          },
        ],
      },
    },
  };
}

function implementWorkflowConfig(issueNumber: number): unknown {
  return {
    on: { workflow_dispatch: { inputs: {} } },
    jobs: {
      implement: {
        name: "implement",
        "runs-on": "codeplane-workspace",
        steps: [
          {
            name: "Write code and tests",
            agent: {
              task: "implement",
              prompt: `Using the plan artifact, implement the changes for issue #${issueNumber}. Write code, add tests, and commit with jj. Ensure all tests pass before completing.`,
            },
          },
        ],
      },
    },
  };
}

function reviewWorkflowConfig(issueNumber: number): unknown {
  return {
    on: { workflow_dispatch: { inputs: {} } },
    jobs: {
      review: {
        name: "review",
        "runs-on": "codeplane-agent",
        steps: [
          {
            name: "Self-review changes",
            agent: {
              task: "review",
              prompt: `Review the implementation changes for issue #${issueNumber}. Check for: correctness, test coverage, code style, edge cases, and potential regressions. Produce a review artifact with approve/request-changes.`,
            },
          },
        ],
      },
    },
  };
}

function landWorkflowConfig(issueNumber: number): unknown {
  return {
    on: { workflow_dispatch: { inputs: {} } },
    jobs: {
      land: {
        name: "land",
        "runs-on": "codeplane-agent",
        steps: [
          {
            name: "Create landing request",
            agent: {
              task: "land",
              prompt: `Create a Landing Request from the workspace changes for issue #${issueNumber}. Link the LR back to the issue and include the review artifact summary in the description.`,
            },
          },
        ],
      },
    },
  };
}

function workflowConfigForStep(step: PipelineStep, issueNumber: number): unknown {
  switch (step) {
    case "research":
      return researchWorkflowConfig(issueNumber);
    case "plan":
      return planWorkflowConfig(issueNumber);
    case "implement":
      return implementWorkflowConfig(issueNumber);
    case "review":
      return reviewWorkflowConfig(issueNumber);
    case "land":
      return landWorkflowConfig(issueNumber);
  }
}

// ---------------------------------------------------------------------------
// Agent token generation — mirrors Go's generateAgentToken
// ---------------------------------------------------------------------------

function generateAgentToken(): { plaintext: string; hash: string } {
  const hexPart = randomBytes(20).toString("hex");
  const plaintext = "codeplane_agent_" + hexPart;
  const hash = createHash("sha256").update(plaintext).digest("hex");
  return { plaintext, hash };
}

// ---------------------------------------------------------------------------
// Repo owner resolution — mirrors Go's resolveRepoOwner
// ---------------------------------------------------------------------------

async function resolveRepoOwner(
  sql: Sql,
  repo: { userId: string | null; orgId: string | null },
): Promise<string> {
  if (repo.userId) {
    const user = await dbGetUserByID(sql, { id: repo.userId });
    if (user) return user.username;
  }
  if (repo.orgId) {
    const org = await dbGetOrgByID(sql, { id: repo.orgId });
    if (org) return org.name;
  }
  return "";
}

// ---------------------------------------------------------------------------
// IssuePipelineService
// ---------------------------------------------------------------------------

export class IssuePipelineService {
  private readonly sql: Sql;
  private readonly pipelines: Map<string, PipelineRecord> = new Map();

  constructor(sql: Sql) {
    this.sql = sql;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * triggerIssuePipeline starts the automated pipeline for an issue.
   *
   * This is called when an issue receives the trigger label (e.g. "automate").
   * It validates the issue exists, initializes pipeline state, posts a status
   * comment on the issue, and kicks off the first step (research).
   */
  async triggerIssuePipeline(
    issueId: string,
    repositoryId: string,
    config?: IssuePipelineConfig,
  ): Promise<PipelineStatus> {
    // Validate inputs
    if (!issueId || Number(issueId) <= 0) {
      throw badRequest("issue id must be positive");
    }
    if (!repositoryId || Number(repositoryId) <= 0) {
      throw badRequest("repository id must be positive");
    }

    // Check for existing pipeline
    const existingKey = pipelineKey(issueId, repositoryId);
    const existing = this.pipelines.get(existingKey);
    if (existing && existing.status === "running") {
      throw conflict("a pipeline is already running for this issue");
    }

    // Load the issue
    const issue = await dbGetIssueByID(this.sql, { id: issueId });
    if (!issue) {
      throw notFound("issue not found");
    }

    // Load the repository
    const repo = await dbGetRepoByID(this.sql, { id: repositoryId });
    if (!repo) {
      throw notFound("repository not found");
    }

    const repoOwner = await resolveRepoOwner(this.sql, {
      userId: repo.userId,
      orgId: repo.orgId,
    });

    // Resolve config with defaults
    const resolvedConfig = {
      triggerLabel: config?.triggerLabel ?? DEFAULT_TRIGGER_LABEL,
      llmApiKeySecret: config?.llmApiKeySecret ?? "CODEPLANE_LLM_API_KEY",
      stubLlmCalls: config?.stubLlmCalls ?? false,
      stepTimeoutSeconds: config?.stepTimeoutSeconds ?? 600,
    };

    // Initialize pipeline record
    const now = new Date();
    const steps: PipelineStepState[] = PIPELINE_STEPS.map((step) => ({
      step,
      status: "pending" as PipelineStepStatus,
      workflowRunId: null,
      artifactNames: [],
      startedAt: null,
      completedAt: null,
    }));

    const record: PipelineRecord = {
      issueId,
      repositoryId,
      repoOwner,
      repoName: repo.name,
      issueNumber: Number(issue.number),
      issueTitle: issue.title,
      issueBody: issue.body,
      config: resolvedConfig,
      status: "running",
      currentStepIndex: 0,
      steps,
      workflowRunIds: new Map(),
      landingRequestNumber: null,
      createdAt: now,
      updatedAt: now,
    };

    this.pipelines.set(existingKey, record);

    // Post status comment on the issue
    await this.postStatusComment(
      record,
      `Automated pipeline started for issue #${record.issueNumber}.\n\nSteps: ${PIPELINE_STEPS.join(" → ")}\n\nStarting with **research** step...`,
    );

    // Kick off the first step
    await this.executeStep(record, "research");

    return this.toPipelineStatus(record);
  }

  /**
   * getPipelineStatus returns the current status of a pipeline for an issue.
   */
  async getPipelineStatus(
    issueId: string,
    repositoryId?: string,
  ): Promise<PipelineStatus | null> {
    // Search by issueId, optionally filtered by repositoryId
    for (const [, record] of this.pipelines) {
      if (record.issueId === issueId) {
        if (repositoryId && record.repositoryId !== repositoryId) continue;
        return this.toPipelineStatus(record);
      }
    }
    return null;
  }

  /**
   * cancelPipeline cancels an in-progress pipeline for an issue.
   *
   * Cancels the current workflow run and marks all remaining steps as cancelled.
   */
  async cancelPipeline(
    issueId: string,
    repositoryId?: string,
  ): Promise<PipelineStatus> {
    let record: PipelineRecord | undefined;

    for (const [, r] of this.pipelines) {
      if (r.issueId === issueId) {
        if (repositoryId && r.repositoryId !== repositoryId) continue;
        record = r;
        break;
      }
    }

    if (!record) {
      throw notFound("no pipeline found for this issue");
    }

    if (record.status !== "running") {
      throw conflict(`cannot cancel pipeline with status "${record.status}"`);
    }

    // Cancel the current workflow run if one exists
    const currentStep = PIPELINE_STEPS[record.currentStepIndex];
    if (currentStep) {
      const runId = record.workflowRunIds.get(currentStep);
      if (runId) {
        try {
          await dbCancelWorkflowRun(this.sql, { id: runId });
          await dbCancelWorkflowTasks(this.sql, { workflowRunId: runId });
        } catch {
          // Non-fatal: the run may already be in a terminal state
        }
      }
    }

    // Mark all non-completed steps as cancelled
    for (const step of record.steps) {
      if (step.status === "pending" || step.status === "running") {
        step.status = "cancelled";
        step.completedAt = new Date().toISOString();
      }
    }

    record.status = "cancelled";
    record.updatedAt = new Date();

    await this.postStatusComment(
      record,
      `Automated pipeline **cancelled** for issue #${record.issueNumber}.`,
    );

    return this.toPipelineStatus(record);
  }

  /**
   * advancePipeline is called when a workflow run completes to advance
   * the pipeline to the next step.
   *
   * This is wired into the workflow event system: when a pipeline step's
   * workflow run reaches a terminal status, this method is called.
   */
  async advancePipeline(
    issueId: string,
    repositoryId: string,
    completedStep: PipelineStep,
    runStatus: "success" | "failure",
    artifactNames: string[],
  ): Promise<PipelineStatus | null> {
    const key = pipelineKey(issueId, repositoryId);
    const record = this.pipelines.get(key);
    if (!record || record.status !== "running") return null;

    const stepIndex = PIPELINE_STEPS.indexOf(completedStep);
    if (stepIndex < 0 || stepIndex !== record.currentStepIndex) return null;

    const stepState = record.steps[stepIndex]!;
    stepState.status = runStatus;
    stepState.completedAt = new Date().toISOString();
    stepState.artifactNames = artifactNames;
    record.updatedAt = new Date();

    if (runStatus === "failure") {
      // Pipeline fails when any step fails
      record.status = "failure";
      await this.postStatusComment(
        record,
        `Automated pipeline **failed** at step **${completedStep}** for issue #${record.issueNumber}.`,
      );
      return this.toPipelineStatus(record);
    }

    // Check if this was the last step
    const nextStepIndex = stepIndex + 1;
    if (nextStepIndex >= PIPELINE_STEPS.length) {
      record.status = "success";
      await this.postStatusComment(
        record,
        `Automated pipeline **completed** for issue #${record.issueNumber}. All steps passed.` +
          (record.landingRequestNumber
            ? ` Landing Request #${record.landingRequestNumber} created.`
            : ""),
      );
      return this.toPipelineStatus(record);
    }

    // Advance to next step
    record.currentStepIndex = nextStepIndex;
    const nextStep = PIPELINE_STEPS[nextStepIndex]!;

    await this.postStatusComment(
      record,
      `Step **${completedStep}** completed. Advancing to **${nextStep}** step for issue #${record.issueNumber}...`,
    );

    await this.executeStep(record, nextStep);

    return this.toPipelineStatus(record);
  }

  /**
   * setLandingRequestNumber records the LR number created by the land step.
   */
  setLandingRequestNumber(
    issueId: string,
    repositoryId: string,
    lrNumber: number,
  ): void {
    const key = pipelineKey(issueId, repositoryId);
    const record = this.pipelines.get(key);
    if (record) {
      record.landingRequestNumber = lrNumber;
      record.updatedAt = new Date();
    }
  }

  /**
   * shouldTriggerPipeline checks whether an issue event should trigger the
   * automated pipeline. Returns true if the issue has the trigger label.
   */
  shouldTriggerPipeline(
    labels: Array<{ name: string }>,
    action: string,
    config?: IssuePipelineConfig,
  ): boolean {
    const triggerLabel = config?.triggerLabel ?? DEFAULT_TRIGGER_LABEL;

    // Trigger when the label is added (action = "labeled") or when the issue
    // is opened with the label already applied (action = "opened").
    if (action !== "labeled" && action !== "opened") return false;

    return labels.some(
      (l) => l.name.toLowerCase() === triggerLabel.toLowerCase(),
    );
  }

  /**
   * listActivePipelines returns all currently active pipelines.
   * Useful for the admin dashboard and monitoring.
   */
  listActivePipelines(): PipelineStatus[] {
    const active: PipelineStatus[] = [];
    for (const [, record] of this.pipelines) {
      if (record.status === "running") {
        active.push(this.toPipelineStatus(record));
      }
    }
    return active;
  }

  // -------------------------------------------------------------------------
  // Internal methods
  // -------------------------------------------------------------------------

  /**
   * executeStep creates a workflow run for the given pipeline step.
   *
   * Each step:
   * 1. Creates a workflow definition reference for the step
   * 2. Creates a workflow run with step-specific configuration
   * 3. Creates the step and task records
   * 4. Updates the pipeline state
   */
  private async executeStep(
    record: PipelineRecord,
    step: PipelineStep,
  ): Promise<void> {
    const stepIndex = PIPELINE_STEPS.indexOf(step);
    const stepState = record.steps[stepIndex]!;
    stepState.status = "running";
    stepState.startedAt = new Date().toISOString();
    record.updatedAt = new Date();

    const workflowConfig = workflowConfigForStep(step, record.issueNumber);
    const definitionName = `issue-pipeline-${step}`;
    const definitionPath = `.codeplane/workflows/issue-pipeline-${step}.ts`;

    // Ensure workflow definition reference exists
    const defRef = await dbEnsureWorkflowDefinitionReference(this.sql, {
      repositoryId: record.repositoryId,
      name: definitionName,
      path: definitionPath,
      config: workflowConfig,
    });
    if (!defRef) {
      stepState.status = "failure";
      stepState.completedAt = new Date().toISOString();
      record.status = "failure";
      return;
    }

    // Create the workflow run
    const run = await dbCreateWorkflowRun(this.sql, {
      repositoryId: record.repositoryId,
      workflowDefinitionId: defRef.id,
      status: "queued",
      triggerEvent: "issue_pipeline",
      triggerRef: record.config.triggerLabel,
      triggerCommitSha: "",
      dispatchInputs: {
        pipeline_step: step,
        issue_id: record.issueId,
        issue_number: record.issueNumber,
        issue_title: record.issueTitle,
        issue_body: record.issueBody,
        repo_owner: record.repoOwner,
        repo_name: record.repoName,
        stub_llm: record.config.stubLlmCalls,
        llm_api_key_secret: record.config.llmApiKeySecret,
        step_timeout_seconds: record.config.stepTimeoutSeconds,
        // Pass artifact names from previous steps as input context
        previous_artifacts: this.collectPreviousArtifacts(record, stepIndex),
      },
    });

    if (!run) {
      stepState.status = "failure";
      stepState.completedAt = new Date().toISOString();
      record.status = "failure";
      return;
    }

    stepState.workflowRunId = run.id;
    record.workflowRunIds.set(step, run.id);

    // Generate and store agent token
    const { plaintext: agentToken, hash: tokenHash } = generateAgentToken();
    const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await dbUpdateWorkflowRunAgentToken(this.sql, {
      agentTokenHash: tokenHash,
      agentTokenExpiresAt: tokenExpiry,
      id: run.id,
    });

    // Create workflow step record
    const workflowStep = await dbCreateWorkflowStep(this.sql, {
      workflowRunId: run.id,
      name: step,
      position: "1",
      status: "queued",
    });
    if (!workflowStep) {
      stepState.status = "failure";
      stepState.completedAt = new Date().toISOString();
      record.status = "failure";
      return;
    }

    // Create workflow task record
    const taskPayload = {
      job: step,
      runs_on: step === "implement" ? "codeplane-workspace" : "codeplane-agent",
      steps: (workflowConfig as { jobs: Record<string, { steps: unknown[] }> }).jobs[step]?.steps ?? [],
      event: "issue_pipeline",
      ref: record.config.triggerLabel,
      commit: "",
      agent_token: agentToken,
      pipeline_step: step,
      issue_id: record.issueId,
      issue_number: record.issueNumber,
      repo_name: record.repoName,
      repo_owner: record.repoOwner,
    };

    await dbCreateWorkflowTask(this.sql, {
      workflowRunId: run.id,
      workflowStepId: workflowStep.id,
      repositoryId: record.repositoryId,
      status: "pending",
      priority: 0,
      payload: taskPayload,
      availableAt: new Date(),
      freestyleVmId: null,
    });
  }

  /**
   * collectPreviousArtifacts gathers artifact names from all completed
   * steps before the current one. These are passed as inputs to subsequent
   * steps so agents can access the output from earlier stages.
   */
  private collectPreviousArtifacts(
    record: PipelineRecord,
    currentStepIndex: number,
  ): Record<string, string[]> {
    const artifacts: Record<string, string[]> = {};
    for (let i = 0; i < currentStepIndex; i++) {
      const step = record.steps[i]!;
      if (step.artifactNames.length > 0) {
        artifacts[step.step] = step.artifactNames;
      }
    }
    return artifacts;
  }

  /**
   * postStatusComment creates a comment on the issue with pipeline status.
   * Errors are non-fatal — a comment failure must not block the pipeline.
   */
  private async postStatusComment(
    record: PipelineRecord,
    body: string,
  ): Promise<void> {
    try {
      const comment = await dbCreateIssueComment(this.sql, {
        issueId: record.issueId,
        userId: "0", // system user
        body: `**[Issue Pipeline]** ${body}`,
        commenter: "codeplane-bot",
      });
      if (comment) {
        await dbIncrementIssueCommentCount(this.sql, { id: record.issueId });
      }
    } catch {
      // Non-fatal: comment delivery failure must not block the pipeline
    }
  }

  /**
   * toPipelineStatus maps an internal PipelineRecord to the public
   * PipelineStatus response type.
   */
  private toPipelineStatus(record: PipelineRecord): PipelineStatus {
    const currentStep =
      record.currentStepIndex < PIPELINE_STEPS.length
        ? PIPELINE_STEPS[record.currentStepIndex]!
        : null;

    return {
      issueId: record.issueId,
      repositoryId: record.repositoryId,
      status: record.status,
      currentStep,
      steps: record.steps.map((s) => ({ ...s })),
      landingRequestNumber: record.landingRequestNumber,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pipelineKey(issueId: string, repositoryId: string): string {
  return `${repositoryId}:${issueId}`;
}

/**
 * createIssuePipelineTriggerHandler creates a handler function that can be
 * wired into the workflow trigger system. When an issue event arrives with
 * the trigger label, it starts the pipeline.
 *
 * Usage in the server wiring:
 *
 *   const handler = createIssuePipelineTriggerHandler(sql, config);
 *   // In the issue webhook/event handler:
 *   await handler(issueEvent);
 */
export function createIssuePipelineTriggerHandler(
  sql: Sql,
  config?: IssuePipelineConfig,
): IssuePipelineTriggerHandler {
  const service = new IssuePipelineService(sql);

  return {
    service,
    async handleIssueEvent(event: IssuePipelineEvent): Promise<void> {
      const labels = event.labels ?? [];
      if (!service.shouldTriggerPipeline(labels, event.action, config)) {
        return;
      }

      try {
        await service.triggerIssuePipeline(
          event.issueId,
          event.repositoryId,
          config,
        );
      } catch (err) {
        // Log but don't throw — pipeline trigger failures are non-fatal
        // to the issue event flow. The user can retry by re-applying the label.
        if (err instanceof Error) {
          console.error(
            `Issue pipeline trigger failed for issue ${event.issueId}:`,
            err.message,
          );
        }
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Trigger handler types
// ---------------------------------------------------------------------------

export interface IssuePipelineEvent {
  issueId: string;
  repositoryId: string;
  action: string;
  labels?: Array<{ name: string }>;
}

export interface IssuePipelineTriggerHandler {
  service: IssuePipelineService;
  handleIssueEvent(event: IssuePipelineEvent): Promise<void>;
}
