export interface APIClient {
  /** Base URL of the Codeplane API (e.g., "http://localhost:3000"). */
  baseUrl: string;

  /**
   * Perform an HTTP request and return the raw Response.
   * Implementations must inject auth headers and handle base URL resolution.
   */
  request(path: string, options?: APIRequestOptions): Promise<Response>;
}

export interface APIRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}