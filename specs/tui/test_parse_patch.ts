import { parsePatch } from "diff";
console.log(JSON.stringify(parsePatch("INVALID PATCH")));
