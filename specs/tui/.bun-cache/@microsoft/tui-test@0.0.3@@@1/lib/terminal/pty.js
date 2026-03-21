// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
import { isBunPtySupported } from "../utils/runtime.js";
export const createPty = async (target, args, options) => {
    if (isBunPtySupported()) {
        const { createBunPty } = await import("./pty-bun.js");
        return createBunPty(target, args, options);
    }
    const { createNodePty } = await import("./pty-node.js");
    return createNodePty(target, args, options);
};
