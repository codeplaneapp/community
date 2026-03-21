"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.isServerError = exports.exitResponse = exports.clientAbortFiberId = exports.causeResponseStripped = exports.causeResponse = exports.TypeId = void 0;
var Cause = _interopRequireWildcard(require("effect/Cause"));
var Effect = _interopRequireWildcard(require("effect/Effect"));
var FiberId = _interopRequireWildcard(require("effect/FiberId"));
var _GlobalValue = require("effect/GlobalValue");
var Option = _interopRequireWildcard(require("effect/Option"));
var Predicate = _interopRequireWildcard(require("effect/Predicate"));
var Respondable = _interopRequireWildcard(require("../HttpServerRespondable.js"));
var internalServerResponse = _interopRequireWildcard(require("./httpServerResponse.js"));
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function (e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, default: e }; if (null === e || "object" != typeof e && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (const t in e) "default" !== t && {}.hasOwnProperty.call(e, t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, t)) && (i.get || i.set) ? o(f, t, i) : f[t] = e[t]); return f; })(e, t); }
/** @internal */
const TypeId = exports.TypeId = /*#__PURE__*/Symbol.for("@effect/platform/HttpServerError");
/** @internal */
const isServerError = u => Predicate.hasProperty(u, TypeId);
/** @internal */
exports.isServerError = isServerError;
const clientAbortFiberId = exports.clientAbortFiberId = /*#__PURE__*/(0, _GlobalValue.globalValue)("@effect/platform/HttpServerError/clientAbortFiberId", () => FiberId.runtime(-499, 0));
/** @internal */
const causeResponse = cause => {
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
exports.causeResponse = causeResponse;
const combineCauses = (left, right) => {
  if (Cause.isEmptyType(left)) {
    return right;
  } else if (Cause.isEmptyType(right)) {
    return left;
  }
  return Cause.sequential(left, right);
};
/** @internal */
const causeResponseStripped = cause => {
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
exports.causeResponseStripped = causeResponseStripped;
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
const exitResponse = exit => {
  if (exit._tag === "Success") {
    return exit.value;
  }
  return causeResponseStripped(exit.cause)[0];
};
exports.exitResponse = exitResponse;
//# sourceMappingURL=httpServerError.js.map