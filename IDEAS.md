# Artemis IDE — Ideas & Improvement Proposals

> Organized by category. Priority tags: 🔴 High, 🟡 Medium, 🟢 Low, 💡 Nice-to-have

---

## Table of Contents

1. [Architecture & State Management](#1-architecture--state-management)
2. [Performance](#2-performance)
3. [Agent System](#3-agent-system)
4. [Developer Experience](#4-developer-experience)
5. [UI/UX](#5-uiux)
6. [Security Hardening](#6-security-hardening)
7. [New Features](#7-new-features)
8. [Testing](#8-testing)
9. [Infrastructure & Build](#9-infrastructure--build)

---

## 1. Architecture & State Management

### 🔴 Introduce a State Management Layer
**Problem:** `App.tsx` is an 810-line god component managing 20+ state variables. All state flows through prop drilling (~40 props through `PanelLayout`).

**Proposal:** Adopt a lightweight state manager:
- **Option A: Zustand** — Minimal boilerplate, TypeScript-first, works well with React. Create stores for each domain: `useProjectStore`, `useEditorStore`, `useAgentStore`, `useSettingsStore`.
- **Option B: React Context + `useReducer`** — No external dependency. Create domain-specific contexts.

**Impact:** Eliminates prop drilling, makes components independently testable, enables easier feature addition.

---

### 🟡 Decompose Large Components
**Problem:** Several components exceed 500 lines: `EnhancedChatInput` (908), `main.ts` (807), `App.tsx` (810), `Settings.tsx` (657), `MCPMarketplace.tsx` (612).

**Proposal:**
- `EnhancedChatInput` → Split into `ChatTextarea`, `SlashCommandMenu`, `MentionMenu`, `ImageAttachmentBar`
- `Settings.tsx` → Each settings category becomes its own component (`AIProviderSettings`, `AppearanceSettings`, `SoundSettings`, etc.)
- `main.ts` → Extract IPC handlers: `registerFSHandlers()`, `registerSessionHandlers()`, `registerToolHandlers()`, `registerMCPHandlers()`, `registerDiscordHandlers()`
- `App.tsx` → Extract hooks: `useKeyboardShortcuts()`, `useEditorTabs()`, `useProjectManager()`, `useTerminalManager()`

---

### 🟡 Centralize Utility Functions
**Problem:** `formatTokenCount`, `formatCost`, `truncatePath` are duplicated across `StatusBar`, `Sidebar`, `ThinkingBlock`, and `toolIcons`.

**Proposal:** Create `src/lib/formatters.ts` with all shared formatting functions. Single source of truth.

---

### 🟢 Centralize Store Keys
**Problem:** Store keys (`"sessions"`, `"apiKey:zen"`, `"tokenUsage-${id}"`, `"theme"`, etc.) are magic strings scattered across the codebase.

**Proposal:** Create `src/lib/storeKeys.ts`:
```typescript
export const STORE_KEYS = {
  SESSIONS: 'sessions',
  THEME: 'theme',
  API_KEY: (provider: string) => `apiKey:${provider}`,
  TOKEN_USAGE: (sessionId: string) => `tokenUsage-${sessionId}`,
  MESSAGES: (sessionId: string) => `messages-${sessionId}`,
  // ...
} as const
```

---

## 2. Performance

### 🔴 Optimize Project Token Counting
**Problem:** `calculateProjectTokenCount` in `useOpenCode.ts` recursively reads every file in the project directory. For a project with thousands of files, this is an I/O bottleneck.

**Proposal:**
- **Incremental counting:** Use a file watcher (`chokidar` or Electron's `fs.watch`) to track changes and only re-count modified files.
- **Worker thread:** Offload counting to a Node.js worker thread in the main process to avoid blocking.
- **Caching:** Cache file token counts with file modification timestamps as cache keys.
- **Sampling:** For very large projects, sample a subset of files and extrapolate.

---

### 🟡 Use `ripgrep` for File Search
**Problem:** `toolSearchFiles` reads files one-by-one in JavaScript. For large codebases, this is orders of magnitude slower than native search tools.

**Proposal:** Bundle `ripgrep` (`@vscode/ripgrep` npm package) and shell out to it for search operations. VS Code does this. Falls back to JS implementation if `rg` is not available.

---

### 🟡 Cache Codebase Index for @mentions
**Problem:** `indexCodebase` in `EnhancedChatInput.tsx` recursively lists all files every time the user types `@`. No caching.

**Proposal:**
- Cache the file tree with a TTL (e.g., 30 seconds).
- Invalidate on project change or file system events.
- Debounce the indexing call.

---

### 🟡 Use Better Token Estimation in ConversationManager
**Problem:** `ConversationManager.ts` uses naive `length / 4` token estimation. The frontend already has a much better `tokenCounter.ts` with GPT BPE heuristics.

**Proposal:** Move `tokenCounter.ts` to a shared location (or duplicate the logic in the backend) and use it in `ConversationManager` for more accurate context window management.

---

### 🟢 Virtual Scrolling for Long Lists
**Problem:** File explorer, session list, and search results render all items. Large lists cause jank.

**Proposal:** Use `react-window` or `@tanstack/react-virtual` for lists that could exceed ~100 items.

---

### 🟢 Async Store Writes
**Problem:** `saveStore` in `main.ts` uses `fs.writeFileSync`, blocking the main process event loop.

**Proposal:** Switch to `fs.promises.writeFile` with a debounce/throttle to batch rapid writes (e.g., during token tracking updates).

---

## 3. Agent System

### 🔴 Add Retry Logic for LLM API Calls
**Problem:** If the LLM API returns a transient error (500, 503, 429), the entire agent run fails immediately.

**Proposal:** Implement exponential backoff retry in `AgentLoop.streamCompletion()`:
- Retry on 429 (rate limit) with `Retry-After` header respect
- Retry on 500/503 (server errors) up to 3 times with exponential backoff
- Emit a `'retrying'` event so the UI can show retry status

---

### 🟡 Parallel Tool Execution
**Problem:** The agent executes tool calls sequentially, even when they're independent (e.g., reading multiple files).

**Proposal:** When the LLM returns multiple tool calls in a single response, check for dependencies (e.g., write after read of same file) and execute independent calls in parallel using `Promise.all`.

---

### 🟡 Streaming Token Usage from API
**Problem:** Token usage is estimated client-side. Many APIs return actual token counts in streaming responses (`usage` field in the final chunk).

**Proposal:** Parse the `usage` field from the final stream event (OpenAI includes it with `stream_options: { include_usage: true }`) and use actual counts when available, falling back to estimation.

---

### 🟡 Persist Conversation History in Backend
**Problem:** Conversation history is managed in the renderer (via `useSessionManager`) and passed to the backend on each agent run. If the renderer reloads, history is re-loaded from store.

**Proposal:** Option to maintain conversation state in the main process `ConversationManager` to survive renderer reloads and reduce IPC payload size.

---

### 🟢 Tool Output Streaming
**Problem:** Tool results are sent as a single event after execution completes. For long-running commands, the UI shows no progress.

**Proposal:** Stream `execute_command` stdout/stderr as `tool_output_delta` events, similar to how text content is streamed. The agent loop would still wait for completion, but the UI would show real-time output.

---

### 🟢 Make `toolListDirectory` Show Dotfiles Optionally
**Problem:** `toolListDirectory` filters out all dotfiles (`.env`, `.gitignore`, `.eslintrc`, etc.). The agent can't see configuration files.

**Proposal:** Add an optional `showHidden` parameter to the `list_directory` tool. Default to `false` but allow the agent to request hidden files when needed.

---

### 💡 Agent Memory Across Sessions
**Proposal:** Implement a lightweight vector store or keyword index that lets the agent recall information from past sessions. Could use the MCP Memory server or a local SQLite-backed solution.

---

## 4. Developer Experience

### 🟡 Extract Shared Dropdown/Positioning Logic
**Problem:** Several components implement nearly identical dropdown positioning logic: `ModelSelector`, `ContextMenu`, `AgentModeSelector`. Each handles viewport boundary detection independently.

**Proposal:** Create a `useDropdownPosition(triggerRef, options)` hook that handles:
- Viewport boundary detection
- Preferred placement (above/below/left/right)
- Resize/scroll handling
- Returns `{ position, isOpen, toggle, close }`

---

### 🟡 Create a Shared Component Library
**Proposal:** Extract reusable primitives:
- `<Dropdown>` — Positioned overlay with click-outside handling
- `<ContextMenu>` — Already exists, but could be made more generic
- `<Tooltip>` — Used ad-hoc in several places with inline styles
- `<IconButton>` — Consistent icon button with hover states
- `<Badge>` — For status indicators
- `<SearchInput>` — Search with clear button and keyboard handling

---

### 🟢 Add `console.debug` Guards
**Problem:** Many `catch {}` blocks silently swallow errors.

**Proposal:** Replace empty catches with `catch (err) { if (import.meta.env.DEV) console.debug(err) }` or a `debugLog` utility that only logs in development.

---

## 5. UI/UX

### 🟡 Unified Styling Strategy
**Problem:** Components mix inline `style={{}}` with Tailwind classes inconsistently. Some use CSS variables (`var(--text-primary)`), some use Tailwind colors, some use hardcoded hex values.

**Proposal:** Standardize on Tailwind + CSS variables. Map all theme CSS variables to Tailwind theme config so they can be used as classes (e.g., `text-primary` instead of `style={{ color: 'var(--text-primary)' }}`).

---

### 🟡 Toast/Notification System
**Problem:** Errors and status messages are shown inline in various ways — some in the status bar, some in console, some in dialog boxes.

**Proposal:** Add a toast/notification system (e.g., `react-hot-toast` or custom) for consistent user feedback:
- Agent errors
- File save confirmations
- API key validation results
- MCP server connection status changes

---

### 🟢 Keyboard Shortcut Conflict Detection
**Problem:** Settings allows customizing keyboard shortcuts but doesn't check for conflicts with existing shortcuts or system/browser defaults.

**Proposal:** When the user records a new shortcut, check against all registered shortcuts and show a warning if there's a conflict.

---

### 🟢 Responsive Panel Sizes
**Problem:** Panel sizes in `PanelLayout` use fixed min/default sizes. On small screens, the layout can feel cramped.

**Proposal:** Make panel sizes responsive to window width. Store user's preferred panel sizes in settings and restore on startup.

---

### 💡 Command Palette Enhancement
**Proposal:** Expand the command palette (`CommandPalette.tsx`) to support:
- File search (fuzzy find by filename)
- Symbol search (jump to function/class)
- Recent actions
- Settings quick-access
- Model switching

---

### 💡 Split Editor View
**Proposal:** Support side-by-side editor panels for comparing files or viewing a file while chatting. The `react-resizable-panels` library already supports this.

---

### 💡 Diff View for Agent Changes
**Proposal:** When the agent makes file edits, show a diff view (before/after) in the editor. Allow the user to accept/reject individual hunks. This would integrate with the existing checkpoint system.

---

## 6. Security Hardening

### 🟡 Enable Sandbox
**Problem:** `sandbox: false` in BrowserWindow config gives the preload script more access than necessary.

**Proposal:** Evaluate enabling `sandbox: true`. This requires moving any Node.js API usage in the preload to IPC calls. The current preload only uses `ipcRenderer` and `contextBridge`, so this should be feasible.

---

### 🟡 Reduce Auto-Approve Timeout
**Problem:** Tool approval auto-approves after 60 seconds of silence.

**Proposal:** Options:
1. Increase timeout to 5 minutes or remove auto-approve entirely.
2. Add a user setting for auto-approve timeout duration.
3. Show a persistent notification when approval is pending.

---

### 🟢 CSP Nonces Instead of `unsafe-inline`
**Problem:** CSP allows `unsafe-inline` for scripts and styles, weakening XSS protection.

**Proposal:** Generate a random nonce per page load, inject it into the CSP header and all inline script/style tags. Vite has plugins for this.

---

### 🟢 Project-Scoped FS Operations in IPC
**Problem:** `window.artemis.fs.*` IPC handlers validate paths against system directories but don't enforce project scoping. Any non-system path is accessible.

**Proposal:** Add an optional project path parameter to IPC FS handlers and enforce containment when a project is active. Allow explicit opt-out for cross-project operations.

---

## 7. New Features

### 🟡 Git Integration Panel
**Proposal:** Add a Git activity view showing:
- Modified/staged/untracked files
- Inline diffs
- Commit, push, pull actions
- Branch management
- Integration with the agent's `get_git_diff` tool

The agent already has `get_git_diff` and `execute_command` for git operations. A dedicated UI would complement this.

---

### 🟡 Extension/Plugin System
**Proposal:** Allow users to extend Artemis with custom tools, themes, and UI panels:
- **Custom tools:** Register additional `UniversalToolDefinition` + executor via a plugin API
- **Custom themes:** Load CSS variable overrides from user-defined files
- **Custom prompts:** User-defined system prompt templates per project

---

### 🟢 Project-Level Settings
**Proposal:** Support `.artemis/config.json` in project root for project-specific settings:
- Default agent mode
- Custom system prompt additions
- Preferred model
- Ignored directories for indexing
- Custom tool configurations

---

### 🟢 Multi-File Diff Review
**Proposal:** After an agent run that modifies multiple files, show a "Review Changes" panel that lists all modified files with diffs. User can accept all, reject all, or cherry-pick individual changes. This builds on the existing checkpoint system.

---

### 💡 Collaborative Sessions
**Proposal:** Allow multiple users to share a chat session in real-time. Useful for pair programming with AI assistance.

---

### 💡 Agent Workflows / Macros
**Proposal:** Let users define reusable multi-step workflows:
```yaml
name: "Add Component"
steps:
  - prompt: "Create a new React component called {{name}} in src/components/"
  - prompt: "Add exports for {{name}} to src/components/index.ts"
  - prompt: "Create a test file for {{name}}"
```
Run with `/workflow add-component --name=UserProfile`.

---

### 💡 Image/Screenshot Understanding
**Proposal:** Leverage vision-capable models (GPT-4o, Claude) to:
- Analyze screenshots dropped into chat
- Generate UI code from design mockups
- Debug visual issues from screenshots

The `EnhancedChatInput` already supports image attachments. The backend needs to pass images through to vision-capable models in the correct format.

---

### 💡 Local Model Support
**Proposal:** Add support for local LLMs via Ollama or llama.cpp:
- New provider adapter: `OllamaAdapter` (uses OpenAI-compatible API at `http://localhost:11434`)
- Auto-detect running Ollama instance
- Model management UI (pull, delete, list)

---

## 8. Testing

### 🔴 Unit Tests for Agent System
**Priority target:** The agent system is the core of the product and has zero tests.

**Proposal:**
- `AgentLoop` — Mock HTTP adapter, verify event sequences, test max iterations, test abort
- `StreamParser` — Feed known SSE payloads, verify delta parsing, test JSON repair
- `ToolExecutor` — Test path validation, test each tool with mock FS
- `ConversationManager` — Test trimming logic, token estimation, message ordering
- Provider adapters — Test format conversion for each provider

Framework: Vitest (already in the Vite ecosystem).

---

### 🟡 Integration Tests for IPC Layer
**Proposal:** Test the IPC bridge end-to-end:
- `store:get`/`store:set` round-trip
- `fs:readFile`/`fs:writeFile` with path validation
- `agent:run` with a mock LLM response

Framework: Electron's built-in test utilities or Playwright for Electron.

---

### 🟢 Component Tests
**Proposal:** Test critical UI components:
- `EnhancedChatInput` — Slash commands, mentions, image attachment
- `ModelSelector` — Search, selection, provider grouping
- `Settings` — API key save/load, theme switching

Framework: Vitest + React Testing Library.

---

## 9. Infrastructure & Build

### 🟡 Auto-Update System
**Proposal:** Integrate `electron-updater` for automatic updates:
- Check for updates on startup
- Show update notification in status bar
- Download and install in background
- Release via GitHub Releases

---

### 🟢 Error Reporting / Telemetry (Opt-in)
**Proposal:** Optional crash reporting to catch issues in production:
- Sentry integration for error tracking
- Opt-in analytics for feature usage
- Clear privacy controls in Settings

---

### 🟢 Build Optimization
**Proposal:**
- Tree-shake unused Lucide icons (currently imports individual icons, which is good)
- Code-split large components (`Settings`, `MCPMarketplace`) via `React.lazy`
- Pre-bundle heavy dependencies in Vite config

---

### 💡 Cross-Platform Packaging
**Proposal:** Set up electron-builder configs for:
- Windows (NSIS installer + portable)
- macOS (DMG + App Store)
- Linux (AppImage + deb + rpm)
- Auto-signing for macOS/Windows

---

## Priority Roadmap Suggestion

### Phase 1: Foundation (High Impact, Low Risk)
1. Centralize utility functions
2. Add unit tests for agent system
3. Add LLM API retry logic
4. Optimize project token counting

### Phase 2: Architecture (High Impact, Medium Risk)
5. Introduce Zustand for state management
6. Decompose `App.tsx` and large components
7. Modularize `main.ts` IPC handlers
8. Switch store to async writes

### Phase 3: Polish (Medium Impact)
9. Unified styling strategy
10. Toast notification system
11. Ripgrep-based file search
12. Git integration panel
13. Diff view for agent changes

### Phase 4: Scale (Future)
14. Plugin/extension system
15. Local model support (Ollama)
16. Agent workflows/macros
17. Auto-update system
18. Collaborative sessions
