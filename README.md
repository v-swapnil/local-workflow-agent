# Local Workflow Agent

Local Workflow Agent is a local-first desktop application that executes software engineering tasks through an autonomous agentic workflow. 

Describe a task in natural language, and the agent will plan, edit, run commands, ask for your approval, and track its history—all within a unified, cleanly designed desktop interface. 

## ✨ Key Features

- **Local-First & Private:** Powered locally by Ollama, keeping your code and prompts entirely on your machine.
- **Agentic Loop:** Utilizes LangGraph to orchestrate an efficient, continuous loop of planner and executor stages.
- **Safe Execution Sandbox:** Shell commands, file edits, and git operations are executed within a constrained, timeout-managed sandbox.
- **Full Developer Workspace:** Features a Kanban board for task tracking, a Monaco editor, Git/Worktree management, and visual diff reviews.
- **Extensible:** Supports custom tools, editable markdown-based "skills", and an optional GitHub Copilot CLI execution path.

## 🛠 Tech Stack

| Layer | Technology |
| --- | --- |
| **Desktop Shell** | Electron, electron-vite |
| **Renderer** | React 18, React Router, Tailwind CSS, Monaco Editor |
| **State & Data** | Zustand, TanStack Query, tRPC (electron-trpc) |
| **Database** | better-sqlite3 with Drizzle ORM |
| **AI Orchestration** | LangGraph.js |
| **Local LLM** | Ollama (Default: `qwen2.5-coder:7b`) |
| **Git Services** | simple-git |

## 🚀 Getting Started

### Prerequisites
- Node.js 20+
- [pnpm](https://pnpm.io/) (`corepack enable && corepack prepare pnpm@latest --activate`)
- Git
- [Ollama](https://ollama.com/) (running locally)

### 1. Prepare Ollama
Pull the default model and start the server:

```bash
ollama pull qwen2.5-coder:7b
ollama serve
```
*(Ensure Ollama is reachable at `http://127.0.0.1:11434`)*

### 2. Install & Run
Clone the repository and install dependencies:

```bash
pnpm install
```

If you encounter issues with native modules (like SQLite), rebuild them:

```bash
pnpm postinstall
```

Start the app in development mode:

```bash
pnpm dev
```

### 3. Configuration
1. Open **Settings** (`Cmd/Ctrl + ,`) in the app.
2. Confirm Ollama is reachable and `qwen2.5-coder:7b` is selected.
3. Attach a local repository folder to start your first session.

## 📦 Building & Packaging

To compile the application for production:

```bash
pnpm build
```

To package a distributable application (e.g., macOS zip artifacts):

```bash
pnpm package:mac
```
*(Packaged artifacts are output to the `release/` directory).*

## 📚 Documentation & Architecture

For a deeper dive into the app's internal architecture, IPC routing, database schemas, and tool registries, please refer to the `docs/` directory:
- [Product Requirements & Goals](docs/PRD.md)
- [Copilot Integration](docs/COPILOT_INTEGRATION.md)
- [Git Worktree Isolation](docs/WORKTREE_PLAN.md)
