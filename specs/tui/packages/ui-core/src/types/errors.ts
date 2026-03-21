/**
 * Client-side error types for API communication.
 * Separate from the server-side APIError in @codeplane/sdk.
 */

export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "BAD_REQUEST"
  | "UNPROCESSABLE"
  | "SERVER_ERROR"
  | "ABORTED"
  | "NETWORK_ERROR"
  | "UNKNOWN";

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly detail: string;
  readonly fieldErrors?: Array<{ resource: string; field: string; code: string }>;

  constructor(
    status: number,
    detail: string,
    fieldErrors?: Array<{ resource: string; field: string; code: string }>,
  ) {
    super(`API ${status}: ${detail}`);
    this.name = "ApiError";
    this.status = status;
    this.code = mapStatusToCode(status);
    this.detail = detail;
    this.fieldErrors = fieldErrors;
  }
}

export class NetworkError extends Error {
  readonly code: "NETWORK_ERROR" = "NETWORK_ERROR";

  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "NetworkError";
  }
}

export type HookError = ApiError | NetworkError;

function mapStatusToCode(status: number): ApiErrorCode {
  switch (status) {
    case 400: return "BAD_REQUEST";
    case 401: return "UNAUTHORIZED";
    case 403: return "FORBIDDEN";
    case 404: return "NOT_FOUND";
    case 422: return "UNPROCESSABLE";
    case 429: return "RATE_LIMITED";
  }
  if (status >= 500) return "SERVER_ERROR";
  return "UNKNOWN";
}

/**
 * Parse a non-2xx Response into an ApiError.
 * Handles the server's { message: string, errors?: FieldError[] } shape.
 */
export async function parseResponseError(response: Response): Promise<ApiError> {
  let detail = response.statusText || `HTTP ${response.status}`;
  let fieldErrors: ApiError["fieldErrors"];

  try {
    const body = await response.json() as {
      message?: string;
      errors?: ApiError["fieldErrors"];
    };
    if (body.message) detail = body.message;
    if (body.errors?.length) fieldErrors = body.errors;
  } catch {
    // Ignore JSON parse failure — use statusText as detail
  }

  return new ApiError(response.status, detail, fieldErrors);
}