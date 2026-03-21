export type RunResult = {
  runId: string;
  status: "finished" | "failed" | "cancelled" | "waiting-approval";
  output?: unknown;
  error?: unknown;
};
