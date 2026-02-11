<div align="center">

<img src="resources/banner.png" alt="Artemis IDE Banner" width="100%" />

<br />

# <span style="font-size: 72px; font-weight: 900;">Artemis IDE</span>

### **⚡ The AI-Powered IDE Built for Speed**

[![License: MIT](https://img.shields.io/badge/License-MIT-gold.svg?style=for-the-badge)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-35-blue.svg?style=for-the-badge&logo=electron&logoColor=white)](https://electronjs.org/)
[![React](https://img.shields.io/badge/React-18-61dafb.svg?style=for-the-badge&logo=react&logoColor=white)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178c6.svg?style=for-the-badge&logo=typescript&logoColor=white)](https://typescriptlang.org/)
[![Tailwind](https://img.shields.io/badge/Tailwind-3.4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)

<br />

**Free, open-source agentic IDE — no subscriptions, no cloud lock-in.**

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/foxemsx)
[![GitHub Stars](https://img.shields.io/github/stars/Foxemsx/Artemis?style=for-the-badge&logo=github&color=gold)](https://github.com/Foxemsx/Artemis)

</div>

---

## 📊 By The Numbers

| Metric | Count | Metric | Count |
|--------|-------|--------|-------|
| **Lines of Code** | 15,000+ | **AI Providers** | 13 |
| **React Components** | 28 | **Built-in Tools** | 14 |
| **IPC Handlers** | 50+ | **MCP Servers** | 33 |
| **Themes** | 16 | **Security Layers** | 12+ |

---

## ✨ What Makes Artemis Special

Artemis treats the AI as **untrusted code** — every action is validated, contained, and requires your approval. You stay in control while the agent handles the tedious work.

---

## 🤖 Autonomous AI Agent

**4 Modes for Every Workflow:**

- **🏗️ Builder Mode** — Full autonomy. Plans, codes, runs commands, iterates until done
- **📋 Planner Mode** — Creates structured plans first, review them, then one-click implement
- **💬 Chat Mode** — Fast conversational help without tool execution
- **❓ Ask Mode** — Quick Q&A with read-only context

**13 AI Providers:** OpenAI, Anthropic, Google Gemini, DeepSeek, Groq, Mistral, OpenRouter, Moonshot, Perplexity, Synthetic, Z.AI, Zen, and **Ollama** for fully local, private inference.

**Smart Features:**
- **@-Mentions** — Type `@filename` for context or `@codebase` to index your entire project
- **Image Attachments** — Drop images for vision-capable models
- **Web Browsing** — Built-in DuckDuckGo search + URL fetching with SSRF protection
- **Tool Approval** — Every file write, delete, and command requires your explicit approval

![AI Chat in Action](screenshots/ai-chat.png)

---

## 🔒 Security First

Artemis is built with a **defense-in-depth** security model:

| Layer | Protection |
|-------|-----------|
| **OS Encryption** | API keys encrypted via `safeStorage` (DPAPI/Keychain/Secret Service) |
| **Renderer Sandbox** | `sandbox: true`, `contextIsolation: true` — renderer can't touch Node.js |
| **Path Containment** | All file ops validated; blocks traversal, UNC paths, system directories |
| **Command Restrictions** | `shell: false`, executable allowlist, dangerous flag blocking |
| **SSRF Protection** | Blocks private IPs, loopback, cloud metadata endpoints |
| **Workspace Trust** | Untrusted folders run in Restricted Mode (no terminal/commands) |
| **Output Bounds** | 50KB command limit, 2MB file reads, 50 iteration cap |

---

## 🛠️ Full IDE Experience

**Everything you expect from a modern editor:**

- **Monaco Editor** — Same engine as VS Code, 40+ languages
- **Integrated Terminal** — Real PTY-backed shell (PowerShell, bash, zsh)
- **Source Control** — Built-in Git panel with staging, diffs, commits, push/pull
- **File Explorer** — Create, rename, delete with full context menus
- **Multi-Tab Editing** — Pin tabs, preview mode, drag-to-reorder
- **Project Search** — Regex search with ripgrep fallback across entire codebase
- **Problems Panel** — Live TypeScript diagnostics with quick fixes

![Editor View](screenshots/editor.png)

---

## 🔌 MCP Marketplace

**One-Click Superpowers:**

33 curated MCP servers ready to install:
- **GitHub** — Repos, issues, PRs, code search
- **Git** — Full version control via natural language
- **SQLite/PostgreSQL** — Query databases directly
- **Puppeteer/Playwright** — Browser automation
- **Docker** — Container management
- **Notion** — Docs and databases
- **Brave Search** — Web search
- **Memory** — Persistent knowledge graph
- **Filesystem** — Enhanced file operations
- **Context7** — Up-to-date library documentation
- **Slack** — Channel messaging and search
- **Linear** — Issue tracking and sprints
- **Sentry** — Error tracking and monitoring
- **Supabase** — Database, auth, and storage
- **Redis** — Key-value store operations
- **MongoDB** — Document database queries
- **Vercel** — Deployment management
- **Cloudflare** — Workers, KV, R2, DNS
- **Stripe** — Payment data and products
- **Tavily** — AI-optimized web search
- **Exa** — Neural search engine
- **Google Drive** — Files and documents
- **Google Maps** — Geocoding and directions
- **Figma** — Design inspection and tokens
- **Jira** — Issue and project management
- **Confluence** — Wiki and documentation
- **Todoist** — Task management
- **YouTube** — Transcripts and metadata
- **AWS** — S3, DynamoDB, Lambda, CloudWatch
- **Fetch** — HTTP requests and content extraction
- **Sequential Thinking** — Structured problem-solving

Add custom servers with your own configuration and environment variables.

![MCP Marketplace](screenshots/mcp.png)

---

## 🎨 16 Beautiful Themes

Dark · Light · Cyberpunk · Nord · Monokai · Solarized · Dracula · Rosé Pine · Pine · Catppuccin · Gruvbox · Material Ocean · Everforest · Sakura · Beach · Space

![Themes](screenshots/themes.png)

---

## 🎵 And More

- **🧠 Inline Completions** — Ghost-text suggestions as you type (Tab to accept)
- **🔔 Sound Effects** — Audio cues when tasks complete
- **🎮 Discord Rich Presence** — Show what you're working on
- **📊 Token Tracking** — Real-time cost estimation and context window visualization
- **🔄 Checkpoints** — Snapshot and restore project state at any point
- **🧹 Auto-Linting** — ESLint, Pylint integration
- **⌨️ Command Palette** — Quick access with `Ctrl+Shift+P`

---

## 🏗️ Architecture

### Electron Main Process

```
electron/
├── main.ts              # Main entry (~1500 lines)
│   ├── IPC handlers (fs, git, terminal, agent)
│   ├── Store with safeStorage encryption
│   └── Window & security management
├── preload.ts           # Context bridge (window.artemis.*)
├── api/
│   ├── agent/           # AgentLoop, StreamParser
│   ├── conversation/    # ConversationManager
│   ├── ipc/             # AgentIPC handlers
│   ├── providers/       # AI provider adapters
│   ├── tools/           # ToolRegistry, ToolExecutor
│   └── types.ts         # Shared TypeScript
├── services/
│   ├── checkpointService.ts
│   ├── commitMessageService.ts
│   ├── discordRPCService.ts
│   ├── inlineCompletionService.ts
│   ├── linterService.ts
│   ├── mcpClient.ts
│   ├── mcpService.ts    # MCP marketplace (814 lines)
│   ├── urlFetchService.ts
│   └── webSearchService.ts
└── shared/
    ├── logger.ts
    └── security.ts      # Validation & allowlists
```

### React Renderer

```
src/
├── components/          # 28 components
│   ├── Editor.tsx      # Monaco wrapper (~1000 lines)
│   ├── ChatPanel.tsx   # AI chat interface
│   ├── Settings.tsx    # Configuration (~1200 lines)
│   ├── Terminal.tsx    # xterm.js component
│   └── ...
├── hooks/
│   ├── useOpenCode.ts  # Main state (~1400 lines)
│   ├── useTheme.ts
│   └── useTokenTracker.ts
├── lib/
│   ├── models.json     # 200+ AI models
│   ├── zenClient.ts    # Provider client
│   └── checkpoints.ts  # Checkpoint API
└── types.ts            # Core TypeScript types
```

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

# Install dependencies (rebuilds node-pty automatically)
npm install

# Start development mode
npm run dev

# Build for production
npm run build
```

---

## 📝 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

### What MIT License Means:
- ✅ You can use this code for free, forever
- ✅ You can modify it
- ✅ You can distribute it
- ✅ You can use it in commercial projects
- ✅ Private use is allowed
- ✅ You must include the license and copyright notice
- ⚠️ You can't hold the author liable
- ⚠️ There's no warranty

---

## 🙏 Acknowledgments

Artemis is built on the shoulders of giants:

- [Monaco Editor](https://microsoft.github.io/monaco-editor/) — The same editor that powers VS Code
- [xterm.js](https://xtermjs.org/) — Terminal emulator for the web
- [node-pty](https://github.com/microsoft/node-pty) — Pseudoterminal support
- [Electron](https://electronjs.org/) — Cross-platform desktop apps
- [React](https://react.dev/) — UI library
- [Framer Motion](https://www.framer.com/motion/) — Smooth animations
- [Tailwind CSS](https://tailwindcss.com/) — Utility-first styling
- [Lucide](https://lucide.dev/) — Beautiful icons
- [Vite](https://vitejs.dev/) — Lightning fast builds

---

## 🌐 Connect & Support

<div align="center">

If Artemis helps your workflow, consider supporting the project! 💛

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/foxemsx)
[![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/Foxemsx/Artemis)

**💬 Get in Touch**

- **Discord** — Add me: `767347091873595433`
- **GitHub Issues** — [Report bugs or request features](https://github.com/Foxemsx/Artemis/issues)
- **Stars** ⭐ — If you like Artemis, give it a star on GitHub!

</div>

---

<div align="center">

**Built with 🔥 by [Foxemsx](https://github.com/Foxemsx)**

<img src="resources/icon.png" alt="Artemis" width="32" />

</div>

