import type { MatcherContext, AsyncExpectationResult } from "expect";
import { Locator } from "../../terminal/locator.js";
export declare function toBeVisible(this: MatcherContext, locator: Locator, options?: {
    timeout?: number;
    full?: boolean;
}): AsyncExpectationResult;
