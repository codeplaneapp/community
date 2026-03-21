export type WorkflowCacheRestoreDescriptor = {
  action: "restore";
  key: string;
  hash_files: string[];
};

export type WorkflowCacheSaveDescriptor = {
  action: "save";
  key: string;
  paths: string[];
};

export type WorkflowCacheDescriptor =
  | WorkflowCacheRestoreDescriptor
  | WorkflowCacheSaveDescriptor;

export type WorkflowCacheHelpers = {
  restore(key: string, hashFiles?: string | string[]): WorkflowCacheRestoreDescriptor;
  save(key: string, paths: string | string[]): WorkflowCacheSaveDescriptor;
};

function normalizeStringList(value?: string | string[]): string[] {
  if (value == null) {
    return [];
  }
  const values = Array.isArray(value) ? value : [value];
  return values.map((item) => item.trim()).filter((item) => item.length > 0);
}

export function createWorkflowCacheHelpers(): WorkflowCacheHelpers {
  return {
    restore(key: string, hashFiles?: string | string[]) {
      return {
        action: "restore",
        key: key.trim(),
        hash_files: normalizeStringList(hashFiles),
      };
    },
    save(key: string, paths: string | string[]) {
      return {
        action: "save",
        key: key.trim(),
        paths: normalizeStringList(paths),
      };
    },
  };
}
