# Artemis IDE — Feature Ideas & Improvements

> 75 ideas for new features and improvements to existing functionality.
> Inspired by what Windsurf, Cursor, Claude Code, VS Code, and other modern AI IDEs offer.

---

## AI & Agent

1. **Inline AI Edit (Ctrl+I)** — Select code in the editor and press a shortcut to get an inline AI edit suggestion with a diff preview, like Cursor's inline edit.
2. **Multi-file Agent Edits with Diff Preview** — Show a unified diff view of all files the agent wants to change before applying, with accept/reject per-file and per-hunk.
3. **Agent Undo / Rollback per Step** — Allow undoing individual agent actions (file writes, terminal commands) instead of rolling back the entire checkpoint.
4. **Streaming Diff View** — While the agent is generating code, show a live side-by-side diff of the original vs. proposed changes in real time.
5. **Context Window Usage Indicator** — Show how much of the model's context window is consumed by the current conversation and attached files.
6. **Smart Context Auto-attach** — Automatically detect and attach relevant files to the AI context based on imports, references, and the user's question.
7. **@ Mention Files in Chat** — Type `@filename` in the chat to attach a file to the context (partially implemented, but improve fuzzy matching and preview).
8. **@ Mention Symbols** — Type `@functionName` or `@ClassName` to attach specific symbols, not entire files, to reduce context usage.
9. **@ Mention URLs** — Type `@https://...` in chat to fetch and include web page content as context.
10. **@ Mention Terminal Output** — Type `@terminal` to attach the last N lines of terminal output as context for debugging.
11. **Agent Memory / Long-term Context** — Persistent memory across sessions where the agent remembers project conventions, user preferences, and past decisions.
12. **Custom System Prompts / Rules File** — Support a `.artemis/rules` or `artemis.md` file in the project root that sets custom system instructions for the AI agent.
13. **Plan Mode** — Before executing, the agent writes a step-by-step plan that the user can review, edit, and approve before any code changes are made.
14. **Ask Mode (Read-only)** — A mode where the agent can only read and answer questions, never write files or run commands. Useful for exploration.
15. **Multi-model Conversations** — Allow switching models mid-conversation or using different models for different tasks (e.g., fast model for small edits, large model for architecture).
16. **Agent Tool Approval Granularity** — Configurable per-tool approval: auto-approve file reads but require approval for file writes, terminal commands, etc.
17. **Image Understanding in Chat** — Support pasting screenshots or UI mockups and asking the AI to implement what it sees (partially done, improve with vision model routing).
18. **Voice Input for Chat** — Speech-to-text input for hands-free coding assistance.
19. **AI-powered Commit Messages** — Auto-generate commit messages from staged diffs using the AI model.
20. **AI Code Review** — Right-click a file or selection and get an AI-powered code review with suggestions.

---

## Editor

21. **Split Editor / Side-by-side Panes** — Open two or more files side by side in split panes.
22. **Minimap** — A code minimap on the right side of the editor for quick navigation (Monaco supports this, just needs enabling/toggle).
23. **Breadcrumb Navigation** — Show file path breadcrumbs above the editor with clickable segments for quick navigation.
24. **Go to Definition / Peek Definition** — Ctrl+Click or F12 to jump to symbol definitions; Shift+F12 for peek view.
25. **Find and Replace Across Files** — Project-wide search and replace with preview, regex support, and include/exclude glob filters.
26. **Multi-cursor Editing** — Improved multi-cursor support with Ctrl+D to select next occurrence (Monaco built-in, expose UI for it).
27. **Code Folding Controls** — Visible fold/unfold gutters and keyboard shortcuts for folding regions, functions, and imports.
28. **Bracket Pair Colorization** — Color-matched bracket pairs for easier code reading.
29. **Indent Guides / Scope Lines** — Visual indent guides that highlight the current scope.
30. **Editor Tabs — Drag to Split** — Drag a tab to the side to create a split pane automatically.
31. **Tab Groups / Workspaces** — Save and restore sets of open tabs as named workspaces.
32. **Unsaved Changes Indicator on Close** — When closing the app with unsaved files, show a dialog listing all dirty files with save/discard options.
33. **File Auto-save** — Optional auto-save on focus loss or after a configurable delay.
34. **Zen Mode / Distraction-free Mode** — Hide all panels and chrome, showing only the editor in fullscreen.
35. **Word Wrap Toggle** — Quick toggle for word wrap in the editor via command palette or keybind.

