# OpenSpace

OpenSpace is an open-source **Agentic Development Environment (ADE)** for fast, terminal-native vibe coding.
It combines multi-pane execution, lightweight editing, command blocks, and kanban planning in one Linux-first desktop workspace.

## Vision

Modern coding workflows are increasingly agent-driven, parallel, and command-heavy.
OpenSpace aims to make that model native by giving developers a single place to:

- spawn and orchestrate coding agents,
- run many terminal workflows in parallel,
- make quick source edits without leaving context,
- track delivery through embedded kanban tasks.

## Key Features

- **Terminal-native workflow**: run and monitor command-heavy loops without leaving the workspace.
- **Multi-pane terminal grid**: scale from 1 to 16 panes for parallel build/test/debug sessions.
- **Agent spawning and orchestration (in progress)**: foundation for managing multiple autonomous coding flows.
- **Lightweight editor**: quick file read/write for iterative tweaks and patch-style work.
- **Command blocks timeline**: reusable command actions for build/test/deploy loops.
- **Template boot flows**: apply a template to set pane count, preload command presets, and auto-dispatch startup commands.
- **Kanban task board**: move work from Todo to Complete directly inside the dev environment.
- **Workspace persistence**: remember recent roots and task state between sessions.
- **Linux-first runtime contract**: explicit Linux support and PTY-first process model.

## Screenshots

> Placeholders below. Replace with real captures as UI stabilizes.

![OpenSpace Overview](docs/screenshots/overview.png)
![Multi-Pane Terminal Grid](docs/screenshots/terminal-grid.png)
![Command Blocks + Kanban](docs/screenshots/command-kanban.png)

## Architecture Overview

OpenSpace is built as a desktop application with a thin, typed IPC boundary.

- **Desktop host**: Tauri v2
- **Renderer**: React + TypeScript
- **Terminal UI layer**: xterm.js-style terminal surface (renderer side)
- **Process backend**: Rust + PTY (`portable-pty`) for shell session lifecycle
- **Bridge contract**: shared TypeScript IPC types

```text
React Renderer (UI: panes, editor, command blocks, kanban)
        |
        | typed IPC (invoke/events)
        v
Tauri v2 Core
        |
        v
Rust Backend (PTY sessions, filesystem ops, task/workspace persistence)
```

## Linux-First Scope

OpenSpace currently targets **Linux only**.
The backend enforces this at runtime and exits on unsupported platforms.

## Quick Start

### Prerequisites

- Linux (x86_64 or arm64)
- Node.js 20+
- npm 10+
- Rust 1.77+
- Tauri system dependencies for Linux

### Run in Development

```bash
npm install
npm run dev
```

### Build

```bash
npm run build
```

### Useful Scripts

```bash
npm run dev:web
npm run build:web
npm run preview
npm run typecheck
```

## Roadmap

- [x] Replace placeholder terminal cards with full xterm rendering per pane.
- [x] Replace plain textarea with embedded code editor.
- [x] Add template-driven terminal boot command presets.
- [ ] Add first-class agent runtime APIs (spawn, stop, inspect, route output).
- [ ] Orchestration graph for agent-to-agent handoff and task delegation.
- [ ] Command block library with saved presets and workspace sharing.
- [ ] Rich editor capabilities (diff, diagnostics, language-aware actions).
- [ ] Git awareness (branch status, changed files, commit helpers).
- [ ] Multi-workspace session snapshots and restore.
- [ ] Linux packaging and release automation.

## Contributing

Contributions are welcome.

1. Open an issue describing the bug, proposal, or feature.
2. Fork the repo and create a focused branch.
3. Keep changes scoped and include tests or validation notes when relevant.
4. Open a pull request with a clear summary and screenshots for UI changes.

For now, prioritize Linux workflows and terminal/agent orchestration primitives.

## License

**TBD**.  
Add your project license here (for example: MIT, Apache-2.0, or GPL-3.0).
