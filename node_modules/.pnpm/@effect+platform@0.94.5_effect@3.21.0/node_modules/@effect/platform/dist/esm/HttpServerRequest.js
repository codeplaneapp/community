import * as Effect from "effect/Effect";
import * as Either from "effect/Either";
import * as Option from "effect/Option";
import * as Runtime from "effect/Runtime";
import * as Stream from "effect/Stream";
import { hasBody } from "./HttpMethod.js";
import * as Error from "./HttpServerError.js";
import * as internal from "./internal/httpServerRequest.js";
export {
/**
 * @since 1.0.0
 * @category fiber refs
 */
MaxBodySize,
/**
 * @since 1.0.0
 * @category fiber refs
 */
withMaxBodySize } from "./HttpIncomingMessage.js";
/**
 * @since 1.0.0
 * @category type ids
 */
export const TypeId = internal.TypeId;
/**
 * @since 1.0.0
 * @category context
 */
export const HttpServerRequest = internal.serverRequestTag;
/**
 * @since 1.0.0
 * @category search params
 */
export const ParsedSearchParams = internal.parsedSearchParamsTag;
/**
 * @since 1.0.0
 * @category search params
 */
export const searchParamsFromURL = internal.searchParamsFromURL;
/**
 * @since 1.0.0
 * @category accessors
 */
export const persistedMultipart = internal.multipartPersisted;
/**
 * @since 1.0.0
 * @category accessors
 */
export const upgrade = internal.upgrade;
/**
 * @since 1.0.0
 * @category accessors
 */
export const upgradeChannel = internal.upgradeChannel;
/**
 * @since 1.0.0
 * @category schema
 */
export const schemaCookies = internal.schemaCookies;
/**
 * @since 1.0.0
 * @category schema
 */
export const schemaHeaders = internal.schemaHeaders;
/**
 * @since 1.0.0
 * @category schema
 */
export const schemaSearchParams = internal.schemaSearchParams;
/**
 * @since 1.0.0
 * @category schema
 */
export const schemaBodyJson = internal.schemaBodyJson;
/**
 * @since 1.0.0
 * @category schema
 */
export const schemaBodyForm = internal.schemaBodyForm;
/**
 * @since 1.0.0
 * @category schema
 */
export const schemaBodyUrlParams = internal.schemaBodyUrlParams;
/**
 * @since 1.0.0
 * @category schema
 */
export const schemaBodyMultipart = internal.schemaBodyMultipart;
/**
 * @since 1.0.0
 * @category schema
 */
export const schemaBodyFormJson = internal.schemaBodyFormJson;
/**
 * @since 1.0.0
 * @category conversions
 */
export const fromWeb = internal.fromWeb;
/**
 * @since 1.0.0
 * @category conversions
 */
export const toWebEither = (self, options) => {
  if (self.source instanceof Request) {
    return Either.right(self.source);
  }
  const ourl = toURL(self);
  if (Option.isNone(ourl)) {
    return Either.left(new Error.RequestError({
      request: self,
      reason: "Decode",
      description: "Invalid URL"
    }));
  }
  const requestInit = {
    method: self.method,
    headers: self.headers,
    signal: options?.signal
  };
  if (hasBody(self.method)) {
    requestInit.body = Stream.toReadableStreamRuntime(self.stream, options?.runtime ?? Runtime.defaultRuntime);
    requestInit.duplex = "half";
  }
  return Either.right(new Request(ourl.value, requestInit));
};
/**
 * @since 1.0.0
 * @category conversions
 */
export const toWeb = (self, options) => Effect.flatMap(Effect.runtime(), runtime => toWebEither(self, {
  signal: options?.signal,
  runtime
}));
/**
 * @since 1.0.0
 * @category conversions
 */
export const toURL = internal.toURL;
//# sourceMappingURL=HttpServerRequest.js.map