export const fileMap: Record<string, string> = {
  prd: "specs/prd.md",
  design: "specs/design.md",
  arch: "specs/engineering-architecture.md",
  tickets: "specs/tickets.json",
  smithers: "specs/generate.tsx",
};

export const docEnum = ["prd", "design", "arch", "tickets", "smithers"] as const;
