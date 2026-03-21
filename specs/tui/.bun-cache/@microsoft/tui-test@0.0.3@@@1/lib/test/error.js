// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
import { strictModeErrorPrefix } from "../utils/constants.js";
const getErrorMessage = (e) => typeof e == "string" ? e : e instanceof Error ? e.message : "";
export const isStrictModeViolation = (error) => getErrorMessage(error).startsWith(strictModeErrorPrefix);
