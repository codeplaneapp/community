import { createCliRenderer } from "@opentui/core";
import { createRoot, useKeyboard, useTerminalDimensions, useOnResize } from "@opentui/react";
import React from "react";

console.log("@opentui/core:", typeof createCliRenderer);
console.log("@opentui/react:", typeof createRoot);
console.log("react:", React.version);
console.log("hooks:", [typeof useKeyboard, typeof useTerminalDimensions, typeof useOnResize].join(","));
console.log("ok");