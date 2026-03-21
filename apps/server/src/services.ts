/**
 * Service registry for JJHub Community Edition server.
 *
 * Initializes all SDK service instances with the database connection
 * and exposes them via getServices(). Call initServices() once at startup
 * after initDb().
 */

import { getDb, getBlobStore } from "@jjhub/sdk";
import {
  UserService,
  RepoService,
  IssueService,
  LabelService,
  MilestoneService,
  LandingService,
  OrgService,
  WikiService,
  SearchService,
  WebhookService,
  WorkflowService,
  NotificationService,
  SecretService,
  ReleaseService,
  OAuth2Service,
  LFSService,
  SSEManager,
  WorkspaceService,
  ContainerSandboxClient,
  PreviewService,
  BillingService,
} from "@jjhub/sdk";

// ---------------------------------------------------------------------------
// Services type — every service available to route handlers
// ---------------------------------------------------------------------------

export interface Services {
  user: UserService;
  repo: RepoService;
  issue: IssueService;
  label: LabelService;
  milestone: MilestoneService;
  landing: LandingService;
  org: OrgService;
  wiki: WikiService;
  search: SearchService;
  webhook: WebhookService;
  workflow: WorkflowService;
  notification: NotificationService;
  secret: SecretService;
  release: ReleaseService;
  oauth2: OAuth2Service;
  lfs: LFSService;
  sse: SSEManager;
  workspace: WorkspaceService;
  preview: PreviewService;
  billing: BillingService;
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let services: Services | null = null;

/**
 * Initialize all services. Must be called after initDb().
 */
export function initServices(): void {
  const db = getDb();
  const blobs = getBlobStore();

  const sse = new SSEManager(db);

  // Container sandbox client — attempt detection (null if no runtime found)
  let sandbox: ContainerSandboxClient | null = null;
  try {
    sandbox = ContainerSandboxClient.withRuntime(
      (process.env.JJHUB_CONTAINER_RUNTIME as "docker" | "podman") ?? "docker",
      process.env.JJHUB_WORKSPACE_SSH_HOST ?? "localhost"
    );
  } catch {
    console.warn("Container sandbox client unavailable — workspace features disabled");
  }

  services = {
    user: new UserService(db),
    repo: new RepoService(db),
    issue: new IssueService(db),
    label: new LabelService(db),
    milestone: new MilestoneService(db),
    landing: new LandingService(db),
    org: new OrgService(db),
    wiki: new WikiService(db),
    search: new SearchService(db),
    webhook: new WebhookService(db),
    workflow: new WorkflowService(db),
    notification: new NotificationService(db),
    secret: new SecretService(db),
    release: new ReleaseService(db, blobs),
    oauth2: new OAuth2Service(db),
    lfs: new LFSService(db, blobs),
    sse,
    workspace: new WorkspaceService(db, sandbox, {
      sshHost: process.env.JJHUB_WORKSPACE_SSH_HOST ?? "localhost",
      username: process.env.JJHUB_WORKSPACE_USERNAME ?? "root",
      persistence: process.env.JJHUB_WORKSPACE_PERSISTENCE ?? "persistent",
    }),
    preview: new PreviewService(db, sandbox, {
      previewDomain: process.env.JJHUB_PREVIEW_DOMAIN ?? "",
      hostAddress: process.env.JJHUB_PREVIEW_HOST ?? "localhost",
    }),
    billing: new BillingService(db, {
      billingEnabled: process.env.JJHUB_BILLING_ENABLED === "true",
    }),
  };

  // Start SSE manager (best-effort, non-blocking)
  sse.start().catch((err) => {
    console.warn("SSE manager failed to start:", err);
  });
}

/**
 * Get the initialized service registry. Throws if initServices() has not been called.
 */
export function getServices(): Services {
  if (!services) {
    throw new Error("Services not initialized. Call initServices() first.");
  }
  return services;
}
