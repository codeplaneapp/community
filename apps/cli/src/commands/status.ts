import { Cli } from "incur";
import { getLocalStatus } from "../jj.js";
import { formatStatus, shouldReturnStructuredOutput } from "../output.js";

export const status = Cli.create("status", {
  description: "Show working copy status",
  async run(c) {
    const status = await getLocalStatus();
    if (shouldReturnStructuredOutput(c)) {
      return status;
    }
    return formatStatus(status);
  },
});
