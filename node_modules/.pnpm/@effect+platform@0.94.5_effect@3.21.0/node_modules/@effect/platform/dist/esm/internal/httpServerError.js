import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as FiberId from "effect/FiberId";
import { globalValue } from "effect/GlobalValue";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as Respondable from "../HttpServerRespondable.js";
import * as internalServerResponse from "./httpServerResponse.js";
/** @internal */
export const TypeId = /*#__PURE__*/Symbol.for("@effect/platform/HttpServerError");
/** @internal */
export const isServerError = u => Predicate.hasProperty(u, TypeId);
/** @internal */
export const clientAbortFiberId = /*#__PURE__*/globalValue("@effect/platform/HttpServerError/clientAbortFiberId", () => FiberId.runtime(-499, 0));
/** @internal */
export const causeResponse = cause => {
  let effect = Effect.succeed(internalServerError);
  let stripped = Cause.empty;
  let isClientInterrupt = false;
  let hasResponse = false;
  Cause.reduce(cause, void 0, (_, current) => {
    const withoutInterrupt = Cause.isInterruptType(stripped) ? Cause.empty : stripped;
    switch (current._tag) {
      case "Fail":
        {
          effect = Respondable.toResponseOrElse(current.error, internalServerError);
          stripped = combineCauses(withoutInterrupt, current);
          break;
        }
      case "Die":
        {
          const isResponse = internalServerResponse.isServerResponse(current.defect);
          effect = Respondable.toResponseOrElseDefect(current.defect, internalServerError);
          stripped = isResponse ? withoutInterrupt : combineCauses(withoutInterrupt, current);
          hasResponse = hasResponse || isResponse;
          break;
        }
      case "Interrupt":
        {
          isClientInterrupt = isClientInterrupt || current.fiberId === clientAbortFiberId;
          if (Cause.isEmptyType(stripped) && !hasResponse) {
            stripped = current;
          }
          break;
        }
    }
    return Option.none();
  });
  const responseEffect = !hasResponse && Cause.isInterruptType(stripped) ? Effect.succeed(isClientInterrupt ? clientAbortError : serverAbortError) : effect;
  const strippedCause = !hasResponse && Cause.isInterruptType(stripped) && isClientInterrupt ? Cause.interrupt(clientAbortFiberId) : stripped;
  return Effect.map(responseEffect, response => {
    if (Cause.isEmptyType(strippedCause)) {
      return [response, Cause.empty];
    }
    return [response, Cause.sequential(strippedCause, Cause.die(response))];
  });
};
const combineCauses = (left, right) => {
  if (Cause.isEmptyType(left)) {
    return right;
  } else if (Cause.isEmptyType(right)) {
    return left;
  }
  return Cause.sequential(left, right);
};
/** @internal */
export const causeResponseStripped = cause => {
  let response;
  const stripped = Cause.stripSomeDefects(cause, defect => {
    if (internalServerResponse.isServerResponse(defect)) {
      response = defect;
      return Option.some(Cause.empty);
    }
    return Option.none();
  });
  return [response ?? internalServerError, stripped];
};
const internalServerError = /*#__PURE__*/internalServerResponse.empty({
  status: 500
});
const clientAbortError = /*#__PURE__*/internalServerResponse.empty({
  status: 499
});
const serverAbortError = /*#__PURE__*/internalServerResponse.empty({
  status: 503
});
/** @internal */
export const exitResponse = exit => {
  if (exit._tag === "Success") {
    return exit.value;
  }
  return causeResponseStripped(exit.cause)[0];
};
//# sourceMappingURL=httpServerError.js.map