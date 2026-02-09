# 🧠 Agentic IDE – Feature & QoL Ideas

> 50 high-impact ideas for **Artemis IDE** — based on a deep audit of the codebase and comparison against Cursor, Windsurf, and Claude Code.

---

## 🔥 High-Impact Must-Haves

### 1. 🧩 Inline Code Completion (Ghost Text)
- Add TAB-completable AI ghost-text suggestions as the user types in Monaco, similar to Copilot / Cursor Tab.
- This is the single highest-impact missing feature. **Cursor and Windsurf both ship this as a core pillar.** Artemis currently has zero in-editor AI assistance — all AI interaction is chat-only.

### 2. 🔀 Git Integration Panel
- Add a dedicated "Source Control" activity view with staged/unstaged file lists, inline diffs, commit, push/pull, branch switching, and merge conflict resolution.
- Currently only `get_git_diff` exists as an agent tool. **Cursor, Windsurf, and VS Code all have rich Git UIs.** A visual Git panel would eliminate constant terminal round-trips.

### 3. 🔍 Find & Replace in Editor
- Implement `Ctrl+F` / `Ctrl+H` find-and-replace inside the Monaco editor with regex support, match highlighting, and replace-all.
- Monaco supports this natively via `editor.getAction('actions.find')` — it just needs to be wired up. This is a basic editor feature every developer expects.

### 4. 🗺️ Go-to-Definition & Symbol Navigation
- Wire up Monaco's `registerDefinitionProvider` and `registerHoverProvider` for TypeScript/JavaScript using the built-in language service, enabling Ctrl+Click go-to-definition and hover docs.
- **Cursor and VS Code have this out of the box.** Without it, Artemis feels like a text editor rather than an IDE.

### 5. 📂 Multi-Root Workspaces
- Allow opening multiple project folders simultaneously in the file explorer, each with its own trust context and terminal scope.
- Currently limited to one project at a time. Developers working on monorepos or frontend+backend splits are blocked.

### 6. ↩️ Undo Agent Changes (Diff Preview + Revert)
- Before applying agent file edits, show a side-by-side diff preview in the editor. Add a one-click "Revert this change" button on each tool-result card.
- Checkpoints exist but are coarse-grained (whole session). **Windsurf has per-edit accept/reject.** Fine-grained undo dramatically increases user trust.

### 7. 🖥️ Split Editor Panes
- Allow horizontal and vertical editor splits so users can view two files side-by-side.
- `react-resizable-panels` is already a dependency — extend `PanelLayout` to support split editor groups. This is table-stakes for any serious IDE.

### 8. 🧵 Conversation Branching (Fork a Chat)
- Let users fork a conversation at any message to explore an alternative approach without losing the original thread.
- **No competitor does this well.** This would be a genuine differentiator — AI conversations are inherently branching, but every IDE forces a linear history.

### 9. 📌 @-Mention Files in Chat Input
- Type `@filename` in the chat input to auto-complete and attach file contents as context, with a dropdown picker showing project files.
- `fileContext` already exists in `sendMessage` but there's no discoverable UI for it. **Cursor's `@` mention system is a core UX pattern** that Artemis should match.

### 10. 🧪 Integrated Test Runner Panel
- Add an activity view that discovers and runs tests (Jest, Vitest, Pytest, etc.), showing pass/fail status per test with re-run and debug links.
- Currently the agent can `execute_command jest` but there's no visual test runner. **Cursor and VS Code both have Test Explorer UIs.**

### 11. 🌲 Breadcrumb Navigation Bar
- Add a breadcrumb trail above the editor showing `project > folder > file > symbol`, each segment clickable for quick navigation.
- Monaco supports `DocumentSymbolProvider` for symbol breadcrumbs. This is a standard VS Code feature that aids orientation in large files.

### 12. ⚡ Editor Minimap
- Enable Monaco's built-in minimap (currently likely disabled) for large-file navigation, matching VS Code's default behavior.
- A single Monaco option toggle — minimal effort, real usability gain.

