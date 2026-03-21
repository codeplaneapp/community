import type { MatcherContext, AsyncExpectationResult } from "expect";
import { Locator } from "../../terminal/locator.js";
export declare function toHaveBgColor(this: MatcherContext, locator: Locator, expected: string | number | [number, number, number], options?: {
    timeout?: number;
}): AsyncExpectationResult;
