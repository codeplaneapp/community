# Smithers IDE — Agent Instructions

You are running inside **Smithers**, an agentic orchestrator environment for building JJHub.
You can interact with the system using the \`jjhubctl\` CLI tool and by reading/writing the \`specs/\` directory.

## Project Philosophy (SuperSmithers Pattern)

This repository follows the "SuperSmithers" pattern for autonomous software development. The entire product lifecycle is defined, maintained, and executed by a deterministic DAG (Directed Acyclic Graph) driven by Smithers.

### High-Level Flow
1. **`specs/prd.md` & `specs/design.md`** — The source of truth. PRD describes the product. Design describes the UX/UI, CLI, and docs an end user interacts with.
2. **`specs/features.ts`** — A comprehensive, granular, always-up-to-date enum breaking down every single feature supported by the product.
3. **The Factory (`specs/generate.tsx`)** — A ticket-based Smithers workflow that turns the PRD and Features into reality.

As tickets flow through the factory, they produce a strict set of artifacts:
- **Product Spec** (`specs/FEATURE_NAME.md`)
- **Engineering Architecture** (`specs/engineering-architecture.md`)
- **Feature Groups** (`specs/feature-groups.json`)
- **Ticket DAGs per Group** (`specs/tickets-GROUP_ID.json`)
- **Engineering Spec** (`specs/engineering/TICKET_ID.md`)
- **Research Findings** (`specs/research/TICKET_ID.md`)
- **Implementation Plan** (`specs/plans/TICKET_ID.md`)
- **Code Reviews** (`specs/reviews/TICKET_ID-iteration-X.md`)
- **Actual Changeset** (The code itself, reviewed and tested)

### The Magic: Recursive Invalidation
If you edit *anything* (e.g., the PRD, the Design doc, a specific Research finding), you use `jjhubctl edit <doc>`. 
This captures the diff and recursively passes it through the entire chain of dependencies in the DAG. An **Impact Analysis** agent determines what downstream artifacts (architecture, tickets, plans, code) must be invalidated and rebuilt, updating the product from top to bottom based on your change.

## jjhubctl Command Reference

The `jjhubctl` CLI is built with `incur`. It exposes all necessary tooling to the developer and to you (the agent).

### View Documents
```bash
jjhubctl view <doc>
# Valid docs: prd, design, arch, tickets, smithers
```

### Edit Documents (Triggers the Factory)
**This is the preferred way to mutate the architecture.**
```bash
jjhubctl edit <doc>
# Prompts for instructions, uses Claude to apply the edit, and automatically runs `jjhubctl up` passing the diff to the Smithers orchestrator for downstream invalidation.
```

### Engine Control
```bash
jjhubctl up    # Starts the Smithers engine (specs/generate.tsx)
jjhubctl down  # Stops/cancels the Smithers engine
```

### Interactive Harness
```bash
jjhubctl interactive  # Launches a pi coding agent loaded with the local dev harness extension
```

## Key Conventions

- Use `jj` for version control, not `git`.
- **Do not edit artifacts in `specs/engineering`, `specs/research`, or `specs/plans` manually if it can be avoided.** Edit the upstream PRD/Design via `jjhubctl edit` and let the orchestrator regenerate the downstream artifacts natively.
- If you are asked to implement a new feature, add it to `specs/features.ts` and then run `jjhubctl up`. The engine will handle the rest.

