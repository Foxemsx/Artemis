<div align="center">

<img src="resources/banner.png" alt="Artemis IDE Banner" width="100%" />

<br />

# Artemis IDE

### ⚡ The AI-Powered Development Environment Built for Speed

[![License: MIT](https://img.shields.io/badge/License-MIT-gold.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-35-blue.svg)](https://electronjs.org/)
[![React](https://img.shields.io/badge/React-18-61dafb.svg)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178c6.svg)](https://typescriptlang.org/)

**Artemis is a free, open-source agentic IDE that can plan, code, run commands, and manage your project — while you stay in control of every action.**
No subscriptions. No cloud lock-in. Fully open-source.

[🚀 Getting Started](#-getting-started) · [✨ Features](#-features) · [� Security](#-security) · [�📸 Screenshots](#-screenshots) · [🤝 Support](#-support--community)

</div>

---

## ✨ Features

### 🤖 Autonomous AI Agent
- **Builder Mode** — The agent plans, writes code, runs commands, and iterates until the task is done
- **Planner Mode** — Get a structured plan first, review it, then one-click implement it in Builder
- **Chat Mode** — Fast conversational help without tool execution
- **13 Providers** — OpenAI, Anthropic, Google Gemini, DeepSeek, Groq, Mistral, OpenRouter, Moonshot, Perplexity, Synthetic, Z.AI, OpenCode Zen, and **Ollama** for fully local, private inference
- **@-Mentions** — Type `@filename` to attach file context or `@codebase` to index your entire project into the conversation
- **Image Attachments** — Drop images into chat for vision-capable models
- **Web Browsing** — The agent can fetch and read web pages with built-in SSRF protection
- **Tool Approval** — Every file write, delete, and command requires your explicit approval before execution

### 🧠 AI Inline Completion
- **Ghost-text suggestions** as you type — press TAB to accept
- Works with all supported providers, with smart caching, rate limiting, and context trimming

### 🛠️ Full IDE Experience
- **Monaco Editor** — Same engine as VS Code, with syntax highlighting for 40+ languages
- **Integrated Terminal** — Real PTY-backed shell (cmd, PowerShell, bash) with full I/O
- **Source Control** — Built-in Git panel with staging, unstaging, commits, inline diffs, push, pull, and branch management
- **File Explorer** — Create, rename, delete, and browse files and folders
- **Multi-Tab Editing** — Pin tabs, reorder them, and work across multiple files
- **Project Search** — Regex-powered search across your entire codebase
- **Problems Panel** — Live TypeScript diagnostics with click-to-navigate
- **Customizable Keybindings** — Remap every shortcut to your preference

### 🔌 MCP Marketplace
- **One-Click Install** — Browse and install Model Context Protocol servers instantly
- **Custom Servers** — Add your own MCP servers with full configuration
- **Live Tool Status** — See connected tools and server health in real-time

### 🎨 16 Beautiful Themes
Dark · Light · Cyberpunk · Nord · Monokai · Solarized · Dracula · Rosé Pine · Pine · Catppuccin · Gruvbox · Material Ocean · Everforest · Sakura · Beach · Space

### 🔒 Security
Artemis treats the AI agent as **untrusted code**. Every action is validated, contained, and gated.

- **OS-Level Key Encryption** — API keys and MCP secrets encrypted via `safeStorage` (DPAPI / Keychain / Secret Service). Plaintext storage is refused — keys are never saved unencrypted
- **Renderer Sandbox** — `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false` — even if the renderer is compromised, it can't touch Node.js
- **Content Security Policy** — No `unsafe-inline` scripts in production, whitelisted `connect-src`, `object-src 'none'`, `frame-ancestors 'none'`
- **Workspace Trust** — Untrusted folders run in Restricted Mode: no terminal, no commands, no agent. Trust is per-folder and persisted
- **Filesystem Containment** — All destructive ops restricted to the active project. System paths, UNC paths, null bytes, and path traversal blocked
- **Command Injection Prevention** — `shell: false` everywhere, shell metacharacter blocking, executable allowlist (only dev tools like npm, git, python, docker)
- **SSRF Protection** — Blocks private IPs, loopback, link-local, and cloud metadata endpoints. DNS rebinding checks resolve hostnames and verify the IP isn't private
- **HTTP Domain Allowlist** — Agent HTTP proxy only connects to whitelisted API domains
- **Output Bounds** — Command output capped at 50KB, file reads at 2MB, agent limited to 50 iterations per run

### 🎵 And More
- **Sound Effects & Notifications** — Audio cues when tasks complete, even while tabbed out
- **Discord Rich Presence** — Show what you're working on
- **Token Tracking** — Real-time cost estimation and context window visualization
- **Checkpoints** — Snapshot and restore your project state at any point
- **Auto-Linting** — ESLint, Biome, and more — integrated and automatic
- **Web Search** — DuckDuckGo-powered search available to the AI agent
- **Command Palette** — Quick access to every action with `Ctrl+Shift+P`

---

## 📸 Screenshots

### Main Editor View
![Editor View](screenshots/editor.png)

### AI Chat in Action
![AI Chat](screenshots/ai-chat.png)

### MCP Marketplace
![MCP Marketplace](screenshots/mcp.png)

### Theme Gallery
![Themes](screenshots/themes.png)

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** 18+ and **npm**
- **Git**

### Installation

```bash
# Clone the repository
git clone https://github.com/Foxemsx/Artemis.git
cd Artemis

# Install dependencies
npm install

# Start in development mode
npm run dev
```

### Building

```bash
npm run build
```

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Electron 35 |
| **Frontend** | React 18 + TypeScript 5.3 |
| **Styling** | Tailwind CSS 3.4 |
| **Editor** | Monaco Editor |
| **Terminal** | xterm.js + node-pty |
| **Animations** | Framer Motion |
| **Bundler** | Vite 5 |

---

## 🤝 Support & Community

<div align="center">

If Artemis helps your workflow, consider supporting the project! 💛

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/foxemsx)
[![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/Foxemsx/Artemis)

</div>

### 💬 Get in Touch

- **Discord** — Add me: <kbd>767347091873595433</kbd>
- **GitHub Issues** — [Report bugs or request features](https://github.com/Foxemsx/Artemis/issues)
- **Stars** ⭐ — If you like Artemis, give it a star on GitHub!

---

## 📄 License

Artemis IDE is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

You are free to use, modify, and distribute this software. Attribution is required.

---

<div align="center">

**Built with 🔥 by [Foxemsx](https://github.com/Foxemsx)**

<img src="resources/icon.png" alt="Artemis" width="32" />

</div>
