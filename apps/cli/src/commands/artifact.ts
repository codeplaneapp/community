import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Cli, z } from "incur";
import { api, resolveRepoRef } from "../client.js";

type WorkflowArtifactRecord = {
  id: number;
  repository_id: number;
  workflow_run_id: number;
  name: string;
  size: number;
  content_type: string;
  status: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
};

type WorkflowArtifactListResponse = {
  artifacts: WorkflowArtifactRecord[];
};

type WorkflowArtifactDownloadResponse = WorkflowArtifactRecord & {
  download_url: string;
};

export const artifact = Cli.create("artifact", {
  description: "List and download workflow artifacts",
})
  .command("list", {
    description: "List artifacts for a workflow run",
    args: z.object({
      runId: z.number().describe("Run ID"),
    }),
    options: z.object({
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      const { owner, repo } = resolveRepoRef(c.options.repo);
      return api<WorkflowArtifactListResponse>(
        "GET",
        `/api/repos/${owner}/${repo}/actions/runs/${c.args.runId}/artifacts`,
      );
    },
  })
  .command("download", {
    description: "Download an artifact from a workflow run",
    args: z.object({
      runId: z.number().describe("Run ID"),
      name: z.string().describe("Artifact name"),
    }),
    options: z.object({
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
      output: z.string().optional().describe("Output path (defaults to artifact name)"),
    }),
    async run(c) {
      const { owner, repo } = resolveRepoRef(c.options.repo);
      const artifact = await api<WorkflowArtifactDownloadResponse>(
        "GET",
        `/api/repos/${owner}/${repo}/actions/runs/${c.args.runId}/artifacts/${encodeURIComponent(c.args.name)}/download`,
      );

      const outputPath = resolve(c.options.output ?? artifact.name);
      await mkdir(dirname(outputPath), { recursive: true });

      const response = await fetch(artifact.download_url);
      if (!response.ok || response.body == null) {
        throw new Error(
          `Failed to download artifact: ${response.status} ${response.statusText}`,
        );
      }

      await pipeline(
        Readable.fromWeb(response.body as any),
        createWriteStream(outputPath),
      );

      return {
        name: artifact.name,
        path: outputPath,
        size: artifact.size,
        content_type: artifact.content_type,
      };
    },
  });
