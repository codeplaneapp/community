// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
export class TestCase {
    title;
    location;
    testFunction;
    suite;
    expectedStatus;
    annotations;
    id;
    results = [];
    constructor(title, location, testFunction, suite, expectedStatus = "expected", annotations = []) {
        this.title = title;
        this.location = location;
        this.testFunction = testFunction;
        this.suite = suite;
        this.expectedStatus = expectedStatus;
        this.annotations = annotations;
        this.id = this.titlePath().join("");
    }
    outcome() {
        if (this.results.length == 0 ||
            this.results.every((result) => result.status === "skipped"))
            return "skipped";
        let status = this.results[0].status;
        for (const result of this.results.slice(1)) {
            if ((status === "unexpected" && result.status === "expected") ||
                (status === "expected" && result.status !== "expected")) {
                return "flaky";
            }
            status = result.status;
        }
        if (this.expectedStatus === status)
            return "expected";
        return "unexpected";
    }
    snapshots() {
        return this.results.at(-1)?.snapshots ?? [];
    }
    filePath() {
        let currentSuite = this.suite;
        while (currentSuite != null) {
            if (currentSuite.type === "file") {
                return currentSuite.title;
            }
            currentSuite = currentSuite.parentSuite;
        }
    }
    titlePath() {
        const titles = [];
        let currentSuite = this.suite;
        while (currentSuite != null) {
            if (currentSuite.type === "project" && currentSuite.title.length != 0) {
                titles.push(`[${currentSuite.title}]`);
            }
            else if (currentSuite.type === "describe") {
                titles.push(currentSuite.title);
            }
            else if (currentSuite.type === "file") {
                titles.push(`${currentSuite.title}:${this.location.row}:${this.location.column}`);
            }
            currentSuite = currentSuite.parentSuite;
        }
        return [...titles.reverse(), this.title];
    }
    sourcePath() {
        let currentSuite = this.suite;
        while (currentSuite != null) {
            if (currentSuite.type === "file") {
                return currentSuite.source;
            }
            currentSuite = currentSuite.parentSuite;
        }
    }
}
