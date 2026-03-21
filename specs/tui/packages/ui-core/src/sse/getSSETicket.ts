import type { APIClient } from "../client/types.js";
import { parseResponseError } from "../types/errors.js";

export interface SSETicket {
  ticket: string;
  expiresAt: string; // ISO-8601
}

/**
 * Exchange a long-lived auth token for a short-lived SSE ticket.
 * Returns null if the ticket endpoint is not available (fallback to bearer auth).
 */
export async function getSSETicket(
  client: APIClient,
  signal?: AbortSignal,
): Promise<SSETicket | null> {
  try {
    const response = await client.request("/api/auth/sse-ticket", {
      method: "POST",
      signal,
    });

    if (!response.ok) {
      // Ticket endpoint not configured or errored — fallback to bearer
      return null;
    }

    const body = (await response.json()) as SSETicket;
    return body;
  } catch {
    // Network error on ticket exchange — fallback to bearer
    return null;
  }
}
