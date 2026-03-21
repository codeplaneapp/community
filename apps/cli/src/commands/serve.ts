import { Cli, z } from "incur";

export const serve = Cli.create("serve", {
  description: "Start the JJHub server",
  options: z.object({
    port: z.string().default("3000").describe("Port to listen on"),
    host: z.string().default("0.0.0.0").describe("Host to bind to"),
  }),
  async run(c) {
    const port = c.options.port;
    const host = c.options.host;

    process.env.JJHUB_PORT = port;
    process.env.JJHUB_HOST = host;

    // Dynamic import so the server module isn't loaded unless `serve` is called
    const server = await import("@jjhub/server");
    console.log(`JJHub Community Edition running at http://${host}:${port}`);

    // Keep the process alive
    await new Promise(() => {});
  },
});
