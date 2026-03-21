/**
 * Codeplane workflow components.
 *
 * These wrap Smithers primitives with Codeplane-specific props (triggers, optional
 * output, conditional execution). The rendered JSX tree is identical to what
 * Smithers produces — the workflow renderer traverses it the same way.
 */
import React from "react";
import { Workflow as SmithersWorkflow } from "smithers-orchestrator";
import type { WorkflowCacheDescriptor } from "./cache";
import type { TriggerDescriptor } from "./triggers";

// ── Workflow ────────────────────────────────────────────────────────────────

export type WorkflowProps = {
  name: string;
  triggers?: TriggerDescriptor[];
  cache?: boolean;
  children?: React.ReactNode;
};

export function Workflow(props: WorkflowProps): React.ReactElement {
  const { triggers, ...rest } = props;
  return React.createElement(SmithersWorkflow as any, { ...rest, triggers });
}

// ── Task ────────────────────────────────────────────────────────────────────

export type TaskProps = {
  key?: string;
  id: string;
  output?: import("zod").ZodObject<any> | string;
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

export function Task(props: TaskProps): React.ReactElement {
  const { if: condition, ...rest } = props;
  const taskProps: any = { ...rest };
  if (condition) {
    taskProps.if = condition;
  }
  return React.createElement("smithers:task" as any, taskProps, props.children);
}
