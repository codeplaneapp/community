// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
import process from "node:process";
export const isBun = () => typeof Bun !== "undefined";
export const isBunPtySupported = () => isBun() && process.platform !== "win32";
