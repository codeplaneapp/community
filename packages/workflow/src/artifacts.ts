import type { SmithersCtx } from "smithers-orchestrator";

export type WorkflowArtifactRecord = {
  id?: number;
  name: string;
  size: number;
  contentType: string;
  expiresAt?: string;
};

export type WorkflowArtifactUploadOptions = {
  contentType?: string;
};

export type WorkflowArtifactClient = {
  upload(
    name: string,
    path: string,
    options?: WorkflowArtifactUploadOptions,
  ): Promise<WorkflowArtifactRecord>;
  download(name: string, path: string): Promise<WorkflowArtifactRecord>;
};

const workflowArtifactClientKey = Symbol.for("jjhub.workflow.artifacts.client");

type GlobalWithWorkflowArtifacts = typeof globalThis & {
  [workflowArtifactClientKey]?: WorkflowArtifactClient;
};

export type JJHubWorkflowCtx<Schema = Record<string, unknown>> = SmithersCtx<Schema> & {
  artifacts: WorkflowArtifactClient;
};

export function setWorkflowArtifactClient(client?: WorkflowArtifactClient): void {
  (globalThis as GlobalWithWorkflowArtifacts)[workflowArtifactClientKey] = client;
}

export function getWorkflowArtifactClient(): WorkflowArtifactClient | undefined {
  return (globalThis as GlobalWithWorkflowArtifacts)[workflowArtifactClientKey];
}

export function createWorkflowArtifactHelpers(): WorkflowArtifactClient {
  return {
    upload(name, path, options) {
      const client = getWorkflowArtifactClient();
      if (!client) {
        throw new Error("artifacts.upload is unavailable in this runtime");
      }
      return client.upload(name, path, options);
    },
    download(name, path) {
      const client = getWorkflowArtifactClient();
      if (!client) {
        throw new Error("artifacts.download is unavailable in this runtime");
      }
      return client.download(name, path);
    },
  };
}
