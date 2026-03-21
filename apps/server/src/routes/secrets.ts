import { Hono } from "hono";
import {
  getUser,
  type FieldError,
  badRequest,
  unauthorized,
  forbidden,
  validationFailed,
  writeError,
  writeJSON,
  writeRouteError,
} from "@codeplane/sdk";
import { Result } from "better-result";
import { getServices } from "../services";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SetSecretRequest {
  name: string;
  value: string;
}

// ---------------------------------------------------------------------------
// Validation — matches Go's validation.go
// ---------------------------------------------------------------------------

const SECRET_VARIABLE_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const MAX_SECRET_VARIABLE_NAME_LEN = 255;
const MAX_SECRET_VARIABLE_VALUE_SIZE = 64 * 1024; // 64 KiB

function validateSecretVariableName(name: string, resource: string): FieldError | null {
  const trimmed = name.trim();
  if (!trimmed) {
    return { resource, field: "name", code: "missing_field" };
  }
  if (name.length > MAX_SECRET_VARIABLE_NAME_LEN) {
    return { resource, field: "name", code: "invalid" };
  }
  if (!SECRET_VARIABLE_NAME_PATTERN.test(name)) {
    return { resource, field: "name", code: "invalid" };
  }
  return null;
}

function validateSecretVariableValue(value: string, resource: string): FieldError | null {
  if (!value) {
    return { resource, field: "value", code: "missing_field" };
  }
  if (value.length > MAX_SECRET_VARIABLE_VALUE_SIZE) {
    return { resource, field: "value", code: "invalid" };
  }
  return null;
}

/**
 * Resolve the repository ID by owner and repo name, verifying access.
 * The SecretService takes repositoryId directly, so we resolve it here.
 */
async function resolveRepoId(actor: any, owner: string, repo: string): Promise<string> {
  const result = await getServices().repo.getRepo(
    actor ? { id: actor.id, username: actor.username, isAdmin: actor.isAdmin ?? false } : null,
    owner,
    repo,
  );
  if (Result.isError(result)) {
    throw result.error;
  }
  return String(result.value.id);
}

/** Lazily resolve the secret service from the registry on each request. */
function secretService() {
  return getServices().secret;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const app = new Hono();

// ---------------------------------------------------------------------------
// Secrets
// ---------------------------------------------------------------------------

// GET /api/repos/:owner/:repo/secrets
app.get("/api/repos/:owner/:repo/secrets", async (c) => {
  const actor = getUser(c);
  const { owner, repo } = c.req.param();

  try {
    const repoId = await resolveRepoId(actor, owner, repo);
    const result = await secretService().listSecrets(repoId);
    if (Result.isError(result)) {
      return writeRouteError(c, result.error);
    }
    return writeJSON(c, 200, result.value);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// POST /api/repos/:owner/:repo/secrets
app.post("/api/repos/:owner/:repo/secrets", async (c) => {
  const actor = getUser(c);
  if (!actor) {
    return writeError(c, unauthorized("authentication required"));
  }
  const { owner, repo } = c.req.param();

  let body: SetSecretRequest;
  try {
    body = await c.req.json<SetSecretRequest>();
  } catch {
    return writeError(c, badRequest("invalid request body"));
  }

  const nameErr = validateSecretVariableName(body.name, "Secret");
  if (nameErr) {
    return writeError(c, validationFailed(nameErr));
  }
  const valueErr = validateSecretVariableValue(body.value, "Secret");
  if (valueErr) {
    return writeError(c, validationFailed(valueErr));
  }

  try {
    const repoId = await resolveRepoId(actor, owner, repo);
    const result = await secretService().setSecret(repoId, body.name, body.value);
    if (Result.isError(result)) {
      return writeRouteError(c, result.error);
    }
    return writeJSON(c, 201, result.value);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// DELETE /api/repos/:owner/:repo/secrets/:name
app.delete("/api/repos/:owner/:repo/secrets/:name", async (c) => {
  const actor = getUser(c);
  if (!actor) {
    return writeError(c, unauthorized("authentication required"));
  }
  const { owner, repo, name } = c.req.param();

  if (!name.trim()) {
    return writeError(c, badRequest("secret name is required"));
  }

  const nameErr = validateSecretVariableName(name, "Secret");
  if (nameErr) {
    return writeError(c, validationFailed(nameErr));
  }

  try {
    const repoId = await resolveRepoId(actor, owner, repo);
    const result = await secretService().deleteSecret(repoId, name);
    if (Result.isError(result)) {
      return writeRouteError(c, result.error);
    }
    return c.body(null, 204);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// ---------------------------------------------------------------------------
// Variables
// ---------------------------------------------------------------------------

// GET /api/repos/:owner/:repo/variables
app.get("/api/repos/:owner/:repo/variables", async (c) => {
  const actor = getUser(c);
  const { owner, repo } = c.req.param();

  try {
    const repoId = await resolveRepoId(actor, owner, repo);
    const result = await secretService().listVariables(repoId);
    if (Result.isError(result)) {
      return writeRouteError(c, result.error);
    }
    return writeJSON(c, 200, result.value);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// POST /api/repos/:owner/:repo/variables
app.post("/api/repos/:owner/:repo/variables", async (c) => {
  const actor = getUser(c);
  if (!actor) {
    return writeError(c, unauthorized("authentication required"));
  }
  const { owner, repo } = c.req.param();

  let body: SetSecretRequest;
  try {
    body = await c.req.json<SetSecretRequest>();
  } catch {
    return writeError(c, badRequest("invalid request body"));
  }

  const nameErr = validateSecretVariableName(body.name, "Variable");
  if (nameErr) {
    return writeError(c, validationFailed(nameErr));
  }
  const valueErr = validateSecretVariableValue(body.value, "Variable");
  if (valueErr) {
    return writeError(c, validationFailed(valueErr));
  }

  try {
    const repoId = await resolveRepoId(actor, owner, repo);
    const result = await secretService().setVariable(repoId, body.name, body.value);
    if (Result.isError(result)) {
      return writeRouteError(c, result.error);
    }
    return writeJSON(c, 201, result.value);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// DELETE /api/repos/:owner/:repo/variables/:name
app.delete("/api/repos/:owner/:repo/variables/:name", async (c) => {
  const actor = getUser(c);
  if (!actor) {
    return writeError(c, unauthorized("authentication required"));
  }
  const { owner, repo, name } = c.req.param();

  if (!name.trim()) {
    return writeError(c, badRequest("variable name is required"));
  }

  const nameErr = validateSecretVariableName(name, "Variable");
  if (nameErr) {
    return writeError(c, validationFailed(nameErr));
  }

  try {
    const repoId = await resolveRepoId(actor, owner, repo);
    const result = await secretService().deleteVariable(repoId, name);
    if (Result.isError(result)) {
      return writeRouteError(c, result.error);
    }
    return c.body(null, 204);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

export default app;
