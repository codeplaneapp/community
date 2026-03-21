import type { APIClient, APIRequestOptions } from "../client/types.js";

export interface MockCall {
  path: string;
  options?: APIRequestOptions;
  timestamp: number;
}

export interface MockAPIClient extends APIClient {
  calls: MockCall[];
  respondWith(response: Response): void;
  respondWithJSON(
    status: number,
    body: unknown,
    headers?: Record<string, string>,
  ): void;
  respondWithError(error: Error): void;
  reset(): void;
  callsTo(pathPattern: string | RegExp): MockCall[];
}

export function createMockAPIClient(baseUrl: string = "http://localhost:3000"): MockAPIClient {
  let queue: Array<{ type: "response", response: Response } | { type: "error", error: Error }> = [];
  const calls: MockCall[] = [];

  return {
    baseUrl,
    calls,
    async request(path: string, options?: APIRequestOptions): Promise<Response> {
      calls.push({ path, options, timestamp: Date.now() });

      const next = queue.shift();
      if (!next) {
        console.warn(`[MockAPIClient] No mock response queued for ${path}`);
        return new Response(JSON.stringify({ message: "no mock response queued" }), { status: 500 });
      }

      if (next.type === "error") {
        throw next.error;
      }

      return next.response;
    },
    respondWith(response: Response) {
      queue.push({ type: "response", response });
    },
    respondWithJSON(status: number, body: unknown, headers?: Record<string, string>) {
      queue.push({
        type: "response",
        response: new Response(JSON.stringify(body), {
          status,
          headers: { "Content-Type": "application/json", ...headers },
        }),
      });
    },
    respondWithError(error: Error) {
      queue.push({ type: "error", error });
    },
    reset() {
      queue = [];
      calls.length = 0;
    },
    callsTo(pathPattern: string | RegExp): MockCall[] {
      return calls.filter(c => {
        if (typeof pathPattern === "string") {
          return c.path.includes(pathPattern);
        }
        return pathPattern.test(c.path);
      });
    },
  };
}