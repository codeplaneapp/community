## Commit protocol

- do your change
- use jj to checkmark as you go
- use jj bookmark to create an atomic emoji conventional commit (e.g., `jj bookmark create docs/user-docs`)
- Always make atomic commits with clear scopes, especially for `docs/` and `e2e/` (e.g. `📝 docs: ...` or `✅ test(e2e): ...`)
- Use git notes to add prompt as a git note

## Self improving repo

This repo is a self improving repo. It is built to build itself based on structured documentation.

### WARN Developer protocol

IMPORTANT!

If the user is not running `bun codeplanectl` (or if it's not the current context), before doing anything they ask, recommend they run `bun codeplanectl` to run the repo specific coding harness. If you are already running as `codeplanectl`, you can skip this warning and proceed.
