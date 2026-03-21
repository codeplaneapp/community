/**
 * Codeplane createSmithers wrapper.
 *
 * Wraps Smithers' createSmithers to return Codeplane-extended Workflow and Task
 * components that support `triggers` and `if` props.
 */
import React from "react";
import {
  createSmithers as baseCreateSmithers,
  type CreateSmithersApi,
} from "smithers-orchestrator";
import type { SmithersWorkflow } from "smithers-orchestrator";
import type { SmithersWorkflowOptions } from "smithers-orchestrator";
import type { z } from "zod";
import {
  createWorkflowArtifactHelpers,
  type CodeplaneWorkflowCtx,
} from "./artifacts";
import { createWorkflowCacheHelpers, type WorkflowCacheDescriptor, type WorkflowCacheHelpers } from "./cache";
import type { TriggerDescriptor } from "./triggers";

// ── Codeplane-extended props ────────────────────────────────────────────────────

type CodeplaneWorkflowProps = {
  name: string;
  triggers?: TriggerDescriptor[];
  cache?: boolean;
  children?: React.ReactNode;
};

type CodeplaneTaskProps<Row> = {
  key?: string;
  id: string;
  output: z.ZodObject<any> | string;
  agent?: any;
  skipIf?: boolean;
  needsApproval?: boolean;
  timeoutMs?: number;
  retries?: number;
  continueOnFail?: boolean;
  label?: string;
  meta?: Record<string, unknown>;
  if?: string;
  cache?: WorkflowCacheDescriptor | WorkflowCacheDescriptor[];
  children: any;
};

// ── Return type ─────────────────────────────────────────────────────────────

export type CreateCodeplaneSmithersApi<Schema> = Omit<
  CreateSmithersApi<Schema>,
  "Workflow" | "Task" | "smithers"
> & {
  Workflow: (props: CodeplaneWorkflowProps) => React.ReactElement;
  Task: <Row>(props: CodeplaneTaskProps<Row>) => React.ReactElement;
  smithers: (
    build: (ctx: CodeplaneWorkflowCtx<Schema> & { cache: WorkflowCacheHelpers }) => React.ReactElement,
    opts?: SmithersWorkflowOptions,
  ) => SmithersWorkflow<Schema>;
};

// ── Factory ─────────────────────────────────────────────────────────────────

export function createSmithers<
  Schemas extends Record<string, z.ZodObject<any>>,
>(
  schemas: Schemas,
  opts?: { dbPath?: string; journalMode?: string },
): CreateCodeplaneSmithersApi<Schemas> {
  const base = baseCreateSmithers(schemas, opts);

  // Wrap Workflow to accept triggers prop
  function Workflow(props: CodeplaneWorkflowProps): React.ReactElement {
    const { triggers, ...rest } = props;
    return React.createElement(base.Workflow as any, { ...rest, triggers });
  }

  // Wrap Task to accept if prop and string output
  function Task<Row>(props: CodeplaneTaskProps<Row>): React.ReactElement {
    const { if: condition, ...rest } = props;
    const taskProps: any = { ...rest };
    if (condition) {
      taskProps.if = condition;
    }
    return React.createElement(base.Task as any, taskProps, props.children);
  }

  function smithers(
    build: (ctx: CodeplaneWorkflowCtx<Schemas> & { cache: WorkflowCacheHelpers }) => React.ReactElement,
    workflowOpts?: SmithersWorkflowOptions,
  ): SmithersWorkflow<Schemas> {
    return base.smithers((ctx) => build({
      ...ctx,
      artifacts: createWorkflowArtifactHelpers(),
      cache: createWorkflowCacheHelpers(),
    }), workflowOpts);
  }

  return {
    ...base,
    Workflow,
    Task,
    smithers,
  } as CreateCodeplaneSmithersApi<Schemas>;
}
