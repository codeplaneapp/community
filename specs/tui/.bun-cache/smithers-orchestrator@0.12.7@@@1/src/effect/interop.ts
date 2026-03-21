import { Effect } from "effect";

export function toError(cause: unknown, label?: string): Error {
  if (cause instanceof Error) {
    if (!label) return cause;
    return new Error(`${label}: ${cause.message}`, { cause });
  }
  return new Error(label ? `${label}: ${String(cause)}` : String(cause));
}

export function fromPromise<A>(
  label: string,
  evaluate: () => PromiseLike<A>,
): Effect.Effect<A, Error> {
  return Effect.tryPromise({
    try: () => evaluate(),
    catch: (cause) => toError(cause, label),
  });
}

export function fromSync<A>(
  label: string,
  evaluate: () => A,
): Effect.Effect<A, Error> {
  return Effect.try({
    try: () => evaluate(),
    catch: (cause) => toError(cause, label),
  });
}

export function dieSync<A>(
  label: string,
  evaluate: () => A,
): Effect.Effect<A> {
  return Effect.sync(() => {
    try {
      return evaluate();
    } catch (cause) {
      throw toError(cause, label);
    }
  });
}
