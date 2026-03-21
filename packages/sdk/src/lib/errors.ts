import type { Context } from "hono";

/**
 * FieldError describes a validation error on a specific field.
 * Matches Go's pkg/errors.FieldError.
 */
export interface FieldError {
  resource: string;
  field: string;
  code: string; // missing, missing_field, invalid, already_exists
}

/**
 * APIError represents a structured API error response.
 * Matches Go's pkg/errors.APIError JSON shape: { message: string, errors?: FieldError[] }
 */
export class APIError extends Error {
  status: number;
  errors?: FieldError[];

  constructor(status: number, message: string, errors?: FieldError[]) {
    super(message);
    this.status = status;
    this.errors = errors;
  }

  toJSON(): { message: string; errors?: FieldError[] } {
    const obj: { message: string; errors?: FieldError[] } = {
      message: this.message,
    };
    if (this.errors && this.errors.length > 0) {
      obj.errors = this.errors;
    }
    return obj;
  }
}

// Factory functions matching Go's pkg/errors constructors.

export function notFound(msg: string): APIError {
  return new APIError(404, msg);
}

export function badRequest(msg: string): APIError {
  return new APIError(400, msg);
}

export function unauthorized(msg: string): APIError {
  return new APIError(401, msg);
}

export function forbidden(msg: string): APIError {
  return new APIError(403, msg);
}

export function conflict(msg: string): APIError {
  return new APIError(409, msg);
}

export function unsupportedMediaType(msg: string): APIError {
  return new APIError(415, msg);
}

export function gatewayTimeout(msg: string): APIError {
  return new APIError(504, msg);
}

export function requestEntityTooLarge(msg: string): APIError {
  return new APIError(413, msg);
}

export function validationFailed(...errs: FieldError[]): APIError {
  return new APIError(422, "validation failed", errs);
}

export function internal(msg: string): APIError {
  return new APIError(500, msg);
}

/**
 * Write an APIError as a JSON response. Matches Go's errors.WriteError.
 */
export function writeError(c: Context, err: APIError): Response {
  return c.json(err.toJSON(), err.status as any);
}

/**
 * Write an arbitrary value as JSON with a status code. Matches Go's errors.WriteJSON.
 */
export function writeJSON(c: Context, status: number, value: unknown): Response {
  return c.json(value as any, status as any);
}

/**
 * Handle an unknown error: if it's an APIError, write it; otherwise write a generic 500.
 * Matches Go's writeRouteError.
 */
export function writeRouteError(c: Context, err: unknown): Response {
  if (err instanceof APIError) {
    return writeError(c, err);
  }
  return writeError(c, internal("internal server error"));
}
