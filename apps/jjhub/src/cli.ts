#!/usr/bin/env bun
import { Cli } from "incur";
import { view } from "./commands/view.js";
import { edit } from "./commands/edit.js";
import { up } from "./commands/up.js";
import { down } from "./commands/down.js";
import { interactive } from "./commands/interactive.js";

Cli.create("jjhubctl", {
  description:
    "CLI for managing JJHub specifications and the Smithers workflow engine.",
})
  .command("view", view)
  .command("edit", edit)
  .command("up", up)
  .command("down", down)
  .command("interactive", interactive)
  .serve();
