export type WorkspaceStatus =
  | "pending"
  | "starting"
  | "running"
  | "suspended"
  | "stopped"
  | "failed";

export type WorkspaceSessionStatus =
  | "running"
  | "stopped"
  | "failed";

export interface Workspace {
  id: string;
  repository_id: number;
  user_id: number;
  name: string;
  status: WorkspaceStatus;
  is_fork: boolean;
  parent_workspace_id?: string;
  freestyle_vm_id: string;
  persistence: string;
  ssh_host?: string;
  snapshot_id?: string;
  idle_timeout_seconds: number;
  suspended_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceSession {
  id: string;
  workspace_id: string;
  repository_id: number;
  user_id: number;
  status: WorkspaceSessionStatus;
  cols: number;
  rows: number;
  last_activity_at: string;
  idle_timeout_secs: number;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceSSHInfo {
  workspace_id: string;
  session_id: string;
  vm_id: string;
  host: string;
  ssh_host: string;
  username: string;
  port: number;
  access_token: string;
  command: string;
}

export interface WorkspaceSnapshot {
  id: string;
  repository_id: number;
  user_id: number;
  name: string;
  workspace_id?: string;
  freestyle_snapshot_id: string;
  created_at: string;
  updated_at: string;
}

export interface CreateWorkspaceRequest {
  name: string;
  snapshot_id?: string;
}

export interface CreateWorkspaceSessionRequest {
  workspace_id: string;
  cols?: number;
  rows?: number;
}

export interface CreateWorkspaceSnapshotRequest {
  workspace_id: string;
  name?: string;
}

export interface WorkspacesOptions {
  page?: number;
  perPage?: number;
  status?: WorkspaceStatus;
  enabled?: boolean;
}

export interface WorkspaceSessionsOptions {
  page?: number;
  perPage?: number;
  enabled?: boolean;
}

export interface WorkspaceSnapshotsOptions {
  page?: number;
  perPage?: number;
  enabled?: boolean;
}

export interface WorkspaceStatusEvent {
  workspace_id: string;
  status: WorkspaceStatus;
}

export interface WorkspaceSessionStatusEvent {
  session_id: string;
  status: WorkspaceSessionStatus;
}
