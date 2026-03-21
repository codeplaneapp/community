/** Base error with shortMessage, details from cause chain, and walk(). */
export class BaseError extends Error {
    name = 'Incur.BaseError';
    /** The short, human-readable error message (without details). */
    shortMessage;
    /** Details extracted from the cause's message, if any. */
    details;
    constructor(shortMessage, options = {}) {
        const details = options.cause instanceof Error ? options.cause.message : undefined;
        const message = details ? `${shortMessage}\n\nDetails: ${details}` : shortMessage;
        super(message, options.cause ? { cause: options.cause } : undefined);
        this.shortMessage = shortMessage;
        this.details = details;
    }
    /**
     * Traverses the cause chain.
     * Without a callback, returns the deepest cause.
     * With a callback, returns the first cause where `fn` returns `true`.
     */
    walk(fn) {
        return walk(this, fn);
    }
}
/** CLI error with code, hint, and retryable flag. */
export class IncurError extends BaseError {
    name = 'Incur.IncurError';
    /** Machine-readable error code (e.g. `'NOT_AUTHENTICATED'`). */
    code;
    /** Actionable hint for the user. */
    hint;
    /** Whether the operation can be retried. */
    retryable;
    /** Process exit code. When set, `serve()` uses this instead of `1`. */
    exitCode;
    constructor(options) {
        super(options.message, options.cause ? { cause: options.cause } : undefined);
        this.code = options.code;
        this.hint = options.hint;
        this.retryable = options.retryable ?? false;
        this.exitCode = options.exitCode;
    }
}
/** Validation error with per-field error details. */
export class ValidationError extends BaseError {
    name = 'Incur.ValidationError';
    /** Per-field validation errors. */
    fieldErrors;
    constructor(options) {
        super(options.message, options.cause ? { cause: options.cause } : undefined);
        this.fieldErrors = options.fieldErrors ?? [];
    }
}
/** Error thrown when argument parsing fails (unknown flags, missing values). */
export class ParseError extends BaseError {
    name = 'Incur.ParseError';
    constructor(options) {
        super(options.message, options.cause ? { cause: options.cause } : undefined);
    }
}
/** Walks the cause chain, returning the deepest cause or the first matching cause. */
function walk(error, fn) {
    if (fn) {
        // Find first matching cause (not self)
        let current = error?.cause;
        while (current) {
            if (fn(current))
                return current;
            current = current?.cause;
        }
        return undefined;
    }
    // Return deepest cause
    let current = error;
    while (current?.cause)
        current = current.cause;
    return current;
}
//# sourceMappingURL=Errors.js.map