// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
import chalk from "chalk";
import { getExpectTimeout } from "../../config/config.js";
import { isStrictModeViolation } from "../error.js";
export async function toBeVisible(locator, options) {
    const expected = locator.searchTerm();
    const comparisonMethod = typeof expected === "string"
        ? "String.prototype.includes search"
        : "String.prototype.matchAll search";
    let pass = true;
    let errorMessage = "";
    try {
        pass =
            (await locator.resolve(options?.timeout ?? getExpectTimeout(), this.isNot)) != null;
    }
    catch (e) {
        const errorMessage = typeof e == "string" ? e : e instanceof Error ? e.message : "";
        pass = (isStrictModeViolation(e) && this.isNot) || false;
        return {
            pass,
            message: () => {
                if (!this.isNot) {
                    return `expect(${chalk.red("received")}).toBeVisible(${chalk.green("expected")}) ${chalk.dim("// " + comparisonMethod)}\n\n${errorMessage}`;
                }
                return `expect(${chalk.red("received")}).not.toBeVisible(${chalk.green("expected")}) ${chalk.dim("// " + comparisonMethod)}\n\n${errorMessage}`;
            },
        };
    }
    errorMessage = errorMessage != "" ? `\n\n${errorMessage}` : "";
    return {
        pass,
        message: () => {
            if (!pass && !this.isNot) {
                return (`expect(${chalk.red("received")}).toBeVisible(${chalk.green("expected")}) ${chalk.dim("// " + comparisonMethod)}` +
                    `\n\nExpected: ${chalk.green(expected.toString())}\nMatches Found: ${chalk.red(0)}${errorMessage}`);
            }
            if (pass && this.isNot) {
                return (`expect(${chalk.red("received")}).not.toBeVisible(${chalk.green("expected")}) ${chalk.dim("// " + comparisonMethod)}` +
                    `\n\nExpected: ${chalk.green("0 matches")}\nFound: ${chalk.red(expected.toString())}${errorMessage}`);
            }
            return "passed";
        },
    };
}
