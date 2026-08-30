# Lumem-OS

> 🇧🇷 [Leia em português](README.pt-BR.md) — the product's interface and all
> documentation under `docs/` are in Portuguese today.

A local harness for running AI coding agents across git worktrees. One daemon on
your machine, one browser tab, and a hierarchy that matches how the work is
actually organized: **workspace → project (a git repo) → worktree**.

![The worktree screen: sidebar of projects, a worktree cut from the current branch, and its setup script already run](docs/assets/screenshot.png)

Each worktree is a real `git worktree` on disk with its own branch, its own agent
conversation, its own terminal and its own reserved ports — so several tasks run
side by side without stepping on each other.

## Install

```sh
npm i -g lumem
lumem
```

The daemon starts on `http://127.0.0.1:4317` and serves the interface from the
same port. `lumem --open` opens a browser too.

Not published yet — the first `v0.1.0` tag does that. Until then, from a clone:

```sh
pnpm install
pnpm build
npm i -g ./packages/cli
```

**What the machine needs:**

| | |
|---|---|
| Node | 22 or newer |
| git | 2.30 or newer — the whole product is worktrees |
| An ACP agent | the `claude` CLI, for the agent conversation. The first-run screen installs the adapter for you |
| OS | macOS and Linux. Windows is not supported ([why](docs/project/backlog.md)) |

Nothing else: the two native dependencies (`better-sqlite3`, `node-pty`) ship
prebuilt binaries, so a global install compiles nothing on the common platforms.
Verified on macOS arm64 and Linux x64; other architectures are untested.

Everything Lumem writes lives under `~/.lumem` — SQLite registry, worktrees,
conversations, memory. `--state-dir` moves it.

## What it does

| | |
|---|---|
| [Projects and worktrees](docs/prd/walking-skeleton/prd.md) | register a repo by path or [clone it from a URL](docs/prd/project-from-url/prd.md); cut worktrees from the product instead of the terminal |
| [Agent conversations over ACP](docs/prd/acp-sessions/prd.md) | plan, usage and cost, slash commands, an embedded terminal, and the conversation **on disk** — closing Lumem does not lose it |
| [Files, diff and an editor](docs/prd/file-editor/prd.md) | browse the checkout, read the diff against the base branch, and edit with autosave |
| [Project scripts](docs/prd/project-scripts/prd.md) | `setup`, `run` and `test` live in `<repo>/.lumem/project.toml`; a new worktree is born prepared, and one click brings the app up on a port reserved for that checkout |
| [Workspace memory](docs/prd/workspace-memory/prd.md) | what the harness learned, versioned in git, behind a write gate and an inbox of proposals. The three switches that spend tokens ship **off** |
| [Pull request status](docs/prd/pull-request-status/prd.md) | designed, not built: which of your worktrees is actually mergeable |

## How it works

- a **daemon** (Fastify + tRPC + WebSocket) owns every process, every worktree
  and the database; it is the only thing that touches the disk;
- a **React** client, served by the daemon in production and by vite in
  development, speaking to it in relative paths;
- **SQLite** under `~/.lumem` for the registry, plus one file per conversation;
- **real git worktrees** — no virtual checkouts, no shadow copies. What you see
  in Lumem is what `git worktree list` sees;
- **ACP** ([Agent Client Protocol](docs/project/pty-vs-acp.md)) for the agent, and
  a PTY for shells. The decision, and what it cost, is written down.

## Develop

```sh
pnpm install
pnpm dev            # daemon on :4317, vite on :4318
```

| Command | What it runs |
|---|---|
| `pnpm gate:quick` | the tests affected by the current work |
| `pnpm gate:full` | the whole suite plus e2e |
| `pnpm gate:build` | typecheck everything, then build |
| `pnpm smoke:install` | packs the tarball, installs it into a throwaway prefix, and boots it |

The documentation is the map: [docs/README.md](docs/README.md) indexes every
feature's PRD, the design decisions, the [testing matrix](docs/project/testing.md)
and the [backlog](docs/project/backlog.md).

## Status

**0.1.0.** Eleven features stand up and the product goes from an empty `~/.lumem`
to an answered agent turn without touching a config file. It is a personal
project, used daily by its author, and it promises no API stability yet.

Interface and documentation are in Portuguese; [moving everything to
English](docs/project/backlog.md) is on the backlog.

## License

[MIT](LICENSE).
