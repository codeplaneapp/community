// @bun
import {
  createRuntimePlugin,
  runtimeModuleIdForSpecifier
} from "./index-dwq2qe5p.js";
import"./index-k03avn41.js";
import"./index-e89anq5x.js";

// src/runtime-plugin-support.ts
var {plugin: registerBunPlugin } = globalThis.Bun;
var runtimePluginSupportInstalledKey = "__opentuiCoreRuntimePluginSupportInstalled__";
function ensureRuntimePluginSupport(options = {}) {
  const state = globalThis;
  if (state[runtimePluginSupportInstalledKey]) {
    return false;
  }
  registerBunPlugin(createRuntimePlugin(options));
  state[runtimePluginSupportInstalledKey] = true;
  return true;
}
ensureRuntimePluginSupport();
export {
  runtimeModuleIdForSpecifier,
  ensureRuntimePluginSupport,
  createRuntimePlugin
};

//# debugId=7487C2BFD13C698664756E2164756E21
//# sourceMappingURL=runtime-plugin-support.js.map