### 13. 💾 Auto-Save with Configurable Delay
- Add an auto-save setting (off / onFocusChange / afterDelay) so users don't lose work. Show a subtle save indicator in the tab.
- Currently files only save on explicit `Ctrl+S`. Agent edits go through `writeFile` but manual edits can be lost.

### 14. 🔄 Hot Reload Agent Changes into Editor
- When the agent writes or edits a file that is currently open in an editor tab, automatically reload the tab content without losing cursor position or scroll state.
- Currently `fileRefreshTrigger` only fires after streaming ends. Open tabs can show stale content during long agent runs.

### 15. 🧱 Extension / Plugin System
- Define a plugin API (similar to VS Code extensions) allowing community-contributed language support, themes, tools, and UI panels.
- This is a long-term architectural investment. **Cursor is built on VS Code's extension ecosystem.** Even a minimal plugin system (custom tools + themes) would unlock community growth.

---

## ⚡ Productivity & QoL Boosters

### 16. 🗂️ Quick File Switcher (`Ctrl+P`)
- Add a fuzzy file finder overlay (like VS Code's `Ctrl+P`) that searches all project files by name with instant preview.
- The Command Palette (`Ctrl+K`) only has ~6 static actions. A fast file picker is the #1 navigation tool for keyboard-driven developers.

### 17. 📋 Drag & Drop Files into Chat
- Allow dragging files from the File Explorer (or OS file manager) directly into the chat input to attach them as context.
- Images can already be attached, but there's no drag-and-drop for code files. This reduces the friction of providing context to the agent.

### 18. 💬 Chat History Search
- Add a search input in the sidebar's session list to find past conversations by keyword, across all sessions.
- With many sessions accumulating, finding a previous conversation becomes painful. **Cursor has conversation search.**

### 19. 📤 Export Conversation as Markdown
- Add a "Copy as Markdown" or "Export" button on the chat panel that generates a clean markdown document of the entire conversation.
- Useful for documentation, sharing with teammates, or archiving decisions. No competitor does this cleanly.

### 20. 🎯 Sticky Scroll in Editor
- Enable Monaco's sticky scroll feature that pins parent scopes (function/class headers) at the top of the editor as you scroll.
- A single Monaco option — dramatically improves orientation in deeply nested code.

### 21. 🔢 Per-Model Token Budget Warnings
- Show a visual warning when the conversation is approaching the model's context window limit (e.g., 80% of `contextWindow`), with a suggestion to start a new session.
- `contextWindow` is already stored per model but never used for user-facing warnings. Context overflow causes silent quality degradation.

### 22. ⏱️ Agent Run Timeline
- Replace the current ThinkingBlock with a visual horizontal timeline showing each agent step (think → tool → result → think → ...) with durations.
- The current collapsible list works but doesn't convey the agent's workflow intuitively. A timeline gives a clearer mental model.

### 23. 🏷️ Auto-Generate Session Titles with AI
- After the first exchange, ask the model for a 3-5 word title instead of truncating the user's message to 50 chars.
- Current titles are `text.slice(0, 50)` which produces ugly, unhelpful labels like `"Can you help me fix the bug where the user..."`.

### 24. 🔒 Per-Session Approved Paths Cache
- When the user approves a path outside the project (via `path_approval_required`), remember it for the rest of the session so they don't get re-prompted.
- Currently each out-of-project access triggers a new approval. This becomes annoying in monorepo-adjacent workflows.

### 25. 📊 Cost Dashboard
- Add a dedicated view (or Settings sub-panel) showing cumulative token usage and estimated cost broken down by model, session, and date.
- `sessionTokenUsage` and `totalTokenUsage` exist but are only shown in the status bar as a single number. Power users want a spending breakdown.

### 26. 🧹 One-Click "Clean Session" 
- Add a button that clears the conversation history but keeps the session metadata, useful for resetting context without losing the session's identity in the sidebar.
- `clearMessages` exists but is buried. Making it prominent reduces context pollution from failed experiments.

### 27. 🖼️ Image Paste from Clipboard
- Support `Ctrl+V` to paste screenshots or images directly from the clipboard into the chat input.
- Image attachments already work via file picker, but clipboard paste is the fastest path for sharing screenshots and error dialogs.

### 28. 📁 Nested File Search in Explorer
- Add a filter/search input at the top of the File Explorer that filters the tree in real-time as you type.
- Currently the file tree shows everything. In large projects, finding a file requires scrolling or switching to the Search panel.

### 29. ⌨️ Vim / Emacs Keybinding Modes
- Add a setting to enable Vim or Emacs keybindings in the Monaco editor via `monaco.editor.EditorOptions.keyBindings`.
- A highly requested feature by power users. Monaco supports this via the `monaco-vim` and `monaco-emacs` packages.

### 30. 🔔 Smart Notification Grouping
- When the agent completes multiple tool operations rapidly, batch notifications into a single grouped notification instead of firing one per event.
- Currently `playSound('action-required')` fires per approval. Multiple rapid approvals create notification spam.

---

## 🤖 Agentic & AI-Native Features

### 31. 🧠 Agent Memory (Persistent Context)
- Allow the agent to persist key facts, decisions, and user preferences across sessions in a `.artemis/memory.json` file in the project root.
- **Claude Code has "memory" via CLAUDE.md. Windsurf has "memories."** Artemis has `AGENTS.md` (read-only) but no way for the agent to *write* persistent learnings.

### 32. 🔄 Parallel Tool Execution
- When the agent issues multiple independent tool calls in one iteration (e.g., reading 3 files), execute them in parallel instead of sequentially.
- `ToolExecutor.executeAll` uses a `for` loop. Switching to `Promise.all` for independent read-only tools would cut latency significantly.

### 33. 🏗️ Multi-File Apply Preview
- When the agent generates changes to multiple files, show a "Changes" panel (like a PR diff view) where the user can review and accept/reject each file individually before any writes happen.
- **Cursor has "Apply All" with per-file review. Windsurf has a similar flow.** Currently Artemis applies changes immediately with no batch review.

### 34. 🤖 Agent Personas / System Prompt Presets
- Let users create and switch between custom agent personas (e.g., "Senior Reviewer", "Junior Pair Programmer", "Documentation Writer") each with a different system prompt prefix.
- Currently the system prompt is hardcoded per mode. Custom personas would let users tailor the agent's behavior to different tasks.

### 35. 📐 Rules File Support (`.artemisrules`)
- Support a `.artemisrules` file in the project root with structured YAML/TOML rules that the agent must follow (coding style, forbidden patterns, preferred libraries, etc.).
- `AGENTS.md` exists but is freeform markdown. A structured rules file enables deterministic enforcement. **Cursor has `.cursorrules`, Windsurf has `.windsurfrules`.**

### 36. 🔁 Agent Retry with Different Strategy
- When the agent errors or produces a bad result, add a "Retry with different approach" button that re-sends the same prompt with an added instruction to avoid the previous failure.
- Currently the user must manually rephrase. An automated retry-with-feedback loop improves recovery from flaky model outputs.

### 37. 🧰 Custom Tool Authoring (User-Defined Tools)
- Allow users to define custom tools via a `.artemis/tools/` directory containing JSON schema + shell script pairs that the agent can invoke.
- The `ToolRegistry` already supports `register()`. Exposing this to users would unlock project-specific automation (deploy scripts, database migrations, etc.).

### 38. 📡 Streaming Tool Output
- For long-running `execute_command` calls, stream stdout/stderr to the chat UI in real-time instead of waiting for the process to complete.
- Currently `toolExecuteCommand` buffers all output and returns it at the end. Streaming gives the user (and agent) live feedback.

### 39. 🔍 Context-Aware File Selection
- Before sending a message, automatically detect which files are relevant based on the user's query (via embeddings or keyword matching) and include them as context.
- Currently the agent must manually `read_file` each file. Pre-loading relevant context reduces tool-call round-trips and improves first-response quality.

### 40. 🧩 MCP Tool Approval Tiers
- Add per-MCP-server trust levels: "always allow", "ask once per session", "ask every time" — instead of the current binary installed/not-installed model.
- MCP servers can execute arbitrary code. The current model grants full access once installed. Tiered trust mirrors the workspace trust model already in place.

---

## 🧪 Experimental / Differentiators

### 41. 🌊 "Cascade Mode" — Multi-Agent Orchestration
- Allow spawning multiple agent instances that collaborate: one plans, one codes, one reviews — coordinated via a supervisor agent.
- **No competitor ships multi-agent orchestration in the IDE.** This would be a flagship differentiator. The `AgentLoop` is already isolated enough to run multiple instances.

### 42. 🔮 Predictive Terminal Commands
- After the agent finishes code changes, suggest likely next terminal commands (e.g., "Run `npm test`?", "Start dev server?") as clickable chips above the terminal.
- This bridges the gap between agent edits and the user's next action. No competitor does this.

### 43. 📸 Visual Regression Testing via Screenshots
- Add a tool that captures a screenshot of a running localhost app (via Electron's `webContents.capturePage` or Puppeteer) and feeds it to a vision model for visual QA.
- Artemis already supports image attachments in chat. Automating screenshot capture would enable visual debugging workflows that no text-based IDE supports.

### 44. 🎙️ Voice Input for Chat
- Add a microphone button in the chat input that uses the Web Speech API (or Whisper) to transcribe voice into text.
- Hands-free coding assistance during debugging sessions. The Web Speech API is free and works in Electron's Chromium renderer.

### 45. 🧬 Diff-Aware Agent Context
- When the user has uncommitted git changes, automatically include the diff in the agent's context so it understands what was recently changed.
- `get_git_diff` exists as a tool but the agent must decide to call it. Auto-including recent diffs would make the agent significantly more context-aware.

### 46. 📊 Code Complexity Heatmap
- Add an overlay in the file explorer or editor gutter that shows per-file or per-function complexity scores (cyclomatic complexity, line count), highlighting hotspots.
- This helps developers and the agent prioritize refactoring targets. No IDE competitor visualizes complexity directly.

### 47. 🔗 Deep Link Sharing (`artemis://open?file=...`)
- Register a custom protocol handler (`artemis://`) that opens specific files, lines, or even chat sessions — enabling shareable links in docs, PRs, and Slack.
- Electron supports `protocol.registerSchemesAsPrivileged`. This would make Artemis a first-class citizen in team workflows.

### 48. ⏪ Session Replay (Time-Travel Debugging)
- Record all agent events during a session and allow replaying them step-by-step, like a DVR for agent behavior.
- Agent events are already structured (`AgentEvent` with seq numbers and timestamps). Persisting and replaying them would enable powerful debugging of agent failures and a unique demo/teaching tool.

### 49. 🧮 Inline Token Counter per Message
- Show a small token count badge on each chat message (user and assistant) so the user can see which messages consume the most context.
- Token estimation already exists (`estimateTokens` in `tokenCounter.ts`). Surfacing it per-message helps users understand and optimize their context budget.

### 50. 🌐 Local Model Auto-Discovery
- Automatically detect locally running Ollama, LM Studio, or llama.cpp instances and offer them as model options without manual URL configuration.
- Ollama support exists but requires manual base URL setup. Auto-discovery (ping `localhost:11434/api/tags`) would make local model usage frictionless — a major selling point for the "no cloud lock-in" positioning.

---

*Generated from a deep analysis of the Artemis IDE codebase — comparing against Cursor, Windsurf, Claude Code, and VS Code.*
