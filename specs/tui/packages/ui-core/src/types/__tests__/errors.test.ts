import { describe, it, expect } from "bun:test";
import { ApiError, NetworkError, parseResponseError } from "../errors.js";

describe("ApiError", () => {
  it("constructor sets status, code, detail, message, name", () => {
    const error = new ApiError(400, "Bad Request Detail");
    expect(error.status).toBe(400);
    expect(error.code).toBe("BAD_REQUEST");
    expect(error.detail).toBe("Bad Request Detail");
    expect(error.message).toBe("API 400: Bad Request Detail");
    expect(error.name).toBe("ApiError");
  });

  it("maps 400 → BAD_REQUEST", () => expect(new ApiError(400, "").code).toBe("BAD_REQUEST"));
  it("maps 401 → UNAUTHORIZED", () => expect(new ApiError(401, "").code).toBe("UNAUTHORIZED"));
  it("maps 403 → FORBIDDEN", () => expect(new ApiError(403, "").code).toBe("FORBIDDEN"));
  it("maps 404 → NOT_FOUND", () => expect(new ApiError(404, "").code).toBe("NOT_FOUND"));
  it("maps 422 → UNPROCESSABLE", () => expect(new ApiError(422, "").code).toBe("UNPROCESSABLE"));
  it("maps 429 → RATE_LIMITED", () => expect(new ApiError(429, "").code).toBe("RATE_LIMITED"));
  it("maps 500 → SERVER_ERROR", () => expect(new ApiError(500, "").code).toBe("SERVER_ERROR"));
  it("maps 502 → SERVER_ERROR", () => expect(new ApiError(502, "").code).toBe("SERVER_ERROR"));
  it("maps 418 → UNKNOWN (unmapped status)", () => expect(new ApiError(418, "").code).toBe("UNKNOWN"));

  it("message format is 'API {status}: {detail}'", () => {
    const err = new ApiError(404, "Not found");
    expect(err.message).toBe("API 404: Not found");
  });

  it("fieldErrors stored when provided", () => {
    const fieldErrors = [{ resource: "Issue", field: "title", code: "missing" }];
    const error = new ApiError(422, "Validation failed", fieldErrors);
    expect(error.fieldErrors).toEqual(fieldErrors);
  });

  it("fieldErrors undefined when omitted", () => {
    const error = new ApiError(500, "Server Error");
    expect(error.fieldErrors).toBeUndefined();
  });

  it("instanceof Error is true", () => {
    expect(new ApiError(400, "") instanceof Error).toBe(true);
  });
});

describe("NetworkError", () => {
  it("constructor sets message, name, code, cause", () => {
    const cause = new Error("Failed to fetch");
    const error = new NetworkError("Network Error Msg", cause);
    expect(error.message).toBe("Network Error Msg");
    expect(error.name).toBe("NetworkError");
    expect(error.code).toBe("NETWORK_ERROR");
    expect(error.cause).toBe(cause);
  });

  it("code is always NETWORK_ERROR", () => {
    const error = new NetworkError("Oops");
    expect(error.code).toBe("NETWORK_ERROR");
  });

  it("cause is optional", () => {
    const error = new NetworkError("Oops");
    expect(error.cause).toBeUndefined();
  });

  it("instanceof Error is true", () => {
    expect(new NetworkError("") instanceof Error).toBe(true);
  });
});

describe("parseResponseError", () => {
  it("parses JSON body with message field", async () => {
    const res = new Response(JSON.stringify({ message: "Custom err msg" }), { status: 400 });
    const err = await parseResponseError(res);
    expect(err.status).toBe(400);
    expect(err.detail).toBe("Custom err msg");
    expect(err.code).toBe("BAD_REQUEST");
  });

  it("parses JSON body with message and errors fields", async () => {
    const body = { message: "Validation error", errors: [{ resource: "A", field: "b", code: "missing" }] };
    const res = new Response(JSON.stringify(body), { status: 422 });
    const err = await parseResponseError(res);
    expect(err.status).toBe(422);
    expect(err.detail).toBe("Validation error");
    expect(err.fieldErrors).toEqual(body.errors);
  });

  it("falls back to statusText when body is not JSON", async () => {
    const res = new Response("Bad gateway", { status: 502, statusText: "Bad Gateway" });
    const err = await parseResponseError(res);
    expect(err.status).toBe(502);
    expect(err.detail).toBe("Bad Gateway");
  });

  it("falls back to 'HTTP {status}' when no statusText", async () => {
    // Response constructor doesn't set statusText automatically in some environments if omitted
    const res = new Response("Oops", { status: 503 });
    // In Bun's native Response, statusText might be "Service Unavailable"
    // Let's force it empty if possible, or accept the fallback logic works.
    Object.defineProperty(res, 'statusText', { value: '' });
    const err = await parseResponseError(res);
    expect(err.status).toBe(503);
    expect(err.detail).toBe("HTTP 503");
  });

  it("returns ApiError with correct status code", async () => {
    const res = new Response(null, { status: 429 });
    const err = await parseResponseError(res);
    expect(err.status).toBe(429);
    expect(err.code).toBe("RATE_LIMITED");
  });

  it("handles empty response body", async () => {
    const res = new Response(null, { status: 404 });
    const err = await parseResponseError(res);
    expect(err.status).toBe(404);
  });
});