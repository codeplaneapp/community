import * as internal from "./internal/httpMiddleware.js";
/**
 * @since 1.0.0
 * @category constructors
 */
export const make = internal.make;
/**
 * @since 1.0.0
 * @category constructors
 */
export const logger = internal.logger;
/**
 * @since 1.0.0
 * @category fiber refs
 */
export const loggerDisabled = internal.loggerDisabled;
/**
 * @since 1.0.0
 * @category fiber refs
 */
export const withLoggerDisabled = internal.withLoggerDisabled;
/**
 * @since 1.0.0
 * @category fiber refs
 */
export const currentTracerDisabledWhen = internal.currentTracerDisabledWhen;
/**
 * @since 1.0.0
 * @category fiber refs
 */
export const withTracerDisabledWhen = internal.withTracerDisabledWhen;
/**
 * @since 1.0.0
 * @category fiber refs
 */
export const withTracerDisabledWhenEffect = internal.withTracerDisabledWhenEffect;
/**
 * @since 1.0.0
 * @category fiber refs
 */
export const withTracerDisabledForUrls = internal.withTracerDisabledForUrls;
/**
 * @since 1.0.0
 * @category constructors
 */
export const xForwardedHeaders = internal.xForwardedHeaders;
/**
 * @since 1.0.0
 * @category constructors
 */
export const searchParamsParser = internal.searchParamsParser;
/**
 * Creates a CORS (Cross-Origin Resource Sharing) middleware for HTTP applications.
 *
 * @param options - CORS configuration options
 * @param options.allowedOrigins - Origins allowed to access the resource. Can be:
 *   - An array of origin strings (e.g., `["https://example.com", "https://api.example.com"]`)
 *   - A predicate function to dynamically allow origins
 *   - If empty array (default): allows all origins with `Access-Control-Allow-Origin: *`
 * @param options.allowedMethods - HTTP methods allowed for CORS requests.
 *   Default: `["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"]`
 * @param options.allowedHeaders - Headers allowed in CORS requests. **Important behavior**:
 *   - If empty array (default): reflects back the client's `Access-Control-Request-Headers`,
 *     effectively allowing all headers requested by the client
 *   - If non-empty array: only the specified headers are allowed
 *   - This means the default behavior is permissive, not restrictive
 * @param options.exposedHeaders - Headers exposed to the client in the response.
 *   Default: `[]`
 * @param options.maxAge - Maximum time (in seconds) that preflight request results can be cached.
 *   If not specified, no `Access-Control-Max-Age` header is sent
 * @param options.credentials - Whether to allow credentials (cookies, authorization headers, etc.).
 *   Default: `false`
 *
 * @example
 * ```ts
 * import { HttpMiddleware, HttpRouter, HttpServerResponse } from "@effect/platform"
 *
 * // Allow all origins and reflect requested headers (default behavior)
 * HttpRouter.empty.pipe(
 *   HttpRouter.get("/", HttpServerResponse.empty()),
 *   HttpMiddleware.cors()
 * )
 *
 * // Restrict to specific origins and headers
 * HttpRouter.empty.pipe(
 *   HttpRouter.get("/", HttpServerResponse.empty()),
 *   HttpMiddleware.cors({
 *     allowedOrigins: ["https://example.com"],
 *     allowedHeaders: ["Content-Type", "Authorization"],
 *     credentials: true
 *   })
 * )
 *
 * // Dynamic origin checking with predicate
 * HttpRouter.empty.pipe(
 *   HttpRouter.get("/", HttpServerResponse.empty()),
 *   HttpMiddleware.cors({
 *     allowedOrigins: (origin) => origin.endsWith(".example.com")
 *   })
 * )
 * ```
 *
 * @since 1.0.0
 * @category constructors
 */
export const cors = internal.cors;
/**
 * @since 1.0.0
 * @category Tracing
 */
export const SpanNameGenerator = internal.SpanNameGenerator;
/**
 * Customizes the span name for the http app.
 *
 * ```ts
 * import {
 *   HttpMiddleware,
 *   HttpRouter,
 *   HttpServer,
 *   HttpServerResponse
 * } from "@effect/platform"
 * import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
 * import { Layer } from "effect"
 * import { createServer } from "http"
 *
 * HttpRouter.empty.pipe(
 *   HttpRouter.get("/", HttpServerResponse.empty()),
 *   HttpServer.serve(),
 *   // Customize the span names for this HttpApp
 *   HttpMiddleware.withSpanNameGenerator((request) => `GET ${request.url}`),
 *   Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 })),
 *   Layer.launch,
 *   NodeRuntime.runMain
 * )
 * ```
 *
 * @since 1.0.0
 * @category Tracing
 */
export const withSpanNameGenerator = internal.withSpanNameGenerator;
//# sourceMappingURL=HttpMiddleware.js.map