---

## Terminal

36. **Multiple Terminal Tabs with Rename** — Allow renaming terminal tabs (partially done, but add inline rename).
37. **Terminal Split Panes** — Split a terminal horizontally or vertically to run multiple processes side by side.
38. **Terminal Command History / Search** — Searchable history of previously run commands across sessions.
39. **Clickable File Paths in Terminal** — Detect file paths and line numbers in terminal output and make them clickable to open in the editor.
40. **Terminal Profiles** — Predefined terminal profiles (PowerShell, CMD, Git Bash, WSL) with quick switching.
41. **Run Task / Script Runner** — Detect `package.json` scripts, `Makefile` targets, etc. and offer a quick-run UI panel.

---

## File Explorer

42. **Drag and Drop Files** — Support drag-and-drop to move files/folders within the explorer tree.
43. **File Icons by Type** — Show language/filetype-specific icons (e.g., TypeScript, Python, JSON, Markdown icons) in the explorer and tabs.
44. **Compact Folder View** — Collapse single-child folder chains (e.g., `src/utils/helpers` shown as one row).
45. **File Filter / Search in Explorer** — Quick filter input at the top of the explorer to narrow the visible tree.
46. **Copy File Path** — Right-click context menu option to copy absolute or relative file path.
47. **Reveal in System Explorer** — Right-click to open the file's folder in Windows Explorer / Finder.
48. **File Size and Last Modified** — Show file metadata on hover or in a details column.

---

## Source Control / Git

49. **Inline Git Blame** — Show git blame annotations inline in the editor gutter.
50. **Git Diff View** — Side-by-side or inline diff viewer for unstaged/staged changes.
51. **Git Branch Management** — Create, switch, merge, and delete branches from the UI.
52. **Git Log / History Graph** — Visual commit history graph with branch topology.
53. **Git Stash Support** — Stash and pop changes from the source control panel.
54. **Pull Request Integration** — View and create pull requests for GitHub/GitLab from within the IDE.
55. **Conflict Resolution UI** — Visual merge conflict resolution with accept theirs/mine/both buttons.

---

## Code Intelligence & Completion

56. **Multi-line Inline Completions** — Show multi-line ghost text completions like Copilot/Cursor Tab, with Tab to accept and word-by-word partial accept.
57. **Autocomplete Popup** — Traditional IDE autocomplete popup with symbol suggestions, not just AI completions.
58. **Signature Help / Parameter Hints** — Show function parameter info as you type.
59. **Hover Documentation** — Show type info and documentation on hover for symbols.
60. **Error Squiggles with Quick Fix** — Red/yellow underlines for errors/warnings with lightbulb quick-fix suggestions.
61. **Import Auto-organization** — Automatically sort and remove unused imports on save.
62. **Type-ahead / Path Completion in Imports** — Auto-suggest file paths when typing import statements.

---

## UI & UX

63. **Resizable Panels** — Draggable dividers between sidebar, editor, and chat panel for custom sizing.
64. **Floating / Detachable Chat Window** — Pop out the chat panel into a separate floating window.
65. **Notification Toasts** — In-app toast notifications for events like "File saved", "Agent finished", "Build failed".
66. **Status Bar Customization** — Click status bar items for quick actions (e.g., click model name to switch, click branch name to switch branch).
67. **Keyboard Shortcut Cheat Sheet** — Overlay showing all available shortcuts, accessible via `Ctrl+Shift+?`.
68. **Onboarding Tour** — Interactive walkthrough for first-time users highlighting key features.
69. **Custom Font / Font Size Settings** — Allow changing editor font family and size from settings.
70. **Panel Zoom / Focus Mode** — Double-click a panel header to maximize it temporarily.

---

## Project & Workspace

71. **Multi-root Workspaces** — Open multiple project folders in a single window with a combined explorer.
72. **Project-level Settings** — `.artemis/settings.json` per-project for editor config, linter rules, and AI preferences.
73. **Recent Files List** — Quick access to recently opened files across sessions via `Ctrl+E` or command palette.
74. **Workspace Search Scopes** — Save search scope presets (e.g., "only src/", "exclude tests/").
75. **Task / TODO Panel** — Scan the project for TODO/FIXME/HACK comments and list them in a dedicated panel with click-to-navigate.

---

*Last updated: February 2026*
