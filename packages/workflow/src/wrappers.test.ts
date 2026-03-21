import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ReactElement } from "react";
import { z } from "zod";
import {
  createWorkflowArtifactHelpers,
  getWorkflowArtifactClient,
  setWorkflowArtifactClient,
  type WorkflowArtifactClient,
} from "./artifacts";
import { createWorkflowCacheHelpers } from "./cache";
import { createSmithers } from "./create";
import { on } from "./triggers";

const initialArtifactClient = getWorkflowArtifactClient();
const tempDirs: string[] = [];

type TaskElementProps = {
  id: string;
  output: string;
  if?: string;
  cache?: unknown;
  children: string;
};

type WorkflowElementProps = {
  name: string;
  triggers: unknown[];
  children: ReactElement<TaskElementProps>;
};

afterEach(() => {
  setWorkflowArtifactClient(initialArtifactClient);
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

function createTempDbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "jjhub-workflow-tests-"));
  tempDirs.push(dir);
  return join(dir, "smithers.db");
}

describe("packages/workflow JJHub wrappers", () => {
  test("createSmithers passes JJHub workflow and task props through to Smithers", () => {
    const workflowApi = createSmithers(
      {
        buildResult: z.object({
          ok: z.boolean(),
        }),
      },
      {
        dbPath: createTempDbPath(),
        journalMode: "MEMORY",
      },
    );

    const triggers = [
      on.push({ bookmarks: ["main"], ignore: ["docs/**"] }),
      on.workflowRun({ workflows: ["lint"], types: ["completed"] }),
    ];

    const workflowElement = workflowApi.Workflow({
      name: "ci",
      triggers,
      children: workflowApi.Task({
        id: "build",
        output: "buildResult",
        if: "inputs.run_build",
        children: "Run the build",
      }),
    });

    const typedWorkflowElement = workflowElement as ReactElement<WorkflowElementProps>;

    expect(typedWorkflowElement.props.name).toBe("ci");
    expect(typedWorkflowElement.props.triggers).toEqual(triggers);
    expect(typedWorkflowElement.props.children.props).toMatchObject({
      id: "build",
      output: "buildResult",
      if: "inputs.run_build",
      children: "Run the build",
    });

    const unconditionalTask = workflowApi.Task({
      id: "build-without-condition",
      output: "buildResult",
      if: "",
      children: "Always run",
    });

    const typedUnconditionalTask = unconditionalTask as ReactElement<TaskElementProps>;

    expect(typedUnconditionalTask.props.if).toBeUndefined();
  });

  test("createSmithers injects artifact and cache helpers into smithers builds", () => {
    const workflowApi = createSmithers(
      {
        buildResult: z.object({
          ok: z.boolean(),
        }),
      },
      {
        dbPath: createTempDbPath(),
        journalMode: "MEMORY",
      },
    );

    const seen: Array<Record<string, unknown>> = [];
    const workflow = workflowApi.smithers((ctx) => {
      seen.push(ctx as unknown as Record<string, unknown>);
      return workflowApi.Workflow({
        name: "ci",
        triggers: [on.schedule("0 * * * *")],
        children: workflowApi.Task({
          id: "build",
          output: "buildResult",
          cache: [
            ctx.cache.restore(" build-cache ", [" bun.lock ", " "]),
            ctx.cache.save(" build-output ", [" dist ", ""]),
          ],
          children: "Run the build",
        }),
      });
    });

    const rendered = workflow.build({
      runId: "run-123",
      repository: "demo",
    } as any);

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      runId: "run-123",
      repository: "demo",
    });
    expect((seen[0] as any).artifacts).toBeObject();
    expect(typeof (seen[0] as any).artifacts.upload).toBe("function");
    expect(typeof (seen[0] as any).artifacts.download).toBe("function");
    expect((seen[0] as any).cache.restore(" deps ", " bun.lock ")).toEqual({
      action: "restore",
      key: "deps",
      hash_files: ["bun.lock"],
    });
    expect((seen[0] as any).cache.save(" build-output ", [" dist ", ""])).toEqual({
      action: "save",
      key: "build-output",
      paths: ["dist"],
    });
    const typedRendered = rendered as ReactElement<WorkflowElementProps>;

    expect(typedRendered.props.triggers).toEqual([on.schedule("0 * * * *")]);
    expect(typedRendered.props.children.props.cache).toEqual([
      {
        action: "restore",
        key: "build-cache",
        hash_files: ["bun.lock"],
      },
      {
        action: "save",
        key: "build-output",
        paths: ["dist"],
      },
    ]);
  });

  test("artifact helpers delegate to the runtime client", async () => {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const client: WorkflowArtifactClient = {
      async upload(name, path, options) {
        calls.push({ method: "upload", args: [name, path, options] });
        return {
          id: 1,
          name,
          size: 12,
          contentType: options?.contentType ?? "application/octet-stream",
        };
      },
      async download(name, path) {
        calls.push({ method: "download", args: [name, path] });
        return {
          id: 2,
          name,
          size: 12,
          contentType: "text/plain",
        };
      },
    };

    setWorkflowArtifactClient(client);
    const artifacts = createWorkflowArtifactHelpers();

    await expect(
      artifacts.upload("report.txt", "dist/report.txt", { contentType: "text/plain" }),
    ).resolves.toEqual({
      id: 1,
      name: "report.txt",
      size: 12,
      contentType: "text/plain",
    });
    await expect(artifacts.download("report.txt", "tmp/report.txt")).resolves.toEqual({
      id: 2,
      name: "report.txt",
      size: 12,
      contentType: "text/plain",
    });

    expect(calls).toEqual([
      {
        method: "upload",
        args: ["report.txt", "dist/report.txt", { contentType: "text/plain" }],
      },
      {
        method: "download",
        args: ["report.txt", "tmp/report.txt"],
      },
    ]);
  });

  test("artifact helpers fail closed when no runtime client is installed", () => {
    setWorkflowArtifactClient(undefined);
    const artifacts = createWorkflowArtifactHelpers();

    expect(() => artifacts.upload("report.txt", "dist/report.txt")).toThrow(
      "artifacts.upload is unavailable in this runtime",
    );
    expect(() => artifacts.download("report.txt", "tmp/report.txt")).toThrow(
      "artifacts.download is unavailable in this runtime",
    );
  });

  test("cache helpers normalize descriptor inputs", () => {
    const cache = createWorkflowCacheHelpers();

    expect(cache.restore(" build-cache ", [" bun.lock ", "", "package.json "])).toEqual({
      action: "restore",
      key: "build-cache",
      hash_files: ["bun.lock", "package.json"],
    });
    expect(cache.restore("build-cache")).toEqual({
      action: "restore",
      key: "build-cache",
      hash_files: [],
    });
    expect(cache.save(" build-output ", " dist ")).toEqual({
      action: "save",
      key: "build-output",
      paths: ["dist"],
    });
  });

  test("trigger builders emit renderer-compatible descriptors", () => {
    expect(on.push({ bookmarks: ["main"], tags: ["v*"], ignore: ["docs/**"] })).toEqual({
      _type: "push",
      bookmarks: ["main"],
      tags: ["v*"],
      ignore: ["docs/**"],
    });
    expect(on.landingRequest.readyToLand()).toEqual({
      _type: "landing_request",
      event: "ready_to_land",
    });
    expect(on.issue.labeled()).toEqual({
      _type: "issue",
      event: "labeled",
    });
    expect(on.schedule("*/15 * * * *")).toEqual({
      _type: "schedule",
      cron: "*/15 * * * *",
    });
    expect(on.manualDispatch({ dryRun: true })).toEqual({
      _type: "manual_dispatch",
      inputs: { dryRun: true },
    });
    expect(on.webhook("deployment.finished")).toEqual({
      _type: "webhook",
      event: "deployment.finished",
    });
    expect(on.workflowRun({ workflows: ["build"], types: ["completed"] })).toEqual({
      _type: "workflow_run",
      workflows: ["build"],
      types: ["completed"],
    });
    expect(on.workflowArtifact({ workflows: ["research"], names: ["research-*"] })).toEqual({
      _type: "workflow_artifact",
      workflows: ["research"],
      names: ["research-*"],
    });
  });
});
