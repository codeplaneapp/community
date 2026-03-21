import { Cli, z } from "incur";
import { loadRaw, saveConfig } from "../config.js";

const VALID_KEYS = ["api_url", "git_protocol"] as const;
type ConfigKey = (typeof VALID_KEYS)[number];

function validateKey(key: string): asserts key is ConfigKey {
  if (!VALID_KEYS.includes(key as ConfigKey)) {
    throw new Error(
      `Unknown config key: ${key} (valid keys: ${VALID_KEYS.join(", ")})`,
    );
  }
}

export const config = Cli.create("config", {
  description: "Get and set configuration",
})
  .command("get", {
    description: "Get a config value by key",
    args: z.object({
      key: z.string().describe("Config key (api_url, git_protocol)"),
    }),
    async run(c) {
      validateKey(c.args.key);
      const cfg = loadRaw();
      return { [c.args.key]: cfg[c.args.key] };
    },
  })
  .command("set", {
    description: "Set a config value by key",
    args: z.object({
      key: z.string().describe("Config key (api_url, git_protocol)"),
      value: z.string().describe("Value to set"),
    }),
    async run(c) {
      validateKey(c.args.key);
      if (c.args.key === "git_protocol" && c.args.value !== "ssh" && c.args.value !== "https") {
        throw new Error("Invalid value for git_protocol: must be 'ssh' or 'https'");
      }
      saveConfig({ [c.args.key]: c.args.value });
      return { set: c.args.key, value: c.args.value };
    },
  })
  .command("list", {
    description: "List all config values",
    async run() {
      const cfg = loadRaw();
      return {
        api_url: cfg.api_url,
        git_protocol: cfg.git_protocol,
      };
    },
  });
