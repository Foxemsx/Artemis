<div align="center">

<img src="resources/banner.png" alt="Artemis IDE Banner" width="100%" />

<br />

# **Artemis IDE**

### **⚡ The AI-Powered IDE Built for Speed**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-35-47848F?style=for-the-badge&logo=electron&logoColor=white)](https://electronjs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=white)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://typescriptlang.org/)
[![Tailwind](https://img.shields.io/badge/Tailwind-3.4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)

<br />

> *Free, open-source agentic IDE — no subscriptions, no cloud lock-in.*

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/foxemsx)
[![GitHub Stars](https://img.shields.io/github/stars/Foxemsx/Artemis?style=for-the-badge&logo=github&color=gold)](https://github.com/Foxemsx/Artemis)

</div>

---

## ⚠️ | Personal Project Notice

| ⚡ Quick Info |
|:---|
| **This is a personal project** — I built it primarily for my own use. While it's open-source and everyone is welcome to use it, **updates are not guaranteed** and the project evolves based on my own needs. |

### 🎯 What This Means

| Aspect | Description |
|:---|:---|
| 📦 **Free to Use** | MIT licensed — use it, fork it, modify it however you want |
| 🔀 **No Obligation** | No guarantee of constant updates or long-term maintenance |
| 💡 **Inspiration** | Feel free to use the code as inspiration for your own projects |
| ⚠️ **Use at Own Risk** | Solo project — there may be bugs or missing features |

> [!TIP]
> This repository is primarily for **my own development and backup**. Feel free to use it as-is or as inspiration, but understand it's driven by personal use cases rather than commercial support.

---

## 🤖 | What is Artemis?

**Artemis** is an AI-powered IDE that treats AI agents as **untrusted code** — every action is validated, contained, and requires your approval. You stay in control while the agent handles the tedious work.

---

## ✨ | Features

### 🏗️ Autonomous AI Agent

**4 Modes for Every Workflow:**

| Mode | Description |
|:---|:---|
| 🏗️ **Builder** | Full autonomy — plans, codes, runs commands, iterates until done |
| 📋 **Planner** | Creates structured plans first, review them, then implement |
| 💬 **Chat** | Fast conversational help without tool execution |
| ❓ **Ask** | Quick Q&A with read-only context |

**13 AI Providers:** OpenAI, Anthropic, Google Gemini, DeepSeek, Groq, Mistral, OpenRouter, Moonshot, Perplexity, Synthetic, Z.AI, Zen, and **Ollama** for fully local inference.

| Feature | Description |
|:---|:---|
| **@-Mentions** | Type `@filename` for context or `@codebase` to index entire project |
| **Image Attachments** | Drop images for vision-capable models |
| **Web Browsing** | Built-in DuckDuckGo search + URL fetching with SSRF protection |
| **Tool Approval** | Every file write, delete, and command requires explicit approval |

### 🔒 Security First

```
┌─────────────────────────────────────────────────────────┐
│  ✅ OS Encryption — API keys via safeStorage            │
│  ✅ Renderer Sandbox — contextIsolation enabled         │
│  ✅ Path Containment — blocks traversal, UNC paths      │
│  ✅ Command Restrictions — executable allowlist         │
│  ✅ SSRF Protection — blocks private IPs, metadata      │
│  ✅ Workspace Trust — untrusted folders = restricted    │
│  ✅ Output Bounds — 50KB command limit, 2MB file reads  │
└─────────────────────────────────────────────────────────┘
```

### 🛠️ Full IDE Experience

| Feature | Description |
|:---|:---|
| 📝 **Monaco Editor** | Same engine as VS Code, 40+ languages |
| 💻 **Integrated Terminal** | Real PTY-backed shell (PowerShell, bash, zsh) |
| 🌿 **Source Control** | Built-in Git panel with staging, diffs, commits |
| 📁 **File Explorer** | Create, rename, delete with full context menus |
| 📑 **Multi-Tab Editing** | Pin tabs, preview mode, drag-to-reorder |
| 🔍 **Project Search** | Regex search with ripgrep fallback |
| ⚠️ **Problems Panel** | Live TypeScript diagnostics with quick fixes |

### 🔌 MCP Marketplace

**One-Click Superpowers:**

```
┌─────────────────────────────────────────────────────────┐
│  33 curated MCP servers ready to install:               │
│                                                         │
│  🐙 GitHub — Repos, issues, PRs, code search           │
│  🌿 Git — Version control via natural language         │
│  🗄️  SQLite/PostgreSQL — Query databases               │
│  🎭 Puppeteer/Playwright — Browser automation          │
│  🐳 Docker — Container management                       │
│  📝 Notion — Docs and databases                        │
│  🔍 Brave Search — Web search                          │
│  🧠 Memory — Persistent knowledge graph                │
│  📁 Filesystem — Enhanced file operations              │
│  📚 Context7 — Library documentation                   │
│  ...and 23 more                                        │
└─────────────────────────────────────────────────────────┘
```

Add custom servers with your own configuration.

### 🎨 16 Beautiful Themes

Dark · Light · Cyberpunk · Nord · Monokai · Solarized · Dracula · Rosé Pine · Pine · Catppuccin · Gruvbox · Material Ocean · Everforest · Sakura · Beach · Space

### 🎵 Extra Features

| Feature | Description |
|:---|:---|
| 🧠 **Inline Completions** | Ghost-text suggestions as you type |
| 🔔 **Sound Effects** | Audio cues when tasks complete |
| 🎮 **Discord Rich Presence** | Show what you're working on |
| 📊 **Token Tracking** | Real-time cost estimation |
| 🔄 **Checkpoints** | Snapshot and restore project state |
| 🧹 **Auto-Linting** | ESLint, Pylint integration |
| ⌨️ **Command Palette** | Quick access with `Ctrl+Shift+P` |

---

## 📊 | By The Numbers

<div align="center">

```
     ╔═══════════════════════════════════════════════════╗
     ║     📈 Project Statistics                         ║
     ╠═══════════════════════════════════════════════════╣
     ║  📝  Lines of Code     ➜    15,000+              ║
     ║  🧩  React Components  ➜    28                    ║
     ║  🔌  IPC Handlers      ➜    50+                  ║
     ║  🤖  AI Providers      ➜    13                   ║
     ║  🛠️  Built-in Tools    ➜    14                   ║
     ║  🔌  MCP Servers       ➜    33                   ║
     ║  🎨  Themes            ➜    16                   ║
     ║  🛡️  Security Layers   ➜    12+                  ║
     ╚═══════════════════════════════════════════════════╝
```

</div>

---

## 🏗️ | Architecture

```
electron/
├── 📦 main.ts                 # Main entry (~1500 lines)
│   ├── 🔌 IPC handlers (fs, git, terminal, agent)
│   ├── 💾 Store with safeStorage encryption
│   └── 🛡️  Window & security management
├── 🔗 preload.ts              # Context bridge (window.artemis.*)
├── 🤖 api/
│   ├── agent/                 # AgentLoop, StreamParser
│   ├── conversation/          # ConversationManager
│   ├── ipc/                   # AgentIPC handlers
│   ├── providers/             # AI provider adapters
│   ├── tools/                 # ToolRegistry, ToolExecutor
│   └── types.ts               # Shared TypeScript
└── ⚙️  services/
    ├── checkpointService.ts
    ├── commitMessageService.ts
    ├── discordRPCService.ts
    ├── inlineCompletionService.ts
    ├── linterService.ts
    ├── mcpClient.ts
    ├── mcpService.ts          # MCP marketplace
    ├── urlFetchService.ts
    └── webSearchService.ts

src/
├── 🎨 components/             # 28 components
│   ├── Editor.tsx            # Monaco wrapper (~1000 lines)
│   ├── ChatPanel.tsx         # AI chat interface
│   ├── Settings.tsx          # Configuration (~1200 lines)
│   ├── Terminal.tsx          # xterm.js component
│   └── ...
├── 🪝 hooks/
│   ├── useOpenCode.ts        # Main state (~1400 lines)
│   ├── useTheme.ts
│   └── useTokenTracker.ts
└── 📚 lib/
    ├── models.json           # 200+ AI models
    ├── zenClient.ts          # Provider client
    └── checkpoints.ts        # Checkpoint API
```

---

## 🚀 | Quick Start

### Prerequisites
- **Node.js** 18+ and **npm**
- **Git**

### Installation

```bash
# 📥 Clone the repository
git clone https://github.com/Foxemsx/Artemis.git
cd Artemis

# 📦 Install dependencies (rebuilds node-pty automatically)
npm install

# 🏃 Start development mode
npm run dev

# 🏗️ Build for production
npm run build
```

---

## 🛠️ | Development

### 📜 Available Scripts

| Command | Description |
|:---|:---|
| `npm run dev` | Development mode (Vite + Electron) |
| `npm run build` | Production build |

---

## 📝 | License

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**MIT License** — See the [LICENSE](LICENSE) file for details

```
┌─────────────────────────────────────────────────────────┐
│  ✅ Use this code for free, forever                    │
│  ✅ Modify it                                           │
│  ✅ Distribute it                                       │
│  ✅ Use in commercial projects                          │
│  ✅ Private use is allowed                              │
│  ⚠️  Include license and copyright notice              │
│  ⚠️  Can't hold the author liable                      │
│  ⚠️  No warranty                                        │
└─────────────────────────────────────────────────────────┘
```

> [!NOTE]
> MIT license applies if you copy 1:1. Everyone is welcome to use this project as they see fit — whether for personal use, as inspiration, or as a base for their own IDE. Updates are driven by personal needs, not commercial requirements.

</div>

---

## 🙏 | Acknowledgments

Artemis is built on the shoulders of giants:

| Library | Description | Link |
|:---|:---|:---|
| 📝 Monaco Editor | The same editor that powers VS Code | [Website](https://microsoft.github.io/monaco-editor/) |
| 💻 xterm.js | Terminal emulator for the web | [Website](https://xtermjs.org/) |
| 🔌 node-pty | Pseudoterminal support | [GitHub](https://github.com/microsoft/node-pty) |
| ⚡ Electron | Cross-platform desktop apps | [Website](https://electronjs.org/) |
| ⚛️ React | UI library | [Website](https://react.dev/) |
| ✨ Framer Motion | Smooth animations | [Website](https://www.framer.com/motion/) |
| 🎨 Tailwind CSS | Utility-first styling | [Website](https://tailwindcss.com/) |
| 🔷 Lucide | Beautiful icons | [Website](https://lucide.dev/) |
| ⚡ Vite | Lightning fast builds | [Website](https://vitejs.dev/) |

---

## 🌐 | Connect

<div align="center">

If Artemis helps your workflow, consider supporting the project! 💛

| | |
|:---:|:---:|
| ☕ **Buy Me a Coffee** | [![][Coffee badge]](https://buymeacoffee.com/foxemsx) |
| 🐙 **GitHub** | [![][GitHub badge]](https://github.com/Foxemsx/Artemis) |
| 💬 **Discord** | `767347091873595433` |

[Coffee badge]: https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black
[GitHub badge]: https://img.shields.io/badge/GitHub-Foxemsx-181717?style=for-the-badge&logo=github

⭐ **Star this repo if you found it useful!**

</div>

---

<div align="center">

**Built with** 🔥 **by [Foxemsx](https://github.com/Foxemsx)**

<img src="resources/icon.png" alt="Artemis" width="32" />

</div>
