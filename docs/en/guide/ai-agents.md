# AI Agents

Chef explains to AI coding agents (Claude Code, Codex, Cursor and others) how to work with it. The explanation is printed by the installed chef, so it always matches its version.

## Agent guide

```bash
chef help agent
```

The command prints a Markdown guide to stdout:

- **Concepts** — what an extension is, how names work, which files the build generates
- **What chef can do** — chef's capabilities by task: building, type checking, linting, tests, dependency analysis, etc.
- **Behavior worth knowing** — behavior to keep in mind: what happens without a target, how glob patterns work, what `--force` and `--watch` do
- **Commands** — every command, subcommand and option
- **Error codes** — every `CFxxxx` code
- **Documentation** — the pages of this documentation with paths to their files

The guide describes what chef can do and how it behaves, but imposes no working rules: which options to use and what to agree on before a change is up to the project — in its own agent instructions and in `deny` in [chef.config](/en/config/chef-config).

The English documentation ships inside the chef npm package (`docs/en/`), and the guide points to the files of the installed package. The agent needs no internet access and reads the documentation of the chef version that is installed.

::: tip Why English
The guide is read by agents, not people. English text takes fewer tokens and leaves more of the agent's context for the task.
:::

## Setting up a project

```bash
chef init agents
```

The command adds a block to the project root that sends agents to `chef help agent`:

| File | What happens |
|------|--------------|
| `AGENTS.md` | Created, or the block is added to it. Most agents read this file |
| `CLAUDE.md`, `.claude/CLAUDE.md` | If the file exists, it gets the block too: Claude Code does not read `AGENTS.md` when the project has a `CLAUDE.md`. A file that already imports `AGENTS.md` (an `@AGENTS.md` line) is left as is |

The block is enclosed in `<!-- chef:agent-instructions:start -->` and `<!-- chef:agent-instructions:end -->` markers. The rest of the file stays unchanged, and running the command again duplicates nothing.

If the project has only a personal `CLAUDE.local.md`, Claude Code reads it instead of `AGENTS.md`. Chef does not touch personal files — it suggests adding an `@AGENTS.md` line to `CLAUDE.local.md`.

## How the guide stays current

The block in `AGENTS.md` does not depend on the chef version — it only refers to `chef help agent`. After updating chef there is no need to rerun `chef init agents`: the guide is printed by the new version.

Inside the guide:

- commands, options, error codes and the documentation index are generated from chef itself on every call
- the description of capabilities and behavior is written by hand, but chef's tests check that every command, option and error code they mention exists. A renamed or removed option stops the release from being published

## Command help

`chef help <command>` shows every option of a command, including subcommands:

```bash
chef help build
chef help test unit
chef help diag deps-tree
```
